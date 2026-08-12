/**
 * The History tab: a cursor-paginated list of past runs plus a small detail
 * cache.
 *
 * Paging follows the server's `Page<T>` envelope — `next_cursor` is opaque and
 * `null` means "no more". `loadMore` appends; anything that changes the query
 * (filters) resets the list first, because a cursor is only valid for the
 * filter set it was issued under.
 *
 * `invalidate()` is the write-side hook other stores use (see `runStore`): it
 * only marks the list stale so the History tab can refetch when it is next
 * shown, instead of firing a request behind a tab nobody is looking at.
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
import { create } from 'zustand';
import { api } from '../api';
import type { Page, RunDetail, RunListFilters, RunSummary } from '../api';
import { isAborted, toStoreError, type StoreError } from './errors';

/** The filters the History tab exposes (a subset of `RunListFilters`). */
export interface HistoryFilters {
  model_id?: string;
  scenario_id?: string;
  status?: string;
}
export interface HistoryStateData {
  items: RunSummary[];
  next_cursor: string | null;
  filters: HistoryFilters;
  loading: boolean;
  error: StoreError | null;
  /** True once a page has been fetched under the current filters. */
  loaded: boolean;
  /** Set by `invalidate()`; consumers re-fetch and it clears on the next load. */
  stale: boolean;
  /** `limit` sent with every page request. */
  pageSize: number;
  /** `getRunDetail` cache, keyed by run id. */
  details: Record<string, RunDetail>;
}
export interface HistoryActions {
  /** Fetch page 1 under the current filters, replacing `items`. */
  loadFirstPage(): Promise<void>;
  /** Fetch the next page and append. No-op without a `next_cursor`. */
  loadMore(): Promise<void>;
  /**
   * Merge `patch` into the filters, reset paging, and fetch page 1.
   * Pass `null` for a key to clear it.
   */
  setFilters(patch: Partial<Record<keyof HistoryFilters, string | null>>): Promise<void>;
  /** `DELETE /runs/{id}` then drop it from `items` and the detail cache. */
  remove(runId: string): Promise<void>;
  /** Mark the list stale. Cheap, synchronous, safe to call from anywhere. */
  invalidate(): void;
  /** Cached `GET /runs/{id}`. `force` bypasses the cache. */
  getRunDetail(runId: string, force?: boolean): Promise<RunDetail | null>;
  /** Drop everything (filters included). */
  clear(): void;
}
export type HistoryStore = HistoryStateData & HistoryActions;
export const HISTORY_PAGE_SIZE = 25;
export const INITIAL_HISTORY_STATE: HistoryStateData = stryMutAct_9fa48("617") ? {} : (stryCov_9fa48("617"), {
  items: stryMutAct_9fa48("618") ? ["Stryker was here"] : (stryCov_9fa48("618"), []),
  next_cursor: null,
  filters: {},
  loading: stryMutAct_9fa48("619") ? true : (stryCov_9fa48("619"), false),
  error: null,
  loaded: stryMutAct_9fa48("620") ? true : (stryCov_9fa48("620"), false),
  stale: stryMutAct_9fa48("621") ? true : (stryCov_9fa48("621"), false),
  pageSize: HISTORY_PAGE_SIZE,
  details: {}
});

/** In-flight detail fetches, so two consumers of one run share a request. */
const detailRequests = new Map<string, Promise<RunDetail | null>>();

