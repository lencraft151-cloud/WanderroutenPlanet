import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Version aus der CI (run_number); lokal Standardwerte.
val ciVersionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
val ciVersionName = System.getenv("VERSION_NAME") ?: "1.0.0"

// Signierung: kommt aus Umgebungsvariablen (in CI aus GitHub-Secrets dekodiert).
val keystorePath = System.getenv("KEYSTORE_FILE")
val hasReleaseKeystore = keystorePath != null && File(keystorePath).exists()

android {
    namespace = "eu.beissert.wanderplan"
    compileSdk = 34

    defaultConfig {
        applicationId = "eu.beissert.wanderplan"
        minSdk = 26
        targetSdk = 34
        versionCode = ciVersionCode
        versionName = ciVersionName
        // In der App verfügbar (Selbst-Updater vergleicht damit)
        buildConfigField("String", "GITHUB_REPO", "\"lencraft151-cloud/Claude\"")
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = File(keystorePath!!)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KEY_ALIAS")
                keyPassword = System.getenv("KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (hasReleaseKeystore) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
        }
    }

    flavorDimensions += "distribution"
    productFlavors {
        create("play") {
            dimension = "distribution"
            // Play übernimmt Updates – Selbst-Updater deaktiviert (play-Sourceset).
        }
        create("sideload") {
            dimension = "distribution"
            applicationIdSuffix = ".sideload"
            versionNameSuffix = "-sideload"
        }
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("org.eclipse.paho:org.eclipse.paho.client.mqttv3:1.2.5")
}
