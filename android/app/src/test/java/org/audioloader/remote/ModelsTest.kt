package org.audioloader.remote

import org.audioloader.remote.data.AuthMode
import org.audioloader.remote.data.BluetoothRule
import org.audioloader.remote.data.Profile
import org.audioloader.remote.net.PlaybackState
import org.audioloader.remote.net.QueueInfo
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelsTest {
    private val ok = Profile(name = "home", baseUrl = "https://music.example.org/")

    @Test fun validProfile() = assertNull(ok.validate())

    @Test fun trailingSlashIsNormalized() = assertEquals("https://music.example.org", ok.baseUrlNormalized)

    @Test fun badUrlRejected() = assertNotNull(ok.copy(baseUrl = "music").validate())

    @Test fun badMpdServerRejected() = assertNotNull(ok.copy(mpdServer = "host:70000").validate())

    @Test fun mpdServerForms() {
        listOf("localhost:6600", "10.0.0.5:6601", "box.lx", "[::1]:6600").forEach { assertNull(it, ok.copy(mpdServer = it).validate()) }
        listOf("", "host:abc", "host:0", "a b:6600", "[::1").forEach { assertNotNull(it, ok.copy(mpdServer = it).validate()) }
    }

    @Test fun badClientIdRejected() = assertNotNull(ok.copy(clientId = "a b").validate())

    @Test fun credentialsOverPlainHttpRejected() {
        val p = ok.copy(baseUrl = "http://music.example.org", authMode = AuthMode.BEARER, secret = "t")
        assertNotNull(p.validate())
    }

    @Test fun credentialsOverPlainHttpAllowedOnLoopback() {
        val p = ok.copy(baseUrl = "http://127.0.0.1:8080", authMode = AuthMode.BEARER, secret = "t")
        assertNull(p.validate())
    }

    @Test fun basicNeedsUsernameAndPassword() {
        assertNotNull(ok.copy(authMode = AuthMode.BASIC, secret = "x").validate())
        assertNotNull(ok.copy(authMode = AuthMode.BASIC, username = "u").validate())
        assertNull(ok.copy(authMode = AuthMode.BASIC, username = "u", secret = "x").validate())
    }

    @Test fun cookieDefaultsToMagicName() {
        assertEquals("audioloadermagic=abc", ok.copy(authMode = AuthMode.COOKIE, secret = "abc").cookieHeader)
        assertEquals("sid=abc", ok.copy(authMode = AuthMode.COOKIE, secret = "sid=abc").cookieHeader)
    }

    @Test fun toStringHidesSecret() = assertFalse(ok.copy(secret = "hunter2").toString().contains("hunter2"))

    @Test fun jsonRoundTrip() {
        val p = ok.copy(authMode = AuthMode.BASIC, username = "u", secret = "s")
        assertEquals(p, Profile.fromJson(p.toJson()))
    }

    @Test fun bluetoothRuleRoundTripsWithSeveralDevices() {
        val rule = BluetoothRule(pauseOnDisconnect = true, resumeOnReconnect = true, devices = setOf("AA:01", "AA:02", "AA:03"))
        val p = ok.copy(bluetooth = rule)
        assertEquals(rule, Profile.fromJson(p.toJson()).bluetooth)
        assertTrue(rule.enabled)
    }

    @Test fun bluetoothRuleIsOffWithoutDevices() = assertFalse(BluetoothRule().enabled)

    @Test fun oldProfilesWithoutBluetoothLoad() {
        val json = ok.toJson().apply { remove("bluetooth") }
        assertEquals(BluetoothRule(), Profile.fromJson(json).bluetooth)
    }

    @Test fun parsesPlayingState() {
        val j = JSONObject(
            """{"state":"play","Title":"Song","Artist":"Band","Album":"LP","file":"Band/LP/01 Song.flac",
               "elapsed":"10.5","duration":"200","songid":"7","playlistlength":"12",
               "outputs":[{"outputid":"0","outputname":"Main","outputenabled":"1"}],
               "snapcast_clients":[{"id":"a","name":"Kitchen","connected":true,"muted":false}]}""",
        )
        val s = PlaybackState.parse(j, 1000)
        assertTrue(s.playing && s.active)
        assertEquals("Song", s.title)
        assertEquals("Band/LP", s.coverDirectory)
        assertEquals(12, s.queueLength)
        assertTrue(s.outputs.single().enabled)
        assertEquals("Kitchen", s.snapcast.single().name)
    }

    @Test fun parsesVolume() {
        assertEquals(35, PlaybackState.parse(JSONObject("""{"state":"play","volume":"35"}"""), 0).volume)
        assertNull(PlaybackState.parse(JSONObject("""{"state":"play"}"""), 0).volume) // no mixer
        assertNull(PlaybackState.parse(JSONObject("""{"state":"play","volume":"-1"}"""), 0).volume)
    }

    @Test fun elapsedInterpolatesOnlyWhilePlaying() {
        val playing = PlaybackState(state = "play", elapsedSec = 10.0, durationSec = 100.0, receivedAtMs = 0)
        assertEquals(12.0, playing.elapsedAt(2000), 0.001)
        assertEquals(100.0, playing.elapsedAt(500_000), 0.001)
        assertEquals(10.0, playing.copy(state = "pause").elapsedAt(2000), 0.001)
    }

    @Test fun streamsAndStoppedHaveNoCoverDirectory() {
        assertNull(PlaybackState(state = "play", file = "http://radio.example/stream").coverDirectory)
        assertNull(PlaybackState(state = "stop", file = "A/B/c.flac").coverDirectory)
    }

    @Test fun radioFallsBackToStationName() {
        val s = PlaybackState.parse(JSONObject("""{"state":"play","Name":"Jazz FM","file":"http://x/y"}"""), 0)
        assertEquals("Jazz FM", s.title)
    }

    @Test fun parsesQueue() {
        val q = QueueInfo.parse(JSONObject("""{"queue":[{"id":"3","file":"A/B/x.flac","title":"","duration":61.5}],"current_id":"3"}"""))
        assertEquals("x.flac", q.entries.single().title)
        assertEquals("3", q.currentId)
    }

    @Test fun backoffIsCapped() {
        assertEquals(2_000L, RemoteController.backoffMs(1))
        assertEquals(30_000L, RemoteController.backoffMs(50))
    }
}
