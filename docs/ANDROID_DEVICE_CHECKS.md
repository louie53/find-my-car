# Android device checks — pending

Use the final standalone APK and harmless test text/photos. Keep original device evidence in ignored local artifacts/device/; publish only reviewed, redacted images. Do not clear useful parking data to run destructive tests.

Record the executor, local date/time/time zone, phone model, Android version/API, display width/font setting, source commit, build ID, application ID, versionName/versionCode and APK SHA-256. A filename or matching version number alone does not establish source-to-APK correspondence.

All entries below are **NOT TESTED** until evidence is recorded.

| Area | Steps and expected result |
| --- | --- |
| Independent install | Install on Android 10 or newer. Stop Metro, disconnect the development computer and do not use Expo Go. First launch offline and cold-start again. The app opens without a development server. |
| Fresh/normal startup | First installation is empty. Save text, force-stop and reopen; the same record appears. |
| Real location | Allow foreground precision, save parking, move elsewhere, then open/edit the record. It keeps the saved parking position and timestamp. |
| Location failures | Deny permission, disable services, allow approximate location and exercise timeout/retry. Fields remain editable; manual clues save. A late result does not replace saved data. |
| Real camera | Deny, cancel, photograph a harmless sign, retake, remove and enlarge. Check portrait/landscape photos are readable. |
| Photo persistence | Save a real photo, force-stop, reopen and enlarge. It still loads from app storage. |
| Edit/cancel | Change text and photo, then discard. Original text, photo, coordinates and parking time remain. Confirm an edit and check only the intended clues change. |
| New/replace | From details choose Save a new parking spot. Cancel the replacement confirmation, then confirm it. Cancellation keeps the previous record; success shows only the new one. |
| Found/Undo | Found → force-stop → reopen → Undo → reopen. The same record and photo return. A cancelled new draft keeps Undo; a successfully saved new record clears it. |
| Activity destruction | Enable Don't keep activities temporarily. For both new and editing drafts, enter identifiable test text, open the camera and complete/cancel. Confirm the draft and returned photo recover once, and the original record is safe. Restore the setting afterwards. |
| Offline | Disable mobile data/Wi-Fi, then save/read/edit text and photos, Found, Undo and restart. Local functions work. Do not assume GPS necessarily fails without internet. |
| Maps | From a record with GPS, open Maps after moving away. It opens the saved destination. No GPS means no Maps button. App data remains intact if opening fails. |
| Back/keyboard/layout | Check photo close, camera Back, edit/new discard, replacement cancel, keyboard scrolling, long clues, smaller display and maximum available font size. Save/Cancel/Undo/Found stay reachable. |
| Permissions | Inspect the final APK merged manifest: no microphone/background-location/album/overlay permissions. Check normal camera/foreground-location prompts. |
| Failure cases | Logic tests cover injected read/copy/write/cleanup errors. Device evidence is additional, not a substitute for those tests. |

Keep exact command/tool output and package fingerprints. Mark each result PASS, FAIL, NOT TESTED or BLOCKED with steps and evidence. Do not record a final release pass while any core package/device check is missing.
