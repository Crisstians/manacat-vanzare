import { spawnSync } from "node:child_process";
import { AVD_NAME, missingSdkMessage, resolveSdkRoot, sdkBin } from "./android-sdk.mjs";

const PACKAGE = "system-images;android-34;google_apis;x86_64";

const sdkRoot = resolveSdkRoot();
if (!sdkRoot) {
  console.error(missingSdkMessage());
  process.exit(1);
}

const sdkmanager = sdkBin(sdkRoot, "sdkmanager");
const avdmanager = sdkBin(sdkRoot, "avdmanager");

if (!sdkmanager || !avdmanager) {
  console.error("Lipsește sdkmanager/avdmanager. Instalează Android SDK Command-line Tools.");
  process.exit(1);
}

console.log("Instalez system image + emulator (dacă lipsesc)…");
spawnSync(sdkmanager, ["--install", PACKAGE, "platform-tools", "emulator", "platforms;android-34"], {
  stdio: "inherit",
});

console.log(`Creez AVD ${AVD_NAME}…`);
const created = spawnSync(
  avdmanager,
  ["create", "avd", "-n", AVD_NAME, "-k", PACKAGE, "-d", "pixel_tablet", "--force"],
  { stdio: "inherit", input: "no\n" },
);

if (created.status !== 0) {
  console.error("Crearea AVD a eșuat. Verifică sdkmanager și imaginile instalate.");
  process.exit(created.status ?? 1);
}

console.log(`Gata. Pornește emulatorul cu: npm run emulator`);
