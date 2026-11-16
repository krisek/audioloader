package org.audioloader.remote.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import org.audioloader.remote.Connection

fun formatTime(seconds: Double): String {
    val s = seconds.toInt().coerceAtLeast(0)
    return "%d:%02d".format(s / 60, s % 60)
}

@Composable
fun ConnectionBanner(connection: Connection, error: String?) {
    val text = when (connection) {
        Connection.NO_PROFILE -> "Add a server profile in the Profiles tab"
        Connection.CONNECTING -> "Connecting…"
        Connection.CONNECTED -> return
        Connection.AUTH_FAILED -> "Authentication rejected – check the profile's auth settings"
        Connection.OFFLINE -> "Offline – retrying" + (error?.let { " ($it)" } ?: "")
    }
    Text(text, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
}
