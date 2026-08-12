/**
 * Base fetch wrapper for the Promptatron API.
 *
 * JSON in, JSON out; every non-2xx becomes an `ApiError` built from the
 * server's error envelope (falling back to the raw body / status text), and
 * aborts become `StreamAbortedError`. No retries, no caching, no state — the
 * stores above this layer own all of that.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { ApiError, StreamAbortedError, isAbortError } from './errors';

/** Routers are mounted under this prefix (see server/promptatron/main.py). */
export const API_PREFIX = stryMutAct_9fa48("0") ? "" : (stryCov_9fa48("0"), '/api/v1');
const DEFAULT_BASE_URL = stryMutAct_9fa48("1") ? "" : (stryCov_9fa48("1"), 'http://localhost:8000');
export const NDJSON_MEDIA_TYPE = stryMutAct_9fa48("2") ? "" : (stryCov_9fa48("2"), 'application/x-ndjson');
export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

/**
 * The configured API origin, without a trailing slash and without the
 * `/api/v1` prefix (which `apiUrl` adds).
 */
export function baseUrl(): string {
  if (stryMutAct_9fa48("3")) {
    {}
  } else {
    stryCov_9fa48("3");
    const configured = stryMutAct_9fa48("4") ? import.meta.env.VITE_API_URL : (stryCov_9fa48("4"), import.meta.env?.VITE_API_URL);
    const raw = (stryMutAct_9fa48("7") ? typeof configured === 'string' || configured.trim() !== '' : stryMutAct_9fa48("6") ? false : stryMutAct_9fa48("5") ? true : (stryCov_9fa48("5", "6", "7"), (stryMutAct_9fa48("9") ? typeof configured !== 'string' : stryMutAct_9fa48("8") ? true : (stryCov_9fa48("8", "9"), typeof configured === (stryMutAct_9fa48("10") ? "" : (stryCov_9fa48("10"), 'string')))) && (stryMutAct_9fa48("12") ? configured.trim() === '' : stryMutAct_9fa48("11") ? true : (stryCov_9fa48("11", "12"), (stryMutAct_9fa48("13") ? configured : (stryCov_9fa48("13"), configured.trim())) !== (stryMutAct_9fa48("14") ? "Stryker was here!" : (stryCov_9fa48("14"), '')))))) ? configured : DEFAULT_BASE_URL;
    const trimmed = stryMutAct_9fa48("15") ? raw.replace(/\/+$/, '') : (stryCov_9fa48("15"), raw.trim().replace(stryMutAct_9fa48("17") ? /\/$/ : stryMutAct_9fa48("16") ? /\/+/ : (stryCov_9fa48("16", "17"), /\/+$/), stryMutAct_9fa48("18") ? "Stryker was here!" : (stryCov_9fa48("18"), '')));
    // Tolerate a base that already carries the version prefix.
    return (stryMutAct_9fa48("19") ? trimmed.startsWith(API_PREFIX) : (stryCov_9fa48("19"), trimmed.endsWith(API_PREFIX))) ? stryMutAct_9fa48("20") ? trimmed : (stryCov_9fa48("20"), trimmed.slice(0, stryMutAct_9fa48("21") ? +API_PREFIX.length : (stryCov_9fa48("21"), -API_PREFIX.length))) : trimmed;
  }
}

/**
 * Serialize query params, dropping `undefined`/`null` and expanding arrays into
 * repeated keys. Returns `""` when nothing survives.
 */
export function buildQuery(params?: QueryParams): string {
  if (stryMutAct_9fa48("22")) {
    {}
  } else {
    stryCov_9fa48("22");
    if (stryMutAct_9fa48("25") ? false : stryMutAct_9fa48("24") ? true : stryMutAct_9fa48("23") ? params : (stryCov_9fa48("23", "24", "25"), !params)) return stryMutAct_9fa48("26") ? "Stryker was here!" : (stryCov_9fa48("26"), '');
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (stryMutAct_9fa48("27")) {
        {}
      } else {
        stryCov_9fa48("27");
        const values = Array.isArray(value) ? value : stryMutAct_9fa48("28") ? [] : (stryCov_9fa48("28"), [value]);
        for (const item of values) {
          if (stryMutAct_9fa48("29")) {
            {}
          } else {
            stryCov_9fa48("29");
            if (stryMutAct_9fa48("32") ? item === undefined && item === null : stryMutAct_9fa48("31") ? false : stryMutAct_9fa48("30") ? true : (stryCov_9fa48("30", "31", "32"), (stryMutAct_9fa48("34") ? item !== undefined : stryMutAct_9fa48("33") ? false : (stryCov_9fa48("33", "34"), item === undefined)) || (stryMutAct_9fa48("36") ? item !== null : stryMutAct_9fa48("35") ? false : (stryCov_9fa48("35", "36"), item === null)))) continue;
            search.append(key, String(item));
          }
        }
      }
    }
    const query = search.toString();
    return (stryMutAct_9fa48("39") ? query !== '' : stryMutAct_9fa48("38") ? false : stryMutAct_9fa48("37") ? true : (stryCov_9fa48("37", "38", "39"), query === (stryMutAct_9fa48("40") ? "Stryker was here!" : (stryCov_9fa48("40"), '')))) ? stryMutAct_9fa48("41") ? "Stryker was here!" : (stryCov_9fa48("41"), '') : stryMutAct_9fa48("42") ? `` : (stryCov_9fa48("42"), `?${query}`);
  }
}

