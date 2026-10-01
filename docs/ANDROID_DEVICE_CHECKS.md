# Android device checks — pending

Use the final standalone APK and harmless test text/photos. Keep original device evidence in ignored local artifacts/device/; publish only reviewed, redacted images. Do not clear useful parking data to run destructive tests.

Record the executor, local date/time/time zone, phone model, Android version/API, display width/font setting, source commit, build ID, application ID, versionName/versionCode and APK SHA-256. A filename or matching version number alone does not establish source-to-APK correspondence.

All entries below are **NOT TESTED** until evidence is recorded.

| Area | Steps and expected result |
| --- | --- |
| Independent install | Install on Android 10 or newer. Stop Metro, disconnect the development computer and do not use Expo Go. First launch offline and cold-start again. The app opens without a development server. |
| Fresh/normal startup | First installation is empty. Save text, force-stop and reopen; the same record appears. |
| Real location | Allow foreground precision. A successful request shows Location captured and Update location; use Save parking to commit it. Move elsewhere, then open/edit the record. It keeps the saved parking position and timestamp. Editing offers no replacement-location action. |
| Location failures | Leave the permission prompt unanswered longer than 15 seconds, then allow it: the position deadline begins after the decision; manual save/cancel still work while waiting. Deny permission, disable services, allow approximate location and exercise timeout/retry. Failure shows Location unavailable and Try again. Confirmed system services off takes priority even when permission reports denied: guidance points to phone settings, without an App settings action. Denied permission with services on offers App settings; service-query failure retains the permission fallback. A permitted request without a position does not imply permission is denied. Restore services/permission and retry. If a retry fails after a coordinate was captured, Previous location kept explains that the draft coordinate remains. Fields stay editable; manual clues save. A late permission/position result does not replace saved data. |
| Indoor clues | With a position and no trimmed text/usable photo, Save shows the optional indoor reminder even if accuracy is null. Add a level scrolls/focuses the existing field; Add a photo/Retake photo uses the current camera flow. Add/remove a single useful clue and check reminder disappearance/return. Only-location Save remains allowed. A GPS-only record offers Add parking clues; editing/cancelling retains original coordinates/time. Missing/unreadable photos keep errors/references and do not hide guidance or produce a comparison step. Check keyboard, narrow screen and maximum fonts. |
| Real camera | Deny, cancel, photograph a harmless sign, retake, remove and enlarge. Check portrait/landscape photos are readable. |
| Photo persistence | Save a real photo, force-stop, reopen and enlarge. It still loads from app storage. |
| Edit/cancel | Change text and photo, then discard. Original text, photo, coordinates and parking time remain. Confirm an edit and check only the intended clues change. |
| New/replace | From details choose New parking. Cancel the replacement confirmation, then confirm it. Cancellation keeps the previous record; success shows only the new one. |
| Found/Undo | Found → force-stop → reopen → Undo → reopen. The same record and photo return. A cancelled new draft keeps Undo; a successfully saved new record clears it. |
| Activity destruction | Enable Don't keep activities temporarily. For both new and editing drafts, enter identifiable test text, open the camera and complete/cancel. Confirm the draft and returned photo recover once, and the original record is safe. Restore the setting afterwards. |
| Offline | Disable mobile data/Wi-Fi, then save/read/edit text and photos, Found, Undo and restart. Local functions work. Do not assume GPS necessarily fails without internet. |
| Maps | From a record with GPS, open Maps after moving away. It opens the saved destination. No GPS means no Maps button. App data remains intact if opening fails. |
| Back/keyboard/layout | For replacement, Cancel-triggered discard and hardware-Back-triggered discard confirmations, press Android Back while the dialog is open. Only the dialog closes; the current draft and original record/photo remain unchanged. Also check photo close, camera Back, keyboard scrolling, long clues, smaller display and maximum available font size. Save/Cancel/Undo/Found stay reachable. |
| Button hierarchy / accessibility | Found is the #11804b capsule with a centred check and label; press feedback darkens it. Save remains standard theme green, Maps is outlined, Edit/Cancel are text, New parking is a muted separated entry, and empty state offers Add parking. Busy controls are disabled; screen readers announce each action once and skip decorative icons. Check wrapping/reachability at maximum font size. |
| Permissions | Inspect the final APK merged manifest: no microphone/background-location/album/overlay permissions. Check normal camera/foreground-location prompts. |
| Failure cases | Logic tests cover injected read/copy/write/cleanup errors. Device evidence is additional, not a substitute for those tests. |

Keep exact command/tool output and package fingerprints. Mark each result PASS, FAIL, NOT TESTED or BLOCKED with steps and evidence. Do not record a final release pass while any core package/device check is missing.

User trial feedback, 2026-10-01: the user reported no problems on an Android phone and confirmed the runtime was Expo Go. Individual operations, source revision and evidence were not specified, so the pending checklist rows above have not been converted to PASS. This feedback does not establish independent APK installation or offline cold start.
