# Validation notes

Date: 2026-10-01, Pacific/Auckland. This file records development checks, not independent acceptance.

## Source candidate

Independent source/controlled-adapter review passed on 3911449 (AR-v7: 81 tests, 28 location scenarios and 16 additional F03 regressions); the documentation-only 2bfd670 follow-up passed AR-v8. No APK hash/build ID has been verified as corresponding to the current source; the earlier user-reported cloud build is recorded below. This public source repository excludes local artifacts/ and the coordination reports. The local development record retains exact commits and SHA-256 evidence; paths below describe that evidence rather than files available in a clone.

## Actual checks

| Check | Current outcome | Evidence |
| --- | --- | --- |
| Clean locked dependency install | PASS, exit 0: npm ci --no-audit --cache /private/tmp/find-my-car-npm-cache --fetch-retries=1 --fetch-timeout=30000 | artifacts/npm-ci.log |
| TypeScript / lint / 67 logic tests after indoor-clue guidance | PASS, exit 0: npm run check; 67 passed, 0 failed/skipped | artifacts/check-indoor.log |
| Android Hermes export after indoor-clue guidance | PASS, exit 0: EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 npm run export:android; 636 modules | artifacts/export-indoor.log |
| F01 actual Alert calls through installed RN | PASS, exit 0: TSX_DISABLE_CACHE=1 node --import tsx artifacts/verify-f01-alerts.cjs; 3 call sites / 5 new-edit cases | artifacts/verify-f01-indoor.log |
| Actual TSX photo/shortcut JS probe | PASS, exit 0: node artifacts/verify-indoor-ui.cjs; 12 hook/element-stub scenarios, no native renderer | artifacts/verify-indoor-ui.log |
| Permission-handling candidate: typecheck / lint / 81 tests | PASS, exit 0: TSX_DISABLE_CACHE=1 npm run check; 81 passed, 0 failed/skipped | artifacts/check-location-permission.log |
| Permission-handling Android Hermes export | PASS, exit 0: EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 npm run export:android; 637 modules | artifacts/export-location-permission.log |
| Retained F01 and indoor probes after permission changes | PASS, exit 0: five confirmation cases and twelve JS UI cases | artifacts/verify-f01-location-permission.log; artifacts/verify-indoor-ui-location-permission.log |
| Actual native-adapter/LocationPanel JS extraction | PASS, exit 0: node artifacts/verify-location-permission.cjs; 20 controlled Expo mock/JSX scenarios, no native calls | artifacts/verify-location-permission.log |
| F03 services-off repair: typecheck / lint / 81 tests | PASS, exit 0: TSX_DISABLE_CACHE=1 npm run check; 81 passed, 0 failed/skipped | artifacts/check-f03.log |
| F03 Android Hermes export | PASS, exit 0: EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 npm run export:android; 637 modules | artifacts/export-f03.log |
| F03 actual native-adapter/LocationPanel JS extraction | PASS, exit 0: node artifacts/verify-location-permission.cjs; 28 controlled scenarios including three services-off paths, failed queries and recovery | artifacts/verify-location-f03.log |
| Public-source preparation with committed owner EAS association | PASS, exit 0: typecheck / lint / 81 tests and Android Hermes export, 637 modules | artifacts/github-publication/check.log; artifacts/github-publication/export.log |
| Native generation | PASS, exit 0: npx expo prebuild --platform android --no-install --clean | artifacts/prebuild.log |
| Generated Android manifest/minimum SDK | PASS, exit 0: npm run check:android-config | artifacts/android-config.log |
| Expo compatible dependencies | PASS, exit 0: npx expo install --check (online) reports Dependencies are up to date | artifacts/expo-install-check.log |
| Dependency audit | Exit 1: 10 moderate findings, 0 high/critical; unresolved | artifacts/npm-audit.json |
| Historical developer EAS account probe | Exit 1: Not logged in at that time; not a current account check | development tool output; no credentials printed |
| Historical developer EAS cloud build attempt | Did not execute: automatic approval rejected that source upload | development status |
| User EAS build 84e530bc | User-provided output reports Build finished and app download; later emulator installation failed with spawn adb ENOENT. Exact source/configuration and F03 inclusion unverified | AR-v6 section 6 and review-build-84e530bc evidence |
| Android SDK/adb | Not available in PATH or usual paths checked | development status |
| Final APK / independent Android physical-device acceptance | NOT TESTED; user Android Expo Go trial reported normal, operations/revision unspecified | No reviewed APK hash, source correspondence or independent device checklist |

