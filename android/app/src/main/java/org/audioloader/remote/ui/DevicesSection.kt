package org.audioloader.remote.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import org.audioloader.remote.RemoteController
import org.audioloader.remote.net.PlaybackState

/** A section title that collapses its content when tapped. */
@Composable
private fun CollapsibleSection(title: String, startExpanded: Boolean, content: @Composable () -> Unit) {
    var expanded by rememberSaveable(title) { mutableStateOf(startExpanded) }
    HorizontalDivider()
    Row(
        Modifier.fillMaxWidth().clickable { expanded = !expanded },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        Icon(
            if (expanded) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
            contentDescription = if (expanded) "Collapse $title" else "Expand $title",
        )
    }
    if (expanded) content()
}

/**
 * Snapcast rooms (shown when the server has any, expanded by default) and
 * MPD outputs (shown when there is a choice, collapsed by default).
 */
@Composable
fun DevicesSection(state: PlaybackState, controller: RemoteController) {
    if (state.snapcast.isNotEmpty()) {
        CollapsibleSection("Snapcast", startExpanded = true) {
            state.snapcast.forEach { s ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(if (s.connected) s.name else "${s.name} (offline)", Modifier.weight(1f))
                    Checkbox(!s.muted, { controller.toggleSnapcast(s.id, muted = !s.muted) }, enabled = s.connected)
                }
            }
        }
    }
    if (state.outputs.size > 1) {
        CollapsibleSection("Outputs", startExpanded = false) {
            state.outputs.forEach { o ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(o.name, Modifier.weight(1f))
                    Switch(o.enabled, { controller.toggleOutput(o.id) })
                }
            }
        }
    }
}
