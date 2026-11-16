package org.audioloader.remote.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.audioloader.remote.net.AudioloaderClient
import java.io.ByteArrayOutputStream

/** Downscaled cover bitmaps fetched with the profile's authenticated client, cached in memory. */
object CoverLoader {
    private const val MAX_PX = 512
    private val cache = LruCache<String, Bitmap>(16)

    /** Cache keys include the profile so a profile switch never shows another server's cover. */
    private fun key(c: AudioloaderClient, dir: String) = c.profile.id + "|" + dir

    fun cached(c: AudioloaderClient, dir: String): Bitmap? = cache.get(key(c, dir))

    /** Returns null on any failure: a missing cover is never an error worth surfacing. */
    suspend fun load(c: AudioloaderClient, dir: String): Bitmap? {
        cache.get(key(c, dir))?.let { return it }
        val bytes = try {
            c.cover(dir)
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        } ?: return null
        val bmp = withContext(Dispatchers.Default) { decode(bytes) } ?: return null
        cache.put(key(c, dir), bmp)
        return bmp
    }

    fun decode(bytes: ByteArray): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= MAX_PX && bounds.outHeight / (sample * 2) >= MAX_PX) sample *= 2
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
    }

    /** JPEG bytes for the media notification (kept small: they cross a binder). */
    fun jpeg(bmp: Bitmap): ByteArray = ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 85, it) }.toByteArray()
}
