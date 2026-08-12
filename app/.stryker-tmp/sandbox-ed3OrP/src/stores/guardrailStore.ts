/**
 * The Guardrails tab: the guardrail list, per-guardrail detail/version caches,
 * and the CRUD wrappers around `api.guardrails`.
 *
 * Bedrock's model is DRAFT-plus-versions: `get`/`update` act on the mutable
 * DRAFT working copy, and `publishVersion` freezes it into a numbered version.
 * Anything that mutates a guardrail invalidates its cached detail, because the
 * server returns the *new* DRAFT and the list row's `status` may still be
 * `UPDATING`/`VERSIONING` for a moment.
 *
 * Wire casing here is camelCase (see `api/types.ts`).
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
import type { GuardrailConfig, GuardrailDetail, GuardrailSummary, GuardrailVersionSummary } from '../api';
import { isAborted, toStoreError, type StoreError } from './errors';
export interface GuardrailStateData {
  guardrails: GuardrailSummary[];
  loading: boolean;
  loaded: boolean;
  error: StoreError | null;

  /** Detail cache keyed by `id` for the DRAFT, `id@version` for a version. */
  details: Record<string, GuardrailDetail>;
  detailLoading: Record<string, boolean>;

  /** `GET /guardrails/{id}/versions`, keyed by guardrail id. */
  versions: Record<string, GuardrailVersionSummary[]>;

  /** True while a create/update/delete/publish is in flight. */
  saving: boolean;
  saveError: StoreError | null;
}
export interface GuardrailActions {
  /** `GET /guardrails`. Idempotent unless `force`. */
  loadGuardrails(force?: boolean): Promise<void>;
  /** `GET /guardrails/{id}` (DRAFT unless `version`). Cached unless `force`. */
  loadGuardrail(guardrailId: string, version?: string, force?: boolean): Promise<GuardrailDetail | null>;
  /** `POST /guardrails` -> 201. Returns the new detail, or `null` on failure. */
  createGuardrail(config: GuardrailConfig): Promise<GuardrailDetail | null>;
  /** `PUT /guardrails/{id}` — updates the DRAFT working copy. */
  updateGuardrail(guardrailId: string, config: GuardrailConfig): Promise<GuardrailDetail | null>;
  /** `DELETE /guardrails/{id}`; a numbered `version` deletes just that version. */
  removeGuardrail(guardrailId: string, version?: string): Promise<boolean>;
  /** `GET /guardrails/{id}/versions` (includes DRAFT). */
  loadVersions(guardrailId: string, force?: boolean): Promise<GuardrailVersionSummary[]>;
  /** `POST /guardrails/{id}/versions` — publish the current DRAFT. */
  publishVersion(guardrailId: string, description?: string): Promise<GuardrailVersionSummary | null>;
  /** Drop a cached detail (and its versions) so the next load refetches. */
  invalidateGuardrail(guardrailId: string): void;
  clear(): void;
}
export type GuardrailStore = GuardrailStateData & GuardrailActions;
export const INITIAL_GUARDRAIL_STATE: GuardrailStateData = stryMutAct_9fa48("436") ? {} : (stryCov_9fa48("436"), {
  guardrails: stryMutAct_9fa48("437") ? ["Stryker was here"] : (stryCov_9fa48("437"), []),
  loading: stryMutAct_9fa48("438") ? true : (stryCov_9fa48("438"), false),
  loaded: stryMutAct_9fa48("439") ? true : (stryCov_9fa48("439"), false),
  error: null,
  details: {},
  detailLoading: {},
  versions: {},
  saving: stryMutAct_9fa48("440") ? true : (stryCov_9fa48("440"), false),
  saveError: null
});

