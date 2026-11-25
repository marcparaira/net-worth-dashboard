const API = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

/** An API error with the server's explanation, ready to show to the user. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ValidationIssue {
  loc?: (string | number)[];
  msg?: string;
}

/** Turns FastAPI's `detail` (a message, or a list of validation issues) into one sentence. */
export function errorMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const messages = (detail as ValidationIssue[])
      .map((issue) => issue.msg?.replace(/^Value error, /, ''))
      .filter((message): message is string => Boolean(message));
    if (messages.length) return [...new Set(messages)].join('; ');
  }
  return fallback;
}

export async function apiRequest<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    signal,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(payload?.detail, `Request failed (${response.status})`));
  }
  return payload as T;
}
