package eu.beissert.wanderplan

import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Sideload-Variante: prüft beim Start die neueste GitHub-Release-APK und
 * bietet an, ein neueres Build zu installieren. So bleibt die per APK
 * installierte App aktuell, obwohl sie nicht über den Play Store läuft.
 *
 * Vergleich: Der Release-Tag heißt `android-v<run_number>`; unsere
 * versionCode ist ebenfalls die run_number → ist der neueste Tag höher,
 * gibt es ein Update.
 */
object UpdateChecker {

    // BuildConfig ist ein Laufzeit-Feld → kein `const val` möglich.
    private val apiLatest: String
        get() = "https://api.github.com/repos/${BuildConfig.GITHUB_REPO}/releases/latest"
    private const val APK_ASSET = "WanderPlan-sideload.apk"

    fun check(context: Context) {
        Thread {
            try {
                val json = httpGet(apiLatest) ?: return@Thread
                val release = JSONObject(json)
                val tag = release.optString("tag_name") // z. B. android-v37
                val latest = tag.substringAfterLast('v').toIntOrNull() ?: return@Thread
                val current = BuildConfig.VERSION_CODE
                if (latest <= current) return@Thread

                // Download-URL des APK-Assets suchen.
                val assets = release.optJSONArray("assets") ?: return@Thread
                var apkUrl: String? = null
                for (i in 0 until assets.length()) {
                    val a = assets.getJSONObject(i)
                    if (a.optString("name") == APK_ASSET) {
                        apkUrl = a.optString("browser_download_url"); break
                    }
                }
                val url = apkUrl ?: return@Thread

                Handler(Looper.getMainLooper()).post {
                    promptUpdate(context, url, latest)
                }
            } catch (_: Exception) {
                // Kein Netz o. Ä. – still ignorieren, App läuft normal weiter.
            }
        }.start()
    }

    private fun promptUpdate(context: Context, url: String, version: Int) {
        AlertDialog.Builder(context)
            .setTitle("Update verfügbar")
            .setMessage("Eine neuere WanderPlan-Version ($version) ist verfügbar. Jetzt herunterladen und installieren?")
            .setPositiveButton("Aktualisieren") { _, _ -> downloadAndInstall(context, url) }
            .setNegativeButton("Später", null)
            .show()
    }

    private fun downloadAndInstall(context: Context, url: String) {
        Thread {
            try {
                val outFile = File(context.cacheDir, APK_ASSET)
                downloadTo(url, outFile)

                val uri: Uri = FileProvider.getUriForFile(
                    context, "${context.packageName}.fileprovider", outFile
                )
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                Handler(Looper.getMainLooper()).post {
                    try { context.startActivity(intent) } catch (_: Exception) {}
                }
            } catch (_: Exception) {
                // Download fehlgeschlagen – nächster Start versucht es erneut.
            }
        }.start()
    }

    // ---------- HTTP-Helfer ----------

    private fun httpGet(spec: String): String? {
        val conn = (URL(spec).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "WanderPlan-Android")
            connectTimeout = 10000
            readTimeout = 10000
            instanceFollowRedirects = true
        }
        return try {
            if (conn.responseCode != 200) return null
            conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private fun downloadTo(spec: String, out: File) {
        val conn = (URL(spec).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            setRequestProperty("User-Agent", "WanderPlan-Android")
            connectTimeout = 15000
            readTimeout = 30000
            instanceFollowRedirects = true
        }
        try {
            conn.inputStream.use { input ->
                out.outputStream.use { output -> input.copyTo(output) }
            }
        } finally {
            conn.disconnect()
        }
    }
}
