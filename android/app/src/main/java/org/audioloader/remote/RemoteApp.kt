package org.audioloader.remote

import android.app.Application

class RemoteApp : Application() {
    val controller: RemoteController by lazy { RemoteController(this) }
}
