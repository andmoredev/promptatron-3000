import { describe, expect, it } from 'vitest';
import { json, readJsonBody } from '../../functions/common/http';

const reqWithBody = (body: string | null, init?: RequestInit) =>
  new Request('https://example.test/x', { method: 'POST', body: body ?? undefined, ...init });

describe('readJsonBody', () => {
  it('parses a well-formed JSON object body', async () => {
    const req = reqWithBody(JSON.stringify({ name: 'Analyst' }), {
      headers: { 'content-type': 'application/json' },
    });
    await expect(readJsonBody(req)).resolves.toEqual({ name: 'Analyst' });
  });

  it('resolves to an empty object for malformed JSON', async () => {
    const req = new Request('https://example.test/x', { method: 'POST', body: 'not-json{' });
    await expect(readJsonBody(req)).resolves.toEqual({});
  });

  it('resolves to an empty object when the body is a JSON array', async () => {
    const req = reqWithBody(JSON.stringify([1, 2, 3]));
    await expect(readJsonBody(req)).resolves.toEqual({});
  });

  it('resolves to an empty object when the body is a bare JSON scalar', async () => {
    const req = reqWithBody(JSON.stringify('just a string'));
    await expect(readJsonBody(req)).resolves.toEqual({});
  });

  it('resolves to an empty object when there is no body at all', async () => {
    const req = new Request('https://example.test/x', { method: 'GET' });
    await expect(readJsonBody(req)).resolves.toEqual({});
  });
});

describe('json', () => {
  it('defaults to status 200', async () => {
    const res = json({ ok: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('honors an explicit status code', async () => {
    const res = json({ id: 'abc' }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'abc' });
  });
});
