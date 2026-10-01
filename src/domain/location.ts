export type LocationFailureReason = 'permission' | 'services' | 'unavailable' | 'invalid';

export class LocationError extends Error {
  constructor(readonly reason: LocationFailureReason, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'LocationError';
  }

  get settingsRequired(): boolean { return this.reason === 'permission'; }
}
