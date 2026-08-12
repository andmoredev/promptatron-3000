/**
 * Shared error shape for every store.
 *
 * The API layer throws `ApiError` (server envelope + HTTP status) and
 * `StreamAbortedError` (caller-initiated abort). Stores never hold those
 * instances: they hold a flat, serializable `{code, message}` so that a
 * component can render an error without knowing anything about the transport.
 *
 * Aborts are *not* errors. `isAborted` is the single place that decides that,
 * and callers map it onto their own "cancelled" state instead of `error`.
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
import { ApiError, StreamAbortedError, isAbortError } from '../api';

/** The flat error record stored in every `error` field. */
export interface StoreError {
  /** `ApiError.code` (e.g. `not_found`, `validation_error`) or a fallback. */
  code: string;
  message: string;
}

/** True when the failure was a caller-initiated abort, not a real failure. */
export function isAborted(error: unknown): boolean {
  if (stryMutAct_9fa48("205")) {
    {}
  } else {
    stryCov_9fa48("205");
    return stryMutAct_9fa48("208") ? error instanceof StreamAbortedError && isAbortError(error) : stryMutAct_9fa48("207") ? false : stryMutAct_9fa48("206") ? true : (stryCov_9fa48("206", "207", "208"), error instanceof StreamAbortedError || isAbortError(error));
  }
}

/** Normalize anything thrown by the API layer into a `StoreError`. */
export function toStoreError(error: unknown): StoreError {
  if (stryMutAct_9fa48("209")) {
    {}
  } else {
    stryCov_9fa48("209");
    if (stryMutAct_9fa48("211") ? false : stryMutAct_9fa48("210") ? true : (stryCov_9fa48("210", "211"), error instanceof ApiError)) {
      if (stryMutAct_9fa48("212")) {
        {}
      } else {
        stryCov_9fa48("212");
        return stryMutAct_9fa48("213") ? {} : (stryCov_9fa48("213"), {
          code: error.code,
          message: error.message
        });
      }
    }
    if (stryMutAct_9fa48("215") ? false : stryMutAct_9fa48("214") ? true : (stryCov_9fa48("214", "215"), error instanceof StreamAbortedError)) {
      if (stryMutAct_9fa48("216")) {
        {}
      } else {
        stryCov_9fa48("216");
        return stryMutAct_9fa48("217") ? {} : (stryCov_9fa48("217"), {
          code: stryMutAct_9fa48("218") ? "" : (stryCov_9fa48("218"), 'aborted'),
          message: error.message
        });
      }
    }
    if (stryMutAct_9fa48("220") ? false : stryMutAct_9fa48("219") ? true : (stryCov_9fa48("219", "220"), error instanceof Error)) {
      if (stryMutAct_9fa48("221")) {
        {}
      } else {
        stryCov_9fa48("221");
        return stryMutAct_9fa48("222") ? {} : (stryCov_9fa48("222"), {
          code: stryMutAct_9fa48("223") ? "" : (stryCov_9fa48("223"), 'unknown_error'),
          message: error.message
        });
      }
    }
    return stryMutAct_9fa48("224") ? {} : (stryCov_9fa48("224"), {
      code: stryMutAct_9fa48("225") ? "" : (stryCov_9fa48("225"), 'unknown_error'),
      message: String(error)
    });
  }
}