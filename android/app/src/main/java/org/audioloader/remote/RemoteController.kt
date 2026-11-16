package org.audioloader.remote

import android.app.Application
import android.content.Context
import android.os.Build
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.audioloader.remote.data.ProfileStore
import org.audioloader.remote.net.AudioloaderClient
import org.audioloader.remote.net.AuthException
import org.audioloader.remote.net.PlaybackState
import org.audioloader.remote.net.QueueInfo
import org.audioloader.remote.net.monotonicMs

enum class Connection { NO_PROFILE, CONNECTING, CONNECTED, AUTH_FAILED, OFFLINE }

/**
 * Process-wide owner of the active profile's connection: long-poll loop, playback state and commands.
 * The UI and the media session both observe [state]; nothing else talks to the server.
 */
class RemoteController(private val app: Application) {
    val store = ProfileStore(app)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _state = MutableStateFlow(PlaybackState())
    val state: StateFlow<PlaybackState> = _state.asStateFlow()

    private val _connection = MutableStateFlow(Connection.NO_PROFILE)
    val connection: StateFlow<Connection> = _connection.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var client: AudioloaderClient? = null
    private var pollJob: Job? = null
    private var wanted = 0 // number of active observers (UI, service); the loop runs while > 0

    val currentClient: AudioloaderClient? get() = client

    private val userAgent: String by lazy {
        val version = runCatching { app.packageManager.getPackageInfo(app.packageName, 0).versionName }.getOrNull()
        "audioloader-remote/$version-${store.installId} (Android ${Build.VERSION.RELEASE})"
    }

    init {
        // Both flows fire on any profile edit or switch; restart() is a no-op when nothing relevant changed.
        scope.launch { store.activeId.collect { restart() } }
        scope.launch { store.profiles.collect { restart() } }
    }

    /** Call when something starts needing live state; pair with [release]. */
    fun acquire() {
        wanted++
        if (wanted == 1) restart()
    }

    fun release() {
        wanted = (wanted - 1).coerceAtLeast(0)
        if (wanted == 0) stopPolling()
    }

    private fun stopPolling() {
        pollJob?.cancel()
        pollJob = null
    }

    private fun restart() {
        val profile = store.activeProfile()
        if (profile == null || profile.validate() != null) {
            stopPolling()
            client = null
            _state.value = PlaybackState()
            _connection.value = Connection.NO_PROFILE
            return
        }
        val changed = client?.profile != profile
        if (!changed && pollJob?.isActive == true) return
        if (!changed && wanted == 0) return
        stopPolling()
        if (changed) {
            client = AudioloaderClient(profile, userAgent)
            _state.value = PlaybackState()
        }
        if (wanted > 0) {
            val c = client!!
            pollJob = scope.launch {
                val refresher = launch { refreshLoop(c) }
                try {
                    pollLoop(c)
                } finally {
                    refresher.cancel()
                }
            }
        }
    }

    private suspend fun pollLoop(c: AudioloaderClient) {
        _connection.value = Connection.CONNECTING
        var failures = 0
        var snapshotNeeded = true
        while (true) {
            val started = monotonicMs()
            try {
                // Snapshot first: it answers at once, so a fresh/resumed UI never waits for the long poll.
                val next = if (snapshotNeeded) c.currentSong() else c.pollCurrentSong()
                snapshotNeeded = false
                failures = 0
                _state.value = next
                _connection.value = Connection.CONNECTED
                _error.value = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: AuthException) {
                _connection.value = Connection.AUTH_FAILED
                _error.value = e.message
                return // retrying cannot help; the user must fix the profile
            } catch (e: Exception) {
                failures++
                _connection.value = Connection.OFFLINE
                _error.value = e.message ?: e.javaClass.simpleName
                snapshotNeeded = true
                delay(backoffMs(failures))
                continue
            }
            // A duplicate poll is answered immediately by the server; never spin faster than this.
            val spent = monotonicMs() - started
            if (spent < MIN_POLL_SPACING_MS) delay(MIN_POLL_SPACING_MS - spent)
        }
    }

    /**
     * Safety net next to the long poll. The server shares one MPD idle connection between all pollers, so while
     * another client (e.g. the web UI) is polling too, this app can miss an event until the 60 s poll timeout.
     * A cheap snapshot at the predicted end of the track (and at least every [MAX_REFRESH_MS]) hides that.
     */
    private suspend fun refreshLoop(c: AudioloaderClient) {
        while (true) {
            val s = _state.value
            val untilEnd = if (s.playing && s.durationSec > 0) {
                ((s.durationSec - s.elapsedAt(monotonicMs())) * 1000).toLong() + END_OF_TRACK_SLACK_MS
            } else {
                MAX_REFRESH_MS
            }
            delay(untilEnd.coerceIn(MIN_REFRESH_MS, MAX_REFRESH_MS))
            if (_connection.value != Connection.CONNECTED) continue
            try {
                _state.value = c.currentSong()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The poll loop owns error reporting and reconnecting.
            }
        }
    }

    fun command(name: String) = launchCommand { it.command(name) }

    /**
     * Sets the MPD volume. While a slider is dragged ([final] false) only the volume is sent; the last call
     * also takes a snapshot, so the state ends up as the server reports it.
     */
    fun setVolume(value: Int, final: Boolean) {
        _state.value = _state.value.copy(volume = value.coerceIn(0, 100))
        if (final) launchCommand { it.setVolume(value) } else launchCommand(refresh = false) { it.setVolume(value) }
    }

    fun toggleOutput(id: String) = launchCommand { it.toggleOutput(id) }

    fun toggleSnapcast(id: String, muted: Boolean) = launchCommand { it.toggleSnapcast(id, muted) }

    fun queuePlay(id: String) = launchCommand { it.queuePlay(id) }

    fun queueRemove(id: String) = launchCommand { it.queueRemove(id) }

    fun queueClear() = launchCommand { it.queueClear() }

    suspend fun fetchQueue(): QueueInfo? = try {
        client?.queue()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        _error.value = e.message ?: e.javaClass.simpleName
        null
    }

    /** Optimistic local change so the notification reacts before the server answers. */
    fun optimisticState(state: String) {
        val s = _state.value
        val now = monotonicMs()
        _state.value = s.copy(state = state, elapsedSec = s.elapsedAt(now), receivedAtMs = now)
    }

    /** Runs a command, then takes a snapshot at once; the poll loop would catch up, but later. */
    private fun launchCommand(refresh: Boolean = true, block: suspend (AudioloaderClient) -> Unit) {
        val c = client ?: return
        scope.launch {
            try {
                block(c)
                if (refresh) _state.value = c.currentSong()
                _error.value = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: AuthException) {
                _connection.value = Connection.AUTH_FAILED
                _error.value = e.message
            } catch (e: Exception) {
                _error.value = e.message ?: e.javaClass.simpleName
            }
        }
    }

    companion object {
        const val MIN_POLL_SPACING_MS = 1_000L
        const val MIN_REFRESH_MS = 2_000L
        const val MAX_REFRESH_MS = 15_000L
        const val END_OF_TRACK_SLACK_MS = 700L

        /** 2 s, 4 s, ... capped at 30 s. */
        fun backoffMs(failures: Int): Long = (1_000L shl failures.coerceIn(1, 5)).coerceAtMost(30_000L)

        fun from(context: Context): RemoteController = (context.applicationContext as RemoteApp).controller
    }
}

