import { ZodError } from 'zod'

export type FieldErrors = Record<string, string>

/**
 * Parses an error from a failed API call.
 *
 * - ZodError or ApiError with field errors → returns a per-field error map for
 *   inline display next to form fields.
 * - Any other error → calls showToast with a human-readable message and returns
 *   an empty object.
 *
 * All user-visible messages use UK English.
 */
export function handleApiError(
  error: unknown,
  showToast: (message: string) => void,
): FieldErrors {
  if (error instanceof ZodError) {
    return flattenZodErrors(error)
  }

  if (error instanceof ApiError) {
    if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
      return error.fieldErrors
    }
    showToast(error.message)
    return {}
  }

  if (error instanceof Error) {
    showToast(error.message || 'An unexpected error occurred.')
    return {}
  }

  showToast('An unexpected error occurred.')
  return {}
}

function flattenZodErrors(error: ZodError): FieldErrors {
  const result: FieldErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !result[key]) {
      result[key] = issue.message
    }
  }
  return result
}

/** Thrown by API fetch helpers when the server responds with an error status. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Reads a non-ok fetch Response and returns an ApiError.
 *
 * Expects the response body to be JSON in the shape:
 *   { error: string }
 *   { error: string; fieldErrors: { [field]: string } }
 */
export async function responseToApiError(res: Response): Promise<ApiError> {
  let body: { error?: string; fieldErrors?: FieldErrors } = {}
  try {
    body = (await res.json()) as typeof body
  } catch {
    // Non-JSON body — fall through to status text.
  }
  return new ApiError(
    body.error ?? res.statusText ?? 'An unexpected error occurred.',
    res.status,
    body.fieldErrors,
  )
}