The first typecheck failed because Node types were not in the TypeScript type list; this was fixed. The first lint failed on effect-driven photo-state reset; keyed photo components fixed it. An ESLint 10 compatibility trial failed in Expo's React plugin; the project returned to Expo-compatible ESLint 9.39.5. Failed checks are retained in local logs; they are not counted as passes.

An offline npm ci attempt failed because a package was absent from the local cache; the subsequent online locked install passed. The offline Expo version check warned that validation was unreliable; only the successful online compatibility check above is counted. Evidence: artifacts/npm-ci-offline-attempt.log and artifacts/expo-install-check-offline.log.

The final checks include the camera recovery fix and two added regression tests. Each consumes a one-shot pending camera result, injects a metadata write failure, creates a second controller/repository, and saves the recovered photo. Both new and edit paths keep the previous active/Undo record intact until the new save succeeds. Read-only development review also exercised cancellation after recovery; that review is separate from the coordinating Astra acceptance.

The npm audit findings propagate from uuid through xcode and the Expo configuration toolchain. The underlying advisory concerns the uuid v3/v5/v6 buffer argument; this app generates IDs with expo-crypto. The suggested automatic remedy includes downgrading Expo to 46.0.21, which would break the selected SDK combination, so no force-fix was applied. This is not a claim that the dependency issue is resolved. See [the reported advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

The development export is dist/_expo/static/js/android/index-6071eaf646df7dc98f0bfb5121c435f8.hbc (1.6 MB), a JavaScript export rather than an APK. During F03 review the user's EAS association was uncommitted and separate from the reviewed configuration. That exact project association was later committed as a449ac9 for traceable builds; it contains a project UUID rather than credentials. Typecheck, lint, all 81 tests and the export passed again before public-source publication. Generated files and evidence logs remain ignored. Java 25.0.2 was detected but has not been used for a local Android compile; local SDK/JDK compatibility remains unverified.

## AR-v2 F01 repair

The replacement confirmation, Cancel-triggered discard confirmation and hardware-Back-triggered discard confirmation now pass `{ cancelable: true }` explicitly to `Alert.alert`. No `onDismiss` handler is supplied. Dismissing a confirmation therefore does not call save or discard; the existing draft, saved record and photo references remain in place. Only the explicit Replace/Discard buttons perform their respective actions.

TypeScript, lint and the existing 49 tests passed after the change; the Android Hermes export also passed. The generated Android configuration, install, dependency check and audit rows above retain evidence from the previous candidate because no dependencies or native configuration changed. AR-v3 subsequently closed the F01 source-configuration defect on 8561c79; later source reviews retained that result. Detailed physical Android Back evidence remains NOT TESTED.

A development-only probe extracts the three actual Alert argument lists from the current TSX and executes them through installed React Native 0.86.3 Alert.js. With real repository/controller code and synthetic storage/photos, all five new/edit scenarios preserve the draft, original record, photo files, persisted data and view snapshot on native dismissal or Keep editing; save/cancel calls remain zero. Positive-button controls invoke the intended Replace/Discard action. The probe is retained in ignored artifacts/verify-f01-alerts.cjs, separate from the 49 project tests and independent Astra evidence.

## Location status clarification

The user reported that the form kept showing Try again. Their screenshot showed a successful location with reported accuracy of about 5 m, while the request button was unconditionally labelled Try again. An iOS Expo Go simulator screenshot of the previous candidate also showed this successful state. The button label did not indicate a failed request or an automatic retry loop.

The form now shows Location captured and Update location after a successful request, with a prompt to Save parking. A request failure shows Location unavailable and Try again; if a retry fails after a coordinate was obtained, Previous location kept explains that the existing draft coordinate remains. A new draft without a requested location uses Get location. Editing continues to show the original saved position and offers no replacement-location action.

This is a presentation change in LocationPanel. Native location requests, accuracy, deadlines, controller generations and storage are unchanged. TypeScript, lint, all 49 existing tests and Android export passed; the current three Alert call sites were replayed again to retain F01 evidence. A read-only development review checked all display branches and the preserved-coordinate/edit paths.

The iOS simulator used a previously injected test location; its screenshots establish the earlier successful state, not real GPS accuracy. A later screenshot showed a saved parking record, so useful data was not cleared to reopen the form. Device Hub UI automation timed out during development; AR-v3 later independently captured the revised form on 8561c79 with Location captured / Update location, and recorded the user's manual simulator-flow pass. Those results are limited to that previous candidate and their recorded scenarios. An earlier native location error could not be captured through the runtime inspector. No native location defect or physical Android location repair is claimed. Local development screenshots are retained under artifacts/location-ui/; the preceding candidate manifest and validation record are preserved under artifacts/source-candidate-e20ecca/.

## Approved button styling

The Found action now uses the approved #11804b capsule, centred decorative check and white text, minimum height 54 and subtle native shadow. Its pressed colour is #0c693d with a small downward shift and reduced shadow. Save keeps theme green with radius 14; Maps is a full-width outline; Edit/Cancel remain text actions; New parking is a muted plus/text action in a separated area below Found, and the empty-state entry is Add parking. All existing handlers and busy/accessibility guards remain; no controller, repository, native-service or permission changes were made.

The actual iPhone 17 iOS Expo Go record screen was captured with simctl and visually inspected. Found, Maps, Edit, New parking and the consequence caption are visible without clipping. Evidence: artifacts/buttons/record-ios-simulator.png. The floating gear is Expo Go tooling. The screen uses the existing simulator record; no example data was added to source and no record was cleared for this check. This evidence does not verify Android rendering, pressed interaction, maximum-font layout, screen-reader behaviour, other screens or a standalone APK.

The first button check failed on exactOptionalPropertyTypes because the busy state explicitly passes undefined for the decorative icon. The optional prop type was corrected; the complete check then passed. The failed log is retained at artifacts/check-buttons-first-attempt.log and is not counted as a pass. The Android export and current three-call/five-case F01 probe passed. A read-only development agent reviewed the visual scope, handlers, disabled state, icon accessibility and unchanged data protections.

The preceding 8561c79 evidence is preserved in artifacts/source-candidate-8561c79/. The button-candidate 41103ec evidence is preserved in artifacts/source-candidate-41103ec/. The user subsequently approved the indoor-clue guidance documented in [the development handoff](BUTTON_AND_INDOOR_GUIDANCE_HANDOFF.md).

## Approved indoor-clue guidance

The form now suggests a level or sign photo above Save when a valid position exists but all trimmed text clues and usable photos are absent. Edits use remembered-clue copy and preserve coordinates/time; Add parking clues on the record opens the existing editor. Add a level uses the direct ScrollView-content section layout coordinate and focuses the existing input. Add a photo dismisses the keyboard and reuses capture/checkpoint/recovery. Reminder controls use the existing transaction busy guards; location loading alone still permits manual save.

Photo usability requires a current URI, successful file-existence check and successful Image load. Missing/check-failed/decode-failed photos retain their references and error UI and do not suppress the reminder or add an unavailable-photo comparison step. Unmount guards and sticky decode failure cover late async events. The 18 new tests cover guidance predicates, null/0/5 accuracy, whitespace, clue add/remove, photo failures, Maps fallback, location-only persistence, edit cancellation, old-record isolation and Found/Undo across restarts. The 12-case actual-TSX probe covers photo-event order, read errors, unmount, stable callbacks, URI identity, retained-photo shape and shortcut/busy actions. These are synthetic JavaScript checks, not native image or pixel tests.

The simulator and old local server were stopped at the start of this session. A new localhost-only Metro server first bound IPv6 while its manifest advertised 127.0.0.1, causing Expo Go launch errors. Restarting with node --dns-result-order=ipv4first corrected the connection; iOS bundled and the actual empty app screen loaded. Screenshots and local connection notes are retained under artifacts/indoor/. No app data was cleared, record written, permission expanded or sample record added to production source. GPS-only reminder screens, keyboard/focus movement, camera flow, maximum fonts and Android rendering remain pending UI/device verification. The source and checks are complete for independent targeted review.

## iPhone 17 Pro Max permission/location trial

The user supplied a screenshot showing Location unavailable / Location is unavailable here after reporting that they allowed permission. That exact message came from getCurrentPositionAsync rejection after the prior adapter's permission/services checks; it differs from the controller's timeout message. It is evidence of that failure branch, not a current permission query or the original native error. The new simulator's initial location source was not directly readable, so absence of a simulated position is a hypothesis, not a confirmed root cause.

Both the previous iPhone 17 (iOS 26.4) and new iPhone 17 Pro Max (iOS 26.3) were booted. The existing localhost Metro was running and was not duplicated. Device Hub was running, but its CUA accessibility retrieval timed out; no alternate UI injection was used. A direct Pro Max SDK screenshot showed the empty state with an Undo entry. No records were saved, removed, restored or cleared during this diagnostic.

Using Apple's simctl location API, the developer set the Pro Max simulator to explicitly synthetic latitude/longitude 0,0. The command succeeded without changing permissions or app storage. The user was asked to retry; no successful Pro Max positioning result has yet been recorded. [Expo's simulator instructions](https://docs.expo.dev/versions/v57.0.0/sdk/location/#ios-simulator) require a simulated location option other than None. Test coordinates do not prove actual GPS, parking accuracy or an Android fix.

Source fixes: permission preflight completes before the 15-second GPS/services deadline; request generations/draft IDs are checked before starting GPS after a late permission response. The permission phase has no timer, while manual save/cancel remain available and invalidate it. If the native permission Promise never returns, the progress panel can remain loading; no permanent transaction lock is held. Native locate reads permission without a second prompt, classifies permission/services/unavailable/invalid failures and retains the original cause internally. App settings appears only for a classified permission failure. Invalid native shapes/timestamps produce ordinary invalid-location guidance, rather than a raw TypeError/RangeError. Missing positions are never replaced by fake or last-known coordinates.

The new 14 tests cover permission waiting beyond the GPS deadline, rejection/retry, manual save/cancel and cross-draft late grants, existing coordinates and edit isolation. The 20-case probe extracts the actual adapter and LocationPanel with controlled Expo mocks. Its first run found two malformed-position classification gaps; those were repaired and the root reran all twenty successfully. Probe assertions are JavaScript behaviour, not native permission/GPS/UI acceptance. The full 81 tests, export and retained F01/indoor probes passed. Repository/schema/dependencies/permissions and indoor/button handlers remain unchanged.

The user also reported a trouble-free Android phone trial and confirmed Expo Go. Individual operations and exact tested revision were not provided. It is recorded as user feedback, not a complete phone checklist or independent APK pass. The fixed source candidate and current local runtime correspondence are recorded in DEVELOPMENT_STATUS.md and artifacts/validation-run.json; AR-v7 records the completed source-level F03 revalidation on 3911449.

## AR-v6 F03 repair

AR-v6 found a P2 classification defect in f14655b: iOS global Location Services being off can also return denied permission. Three adapter paths previously chose permission before checking services, incorrectly offering App settings. This independent source/controlled-JS finding does not establish the cause of the user's original Pro Max screenshot.

Permission request preflight, direct locate preflight and the position-error recheck now classify a confirmed services=false as services first, with phone-settings guidance and no App settings requirement. If the service query rejects, denied permission still yields the permission fallback. A position-error classification keeps its exact native cause. No controller, repository, draft/epoch protection, coordinates or photo logic changed.

The root reran typecheck, lint, all 81 tests and the Android export. The expanded real-method extraction probe passed 28 scenarios, including the three affected paths, service-query failure in each and a successful controlled coordinate after each recovery. It uses Expo mocks, not native settings or GPS. The five F01 and twelve indoor UI probes inherit their independently passing f14655b results because their controller/UI inputs are byte-identical; they were not represented as newly executed. AR-v7 independently closed F03 on 3911449, with 81 tests, 28 adapter cases and 16 additional F03 regressions passing. The live Metro preview has not been reloaded and is not evidence that this repair has loaded.

## Coverage boundaries

The tests use isolated in-memory adapters. Repository restart models persisted metadata re-reading, not Android process lifecycle or a real filesystem. Native integration, cache-photo copying and Activity recovery still need physical-device evidence.

The generated Android manifest includes removal directives for blocked permissions. This is build input inspection, not inspection of the final merged APK. The minimum SDK is 29 because the locked ImagePicker's pre-Android-10 camera path also requires legacy storage permission, which this app does not request.

The earlier developer EAS attempt was rejected by automatic approval review for insufficient source-upload authorisation; that attempt dispatched no build or upload. AR-v6 later recorded the user's successful cloud build output for 84e530bc-0e0e-43ba-a2da-3f4bed01c5f4. The later build is separate evidence and has not been bound to this F03 candidate or independently installed. The developer did not perform another cloud build, upload or account probe during this repair.

## Independent re-run

Run against the fixed candidate with the existing dependencies. Type checking uses --noEmit; lint is not run with --fix or a source cache. To direct caches into the acceptance review area:

~~~sh
TSX_DISABLE_CACHE=1 npm_config_cache=/path/to/review/cache TMPDIR=/path/to/review/tmp npm run check
~~~

Create those evidence directories in the review owner's authorised area before running. Compare tracked file hashes and Git status before/after. Native prebuild mutates generated files and must be run only by the development owner; it is not part of npm run check.

The local system Git shim started requiring an Xcode licence agreement during development. The already installed Command Line Tools Git executable remained usable, without accepting a licence or changing global configuration. No Xcode/iOS compilation is claimed.
