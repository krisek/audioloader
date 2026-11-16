package org.audioloader.remote.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import org.audioloader.remote.RemoteController
import org.audioloader.remote.net.PlaybackState

/** MPD outputs (shown when there is a choice) and Snapcast rooms (shown when the server has any). */
@Composable
fun DevicesSection(state: PlaybackState, controller: RemoteController) {
    if (state.outputs.size > 1) {
        HorizontalDivider()
        Text("Outputs", style = MaterialTheme.typography.titleMedium, modifier = Modifier.fillMaxWidth())
        state.outputs.forEach { o ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(o.name, Modifier.weight(1f))
                Switch(o.enabled, { controller.toggleOutput(o.id) })
            }
        }
    }
    if (state.snapcast.isNotEmpty()) {
        HorizontalDivider()
        Text("Snapcast", style = MaterialTheme.typography.titleMedium, modifier = Modifier.fillMaxWidth())
        state.snapcast.forEach { s ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(if (s.connected) s.name else "${s.name} (offline)", Modifier.weight(1f))
                Checkbox(!s.muted, { controller.toggleSnapcast(s.id, muted = !s.muted) }, enabled = s.connected)
            }
        }
    }
}
