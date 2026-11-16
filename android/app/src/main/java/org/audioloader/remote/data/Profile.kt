package org.audioloader.remote.data

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** How requests to the audioloader server authenticate. Mirrors the upstream auth modes of ../mcp. */
enum class AuthMode(val label: String) {
    NONE("No auth"),
    BASIC("HTTP basic"),
    BEARER("Bearer token"),
    COOKIE("Cookie");

    companion object {
        fun parse(name: String?): AuthMode = entries.firstOrNull { it.name == name } ?: NONE
    }
}

/** A cookie entered without "name=" is treated as the value of this cookie (the Caddy "magic" cookie). */
const val DEFAULT_COOKIE_NAME = "audioloadermagic"

private val CLIENT_ID_RE = Regex("^[A-Za-z0-9_\\-.]+$")
private val LOOPBACK_HOSTS = setOf("localhost", "127.0.0.1", "::1")

/**
 * Bluetooth behaviour of one profile: only meaningful when music from this server is played on the phone.
 * [devices] are the addresses of the devices that trigger it (earbuds, headphones, car, ...); empty = rule off.
 */
data class BluetoothRule(
    val pauseOnDisconnect: Boolean = true,
    val resumeOnReconnect: Boolean = false,
    val devices: Set<String> = emptySet(),
) {
    val enabled: Boolean get() = devices.isNotEmpty() && (pauseOnDisconnect || resumeOnReconnect)

    fun toJson(): JSONObject = JSONObject()
        .put("pause", pauseOnDisconnect)
        .put("resume", resumeOnReconnect)
        .put("devices", JSONArray(devices.toList()))

    companion object {
        fun fromJson(o: JSONObject?): BluetoothRule {
            if (o == null) return BluetoothRule()
            val arr = o.optJSONArray("devices") ?: JSONArray()
            return BluetoothRule(
                pauseOnDisconnect = o.optBoolean("pause", true),
                resumeOnReconnect = o.optBoolean("resume", false),
                devices = List(arr.length()) { arr.getString(it) }.toSet(),
            )
        }
    }
}

/**
 * One audioloader server. [secret] holds the password (basic), the token (bearer) or the cookie.
 */
data class Profile(
    val id: String = UUID.randomUUID().toString(),
    val name: String = "",
    val baseUrl: String = "",
    val mpdServer: String = "localhost:6600",
    val clientId: String = "guest",
    val authMode: AuthMode = AuthMode.NONE,
    val username: String = "",
    val secret: String = "",
    val bluetooth: BluetoothRule = BluetoothRule(),
) {
    /** Base URL without surrounding blanks or trailing slashes. */
    val baseUrlNormalized: String get() = baseUrl.trim().trimEnd('/')

    /** The cookie header value: "name=value". */
    val cookieHeader: String
        get() = secret.trim().let { if ('=' in it) it else "$DEFAULT_COOKIE_NAME=$it" }

    /** Returns an error message for the profile editor, or null when the profile is usable. */
    fun validate(): String? {
        if (name.isBlank()) return "Name is required"
        val url = baseUrlNormalized.toHttpUrlOrNull()
            ?: return "Base URL must be a valid http:// or https:// URL"
        if (!isValidMpdServer(mpdServer)) return "MPD server must be host:port (port 1-65535)"
        if (!CLIENT_ID_RE.matches(clientId)) return "client_id may only contain letters, digits, _ - ."
        if (authMode != AuthMode.NONE) {
            if (!url.isHttps && url.host !in LOOPBACK_HOSTS) {
                return "Credentials are only sent over https (or to localhost)"
            }
            if (authMode == AuthMode.BASIC && username.isBlank()) return "Username is required"
            if (secret.isBlank()) {
                return when (authMode) {
                    AuthMode.BASIC -> "Password is required"
                    AuthMode.BEARER -> "Token is required"
                    else -> "Cookie is required"
                }
            }
        }
        return null
    }

    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("name", name)
        .put("baseUrl", baseUrl)
        .put("mpdServer", mpdServer)
        .put("clientId", clientId)
        .put("authMode", authMode.name)
        .put("username", username)
        .put("secret", secret)
        .put("bluetooth", bluetooth.toJson())

    /** Never print the secret. */
    override fun toString(): String = "Profile(id=$id, name=$name, baseUrl=$baseUrl, authMode=$authMode)"

    companion object {
        /** "host:port", "[::1]:6600", or just "host" (port defaults to 6600 on the server). */
        fun isValidMpdServer(value: String): Boolean {
            val s = value.trim()
            if (s.isEmpty() || s.any { it.isWhitespace() || it in "/?#@" }) return false
            val port = when {
                s.startsWith("[") -> {
                    val end = s.indexOf(']')
                    if (end < 2) return false
                    s.substring(end + 1).removePrefix(":").takeIf { s.length > end + 1 }
                }
                s.count { it == ':' } == 1 -> s.substringAfter(':')
                s.contains(':') -> null // bare IPv6 without brackets, no port
                else -> null
            }
            return port == null || port.toIntOrNull()?.let { it in 1..65535 } == true
        }

        fun fromJson(o: JSONObject): Profile = Profile(
            id = o.optString("id").ifBlank { UUID.randomUUID().toString() },
            name = o.optString("name"),
            baseUrl = o.optString("baseUrl"),
            mpdServer = o.optString("mpdServer", "localhost:6600").ifBlank { "localhost:6600" },
            clientId = o.optString("clientId", "guest").ifBlank { "guest" },
            authMode = AuthMode.parse(o.optString("authMode")),
            username = o.optString("username"),
            secret = o.optString("secret"),
            bluetooth = BluetoothRule.fromJson(o.optJSONObject("bluetooth")),
        )
    }
}
