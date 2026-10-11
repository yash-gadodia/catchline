export type ApiErrorCode =
  | 'not_authenticated'
  | 'consent_required'
  | 'cap_reached'
  | 'unsupported_movement'
  | 'lift_not_found'
  | 'lift_not_uploading'
  | 'lift_not_ready'
  | 'clip_missing'
  | 'bad_expiry'
  | 'upload_failed'
  | 'unknown';

const KNOWN: ApiErrorCode[] = [
  'not_authenticated',
  'consent_required',
  'cap_reached',
  'unsupported_movement',
  'lift_not_found',
  'lift_not_uploading',
  'lift_not_ready',
  'clip_missing',
  'bad_expiry',
];

export class ApiError extends Error {
  code: ApiErrorCode;
  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
  }
}

// Server functions raise their reason as the message ('cap_reached' etc.).
export function toApiError(error: { message: string }): ApiError {
  const code = KNOWN.find((k) => error.message === k) ?? 'unknown';
  return new ApiError(code, error.message);
}
