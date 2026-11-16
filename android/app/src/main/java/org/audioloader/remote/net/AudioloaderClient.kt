package org.audioloader.remote.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Credentials
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.audioloader.remote.data.AuthMode
import org.audioloader.remote.data.Profile
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** The server (or the auth layer in front of it) refused the credentials, or redirected to a login. */
class AuthException(val code: Int) : IOException(
    if (code == 401 || code == 403) "Authentication rejected (HTTP $code)" else "Redirected (HTTP $code): the server wants authentication",
)

/**
 * HTTP client for one audioloader [Profile]. All endpoints are GET (see MPD_API_MAPPING.md).
 *
 * Redirects are never followed: like ../mcp, a 3xx/401/403 means an auth layer rejected us, and
 * following it could send credentials to another host.
 */
class AudioloaderClient(
    val profile: Profile,
    userAgent: String,
    base: OkHttpClient = OkHttpClient(),
) {
    private val baseUrl: HttpUrl = profile.baseUrlNormalized.toHttpUrl()

    /** Client for commands and snapshots. Also used by the cover loader. */
    val http: OkHttpClient = base.newBuilder()
        .followRedirects(false)
        .followSslRedirects(false)
        .connectTimeout(10, TimeUnit.SECONDS)
        .callTimeout(15, TimeUnit.SECONDS)
        .addInterceptor(Interceptor { chain ->
            val req = chain.request().newBuilder().header("User-Agent", userAgent)
            when (profile.authMode) {
                AuthMode.NONE -> Unit
                AuthMode.BASIC -> req.header(
                    "Authorization",
                    Credentials.basic(profile.username, profile.secret, Charsets.UTF_8),
                )
                AuthMode.BEARER -> req.header("Authorization", "Bearer ${profile.secret.trim()}")
                AuthMode.COOKIE -> req.header("Cookie", profile.cookieHeader)
            }
            chain.proceed(req.build())
        })
        .build()

    /** The long poll answers on the next MPD event or after 60 s; the read timeout must exceed that. */
    private val pollHttp: OkHttpClient = http.newBuilder()
        .callTimeout(0, TimeUnit.SECONDS)
        .readTimeout(75, TimeUnit.SECONDS)
        .build()

    fun url(endpoint: String, vararg params: Pair<String, String>): HttpUrl =
        baseUrl.newBuilder()
            .addPathSegment(endpoint)
            .addQueryParameter("mpd_server", profile.mpdServer.trim())
            .apply { params.forEach { (k, v) -> addQueryParameter(k, v) } }
            .build()

    /** The web UI of this server, for "open full UI". */
    fun webUiUrl(): String = baseUrl.newBuilder().addPathSegment("static").addPathSegment("").build().toString()

    suspend fun currentSong(): PlaybackState = PlaybackState.parse(json(http, url("currentsong")), monotonicMs())

    /** Returns when MPD reports a player/playlist change, or after the server's 60 s timeout. */
    suspend fun pollCurrentSong(): PlaybackState =
        PlaybackState.parse(json(pollHttp, url("poll_currentsong")), monotonicMs())

    suspend fun command(name: String) {
        require(name in COMMANDS) { "unknown command $name" }
        bytes(http, url(name))
    }

    suspend fun queue(): QueueInfo = QueueInfo.parse(json(http, url("queue")))

    suspend fun queuePlay(id: String) { bytes(http, url("queue_play", "id" to id)) }

    suspend fun queueRemove(id: String) { bytes(http, url("queue_remove", "id" to id)) }

    suspend fun queueClear() { bytes(http, url("queue_clear")) }

    suspend fun toggleOutput(outputId: String) { bytes(http, url("toggleoutput", "output" to outputId)) }

    /** MPD volume, 0-100. */
    suspend fun setVolume(volume: Int) { bytes(http, url("volume", "value" to volume.coerceIn(0, 100).toString())) }

    /** [muted] is the target state. */
    suspend fun toggleSnapcast(clientId: String, muted: Boolean) {
        bytes(http, url("togglesnapcastclient", "id" to clientId, "muted" to muted.toString()))
    }

    /** Raw cover image bytes (the server falls back to a vinyl picture), or null when too large. */
    suspend fun cover(directory: String): ByteArray? {
        val call = http.newCall(Request.Builder().url(url("cover", "directory" to directory)).get().build())
        call.await().use { res ->
            check(res)
            val body = res.body ?: return null
            if (body.contentLength() > MAX_COVER_BYTES) return null
            return withContext(Dispatchers.IO) { body.bytes() }
        }
    }

    private suspend fun json(client: OkHttpClient, url: HttpUrl): JSONObject =
        JSONObject(String(bytes(client, url), Charsets.UTF_8))

    private suspend fun bytes(client: OkHttpClient, url: HttpUrl): ByteArray {
        val call = client.newCall(Request.Builder().url(url).get().build())
        call.await().use { res ->
            check(res)
            return withContext(Dispatchers.IO) { res.body?.bytes() ?: ByteArray(0) }
        }
    }

    private fun check(res: Response) {
        val code = res.code
        if (code in 300..399 || code == 401 || code == 403) throw AuthException(code)
        if (!res.isSuccessful) throw IOException("HTTP $code")
    }

    companion object {
        val COMMANDS = setOf("play", "pause", "playpause", "next", "prev", "stop")
        private const val MAX_COVER_BYTES = 10L * 1024 * 1024
    }
}

private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (!cont.isCancelled) cont.resumeWithException(e)
        }

        override fun onResponse(call: Call, response: Response) {
            if (cont.isCancelled) response.close() else cont.resume(response)
        }
    })
}

