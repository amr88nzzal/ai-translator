/**
 * Centralised errors. Every failure that leaves the HTTP layer is wrapped in an
 * `ApiFailure`, which the error middleware converts into Arabic JSON — the app
 * never leaks an HTML error page or a raw stack trace to the client.
 */
import type { ApiErrorCode, ApiErrorBody } from '../shared/api-contract.js';

export interface ApiFailureInit {
  code: ApiErrorCode;
  /** Arabic, user-facing message. */
  message: string;
  /** HTTP status code to send (defaults per code). */
  status?: number;
  detail?: string;
  model?: string;
  retryable?: boolean;
  /** Original error, retained for server-side logging only. */
  cause?: unknown;
}

const DEFAULT_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHENTICATED: 401,
  RESOURCE_EXHAUSTED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNAVAILABLE: 503,
  INVALID_ARGUMENT: 400,
  MODEL_NOT_FOUND: 404,
  EMPTY_AUDIO: 422,
  INTERNAL: 500,
};

export class ApiFailure extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly detail?: string;
  readonly model?: string;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(init: ApiFailureInit) {
    super(init.message);
    this.name = 'ApiFailure';
    this.code = init.code;
    this.status = init.status ?? DEFAULT_STATUS[init.code];
    this.detail = init.detail;
    this.model = init.model;
    this.retryable = init.retryable ?? (init.code === 'UNAVAILABLE' || init.code === 'RESOURCE_EXHAUSTED');
    this.cause = init.cause;
  }

  toBody(): ApiErrorBody {
    const error: ApiErrorBody['error'] = {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
    if (this.detail) error.detail = this.detail;
    if (this.model) error.model = this.model;
    return { error };
  }
}

export const BAD_REQUEST = (message: string, detail?: string): ApiFailure =>
  new ApiFailure({ code: 'INVALID_ARGUMENT', message, ...(detail ? { detail } : {}) });

export const INTERNAL = (message: string, cause?: unknown, detail?: string): ApiFailure =>
  new ApiFailure({ code: 'INTERNAL', message, cause, ...(detail ? { detail } : {}) });
