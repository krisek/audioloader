package org.audioloader.remote.net

import org.json.JSONObject

/** Monotonic milliseconds; the time base for [PlaybackState.receivedAtMs] everywhere. */
fun monotonicMs(): Long = System.nanoTime() / 1_000_000

data class Output(val id: String, val name: String, val enabled: Boolean)

data class SnapClient(val id: String, val name: String, val connected: Boolean, val muted: Boolean)

/** Playback state from /currentsong or /poll_currentsong (see MPD_API_MAPPING.md section 2.3). */
data class PlaybackState(
    val state: String = "stop",
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    val file: String = "",
    val songId: String = "",
    val elapsedSec: Double = 0.0,
    val durationSec: Double = 0.0,
    val queueLength: Int = 0,
    /** MPD volume 0-100; null when MPD has no mixer (status carries no volume, or -1). */
    val volume: Int? = null,
    val outputs: List<Output> = emptyList(),
    val snapcast: List<SnapClient> = emptyList(),
    val receivedAtMs: Long = 0L,
) {
    val playing: Boolean get() = state == "play"
    val active: Boolean get() = state == "play" || state == "pause"

    /** Library directory of the current file, for /cover. Null for streams and when nothing plays. */
    val coverDirectory: String?
        get() = if (!active || file.isBlank() || "://" in file) null else file.substringBeforeLast('/', "").ifBlank { null }

    /** Elapsed seconds extrapolated to [nowMs] while playing. */
    fun elapsedAt(nowMs: Long): Double {
        val extra = if (playing) (nowMs - receivedAtMs) / 1000.0 else 0.0
        val total = elapsedSec + extra
        return if (durationSec > 0) total.coerceIn(0.0, durationSec) else total.coerceAtLeast(0.0)
    }

    companion object {
        fun parse(j: JSONObject, receivedAtMs: Long): PlaybackState {
            val file = j.optString("file")
            val name = j.optString("Name") // radio station name
            val title = j.optString("Title").ifBlank { name }.ifBlank { file.substringAfterLast('/') }
            val outputs = j.optJSONArray("outputs")?.let { a ->
                List(a.length()) { i ->
                    val o = a.getJSONObject(i)
                    Output(o.optString("outputid"), o.optString("outputname"), o.optString("outputenabled") == "1")
                }
            } ?: emptyList()
            val snap = j.optJSONArray("snapcast_clients")?.let { a ->
                List(a.length()) { i ->
                    val o = a.getJSONObject(i)
                    SnapClient(o.optString("id"), o.optString("name"), o.optBoolean("connected"), o.optBoolean("muted"))
                }
            } ?: emptyList()
            return PlaybackState(
                state = j.optString("state", "stop").ifBlank { "stop" },
                title = title,
                artist = j.optString("Artist").ifBlank { name },
                album = j.optString("Album"),
                file = file,
                songId = j.optString("songid").ifBlank { j.optString("Id") },
                elapsedSec = j.optString("elapsed").toDoubleOrNull() ?: 0.0,
                durationSec = j.optString("duration").toDoubleOrNull() ?: 0.0,
                queueLength = j.optString("playlistlength").toIntOrNull() ?: 0,
                volume = j.optString("volume").toIntOrNull()?.takeIf { it in 0..100 },
                outputs = outputs,
                snapcast = snap,
                receivedAtMs = receivedAtMs,
            )
        }
    }
}

data class QueueEntry(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    val file: String,
    val durationSec: Double,
)

data class QueueInfo(val entries: List<QueueEntry>, val currentId: String) {
    companion object {
        fun parse(j: JSONObject): QueueInfo {
            val a = j.optJSONArray("queue")
            val entries = if (a == null) emptyList() else List(a.length()) { i ->
                val o = a.getJSONObject(i)
                val file = o.optString("file")
                QueueEntry(
                    id = o.optString("id"),
                    title = o.optString("title").ifBlank { file.substringAfterLast('/') },
                    artist = o.optString("artist"),
                    album = o.optString("album"),
                    file = file,
                    durationSec = o.optDouble("duration", 0.0),
                )
            }
            return QueueInfo(entries, j.optString("current_id"))
        }
    }
}
