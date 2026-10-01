import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findingSteps, hasClues, hasIndoorClue, needsIndoorClue,
  type Draft, type ParkingLocation, type ParkingRecord,
} from '../src/domain/parking';
import { rig, savedParking, syntheticLocation } from './helpers';

type ClueValue = Pick<Draft, 'level' | 'zone' | 'landmark' | 'photo' | 'location'>;
const clueValue = (patch: Partial<ClueValue> = {}): ClueValue => ({
  level: '', zone: '', landmark: '', photo: null, location: syntheticLocation, ...patch,
});
const recordValue = (patch: Partial<ParkingRecord> = {}): ParkingRecord => ({
  id: 'id-guidance', savedAt: syntheticLocation.capturedAt, updatedAt: syntheticLocation.capturedAt,
  ...clueValue(), ...patch,
});

async function saveGpsOnly(r: ReturnType<typeof rig>, accuracy: ParkingLocation['accuracy'] = 5, photo = false) {
  await r.repo.load();
  r.repo.beginDraft('new');
  r.repo.setNewLocation({ ...syntheticLocation, accuracy });
  if (photo) {
    const request = await r.repo.prepareCamera();
    await r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-indoor-camera.jpg' });
  }
  await r.repo.save();
  return r.repo.getState().active!;
}

for (const accuracy of [null, 0, 5] as const) {
  test(`GPS alone needs indoor clues regardless of accuracy ${String(accuracy)}`, () => {
    const value = clueValue({ location: { ...syntheticLocation, accuracy } });
    assert.equal(hasClues(value), true, 'GPS remains sufficient to save a record');
    assert.equal(hasIndoorClue(value, false), false, 'Precise GPS cannot identify an indoor level');
    assert.equal(needsIndoorClue(value, false), true);
  });
}

test('the indoor prompt is absent without a saved location', () => {
  assert.equal(hasIndoorClue(clueValue({ location: null }), false), false);
  assert.equal(needsIndoorClue(clueValue({ location: null }), false), false);
  assert.equal(hasIndoorClue(clueValue({ location: null, landmark: 'Near Lift C' }), false), true);
  assert.equal(needsIndoorClue(clueValue({ location: null, landmark: 'Near Lift C' }), false), false);
});

test('whitespace-only indoor fields neither suppress guidance nor create finding steps', () => {
  const whitespace = { level: ' \t', zone: '\n\r', landmark: '\u00a0\t ' };
  const value = clueValue(whitespace);
  assert.equal(hasIndoorClue(value, false), false);
  assert.equal(needsIndoorClue(value, false), true);
  assert.deepEqual(findingSteps(recordValue(whitespace), false), findingSteps(recordValue(), false));
});

for (const field of ['level', 'zone', 'landmark'] as const) {
  test(`adding and removing the only ${field} clue updates indoor guidance immediately`, async () => {
    const r = rig();
    await r.repo.load();
    r.repo.beginDraft('new');
    r.repo.setNewLocation(syntheticLocation);
    assert.equal(needsIndoorClue(r.repo.getDraft()!, false), true);
    r.repo.setFields({ [field]: '  Indoor clue  ' });
    assert.equal(hasIndoorClue(r.repo.getDraft()!, false), true);
    assert.equal(needsIndoorClue(r.repo.getDraft()!, false), false);
    r.repo.setFields({ [field]: ' \n ' });
    assert.equal(hasIndoorClue(r.repo.getDraft()!, false), false);
    assert.equal(needsIndoorClue(r.repo.getDraft()!, false), true);
    assert.equal(r.storage.writes, 0, 'Guidance and text editing must not commit a record');
    await r.repo.cancelDraft();
  });
}

test('a usable current photo suppresses guidance until that photo is removed', async () => {
  const r = rig();
  await r.repo.load();
  r.repo.beginDraft('new');
  r.repo.setNewLocation(syntheticLocation);
  assert.equal(needsIndoorClue(r.repo.getDraft()!, false), true);
  const request = await r.repo.prepareCamera();
  await r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-indoor-camera.jpg' });
  const draft = r.repo.getDraft()!;
  const usablePhoto = await r.photos.exists(draft.photo!);
  assert.equal(usablePhoto, true);
  assert.equal(hasIndoorClue(draft, usablePhoto), true);
  assert.equal(needsIndoorClue(draft, usablePhoto), false);
  r.repo.removeDraftPhoto();
  assert.equal(hasIndoorClue(r.repo.getDraft()!, usablePhoto), false, 'Old photo readiness cannot apply to a removed reference');
  assert.equal(needsIndoorClue(r.repo.getDraft()!, usablePhoto), true);
  await r.repo.cancelDraft();
  assert.equal(r.photos.files.size, 0);
});

test('stale usable-photo state cannot supply a clue when the current photo is null', () => {
  const value = clueValue();
  assert.equal(hasIndoorClue(value, true), false);
  assert.equal(needsIndoorClue(value, true), true);
  assert.deepEqual(findingSteps(recordValue(), true), findingSteps(recordValue(), false));
});

for (const failure of ['missing', 'unreadable'] as const) {
  test(`a ${failure} photo retains its record but cannot suppress guidance or be compared`, async () => {
    const r = rig();
    const record = await saveGpsOnly(r, 5, true);
    assert.ok(record.photo);
    if (failure === 'missing') r.photos.files.delete(record.photo);
    const restarted = r.makeRepo();
    await restarted.load();
    const restored = restarted.getState().active!;
    assert.deepEqual(restored, record, 'Photo availability must not rewrite the parking record');
    assert.equal(await r.photos.exists(record.photo), failure === 'unreadable');
    // false is the caller's availability result, including an image-decoding failure.
    // The synthetic photo store does not claim to exercise native image decoding.
    const usablePhoto = false;
    assert.equal(hasIndoorClue(restored, usablePhoto), false);
    assert.equal(needsIndoorClue(restored, usablePhoto), true);
    const gpsFallback = findingSteps({ ...restored, photo: null }, false);
    assert.equal(gpsFallback.length, 1);
    assert.deepEqual(findingSteps(restored, usablePhoto), gpsFallback);
    assert.equal(r.repo.getState().active?.photo, record.photo);
  });
}

