import { ParkingRepository, type CameraResult } from '../data/ParkingRepository';
import { type Draft, type ParkingLocation, type ParkingState } from '../domain/parking';

export interface DeviceServices {
  locate(): Promise<ParkingLocation>;
  requestCameraPermission(): Promise<boolean>;
  takePhoto(): Promise<CameraResult>;
  pendingPhoto(): Promise<CameraResult | null>;
  openMaps(location: ParkingLocation): Promise<void>;
  openSettings(): Promise<void>;
}

export type ViewState = {
  phase: 'loading' | 'blocked' | 'ready';
  state: ParkingState | null;
  draft: Draft | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  warnings: readonly string[];
  locationStatus: 'idle' | 'loading' | 'available' | 'unavailable' | 'preserved';
  locationMessage: string;
};

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

// Owns the UI transaction lock and invalidates device callbacks when a draft changes.
export class ParkingController {
  private view: ViewState = {
    phase: 'loading', state: null, draft: null, busy: false, error: null, notice: null,
    warnings: [], locationStatus: 'idle', locationMessage: '',
  };
  private listeners = new Set<() => void>();
  private locationEpoch = 0;
  private locationTimer: ReturnType<typeof setTimeout> | null = null;
  private booting: Promise<void> | null = null;

  constructor(readonly repo: ParkingRepository, private devices: DeviceServices, private locationTimeoutMs = 15000) {}

  getSnapshot = (): ViewState => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(patch: Partial<ViewState> = {}): void {
    this.view = { ...this.view, ...patch };
    if (this.view.phase === 'ready') {
      this.view = { ...this.view, state: this.repo.getState(), draft: this.repo.getDraft(), warnings: [...this.repo.getWarnings()] };
    }
    for (const listener of this.listeners) listener();
  }

  boot(): Promise<void> {
    if (this.booting) return this.booting;
    this.booting = this.startup().finally(() => { this.booting = null; });
    return this.booting;
  }

  private async startup(): Promise<void> {
    this.invalidateLocation();
    this.publish({ phase: 'loading', busy: true, error: null });
    try {
      await this.repo.load();
    } catch {
      this.publish({ phase: 'blocked', state: null, draft: null, busy: false,
        error: 'Your saved parking data could not be loaded safely. It has been kept unchanged. Retry to continue.' });
      return;
    }
    let recoveryError: string | null = null;
    const pending = this.repo.getDraft();
    if (pending?.cameraRequestId) {
      try {
        if (!await this.repo.recoverCopiedCameraPhoto(pending.cameraRequestId)) {
          const result = await this.devices.pendingPhoto();
          await this.repo.finishCamera(pending.cameraRequestId, result ?? { kind: 'cancelled' });
        }
      } catch (error) {
        if (this.repo.getDraft()?.cameraRequestId) {
          this.publish({ phase: 'blocked', busy: false,
            error: 'Your photo recovery could not finish. Your record and draft are kept. Retry to recover them.' });
          return;
        }
        recoveryError = errorMessage(error, 'The returned photo could not be saved. Retry saving your draft.');
      }
    }
    const draft = this.repo.getDraft();
    this.publish({ phase: 'ready', busy: false, error: recoveryError,
      notice: draft ? 'Your parking draft was recovered.' : null,
      locationStatus: draft?.mode === 'edit' ? 'preserved' : draft?.location ? 'available' : 'idle',
      locationMessage: '' });
  }

  begin(mode: 'new' | 'edit'): void {
    if (this.view.phase !== 'ready' || this.view.busy) return;
    this.invalidateLocation();
    try {
      this.repo.beginDraft(mode);
      this.publish({ error: null, notice: null,
        locationStatus: mode === 'edit' ? 'preserved' : 'idle', locationMessage: '' });
      if (mode === 'new') void this.requestLocation();
    } catch (error) {
      this.publish({ error: errorMessage(error, 'The draft could not be opened.') });
    }
  }

