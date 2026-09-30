import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyState, hasClues, isPhotoName, mapsURLs, parseState, findingSteps } from '../src/domain/parking';
import { deferred, rig, savedParking, syntheticLocation, tick } from './helpers';

test('fresh install has no invented record and performs no write or cleanup', async () => {
  const r = rig();
  r.photos.files.add('photo-unreferenced.jpg');
  await r.repo.load();
  assert.deepEqual(r.repo.getState(), emptyState());
  assert.equal(r.storage.writes, 0);
  assert.deepEqual(r.photos.removed, []);
});

test('empty and whitespace-only clues are rejected; zero coordinates are valid', async () => {
  assert.equal(hasClues({ level: ' ', zone: '', landmark: '\n', photo: null, location: null }), false);
  const r = rig();
  await r.repo.load();
  r.repo.beginDraft('new');
  await assert.rejects(r.repo.save(), /Add a level/);
  assert.equal(r.storage.raw, null);
  r.repo.setNewLocation(syntheticLocation);
  await r.repo.save();
  assert.deepEqual(r.repo.getState().active?.location, syntheticLocation);
});

test('manual clues persist and reload without a location', async () => {
  const r = rig();
  await r.repo.load();
  r.repo.beginDraft('new');
  r.repo.setFields({ zone: '  B27  ' });
  await r.repo.save();
  const restarted = r.makeRepo();
  await restarted.load();
  assert.equal(restarted.getState().active?.zone, 'B27');
  assert.equal(restarted.getState().active?.location, null);
});

test('saved photos use a durable relative reference and survive repository restart', async () => {
  const r = rig();
  const record = await savedParking(r);
  assert.ok(record.photo && isPhotoName(record.photo));
  assert.ok(!r.storage.raw!.includes('synthetic-camera'));
  const restarted = r.makeRepo();
  await restarted.load();
  assert.deepEqual(restarted.getState().active, record);
  assert.ok(r.photos.files.has(record.photo!));
});

test('edit cancellation preserves the original text, photo and saved position', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  r.repo.setFields({ level: '9', landmark: 'Changed text' });
  r.repo.setNewLocation({ ...syntheticLocation, latitude: 1 });
  const request = await r.repo.prepareCamera();
  await r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-new.jpg' });
  const staged = r.repo.getDraft()!.photo!;
  await r.repo.cancelDraft();
  assert.deepEqual(r.repo.getState().active, record);
  assert.ok(r.photos.files.has(record.photo!));
  assert.ok(!r.photos.files.has(staged));
  assert.equal(r.repo.getDraft(), null);
  const restarted = r.makeRepo();
  await restarted.load();
  assert.deepEqual(restarted.getState().active, record);
});

test('successful editing retains original record ID, saved time and parking coordinates', async () => {
  const r = rig();
  const record = await savedParking(r, false);
  r.repo.beginDraft('edit');
  r.repo.setFields({ level: '4' });
  r.repo.setNewLocation({ ...syntheticLocation, longitude: 1 });
  r.advanceClock('2026-09-30T02:00:00.000Z');
  await r.repo.save();
  const edited = r.repo.getState().active!;
  assert.equal(edited.id, record.id);
  assert.equal(edited.savedAt, record.savedAt);
  assert.equal(edited.updatedAt, '2026-09-30T02:00:00.000Z');
  assert.deepEqual(edited.location, record.location);
  assert.equal(edited.level, '4');
});

test('replacement needs confirmation of the precise active record', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.repo.beginDraft('new');
  r.repo.setFields({ zone: 'C8' });
  await assert.rejects(r.repo.save(), /Confirm/);
  await assert.rejects(r.repo.save('wrong-id'), /Confirm/);
  assert.deepEqual(r.repo.getState().active, record);
  await r.repo.save(record.id);
  assert.equal(r.repo.getState().active?.zone, 'C8');
  assert.equal(r.repo.getState().undo, null);
  assert.ok(!r.photos.files.has(record.photo!));
});

test('Found and Undo restore the full record and photo after a cold restart', async () => {
  const r = rig();
  const record = await savedParking(r);
  await r.repo.found();
  assert.equal(r.repo.getState().active, null);
  assert.deepEqual(r.repo.getState().undo, record);
  assert.ok(r.photos.files.has(record.photo!));
  const restarted = r.makeRepo();
  await restarted.load();
  await restarted.undo();
  assert.deepEqual(restarted.getState().active, record);
  assert.equal(restarted.getState().undo, null);
  assert.ok(r.photos.files.has(record.photo!));
});

