import assert from 'node:assert/strict';
import test from 'node:test';
import { ParkingController } from '../src/controller/ParkingController';
import { deferred, deviceRig, rig, savedParking, syntheticLocation, tick } from './helpers';

test('late location cannot update a manually saved record', async () => {
  const position = deferred<typeof syntheticLocation>();
  const r = deviceRig({ locate: () => position.promise });
  await r.controller.boot();
  r.controller.begin('new');
  r.controller.setField('zone', 'Manual bay');
  await r.controller.save();
  assert.equal(r.repo.getState().active?.location, null);
  position.resolve(syntheticLocation);
  await tick();
  assert.equal(r.repo.getState().active?.location, null);
  assert.equal(r.controller.getSnapshot().draft, null);
});

test('location retry rejects an older request even if it resolves last', async () => {
  const first = deferred<typeof syntheticLocation>();
  const second = deferred<typeof syntheticLocation>();
  let calls = 0;
  const r = deviceRig({ locate: () => ++calls === 1 ? first.promise : second.promise });
  await r.controller.boot();
  r.controller.begin('new');
  const retry = r.controller.requestLocation();
  second.resolve({ ...syntheticLocation, accuracy: 80 });
  await retry;
  first.resolve({ ...syntheticLocation, latitude: 1 });
  await tick();
  assert.equal(r.repo.getDraft()?.location?.latitude, 0);
  assert.equal(r.repo.getDraft()?.location?.accuracy, 80);
});

test('old location work cannot update a different draft after cancellation', async () => {
  const position = deferred<typeof syntheticLocation>();
  let requests = 0;
  const r = deviceRig({ locate: () => ++requests === 1 ? position.promise : Promise.reject(new Error('No location')) });
  await r.controller.boot();
  r.controller.begin('new');
  await r.controller.cancel();
  r.controller.begin('new');
  r.controller.setField('zone', 'Next bay');
  position.resolve(syntheticLocation);
  await tick();
  assert.equal(r.repo.getDraft()?.location, null);
  await r.controller.cancel();
});

test('location timeout and denial preserve typed clues and allow manual saving', async () => {
  for (const locate of [
    () => new Promise<typeof syntheticLocation>(() => undefined),
    () => Promise.reject(new Error('Permission denied')),
  ]) {
    const r = deviceRig({ locate });
    await r.controller.boot();
    r.controller.begin('new');
    r.controller.setField('level', '3');
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(r.controller.getSnapshot().locationStatus, 'unavailable');
    assert.equal(r.repo.getDraft()?.level, '3');
    await r.controller.save();
    assert.equal(r.repo.getState().active?.level, '3');
  }
});

test('editing never requests a current location', async () => {
  const r = deviceRig();
  const record = await savedParking(r);
  await r.controller.boot();
  r.controller.begin('edit');
  await r.controller.requestLocation();
  assert.equal(r.calls().locationCalls, 0);
  assert.deepEqual(r.repo.getDraft()?.location, record.location);
  await r.controller.cancel();
});

test('camera permission denial and a checkpoint write failure prevent launching the camera', async () => {
  const r = deviceRig();
  await r.controller.boot();
  r.controller.begin('new');
  await tick();
  r.denyCamera();
  await r.controller.capture();
  assert.equal(r.calls().cameraCalls, 0);
  assert.match(r.controller.getSnapshot().error!, /permission/);
  const other = deviceRig();
  await other.controller.boot();
  other.controller.begin('new');
  await tick();
  other.storage.failWrite = true;
  await other.controller.capture();
  assert.equal(other.calls().cameraCalls, 0);
  assert.equal(other.repo.getDraft()?.cameraRequestId, null);
});

test('camera checkpoint precedes the system camera and cancellation preserves text', async () => {
  const r = deviceRig();
  let checkpointSeen = false;
  r.devices.takePhoto = async () => {
    checkpointSeen = Boolean(r.storage.raw && JSON.parse(r.storage.raw).pendingDraft.cameraRequestId);
    return { kind: 'cancelled' };
  };
  await r.controller.boot();
  r.controller.begin('new');
  r.controller.setField('zone', 'Draft bay');
  await r.controller.capture();
  assert.equal(checkpointSeen, true);
  assert.equal(r.repo.getDraft()?.zone, 'Draft bay');
  assert.equal(r.repo.getDraft()?.cameraRequestId, null);
});

