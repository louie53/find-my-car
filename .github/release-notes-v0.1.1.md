A custom app icon for Find My Car: a white car inside a location marker on the app's green background. Includes Android adaptive and monochrome themed icons.

- Version **0.1.1**, Android **versionCode 2**; Android 10 or later.
- README now includes the icon and accurate download/validation information.
- Parking behaviour, saved-data format, permissions and dependency versions are unchanged.

Download **find-my-car-v0.1.1-android.apk** from Assets below. Expo Go is not required. The previous **v0.1.0** release remains available.

## Build and checks

Source commit: `cecef1e0b1f7f90026442bc57991a9f131451de5`. Built from a clean working tree using the existing EAS preview profile and signing configuration. EAS build: [c1148c94-aeb3-4138-944d-bf96feafd875](https://expo.dev/accounts/louieliu/projects/find-my-car/builds/c1148c94-aeb3-4138-944d-bf96feafd875).

Fresh typecheck, lint, 81 tests and Android JS export passed. [Source CI passed](https://github.com/louie53/find-my-car/actions/runs/36848408907). Generated version and adaptive/monochrome resources passed inspection. Icon previews were checked at 48px with circular, rounded and themed masks; the transparent mark stays in Android's safe area.

Final APK inspected offline: version 0.1.1 / code 2, package `com.louie53.findmycar`, min SDK 29, unchanged permissions and backup disabled. All 11 embedded configuration fields match the source. Both adaptive XMLs and 20 packaged icon bitmap resources match the generated resources. APK v2 signature and content digests passed offline verification; the signing certificate matches v0.1.0. This is not a device installation or upgrade test.

APK size: **84,678,926 bytes**. SHA-256: `cfd930894191fed15cbb9e5098859eedbceca817075a15705e08331bcc1f7cdc`. `SHA256SUMS.txt` is included in Assets.

Independent acceptance **AR-v9 passed source/configuration/icon checks**. Physical-device acceptance remains separate. Standalone installation, launcher appearance and phone behaviour have not been independently verified in this update.
