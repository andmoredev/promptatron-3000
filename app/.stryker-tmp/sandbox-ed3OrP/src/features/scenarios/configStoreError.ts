/**
 * Detects the one error condition every write path in this feature needs to
 * surface the same way: the FastAPI proxy answering `upstream_error` (502)
 * because the config store is unreachable or unconfigured
 * (`server/promptatron/configstore/client.py` raises `UpstreamError`, mapped
 * by `server/promptatron/errors.py` to `{code: "upstream_error"}`).
 *
 * `scenarioStore`'s own `scenariosError` / `detailError` already carry this
 * code for its reads (they run every thrown error through `toStoreError`);
 * this helper is for the writes in this feature that call `api.scenarios.*`
 * directly and catch the raw `ApiError` themselves.
 */
// @ts-nocheck


import { ApiError } from '../../api'

export function isConfigStoreUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'upstream_error'
}
