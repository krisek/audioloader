package org.audioloader.remote.ui

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.DpSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import org.audioloader.remote.RemoteController
import org.audioloader.remote.media.CoverLoader
import org.audioloader.remote.net.monotonicMs

@Composable
fun NowPlayingScreen(controller: RemoteController) {
    val state by controller.state.collectAsStateWithLifecycle()
    val connection by controller.connection.collectAsStateWithLifecycle()
    val error by controller.error.collectAsStateWithLifecycle()
    val context = LocalContext.current

    var now by remember { mutableLongStateOf(monotonicMs()) }
    LaunchedEffect(state.playing) {
        while (state.playing) { now = monotonicMs(); delay(500) }
        now = monotonicMs()
    }

    var cover by remember { mutableStateOf<Bitmap?>(null) }
    val dir = state.coverDirectory
    LaunchedEffect(dir, controller.currentClient) {
        val c = controller.currentClient
        cover = if (c != null && dir != null) CoverLoader.cached(c, dir) ?: CoverLoader.load(c, dir) else null
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ConnectionBanner(connection, error)
        cover?.let {
            Image(it.asImageBitmap(), null, Modifier.fillMaxWidth().height(280.dp), contentScale = ContentScale.Fit)
        } ?: Spacer(Modifier.height(280.dp))

        Text(if (state.active) state.title else "Not playing", style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Text(listOf(state.artist, state.album).filter { it.isNotBlank() }.joinToString(" – "), textAlign = TextAlign.Center)

        if (state.active && state.durationSec > 0) {
            val elapsed = state.elapsedAt(now)
            LinearProgressIndicator(progress = { (elapsed / state.durationSec).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatTime(elapsed)); Text(formatTime(state.durationSec))
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton({ controller.command("prev") }, enabled = state.active) { Icon(Icons.Filled.SkipPrevious, "Previous") }
            FilledIconButton({ controller.command(if (state.playing) "pause" else "play") }, Modifier.size(64.dp), enabled = state.active) {
                Icon(if (state.playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, if (state.playing) "Pause" else "Play")
            }
            IconButton({ controller.command("next") }, enabled = state.active) { Icon(Icons.Filled.SkipNext, "Next") }
            IconButton({ controller.command("stop") }, enabled = state.active) { Icon(Icons.Filled.Stop, "Stop") }
        }

        state.volume?.let { volume ->
            VolumeSlider(volume) { value, final -> controller.setVolume(value, final) }
        }
        controller.currentClient?.let { c ->
            OutlinedButton({ context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(c.webUiUrl()))) }) { Text("Open full UI") }
        }
        DevicesSection(state, controller)
    }
}

/** MPD volume. Drags are sent at most every [VOLUME_SEND_EVERY_MS]; the last value is always sent on release. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolumeSlider(volume: Int, onChange: (Int, Boolean) -> Unit) {
    var dragging by remember { mutableStateOf(false) }
    var local by remember { mutableFloatStateOf(0f) }
    var lastSent by remember { mutableLongStateOf(0L) }
    val interactionSource = remember { MutableInteractionSource() }
    val shown = if (dragging) local else volume.toFloat()
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.AutoMirrored.Filled.VolumeUp, "Volume")
        Slider(
            value = shown,
            onValueChange = {
                dragging = true
                local = it
                val now = monotonicMs()
                if (now - lastSent >= VOLUME_SEND_EVERY_MS) {
                    lastSent = now
                    onChange(it.toInt(), false)
                }
            },
            onValueChangeFinished = {
                onChange(local.toInt(), true)
                dragging = false
            },
            valueRange = 0f..100f,
            modifier = Modifier.weight(1f),
            // Slim like the progress bar: a 4 dp track and a small round thumb (no tall bar, no gap, no stop dot).
            thumb = { SliderDefaults.Thumb(interactionSource, thumbSize = DpSize(16.dp, 16.dp)) },
            track = { sliderState ->
                SliderDefaults.Track(
                    sliderState,
                    Modifier.height(4.dp),
                    thumbTrackGapSize = 0.dp,
                    trackInsideCornerSize = 0.dp,
                    drawStopIndicator = null,
                )
            },
            interactionSource = interactionSource,
        )
        Text("${shown.toInt()}", Modifier.width(32.dp), textAlign = TextAlign.End)
    }
}

private const val VOLUME_SEND_EVERY_MS = 150L
