export type ParkingLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
};

export type ParkingRecord = {
  id: string;
  savedAt: string;
  updatedAt: string;
  level: string;
  zone: string;
  landmark: string;
  photo: string | null;
  location: ParkingLocation | null;
};

export type Draft = {
  id: string;
  mode: 'new' | 'edit';
  baseRecordId: string | null;
  level: string;
  zone: string;
  landmark: string;
  photo: string | null;
  location: ParkingLocation | null;
  cameraRequestId: string | null;
};

export type ParkingState = {
  schemaVersion: 1;
  revision: number;
  active: ParkingRecord | null;
  undo: ParkingRecord | null;
  pendingDraft: Draft | null;
};

export const STORAGE_KEY = '@find-my-car/parking-v1';
export const emptyState = (): ParkingState => ({
  schemaVersion: 1, revision: 0, active: null, undo: null, pendingDraft: null,
});

export function hasClues(value: Pick<Draft, 'level' | 'zone' | 'landmark' | 'photo' | 'location'>): boolean {
  return Boolean(value.level.trim() || value.zone.trim() || value.landmark.trim() || value.photo || value.location);
}

export function isPhotoName(value: unknown): value is string {
  return typeof value === 'string' && /^photo-[A-Za-z0-9-]{1,80}\.jpg$/.test(value);
}

export function cameraPhotoName(requestId: string): string {
  const name = 'photo-' + requestId + '.jpg';
  if (!isPhotoName(name)) throw new Error('The camera recovery reference is invalid.');
  return name;
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length <= limit;
const identifier = (value: unknown): value is string =>
  text(value, 100) && /^[A-Za-z0-9-]+$/.test(value);
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

export function isLocation(value: unknown): value is ParkingLocation {
  if (!object(value)) return false;
  return typeof value.latitude === 'number' && Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90 &&
    typeof value.longitude === 'number' && Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180 &&
    (value.accuracy === null || (typeof value.accuracy === 'number' &&
      Number.isFinite(value.accuracy) && value.accuracy >= 0)) &&
    timestamp(value.capturedAt);
}

function validClueFields(value: Record<string, unknown>): boolean {
  return text(value.level, 60) && text(value.zone, 100) && text(value.landmark, 500) &&
    (value.photo === null || isPhotoName(value.photo)) &&
    (value.location === null || isLocation(value.location));
}

function isRecord(value: unknown): value is ParkingRecord {
  return object(value) && identifier(value.id) && timestamp(value.savedAt) &&
    timestamp(value.updatedAt) && validClueFields(value) &&
    hasClues(value as ParkingRecord);
}

function isDraft(value: unknown): value is Draft {
  return object(value) && identifier(value.id) && validClueFields(value) &&
    (value.mode === 'new' ? value.baseRecordId === null :
      value.mode === 'edit' && identifier(value.baseRecordId)) &&
    (value.cameraRequestId === null || (identifier(value.cameraRequestId) &&
      isPhotoName('photo-' + value.cameraRequestId + '.jpg')));
}

export function parseState(raw: string | null): ParkingState {
  if (raw === null) return emptyState();
  const value: unknown = JSON.parse(raw);
  if (!object(value) || value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
    !(value.active === null || isRecord(value.active)) ||
    !(value.undo === null || isRecord(value.undo)) ||
    !(value.pendingDraft === null || isDraft(value.pendingDraft))) {
    throw new Error('Saved parking data could not be read safely. Retry without changing it.');
  }
  if (value.active !== null && value.undo !== null) {
    throw new Error('Saved parking data has conflicting records. It has been kept unchanged.');
  }
  if (value.pendingDraft !== null && (value.pendingDraft as Draft).mode === 'edit' &&
    (value.pendingDraft as Draft).baseRecordId !== (value.active as ParkingRecord | null)?.id) {
    throw new Error('The saved editing draft does not match your parking record.');
  }
  return value as ParkingState;
}

export function photoReferences(state: ParkingState, draft: Draft | null = null): Set<string> {
  const refs = [state.active?.photo, state.undo?.photo, state.pendingDraft?.photo, draft?.photo];
  return new Set(refs.filter((ref): ref is string => Boolean(ref)));
}

export function findingSteps(record: ParkingRecord): { title: string; copy: string }[] {
  const steps: { title: string; copy: string }[] = [];
  if (record.level) steps.push({ title: 'Go to level ' + record.level, copy: 'Follow the car park’s level signs.' });
  if (record.zone) steps.push({ title: 'Look for ' + record.zone, copy: 'Use the zone or bay markings around you.' });
  if (record.landmark) steps.push({ title: record.landmark, copy: 'Look for the landmark you noted when parking.' });
  if (record.photo) steps.push({ title: 'Compare your parking photo', copy: 'Look for the same pillar, sign or nearby lift.' });
  if (steps.length === 0 && record.location) steps.push({ title: 'Open your saved area in Maps', copy: 'The saved position is approximate and cannot identify an indoor level.' });
  return steps;
}

export function mapsURLs(location: ParkingLocation): [string, string] {
  if (!isLocation(location)) throw new Error('The saved location is invalid.');
  const point = location.latitude + ',' + location.longitude;
  return ['geo:' + point + '?q=' + encodeURIComponent(point + '(Parked car)'),
    'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(point)];
}
