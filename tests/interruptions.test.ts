import assert from 'node:assert/strict';
import test from 'node:test';
import { ParkingController } from '../src/controller/ParkingController';
import { emptyState, parseState } from '../src/domain/parking';
import { deferred, deviceRig, rig, savedParking, syntheticLocation, tick } from './helpers';

test('each individual manual clue, a valid photo or location is sufficient', async () => {
  for (const field of ['level', 'zone', 'landmark'] as const) {
    const r = rig();
    await r.repo.load();
    r.repo.beginDraft('new');
    r.repo.setFields({ [field]: 'Single clue' });
    await r.repo.save();
    assert.equal(r.repo.getState().active?.[field], 'Single clue');
  }
  const r = rig();
  await r.repo.load();
  r.repo.beginDraft('new');
  const request = await r.repo.prepareCamera();
  await r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-photo-only.jpg' });
  await r.repo.save();
  assert.ok(r.repo.getState().active?.photo);
  assert.equal(r.repo.getState().active?.level, '');
});

test('restart after copying but before metadata commit retains the original record/photo', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  r.repo.setFields({ zone: 'Before-camera clue' });
  const request = await r.repo.prepareCamera();
  r.storage.failWrite = true;
  await assert.rejects(r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-interrupted.jpg' }));
  const interruptedPhoto = r.repo.getDraft()!.photo!;
  r.storage.failWrite = false;
  const cold = r.makeRepo();
  await cold.load();
  assert.deepEqual(cold.getState().active, record);
  assert.equal(cold.getDraft()?.zone, 'Before-camera clue');
  assert.equal(cold.getDraft()?.photo, record.photo);
  assert.ok(r.photos.files.has(record.photo!));
  assert.ok(r.photos.files.has(interruptedPhoto));
  assert.deepEqual(r.photos.removed, []);
});

for (const mode of ['new', 'edit'] as const) {
  test(mode + ' camera recovery survives a consumed pending result, failed write and second cold start', async () => {
    const r = deviceRig();
    const record = await savedParking(r);
    if (mode === 'new') await r.repo.found();
    r.repo.beginDraft(mode);
    r.repo.setFields({ zone: 'Recovered after two starts' });
    const request = await r.repo.prepareCamera();
    let pendingCalls = 0;
    const devices = { ...r.devices,
      pendingPhoto: async () => ++pendingCalls === 1
        ? { kind: 'photo' as const, uri: 'file:///synthetic-one-shot-result.jpg' }
        : null,
    };

    r.storage.failWrite = true;
    const firstRepo = r.makeRepo();
    const first = new ParkingController(firstRepo, devices);
    await first.boot();
    assert.equal(first.getSnapshot().phase, 'ready');
    assert.ok(first.getSnapshot().error);
    const copiedPhoto = firstRepo.getDraft()!.photo!;
    assert.notEqual(copiedPhoto, record.photo);
    assert.ok(r.photos.files.has(copiedPhoto));
    assert.equal(parseState(r.storage.raw).pendingDraft?.cameraRequestId, request);
    assert.deepEqual(firstRepo.getState()[mode === 'new' ? 'undo' : 'active'], record);
    const copiesBeforeRestart = r.events.filter((event) => event === 'copy').length;

    r.storage.failWrite = false;
    const secondRepo = r.makeRepo();
    const second = new ParkingController(secondRepo, devices);
    await second.boot();
    assert.equal(second.getSnapshot().phase, 'ready');
    assert.equal(second.getSnapshot().error, null);
    assert.equal(secondRepo.getDraft()?.zone, 'Recovered after two starts');
    assert.equal(secondRepo.getDraft()?.photo, copiedPhoto);
    assert.equal(secondRepo.getDraft()?.cameraRequestId, null);
    assert.equal(pendingCalls, 1, 'completed local copy must recover without consuming another native result');
    assert.equal(r.events.filter((event) => event === 'copy').length, copiesBeforeRestart);
    assert.deepEqual(secondRepo.getState()[mode === 'new' ? 'undo' : 'active'], record);
    assert.ok(r.photos.files.has(record.photo!));
    assert.deepEqual(r.photos.removed, []);

    await second.save();
    const thirdRepo = r.makeRepo();
    await thirdRepo.load();
    assert.equal(thirdRepo.getState().active?.photo, copiedPhoto);
    assert.equal(thirdRepo.getState().active?.zone, 'Recovered after two starts');
    assert.equal(thirdRepo.getState().undo, null);
    assert.ok(r.photos.files.has(copiedPhoto));
    if (mode === 'edit') {
      assert.equal(thirdRepo.getState().active?.savedAt, record.savedAt);
      assert.deepEqual(thirdRepo.getState().active?.location, record.location);
    }
  });
}

test('restart after record commit but before successful cleanup keeps the new photo', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  const request = await r.repo.prepareCamera();
  await r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-new.jpg' });
  const newPhoto = r.repo.getDraft()!.photo!;
  r.photos.failRemove = true;
  await r.repo.save();
  const cold = r.makeRepo();
  await cold.load();
  assert.equal(cold.getState().active?.photo, newPhoto);
  assert.ok(r.photos.files.has(newPhoto));
  assert.ok(r.photos.files.has(record.photo!));
});

