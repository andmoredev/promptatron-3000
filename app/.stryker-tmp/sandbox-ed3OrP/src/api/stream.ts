/**
 * NDJSON stream consumer.
 *
 * The server writes one JSON object per line (`event.model_dump_json() + "\n"`,
 * see server/promptatron/engine/events.py) and flushes as it goes, so a chunk
 * boundary can land anywhere — mid-line, between lines, or several lines at
 * once. This module buffers across chunks, tolerates CRLF, ignores blank lines,
 * and parses a trailing line that never got its newline before EOF.
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
import { apiUrl, NDJSON_MEDIA_TYPE, type QueryParams } from './http';

/**
 * The subset of `fetch`'s init this module builds. Spelled out structurally
 * because the ambient `RequestInit` type name trips the repo's core `no-undef`
 * lint rule, which is not TypeScript-aware.
 */
interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}
export interface StreamOptions<T> {
  /** Called once per parsed line, in stream order. */
  onEvent: (event: T) => void;
  signal?: AbortSignal;
  /** Extra headers merged over the defaults. */
  headers?: Record<string, string>;
}
export interface GetStreamOptions<T> extends StreamOptions<T> {
  query?: QueryParams;
}

/**
 * POST `body` to `path` and consume the NDJSON response.
 *
 * Resolves when the server closes the stream. Rejects with `ApiError` if the
 * response is non-2xx (the error envelope is read from the body first) and with
 * `StreamAbortedError` if `opts.signal` aborts mid-stream — in which case the
 * underlying reader is cancelled so the server sees the disconnect (and records
 * the run as `cancelled`).
 */
export async function streamNdjson<T>(path: string, body: unknown, opts: StreamOptions<T>): Promise<void> {
  if (stryMutAct_9fa48("112")) {
    {}
  } else {
    stryCov_9fa48("112");
    return consume(path, stryMutAct_9fa48("113") ? {} : (stryCov_9fa48("113"), {
      method: stryMutAct_9fa48("114") ? "" : (stryCov_9fa48("114"), 'POST'),
      headers: stryMutAct_9fa48("115") ? {} : (stryCov_9fa48("115"), {
        accept: NDJSON_MEDIA_TYPE,
        'content-type': stryMutAct_9fa48("116") ? "" : (stryCov_9fa48("116"), 'application/json'),
        ...opts.headers
      }),
      body: JSON.stringify(stryMutAct_9fa48("117") ? body && {} : (stryCov_9fa48("117"), body ?? {})),
      signal: opts.signal
    }), opts);
  }
}