test('Android pending camera result restores the text draft and durable photo after restart', async () => {
  const r = deviceRig();
  await r.repo.load();
  r.repo.beginDraft('new');
  r.repo.setFields({ level: '3', zone: 'Recovery bay' });
  await r.repo.prepareCamera();
  const restarted = r.makeRepo();
  const controller = new ParkingController(restarted, { ...r.devices,
    pendingPhoto: async () => ({ kind: 'photo', uri: 'file:///synthetic-pending.jpg' }),
  });
  await controller.boot();
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(restarted.getDraft()?.zone, 'Recovery bay');
  assert.equal(restarted.getDraft()?.cameraRequestId, null);
  assert.ok(restarted.getDraft()?.photo);
  assert.ok(r.photos.files.has(restarted.getDraft()!.photo!));
  await controller.save();
  const cold = r.makeRepo();
  await cold.load();
  assert.equal(cold.getState().active?.zone, 'Recovery bay');
  assert.ok(cold.getState().active?.photo);
});

test('pending camera cancellation restores an editing draft without changing the old record', async () => {
  const r = deviceRig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  r.repo.setFields({ zone: 'Draft bay' });
  await r.repo.prepareCamera();
  const restarted = r.makeRepo();
  const controller = new ParkingController(restarted, r.devices);
  await controller.boot();
  assert.deepEqual(restarted.getState().active, record);
  assert.equal(restarted.getDraft()?.photo, record.photo);
  assert.equal(restarted.getDraft()?.zone, 'Draft bay');
  await controller.cancel();
  assert.deepEqual(restarted.getState().active, record);
});

test('failed camera recovery blocks replacement and cleanup until a retry succeeds', async () => {
  const r = deviceRig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  await r.repo.prepareCamera();
  const restarted = r.makeRepo();
  let fail = true;
  const controller = new ParkingController(restarted, { ...r.devices,
    pendingPhoto: async () => { if (fail) throw new Error('Injected pending camera failure'); return null; },
  });
  await controller.boot();
  assert.equal(controller.getSnapshot().phase, 'blocked');
  const raw = r.storage.raw;
  await controller.save();
  controller.begin('new');
  assert.equal(r.storage.raw, raw);
  assert.ok(r.photos.files.has(record.photo!));
  fail = false;
  await controller.boot();
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.deepEqual(restarted.getState().active, record);
});

test('startup read failure never becomes an empty view; retry returns the saved record', async () => {
  const r = deviceRig();
  const record = await savedParking(r);
  r.storage.failRead = true;
  await r.controller.boot();
  assert.equal(r.controller.getSnapshot().phase, 'blocked');
  assert.equal(r.controller.getSnapshot().state, null);
  r.controller.begin('new');
  await r.controller.found();
  assert.ok(r.photos.files.has(record.photo!));
  r.storage.failRead = false;
  await r.controller.boot();
  assert.deepEqual(r.controller.getSnapshot().state?.active, record);
});

test('duplicate UI taps produce one save and never announce success after a write failure', async () => {
  const r = deviceRig();
  await r.controller.boot();
  r.controller.begin('new');
  r.controller.setField('level', '2');
  const gate = deferred<void>();
  r.storage.beforeWrite = () => gate.promise;
  const first = r.controller.save();
  const second = r.controller.save();
  await tick();
  assert.equal(r.controller.getSnapshot().busy, true);
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(r.storage.writes, 1);
  assert.equal(r.controller.getSnapshot().notice, 'Parking saved.');
  r.controller.begin('edit');
  r.controller.setField('level', '5');
  r.storage.failWrite = true;
  await r.controller.save();
  assert.equal(r.repo.getState().active?.level, '2');
  assert.equal(r.repo.getDraft()?.level, '5');
  assert.equal(r.controller.getSnapshot().notice, null);
  assert.ok(r.controller.getSnapshot().error);
});

test('map opening failure leaves the saved parking record intact', async () => {
  const r = deviceRig({ openMaps: async () => { throw new Error('Maps unavailable'); } });
  const record = await savedParking(r);
  await r.controller.boot();
  await r.controller.openMaps();
  assert.deepEqual(r.repo.getState().active, record);
  assert.equal(r.controller.getSnapshot().error, 'Maps unavailable');
});

test('a UI failure never causes file cleanup when persisted data is invalid', async () => {
  const r = rig();
  r.storage.raw = '{"schemaVersion":1,"revision":0,"active":null,"undo":null,"pendingDraft":{"photo":"../private.jpg"}}';
  r.photos.files.add('photo-old.jpg');
  const devices = deviceRig().devices;
  const controller = new ParkingController(r.repo, devices);
  await controller.boot();
  assert.equal(controller.getSnapshot().phase, 'blocked');
  assert.equal(r.photos.removed.length, 0);
  assert.equal(r.storage.writes, 0);
});
