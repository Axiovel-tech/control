/**
 * @file Upload errors that retrying cannot fix.
 *
 * Axio Server starts the message of such a refusal with a stable `E_` code
 * (`E_ARMED`, `E_SHOW_SLOT_UNSUPPORTED`, the `.gdmb` validation codes such as
 * `E_CRC`, …). Retrying them automatically would only repeat the refusal, in
 * a loop when "retry failed uploads" is on, so the upload saga treats them as
 * permanent failures.
 */

const NON_RETRYABLE_CODE = /(?:^|[\s:])(E_[A-Z][A-Z\d_]*):\s/;

/**
 * Returns the `E_` code of a server error message that retrying cannot fix,
 * or `undefined` if the message carries no such code.
 */
export const getNonRetryableErrorCode = (message: string): string | undefined =>
  NON_RETRYABLE_CODE.exec(message)?.[1];

/**
 * Error thrown by an upload operation when the server refused it for a reason
 * that retrying cannot fix.
 */
export class NonRetryableUploadError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'NonRetryableUploadError';
    this.code = code;
  }
}

/**
 * Wraps the message of a failed upload in an error object: a
 * `NonRetryableUploadError` if the server refused it for good, a plain
 * `Error` otherwise.
 */
export const createUploadError = (message: string): Error => {
  const code = getNonRetryableErrorCode(message);
  return code ? new NonRetryableUploadError(message, code) : new Error(message);
};

export const isNonRetryableUploadError = (
  error: unknown
): error is NonRetryableUploadError => error instanceof NonRetryableUploadError;
