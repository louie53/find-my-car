import {
  type Draft, type ParkingLocation, type ParkingState,
  STORAGE_KEY, cameraPhotoName, hasClues, isLocation, parseState, photoReferences,
} from '../domain/parking';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
export interface PhotoStore {
  copyFromCamera(uri: string, filename: string): Promise<void>;
  exists(filename: string): Promise<boolean>;
  remove(filename: string): Promise<void>;
  uri(filename: string): string;
}
export type CameraResult =
  | { kind: 'photo'; uri: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

export class ParkingRepository {
  private state: ParkingState | null = null;
  private draft: Draft | null = null;
  private tail: Promise<void> = Promise.resolve();
  private staged = new Set<string>();
  private warnings: string[] = [];

  constructor(
    private storage: KeyValueStore,
    readonly photos: PhotoStore,
    private newId: () => string,
    private now: () => string,
  ) {}

  getState(): ParkingState {
    if (!this.state) throw new Error('Your saved parking data has not been loaded. Retry first.');
    return this.state;
  }
  getDraft(): Draft | null { return this.draft; }
  getWarnings(): readonly string[] { return this.warnings; }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async load(): Promise<void> {
    return this.serial(async () => {
      // A failed read must never become an empty state or trigger file cleanup.
      this.state = null;
      this.warnings = [];
      const state = parseState(await this.storage.getItem(STORAGE_KEY));
      this.state = state;
      this.draft = state.pendingDraft;
      for (const name of photoReferences(state)) {
        try {
          if (!await this.photos.exists(name)) this.warnings.push('A saved photo is missing. Your parking text and location have been kept.');
        } catch {
          this.warnings.push('A saved photo could not be checked. Your record has been kept.');
        }
      }
    });
  }

  beginDraft(mode: 'new' | 'edit'): Draft {
    const state = this.getState();
    if (this.draft) throw new Error('Finish or cancel the current draft first.');
    const record = mode === 'edit' ? state.active : null;
    if (mode === 'edit' && !record) throw new Error('There is no parking record to edit.');
    this.draft = {
      id: this.newId(), mode, baseRecordId: record?.id ?? null,
      level: record?.level ?? '', zone: record?.zone ?? '', landmark: record?.landmark ?? '',
      photo: record?.photo ?? null, location: record?.location ?? null, cameraRequestId: null,
    };
    return this.draft;
  }

  setFields(fields: Partial<Pick<Draft, 'level' | 'zone' | 'landmark'>>): void {
    this.getState();
    if (!this.draft) return;
    this.draft = { ...this.draft, ...fields };
  }

  setNewLocation(location: ParkingLocation): void {
    if (this.draft?.mode === 'new' && isLocation(location)) this.draft = { ...this.draft, location };
  }

  removeDraftPhoto(): void {
    if (this.draft) this.draft = { ...this.draft, photo: null };
    // Do not delete yet: a persisted camera checkpoint or original record may still reference it.
  }

  private async persist(next: ParkingState): Promise<void> {
    const raw = JSON.stringify(next);
    parseState(raw);
    await this.storage.setItem(STORAGE_KEY, raw);
    this.state = next;
  }

  private async clean(candidates: Iterable<string>): Promise<void> {
    const keep = photoReferences(this.getState(), this.draft);
    const pendingRequest = this.getState().pendingDraft?.cameraRequestId;
    if (pendingRequest) keep.add(cameraPhotoName(pendingRequest));
    for (const name of new Set([...candidates, ...this.staged])) {
      if (keep.has(name)) continue;
      try {
        await this.photos.remove(name);
        this.staged.delete(name);
      } catch {
        if (!this.warnings.includes('Some unused photos could not be removed. Your parking record is safe.')) {
          this.warnings.push('Some unused photos could not be removed. Your parking record is safe.');
        }
      }
    }
  }

  async recoverCopiedCameraPhoto(requestId: string): Promise<boolean> {
    const name = cameraPhotoName(requestId);
    if (!await this.photos.exists(name)) return false;
    // Native pending results are one-shot. Recover the completed, deterministic file first.
    await this.finishCamera(requestId, { kind: 'photo', uri: this.photos.uri(name) });
    return true;
  }

  async prepareCamera(): Promise<string> {
    return this.serial(async () => {
      const state = this.getState();
      if (!this.draft) throw new Error('Open a parking draft before taking a photo.');
      if (this.draft.cameraRequestId) throw new Error('Recover the previous camera result first.');
      const requestId = this.newId();
      const draft = { ...this.draft, cameraRequestId: requestId };
      // Checkpoint before leaving the Activity. If this fails, never open the camera.
      await this.persist({ ...state, revision: state.revision + 1, pendingDraft: draft });
      this.draft = draft;
      return requestId;
    });
  }

  async finishCamera(requestId: string, result: CameraResult): Promise<void> {
    return this.serial(async () => {
      const state = this.getState();
      const original = this.draft;
      if (!original || original.cameraRequestId !== requestId) return;
      const oldRefs = photoReferences(state, original);
      let photo = original.photo;
      let cameraError = result.kind === 'error' ? result.message : null;
      if (result.kind === 'photo') {
        const name = cameraPhotoName(requestId);
        oldRefs.add(name);
        // Pin even a partially copied file so a later successful operation can clean it safely.
        this.staged.add(name);
        try {
          if (!await this.photos.exists(name)) await this.photos.copyFromCamera(result.uri, name);
          if (!await this.photos.exists(name)) throw new Error('Photo copy is missing.');
          photo = name;
        } catch {
          cameraError = 'The photo could not be kept. Your text and previous photo are unchanged. Try taking it again.';
        }
      }
      const draft = { ...original, photo, cameraRequestId: null };
      // Retain the newly copied photo and text for retry even when metadata writing fails.
      this.draft = draft;
      await this.persist({ ...state, revision: state.revision + 1, pendingDraft: draft });
      await this.clean(oldRefs);
      if (cameraError) throw new Error(cameraError);
    });
  }

  async save(replacementId: string | null = null): Promise<void> {
    return this.serial(async () => {
      const state = this.getState();
      const draft = this.draft;
      if (!draft) throw new Error('There is no draft to save.');
      if (draft.cameraRequestId) throw new Error('Your camera result needs to be recovered before saving.');
      if (!hasClues(draft)) throw new Error('Add a level, zone, landmark, photo or location before saving.');
      if (draft.photo && !await this.photos.exists(draft.photo)) {
        throw new Error('Your photo could not be read. Retake or remove it before saving. Your old record is unchanged.');
      }
      if (draft.mode === 'new' && state.active && replacementId !== state.active.id) {
        throw new Error('Confirm before replacing your current parking record.');
      }
      if (draft.mode === 'edit' && state.active?.id !== draft.baseRecordId) {
        throw new Error('The original parking record is no longer available.');
      }
      const oldRefs = photoReferences(state, draft);
      const time = this.now();
      const record = {
        id: draft.mode === 'edit' ? state.active!.id : draft.id,
        savedAt: draft.mode === 'edit' ? state.active!.savedAt : time,
        updatedAt: time,
        level: draft.level.trim(), zone: draft.zone.trim(), landmark: draft.landmark.trim(),
        photo: draft.photo,
        // Editing a record cannot replace the parking coordinates with the user's current position.
        location: draft.mode === 'edit' ? state.active!.location : draft.location,
      };
      await this.persist({ schemaVersion: 1, revision: state.revision + 1,
        active: record, undo: null, pendingDraft: null });
      this.draft = null;
      this.warnings = [];
      await this.clean(oldRefs);
    });
  }

  async cancelDraft(): Promise<void> {
    return this.serial(async () => {
      const state = this.getState();
      const oldRefs = photoReferences(state, this.draft);
      if (state.pendingDraft?.cameraRequestId) oldRefs.add(cameraPhotoName(state.pendingDraft.cameraRequestId));
      if (state.pendingDraft) await this.persist({ ...state, revision: state.revision + 1, pendingDraft: null });
      this.draft = null;
      await this.clean(oldRefs);
    });
  }

  async found(): Promise<void> {
    return this.serial(async () => {
      const state = this.getState();
      if (this.draft) throw new Error('Finish or cancel your draft first.');
      if (!state.active) return;
      // Preserve the whole record and photo for Undo, including after a cold start.
      await this.persist({ ...state, revision: state.revision + 1, active: null, undo: state.active });
    });
  }

  async undo(): Promise<void> {
    return this.serial(async () => {
      const state = this.getState();
      if (this.draft) throw new Error('Cancel the draft before restoring your previous parking.');
      if (!state.undo || state.active) return;
      await this.persist({ ...state, revision: state.revision + 1, active: state.undo, undo: null });
    });
  }
}
