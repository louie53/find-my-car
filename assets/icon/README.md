# Find My Car icon

Original vector artwork: a white car inside a location marker, using the app's green `#2f694f`.

- `icon.svg` / `icon.png`: full square launcher/store image, 1024 × 1024, opaque green background. The system applies its own mask.
- `foreground.svg` / `foreground.png`: transparent adaptive foreground, 1024 × 1024. The mark stays inside the central Android safe area; no baked-in mask or shadow.
- `monochrome.png`: the same transparent white mark for Android themed icons. Windows and headlights are transparent cutouts, so they work with system tinting.

PNG files were exported directly from the vector source. Keep SVG and PNG versions in sync when changing the artwork. Android foreground/background/monochrome settings are in `app.json`; a new APK build is required after an icon change.
