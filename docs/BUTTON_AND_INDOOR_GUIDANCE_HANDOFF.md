# Button implementation and indoor-clue proposal

Updated: 2026-10-01, Pacific/Auckland. Button styling is implemented. The user approved the indoor-clue guidance and requested independent acceptance; it is now implemented in this candidate.

## Implemented button hierarchy

The approved emerald-pill preview was applied to the existing React Native controls, without copying its example data or simplified handlers.

| Action | Implemented presentation | Behaviour retained |
| --- | --- | --- |
| Save parking / Save changes | Theme green #2f694f, white centred text, 14-point radius | Existing save, replacement confirmation and busy disable |
| Found my car | #11804b solid capsule, centred white check and text, minimum height 54, subtle native shadow; pressed #0c693d with a 1-point downward shift and reduced shadow | Existing Found transaction and Undo; consequence caption remains |
| Open in Maps | Full-width theme-green outline | Opens only the saved position through the existing handler |
| Edit / Cancel | Text buttons | Existing editor and cancellable discard confirmation |
| New parking | Plus and muted text below the Found caption in a separated area | Existing new draft; replacement is confirmed only on save |
| Add parking | Empty-state primary button with plus | Existing new-draft handler; does not commit a record |

Minimum heights allow content to grow; labels can shrink within the row and wrap. Button roles, labels, disabled accessibility state and busy guards remain. Decorative icons are hidden from assistive technology. The three confirmations still pass cancelable:true and have no dismissal data action. Controller, repository, native services, permissions and dependencies were not changed.

Type checking, lint, 49 existing tests, Android Hermes export and the actual three-call/five-case F01 adapter probe passed. The first typecheck caught the explicit undefined icon used while busy; the optional prop type was corrected and the failed attempt was retained locally. An actual iPhone 17 iOS Expo Go screenshot shows the record-page hierarchy, with Found, Maps, Edit and New parking visible. The floating gear is Expo Go tooling. This is not Android, standalone APK, pressed-state, screen-reader or maximum-font acceptance. Other states still require visual checks.

## Why an indoor reminder is useful

