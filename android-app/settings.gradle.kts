pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Eclipse Paho (MQTT) liegt in einem eigenen Repo
        maven("https://repo.eclipse.org/content/repositories/paho-releases/")
    }
}

rootProject.name = "WanderPlan"
include(":app")
