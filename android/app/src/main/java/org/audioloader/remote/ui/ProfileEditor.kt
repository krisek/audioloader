package org.audioloader.remote.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.audioloader.remote.data.AuthMode
import org.audioloader.remote.data.Profile

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileEditor(initial: Profile, onSave: (Profile) -> Unit, onCancel: () -> Unit, onDelete: (() -> Unit)?) {
    var p by remember { mutableStateOf(initial) }
    var expanded by remember { mutableStateOf(false) }
    val error = p.validate()
    var showError by remember { mutableStateOf(false) }
    val full = Modifier.fillMaxWidth()

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(p.name, { p = p.copy(name = it) }, full, label = { Text("Name") }, singleLine = true)
        OutlinedTextField(
            p.baseUrl, { p = p.copy(baseUrl = it) }, full, label = { Text("Base URL") }, singleLine = true,
            placeholder = { Text("https://music.example.org") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                p.mpdServer, { p = p.copy(mpdServer = it) }, Modifier.weight(1f), label = { Text("MPD server (host:port)") }, singleLine = true,
                placeholder = { Text("localhost:6600") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            )
            OutlinedTextField(p.clientId, { p = p.copy(clientId = it) }, Modifier.weight(1f), label = { Text("client_id") }, singleLine = true)
        }

        ExposedDropdownMenuBox(expanded, { expanded = it }) {
            OutlinedTextField(
                p.authMode.label, {}, Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable), readOnly = true, label = { Text("Authentication") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            )
            ExposedDropdownMenu(expanded, { expanded = false }) {
                AuthMode.entries.forEach { m ->
                    DropdownMenuItem({ Text(m.label) }, { p = p.copy(authMode = m); expanded = false })
                }
            }
        }
        when (p.authMode) {
            AuthMode.NONE -> Unit
            AuthMode.BASIC -> {
                OutlinedTextField(p.username, { p = p.copy(username = it) }, full, label = { Text("Username") }, singleLine = true)
                OutlinedTextField(
                    p.secret, { p = p.copy(secret = it) }, full, label = { Text("Password") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                )
            }
            AuthMode.BEARER -> OutlinedTextField(
                p.secret, { p = p.copy(secret = it) }, full, label = { Text("Token") }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
            )
            AuthMode.COOKIE -> OutlinedTextField(
                p.secret, { p = p.copy(secret = it) }, full, label = { Text("Cookie") }, singleLine = true,
                supportingText = { Text("A bare value is sent as audioloadermagic=<value>; or enter name=value") },
                visualTransformation = PasswordVisualTransformation(),
            )
        }
        BluetoothSection(p.bluetooth) { p = p.copy(bluetooth = it) }
        if (showError && error != null) Text(error, color = MaterialTheme.colorScheme.error)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button({ if (error == null) onSave(p) else showError = true }) { Text("Save") }
            OutlinedButton(onCancel) { Text("Cancel") }
            onDelete?.let { OutlinedButton(it) { Text("Delete") } }
        }
    }
}
