package org.audioloader.remote.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.audioloader.remote.RemoteController
import org.audioloader.remote.media.PlaybackService

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val controller = RemoteController.from(this)
        setContent {
            AudioloaderTheme { RemoteApp(controller) }
        }
    }

    override fun onStart() {
        super.onStart()
        RemoteController.from(this).acquire()
    }

    override fun onStop() {
        RemoteController.from(this).release()
        super.onStop()
    }
}

private enum class Tab(val label: String) { NOW("Playing"), QUEUE("Queue"), SETTINGS("Profiles") }

@Composable
private fun RemoteApp(controller: RemoteController) {
    val context = LocalContext.current
    var tab by remember { mutableStateOf(Tab.NOW) }
    val profiles by controller.store.profiles.collectAsStateWithLifecycle()

    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {}
    LaunchedEffect(Unit) {
        val wanted = buildList {
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
            if (Build.VERSION.SDK_INT >= 31) add(Manifest.permission.BLUETOOTH_CONNECT)
        }
        if (wanted.isNotEmpty()) permissions.launch(wanted.toTypedArray())
    }
    // The media session service owns the notification and the Bluetooth rules; keep it running while a profile exists.
    // Start it on every return to the app, not only once: the system may have stopped it meanwhile.
    val hasProfiles = profiles.isNotEmpty()
    LifecycleStartEffect(hasProfiles) {
        if (hasProfiles) context.startService(Intent(context, PlaybackService::class.java))
        onStopOrDispose {}
    }
    LaunchedEffect(profiles.isEmpty()) { if (profiles.isEmpty()) tab = Tab.SETTINGS }

    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { tab = t },
                        icon = {
                            Icon(
                                when (t) {
                                    Tab.NOW -> Icons.Filled.PlayArrow
                                    Tab.QUEUE -> Icons.AutoMirrored.Filled.QueueMusic
                                    Tab.SETTINGS -> Icons.Filled.Settings
                                },
                                contentDescription = null,
                            )
                        },
                        label = { Text(t.label) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            when (tab) {
                Tab.NOW -> NowPlayingScreen(controller)
                Tab.QUEUE -> QueueScreen(controller)
                Tab.SETTINGS -> SettingsScreen(controller)
            }
        }
    }
}