/** GET `path` and consume the NDJSON response (evaluation events, exports). */
export async function getNdjson<T>(path: string, opts: GetStreamOptions<T>): Promise<void> {
  if (stryMutAct_9fa48("118")) {
    {}
  } else {
    stryCov_9fa48("118");
    return consume(path, stryMutAct_9fa48("119") ? {} : (stryCov_9fa48("119"), {
      method: stryMutAct_9fa48("120") ? "" : (stryCov_9fa48("120"), 'GET'),
      headers: stryMutAct_9fa48("121") ? {} : (stryCov_9fa48("121"), {
        accept: NDJSON_MEDIA_TYPE,
        ...opts.headers
      }),
      signal: opts.signal
    }), opts, opts.query);
  }
}
async function consume<T>(path: string, init: FetchInit, opts: StreamOptions<T>, query?: QueryParams): Promise<void> {
  if (stryMutAct_9fa48("122")) {
    {}
  } else {
    stryCov_9fa48("122");
    const {
      signal
    } = opts;
    if (stryMutAct_9fa48("125") ? signal.aborted : stryMutAct_9fa48("124") ? false : stryMutAct_9fa48("123") ? true : (stryCov_9fa48("123", "124", "125"), signal?.aborted)) throw new StreamAbortedError();
    let response: Response;
    try {
      if (stryMutAct_9fa48("126")) {
        {}
      } else {
        stryCov_9fa48("126");
        response = await fetch(apiUrl(path, query), init);
      }
    } catch (error) {
      if (stryMutAct_9fa48("127")) {
        {}
      } else {
        stryCov_9fa48("127");
        if (stryMutAct_9fa48("130") ? isAbortError(error) && signal?.aborted : stryMutAct_9fa48("129") ? false : stryMutAct_9fa48("128") ? true : (stryCov_9fa48("128", "129", "130"), isAbortError(error) || (stryMutAct_9fa48("131") ? signal.aborted : (stryCov_9fa48("131"), signal?.aborted)))) throw new StreamAbortedError();
        throw new ApiError(error instanceof Error ? error.message : stryMutAct_9fa48("132") ? "" : (stryCov_9fa48("132"), 'Network request failed'), stryMutAct_9fa48("133") ? {} : (stryCov_9fa48("133"), {
          code: stryMutAct_9fa48("134") ? "" : (stryCov_9fa48("134"), 'network_error')
        }));
      }
    }
    if (stryMutAct_9fa48("137") ? false : stryMutAct_9fa48("136") ? true : stryMutAct_9fa48("135") ? response.ok : (stryCov_9fa48("135", "136", "137"), !response.ok)) {
      if (stryMutAct_9fa48("138")) {
        {}
      } else {
        stryCov_9fa48("138");
        let text: string | null = null;
        try {
          if (stryMutAct_9fa48("139")) {
            {}
          } else {
            stryCov_9fa48("139");
            text = await response.text();
          }
        } catch {
          if (stryMutAct_9fa48("140")) {
            {}
          } else {
            stryCov_9fa48("140");
            text = null;
          }
        }
        throw ApiError.fromBody(response.status, response.statusText, text);
      }
    }
    if (stryMutAct_9fa48("143") ? false : stryMutAct_9fa48("142") ? true : stryMutAct_9fa48("141") ? response.body : (stryCov_9fa48("141", "142", "143"), !response.body)) {
      if (stryMutAct_9fa48("144")) {
        {}
      } else {
        stryCov_9fa48("144");
        throw new ApiError(stryMutAct_9fa48("145") ? "" : (stryCov_9fa48("145"), 'Response carried no readable body'), stryMutAct_9fa48("146") ? {} : (stryCov_9fa48("146"), {
          code: stryMutAct_9fa48("147") ? "" : (stryCov_9fa48("147"), 'stream_unavailable'),
          status: response.status
        }));
      }
    }
    await readLines(response.body, opts);
  }
}
async function readLines<T>(stream: ReadableStream<Uint8Array>, opts: StreamOptions<T>) {
  if (stryMutAct_9fa48("148")) {
    {}
  } else {
    stryCov_9fa48("148");
    const {
      onEvent,
      signal
    } = opts;
    const reader = stream.getReader();
    const decoder = new TextDecoder(stryMutAct_9fa48("149") ? "" : (stryCov_9fa48("149"), 'utf-8'));
    let buffer = stryMutAct_9fa48("150") ? "Stryker was here!" : (stryCov_9fa48("150"), '');

    // Cancelling the reader on abort is what surfaces the disconnect to the
    // server; it also unblocks the pending read() so the loop can exit.
    const onAbort = () => {
      if (stryMutAct_9fa48("151")) {
        {}
      } else {
        stryCov_9fa48("151");
        void reader.cancel(new StreamAbortedError()).catch(() => undefined);
      }
    };
    stryMutAct_9fa48("152") ? signal.addEventListener('abort', onAbort, {
      once: true
    }) : (stryCov_9fa48("152"), signal?.addEventListener(stryMutAct_9fa48("153") ? "" : (stryCov_9fa48("153"), 'abort'), onAbort, stryMutAct_9fa48("154") ? {} : (stryCov_9fa48("154"), {
      once: stryMutAct_9fa48("155") ? false : (stryCov_9fa48("155"), true)
    })));
    try {
      if (stryMutAct_9fa48("156")) {
        {}
      } else {
        stryCov_9fa48("156");
        if (stryMutAct_9fa48("157")) {
          for (; false;) {
            const {
              done,
              value
            } = await reader.read();
            if (signal?.aborted) throw new StreamAbortedError();
            if (done) {
              // Flush any bytes the decoder is still holding, then the final line.
              buffer += decoder.decode();
              emitLine(buffer, onEvent, signal);
              return;
            }
            buffer += decoder.decode(value, {
              stream: true
            });
            let newlineAt = buffer.indexOf('\n');
            while (newlineAt !== -1) {
              const line = buffer.slice(0, newlineAt);
              buffer = buffer.slice(newlineAt + 1);
              emitLine(line, onEvent, signal);
              newlineAt = buffer.indexOf('\n');
            }
          }
        } else {
          stryCov_9fa48("157");
          for (;;) {
            if (stryMutAct_9fa48("158")) {
              {}
            } else {
              stryCov_9fa48("158");
              const {
                done,
                value
              } = await reader.read();
              if (stryMutAct_9fa48("161") ? signal.aborted : stryMutAct_9fa48("160") ? false : stryMutAct_9fa48("159") ? true : (stryCov_9fa48("159", "160", "161"), signal?.aborted)) throw new StreamAbortedError();
              if (stryMutAct_9fa48("163") ? false : stryMutAct_9fa48("162") ? true : (stryCov_9fa48("162", "163"), done)) {
                if (stryMutAct_9fa48("164")) {
                  {}
                } else {
                  stryCov_9fa48("164");
                  // Flush any bytes the decoder is still holding, then the final line.
                  stryMutAct_9fa48("165") ? buffer -= decoder.decode() : (stryCov_9fa48("165"), buffer += decoder.decode());
                  emitLine(buffer, onEvent, signal);
                  return;
                }
              }
              stryMutAct_9fa48("166") ? buffer -= decoder.decode(value, {
                stream: true
              }) : (stryCov_9fa48("166"), buffer += decoder.decode(value, stryMutAct_9fa48("167") ? {} : (stryCov_9fa48("167"), {
                stream: stryMutAct_9fa48("168") ? false : (stryCov_9fa48("168"), true)
              })));
              let newlineAt = buffer.indexOf(stryMutAct_9fa48("169") ? "" : (stryCov_9fa48("169"), '\n'));
              while (stryMutAct_9fa48("171") ? newlineAt === -1 : stryMutAct_9fa48("170") ? false : (stryCov_9fa48("170", "171"), newlineAt !== (stryMutAct_9fa48("172") ? +1 : (stryCov_9fa48("172"), -1)))) {
                if (stryMutAct_9fa48("173")) {
                  {}
                } else {
                  stryCov_9fa48("173");
                  const line = stryMutAct_9fa48("174") ? buffer : (stryCov_9fa48("174"), buffer.slice(0, newlineAt));
                  buffer = stryMutAct_9fa48("175") ? buffer : (stryCov_9fa48("175"), buffer.slice(stryMutAct_9fa48("176") ? newlineAt - 1 : (stryCov_9fa48("176"), newlineAt + 1)));
                  emitLine(line, onEvent, signal);
                  newlineAt = buffer.indexOf(stryMutAct_9fa48("177") ? "" : (stryCov_9fa48("177"), '\n'));
                }
              }
            }
          }
        }
      }
    } catch (error) {
      if (stryMutAct_9fa48("178")) {
        {}
      } else {
        stryCov_9fa48("178");
        if (stryMutAct_9fa48("181") ? isAbortError(error) && signal?.aborted : stryMutAct_9fa48("180") ? false : stryMutAct_9fa48("179") ? true : (stryCov_9fa48("179", "180", "181"), isAbortError(error) || (stryMutAct_9fa48("182") ? signal.aborted : (stryCov_9fa48("182"), signal?.aborted)))) {
          if (stryMutAct_9fa48("183")) {
            {}
          } else {
            stryCov_9fa48("183");
            void reader.cancel(new StreamAbortedError()).catch(() => undefined);
            throw new StreamAbortedError();
          }
        }
        void reader.cancel(error).catch(() => undefined);
        throw error;
      }
    } finally {
      if (stryMutAct_9fa48("184")) {
        {}
      } else {
        stryCov_9fa48("184");
        stryMutAct_9fa48("185") ? signal.removeEventListener('abort', onAbort) : (stryCov_9fa48("185"), signal?.removeEventListener(stryMutAct_9fa48("186") ? "" : (stryCov_9fa48("186"), 'abort'), onAbort));
      }
    }
  }
}

