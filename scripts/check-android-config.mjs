import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const profile = JSON.parse(readFileSync('eas.json', 'utf8')).build.preview;
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const properties = readFileSync('android/gradle.properties', 'utf8');
const effective = [...manifest.matchAll(/<uses-permission\b[^>]*\/>/g)]
  .filter(([tag]) => !/tools:node="remove"/.test(tag))
  .map(([tag]) => tag.match(/android:name="([^"]+)"/)?.[1]);
for (const permission of config.android.blockedPermissions) {
  assert.ok(!effective.includes(permission), 'Blocked permission active in generated manifest: ' + permission);
}
for (const permission of config.android.permissions) assert.ok(effective.includes(permission));
assert.match(manifest, /android:allowBackup="false"/);
assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
assert.match(properties, /^android\.minSdkVersion=29$/m);
assert.equal(config.android.package, 'com.louie53.findmycar');
assert.equal(config.android.versionCode, 1);
assert.equal(config.updates.enabled, false);
assert.equal(profile.android.buildType, 'apk');
assert.equal(profile.developmentClient, false);
console.log('PASS: generated Android permission/removal rules, minimum SDK 29, backup, keyboard and standalone APK profile.');
console.log('Final APK merged manifest and Android device behaviour: NOT TESTED.');
