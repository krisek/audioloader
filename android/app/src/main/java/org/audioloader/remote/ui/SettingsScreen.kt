package org.audioloader.remote.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.audioloader.remote.RemoteController
import org.audioloader.remote.data.Profile

@Composable
fun SettingsScreen(controller: RemoteController) {
    val store = controller.store
    val profiles by store.profiles.collectAsStateWithLifecycle()
    val activeId by store.activeId.collectAsStateWithLifecycle()
    var editing by remember { mutableStateOf<Profile?>(null) }
    var isNew by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        val e = editing
        if (e != null) {
            Text(if (isNew) "New profile" else "Edit profile", style = MaterialTheme.typography.titleLarge)
            ProfileEditor(
                initial = e,
                onSave = { store.upsert(it); editing = null },
                onCancel = { editing = null },
                onDelete = if (isNew) null else ({ store.delete(e.id); editing = null }),
            )
            return@Column
        }

        Text("Servers", style = MaterialTheme.typography.titleLarge)
        val selected = activeId ?: profiles.firstOrNull()?.id
        profiles.forEach { p ->
            Row(Modifier.fillMaxWidth().clickable { store.setActive(p.id) }, verticalAlignment = Alignment.CenterVertically) {
                RadioButton(p.id == selected, { store.setActive(p.id) })
                Column(Modifier.weight(1f)) {
                    Text(p.name)
                    Text(p.baseUrl, style = MaterialTheme.typography.bodySmall)
                }
                Button({ isNew = false; editing = p }) { Text("Edit") }
            }
        }
        Button({ isNew = true; editing = Profile() }) { Text("Add profile") }
    }
}