test('finding steps prioritise trimmed saved indoor clues before a usable photo', () => {
  const record = recordValue({ level: '  4 ', zone: '\tD18 ', landmark: ' Near Lift C\n', photo: 'photo-guidance.jpg' });
  const steps = findingSteps(record, true);
  assert.equal(steps.length, 4);
  assert.ok(steps[0]!.title.endsWith('4'));
  assert.ok(steps[1]!.title.endsWith('D18'));
  assert.equal(steps[2]!.title, 'Near Lift C');
  assert.ok(steps.every((step) => !step.title.includes('\t') && !step.title.includes('\n')));
  assert.deepEqual(findingSteps(record, false), steps.slice(0, 3), 'Unavailable photos add neither comparison nor a GPS step when text clues exist');
  assert.deepEqual(findingSteps(record), steps, 'Existing callers keep the default photo-reference behaviour');
});

test('photo-only finding steps fall back to Maps when the referenced photo is unusable', () => {
  const record = recordValue({ photo: 'photo-guidance.jpg' });
  assert.equal(findingSteps(record, true).length, 1);
  assert.notDeepEqual(findingSteps(record, true), findingSteps({ ...record, photo: null }, false));
  assert.deepEqual(findingSteps(record, false), findingSteps({ ...record, photo: null }, false));
  assert.deepEqual(findingSteps({ ...record, location: null }, false), []);
});

test('indoor guidance never blocks GPS-only save and cold reload', async () => {
  for (const accuracy of [null, 0, 5] as const) {
    const r = rig();
    const record = await saveGpsOnly(r, accuracy);
    assert.equal(record.level, '');
    assert.equal(record.zone, '');
    assert.equal(record.landmark, '');
    assert.equal(record.photo, null);
    assert.deepEqual(record.location, { ...syntheticLocation, accuracy });
    const restarted = r.makeRepo();
    await restarted.load();
    assert.deepEqual(restarted.getState().active, record);
    assert.equal(needsIndoorClue(restarted.getState().active!, false), true);
    assert.equal(findingSteps(restarted.getState().active!, false).length, 1);
    assert.equal(r.storage.writes, 1);
  }
});

test('cancelling an indoor-clue edit preserves the GPS-only record, position and parking time', async () => {
  const r = rig();
  const record = await saveGpsOnly(r);
  const raw = r.storage.raw;
  const writes = r.storage.writes;
  r.advanceClock('2026-10-01T02:00:00.000Z');
  r.repo.beginDraft('edit');
  assert.equal(needsIndoorClue(r.repo.getDraft()!, false), true);
  r.repo.setFields({ level: '7', landmark: 'By the lift' });
  r.repo.setNewLocation({ ...syntheticLocation, latitude: 1, longitude: 2 });
  assert.equal(needsIndoorClue(r.repo.getDraft()!, false), false);
  assert.deepEqual(r.repo.getDraft()?.location, record.location);
  assert.deepEqual(r.repo.getState().active, record);
  await r.repo.cancelDraft();
  assert.equal(r.repo.getDraft(), null);
  assert.deepEqual(r.repo.getState().active, record);
  assert.equal(r.storage.raw, raw);
  assert.equal(r.storage.writes, writes);
  const restarted = r.makeRepo();
  await restarted.load();
  assert.deepEqual(restarted.getState().active, record);
  assert.equal(needsIndoorClue(restarted.getState().active!, false), true);
});

test('a new draft cannot borrow indoor clues or photo availability from the old record', async () => {
  const r = rig();
  const record = await savedParking(r);
  assert.equal(hasIndoorClue(record, true), true);
  r.repo.beginDraft('new');
  assert.equal(hasIndoorClue(r.repo.getDraft()!, true), false);
  assert.equal(needsIndoorClue(r.repo.getDraft()!, true), false, 'No new position has been captured yet');
  r.repo.setNewLocation({ ...syntheticLocation, latitude: 1 });
  assert.equal(needsIndoorClue(r.repo.getDraft()!, true), true);
  assert.deepEqual(r.repo.getState().active, record);
  await r.repo.cancelDraft();
  assert.deepEqual(r.repo.getState().active, record);
  assert.ok(r.photos.files.has(record.photo!));
});

test('Found and Undo retain GPS-only indoor guidance through two cold restarts', async () => {
  const r = rig();
  const record = await saveGpsOnly(r, null);
  await r.repo.found();
  assert.equal(r.repo.getState().active, null);
  assert.deepEqual(r.repo.getState().undo, record);
  const afterFound = r.makeRepo();
  await afterFound.load();
  assert.equal(needsIndoorClue(afterFound.getState().undo!, false), true);
  r.advanceClock('2026-10-01T03:00:00.000Z');
  await afterFound.undo();
  const afterUndo = r.makeRepo();
  await afterUndo.load();
  assert.deepEqual(afterUndo.getState().active, record);
  assert.equal(afterUndo.getState().undo, null);
  assert.equal(needsIndoorClue(afterUndo.getState().active!, false), true);
  assert.deepEqual(findingSteps(afterUndo.getState().active!, false), findingSteps(record, false));
});
