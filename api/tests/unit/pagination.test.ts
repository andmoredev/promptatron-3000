import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, parseLimit } from '../../functions/common/pagination';

describe('pagination cursor', () => {
  it('round-trips a DynamoDB LastEvaluatedKey through encode/decode', () => {
    const key = { pk: 'SCENARIO#fraud-detection-comprehensive', sk: 'METADATA', GSI1PK: 'SCENARIO', GSI1SK: 'Fraud Detection' };
    const token = encodeCursor(key);

    // must be URL-safe (no +, /, or = padding)
    expect(token).not.toMatch(/[+/=]/);

    expect(decodeCursor(token)).toEqual(key);
  });

  it('rejects a malformed cursor with a 400 BadRequestError', () => {
    expect(() => decodeCursor('not-valid-base64url-json')).toThrowError(/Invalid nextToken/);
  });

  it('rejects a cursor that decodes to a non-object', () => {
    const token = Buffer.from('"just a string"', 'utf8').toString('base64url');
    expect(() => decodeCursor(token)).toThrowError(/Invalid nextToken/);
  });
});

describe('parseLimit', () => {
  it('falls back to the default when absent', () => {
    expect(parseLimit(undefined)).toBe(20);
    expect(parseLimit(null)).toBe(20);
  });

  it('clamps to the maximum page size', () => {
    expect(parseLimit('500')).toBe(20);
  });

  it('clamps to a minimum of 1', () => {
    expect(parseLimit('-5')).toBe(1);
    expect(parseLimit('0')).toBe(1);
  });

  it('parses a valid value within range', () => {
    expect(parseLimit('7')).toBe(7);
  });

  it('falls back on garbage input', () => {
    expect(parseLimit('not-a-number')).toBe(20);
  });
});
