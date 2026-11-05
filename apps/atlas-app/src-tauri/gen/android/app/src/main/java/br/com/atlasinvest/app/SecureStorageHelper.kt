package br.com.atlasinvest.app

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Android Keystore-backed Secure Storage Helper for Project Atlas (Phase APP-10).
 * Encrypts and persists tokens using EncryptedSharedPreferences (AES-256 GCM)
 * backed by hardware-backed Android Keystore MasterKey.
 *
 * Guarantees:
 * 1. Non-exportable hardware-backed keys in Android Keystore.
 * 2. Zero plaintext in logs, SharedPreferences XML, or exceptions.
 * 3. Atomic synchronous writes (commit) and persistence across process kills, force-stop, and reboots.
 */
object SecureStorageHelper {
    private const val TAG = "AtlasSecureStorage"
    private const val PREFERENCES_FILE = "atlas_secure_prefs"
    private const val KEY_REFRESH_TOKEN = "atlas_refresh_token"

    @Volatile
    private var sharedPreferences: SharedPreferences? = null

    @Synchronized
    private fun getPrefs(context: Context): SharedPreferences {
        sharedPreferences?.let { return it }

        val appContext = context.applicationContext ?: context

        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        val prefs = EncryptedSharedPreferences.create(
            appContext,
            PREFERENCES_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        sharedPreferences = prefs
        return prefs
    }

    @JvmStatic
    fun getRefreshToken(context: Context): String? {
        return try {
            val prefs = getPrefs(context)
            prefs.getString(KEY_REFRESH_TOKEN, null)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read secure token: ${e.javaClass.simpleName}")
            null
        }
    }

    @JvmStatic
    fun setRefreshToken(context: Context, token: String): Boolean {
        if (token.isBlank()) {
            return false
        }
        return try {
            val prefs = getPrefs(context)
            prefs.edit().putString(KEY_REFRESH_TOKEN, token).commit()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to persist secure token: ${e.javaClass.simpleName}")
            false
        }
    }

    @JvmStatic
    fun clearRefreshToken(context: Context): Boolean {
        return try {
            val prefs = getPrefs(context)
            prefs.edit().remove(KEY_REFRESH_TOKEN).commit()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear secure token: ${e.javaClass.simpleName}")
            false
        }
    }
}