/** Absolute URL for an API path (path is relative to `/api/v1`). */
export function apiUrl(path: string, params?: QueryParams): string {
  if (stryMutAct_9fa48("43")) {
    {}
  } else {
    stryCov_9fa48("43");
    const suffix = (stryMutAct_9fa48("44") ? path.endsWith('/') : (stryCov_9fa48("44"), path.startsWith(stryMutAct_9fa48("45") ? "" : (stryCov_9fa48("45"), '/')))) ? path : stryMutAct_9fa48("46") ? `` : (stryCov_9fa48("46"), `/${path}`);
    return stryMutAct_9fa48("47") ? `` : (stryCov_9fa48("47"), `${baseUrl()}${API_PREFIX}${suffix}${buildQuery(params)}`);
  }
}
export interface RequestOptions {
  /** Query string parameters. */
  query?: QueryParams;
  /** JSON request body. Omit for bodyless methods. */
  body?: unknown;
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Perform a JSON request, returning the parsed body (`undefined` for 204). */
export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  if (stryMutAct_9fa48("48")) {
    {}
  } else {
    stryCov_9fa48("48");
    const headers: Record<string, string> = stryMutAct_9fa48("49") ? {} : (stryCov_9fa48("49"), {
      accept: stryMutAct_9fa48("50") ? "" : (stryCov_9fa48("50"), 'application/json'),
      ...options.headers
    });
    let body: string | undefined;
    if (stryMutAct_9fa48("53") ? options.body === undefined : stryMutAct_9fa48("52") ? false : stryMutAct_9fa48("51") ? true : (stryCov_9fa48("51", "52", "53"), options.body !== undefined)) {
      if (stryMutAct_9fa48("54")) {
        {}
      } else {
        stryCov_9fa48("54");
        headers[stryMutAct_9fa48("55") ? "" : (stryCov_9fa48("55"), 'content-type')] = stryMutAct_9fa48("56") ? headers['content-type'] && 'application/json' : (stryCov_9fa48("56"), headers[stryMutAct_9fa48("57") ? "" : (stryCov_9fa48("57"), 'content-type')] ?? (stryMutAct_9fa48("58") ? "" : (stryCov_9fa48("58"), 'application/json')));
        body = JSON.stringify(options.body);
      }
    }
    let response: Response;
    try {
      if (stryMutAct_9fa48("59")) {
        {}
      } else {
        stryCov_9fa48("59");
        response = await fetch(apiUrl(path, options.query), stryMutAct_9fa48("60") ? {} : (stryCov_9fa48("60"), {
          method,
          headers,
          body,
          signal: options.signal
        }));
      }
    } catch (error) {
      if (stryMutAct_9fa48("61")) {
        {}
      } else {
        stryCov_9fa48("61");
        if (stryMutAct_9fa48("64") ? isAbortError(error) && options.signal?.aborted : stryMutAct_9fa48("63") ? false : stryMutAct_9fa48("62") ? true : (stryCov_9fa48("62", "63", "64"), isAbortError(error) || (stryMutAct_9fa48("65") ? options.signal.aborted : (stryCov_9fa48("65"), options.signal?.aborted)))) throw new StreamAbortedError();
        throw new ApiError(error instanceof Error ? error.message : stryMutAct_9fa48("66") ? "" : (stryCov_9fa48("66"), 'Network request failed'), stryMutAct_9fa48("67") ? {} : (stryCov_9fa48("67"), {
          code: stryMutAct_9fa48("68") ? "" : (stryCov_9fa48("68"), 'network_error')
        }));
      }
    }
    if (stryMutAct_9fa48("71") ? false : stryMutAct_9fa48("70") ? true : stryMutAct_9fa48("69") ? response.ok : (stryCov_9fa48("69", "70", "71"), !response.ok)) {
      if (stryMutAct_9fa48("72")) {
        {}
      } else {
        stryCov_9fa48("72");
        throw ApiError.fromBody(response.status, response.statusText, await readText(response));
      }
    }
    return (await readJson<T>(response)) as T;
  }
}

