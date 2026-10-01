import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const config = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const profile = JSON.parse(readFileSync('eas.json', 'utf8')).build.preview;
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const properties = readFileSync('android/gradle.properties', 'utf8');
const gradle = readFileSync('android/app/build.gradle', 'utf8');
const packageInfo = JSON.parse(readFileSync('package.json', 'utf8'));
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
assert.ok(Number.isSafeInteger(config.android.versionCode) && config.android.versionCode > 0);
assert.equal(config.version, packageInfo.version);
assert.equal(Number(gradle.match(/^\s*versionCode\s+(\d+)/m)?.[1]), config.android.versionCode);
assert.equal(gradle.match(/^\s*versionName\s+"([^"]+)"/m)?.[1], config.version);
assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
for (const name of ['ic_launcher', 'ic_launcher_round']) {
  const icon = readFileSync('android/app/src/main/res/mipmap-anydpi-v26/' + name + '.xml', 'utf8');
  assert.match(icon, /<background\s+android:drawable="@color\/iconBackground"/);
  assert.match(icon, /<foreground\s+android:drawable="@mipmap\/ic_launcher_foreground"/);
  assert.match(icon, /<monochrome\s+android:drawable="@mipmap\/ic_launcher_monochrome"/);
}
const colors = readFileSync('android/app/src/main/res/values/colors.xml', 'utf8');
const iconBackground = colors.match(/<color name="iconBackground">([^<]+)<\/color>/)?.[1];
assert.equal(iconBackground?.toLowerCase(), config.android.adaptiveIcon.backgroundColor.toLowerCase());
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  for (const layer of ['foreground', 'monochrome']) {
    assert.ok(statSync('android/app/src/main/res/mipmap-' + density + '/ic_launcher_' + layer + '.webp').size > 0);
  }
}
assert.equal(config.updates.enabled, false);
assert.equal(profile.android.buildType, 'apk');
assert.equal(profile.developmentClient, false);
console.log('PASS: generated Android version, adaptive/monochrome icon resources, permissions, minimum SDK 29, backup, keyboard and APK profile.');
console.log('This check inspects generated native files; final APK inspection and device checks are separate.');
