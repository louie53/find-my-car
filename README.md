# Find My Car

An Android parking reminder with two main screens: save your parking clues, then use them to find your car. Built with React Native, Expo and TypeScript.

[![Check Android source](https://github.com/louie53/find-my-car/actions/workflows/check.yml/badge.svg)](https://github.com/louie53/find-my-car/actions/workflows/check.yml)

**Status: source and controlled-logic review passed; standalone APK acceptance pending.** The owner reported a successful Android Expo Go trial, but the tested revision and operation coverage were not recorded. An APK matching the latest source still needs verification and Xiaomi 15 / Android 16 installation testing. Android 10 (API 29) or newer is required.

## What you can do

- Save a level, zone/bay, landmark note, photo and optional foreground GPS position.
- Save manual clues when location is denied, switched off or unavailable.
- Get an optional indoor-parking reminder when only GPS is available, with shortcuts to add a level or sign photo. Add remembered clues later while keeping the saved position.
- Take a real photo with the system camera, retake/remove it and view it full screen.
- Edit clues while keeping the original parking time and coordinates.
- Save a new spot with confirmation before replacing an active record.
- End parking with **Found my car** and restore the most recently ended record with **Undo**, including after restarting the app.
- Open the saved coordinates in an external maps app.

A fresh installation has no example record or simulated photo. GPS is approximate and cannot identify a car park level or provide indoor navigation. There is no login, backend, cloud synchronisation, background tracking or parking history list.

## APK and trying the app

There is no verified release APK for the current source. A previous EAS cloud build completed, but its correspondence to the latest fixes and standalone phone behaviour have not been verified.

After an approved APK has been built, record its source commit, build ID and SHA-256, then follow [the Android device checklist](docs/ANDROID_DEVICE_CHECKS.md). Release publication is a separate delivery step.

## Run and check the source

The locked project uses Expo SDK 57, React Native 0.86.3, React 19.2.3 and TypeScript 6. Use the Node version in [.node-version](.node-version); Node 24.11.1 and npm 11.7.0 were used locally.

~~~sh
npm ci
npm run check
npm run export:android
npm start
~~~

The tests use Node's test runner with tsx. They inject storage, photo and device adapters to exercise races and failures. Test photos and coordinates are synthetic; no device data is bundled.

To run a native development build with your own Android SDK and compatible JDK:

~~~sh
npm run android
~~~

Expo Go or a development build is useful for iteration, but does not prove standalone APK operation.

## Build a standalone Android APK

The preview profile in [eas.json](eas.json) creates an internal APK without a development client. Authenticate with an account authorised for the EAS project configured in app.json:

~~~sh
npx eas-cli@24.8.0 login
npm run build:preview
~~~

app.json contains the owner's EAS project identifier, which is project configuration rather than a login credential. If building a fork, link your own Expo project before building. Keep login and signing credentials outside the repository, review project configuration changes, and bind the build to the resulting exact commit.

The EAS upload root must be this isolated repository. [.easignore](.easignore) excludes native generated folders, caches, local evidence, parking photos, environment files and signing material. App parking data is stored on the phone; EAS is a source compilation service, not app data synchronisation.

The local configuration can be generated and checked without producing an APK:

~~~sh
npx expo prebuild --platform android --no-install
npm run check:android-config
~~~

This validates generated manifest removal rules and minimum SDK configuration. The final merged APK manifest still requires inspection.

## Data and failure handling

The app writes one versioned AsyncStorage object containing an active record, an optional Undo snapshot and an optional camera recovery draft. AsyncStorage is not encrypted. Photo metadata contains a validated relative filename; images are copied to the app's persistent document directory.

Photos are copied before writing their metadata. Saved/ended/restored UI state changes only after storage succeeds, and obsolete photos are removed afterwards. A failed write keeps the prior record and the current draft. Cleanup failures are reported separately from successful saving.

The native location adapter requests foreground permission before starting the 15-second position deadline. Waiting for a permission decision still allows manual clues, saving and cancellation. Saving, leaving, retrying or opening the camera invalidates previous work. An old result cannot replace a new draft or the parking coordinates. Editing never requests permission or a replacement position. Confirmed system Location Services being off takes priority over a denied-permission result and points to phone settings. Otherwise, denied permission offers App settings; an authorised request without a position offers retry and manual saving.

For iOS Simulator trials, configure a simulated position for the selected device ([Expo instructions](https://docs.expo.dev/versions/v57.0.0/sdk/location/#ios-simulator)). Permission alone does not supply location data. Simulator positions are test data, not evidence of real GPS accuracy.

Before launching the camera, the app persists the text/photo draft and a request marker. A completed copy uses a filename tied to that request, after copying to a temporary file and renaming it. Startup recovers this completed file first, or consumes ImagePicker's pending result if no completed file exists. This keeps a copied photo recoverable when its metadata write fails and the app restarts again. This implementation has logic tests; Android Activity destruction still needs device validation.

Loading errors or unknown/corrupt state stop writing and photo cleanup. Missing photos are reported while retaining the record. Only known, unreferenced app-managed files are cleaned; an interrupted operation may leave an orphan photo. Arbitrary directory-wide cleanup is deliberately avoided.

Android backup and over-the-air updates are disabled in configuration. Uninstalling or clearing app data removes local parking data. Opening Maps is a user-initiated transfer of the saved position to an external application.

## Checks and remaining validation

Locally exercised checks:

- TypeScript strict checking and ESLint.
- 81 isolated logic/fault tests covering permission waiting/retries/classification, late location, timeout, camera checkpoint/recovery across repeated restarts, edits/cancellation, replacement, Found/Undo after repository restart, failed copies/writes, cleanup and indoor-clue guidance/availability.
- Android Hermes bundle export.
- Expo native prebuild and generated Android configuration inspection.
- A clean dependency installation and Expo dependency compatibility check.

Exact commands, exit codes, versions and reviewed baselines are recorded in [validation notes](docs/VALIDATION.md). [GitHub Actions](https://github.com/louie53/find-my-car/actions/workflows/check.yml) runs dependency installation, type checking, lint, tests and an Android JavaScript export on pushes and pull requests. It does not build or validate a standalone APK. Local evidence logs and coordination reports are excluded from this repository.

The dependency audit reports 10 moderate findings in Expo's toolchain dependency chain, with no high or critical findings. This remains a recorded dependency issue; the audit's suggested Expo downgrade was not applied.

Not yet tested: real Android GPS/permissions, camera output/orientation, Activity destruction, filesystem persistence on a phone, offline native operation, hardware Back, keyboard/small-screen/large-font layouts, final merged APK permissions, independent installation and cold start without Metro/Expo Go. No screenshots are presented as Android evidence.

## Structure and design

- src/domain: record types, validation, map destinations and finding clues.
- src/data: serialized persistence and reference-safe photo lifecycle.
- src/controller: UI transaction guard and device-request generations.
- src/native: real Expo storage, camera, location and linking adapters.
- src/ui: native form/detail screens, empty state, help and photo modal.
- tests: synthetic adapters and fault/race tests.

The app implements a two-screen layout using native controls. External Maps opens the saved destination; the app does not implement indoor navigation.

Implementation and automated tests were written with Codex assistance. Independent source/controlled-adapter review passed on 3911449, including 81 tests, 28 location scenarios and 16 additional F03 regressions. The documentation-only follow-up 2bfd670 also passed independent review. Final native/device and standalone APK acceptance remain pending.

API references: [Expo Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/), [ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/), [FileSystem](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/), [APK builds](https://docs.expo.dev/build-reference/apk/). The Android 10 minimum avoids the older ImagePicker camera path that requires legacy external-storage permission.
