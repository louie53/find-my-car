import assert from 'node:assert/strict';
import test from 'node:test';
import { LocationError } from '../src/domain/location';
import { deferred, deviceRig, savedParking, syntheticLocation, tick } from './helpers';

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function cleanUp(r: ReturnType<typeof deviceRig>, release: (() => void)[] = []) {
  // Freeze any outstanding request before releasing its synthetic device work.
  await r.controller.cancel();
  for (const resolve of release) resolve();
  await tick();
}

test('location settings are required only for a classified permission error', () => {
  const cause = new Error('Synthetic native failure');
  for (const reason of ['permission', 'services', 'unavailable', 'invalid'] as const) {
    const error = new LocationError(reason, 'A location request failed', cause);
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'A location request failed');
    assert.equal(error.cause, cause);
    assert.equal(error.settingsRequired, reason === 'permission');
  }
  assert.equal(new LocationError('unavailable', 'Permission was granted but no position was found').settingsRequired, false);
});

test('waiting for permission does not consume the GPS deadline or prevent typing', async () => {
  const permission = deferred<void>();
  const r = deviceRig({ requestLocationPermission: () => permission.promise });
  try {
    await r.controller.boot();
    r.controller.begin('new');
    r.controller.setField('zone', 'Manual bay');
    await wait(50); // deviceRig uses a 25 ms GPS deadline.
    const waiting = r.controller.getSnapshot();
    assert.equal(waiting.locationStatus, 'loading');
    assert.equal(waiting.locationSettingsRequired, false);
    assert.equal(waiting.busy, false);
    assert.equal(waiting.draft?.zone, 'Manual bay');
    assert.equal(r.calls().locationCalls, 0);
    permission.resolve();
    await tick();
    assert.equal(r.calls().locationCalls, 1);
    assert.equal(r.controller.getSnapshot().locationStatus, 'available');
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    assert.deepEqual(r.repo.getDraft()?.location, syntheticLocation);
    assert.equal(r.repo.getDraft()?.zone, 'Manual bay');
  } finally {
    await cleanUp(r, [() => permission.resolve()]);
  }
});

test('permission denial suggests settings and preserves the draft and saved original', async () => {
  const r = deviceRig({ requestLocationPermission: async () => { throw new LocationError('permission', 'Location access was denied'); } });
  const original = structuredClone(await savedParking(r));
  const originalRaw = r.storage.raw;
  try {
    await r.controller.boot();
    r.controller.begin('new');
    r.controller.setField('zone', 'Current draft');
    await tick();
    const failed = r.controller.getSnapshot();
    assert.equal(failed.locationStatus, 'unavailable');
    assert.equal(failed.locationSettingsRequired, true);
    assert.equal(failed.draft?.zone, 'Current draft');
    assert.equal(failed.draft?.location, null);
    assert.deepEqual(failed.state?.active, original);
    assert.equal(r.calls().locationCalls, 0);
    assert.equal(r.storage.raw, originalRaw);
    assert.ok(r.photos.files.has(original.photo!));
    await r.controller.cancel();
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    r.controller.begin('edit');
    assert.equal(r.controller.getSnapshot().locationStatus, 'preserved');
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    assert.deepEqual(r.repo.getDraft()?.location, original.location);
  } finally {
    await cleanUp(r);
  }
});

for (const reason of ['services', 'unavailable', 'invalid'] as const) {
  test(`an authorised ${reason} failure permits manual saving without suggesting permission settings`, async () => {
    let permissionCalls = 0;
    const r = deviceRig({
      requestLocationPermission: async () => { permissionCalls++; },
      locate: async () => { throw new LocationError(reason, 'No usable position is available'); },
    });
    try {
      await r.controller.boot();
      r.controller.begin('new');
      r.controller.setField('landmark', 'By the test lift');
      await tick();
      assert.equal(permissionCalls, 1);
      assert.equal(r.controller.getSnapshot().locationStatus, 'unavailable');
      assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
      assert.equal(r.repo.getDraft()?.landmark, 'By the test lift');
      await r.controller.save();
      assert.equal(r.repo.getState().active?.landmark, 'By the test lift');
      assert.equal(r.repo.getState().active?.location, null);
      assert.equal(r.controller.getSnapshot().error, null);
      assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    } finally {
      await cleanUp(r);
    }
  });
}

