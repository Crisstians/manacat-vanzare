# Manacat Magazin (tablete raioane)

Aplicație Android pentru tablete care înlocuiește bilețelele scrise de mână între raioane. **Nu este POS** — casa de marcat rămâne independentă.

Development **exclusiv din Cursor + terminal**. Android Studio nu face parte din workflow-ul zilnic.

## Flux zilnic

1. Pornește API-ul (`manacat-api`): `npm run dev`
2. În acest repo:

```bash
npm run emulator
npm run android
```

sau, dacă emulatorul e deja pornit:

```bash
npm run dev
```

| Comandă | Rol |
|---------|-----|
| `npm run dev` | Metro / Expo Dev Server, Fast Refresh |
| `npm run emulator` | Pornește AVD-ul tabletă `Manacat_Tablet` din CLI |
| `npm run android` | Deschide app-ul (Expo Go) pe emulator |

`EXPO_PUBLIC_API_URL` implicit: `http://10.0.2.2:3000/api/v1` (emulator → host).

## Setup de sistem (o singură dată)

Nu e nevoie să deschizi Android Studio. Ai nevoie de:

- Node.js 20+
- JDK 17
- [Android SDK Command-line Tools](https://developer.android.com/studio#command-line-tools-only)
- Variabile: `ANDROID_HOME` / `ANDROID_SDK_ROOT` + `PATH` către `platform-tools`, `emulator`, `cmdline-tools/latest/bin`

Apoi:

```bash
npm install
npm run emulator:create
```

Dacă Android Studio e deja instalat pe mașină, SDK-ul lui e folosit automat; **nu-l deschide** pentru run/debug.

## Release APK (GitHub)

Repo: [Crisstians/manacat-vanzare](https://github.com/Crisstians/manacat-vanzare)

Un tag `v*` pornește EAS Build (profil `preview` → APK) și publică un [GitHub Release](https://github.com/Crisstians/manacat-vanzare/releases) cu fișierul atașat.

### O singură dată

1. Cont Expo: [expo.dev/signup](https://expo.dev/signup)
2. Leagă proiectul (scrie `extra.eas.projectId` în `app.json` — **commitează** modificarea):

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

3. Primul build local generează keystore-ul Android pe EAS (poți anula după ce începe):

```bash
npm run build:apk
```

4. Token: [expo.dev → Access tokens](https://expo.dev/settings/access-tokens) → secret GitHub `EXPO_TOKEN`  
   Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

### Publicare

```bash
git tag v1.0.0
git push origin v1.0.0
```

APK: `https://github.com/Crisstians/manacat-vanzare/releases/download/v1.0.0/manacat-magazin-v1.0.0.apk`

Pe tabletă: permite instalarea din surse necunoscute, descarcă APK-ul, instalează. Nu trece prin Play Store.

La deschiderea APK-ului, Android **fixează ecranul** (screen pinning): Home și Recente nu mai ies din app. Pentru a ieși, ține apăsate **Înapoi + Recente** (butonul pătrat). Prima dată apare un dialog de confirmare. În Expo Go (dev) fixarea nu e activă.

Poți rula workflow-ul și manual din **Actions** → **Release APK** (fără tag nu creează Release, doar artifact).

## Actualizări după instalare

Tabletele care au deja un APK **fără** aceste mecanisme trebuie reinstalate **o dată** cu un APK nou. După acel APK:

### JavaScript (EAS Update) — fără APK nou

Pentru bug-uri, texte, ecrane (fără librării native, permisiuni sau SDK nou):

```bash
npx eas-cli@latest update --channel preview --message "Corectare scanare"
```

sau `npm run update:js -- --message "Corectare scanare"`.

Aplicația verifică la pornire și periodic. Apare un banner **Aplică acum**. Nu acoperă schimbări native.

### APK (instalare din aplicație)

Pentru schimbări native, un tag `v*` publică și `version.json` lângă APK. Tableta compară `versionCode`, descarcă APK-ul, iese temporar din kiosk și deschide instalatorul Android. Utilizatorul trebuie să confirme. Prima dată: Setări → permite instalarea din surse necunoscute pentru Manacat Magazin.

Manifestul publicat:

`https://github.com/Crisstians/manacat-vanzare/releases/latest/download/version.json`

APK-ul nou trebuie semnat cu **aceeași cheie** EAS, altfel Android cere dezinstalare.

## Ce nu facem

- Nu `expo run:android` / `prebuild` în fluxul zilnic
- Nu folder `android/` în git (EAS face prebuild pe serverul de build)
- Nu editare/debug din Android Studio
