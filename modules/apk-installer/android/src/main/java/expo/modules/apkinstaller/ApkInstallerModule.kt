package expo.modules.apkinstaller

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.URLDecoder

class ApkInstallerModule : Module() {
  private var wifiNetworkCallback: ConnectivityManager.NetworkCallback? = null

  override fun definition() = ModuleDefinition {
    Name("ApkInstaller")

    Function("canRequestPackageInstalls") {
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.packageManager.canRequestPackageInstalls()
      } else {
        true
      }
    }

    AsyncFunction("prepareForExternalUi") {
      unpinForExternalUi()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("requestWifiReconnect") {
      requestWifiReconnect()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("openWifiSettings") {
      openWifiSettings()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("openUnknownSourcesSettings") {
      unpinForExternalUi()
      val activity = appContext.throwingActivity
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
        data = Uri.parse("package:${activity.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("installApk") { fileUri: String ->
      unpinForExternalUi()
      val activity = appContext.throwingActivity
      val file = resolveApkFile(fileUri)
      if (!file.exists()) {
        throw Exceptions.IllegalArgument("APK-ul nu a fost găsit: ${file.path}")
      }

      val uri = FileProvider.getUriForFile(
        activity,
        "${activity.packageName}.apkinstaller.fileprovider",
        file,
      )
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
    }.runOnQueue(Queues.MAIN)
  }

  private fun requestWifiReconnect(): Boolean {
    val context = appContext.reactContext ?: appContext.currentActivity ?: return false
    val appCtx = context.applicationContext
    var attempted = false

    try {
      @Suppress("DEPRECATION")
      val wifiManager = appCtx.getSystemService(Context.WIFI_SERVICE) as WifiManager
      if (!wifiManager.isWifiEnabled && Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        @Suppress("DEPRECATION")
        wifiManager.isWifiEnabled = true
        attempted = true
      }
      if (wifiManager.isWifiEnabled) {
        @Suppress("DEPRECATION")
        wifiManager.reconnect()
        @Suppress("DEPRECATION")
        wifiManager.reassociate()
        attempted = true
      }
    } catch (_: Exception) {
      // OEM / permission; fall through to ConnectivityManager.
    }

    try {
      val cm = appCtx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val request = NetworkRequest.Builder()
        .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        .build()
      if (wifiNetworkCallback == null) {
        wifiNetworkCallback = object : ConnectivityManager.NetworkCallback() {}
        cm.requestNetwork(request, wifiNetworkCallback!!)
      }
      attempted = true
    } catch (_: Exception) {
      // CHANGE_NETWORK_STATE missing or OEM restriction.
    }

    return attempted
  }

  private fun openWifiSettings() {
    val activity = appContext.throwingActivity
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        activity.startActivity(Intent(Settings.Panel.ACTION_WIFI))
        return
      } catch (_: Exception) {
        // Panel blocked by lock task or missing on OEM.
      }
    }

    unpinForExternalUi()
    val intent = Intent(Settings.ACTION_WIFI_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    activity.startActivity(intent)
  }

  private fun unpinForExternalUi() {
    val activity = appContext.currentActivity ?: return
    LockTaskGate.suppress()
    try {
      activity.stopLockTask()
    } catch (_: Exception) {
      // Already unpinned.
    }
  }

  private fun resolveApkFile(fileUri: String): File {
    val stripped = fileUri.removePrefix("file://")
    val decoded = try {
      URLDecoder.decode(stripped, "UTF-8")
    } catch (_: Exception) {
      stripped
    }
    return File(decoded)
  }
}
