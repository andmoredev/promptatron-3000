import { BadRequestError } from '@aws-lambda-powertools/event-handler/http';

/**
 * Pagination cursors are the DynamoDB `LastEvaluatedKey`/`ExclusiveStartKey`
 * JSON payload, base64url encoded. This is a config store, not a secrets API,
 * so there is no encryption layer here -- just an opaque, URL-safe token.
 */
export const encodeCursor = (key: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');

export const decodeCursor = (token: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid cursor shape');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestError('Invalid nextToken');
  }
};

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 20;

export const parseLimit = (
  raw: string | null | undefined,
  fallback = DEFAULT_PAGE_SIZE,
  max = MAX_PAGE_SIZE
): number => {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(1, Math.min(max, n));
};
