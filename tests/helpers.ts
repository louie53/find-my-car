import { ParkingRepository, type CameraResult, type KeyValueStore, type PhotoStore } from '../src/data/ParkingRepository';
import { ParkingController, type DeviceServices } from '../src/controller/ParkingController';
import { emptyState, STORAGE_KEY, type ParkingLocation } from '../src/domain/parking';

export const syntheticLocation: ParkingLocation = {
  latitude: 0, longitude: 0, accuracy: 150, capturedAt: '2026-09-30T00:00:00.000Z',
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export class MemoryStorage implements KeyValueStore {
  raw: string | null = null;
  failRead = false;
  failWrite = false;
  writes = 0;
  beforeWrite: (() => Promise<void>) | null = null;
  events: string[];
  constructor(events: string[] = []) { this.events = events; }
  async getItem(key: string) {
    if (key !== STORAGE_KEY) throw new Error('Unexpected storage key');
    if (this.failRead) throw new Error('Injected read failure');
    return this.raw;
  }
  async setItem(key: string, value: string) {
    if (key !== STORAGE_KEY) throw new Error('Unexpected storage key');
    this.events.push('write:start');
    if (this.beforeWrite) await this.beforeWrite();
    if (this.failWrite) throw new Error('Injected write failure');
    this.raw = value;
    this.writes++;
    this.events.push('write:complete');
  }
}
export class MemoryPhotos implements PhotoStore {
  files = new Set<string>();
  removed: string[] = [];
  failCopy = false;
  failRemove = false;
  events: string[];
  constructor(events: string[] = []) { this.events = events; }
  async copyFromCamera(_uri: string, filename: string) {
    this.events.push('copy');
    if (this.failCopy) throw new Error('Injected photo copy failure');
    this.files.add(filename);
  }
  async exists(filename: string) { return this.files.has(filename); }
  async remove(filename: string) {
    this.events.push('remove:' + filename);
    if (this.failRemove) throw new Error('Injected removal failure');
    this.removed.push(filename);
    this.files.delete(filename);
  }
  uri(filename: string) { return 'file:///synthetic-app-documents/' + filename; }
}

export function rig() {
  const events: string[] = [];
  const storage = new MemoryStorage(events);
  const photos = new MemoryPhotos(events);
  let sequence = 0;
  let time = '2026-09-30T01:00:00.000Z';
  const makeRepo = () => new ParkingRepository(storage, photos, () => 'id-' + ++sequence, () => time);
  const repo = makeRepo();
  return { repo, storage, photos, events, makeRepo, advanceClock: (next: string) => { time = next; } };
}

export function deviceRig(overrides: Partial<DeviceServices> = {}) {
  const r = rig();
  let cameraCalls = 0;
  let locationCalls = 0;
  let mapsCalls = 0;
  let permission = true;
  let returnedPhoto: CameraResult = { kind: 'photo', uri: 'file:///synthetic-camera.jpg' };
  const devices: DeviceServices = {
    locate: async () => { locationCalls++; return syntheticLocation; },
    requestCameraPermission: async () => permission,
    takePhoto: async () => { cameraCalls++; return returnedPhoto; },
    pendingPhoto: async () => null,
    openMaps: async () => { mapsCalls++; },
    openSettings: async () => undefined,
    ...overrides,
  };
  const controller = new ParkingController(r.repo, devices, 25);
  return { ...r, devices, controller, calls: () => ({ cameraCalls, locationCalls, mapsCalls }),
    denyCamera: () => { permission = false; },
    cancelCamera: () => { returnedPhoto = { kind: 'cancelled' }; } };
}

export async function savedParking(r: ReturnType<typeof rig>, photo = true) {
  await r.repo.load();
  r.repo.beginDraft('new');
  r.repo.setFields({ level: '3', zone: 'B27', landmark: 'Near the test lift' });
  r.repo.setNewLocation(syntheticLocation);
  if (photo) {
    const request = await r.repo.prepareCamera();
    await r.repo.finishCamera(request, { kind: 'photo', uri: 'file:///synthetic-camera.jpg' });
  }
  await r.repo.save();
  return r.repo.getState().active!;
}

export const validEmpty = JSON.stringify(emptyState());
