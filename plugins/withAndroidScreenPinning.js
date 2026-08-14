const { withAndroidManifest, withMainActivity } = require("expo/config-plugins");

const ON_RESUME_SNIPPET = `
  override fun onResume() {
    super.onResume()
    val activityManager = getSystemService(ACTIVITY_SERVICE) as android.app.ActivityManager
    if (activityManager.lockTaskModeState == android.app.ActivityManager.LOCK_TASK_MODE_NONE) {
      startLockTask()
    }
  }
`;

const KIOSK_BACK_HANDLER = `override fun invokeDefaultOnBackPressed() {
    // Screen pinning: Back must not send the app to the background.
  }`;

function withLockTaskManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    const activities = application?.activity;
    if (!Array.isArray(activities)) return modConfig;

    for (const activity of activities) {
      const name = activity.$?.["android:name"] ?? "";
      if (name === ".MainActivity" || name.endsWith(".MainActivity")) {
        activity.$["android:lockTaskMode"] = "always";
      }
    }

    return modConfig;
  });
}

function withLockTaskMainActivity(config) {
  return withMainActivity(config, (modConfig) => {
    let src = modConfig.modResults.contents;
    if (src.includes("startLockTask()")) {
      return modConfig;
    }

    if (/override fun invokeDefaultOnBackPressed\(\)/.test(src)) {
      src = src.replace(
        /override fun invokeDefaultOnBackPressed\(\) \{[\s\S]*?\n  \}/,
        `${ON_RESUME_SNIPPET.trimEnd()}\n\n  ${KIOSK_BACK_HANDLER}`,
      );
    } else {
      src = src.replace(/\n\}\s*$/, `\n${ON_RESUME_SNIPPET}\n}\n`);
    }

    modConfig.modResults.contents = src;
    return modConfig;
  });
}

function withAndroidScreenPinning(config) {
  config = withLockTaskManifest(config);
  config = withLockTaskMainActivity(config);
  return config;
}

module.exports = withAndroidScreenPinning;
