package org.audioloader.remote.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import org.audioloader.remote.RemoteController
import org.audioloader.remote.net.QueueInfo

@Composable
fun QueueScreen(controller: RemoteController) {
    val state by controller.state.collectAsStateWithLifecycle()
    var queue by remember { mutableStateOf<QueueInfo?>(null) }
    val scope = rememberCoroutineScope()

    // The state changes when the queue or the current song does, so refetch on those.
    LaunchedEffect(state.queueLength, state.songId, controller.currentClient) {
        queue = controller.fetchQueue()
    }
    fun refreshSoon(action: () -> Unit) {
        action()
        scope.launch { queue = controller.fetchQueue() }
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("${queue?.entries?.size ?: 0} tracks", style = MaterialTheme.typography.titleMedium)
            OutlinedButton({ refreshSoon { controller.queueClear() } }, enabled = (queue?.entries?.size ?: 0) > 0) { Text("Clear") }
        }
        val entries = queue?.entries.orEmpty()
        if (entries.isEmpty()) {
            Text("The queue is empty. Pick an album in the full UI.")
        }
        LazyColumn {
            items(entries, key = { it.id }) { e ->
                val current = e.id == queue?.currentId
                Row(
                    Modifier.fillMaxWidth().clickable { refreshSoon { controller.queuePlay(e.id) } }.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(e.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = if (current) FontWeight.Bold else null)
                        Text(
                            listOf(e.artist, e.album).filter { it.isNotBlank() }.joinToString(" – "),
                            style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(formatTime(e.durationSec), Modifier.padding(horizontal = 8.dp))
                    IconButton({ refreshSoon { controller.queueRemove(e.id) } }) { Icon(Icons.Filled.Close, "Remove") }
                }
            }
        }
    }
}
