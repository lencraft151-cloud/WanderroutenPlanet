package eu.beissert.wanderplan

import org.eclipse.paho.client.mqttv3.MqttAsyncClient
import org.eclipse.paho.client.mqttv3.MqttConnectOptions
import org.eclipse.paho.client.mqttv3.MqttMessage
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence

/**
 * Dünner MQTT-Sender auf Basis von Eclipse Paho. Verbindet zum selben
 * öffentlichen Broker wie js/share.js (EMQX), damit Web-Betrachter die nativ
 * gesendeten Positionen empfangen. Nativ nutzen wir den TCP-Port 1883
 * (im Browser wäre nur WSS möglich); der Broker ist derselbe.
 *
 * Broker-Fallback wie im Web: der erste erreichbare gewinnt.
 */
class Mqtt {

    private val brokers = listOf(
        "tcp://broker.emqx.io:1883",
        "tcp://broker.hivemq.com:1883",
        "tcp://test.mosquitto.org:1883"
    )

    private var client: MqttAsyncClient? = null
    @Volatile private var connected = false

    // Nachrichten, die vor dem Verbindungsaufbau anfielen (nur die letzte je Topic).
    private val pending = HashMap<String, String>()

    fun connect() {
        tryBroker(0)
    }

    private fun tryBroker(index: Int) {
        if (index >= brokers.size) return
        val id = "wanderplan-android-" + System.currentTimeMillis()
        val c = try {
            MqttAsyncClient(brokers[index], id, MemoryPersistence())
        } catch (_: Exception) {
            tryBroker(index + 1); return
        }
        val opts = MqttConnectOptions().apply {
            isCleanSession = true
            connectionTimeout = 8
            keepAliveInterval = 30
            isAutomaticReconnect = true
        }
        try {
            c.connect(opts, null, object : org.eclipse.paho.client.mqttv3.IMqttActionListener {
                override fun onSuccess(t: org.eclipse.paho.client.mqttv3.IMqttToken?) {
                    client = c
                    connected = true
                    // Aufgestaute Nachrichten senden.
                    synchronized(pending) {
                        for ((topic, payload) in pending) doPublish(topic, payload)
                        pending.clear()
                    }
                }

                override fun onFailure(
                    t: org.eclipse.paho.client.mqttv3.IMqttToken?, e: Throwable?
                ) {
                    try { c.close() } catch (_: Exception) {}
                    tryBroker(index + 1)
                }
            })
        } catch (_: Exception) {
            tryBroker(index + 1)
        }
    }

    fun publishRetained(topic: String, payload: String) {
        if (connected) {
            doPublish(topic, payload)
        } else {
            synchronized(pending) { pending[topic] = payload }
        }
    }

    private fun doPublish(topic: String, payload: String) {
        val c = client ?: return
        try {
            val msg = MqttMessage(payload.toByteArray(Charsets.UTF_8)).apply {
                qos = 0
                isRetained = true
            }
            c.publish(topic, msg)
        } catch (_: Exception) {
            // Verbindung ggf. weg – Paho reconnectet automatisch.
        }
    }

    fun disconnect() {
        connected = false
        val c = client ?: return
        try { c.disconnect() } catch (_: Exception) {}
        try { c.close() } catch (_: Exception) {}
        client = null
    }
}
