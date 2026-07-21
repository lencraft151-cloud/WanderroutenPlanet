# Minifizierung ist aus (isMinifyEnabled = false); diese Regeln greifen nur,
# falls sie später aktiviert wird.

# Eclipse Paho MQTT
-keep class org.eclipse.paho.** { *; }
-dontwarn org.eclipse.paho.**

# JavaScript-Brücke (per Reflexion von der WebView aufgerufen)
-keepclassmembers class eu.beissert.wanderplan.MainActivity$NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
