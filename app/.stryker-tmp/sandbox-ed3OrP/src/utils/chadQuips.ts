/**
 * @fileoverview Chad's speech-bubble quips.
 *
 * Pure and deterministic on purpose: `FloatingChad` calls `pickQuip` from a
 * `useEffect` reacting to `runStore` status *transitions* (not renders), so
 * the same run always produces the same line — no `Math.random`, seeded off
 * `runId` with a tiny string hash instead.
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
import type { RunPhase } from '../stores/runStore';

/** The run-status transitions Chad reacts to with a quip. */
export type QuipCategory = 'thinking' | 'success' | 'error' | 'cancelled';

/**
 * 2-3 variants per category. Index 0 is the line named in the product spec;
 * the rest are just Chad being Chad.
 */
export const QUIP_VARIANTS: Record<QuipCategory, readonly string[]> = stryMutAct_9fa48("1313") ? {} : (stryCov_9fa48("1313"), {
  thinking: stryMutAct_9fa48("1314") ? [] : (stryCov_9fa48("1314"), [stryMutAct_9fa48("1315") ? "" : (stryCov_9fa48("1315"), 'Crunching tokens…'), stryMutAct_9fa48("1316") ? "" : (stryCov_9fa48("1316"), 'On it, boss.'), stryMutAct_9fa48("1317") ? "" : (stryCov_9fa48("1317"), 'Let me think on that.')]),
  success: stryMutAct_9fa48("1318") ? [] : (stryCov_9fa48("1318"), [stryMutAct_9fa48("1319") ? "" : (stryCov_9fa48("1319"), 'Nailed it. 😎'), stryMutAct_9fa48("1320") ? "" : (stryCov_9fa48("1320"), 'Boom. Done.'), stryMutAct_9fa48("1321") ? "" : (stryCov_9fa48("1321"), 'Easy money.')]),
  error: stryMutAct_9fa48("1322") ? [] : (stryCov_9fa48("1322"), [stryMutAct_9fa48("1323") ? "" : (stryCov_9fa48("1323"), "That wasn't supposed to happen."), stryMutAct_9fa48("1324") ? "" : (stryCov_9fa48("1324"), 'Uh oh.'), stryMutAct_9fa48("1325") ? "" : (stryCov_9fa48("1325"), "Well, that's new.")]),
  cancelled: stryMutAct_9fa48("1326") ? [] : (stryCov_9fa48("1326"), [stryMutAct_9fa48("1327") ? "" : (stryCov_9fa48("1327"), 'Say no more.'), stryMutAct_9fa48("1328") ? "" : (stryCov_9fa48("1328"), "Whenever you're ready."), stryMutAct_9fa48("1329") ? "" : (stryCov_9fa48("1329"), 'Aborting mission.')])
});

/**
 * Small, fast, deterministic string hash (djb2 variant). Good enough to
 * spread short strings like run ids across a handful of buckets — not a
 * cryptographic hash, and not meant to be one.
 */
function hashString(input: string): number {
  if (stryMutAct_9fa48("1330")) {
    {}
  } else {
    stryCov_9fa48("1330");
    let hash = 5381;
    for (let i = 0; stryMutAct_9fa48("1333") ? i >= input.length : stryMutAct_9fa48("1332") ? i <= input.length : stryMutAct_9fa48("1331") ? false : (stryCov_9fa48("1331", "1332", "1333"), i < input.length); stryMutAct_9fa48("1334") ? i-- : (stryCov_9fa48("1334"), i++)) {
      if (stryMutAct_9fa48("1335")) {
        {}
      } else {
        stryCov_9fa48("1335");
        hash = (stryMutAct_9fa48("1336") ? hash * 33 - input.charCodeAt(i) : (stryCov_9fa48("1336"), (stryMutAct_9fa48("1337") ? hash / 33 : (stryCov_9fa48("1337"), hash * 33)) + input.charCodeAt(i))) | 0;
      }
    }
    return Math.abs(hash);
  }
}

/** Pick one of `category`'s variants, deterministically, from `seed`. */
export function pickQuip(category: QuipCategory, seed: string): string {
  if (stryMutAct_9fa48("1338")) {
    {}
  } else {
    stryCov_9fa48("1338");
    const variants = QUIP_VARIANTS[category];
    const index = stryMutAct_9fa48("1339") ? hashString(seed) * variants.length : (stryCov_9fa48("1339"), hashString(seed) % variants.length);
    return variants[index];
  }
}

/**
 * Which quip (if any) a run-status transition earns. `null` covers phases
 * Chad stays quiet for — `streaming` (he's already reacting via his
 * expression) and `idle` (nothing happened yet).
 */
export function quipCategoryForTransition(nextStatus: RunPhase): QuipCategory | null {
  if (stryMutAct_9fa48("1340")) {
    {}
  } else {
    stryCov_9fa48("1340");
    switch (nextStatus) {
      case stryMutAct_9fa48("1342") ? "" : (stryCov_9fa48("1342"), 'starting'):
        if (stryMutAct_9fa48("1341")) {} else {
          stryCov_9fa48("1341");
          return stryMutAct_9fa48("1343") ? "" : (stryCov_9fa48("1343"), 'thinking');
        }
      case stryMutAct_9fa48("1345") ? "" : (stryCov_9fa48("1345"), 'completed'):
        if (stryMutAct_9fa48("1344")) {} else {
          stryCov_9fa48("1344");
          return stryMutAct_9fa48("1346") ? "" : (stryCov_9fa48("1346"), 'success');
        }
      case stryMutAct_9fa48("1348") ? "" : (stryCov_9fa48("1348"), 'error'):
        if (stryMutAct_9fa48("1347")) {} else {
          stryCov_9fa48("1347");
          return stryMutAct_9fa48("1349") ? "" : (stryCov_9fa48("1349"), 'error');
        }
      case stryMutAct_9fa48("1351") ? "" : (stryCov_9fa48("1351"), 'cancelled'):
        if (stryMutAct_9fa48("1350")) {} else {
          stryCov_9fa48("1350");
          return stryMutAct_9fa48("1352") ? "" : (stryCov_9fa48("1352"), 'cancelled');
        }
      default:
        if (stryMutAct_9fa48("1353")) {} else {
          stryCov_9fa48("1353");
          return null;
        }
    }
  }
}