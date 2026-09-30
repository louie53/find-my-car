# Validation notes

Date: 2026-09-30, Pacific/Auckland. This file records development checks, not independent acceptance.

## Source candidate

The precise candidate commit and local evidence paths are in the coordinating development status. After committing, the ignored artifacts/review-manifest.json contains SHA-256 values for every tracked file and the exact Git revision. No APK hash or build ID exists yet.

## Actual checks

| Check | Current outcome | Evidence |
| --- | --- | --- |
| Clean locked dependency install | PASS, exit 0: npm ci --no-audit --cache /private/tmp/find-my-car-npm-cache --fetch-retries=1 --fetch-timeout=30000 | artifacts/npm-ci.log |
| TypeScript / lint / 49 logic tests after F01 | PASS, exit 0: npm run check; 49 passed, 0 failed/skipped | artifacts/check-f01.log |
| Android Hermes export after F01 | PASS, exit 0: EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 npm run export:android; 636 modules | artifacts/export-f01.log |
| F01 actual Alert calls through installed RN | PASS, exit 0: TSX_DISABLE_CACHE=1 node --import tsx artifacts/verify-f01-alerts.cjs; 3 call sites / 5 new-edit cases | artifacts/verify-f01-alerts.log |
| Native generation | PASS, exit 0: npx expo prebuild --platform android --no-install --clean | artifacts/prebuild.log |
| Generated Android manifest/minimum SDK | PASS, exit 0: npm run check:android-config | artifacts/android-config.log |
| Expo compatible dependencies | PASS, exit 0: npx expo install --check (online) reports Dependencies are up to date | artifacts/expo-install-check.log |
| Dependency audit | Exit 1: 10 moderate findings, 0 high/critical; unresolved | artifacts/npm-audit.json |
| EAS account probe | Exit 1: Not logged in | development tool output; no credentials printed |
| EAS cloud build | Did not execute: automatic approval rejected source upload | development status |
| Android SDK/adb | Not available in PATH or usual paths checked | development status |
| APK / Android physical device | BLOCKED / NOT TESTED | No package or device evidence |

The first typecheck failed because Node types were not in the TypeScript type list; this was fixed. The first lint failed on effect-driven photo-state reset; keyed photo components fixed it. An ESLint 10 compatibility trial failed in Expo's React plugin; the project returned to Expo-compatible ESLint 9.39.5. Failed checks are retained in local logs; they are not counted as passes.

An offline npm ci attempt failed because a package was absent from the local cache; the subsequent online locked install passed. The offline Expo version check warned that validation was unreliable; only the successful online compatibility check above is counted. Evidence: artifacts/npm-ci-offline-attempt.log and artifacts/expo-install-check-offline.log.

The final checks include the camera recovery fix and two added regression tests. Each consumes a one-shot pending camera result, injects a metadata write failure, creates a second controller/repository, and saves the recovered photo. Both new and edit paths keep the previous active/Undo record intact until the new save succeeds. Read-only development review also exercised cancellation after recovery; that review is separate from the coordinating Astra acceptance.

The npm audit findings propagate from uuid through xcode and the Expo configuration toolchain. The underlying advisory concerns the uuid v3/v5/v6 buffer argument; this app generates IDs with expo-crypto. The suggested automatic remedy includes downgrading Expo to 46.0.21, which would break the selected SDK combination, so no force-fix was applied. This is not a claim that the dependency issue is resolved. See [the reported advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

The F01 exported bundle is dist/_expo/static/js/android/index-f33904dfcea730a607a68940cd5c761e.hbc (1.6 MB). Generated files and evidence logs are ignored and are not part of the source upload. Java 25.0.2 was detected but has not been used for an Android compile; local SDK/JDK compatibility remains unverified.

## AR-v2 F01 repair

The replacement confirmation, Cancel-triggered discard confirmation and hardware-Back-triggered discard confirmation now pass `{ cancelable: true }` explicitly to `Alert.alert`. No `onDismiss` handler is supplied. Dismissing a confirmation therefore does not call save or discard; the existing draft, saved record and photo references remain in place. Only the explicit Replace/Discard buttons perform their respective actions.

TypeScript, lint and the existing 49 tests passed after the change; the Android Hermes export also passed. The generated Android configuration, install, dependency check and audit rows above retain evidence from the previous candidate because no dependencies or native configuration changed. F01 has not been independently closed by Astra on this new candidate, and physical Android Back behaviour is still NOT TESTED.

A development-only probe extracts the three actual Alert argument lists from the current TSX and executes them through installed React Native 0.86.3 Alert.js. With real repository/controller code and synthetic storage/photos, all five new/edit scenarios preserve the draft, original record, photo files, persisted data and view snapshot on native dismissal or Keep editing; save/cancel calls remain zero. Positive-button controls invoke the intended Replace/Discard action. The probe is retained in ignored artifacts/verify-f01-alerts.cjs, separate from the 49 project tests and independent Astra evidence.

## Coverage boundaries

The tests use isolated in-memory adapters. Repository restart models persisted metadata re-reading, not Android process lifecycle or a real filesystem. Native integration, cache-photo copying and Activity recovery still need physical-device evidence.

The generated Android manifest includes removal directives for blocked permissions. This is build input inspection, not inspection of the final merged APK. The minimum SDK is 29 because the locked ImagePicker's pre-Android-10 camera path also requires legacy storage permission, which this app does not request.

The automatic approval review rejected the attempted EAS build because it can send source to an external service and judged the current authorisation insufficient. No build was dispatched and no data uploaded. The reviewed isolated source needs explicit upload approval and owner-managed Expo login before that step.

## Independent re-run

Run against the fixed candidate with the existing dependencies. Type checking uses --noEmit; lint is not run with --fix or a source cache. To direct caches into the acceptance review area:

~~~sh
TSX_DISABLE_CACHE=1 npm_config_cache=/path/to/review/cache TMPDIR=/path/to/review/tmp npm run check
~~~

Create those evidence directories in the review owner's authorised area before running. Compare tracked file hashes and Git status before/after. Native prebuild mutates generated files and must be run only by the development owner; it is not part of npm run check.

The local system Git shim started requiring an Xcode licence agreement during development. The already installed Command Line Tools Git executable remained usable, without accepting a licence or changing global configuration. No Xcode/iOS compilation is claimed.