test('the GPS deadline starts after permission and its timeout still permits manual saving', async () => {
  const permission = deferred<void>();
  const position = deferred<typeof syntheticLocation>();
  let locationCalls = 0;
  const r = deviceRig({
    requestLocationPermission: () => permission.promise,
    locate: () => { locationCalls++; return position.promise; },
  });
  try {
    await r.controller.boot();
    r.controller.begin('new');
    r.controller.setField('level', '3');
    assert.equal(locationCalls, 0);
    permission.resolve();
    await tick();
    assert.equal(locationCalls, 1);
    assert.equal(r.controller.getSnapshot().locationStatus, 'loading');
    await wait(50);
    assert.equal(r.controller.getSnapshot().locationStatus, 'unavailable');
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    assert.equal(r.repo.getDraft()?.level, '3');
    await r.controller.save();
    const manual = structuredClone(r.repo.getState().active);
    assert.equal(manual?.level, '3');
    assert.equal(manual?.location, null);
    position.resolve(syntheticLocation);
    await tick();
    assert.deepEqual(r.repo.getState().active, manual);
  } finally {
    await cleanUp(r, [() => permission.resolve(), () => position.resolve(syntheticLocation)]);
  }
});

test('retrying after permission denial clears settings and uses a subsequently authorised position', async () => {
  let granted = false;
  let permissionCalls = 0;
  const r = deviceRig({ requestLocationPermission: async () => {
    permissionCalls++;
    if (!granted) throw new LocationError('permission', 'Location access was denied');
  } });
  try {
    await r.controller.boot();
    r.controller.begin('new');
    r.controller.setField('zone', 'Retried bay');
    await tick();
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, true);
    assert.equal(r.calls().locationCalls, 0);
    granted = true;
    const retry = r.controller.requestLocation();
    assert.equal(r.controller.getSnapshot().locationStatus, 'loading');
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    await retry;
    assert.equal(permissionCalls, 2);
    assert.equal(r.calls().locationCalls, 1);
    assert.equal(r.controller.getSnapshot().locationStatus, 'available');
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    assert.equal(r.repo.getDraft()?.zone, 'Retried bay');
    assert.deepEqual(r.repo.getDraft()?.location, syntheticLocation);
  } finally {
    await cleanUp(r);
  }
});

test('manual save during permission waiting ignores a late grant before starting GPS', async () => {
  const permission = deferred<void>();
  const r = deviceRig({ requestLocationPermission: () => permission.promise });
  try {
    await r.controller.boot();
    r.controller.begin('new');
    r.controller.setField('zone', 'Saved manually');
    await r.controller.save();
    const manual = structuredClone(r.repo.getState().active);
    const raw = r.storage.raw;
    assert.equal(manual?.zone, 'Saved manually');
    assert.equal(manual?.location, null);
    assert.equal(r.controller.getSnapshot().draft, null);
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    permission.resolve();
    await tick();
    assert.equal(r.calls().locationCalls, 0);
    assert.deepEqual(r.repo.getState().active, manual);
    assert.equal(r.storage.raw, raw);
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
  } finally {
    await cleanUp(r, [() => permission.resolve()]);
  }
});

test('cancel during permission waiting ignores a late grant and keeps the original record', async () => {
  const permission = deferred<void>();
  const r = deviceRig({ requestLocationPermission: () => permission.promise });
  const original = structuredClone(await savedParking(r));
  const raw = r.storage.raw;
  try {
    await r.controller.boot();
    r.controller.begin('new');
    r.controller.setField('level', '9');
    await r.controller.cancel();
    const cancelled = r.controller.getSnapshot();
    assert.equal(cancelled.draft, null);
    assert.equal(cancelled.locationSettingsRequired, false);
    permission.resolve();
    await tick();
    assert.equal(r.calls().locationCalls, 0);
    assert.deepEqual(r.controller.getSnapshot(), cancelled);
    assert.deepEqual(r.repo.getState().active, original);
    assert.equal(r.storage.raw, raw);
    assert.ok(r.photos.files.has(original.photo!));
  } finally {
    await cleanUp(r, [() => permission.resolve()]);
  }
});