/** Filters + paging -> `GET /runs` query params. */
function listParams(filters: HistoryFilters, cursor: string | null, limit: number): RunListFilters & {
  cursor?: string;
  limit: number;
} {
  if (stryMutAct_9fa48("622")) {
    {}
  } else {
    stryCov_9fa48("622");
    const params: RunListFilters & {
      cursor?: string;
      limit: number;
    } = stryMutAct_9fa48("623") ? {} : (stryCov_9fa48("623"), {
      limit
    });
    if (stryMutAct_9fa48("625") ? false : stryMutAct_9fa48("624") ? true : (stryCov_9fa48("624", "625"), filters.model_id)) params.model_id = filters.model_id;
    if (stryMutAct_9fa48("627") ? false : stryMutAct_9fa48("626") ? true : (stryCov_9fa48("626", "627"), filters.scenario_id)) params.scenario_id = filters.scenario_id;
    if (stryMutAct_9fa48("629") ? false : stryMutAct_9fa48("628") ? true : (stryCov_9fa48("628", "629"), filters.status)) params.status = filters.status;
    if (stryMutAct_9fa48("631") ? false : stryMutAct_9fa48("630") ? true : (stryCov_9fa48("630", "631"), cursor)) params.cursor = cursor;
    return params;
  }
}
export const useHistoryStore = create<HistoryStore>()(stryMutAct_9fa48("632") ? () => undefined : (stryCov_9fa48("632"), (set, get) => stryMutAct_9fa48("633") ? {} : (stryCov_9fa48("633"), {
  ...INITIAL_HISTORY_STATE,
  loadFirstPage: async () => {
    if (stryMutAct_9fa48("634")) {
      {}
    } else {
      stryCov_9fa48("634");
      set(stryMutAct_9fa48("635") ? {} : (stryCov_9fa48("635"), {
        loading: stryMutAct_9fa48("636") ? false : (stryCov_9fa48("636"), true),
        error: null
      }));
      try {
        if (stryMutAct_9fa48("637")) {
          {}
        } else {
          stryCov_9fa48("637");
          const page: Page<RunSummary> = await api.runs.list(listParams(get().filters, null, get().pageSize));
          set(stryMutAct_9fa48("638") ? {} : (stryCov_9fa48("638"), {
            items: page.items,
            next_cursor: page.next_cursor,
            loading: stryMutAct_9fa48("639") ? true : (stryCov_9fa48("639"), false),
            loaded: stryMutAct_9fa48("640") ? false : (stryCov_9fa48("640"), true),
            stale: stryMutAct_9fa48("641") ? true : (stryCov_9fa48("641"), false)
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("642")) {
          {}
        } else {
          stryCov_9fa48("642");
          if (stryMutAct_9fa48("644") ? false : stryMutAct_9fa48("643") ? true : (stryCov_9fa48("643", "644"), isAborted(error))) {
            if (stryMutAct_9fa48("645")) {
              {}
            } else {
              stryCov_9fa48("645");
              set(stryMutAct_9fa48("646") ? {} : (stryCov_9fa48("646"), {
                loading: stryMutAct_9fa48("647") ? true : (stryCov_9fa48("647"), false)
              }));
              return;
            }
          }
          set(stryMutAct_9fa48("648") ? {} : (stryCov_9fa48("648"), {
            loading: stryMutAct_9fa48("649") ? true : (stryCov_9fa48("649"), false),
            error: toStoreError(error)
          }));
        }
      }
    }
  },
  loadMore: async () => {
    if (stryMutAct_9fa48("650")) {
      {}
    } else {
      stryCov_9fa48("650");
      const {
        next_cursor,
        loading,
        filters,
        pageSize
      } = get();
      if (stryMutAct_9fa48("653") ? !next_cursor && loading : stryMutAct_9fa48("652") ? false : stryMutAct_9fa48("651") ? true : (stryCov_9fa48("651", "652", "653"), (stryMutAct_9fa48("654") ? next_cursor : (stryCov_9fa48("654"), !next_cursor)) || loading)) return;
      set(stryMutAct_9fa48("655") ? {} : (stryCov_9fa48("655"), {
        loading: stryMutAct_9fa48("656") ? false : (stryCov_9fa48("656"), true),
        error: null
      }));
      try {
        if (stryMutAct_9fa48("657")) {
          {}
        } else {
          stryCov_9fa48("657");
          const page: Page<RunSummary> = await api.runs.list(listParams(filters, next_cursor, pageSize));
          set(stryMutAct_9fa48("658") ? () => undefined : (stryCov_9fa48("658"), state => stryMutAct_9fa48("659") ? {} : (stryCov_9fa48("659"), {
            items: stryMutAct_9fa48("660") ? [] : (stryCov_9fa48("660"), [...state.items, ...page.items]),
            next_cursor: page.next_cursor,
            loading: stryMutAct_9fa48("661") ? true : (stryCov_9fa48("661"), false),
            loaded: stryMutAct_9fa48("662") ? false : (stryCov_9fa48("662"), true)
          })));
        }
      } catch (error) {
        if (stryMutAct_9fa48("663")) {
          {}
        } else {
          stryCov_9fa48("663");
          if (stryMutAct_9fa48("665") ? false : stryMutAct_9fa48("664") ? true : (stryCov_9fa48("664", "665"), isAborted(error))) {
            if (stryMutAct_9fa48("666")) {
              {}
            } else {
              stryCov_9fa48("666");
              set(stryMutAct_9fa48("667") ? {} : (stryCov_9fa48("667"), {
                loading: stryMutAct_9fa48("668") ? true : (stryCov_9fa48("668"), false)
              }));
              return;
            }
          }
          set(stryMutAct_9fa48("669") ? {} : (stryCov_9fa48("669"), {
            loading: stryMutAct_9fa48("670") ? true : (stryCov_9fa48("670"), false),
            error: toStoreError(error)
          }));
        }
      }
    }
  },
  setFilters: async patch => {
    if (stryMutAct_9fa48("671")) {
      {}
    } else {
      stryCov_9fa48("671");
      const filters: HistoryFilters = stryMutAct_9fa48("672") ? {} : (stryCov_9fa48("672"), {
        ...get().filters
      });
      for (const [key, value] of Object.entries(patch)) {
        if (stryMutAct_9fa48("673")) {
          {}
        } else {
          stryCov_9fa48("673");
          const field = key as keyof HistoryFilters;
          if (stryMutAct_9fa48("676") ? (value === null || value === undefined) && value === '' : stryMutAct_9fa48("675") ? false : stryMutAct_9fa48("674") ? true : (stryCov_9fa48("674", "675", "676"), (stryMutAct_9fa48("678") ? value === null && value === undefined : stryMutAct_9fa48("677") ? false : (stryCov_9fa48("677", "678"), (stryMutAct_9fa48("680") ? value !== null : stryMutAct_9fa48("679") ? false : (stryCov_9fa48("679", "680"), value === null)) || (stryMutAct_9fa48("682") ? value !== undefined : stryMutAct_9fa48("681") ? false : (stryCov_9fa48("681", "682"), value === undefined)))) || (stryMutAct_9fa48("684") ? value !== '' : stryMutAct_9fa48("683") ? false : (stryCov_9fa48("683", "684"), value === (stryMutAct_9fa48("685") ? "Stryker was here!" : (stryCov_9fa48("685"), '')))))) delete filters[field];else filters[field] = value;
        }
      }
      // A cursor is only valid for the filter set that issued it.
      set(stryMutAct_9fa48("686") ? {} : (stryCov_9fa48("686"), {
        filters,
        items: stryMutAct_9fa48("687") ? ["Stryker was here"] : (stryCov_9fa48("687"), []),
        next_cursor: null,
        loaded: stryMutAct_9fa48("688") ? true : (stryCov_9fa48("688"), false),
        error: null
      }));
      await get().loadFirstPage();
    }
  },
  remove: async runId => {
    if (stryMutAct_9fa48("689")) {
      {}
    } else {
      stryCov_9fa48("689");
      try {
        if (stryMutAct_9fa48("690")) {
          {}
        } else {
          stryCov_9fa48("690");
          await api.runs.remove(runId);
        }
      } catch (error) {
        if (stryMutAct_9fa48("691")) {
          {}
        } else {
          stryCov_9fa48("691");
          if (stryMutAct_9fa48("694") ? false : stryMutAct_9fa48("693") ? true : stryMutAct_9fa48("692") ? isAborted(error) : (stryCov_9fa48("692", "693", "694"), !isAborted(error))) set(stryMutAct_9fa48("695") ? {} : (stryCov_9fa48("695"), {
            error: toStoreError(error)
          }));
          return;
        }
      }
      set(state => {
        if (stryMutAct_9fa48("696")) {
          {}
        } else {
          stryCov_9fa48("696");
          const details = stryMutAct_9fa48("697") ? {} : (stryCov_9fa48("697"), {
            ...state.details
          });
          delete details[runId];
          return stryMutAct_9fa48("698") ? {} : (stryCov_9fa48("698"), {
            items: stryMutAct_9fa48("699") ? state.items : (stryCov_9fa48("699"), state.items.filter(stryMutAct_9fa48("700") ? () => undefined : (stryCov_9fa48("700"), item => stryMutAct_9fa48("703") ? item.id === runId : stryMutAct_9fa48("702") ? false : stryMutAct_9fa48("701") ? true : (stryCov_9fa48("701", "702", "703"), item.id !== runId)))),
            details
          });
        }
      });
    }
  },
  invalidate: stryMutAct_9fa48("704") ? () => undefined : (stryCov_9fa48("704"), () => set(stryMutAct_9fa48("705") ? {} : (stryCov_9fa48("705"), {
    stale: stryMutAct_9fa48("706") ? false : (stryCov_9fa48("706"), true)
  }))),
  getRunDetail: async (runId, force = stryMutAct_9fa48("707") ? true : (stryCov_9fa48("707"), false)) => {
    if (stryMutAct_9fa48("708")) {
      {}
    } else {
      stryCov_9fa48("708");
      if (stryMutAct_9fa48("711") ? false : stryMutAct_9fa48("710") ? true : stryMutAct_9fa48("709") ? force : (stryCov_9fa48("709", "710", "711"), !force)) {
        if (stryMutAct_9fa48("712")) {
          {}
        } else {
          stryCov_9fa48("712");
          const cached = get().details[runId];
          if (stryMutAct_9fa48("714") ? false : stryMutAct_9fa48("713") ? true : (stryCov_9fa48("713", "714"), cached)) return cached;
          const inFlight = detailRequests.get(runId);
          if (stryMutAct_9fa48("716") ? false : stryMutAct_9fa48("715") ? true : (stryCov_9fa48("715", "716"), inFlight)) return inFlight;
        }
      }
      const request = (async () => {
        if (stryMutAct_9fa48("717")) {
          {}
        } else {
          stryCov_9fa48("717");
          try {
            if (stryMutAct_9fa48("718")) {
              {}
            } else {
              stryCov_9fa48("718");
              const detail = await api.runs.get(runId);
              set(stryMutAct_9fa48("719") ? () => undefined : (stryCov_9fa48("719"), state => stryMutAct_9fa48("720") ? {} : (stryCov_9fa48("720"), {
                details: stryMutAct_9fa48("721") ? {} : (stryCov_9fa48("721"), {
                  ...state.details,
                  [runId]: detail
                })
              })));
              return detail;
            }
          } catch (error) {
            if (stryMutAct_9fa48("722")) {
              {}
            } else {
              stryCov_9fa48("722");
              if (stryMutAct_9fa48("725") ? false : stryMutAct_9fa48("724") ? true : stryMutAct_9fa48("723") ? isAborted(error) : (stryCov_9fa48("723", "724", "725"), !isAborted(error))) set(stryMutAct_9fa48("726") ? {} : (stryCov_9fa48("726"), {
                error: toStoreError(error)
              }));
              return null;
            }
          } finally {
            if (stryMutAct_9fa48("727")) {
              {}
            } else {
              stryCov_9fa48("727");
              detailRequests.delete(runId);
            }
          }
        }
      })();
      detailRequests.set(runId, request);
      return request;
    }
  },
  clear: () => {
    if (stryMutAct_9fa48("728")) {
      {}
    } else {
      stryCov_9fa48("728");
      detailRequests.clear();
      set(stryMutAct_9fa48("729") ? {} : (stryCov_9fa48("729"), {
        ...INITIAL_HISTORY_STATE
      }));
    }
  }
})));

/** Selector: another page is available. */
export const selectHasMore = stryMutAct_9fa48("730") ? () => undefined : (stryCov_9fa48("730"), (() => {
  const selectHasMore = (state: HistoryStateData): boolean => stryMutAct_9fa48("733") ? state.next_cursor === null : stryMutAct_9fa48("732") ? false : stryMutAct_9fa48("731") ? true : (stryCov_9fa48("731", "732", "733"), state.next_cursor !== null);
  return selectHasMore;
})());

/** Selector: the list should be refetched (never loaded, or invalidated). */
export const selectNeedsRefresh = stryMutAct_9fa48("734") ? () => undefined : (stryCov_9fa48("734"), (() => {
  const selectNeedsRefresh = (state: HistoryStateData): boolean => stryMutAct_9fa48("737") ? !state.loading || !state.loaded || state.stale : stryMutAct_9fa48("736") ? false : stryMutAct_9fa48("735") ? true : (stryCov_9fa48("735", "736", "737"), (stryMutAct_9fa48("738") ? state.loading : (stryCov_9fa48("738"), !state.loading)) && (stryMutAct_9fa48("740") ? !state.loaded && state.stale : stryMutAct_9fa48("739") ? true : (stryCov_9fa48("739", "740"), (stryMutAct_9fa48("741") ? state.loaded : (stryCov_9fa48("741"), !state.loaded)) || state.stale)));
  return selectNeedsRefresh;
})());

/** Selector: any filter is active. */
export const selectHasFilters = stryMutAct_9fa48("742") ? () => undefined : (stryCov_9fa48("742"), (() => {
  const selectHasFilters = (state: HistoryStateData): boolean => stryMutAct_9fa48("746") ? Object.keys(state.filters).length <= 0 : stryMutAct_9fa48("745") ? Object.keys(state.filters).length >= 0 : stryMutAct_9fa48("744") ? false : stryMutAct_9fa48("743") ? true : (stryCov_9fa48("743", "744", "745", "746"), Object.keys(state.filters).length > 0);
  return selectHasFilters;
})());