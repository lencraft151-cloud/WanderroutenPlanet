package eu.beissert.wanderplan

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject

/**
 * Vordergrund-Dienst, der den Standort verfolgt und – identisch zu
 * js/share.js – als retained MQTT-Nachricht publisht. Läuft weiter, wenn der
 * Bildschirm aus ist oder die App im Hintergrund liegt.
 *
 * Topics/Format sind exakt wie im Web, damit Web-Betrachter die nativen
 * Positionen sehen:
 *   solo   -> wanderplan/loc/<token>
 *   gruppe -> wanderplan/group/<token>/<pid>
 *   payload-> {lat,lon,acc,alt,speed,heading,ts,name,[color]}
 */
class LocationShareService : Service() {

    private lateinit var fused: com.google.android.gms.location.FusedLocationProviderClient
    private var callback: LocationCallback? = null
    private var mqtt: Mqtt? = null

    // Teil-Konfiguration aus der JS-Brücke.
    private var mode: String = "solo"
    private var token: String = ""
    private var pid: String = ""
    private var name: String? = null
    private var color: String? = null

    private var lastPublish = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> start(intent.getStringExtra(EXTRA_PAYLOAD))
            ACTION_STOP -> { stopSharing(); stopSelf() }
        }
        return START_STICKY
    }

    private fun start(payloadJson: String?) {
        if (payloadJson == null) { stopSelf(); return }
        try {
            val o = JSONObject(payloadJson)
            mode = o.optString("mode", "solo")
            token = o.optString("token", "")
            pid = o.optString("pid", "")
            name = o.optString("name").takeIf { it.isNotBlank() }
            color = o.optString("color").takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            stopSelf(); return
        }
        if (token.isBlank()) { stopSelf(); return }

        startForegroundWithNotification()

        mqtt = Mqtt().also { it.connect() }

        fused = LocationServices.getFusedLocationProviderClient(this)
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 4000L)
            .setMinUpdateIntervalMillis(3000L)
            .setMinUpdateDistanceMeters(2f)
            .build()

        val cb = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { publish(it) }
            }
        }
        callback = cb
        try {
            fused.requestLocationUpdates(request, cb, Looper.getMainLooper())
        } catch (_: SecurityException) {
            // Ohne Standort-Recht können wir nichts senden.
            stopSharing(); stopSelf()
        }
    }

    private fun publish(loc: Location) {
        val now = System.currentTimeMillis()
        if (now - lastPublish < PUBLISH_INTERVAL) return
        lastPublish = now

        val payload = JSONObject().apply {
            put("lat", loc.latitude)
            put("lon", loc.longitude)
            put("acc", if (loc.hasAccuracy()) Math.round(loc.accuracy).toInt() else JSONObject.NULL)
            put("alt", if (loc.hasAltitude()) Math.round(loc.altitude).toInt() else JSONObject.NULL)
            put("speed", if (loc.hasSpeed()) loc.speed.toDouble() else JSONObject.NULL)
            put("heading", if (loc.hasBearing()) loc.bearing.toDouble() else JSONObject.NULL)
            put("ts", now)
            name?.let { put("name", it) }
            if (mode == "group") color?.let { put("color", it) }
        }.toString()

        val topic = if (mode == "group")
            "wanderplan/group/$token/$pid"
        else
            "wanderplan/loc/$token"

        mqtt?.publishRetained(topic, payload)
    }

    private fun stopSharing() {
        callback?.let { try { fused.removeLocationUpdates(it) } catch (_: Exception) {} }
        callback = null
        // Retained-Nachricht leeren, damit später niemand die alte Position sieht.
        val topic = if (mode == "group")
            "wanderplan/group/$token/$pid"
        else
            "wanderplan/loc/$token"
        if (token.isNotBlank()) mqtt?.publishRetained(topic, "")
        mqtt?.disconnect()
        mqtt = null
    }

    override fun onDestroy() {
        stopSharing()
        super.onDestroy()
    }

    // ---------- Benachrichtigung / Vordergrund ----------

    private fun startForegroundWithNotification() {
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Standort-Teilen", NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Aktiv, während WanderPlan deinen Standort live teilt." }
            mgr.createNotificationChannel(channel)
        }

        val openIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopIntent = PendingIntent.getService(
            this, 1, Intent(this, LocationShareService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = androidx.core.app.NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("WanderPlan teilt deinen Standort")
            .setContentText("Live-Standort läuft – auch im Hintergrund.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stopp", stopIntent)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    companion object {
        const val ACTION_START = "eu.beissert.wanderplan.START_SHARE"
        const val ACTION_STOP = "eu.beissert.wanderplan.STOP_SHARE"
        const val EXTRA_PAYLOAD = "payload"

        private const val CHANNEL_ID = "wanderplan_share"
        private const val NOTIF_ID = 42
        private const val PUBLISH_INTERVAL = 3000L // ms – wie js/share.js
    }
}