test('an old permission grant cannot start GPS or populate a different waiting draft', async () => {
  const first = deferred<void>();
  const second = deferred<void>();
  let permissionCalls = 0;
  const r = deviceRig({ requestLocationPermission: () => ++permissionCalls === 1 ? first.promise : second.promise });
  try {
    await r.controller.boot();
    r.controller.begin('new');
    const firstId = r.repo.getDraft()!.id;
    await r.controller.cancel();
    r.controller.begin('new');
    r.controller.setField('zone', 'Second draft');
    assert.notEqual(r.repo.getDraft()?.id, firstId);
    first.resolve();
    await tick();
    assert.equal(r.calls().locationCalls, 0);
    assert.equal(r.repo.getDraft()?.location, null);
    assert.equal(r.repo.getDraft()?.zone, 'Second draft');
    assert.equal(r.controller.getSnapshot().locationStatus, 'loading');
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    second.resolve();
    await tick();
    assert.equal(r.calls().locationCalls, 1);
    assert.equal(r.controller.getSnapshot().locationStatus, 'available');
    assert.deepEqual(r.repo.getDraft()?.location, syntheticLocation);
    assert.equal(r.repo.getDraft()?.zone, 'Second draft');
  } finally {
    await cleanUp(r, [() => first.resolve(), () => second.resolve()]);
  }
});

test('failed permission and GPS retries retain a position already captured in the draft', async () => {
  const savedPosition = { ...syntheticLocation, latitude: 3, accuracy: 0 };
  let permissionGranted = true;
  let servicesAvailable = true;
  const r = deviceRig({
    requestLocationPermission: async () => {
      if (!permissionGranted) throw new LocationError('permission', 'Location access was denied');
    },
    locate: async () => {
      if (!servicesAvailable) throw new LocationError('services', 'Location services are disabled');
      return savedPosition;
    },
  });
  try {
    await r.controller.boot();
    r.controller.begin('new');
    r.controller.setField('zone', 'Keep this position');
    await tick();
    assert.deepEqual(r.repo.getDraft()?.location, savedPosition);
    permissionGranted = false;
    await r.controller.requestLocation();
    assert.equal(r.controller.getSnapshot().locationStatus, 'unavailable');
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, true);
    assert.deepEqual(r.repo.getDraft()?.location, savedPosition);
    permissionGranted = true;
    servicesAvailable = false;
    await r.controller.requestLocation();
    assert.equal(r.controller.getSnapshot().locationStatus, 'unavailable');
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    assert.deepEqual(r.repo.getDraft()?.location, savedPosition);
    await r.controller.save();
    assert.deepEqual(r.repo.getState().active?.location, savedPosition);
    assert.equal(r.repo.getState().active?.zone, 'Keep this position');
  } finally {
    await cleanUp(r);
  }
});

test('manual saving after permission denial clears the stale settings suggestion', async () => {
  const r = deviceRig({ requestLocationPermission: async () => { throw new LocationError('permission', 'Location access was denied'); } });
  try {
    await r.controller.boot();
    r.controller.begin('new');
    r.controller.setField('landmark', 'By the stairs');
    await tick();
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, true);
    await r.controller.save();
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    assert.equal(r.controller.getSnapshot().draft, null);
    assert.equal(r.repo.getState().active?.landmark, 'By the stairs');
    assert.equal(r.repo.getState().active?.location, null);
  } finally {
    await cleanUp(r);
  }
});

test('editing never requests permission or GPS and keeps the original parking position', async () => {
  let permissionCalls = 0;
  const r = deviceRig({ requestLocationPermission: async () => { permissionCalls++; } });
  const original = structuredClone(await savedParking(r));
  try {
    await r.controller.boot();
    r.controller.begin('edit');
    r.controller.setField('landmark', 'Updated indoor clue');
    await r.controller.requestLocation();
    assert.equal(permissionCalls, 0);
    assert.equal(r.calls().locationCalls, 0);
    assert.equal(r.controller.getSnapshot().locationStatus, 'preserved');
    assert.equal(r.controller.getSnapshot().locationSettingsRequired, false);
    assert.deepEqual(r.repo.getDraft()?.location, original.location);
    assert.equal(r.repo.getDraft()?.landmark, 'Updated indoor clue');
    assert.deepEqual(r.repo.getState().active, original);
  } finally {
    await cleanUp(r);
  }
});