test('cancelled or failed new parking preserves Undo until a successful save', async () => {
  const r = rig();
  const record = await savedParking(r);
  await r.repo.found();
  r.repo.beginDraft('new');
  r.repo.setFields({ zone: 'New bay' });
  r.storage.failWrite = true;
  const oldRaw = r.storage.raw;
  await assert.rejects(r.repo.save(), /write failure/);
  assert.equal(r.storage.raw, oldRaw);
  assert.deepEqual(r.repo.getState().undo, record);
  assert.ok(r.photos.files.has(record.photo!));
  r.storage.failWrite = false;
  await r.repo.cancelDraft();
  assert.deepEqual(r.repo.getState().undo, record);
  r.repo.beginDraft('new');
  r.repo.setFields({ zone: 'New bay' });
  await r.repo.save();
  assert.equal(r.repo.getState().undo, null);
  assert.ok(!r.photos.files.has(record.photo!));
});

test('write failure preserves the old record, both photos and the current draft', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  r.repo.setFields({ zone: 'C8' });
  const request = await r.repo.prepareCamera();
  await r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-new.jpg' });
  const draft = r.repo.getDraft()!;
  const oldRaw = r.storage.raw;
  const oldRemovals = [...r.photos.removed];
  r.storage.failWrite = true;
  await assert.rejects(r.repo.save(), /write failure/);
  assert.equal(r.storage.raw, oldRaw);
  assert.deepEqual(r.repo.getState().active, record);
  assert.deepEqual(r.repo.getDraft(), draft);
  assert.deepEqual(r.photos.removed, oldRemovals);
  assert.ok(r.photos.files.has(record.photo!));
  assert.ok(r.photos.files.has(draft.photo!));
  r.storage.failWrite = false;
  await r.repo.save();
  assert.equal(r.repo.getState().active?.photo, draft.photo);
  assert.ok(!r.photos.files.has(record.photo!));
});

test('photo cleanup waits until metadata has been committed', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  r.repo.removeDraftPhoto();
  const gate = deferred<void>();
  r.storage.beforeWrite = () => gate.promise;
  const save = r.repo.save();
  await tick();
  assert.ok(r.photos.files.has(record.photo!));
  assert.equal(r.repo.getState().active?.photo, record.photo);
  gate.resolve();
  await save;
  assert.equal(r.repo.getState().active?.photo, null);
  assert.ok(!r.photos.files.has(record.photo!));
  assert.ok(r.events.lastIndexOf('write:complete') < r.events.lastIndexOf('remove:' + record.photo));
});

test('photo copy failure keeps the original photo and permits a fresh attempt', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  const request = await r.repo.prepareCamera();
  r.photos.failCopy = true;
  await assert.rejects(r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-new.jpg' }), /could not be kept/);
  assert.deepEqual(r.repo.getState().active, record);
  assert.equal(r.repo.getDraft()?.photo, record.photo);
  assert.equal(r.repo.getDraft()?.cameraRequestId, null);
  r.photos.failCopy = false;
  const second = await r.repo.prepareCamera();
  await r.repo.finishCamera(second, { kind: 'photo', uri: 'file:///synthetic-new.jpg' });
  assert.notEqual(r.repo.getDraft()?.photo, record.photo);
});

test('camera cancellation keeps the previous photo, text and original record', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  r.repo.setFields({ landmark: 'Draft clue' });
  const request = await r.repo.prepareCamera();
  await r.repo.finishCamera(request, { kind: 'cancelled' });
  assert.equal(r.repo.getDraft()?.photo, record.photo);
  assert.equal(r.repo.getDraft()?.landmark, 'Draft clue');
  assert.deepEqual(r.repo.getState().active, record);
});

test('camera metadata write failure retains the copied photo in the runtime draft for retry', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  const request = await r.repo.prepareCamera();
  const checkpoint = r.storage.raw;
  r.storage.failWrite = true;
  await assert.rejects(r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-new.jpg' }), /write failure/);
  const newPhoto = r.repo.getDraft()!.photo!;
  assert.notEqual(newPhoto, record.photo);
  assert.ok(r.photos.files.has(newPhoto));
  assert.ok(r.photos.files.has(record.photo!));
  assert.equal(r.storage.raw, checkpoint);
  r.storage.failWrite = false;
  await r.repo.save();
  assert.equal(r.repo.getState().active?.photo, newPhoto);
});

test('checkpoint clear failure cannot discard the draft or its new photo', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  const request = await r.repo.prepareCamera();
  await r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-new.jpg' });
  const draft = r.repo.getDraft()!;
  r.storage.failWrite = true;
  await assert.rejects(r.repo.cancelDraft(), /write failure/);
  assert.deepEqual(r.repo.getDraft(), draft);
  assert.deepEqual(r.repo.getState().active, record);
  assert.ok(r.photos.files.has(draft.photo!));
});

