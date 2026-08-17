package expo.modules.apkinstaller

import android.content.Intent
import android.net.Uri
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
