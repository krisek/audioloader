package org.audioloader.remote.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import java.util.UUID

/**
 * Profiles (with their credentials) and settings, in encrypted preferences.
 * Credentials never leave this store except as request headers.
 */
class ProfileStore(context: Context) {
    private val prefs: SharedPreferences = open(context.applicationContext)

    private val _profiles = MutableStateFlow(readProfiles())
    val profiles: StateFlow<List<Profile>> = _profiles.asStateFlow()

    private val _activeId = MutableStateFlow(prefs.getString(KEY_ACTIVE, null))
    val activeId: StateFlow<String?> = _activeId.asStateFlow()

    /** Short random id of this installation; goes into the User-Agent so the server tells instances apart. */
    val installId: String = prefs.getString(KEY_INSTALL, null)
        ?: UUID.randomUUID().toString().take(8).also { prefs.edit().putString(KEY_INSTALL, it).apply() }

    /** The profile in use: the selected one, or the first one. */
    fun activeProfile(): Profile? {
        val list = _profiles.value
        return list.firstOrNull { it.id == _activeId.value } ?: list.firstOrNull()
    }

    fun upsert(profile: Profile) {
        val list = _profiles.value.toMutableList()
        val i = list.indexOfFirst { it.id == profile.id }
        if (i >= 0) list[i] = profile else list += profile
        _profiles.value = list
        persistProfiles()
        if (_activeId.value == null) setActive(profile.id)
    }

    fun delete(id: String) {
        _profiles.value = _profiles.value.filterNot { it.id == id }
        persistProfiles()
        if (_activeId.value == id) setActive(_profiles.value.firstOrNull()?.id)
    }

    fun setActive(id: String?) {
        _activeId.value = id
        prefs.edit().apply { if (id == null) remove(KEY_ACTIVE) else putString(KEY_ACTIVE, id) }.apply()
    }

    /** Address of the Bluetooth device whose disconnect paused playback (for resume on reconnect). */
    var pausedByDevice: String?
        get() = prefs.getString(KEY_PAUSED_BY, null)
        set(value) {
            prefs.edit().apply { if (value == null) remove(KEY_PAUSED_BY) else putString(KEY_PAUSED_BY, value) }.apply()
        }

    private fun persistProfiles() {
        val arr = JSONArray()
        _profiles.value.forEach { arr.put(it.toJson()) }
        prefs.edit().putString(KEY_PROFILES, arr.toString()).apply()
    }

    private fun readProfiles(): List<Profile> = runCatching {
        val arr = JSONArray(prefs.getString(KEY_PROFILES, "[]"))
        List(arr.length()) { Profile.fromJson(arr.getJSONObject(it)) }
    }.getOrDefault(emptyList())

    private companion object {
        const val FILE = "audioloader_remote"
        const val KEY_PROFILES = "profiles"
        const val KEY_ACTIVE = "active"
        const val KEY_INSTALL = "install_id"
        const val KEY_PAUSED_BY = "paused_by"

        fun open(context: Context): SharedPreferences {
            fun create() = EncryptedSharedPreferences.create(
                context,
                FILE,
                MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
            return try {
                create()
            } catch (e: Exception) {
                // Keystore key lost (restore, reset): the stored data is unreadable. Start clean.
                context.deleteSharedPreferences(FILE)
                create()
            }
        }
    }
}
