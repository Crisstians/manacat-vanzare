import { spawn, spawnSync } from "node:child_process";
import { AVD_NAME, missingSdkMessage, resolveSdkRoot, sdkBin } from "./android-sdk.mjs";

function run(command, args, timeout = 8000) {
  return spawnSync(command, args, { encoding: "utf8", timeout, killSignal: "SIGTERM" });
}

function emulatorSerial(adb) {
  const stdout = run(adb, ["devices"]).stdout ?? "";
  const match = stdout.match(/^(emulator-\d+)\s+device$/m);
  return match?.[1] ?? null;
}

function accelEnabled(emulatorBin) {
  const result = run(emulatorBin, ["-accel-check"], 15000);
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (/is not installed|DISABLED|requires hardware acceleration/i.test(text)) {
    return false;
  }
  if (/accel:\s*0\b/.test(text) || result.status === 0) {
    return !/Android Emulator hypervisor driver is not installed/i.test(text);
  }
  return false;
}

const sdkRoot = resolveSdkRoot();
if (!sdkRoot) {
  console.error(missingSdkMessage());
  process.exit(1);
}

const adb = sdkBin(sdkRoot, "adb");
const emulator = sdkBin(sdkRoot, "emulator");

if (!adb || !emulator) {
  console.error("Lipsește adb sau emulator din SDK. Instalează platform-tools și emulator via sdkmanager.");
  process.exit(1);
}

if (emulatorSerial(adb)) {
  console.log("Un emulator rulează deja.");
  process.exit(0);
}

if (!accelEnabled(emulator)) {
  console.error("Emulatorul nu poate porni: lipsește accelerarea CPU (WHPX).");
  console.error("");
  console.error("Virtualizarea e deja activă în BIOS. Trebuie activat Windows Hypervisor Platform.");
  console.error("Deschide PowerShell ca Administrator și rulează:");
  console.error("");
  console.error("  dism /Online /Enable-Feature /FeatureName:HypervisorPlatform /All");
  console.error("  dism /Online /Enable-Feature /FeatureName:VirtualMachinePlatform /All");
  console.error("");
  console.error("Apoi restart la Windows și din nou: npm run emulator");
  console.error("Ghid: https://developer.android.com/studio/run/emulator-acceleration#vm-windows");
  process.exit(1);
}

const avds = run(emulator, ["-list-avds"]).stdout ?? "";
const avdNames = avds.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
if (!avdNames.includes(AVD_NAME)) {
  console.error(`AVD-ul "${AVD_NAME}" nu există.`);
  console.error("Creează-l din terminal: npm run emulator:create");
  process.exit(1);
}

console.log(`Pornesc emulatorul ${AVD_NAME}…`);
console.log("(primul boot poate dura 1–3 minute; următoarele sunt mai rapide)");

const child = spawn(
  emulator,
  ["-avd", AVD_NAME, "-gpu", "auto", "-no-boot-anim", "-netdelay", "none", "-netspeed", "full"],
  {
    detached: true,
    stdio: "ignore",
  },
);
child.unref();

const started = Date.now();
const timeoutMs = 180_000;
while (Date.now() - started < timeoutMs) {
  const elapsed = Math.round((Date.now() - started) / 1000);
  const serial = emulatorSerial(adb);
  if (serial) {
    const completed = run(adb, ["-s", serial, "shell", "getprop", "sys.boot_completed"]);
    if ((completed.stdout ?? "").trim() === "1") {
      console.log(`Emulatorul este gata (${elapsed}s). Rulează: npm run android`);
      process.exit(0);
    }
    process.stdout.write(`\rBoot Android… ${elapsed}s   `);
  } else {
    process.stdout.write(`\rAștept procesul emulator… ${elapsed}s   `);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

console.error("\nEmulatorul nu a terminat boot-ul în 3 minute. Verifică fereastra emulatorului.");
process.exit(1);
