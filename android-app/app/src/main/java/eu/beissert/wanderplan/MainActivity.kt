package eu.beissert.wanderplan

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Vollbild-WebView, die die live gehostete WanderPlan-Seite lädt
 * (https://lencraft151-cloud.github.io/Claude/). Dadurch bekommt die App bei
 * jedem Web-Deploy automatisch die neuesten Features – ohne App-Update.
 *
 * Zusätzlich stellt sie die Brücke `WanderPlanNative` bereit: startet/stoppt
 * die Web-Seite das Standort-Teilen, übernimmt hier ein nativer
 * Vordergrund-Dienst das Senden – auch wenn der Bildschirm aus ist.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // Für einen später erneut auszuführenden Start des Teilens (nach Rechte-Dialog).
    private var pendingShare: String? = null

    private val LIVE_URL = "https://lencraft151-cloud.github.io/Claude/"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        // Edge-to-Edge: die Web-Seite nutzt env(safe-area-inset-*) selbst.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        }

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)
            useWideViewPort = true
            loadWithOverviewMode = true
            // WebGL / MapLibre braucht Hardware-Beschleunigung (per App-Default aktiv).
        }

        webView.addJavascriptInterface(NativeBridge(), "WanderPlanNative")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                // Externe Links (mailto, tel, andere Hosts) im System öffnen.
                val host = url.host ?: return false
                return if (host.contains("github.io") || host.contains("lencraft151-cloud")) {
                    false // in der WebView bleiben
                } else {
                    try { startActivity(Intent(Intent.ACTION_VIEW, url)) } catch (_: Exception) {}
                    true
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            // Geolocation-Anfrage der Seite erlauben, wenn App-Recht vorhanden.
            override fun onGeolocationPermissionsShowPrompt(
                origin: String, callback: GeolocationPermissions.Callback
            ) {
                val granted = hasFineLocation()
                callback.invoke(origin, granted, false)
                if (!granted) requestLocationPermissions()
            }

            // Kamera/Mikro braucht die Seite nicht – vorsichtshalber ablehnen.
            override fun onPermissionRequest(request: PermissionRequest) {
                request.deny()
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        // Standort-Recht früh anfragen, damit der blaue Punkt sofort funktioniert.
        if (!hasFineLocation()) requestLocationPermissions()

        if (savedInstanceState == null) {
            webView.loadUrl(LIVE_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }

        // Sideload-Variante: nach neuer Version suchen (Play-Variante: No-op-Stub).
        UpdateChecker.check(this)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    // ---------- JS-Brücke ----------

    inner class NativeBridge {
        /** Von der Web-Seite: Teilen starten. payload = JSON aus js/app.js. */
        @android.webkit.JavascriptInterface
        fun startShare(payloadJson: String) {
            runOnUiThread {
                if (hasFineLocation()) {
                    ensureBackgroundAndStart(payloadJson)
                } else {
                    pendingShare = payloadJson
                    requestLocationPermissions()
                }
            }
        }

        /** Von der Web-Seite: Teilen stoppen. */
        @android.webkit.JavascriptInterface
        fun stopShare() {
            runOnUiThread {
                val intent = Intent(this@MainActivity, LocationShareService::class.java)
                intent.action = LocationShareService.ACTION_STOP
                startService(intent)
            }
        }

        /** Erlaubt der Seite zu erkennen, dass sie in der nativen App läuft. */
        @android.webkit.JavascriptInterface
        fun isNativeApp(): Boolean = true
    }

    private fun ensureBackgroundAndStart(payloadJson: String) {
        // Hintergrund-Standort ist für dauerhaftes Teilen bei Bildschirm-Aus nötig.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasBackgroundLocation()) {
            pendingShare = payloadJson
            ActivityCompat.requestPermissions(
                this, arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), REQ_BACKGROUND
            )
            // Dienst trotzdem im Vordergrund starten – läuft, solange App offen ist.
        }
        startShareService(payloadJson)
    }

    private fun startShareService(payloadJson: String) {
        val intent = Intent(this, LocationShareService::class.java)
        intent.action = LocationShareService.ACTION_START
        intent.putExtra(LocationShareService.EXTRA_PAYLOAD, payloadJson)
        ContextCompat.startForegroundService(this, intent)
    }

    // ---------- Berechtigungen ----------

    private fun hasFineLocation() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    private fun hasBackgroundLocation(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
        return ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_BACKGROUND_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestLocationPermissions() {
        val perms = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        ActivityCompat.requestPermissions(this, perms.toTypedArray(), REQ_LOCATION)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val granted = grantResults.isNotEmpty() &&
            grantResults[0] == PackageManager.PERMISSION_GRANTED
        // Der WebView mitteilen, dass es jetzt losgehen kann.
        webView.evaluateJavascript("window.dispatchEvent(new Event('focus'));", null)
        val p = pendingShare
        if (granted && p != null) {
            pendingShare = null
            ensureBackgroundAndStart(p)
        }
    }

    companion object {
        private const val REQ_LOCATION = 101
        private const val REQ_BACKGROUND = 102
    }
}
