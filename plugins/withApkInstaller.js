const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const FILE_PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<paths>
  <cache-path name="apks" path="." />
</paths>
`;

function withFileProviderManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application) return modConfig;

    application.provider = application.provider ?? [];
    const authority = "${applicationId}.apkinstaller.fileprovider";
    const alreadyPresent = application.provider.some(
      (provider) => provider.$?.["android:authorities"] === authority,
    );
    if (!alreadyPresent) {
      application.provider.push({
        $: {
          "android:name": "androidx.core.content.FileProvider",
          "android:authorities": authority,
          "android:exported": "false",
          "android:grantUriPermissions": "true",
        },
        "meta-data": [
          {
            $: {
              "android:name": "android.support.FILE_PROVIDER_PATHS",
              "android:resource": "@xml/apkinstaller_file_paths",
            },
          },
        ],
      });
    }

    return modConfig;
  });
}

function withFileProviderXml(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const xmlDir = path.join(modConfig.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, "apkinstaller_file_paths.xml"), FILE_PATHS_XML);
      return modConfig;
    },
  ]);
}

function withApkInstaller(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.REQUEST_INSTALL_PACKAGES",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.CHANGE_WIFI_STATE",
    "android.permission.CHANGE_NETWORK_STATE",
  ]);
  config = withFileProviderManifest(config);
  config = withFileProviderXml(config);
  return config;
}

module.exports = withApkInstaller;
