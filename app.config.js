const EAS_UPDATE_URL = "https://u.expo.dev/eb69d799-4dc6-4fbf-9c97-f1c8283f925f";

function shouldUseEasUpdates() {
  if (process.env.EAS_BUILD === "true") return true;
  const argv = process.argv.join(" ");
  // `expo start` must keep Metro as the update source. Expo Go loads the
  // project through expo-updates; pointing it at u.expo.dev or setting
  // enabled:false produces "Failed to download remote update".
  if (/\bstart\b/.test(argv)) return false;
  return process.env.NODE_ENV === "production";
}

/** @param {{ config: Record<string, unknown> }} context */
module.exports = ({ config }) => {
  const { updates: _updates, runtimeVersion: _runtimeVersion, ...rest } = config;

  if (!shouldUseEasUpdates()) {
    return rest;
  }

  return {
    ...rest,
    // Must match the APKs already installed (app.json policy appVersion → "1.0.0").
    runtimeVersion: { policy: "appVersion" },
    updates: {
      enabled: true,
      url: EAS_UPDATE_URL,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
  };
};
