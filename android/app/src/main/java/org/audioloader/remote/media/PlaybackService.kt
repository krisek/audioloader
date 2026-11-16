package org.audioloader.remote.media

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import androidx.annotation.OptIn
import androidx.core.content.ContextCompat
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import org.audioloader.remote.RemoteController
import org.audioloader.remote.R
import org.audioloader.remote.net.PlaybackState
import org.audioloader.remote.ui.MainActivity

/**
 * Hosts the media session (notification, lock screen, headset buttons) and the Bluetooth rules.
 * It keeps the controller's poll loop alive while it runs.
 */
@OptIn(markerClass = [UnstableApi::class])
class PlaybackService : MediaSessionService() {
    private lateinit var controller: RemoteController
    private lateinit var player: MirrorPlayer
    private var session: MediaSession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var coverJob: Job? = null

    private val bluetooth = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val device: BluetoothDevice? = if (Build.VERSION.SDK_INT >= 33) {
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
                @Suppress("DEPRECATION") intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
            when (intent.action) {
                BluetoothDevice.ACTION_ACL_DISCONNECTED -> onBluetoothDisconnected(device)
                BluetoothDevice.ACTION_ACL_CONNECTED -> onBluetoothConnected(device)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        controller = RemoteController.from(this)
        controller.acquire()
        player = MirrorPlayer(controller)
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val mediaSession = MediaSession.Builder(this, player).setId("audioloader-remote").setSessionActivity(open).build()
        session = mediaSession
        setMediaNotificationProvider(DefaultMediaNotificationProvider.Builder(this).build().also { it.setSmallIcon(R.drawable.ic_notification) })
        // Without this the notification only exists while some controller is bound to the service.
        addSession(mediaSession)

        scope.launch {
            controller.state.collectLatest { state ->
                val client = controller.currentClient
                val dir = state.coverDirectory
                val cached = if (client != null && dir != null) CoverLoader.cached(client, dir) else null
                player.update(state, cached?.let(CoverLoader::jpeg))
                if (client != null && dir != null && cached == null) loadCover(state, dir)
            }
        }
        ContextCompat.registerReceiver(
            this,
            bluetooth,
            IntentFilter().apply {
                addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
                addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
            },
            ContextCompat.RECEIVER_EXPORTED, // system broadcasts
        )
    }

    private fun loadCover(state: PlaybackState, dir: String) {
        coverJob?.cancel()
        coverJob = scope.launch {
            val client = controller.currentClient ?: return@launch
            val bmp = CoverLoader.load(client, dir) ?: return@launch
            // Only apply if the track is still the same one.
            if (controller.state.value.coverDirectory == dir) player.update(controller.state.value, CoverLoader.jpeg(bmp))
        }
    }

    private fun hasBluetoothPermission(): Boolean =
        Build.VERSION.SDK_INT < 31 ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

    /** The rule of the profile being controlled; other profiles' devices never react. */
    private fun activeRule() = controller.store.activeProfile()?.bluetooth?.takeIf { it.enabled }

    private fun onBluetoothDisconnected(device: BluetoothDevice?) {
        val rule = activeRule() ?: return
        val address = device?.address ?: return
        if (!rule.pauseOnDisconnect || address !in rule.devices || !hasBluetoothPermission()) return
        if (!controller.state.value.playing) return
        controller.store.pausedByDevice = address
        controller.optimisticState("pause")
        controller.command("pause")
    }

    private fun onBluetoothConnected(device: BluetoothDevice?) {
        val rule = activeRule() ?: return
        val pausedBy = controller.store.pausedByDevice ?: return
        if (!rule.resumeOnReconnect || device?.address != pausedBy) return
        controller.store.pausedByDevice = null
        scope.launch {
            delay(1_500) // let the audio route settle before resuming
            if (controller.state.value.state == "pause") controller.command("play")
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    /**
     * Stay a foreground service while paused or stopped too: otherwise the system drops the notification (and may
     * kill the service) soon after pausing, and it is swipeable. This is a remote, so the controls should stay.
     */
    override fun onUpdateNotification(session: MediaSession, startInForegroundRequired: Boolean) {
        super.onUpdateNotification(session, true)
    }

    /** The remote keeps running after the app is swiped away; stop it by removing all profiles. */
    override fun onTaskRemoved(rootIntent: Intent?) {
        if (controller.store.profiles.value.isEmpty()) stopSelf()
    }

    override fun onDestroy() {
        unregisterReceiver(bluetooth)
        scope.cancel()
        session?.release()
        session = null
        player.release()
        controller.release()
        super.onDestroy()
    }
}
