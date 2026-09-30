# Button implementation and indoor-clue proposal

Date: 2026-09-30, Pacific/Auckland. Button styling is approved and implemented. The indoor-clue guidance below is a recommendation for review, not implemented or approved scope.

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

The current form only shows the no-level disclaimer when location accuracy is non-null. The record's complete indoor disclaimer is inside collapsed finding help. A GPS-only save is valid, but these placements can leave the user without a useful indoor clue. Buildings, indoor/underground use and reflected signals can degrade GPS position accuracy ([GPS.gov](https://www.gps.gov/gps-accuracy)). Reported horizontal accuracy does not establish a parking level; this app has no validated altitude-to-level mapping.

Recommendation: show a calm inline reminder above the save action and an explicit supplement entry on GPS-only records. Keep the current save action available. Do not add a warning dialog, mandatory field, automatic camera launch, tracking or location-derived level guess.

## Display rule

The rule applies when a valid location exists and no usable indoor clue exists:

~~~ts
const hasTextClue = Boolean(level.trim() || zone.trim() || landmark.trim());
const needsIndoorClue = Boolean(location) && !hasTextClue && !usablePhoto;
~~~

Accuracy is excluded: both 5 m and accuracy:null qualify. A whitespace-only field is empty. Any non-empty trimmed level, zone/bay or landmark, or a usable saved/copied photo, removes the reminder. usablePhoto means the existing photo path has successfully completed the app's copy/read/display checks; a pending, cancelled, failed-copy or known missing/unreadable photo must not count as success. Preserve existing photo errors and references, and offer retake/remove without automatically deleting data. Implementation must resolve this presentation status from existing photo checks before treating a photo as usable.

## Exact proposed copy and entry points

| Place and timing | Copy | Entry and effect |
| --- | --- | --- |
| New draft, directly above Save parking once needsIndoorClue becomes true | **GPS saves the area, but cannot identify a car park level. Add a level or photograph a sign before you leave.** Secondary line: **You can still save just the location.** | **Add a level** scrolls to and focuses the existing Level input on explicit tap. **Add a photo** invokes the existing camera/checkpoint flow on explicit tap. Save parking retains the existing behaviour and label. |
| Record with needsIndoorClue, near the record card before the Maps area | **GPS saves an approximate area, but cannot identify a car park level. Add a remembered level, bay or landmark.** | **Add parking clues** opens the existing edit draft. It does not request a new position or auto-launch the camera. Keep any existing unavailable-photo error visible; do not imply a saved but missing photo was never saved. |
| GPS-only edit draft, above Save changes | **Remember a level, bay or landmark? Add it here. Your saved parking position stays the same.** | Existing fields and camera actions. For photo guidance: **Only add a photo if it shows where you parked.** Save changes and Cancel keep their current semantics. |

The new-draft reminder appears with the first usable coordinate, and persists through a failed retry if the previous coordinate is retained. It disappears or returns as clues are added or removed. Avoid automatic focus, repeated announcements or modal interruptions; keep concise text available to screen readers. Edits preserve the record's original position and time. Do not infer whether the user has left the car park: the edit copy supports remembered clues and avoids suggesting a photo of the user's new location.

## Boundary cases and proposed acceptance

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

The existing hasClues rule should continue allowing a location-only save. findingSteps should continue using saved clues; if this proposal is implemented later, align its text predicates with trim checks so historical whitespace does not produce empty finding steps. Keep the GPS-only Maps fallback. Targeted behavioural checks would cover reminder predicates, accuracy:null, whitespace and photo failure; real UI checks would cover focus/scroll, edit cancellation and maximum-font reachability.

No indoor-guidance implementation is included in this button commit. Review the copy, usable-photo handling and layout before approving that next change.
