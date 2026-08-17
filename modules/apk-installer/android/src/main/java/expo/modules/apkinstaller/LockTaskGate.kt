package expo.modules.apkinstaller

object LockTaskGate {
  @Volatile
  private var suppressUntilPause: Boolean = false

  fun suppress() {
    suppressUntilPause = true
  }

  fun onHostPause() {
    suppressUntilPause = false
  }

  fun shouldSuppress(): Boolean = suppressUntilPause
}