/** Read a successful response's body as JSON; `undefined` when empty/204. */
async function readJson<T>(response: Response): Promise<T | undefined> {
  if (stryMutAct_9fa48("73")) {
    {}
  } else {
    stryCov_9fa48("73");
    if (stryMutAct_9fa48("76") ? response.status === 204 && response.status === 205 : stryMutAct_9fa48("75") ? false : stryMutAct_9fa48("74") ? true : (stryCov_9fa48("74", "75", "76"), (stryMutAct_9fa48("78") ? response.status !== 204 : stryMutAct_9fa48("77") ? false : (stryCov_9fa48("77", "78"), response.status === 204)) || (stryMutAct_9fa48("80") ? response.status !== 205 : stryMutAct_9fa48("79") ? false : (stryCov_9fa48("79", "80"), response.status === 205)))) return undefined;
    const text = await readText(response);
    if (stryMutAct_9fa48("83") ? text === null && text.trim() === '' : stryMutAct_9fa48("82") ? false : stryMutAct_9fa48("81") ? true : (stryCov_9fa48("81", "82", "83"), (stryMutAct_9fa48("85") ? text !== null : stryMutAct_9fa48("84") ? false : (stryCov_9fa48("84", "85"), text === null)) || (stryMutAct_9fa48("87") ? text.trim() !== '' : stryMutAct_9fa48("86") ? false : (stryCov_9fa48("86", "87"), (stryMutAct_9fa48("88") ? text : (stryCov_9fa48("88"), text.trim())) === (stryMutAct_9fa48("89") ? "Stryker was here!" : (stryCov_9fa48("89"), '')))))) return undefined;
    try {
      if (stryMutAct_9fa48("90")) {
        {}
      } else {
        stryCov_9fa48("90");
        return JSON.parse(text) as T;
      }
    } catch {
      if (stryMutAct_9fa48("91")) {
        {}
      } else {
        stryCov_9fa48("91");
        throw new ApiError(stryMutAct_9fa48("92") ? "" : (stryCov_9fa48("92"), 'Response body was not valid JSON'), stryMutAct_9fa48("93") ? {} : (stryCov_9fa48("93"), {
          code: stryMutAct_9fa48("94") ? "" : (stryCov_9fa48("94"), 'invalid_response'),
          status: response.status,
          body: text
        }));
      }
    }
  }
}
async function readText(response: Response): Promise<string | null> {
  if (stryMutAct_9fa48("95")) {
    {}
  } else {
    stryCov_9fa48("95");
    try {
      if (stryMutAct_9fa48("96")) {
        {}
      } else {
        stryCov_9fa48("96");
        return await response.text();
      }
    } catch {
      if (stryMutAct_9fa48("97")) {
        {}
      } else {
        stryCov_9fa48("97");
        return null;
      }
    }
  }
}
export const http = stryMutAct_9fa48("98") ? {} : (stryCov_9fa48("98"), {
  get: stryMutAct_9fa48("99") ? () => undefined : (stryCov_9fa48("99"), <T,>(path: string, options: Omit<RequestOptions, 'body'> = {}): Promise<T> => request<T>(stryMutAct_9fa48("100") ? "" : (stryCov_9fa48("100"), 'GET'), path, options)),
  post: stryMutAct_9fa48("101") ? () => undefined : (stryCov_9fa48("101"), <T,>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> => request<T>(stryMutAct_9fa48("102") ? "" : (stryCov_9fa48("102"), 'POST'), path, stryMutAct_9fa48("103") ? {} : (stryCov_9fa48("103"), {
    ...options,
    body
  }))),
  put: stryMutAct_9fa48("104") ? () => undefined : (stryCov_9fa48("104"), <T,>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> => request<T>(stryMutAct_9fa48("105") ? "" : (stryCov_9fa48("105"), 'PUT'), path, stryMutAct_9fa48("106") ? {} : (stryCov_9fa48("106"), {
    ...options,
    body
  }))),
  patch: stryMutAct_9fa48("107") ? () => undefined : (stryCov_9fa48("107"), <T,>(path: string, body?: unknown, options: Omit<RequestOptions, 'body'> = {}): Promise<T> => request<T>(stryMutAct_9fa48("108") ? "" : (stryCov_9fa48("108"), 'PATCH'), path, stryMutAct_9fa48("109") ? {} : (stryCov_9fa48("109"), {
    ...options,
    body
  }))),
  delete: stryMutAct_9fa48("110") ? () => undefined : (stryCov_9fa48("110"), <T = void,>(path: string, options: RequestOptions = {}): Promise<T> => request<T>(stryMutAct_9fa48("111") ? "" : (stryCov_9fa48("111"), 'DELETE'), path, options))
});