  setField(field: 'level' | 'zone' | 'landmark', value: string): void {
    if (this.view.phase !== 'ready' || this.view.busy) return;
    this.repo.setFields({ [field]: value });
    this.publish({ error: null });
  }
  removePhoto(): void {
    if (this.view.phase !== 'ready' || this.view.busy) return;
    this.repo.removeDraftPhoto();
    this.publish({ error: null });
  }

  private invalidateLocation(): void {
    this.locationEpoch++;
    if (this.locationTimer) clearTimeout(this.locationTimer);
    this.locationTimer = null;
  }

  async requestLocation(): Promise<void> {
    const draft = this.repo.getDraft();
    if (this.view.phase !== 'ready' || this.view.busy || draft?.mode !== 'new') return;
    this.invalidateLocation();
    const epoch = this.locationEpoch;
    const draftId = draft.id;
    this.publish({ locationStatus: 'loading', locationMessage: 'Getting your parking location…', error: null });
    // A deadline covers permission/services/GPS together. Old native work may continue but is ignored.
    const timeout = new Promise<ParkingLocation>((_, reject) => {
      this.locationTimer = setTimeout(() => reject(new Error('Location took too long. You can save your clues and try again.')), this.locationTimeoutMs);
    });
    try {
      const location = await Promise.race([this.devices.locate(), timeout]);
      if (epoch !== this.locationEpoch || this.repo.getDraft()?.id !== draftId) return;
      this.repo.setNewLocation(location);
      this.publish({ locationStatus: 'available', locationMessage: 'GPS may be less accurate indoors.' });
    } catch (error) {
      if (epoch !== this.locationEpoch || this.repo.getDraft()?.id !== draftId) return;
      this.publish({ locationStatus: 'unavailable', locationMessage: errorMessage(error, 'Location is unavailable. You can still save clues.') });
    } finally {
      if (epoch === this.locationEpoch && this.locationTimer) {
        clearTimeout(this.locationTimer);
        this.locationTimer = null;
      }
    }
  }

  private freezeLocation(): void {
    this.invalidateLocation();
    if (this.view.locationStatus === 'loading') {
      this.publish({ locationStatus: this.repo.getDraft()?.location ? 'available' : 'unavailable',
        locationMessage: 'You can save your parking clues without GPS.' });
    }
  }

  private async action(operation: () => Promise<void>, notice: string | null = null): Promise<void> {
    if (this.view.phase !== 'ready' || this.view.busy) return;
    this.freezeLocation();
    this.publish({ busy: true, error: null });
    try {
      await operation();
      this.publish({ notice });
    } catch (error) {
      this.publish({ error: errorMessage(error, 'The change could not be saved. Your previous record is unchanged.') });
    } finally {
      this.publish({ busy: false });
    }
  }

  save = (replacementId: string | null = null): Promise<void> =>
    this.action(() => this.repo.save(replacementId), 'Parking saved.');
  cancel = (): Promise<void> => this.action(() => this.repo.cancelDraft());
  found = (): Promise<void> => this.action(() => this.repo.found(), 'Parking ended. You can undo it.');
  undo = (): Promise<void> => this.action(() => this.repo.undo(), 'Your parking record was restored.');

  async capture(): Promise<void> {
    if (!this.repo.getDraft()) return;
    await this.action(async () => {
      if (!await this.devices.requestCameraPermission()) {
        throw new Error('Camera permission was not granted. You can use text clues, or enable the camera in App settings.');
      }
      const requestId = await this.repo.prepareCamera();
      let result: CameraResult;
      try { result = await this.devices.takePhoto(); }
      catch { result = { kind: 'error', message: 'The camera could not finish. Your text and previous photo have been kept.' }; }
      await this.repo.finishCamera(requestId, result);
    });
  }

  async openMaps(): Promise<void> {
    const location = this.repo.getState().active?.location;
    if (!location) return;
    await this.action(() => this.devices.openMaps(location));
  }
  async openSettings(): Promise<void> {
    await this.action(() => this.devices.openSettings());
  }
}