test('found and undo failures preserve their prior durable state', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.storage.failWrite = true;
  await assert.rejects(r.repo.found(), /write failure/);
  assert.deepEqual(r.repo.getState().active, record);
  r.storage.failWrite = false;
  await r.repo.found();
  r.storage.failWrite = true;
  await assert.rejects(r.repo.undo(), /write failure/);
  assert.equal(r.repo.getState().active, null);
  assert.deepEqual(r.repo.getState().undo, record);
  assert.ok(r.photos.files.has(record.photo!));
});

test('repeated Found/Undo actions are serial and idempotent', async () => {
  const r = rig();
  const record = await savedParking(r);
  const before = r.storage.writes;
  await Promise.all([r.repo.found(), r.repo.found(), r.repo.found()]);
  assert.equal(r.storage.writes, before + 1);
  await Promise.all([r.repo.undo(), r.repo.undo()]);
  assert.equal(r.storage.writes, before + 2);
  assert.deepEqual(r.repo.getState().active, record);
});

test('repeated saves cannot create another record or discard the first successful save', async () => {
  const r = rig();
  await r.repo.load();
  r.repo.beginDraft('new');
  r.repo.setFields({ level: '1' });
  const results = await Promise.allSettled([r.repo.save(), r.repo.save()]);
  assert.equal(results[0]?.status, 'fulfilled');
  assert.equal(results[1]?.status, 'rejected');
  assert.equal(r.storage.writes, 1);
  assert.equal(r.repo.getState().active?.level, '1');
});

test('read error or corrupted data blocks saving and never cleans old files', async () => {
  for (const raw of ['not JSON', '{"schemaVersion":9}', '[]']) {
    const r = rig();
    r.storage.raw = raw;
    r.photos.files.add('photo-old.jpg');
    await assert.rejects(r.repo.load());
    assert.throws(() => r.repo.beginDraft('new'), /not been loaded/);
    await assert.rejects(r.repo.save(), /not been loaded/);
    assert.equal(r.storage.raw, raw);
    assert.equal(r.storage.writes, 0);
    assert.deepEqual(r.photos.removed, []);
  }
  const r = rig();
  const record = await savedParking(r);
  r.storage.failRead = true;
  const raw = r.storage.raw;
  await assert.rejects(r.repo.load(), /read failure/);
  assert.equal(r.storage.raw, raw);
  assert.ok(r.photos.files.has(record.photo!));
  r.storage.failRead = false;
  await r.repo.load();
  assert.deepEqual(r.repo.getState().active, record);
});

test('missing photos are reported without silently dropping a saved record', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.photos.files.clear();
  const raw = r.storage.raw;
  const restarted = r.makeRepo();
  await restarted.load();
  assert.deepEqual(restarted.getState().active, record);
  assert.equal(r.storage.raw, raw);
  assert.match(restarted.getWarnings().join(' '), /missing/);
  restarted.beginDraft('edit');
  await assert.rejects(restarted.save(), /Retake or remove/);
  restarted.removeDraftPhoto();
  await restarted.save();
  assert.equal(restarted.getState().active?.photo, null);
});

test('cleanup failure is a warning after a successful commit, not a false save failure', async () => {
  const r = rig();
  const record = await savedParking(r);
  r.repo.beginDraft('edit');
  r.repo.removeDraftPhoto();
  r.photos.failRemove = true;
  await r.repo.save();
  assert.equal(r.repo.getState().active?.photo, null);
  assert.ok(r.photos.files.has(record.photo!));
  assert.match(r.repo.getWarnings().join(' '), /unused photos/);
  const restarted = r.makeRepo();
  await restarted.load();
  assert.equal(restarted.getState().active?.photo, null);
  assert.equal(restarted.getState().active?.zone, record.zone);
});

test('invalid photo paths, locations, schemas and conflicting lifecycles are rejected', () => {
  assert.equal(isPhotoName('../photo-1.jpg'), false);
  assert.equal(isPhotoName('file:///private.jpg'), false);
  const r = emptyState();
  assert.throws(() => parseState(JSON.stringify({ ...r, revision: -1 })));
  assert.throws(() => parseState(JSON.stringify({ ...r, pendingDraft: {} })));
  assert.throws(() => mapsURLs({ ...syntheticLocation, latitude: 91 }));
});

test('map links contain the saved destination; help is generated only from saved clues', () => {
  const record = { id: 'id-1', savedAt: syntheticLocation.capturedAt, updatedAt: syntheticLocation.capturedAt,
    level: '', zone: 'Test bay', landmark: '', photo: null, location: syntheticLocation };
  const [geo, web] = mapsURLs(syntheticLocation);
  assert.match(geo, /^geo:0,0/);
  assert.match(web, /query=0%2C0/);
  const steps = findingSteps(record);
  assert.equal(steps.length, 1);
  assert.match(steps[0]!.title, /Test bay/);
});
