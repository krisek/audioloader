package org.audioloader.remote.media

import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.audioloader.remote.RemoteController
import org.audioloader.remote.net.PlaybackState

/**
 * A [Player] that plays nothing: it mirrors the MPD state and turns transport commands into HTTP calls.
 * This is what lets the system media notification, lock screen and headset buttons drive a remote MPD.
 */
@OptIn(markerClass = [UnstableApi::class])
class MirrorPlayer(private val controller: RemoteController) : SimpleBasePlayer(Looper.getMainLooper()) {
    private var snapshot = PlaybackState()
    private var artwork: ByteArray? = null

    fun update(state: PlaybackState, artworkJpeg: ByteArray?) {
        snapshot = state
        artwork = artworkJpeg
        invalidateState()
    }

    override fun getState(): State {
        val s = snapshot
        val commands = Player.Commands.Builder()
            .addAll(
                Player.COMMAND_PLAY_PAUSE,
                Player.COMMAND_PREPARE,
                Player.COMMAND_STOP,
                Player.COMMAND_SEEK_TO_NEXT,
                Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                Player.COMMAND_SEEK_TO_PREVIOUS,
                Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
                Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
                Player.COMMAND_GET_METADATA,
                Player.COMMAND_GET_TIMELINE,
            )
            .build()
        val builder = State.Builder().setAvailableCommands(commands)
        if (!s.active) {
            // An idle player gets no notification; show a placeholder so the controls stay available.
            val idle = MediaMetadata.Builder().setTitle("Not playing").build()
            val item = MediaItemData.Builder("idle")
                .setMediaItem(MediaItem.Builder().setMediaId("idle").setMediaMetadata(idle).build())
                .setMediaMetadata(idle)
                .setIsSeekable(false)
                .build()
            return builder
                .setPlaylist(ImmutableList.of(item))
                .setCurrentMediaItemIndex(0)
                .setPlaybackState(Player.STATE_READY)
                .setPlayWhenReady(false, Player.PLAY_WHEN_READY_CHANGE_REASON_REMOTE)
                .build()
        }

        val metadata = MediaMetadata.Builder()
            .setTitle(s.title)
            .setArtist(s.artist)
            .setAlbumTitle(s.album)
            .apply { artwork?.let { setArtworkData(it, MediaMetadata.PICTURE_TYPE_FRONT_COVER) } }
            .build()
        val item = MediaItemData.Builder(s.songId.ifBlank { s.file })
            .setMediaItem(MediaItem.Builder().setMediaId(s.songId.ifBlank { s.file }).setMediaMetadata(metadata).build())
            .setMediaMetadata(metadata)
            .setIsSeekable(false)
            .setDurationUs(if (s.durationSec > 0) (s.durationSec * 1_000_000).toLong() else C.TIME_UNSET)
            .build()
        val positionMs = (s.elapsedSec * 1000).toLong()
        return builder
            .setPlaylist(ImmutableList.of(item))
            .setCurrentMediaItemIndex(0)
            .setPlaybackState(Player.STATE_READY)
            .setPlayWhenReady(s.playing, Player.PLAY_WHEN_READY_CHANGE_REASON_REMOTE)
            .setContentPositionMs(
                if (s.playing) PositionSupplier.getExtrapolating(positionMs, 1f) else PositionSupplier.getConstant(positionMs),
            )
            .build()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        controller.optimisticState(if (playWhenReady) "play" else "pause")
        controller.command(if (playWhenReady) "play" else "pause")
        return Futures.immediateVoidFuture()
    }

    override fun handleStop(): ListenableFuture<*> {
        controller.command("stop")
        return Futures.immediateVoidFuture()
    }

    /** Next/previous arrive as seek commands; the mirror has one item, so map them to MPD's own. */
    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
        when (seekCommand) {
            Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> controller.command("next")
            Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> controller.command("prev")
        }
        return Futures.immediateVoidFuture()
    }

    override fun handlePrepare(): ListenableFuture<*> = Futures.immediateVoidFuture()
}