Before this change, the form's no-level disclaimer appeared only when location accuracy was non-null, and the record's full indoor disclaimer was inside collapsed finding help. A GPS-only save is valid, but these placements could leave the user without a useful indoor clue. Buildings, indoor/underground use and reflected signals can degrade GPS position accuracy ([GPS.gov](https://www.gps.gov/gps-accuracy)). Reported horizontal accuracy does not establish a parking level; this app has no validated altitude-to-level mapping.

Implemented: a calm inline reminder above the save action and an explicit supplement entry on records without usable indoor clues. The current save action remains available. No new warning dialog, mandatory field, automatic camera launch, tracking or location-derived level guess was added.

## Display rule

The rule applies when a valid location exists and no usable indoor clue exists:

~~~ts
const hasTextClue = Boolean(level.trim() || zone.trim() || landmark.trim());
const needsIndoorClue = Boolean(location) && !hasTextClue && !usablePhoto;
~~~

Accuracy is excluded: both 5 m and accuracy:null qualify. A whitespace-only field is empty. Any non-empty trimmed level, zone/bay or landmark, or a usable saved/copied photo, removes the reminder. Photo usability requires both photos.exists(filename) and Image onLoad; a pending check, failed copy, missing file or decode error cannot count as success. Photo components are keyed by URI, cancel file-check updates on unmount and keep decoding failure sticky against late onLoad. The parent compares availability with the current URI; same reports bail out. References and existing errors remain, with retake/remove available. Cancelling a retake preserves the current keyed photo and its status.

## Implemented copy and entry points

| Place and timing | Copy | Entry and effect |
| --- | --- | --- |
| New draft, directly above Save parking once needsIndoorClue becomes true | Title: **Add a clue for indoor parking**. **GPS saves the area, but cannot identify a car park level. Add a level or photograph a sign before you leave.** Secondary line: **You can still save just the location.** | **Add a level** scrolls to and focuses the existing Level input on explicit tap. **Add a photo** invokes the existing camera/checkpoint flow after dismissing the keyboard; if an unusable photo remains referenced, the action is **Retake photo**. Save parking retains the existing behaviour and label. |
| Record with needsIndoorClue, near the record card before the Maps area | **GPS saves an approximate area, but cannot identify a car park level. Add a remembered level, bay or landmark.** | **Add parking clues** opens the existing edit draft. It does not request a new position or auto-launch the camera. Keep any existing unavailable-photo error visible; do not imply a saved but missing photo was never saved. |
| GPS-only edit draft, above Save changes | **Remember a level, bay or landmark? Add it here. Your saved parking position stays the same.** | Add a level and Add a photo/Retake photo reuse the same existing fields and camera flow. For photo guidance: **Only add a photo if it shows where you parked.** Save changes and Cancel keep their current semantics. |

The new-draft reminder appears with the first usable coordinate, and persists through a failed retry if the previous coordinate is retained. It disappears or returns as clues are added or removed. Avoid automatic focus, repeated announcements or modal interruptions; keep concise text available to screen readers. Edits preserve the record's original position and time. Do not infer whether the user has left the car park: the edit copy supports remembered clues and avoids suggesting a photo of the user's new location.

## Boundary cases and acceptance checks

| Case | Expected behaviour |
| --- | --- |
| No GPS, valid manual text/photo | Continue existing manual save without this GPS-only reminder. An entirely empty draft retains existing validation. |
| Accuracy absent or unusually good | Reminder depends on saved clues, never accuracy, altitude or a guessed level. |
| Whitespace text | Does not count as a clue; the reminder remains. Normal save still trims fields. |
| Valid clue added/removed | Reminder disappears/returns without affecting coordinates, photo ownership or storage. |
| Photo cancel, failed copy or unavailable image | Keep error/recovery/retake controls; do not remove the reminder as if a valid photo was added, and do not delete the old reference. |
| New draft replacing an existing record | Assess only the new draft; do not borrow the previous record's clues. Keep the replacement confirmation and original record until commit succeeds. |
| Edit cancelled, dialog dismissed or Back pressed | Keep original text/photo/coordinates/time. The original GPS-only reminder remains if that record still lacks clues. |
| Found / Undo, restart | Use the restored record's own clues; retain existing transaction and persistence guarantees. |
| Narrow screen / large fonts / keyboard | Use vertically flowing text and wrapping actions, no fixed reminder height; Save stays reachable in the existing scroll view. Verify visually before acceptance. |
| Location request still running | Keep its existing progress display. Saving usable manual clues remains available; retain the current generation isolation so the late location cannot update the saved record. |
| Camera or persistence transaction busy | Keep the existing busy/disabled state; never enable duplicate device or save actions. |

The existing hasClues rule still allows a location-only save. hasIndoorClue/needsIndoorClue derive only presentation guidance; they perform no writes. findingSteps now trims text and receives the current photo usability from the UI, skipping unavailable-photo comparison and preserving the GPS-only Maps fallback. Record labels also treat whitespace as empty. Repository, controller, native services, permissions, schema and dependencies are unchanged.

Development checks: typecheck, lint and 67 tests PASS (49 existing + 18 new behaviour cases), Android Hermes export PASS, three actual F01 calls/five cases PASS, and an actual-TSX hook/element probe with 12 photo/shortcut scenarios PASS. The main developer inspected and reran the probes. Native image events, keyboard scrolling, maximum-font reachability and Android behaviour are not established by those JS probes. The current iOS Expo Go empty screen was captured after resolving a localhost IPv6/IPv4 development-server mismatch; GPS-only form/record interaction screenshots are still pending independent UI verification. No app data was cleared and no demo record was added to production source.

Quick floor chips are deferred because different car parks use different labels; free text remains. No OCR, altitude inference, new permission or service was added. The completed source candidate, evidence hashes, local Metro route and independent review request are recorded in DEVELOPMENT_STATUS.md and ignored artifacts/validation-run.json.