test('Undo survives cancellation after a new camera draft and a cold restart', async () => {
  const r = rig();
  const record = await savedParking(r);
  await r.repo.found();
  r.repo.beginDraft('new');
  r.repo.setFields({ zone: 'Cancelled new parking' });
  const request = await r.repo.prepareCamera();
  await r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-cancelled.jpg' });
  const discardedPhoto = r.repo.getDraft()!.photo!;
  await r.repo.cancelDraft();
  const cold = r.makeRepo();
  await cold.load();
  assert.deepEqual(cold.getState().undo, record);
  assert.ok(r.photos.files.has(record.photo!));
  assert.ok(!r.photos.files.has(discardedPhoto));
  await cold.undo();
  assert.deepEqual(cold.getState().active, record);
});

test('late location failure cannot override a newer successful retry', async () => {
  const old = deferred<typeof syntheticLocation>();
  let calls = 0;
  const r = deviceRig({ locate: () => ++calls === 1 ? old.promise : Promise.resolve(syntheticLocation) });
  await r.controller.boot();
  r.controller.begin('new');
  await r.controller.requestLocation();
  old.reject(new Error('Old request failed'));
  await tick();
  assert.equal(r.controller.getSnapshot().locationStatus, 'available');
  assert.deepEqual(r.repo.getDraft()?.location, syntheticLocation);
  await r.controller.cancel();
});

test('a timed-out location result cannot later populate the parking form', async () => {
  const result = deferred<typeof syntheticLocation>();
  const r = deviceRig({ locate: () => result.promise });
  await r.controller.boot();
  r.controller.begin('new');
  r.controller.setField('zone', 'Timeout bay');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(r.controller.getSnapshot().locationStatus, 'unavailable');
  result.resolve(syntheticLocation);
  await tick();
  assert.equal(r.repo.getDraft()?.location, null);
  await r.controller.save();
  assert.equal(r.repo.getState().active?.location, null);
});

test('a camera return ignores the location callback frozen before Activity launch', async () => {
  const position = deferred<typeof syntheticLocation>();
  const r = deviceRig({ locate: () => position.promise });
  await r.controller.boot();
  r.controller.begin('new');
  r.controller.setField('zone', 'Camera bay');
  await r.controller.capture();
  position.resolve(syntheticLocation);
  await tick();
  assert.equal(r.repo.getDraft()?.location, null);
  assert.ok(r.repo.getDraft()?.photo);
  await r.controller.save();
});

test('a recovered camera result is not replayed on a second startup or another draft', async () => {
  const r = deviceRig();
  await r.repo.load();
  r.repo.beginDraft('new');
  r.repo.setFields({ zone: 'Recovery once' });
  await r.repo.prepareCamera();
  let consumed = 0;
  const cold = r.makeRepo();
  const controller = new ParkingController(cold, { ...r.devices,
    pendingPhoto: async () => { consumed++; return { kind: 'photo', uri: 'file:///synthetic-once.jpg' }; },
  });
  await controller.boot();
  const photo = cold.getDraft()!.photo;
  await controller.boot();
  assert.equal(consumed, 1);
  assert.equal(cold.getDraft()?.photo, photo);
  await controller.cancel();
  controller.begin('new');
  assert.equal(cold.getDraft()?.photo, null);
  await controller.cancel();
});

test('recovered camera errors preserve the original record and allow editing to continue', async () => {
  const r = deviceRig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  r.repo.setFields({ landmark: 'Recovered clue' });
  await r.repo.prepareCamera();
  const cold = r.makeRepo();
  const controller = new ParkingController(cold, { ...r.devices,
    pendingPhoto: async () => ({ kind: 'error', message: 'Test camera error' }),
  });
  await controller.boot();
  assert.equal(controller.getSnapshot().phase, 'ready');
  assert.equal(controller.getSnapshot().error, 'Test camera error');
  assert.equal(cold.getDraft()?.cameraRequestId, null);
  assert.equal(cold.getDraft()?.landmark, 'Recovered clue');
  assert.deepEqual(cold.getState().active, record);
});

test('invalid coordinates and conflicting active/Undo data block boot without cleaning', async () => {
  const r = rig();
  const record = await savedParking(r);
  for (const value of [
    { ...emptyState(), active: { ...record, location: { ...syntheticLocation, latitude: 100 } } },
    { ...emptyState(), active: record, undo: record },
    { ...emptyState(), active: { ...record, photo: '../private.jpg' } },
  ]) {
    const raw = JSON.stringify(value);
    assert.throws(() => parseState(raw));
    r.storage.raw = raw;
    const cold = r.makeRepo();
    await assert.rejects(cold.load());
    assert.equal(r.storage.raw, raw);
    assert.ok(r.photos.files.has(record.photo!));
    assert.deepEqual(r.photos.removed, []);
  }
});