/** Parse one NDJSON line and dispatch it. Blank lines are skipped. */
function emitLine<T>(rawLine: string, onEvent: (event: T) => void, signal?: AbortSignal): void {
  if (stryMutAct_9fa48("187")) {
    {}
  } else {
    stryCov_9fa48("187");
    // Tolerate CRLF: the split is on "\n", so "\r" can survive on the tail.
    const line = stryMutAct_9fa48("188") ? rawLine.replace(/\r$/, '') : (stryCov_9fa48("188"), rawLine.replace(stryMutAct_9fa48("189") ? /\r/ : (stryCov_9fa48("189"), /\r$/), stryMutAct_9fa48("190") ? "Stryker was here!" : (stryCov_9fa48("190"), '')).trim());
    if (stryMutAct_9fa48("193") ? line !== '' : stryMutAct_9fa48("192") ? false : stryMutAct_9fa48("191") ? true : (stryCov_9fa48("191", "192", "193"), line === (stryMutAct_9fa48("194") ? "Stryker was here!" : (stryCov_9fa48("194"), '')))) return;
    if (stryMutAct_9fa48("197") ? signal.aborted : stryMutAct_9fa48("196") ? false : stryMutAct_9fa48("195") ? true : (stryCov_9fa48("195", "196", "197"), signal?.aborted)) throw new StreamAbortedError();
    let parsed: T;
    try {
      if (stryMutAct_9fa48("198")) {
        {}
      } else {
        stryCov_9fa48("198");
        parsed = JSON.parse(line) as T;
      }
    } catch {
      if (stryMutAct_9fa48("199")) {
        {}
      } else {
        stryCov_9fa48("199");
        throw new ApiError(stryMutAct_9fa48("200") ? "" : (stryCov_9fa48("200"), 'Malformed NDJSON line in stream'), stryMutAct_9fa48("201") ? {} : (stryCov_9fa48("201"), {
          code: stryMutAct_9fa48("202") ? "" : (stryCov_9fa48("202"), 'invalid_stream_line'),
          detail: stryMutAct_9fa48("203") ? {} : (stryCov_9fa48("203"), {
            line: stryMutAct_9fa48("204") ? line : (stryCov_9fa48("204"), line.slice(0, 500))
          })
        }));
      }
    }
    onEvent(parsed);
  }
}