/** Cache key for a guardrail detail: the DRAFT is the bare id. */
export function guardrailCacheKey(guardrailId: string, version?: string): string {
  if (stryMutAct_9fa48("441")) {
    {}
  } else {
    stryCov_9fa48("441");
    return version ? stryMutAct_9fa48("442") ? `` : (stryCov_9fa48("442"), `${guardrailId}@${version}`) : guardrailId;
  }
}
let listRequest: Promise<void> | null = null;
export const useGuardrailStore = create<GuardrailStore>()(stryMutAct_9fa48("443") ? () => undefined : (stryCov_9fa48("443"), (set, get) => stryMutAct_9fa48("444") ? {} : (stryCov_9fa48("444"), {
  ...INITIAL_GUARDRAIL_STATE,
  loadGuardrails: (force = stryMutAct_9fa48("445") ? true : (stryCov_9fa48("445"), false)) => {
    if (stryMutAct_9fa48("446")) {
      {}
    } else {
      stryCov_9fa48("446");
      if (stryMutAct_9fa48("449") ? false : stryMutAct_9fa48("448") ? true : stryMutAct_9fa48("447") ? force : (stryCov_9fa48("447", "448", "449"), !force)) {
        if (stryMutAct_9fa48("450")) {
          {}
        } else {
          stryCov_9fa48("450");
          if (stryMutAct_9fa48("452") ? false : stryMutAct_9fa48("451") ? true : (stryCov_9fa48("451", "452"), listRequest)) return listRequest;
          if (stryMutAct_9fa48("454") ? false : stryMutAct_9fa48("453") ? true : (stryCov_9fa48("453", "454"), get().loaded)) return Promise.resolve();
        }
      }
      set(stryMutAct_9fa48("455") ? {} : (stryCov_9fa48("455"), {
        loading: stryMutAct_9fa48("456") ? false : (stryCov_9fa48("456"), true),
        error: null
      }));
      listRequest = (async () => {
        if (stryMutAct_9fa48("457")) {
          {}
        } else {
          stryCov_9fa48("457");
          try {
            if (stryMutAct_9fa48("458")) {
              {}
            } else {
              stryCov_9fa48("458");
              const response = await api.guardrails.list();
              set(stryMutAct_9fa48("459") ? {} : (stryCov_9fa48("459"), {
                guardrails: response.guardrails,
                loading: stryMutAct_9fa48("460") ? true : (stryCov_9fa48("460"), false),
                loaded: stryMutAct_9fa48("461") ? false : (stryCov_9fa48("461"), true)
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("462")) {
              {}
            } else {
              stryCov_9fa48("462");
              if (stryMutAct_9fa48("464") ? false : stryMutAct_9fa48("463") ? true : (stryCov_9fa48("463", "464"), isAborted(error))) {
                if (stryMutAct_9fa48("465")) {
                  {}
                } else {
                  stryCov_9fa48("465");
                  set(stryMutAct_9fa48("466") ? {} : (stryCov_9fa48("466"), {
                    loading: stryMutAct_9fa48("467") ? true : (stryCov_9fa48("467"), false)
                  }));
                  return;
                }
              }
              set(stryMutAct_9fa48("468") ? {} : (stryCov_9fa48("468"), {
                loading: stryMutAct_9fa48("469") ? true : (stryCov_9fa48("469"), false),
                error: toStoreError(error)
              }));
            }
          } finally {
            if (stryMutAct_9fa48("470")) {
              {}
            } else {
              stryCov_9fa48("470");
              listRequest = null;
            }
          }
        }
      })();
      return listRequest;
    }
  },
  loadGuardrail: async (guardrailId, version, force = stryMutAct_9fa48("471") ? true : (stryCov_9fa48("471"), false)) => {
    if (stryMutAct_9fa48("472")) {
      {}
    } else {
      stryCov_9fa48("472");
      const key = guardrailCacheKey(guardrailId, version);
      if (stryMutAct_9fa48("475") ? false : stryMutAct_9fa48("474") ? true : stryMutAct_9fa48("473") ? force : (stryCov_9fa48("473", "474", "475"), !force)) {
        if (stryMutAct_9fa48("476")) {
          {}
        } else {
          stryCov_9fa48("476");
          const cached = get().details[key];
          if (stryMutAct_9fa48("478") ? false : stryMutAct_9fa48("477") ? true : (stryCov_9fa48("477", "478"), cached)) return cached;
        }
      }
      set(stryMutAct_9fa48("479") ? () => undefined : (stryCov_9fa48("479"), state => stryMutAct_9fa48("480") ? {} : (stryCov_9fa48("480"), {
        detailLoading: stryMutAct_9fa48("481") ? {} : (stryCov_9fa48("481"), {
          ...state.detailLoading,
          [key]: stryMutAct_9fa48("482") ? false : (stryCov_9fa48("482"), true)
        })
      })));
      try {
        if (stryMutAct_9fa48("483")) {
          {}
        } else {
          stryCov_9fa48("483");
          const detail = await api.guardrails.get(guardrailId, stryMutAct_9fa48("484") ? {} : (stryCov_9fa48("484"), {
            version
          }));
          set(stryMutAct_9fa48("485") ? () => undefined : (stryCov_9fa48("485"), state => stryMutAct_9fa48("486") ? {} : (stryCov_9fa48("486"), {
            details: stryMutAct_9fa48("487") ? {} : (stryCov_9fa48("487"), {
              ...state.details,
              [key]: detail
            }),
            detailLoading: stryMutAct_9fa48("488") ? {} : (stryCov_9fa48("488"), {
              ...state.detailLoading,
              [key]: stryMutAct_9fa48("489") ? true : (stryCov_9fa48("489"), false)
            })
          })));
          return detail;
        }
      } catch (error) {
        if (stryMutAct_9fa48("490")) {
          {}
        } else {
          stryCov_9fa48("490");
          set(stryMutAct_9fa48("491") ? () => undefined : (stryCov_9fa48("491"), state => stryMutAct_9fa48("492") ? {} : (stryCov_9fa48("492"), {
            detailLoading: stryMutAct_9fa48("493") ? {} : (stryCov_9fa48("493"), {
              ...state.detailLoading,
              [key]: stryMutAct_9fa48("494") ? true : (stryCov_9fa48("494"), false)
            }),
            error: isAborted(error) ? state.error : toStoreError(error)
          })));
          return null;
        }
      }
    }
  },
  createGuardrail: async config => {
    if (stryMutAct_9fa48("495")) {
      {}
    } else {
      stryCov_9fa48("495");
      set(stryMutAct_9fa48("496") ? {} : (stryCov_9fa48("496"), {
        saving: stryMutAct_9fa48("497") ? false : (stryCov_9fa48("497"), true),
        saveError: null
      }));
      try {
        if (stryMutAct_9fa48("498")) {
          {}
        } else {
          stryCov_9fa48("498");
          const detail = await api.guardrails.create(config);
          set(stryMutAct_9fa48("499") ? () => undefined : (stryCov_9fa48("499"), state => stryMutAct_9fa48("500") ? {} : (stryCov_9fa48("500"), {
            saving: stryMutAct_9fa48("501") ? true : (stryCov_9fa48("501"), false),
            details: stryMutAct_9fa48("502") ? {} : (stryCov_9fa48("502"), {
              ...state.details,
              [guardrailCacheKey(detail.id)]: detail
            }),
            guardrails: stryMutAct_9fa48("503") ? [] : (stryCov_9fa48("503"), [...state.guardrails, toSummary(detail)])
          })));
          return detail;
        }
      } catch (error) {
        if (stryMutAct_9fa48("504")) {
          {}
        } else {
          stryCov_9fa48("504");
          set(stryMutAct_9fa48("505") ? {} : (stryCov_9fa48("505"), {
            saving: stryMutAct_9fa48("506") ? true : (stryCov_9fa48("506"), false),
            saveError: toStoreError(error)
          }));
          return null;
        }
      }
    }
  },
  updateGuardrail: async (guardrailId, config) => {
    if (stryMutAct_9fa48("507")) {
      {}
    } else {
      stryCov_9fa48("507");
      set(stryMutAct_9fa48("508") ? {} : (stryCov_9fa48("508"), {
        saving: stryMutAct_9fa48("509") ? false : (stryCov_9fa48("509"), true),
        saveError: null
      }));
      try {
        if (stryMutAct_9fa48("510")) {
          {}
        } else {
          stryCov_9fa48("510");
          const detail = await api.guardrails.update(guardrailId, config);
          set(stryMutAct_9fa48("511") ? () => undefined : (stryCov_9fa48("511"), state => stryMutAct_9fa48("512") ? {} : (stryCov_9fa48("512"), {
            saving: stryMutAct_9fa48("513") ? true : (stryCov_9fa48("513"), false),
            details: stryMutAct_9fa48("514") ? {} : (stryCov_9fa48("514"), {
              ...state.details,
              [guardrailCacheKey(guardrailId)]: detail
            }),
            guardrails: state.guardrails.map(stryMutAct_9fa48("515") ? () => undefined : (stryCov_9fa48("515"), row => (stryMutAct_9fa48("518") ? row.id !== guardrailId : stryMutAct_9fa48("517") ? false : stryMutAct_9fa48("516") ? true : (stryCov_9fa48("516", "517", "518"), row.id === guardrailId)) ? toSummary(detail) : row))
          })));
          return detail;
        }
      } catch (error) {
        if (stryMutAct_9fa48("519")) {
          {}
        } else {
          stryCov_9fa48("519");
          set(stryMutAct_9fa48("520") ? {} : (stryCov_9fa48("520"), {
            saving: stryMutAct_9fa48("521") ? true : (stryCov_9fa48("521"), false),
            saveError: toStoreError(error)
          }));
          return null;
        }
      }
    }
  },
  removeGuardrail: async (guardrailId, version) => {
    if (stryMutAct_9fa48("522")) {
      {}
    } else {
      stryCov_9fa48("522");
      set(stryMutAct_9fa48("523") ? {} : (stryCov_9fa48("523"), {
        saving: stryMutAct_9fa48("524") ? false : (stryCov_9fa48("524"), true),
        saveError: null
      }));
      try {
        if (stryMutAct_9fa48("525")) {
          {}
        } else {
          stryCov_9fa48("525");
          await api.guardrails.remove(guardrailId, stryMutAct_9fa48("526") ? {} : (stryCov_9fa48("526"), {
            version
          }));
        }
      } catch (error) {
        if (stryMutAct_9fa48("527")) {
          {}
        } else {
          stryCov_9fa48("527");
          set(stryMutAct_9fa48("528") ? {} : (stryCov_9fa48("528"), {
            saving: stryMutAct_9fa48("529") ? true : (stryCov_9fa48("529"), false),
            saveError: toStoreError(error)
          }));
          return stryMutAct_9fa48("530") ? true : (stryCov_9fa48("530"), false);
        }
      }
      set(state => {
        if (stryMutAct_9fa48("531")) {
          {}
        } else {
          stryCov_9fa48("531");
          const details = stryMutAct_9fa48("532") ? {} : (stryCov_9fa48("532"), {
            ...state.details
          });
          const versions = stryMutAct_9fa48("533") ? {} : (stryCov_9fa48("533"), {
            ...state.versions
          });
          if (stryMutAct_9fa48("535") ? false : stryMutAct_9fa48("534") ? true : (stryCov_9fa48("534", "535"), version)) {
            if (stryMutAct_9fa48("536")) {
              {}
            } else {
              stryCov_9fa48("536");
              delete details[guardrailCacheKey(guardrailId, version)];
              delete versions[guardrailId];
              return stryMutAct_9fa48("537") ? {} : (stryCov_9fa48("537"), {
                saving: stryMutAct_9fa48("538") ? true : (stryCov_9fa48("538"), false),
                details,
                versions
              });
            }
          }
          // Whole-guardrail delete: drop every cached key for it.
          for (const key of Object.keys(details)) {
            if (stryMutAct_9fa48("539")) {
              {}
            } else {
              stryCov_9fa48("539");
              if (stryMutAct_9fa48("542") ? key === guardrailId && key.startsWith(`${guardrailId}@`) : stryMutAct_9fa48("541") ? false : stryMutAct_9fa48("540") ? true : (stryCov_9fa48("540", "541", "542"), (stryMutAct_9fa48("544") ? key !== guardrailId : stryMutAct_9fa48("543") ? false : (stryCov_9fa48("543", "544"), key === guardrailId)) || (stryMutAct_9fa48("545") ? key.endsWith(`${guardrailId}@`) : (stryCov_9fa48("545"), key.startsWith(stryMutAct_9fa48("546") ? `` : (stryCov_9fa48("546"), `${guardrailId}@`)))))) delete details[key];
            }
          }
          delete versions[guardrailId];
          return stryMutAct_9fa48("547") ? {} : (stryCov_9fa48("547"), {
            saving: stryMutAct_9fa48("548") ? true : (stryCov_9fa48("548"), false),
            details,
            versions,
            guardrails: stryMutAct_9fa48("549") ? state.guardrails : (stryCov_9fa48("549"), state.guardrails.filter(stryMutAct_9fa48("550") ? () => undefined : (stryCov_9fa48("550"), row => stryMutAct_9fa48("553") ? row.id === guardrailId : stryMutAct_9fa48("552") ? false : stryMutAct_9fa48("551") ? true : (stryCov_9fa48("551", "552", "553"), row.id !== guardrailId))))
          });
        }
      });
      return stryMutAct_9fa48("554") ? false : (stryCov_9fa48("554"), true);
    }
  },
  loadVersions: async (guardrailId, force = stryMutAct_9fa48("555") ? true : (stryCov_9fa48("555"), false)) => {
    if (stryMutAct_9fa48("556")) {
      {}
    } else {
      stryCov_9fa48("556");
      if (stryMutAct_9fa48("559") ? false : stryMutAct_9fa48("558") ? true : stryMutAct_9fa48("557") ? force : (stryCov_9fa48("557", "558", "559"), !force)) {
        if (stryMutAct_9fa48("560")) {
          {}
        } else {
          stryCov_9fa48("560");
          const cached = get().versions[guardrailId];
          if (stryMutAct_9fa48("562") ? false : stryMutAct_9fa48("561") ? true : (stryCov_9fa48("561", "562"), cached)) return cached;
        }
      }
      try {
        if (stryMutAct_9fa48("563")) {
          {}
        } else {
          stryCov_9fa48("563");
          const response = await api.guardrails.versions.list(guardrailId);
          set(stryMutAct_9fa48("564") ? () => undefined : (stryCov_9fa48("564"), state => stryMutAct_9fa48("565") ? {} : (stryCov_9fa48("565"), {
            versions: stryMutAct_9fa48("566") ? {} : (stryCov_9fa48("566"), {
              ...state.versions,
              [guardrailId]: response.versions
            })
          })));
          return response.versions;
        }
      } catch (error) {
        if (stryMutAct_9fa48("567")) {
          {}
        } else {
          stryCov_9fa48("567");
          if (stryMutAct_9fa48("570") ? false : stryMutAct_9fa48("569") ? true : stryMutAct_9fa48("568") ? isAborted(error) : (stryCov_9fa48("568", "569", "570"), !isAborted(error))) set(stryMutAct_9fa48("571") ? {} : (stryCov_9fa48("571"), {
            error: toStoreError(error)
          }));
          return stryMutAct_9fa48("572") ? ["Stryker was here"] : (stryCov_9fa48("572"), []);
        }
      }
    }
  },
  publishVersion: async (guardrailId, description) => {
    if (stryMutAct_9fa48("573")) {
      {}
    } else {
      stryCov_9fa48("573");
      set(stryMutAct_9fa48("574") ? {} : (stryCov_9fa48("574"), {
        saving: stryMutAct_9fa48("575") ? false : (stryCov_9fa48("575"), true),
        saveError: null
      }));
      try {
        if (stryMutAct_9fa48("576")) {
          {}
        } else {
          stryCov_9fa48("576");
          const version = await api.guardrails.versions.create(guardrailId, stryMutAct_9fa48("577") ? {} : (stryCov_9fa48("577"), {
            description
          }));
          set(state => {
            if (stryMutAct_9fa48("578")) {
              {}
            } else {
              stryCov_9fa48("578");
              const existing = stryMutAct_9fa48("579") ? state.versions[guardrailId] && [] : (stryCov_9fa48("579"), state.versions[guardrailId] ?? (stryMutAct_9fa48("580") ? ["Stryker was here"] : (stryCov_9fa48("580"), [])));
              return stryMutAct_9fa48("581") ? {} : (stryCov_9fa48("581"), {
                saving: stryMutAct_9fa48("582") ? true : (stryCov_9fa48("582"), false),
                versions: stryMutAct_9fa48("583") ? {} : (stryCov_9fa48("583"), {
                  ...state.versions,
                  [guardrailId]: stryMutAct_9fa48("584") ? [] : (stryCov_9fa48("584"), [...existing, version])
                })
              });
            }
          });
          // The list row's `status`/`version` moved on; refetch it lazily.
          set(stryMutAct_9fa48("585") ? {} : (stryCov_9fa48("585"), {
            loaded: stryMutAct_9fa48("586") ? true : (stryCov_9fa48("586"), false)
          }));
          return version;
        }
      } catch (error) {
        if (stryMutAct_9fa48("587")) {
          {}
        } else {
          stryCov_9fa48("587");
          set(stryMutAct_9fa48("588") ? {} : (stryCov_9fa48("588"), {
            saving: stryMutAct_9fa48("589") ? true : (stryCov_9fa48("589"), false),
            saveError: toStoreError(error)
          }));
          return null;
        }
      }
    }
  },
  invalidateGuardrail: guardrailId => {
    if (stryMutAct_9fa48("590")) {
      {}
    } else {
      stryCov_9fa48("590");
      set(state => {
        if (stryMutAct_9fa48("591")) {
          {}
        } else {
          stryCov_9fa48("591");
          const details = stryMutAct_9fa48("592") ? {} : (stryCov_9fa48("592"), {
            ...state.details
          });
          for (const key of Object.keys(details)) {
            if (stryMutAct_9fa48("593")) {
              {}
            } else {
              stryCov_9fa48("593");
              if (stryMutAct_9fa48("596") ? key === guardrailId && key.startsWith(`${guardrailId}@`) : stryMutAct_9fa48("595") ? false : stryMutAct_9fa48("594") ? true : (stryCov_9fa48("594", "595", "596"), (stryMutAct_9fa48("598") ? key !== guardrailId : stryMutAct_9fa48("597") ? false : (stryCov_9fa48("597", "598"), key === guardrailId)) || (stryMutAct_9fa48("599") ? key.endsWith(`${guardrailId}@`) : (stryCov_9fa48("599"), key.startsWith(stryMutAct_9fa48("600") ? `` : (stryCov_9fa48("600"), `${guardrailId}@`)))))) delete details[key];
            }
          }
          const versions = stryMutAct_9fa48("601") ? {} : (stryCov_9fa48("601"), {
            ...state.versions
          });
          delete versions[guardrailId];
          return stryMutAct_9fa48("602") ? {} : (stryCov_9fa48("602"), {
            details,
            versions
          });
        }
      });
    }
  },
  clear: () => {
    if (stryMutAct_9fa48("603")) {
      {}
    } else {
      stryCov_9fa48("603");
      listRequest = null;
      set(stryMutAct_9fa48("604") ? {} : (stryCov_9fa48("604"), {
        ...INITIAL_GUARDRAIL_STATE
      }));
    }
  }
})));

/** Pure: narrow a `GuardrailDetail` to its list-row fields. */
export function toSummary(detail: GuardrailDetail): GuardrailSummary {
  if (stryMutAct_9fa48("605")) {
    {}
  } else {
    stryCov_9fa48("605");
    return stryMutAct_9fa48("606") ? {} : (stryCov_9fa48("606"), {
      id: detail.id,
      arn: detail.arn,
      name: detail.name,
      description: detail.description,
      version: detail.version,
      status: detail.status,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt
    });
  }
}

/** Selector factory: a cached detail (DRAFT unless `version`). */
export const selectGuardrailDetail = stryMutAct_9fa48("607") ? () => undefined : (stryCov_9fa48("607"), (() => {
  const selectGuardrailDetail = (guardrailId: string | null, version?: string) => stryMutAct_9fa48("608") ? () => undefined : (stryCov_9fa48("608"), (state: GuardrailStateData): GuardrailDetail | null => guardrailId ? stryMutAct_9fa48("609") ? state.details[guardrailCacheKey(guardrailId, version)] && null : (stryCov_9fa48("609"), state.details[guardrailCacheKey(guardrailId, version)] ?? null) : null);
  return selectGuardrailDetail;
})());

/**
 * Pure: guardrails that can actually be attached to a run.
 *
 * A plain helper rather than a selector — it builds a new array, and a zustand
 * v5 selector that does that fails `useSyncExternalStore`'s snapshot identity
 * check. Select `state.guardrails` and call this in render.
 */
export function readyGuardrails(guardrails: GuardrailSummary[]): GuardrailSummary[] {
  if (stryMutAct_9fa48("610")) {
    {}
  } else {
    stryCov_9fa48("610");
    return stryMutAct_9fa48("611") ? guardrails : (stryCov_9fa48("611"), guardrails.filter(stryMutAct_9fa48("612") ? () => undefined : (stryCov_9fa48("612"), row => stryMutAct_9fa48("615") ? row.status !== 'READY' : stryMutAct_9fa48("614") ? false : stryMutAct_9fa48("613") ? true : (stryCov_9fa48("613", "614", "615"), row.status === (stryMutAct_9fa48("616") ? "" : (stryCov_9fa48("616"), 'READY'))))));
  }
}