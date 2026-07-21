package eu.beissert.wanderplan

import android.content.Context

/**
 * Play-Variante: der Google Play Store übernimmt Updates.
 * Der Selbst-Updater ist hier bewusst ein No-op.
 */
object UpdateChecker {
    fun check(context: Context) {
        // Absichtlich leer – Updates laufen über den Play Store.
    }
}
