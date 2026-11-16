package org.audioloader.remote.ui

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import org.audioloader.remote.data.BluetoothRule

/**
 * Per-profile Bluetooth rule. It matters when this server's music is played on the phone itself
 * (earbuds, headphones, car): pause when one of the ticked devices disconnects, optionally resume on return.
 */
@SuppressLint("MissingPermission") // guarded by hasPermission below
@Composable
fun BluetoothSection(rule: BluetoothRule, onChange: (BluetoothRule) -> Unit) {
    val context = LocalContext.current
    HorizontalDivider()
    Text("Bluetooth", style = MaterialTheme.typography.titleMedium)
    Text(
        "Useful when this server's music plays on this phone. Tick the devices that should pause playback when they disconnect.",
        style = MaterialTheme.typography.bodySmall,
    )
    val hasPermission = Build.VERSION.SDK_INT < 31 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
    if (!hasPermission) {
        Text("Allow the Bluetooth permission (Android settings) to choose devices.", color = MaterialTheme.colorScheme.error)
        return
    }
    val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter
    val paired: List<BluetoothDevice> = runCatching { adapter?.bondedDevices.orEmpty().sortedBy { it.name ?: it.address } }.getOrDefault(emptyList())
    if (paired.isEmpty() && rule.devices.isEmpty()) Text("No paired Bluetooth devices found.")

    paired.forEach { d ->
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(d.address in rule.devices, { on -> onChange(rule.copy(devices = if (on) rule.devices + d.address else rule.devices - d.address)) })
            Text(d.name ?: d.address)
        }
    }
    // Devices that were ticked but are no longer paired stay visible so they can be removed.
    val pairedAddresses = paired.map { it.address }.toSet()
    rule.devices.filter { it !in pairedAddresses }.forEach { address ->
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(true, { onChange(rule.copy(devices = rule.devices - address)) })
            Text("$address (not paired)")
        }
    }
    Column {
        ToggleRow("Pause when a ticked device disconnects", rule.pauseOnDisconnect) { onChange(rule.copy(pauseOnDisconnect = it)) }
        ToggleRow("Resume when that device reconnects", rule.resumeOnReconnect) { onChange(rule.copy(resumeOnReconnect = it)) }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(checked, onChange)
    }
}
