/**
 * Catalogs the workbench picks from: scenarios, one hydrated scenario at a
 * time, and the Bedrock model list.
 *
 * Every loader is idempotent: a second call while the first is in flight
 * returns the *same* promise (so mounting three components that all "ensure
 * models are loaded" issues one request), and a completed load is not repeated
 * unless `force` is passed. In-flight promises live at module scope rather than
 * in state — they are not serializable and nothing renders them.
 *
 * Note the wire casing here is camelCase (scenarios come from the config
 * store), unlike runs/models which are snake_case. See `api/types.ts`.
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
import type { ModelInfo, ModelProviders, ModelSource, ScenarioDetail, ScenarioSummary } from '../api';
import { isAborted, toStoreError, type StoreError } from './errors';
export interface ScenarioStateData {
  scenarios: ScenarioSummary[];
  scenariosLoading: boolean;
  scenariosLoaded: boolean;
  scenariosError: StoreError | null;

  /** Hydrated scenarios, keyed by id. */
  details: Record<string, ScenarioDetail>;
  detailLoading: Record<string, boolean>;
  detailError: Record<string, StoreError | null>;
  models: ModelInfo[];
  modelsLoading: boolean;
  modelsLoaded: boolean;
  modelsError: StoreError | null;
  /** `ModelListResponse.cached` — the server served this from its catalog cache. */
  modelsCached: boolean;
  /**
   * `ModelListResponse.providers`, as last fetched. `null` until `loadModels`
   * resolves *or* when the server response omitted it (older/fake-mode
   * servers) — either way, read it through `resolveModelProviders` /
   * `groupModelsBySource` rather than indexing it directly.
   */
  modelProviders: ModelProviders | null;
}
export interface ScenarioActions {
  /** `GET /scenarios`. Idempotent unless `force`. */
  loadScenarios(force?: boolean): Promise<void>;
  /** `GET /scenarios/{id}` — hydrated detail. Idempotent unless `force`. */
  loadScenario(scenarioId: string, force?: boolean): Promise<ScenarioDetail | null>;
  /** `GET /models`. Idempotent unless `force`. */
  loadModels(force?: boolean): Promise<void>;
  /** Drop one cached detail so the next `loadScenario` refetches. */
  invalidateScenario(scenarioId: string): void;
  /** Drop the scenario list so the next `loadScenarios` refetches. */
  invalidateScenarios(): void;
  clear(): void;
}
export type ScenarioStore = ScenarioStateData & ScenarioActions;
export const INITIAL_SCENARIO_STATE: ScenarioStateData = stryMutAct_9fa48("1083") ? {} : (stryCov_9fa48("1083"), {
  scenarios: stryMutAct_9fa48("1084") ? ["Stryker was here"] : (stryCov_9fa48("1084"), []),
  scenariosLoading: stryMutAct_9fa48("1085") ? true : (stryCov_9fa48("1085"), false),
  scenariosLoaded: stryMutAct_9fa48("1086") ? true : (stryCov_9fa48("1086"), false),
  scenariosError: null,
  details: {},
  detailLoading: {},
  detailError: {},
  models: stryMutAct_9fa48("1087") ? ["Stryker was here"] : (stryCov_9fa48("1087"), []),
  modelsLoading: stryMutAct_9fa48("1088") ? true : (stryCov_9fa48("1088"), false),
  modelsLoaded: stryMutAct_9fa48("1089") ? true : (stryCov_9fa48("1089"), false),
  modelsError: null,
  modelsCached: stryMutAct_9fa48("1090") ? true : (stryCov_9fa48("1090"), false),
  modelProviders: null
});

/** Idempotence guards — one entry per in-flight request. */
let scenariosRequest: Promise<void> | null = null;
let modelsRequest: Promise<void> | null = null;
const detailRequests = new Map<string, Promise<ScenarioDetail | null>>();
export const useScenarioStore = create<ScenarioStore>()(stryMutAct_9fa48("1091") ? () => undefined : (stryCov_9fa48("1091"), (set, get) => stryMutAct_9fa48("1092") ? {} : (stryCov_9fa48("1092"), {
  ...INITIAL_SCENARIO_STATE,
  loadScenarios: (force = stryMutAct_9fa48("1093") ? true : (stryCov_9fa48("1093"), false)) => {
    if (stryMutAct_9fa48("1094")) {
      {}
    } else {
      stryCov_9fa48("1094");
      if (stryMutAct_9fa48("1097") ? false : stryMutAct_9fa48("1096") ? true : stryMutAct_9fa48("1095") ? force : (stryCov_9fa48("1095", "1096", "1097"), !force)) {
        if (stryMutAct_9fa48("1098")) {
          {}
        } else {
          stryCov_9fa48("1098");
          if (stryMutAct_9fa48("1100") ? false : stryMutAct_9fa48("1099") ? true : (stryCov_9fa48("1099", "1100"), scenariosRequest)) return scenariosRequest;
          if (stryMutAct_9fa48("1102") ? false : stryMutAct_9fa48("1101") ? true : (stryCov_9fa48("1101", "1102"), get().scenariosLoaded)) return Promise.resolve();
        }
      }
      set(stryMutAct_9fa48("1103") ? {} : (stryCov_9fa48("1103"), {
        scenariosLoading: stryMutAct_9fa48("1104") ? false : (stryCov_9fa48("1104"), true),
        scenariosError: null
      }));
      scenariosRequest = (async () => {
        if (stryMutAct_9fa48("1105")) {
          {}
        } else {
          stryCov_9fa48("1105");
          try {
            if (stryMutAct_9fa48("1106")) {
              {}
            } else {
              stryCov_9fa48("1106");
              // `limit` is capped at 20 by the config store; take a full page.
              const response = await api.scenarios.list(stryMutAct_9fa48("1107") ? {} : (stryCov_9fa48("1107"), {
                limit: 20
              }));
              set(stryMutAct_9fa48("1108") ? {} : (stryCov_9fa48("1108"), {
                scenarios: response.items,
                scenariosLoading: stryMutAct_9fa48("1109") ? true : (stryCov_9fa48("1109"), false),
                scenariosLoaded: stryMutAct_9fa48("1110") ? false : (stryCov_9fa48("1110"), true)
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("1111")) {
              {}
            } else {
              stryCov_9fa48("1111");
              if (stryMutAct_9fa48("1113") ? false : stryMutAct_9fa48("1112") ? true : (stryCov_9fa48("1112", "1113"), isAborted(error))) {
                if (stryMutAct_9fa48("1114")) {
                  {}
                } else {
                  stryCov_9fa48("1114");
                  set(stryMutAct_9fa48("1115") ? {} : (stryCov_9fa48("1115"), {
                    scenariosLoading: stryMutAct_9fa48("1116") ? true : (stryCov_9fa48("1116"), false)
                  }));
                  return;
                }
              }
              set(stryMutAct_9fa48("1117") ? {} : (stryCov_9fa48("1117"), {
                scenariosLoading: stryMutAct_9fa48("1118") ? true : (stryCov_9fa48("1118"), false),
                scenariosError: toStoreError(error)
              }));
            }
          } finally {
            if (stryMutAct_9fa48("1119")) {
              {}
            } else {
              stryCov_9fa48("1119");
              scenariosRequest = null;
            }
          }
        }
      })();
      return scenariosRequest;
    }
  },
  loadScenario: (scenarioId, force = stryMutAct_9fa48("1120") ? true : (stryCov_9fa48("1120"), false)) => {
    if (stryMutAct_9fa48("1121")) {
      {}
    } else {
      stryCov_9fa48("1121");
      if (stryMutAct_9fa48("1124") ? false : stryMutAct_9fa48("1123") ? true : stryMutAct_9fa48("1122") ? force : (stryCov_9fa48("1122", "1123", "1124"), !force)) {
        if (stryMutAct_9fa48("1125")) {
          {}
        } else {
          stryCov_9fa48("1125");
          const cached = get().details[scenarioId];
          if (stryMutAct_9fa48("1127") ? false : stryMutAct_9fa48("1126") ? true : (stryCov_9fa48("1126", "1127"), cached)) return Promise.resolve(cached);
          const inFlight = detailRequests.get(scenarioId);
          if (stryMutAct_9fa48("1129") ? false : stryMutAct_9fa48("1128") ? true : (stryCov_9fa48("1128", "1129"), inFlight)) return inFlight;
        }
      }
      set(stryMutAct_9fa48("1130") ? () => undefined : (stryCov_9fa48("1130"), state => stryMutAct_9fa48("1131") ? {} : (stryCov_9fa48("1131"), {
        detailLoading: stryMutAct_9fa48("1132") ? {} : (stryCov_9fa48("1132"), {
          ...state.detailLoading,
          [scenarioId]: stryMutAct_9fa48("1133") ? false : (stryCov_9fa48("1133"), true)
        }),
        detailError: stryMutAct_9fa48("1134") ? {} : (stryCov_9fa48("1134"), {
          ...state.detailError,
          [scenarioId]: null
        })
      })));
      const request = (async () => {
        if (stryMutAct_9fa48("1135")) {
          {}
        } else {
          stryCov_9fa48("1135");
          try {
            if (stryMutAct_9fa48("1136")) {
              {}
            } else {
              stryCov_9fa48("1136");
              const detail = await api.scenarios.get(scenarioId);
              set(stryMutAct_9fa48("1137") ? () => undefined : (stryCov_9fa48("1137"), state => stryMutAct_9fa48("1138") ? {} : (stryCov_9fa48("1138"), {
                details: stryMutAct_9fa48("1139") ? {} : (stryCov_9fa48("1139"), {
                  ...state.details,
                  [scenarioId]: detail
                }),
                detailLoading: stryMutAct_9fa48("1140") ? {} : (stryCov_9fa48("1140"), {
                  ...state.detailLoading,
                  [scenarioId]: stryMutAct_9fa48("1141") ? true : (stryCov_9fa48("1141"), false)
                })
              })));
              return detail;
            }
          } catch (error) {
            if (stryMutAct_9fa48("1142")) {
              {}
            } else {
              stryCov_9fa48("1142");
              set(stryMutAct_9fa48("1143") ? () => undefined : (stryCov_9fa48("1143"), state => stryMutAct_9fa48("1144") ? {} : (stryCov_9fa48("1144"), {
                detailLoading: stryMutAct_9fa48("1145") ? {} : (stryCov_9fa48("1145"), {
                  ...state.detailLoading,
                  [scenarioId]: stryMutAct_9fa48("1146") ? true : (stryCov_9fa48("1146"), false)
                }),
                detailError: stryMutAct_9fa48("1147") ? {} : (stryCov_9fa48("1147"), {
                  ...state.detailError,
                  [scenarioId]: isAborted(error) ? null : toStoreError(error)
                })
              })));
              return null;
            }
          } finally {
            if (stryMutAct_9fa48("1148")) {
              {}
            } else {
              stryCov_9fa48("1148");
              detailRequests.delete(scenarioId);
            }
          }
        }
      })();
      detailRequests.set(scenarioId, request);
      return request;
    }
  },
  loadModels: (force = stryMutAct_9fa48("1149") ? true : (stryCov_9fa48("1149"), false)) => {
    if (stryMutAct_9fa48("1150")) {
      {}
    } else {
      stryCov_9fa48("1150");
      if (stryMutAct_9fa48("1153") ? false : stryMutAct_9fa48("1152") ? true : stryMutAct_9fa48("1151") ? force : (stryCov_9fa48("1151", "1152", "1153"), !force)) {
        if (stryMutAct_9fa48("1154")) {
          {}
        } else {
          stryCov_9fa48("1154");
          if (stryMutAct_9fa48("1156") ? false : stryMutAct_9fa48("1155") ? true : (stryCov_9fa48("1155", "1156"), modelsRequest)) return modelsRequest;
          if (stryMutAct_9fa48("1158") ? false : stryMutAct_9fa48("1157") ? true : (stryCov_9fa48("1157", "1158"), get().modelsLoaded)) return Promise.resolve();
        }
      }
      set(stryMutAct_9fa48("1159") ? {} : (stryCov_9fa48("1159"), {
        modelsLoading: stryMutAct_9fa48("1160") ? false : (stryCov_9fa48("1160"), true),
        modelsError: null
      }));
      modelsRequest = (async () => {
        if (stryMutAct_9fa48("1161")) {
          {}
        } else {
          stryCov_9fa48("1161");
          try {
            if (stryMutAct_9fa48("1162")) {
              {}
            } else {
              stryCov_9fa48("1162");
              const response = await api.models.list();
              set(stryMutAct_9fa48("1163") ? {} : (stryCov_9fa48("1163"), {
                models: response.models,
                modelsCached: response.cached,
                modelProviders: stryMutAct_9fa48("1164") ? response.providers && null : (stryCov_9fa48("1164"), response.providers ?? null),
                modelsLoading: stryMutAct_9fa48("1165") ? true : (stryCov_9fa48("1165"), false),
                modelsLoaded: stryMutAct_9fa48("1166") ? false : (stryCov_9fa48("1166"), true)
              }));
            }
          } catch (error) {
            if (stryMutAct_9fa48("1167")) {
              {}
            } else {
              stryCov_9fa48("1167");
              if (stryMutAct_9fa48("1169") ? false : stryMutAct_9fa48("1168") ? true : (stryCov_9fa48("1168", "1169"), isAborted(error))) {
                if (stryMutAct_9fa48("1170")) {
                  {}
                } else {
                  stryCov_9fa48("1170");
                  set(stryMutAct_9fa48("1171") ? {} : (stryCov_9fa48("1171"), {
                    modelsLoading: stryMutAct_9fa48("1172") ? true : (stryCov_9fa48("1172"), false)
                  }));
                  return;
                }
              }
              set(stryMutAct_9fa48("1173") ? {} : (stryCov_9fa48("1173"), {
                modelsLoading: stryMutAct_9fa48("1174") ? true : (stryCov_9fa48("1174"), false),
                modelsError: toStoreError(error)
              }));
            }
          } finally {
            if (stryMutAct_9fa48("1175")) {
              {}
            } else {
              stryCov_9fa48("1175");
              modelsRequest = null;
            }
          }
        }
      })();
      return modelsRequest;
    }
  },
  invalidateScenario: scenarioId => {
    if (stryMutAct_9fa48("1176")) {
      {}
    } else {
      stryCov_9fa48("1176");
      detailRequests.delete(scenarioId);
      set(state => {
        if (stryMutAct_9fa48("1177")) {
          {}
        } else {
          stryCov_9fa48("1177");
          const details = stryMutAct_9fa48("1178") ? {} : (stryCov_9fa48("1178"), {
            ...state.details
          });
          delete details[scenarioId];
          return stryMutAct_9fa48("1179") ? {} : (stryCov_9fa48("1179"), {
            details
          });
        }
      });
    }
  },
  invalidateScenarios: () => {
    if (stryMutAct_9fa48("1180")) {
      {}
    } else {
      stryCov_9fa48("1180");
      scenariosRequest = null;
      set(stryMutAct_9fa48("1181") ? {} : (stryCov_9fa48("1181"), {
        scenariosLoaded: stryMutAct_9fa48("1182") ? true : (stryCov_9fa48("1182"), false)
      }));
    }
  },
  clear: () => {
    if (stryMutAct_9fa48("1183")) {
      {}
    } else {
      stryCov_9fa48("1183");
      scenariosRequest = null;
      modelsRequest = null;
      detailRequests.clear();
      set(stryMutAct_9fa48("1184") ? {} : (stryCov_9fa48("1184"), {
        ...INITIAL_SCENARIO_STATE
      }));
    }
  }
})));

/** Selector factory: the hydrated scenario for an id, if cached. */
export const selectScenarioDetail = stryMutAct_9fa48("1185") ? () => undefined : (stryCov_9fa48("1185"), (() => {
  const selectScenarioDetail = (scenarioId: string | null) => stryMutAct_9fa48("1186") ? () => undefined : (stryCov_9fa48("1186"), (state: ScenarioStateData): ScenarioDetail | null => scenarioId ? stryMutAct_9fa48("1187") ? state.details[scenarioId] && null : (stryCov_9fa48("1187"), state.details[scenarioId] ?? null) : null);
  return selectScenarioDetail;
})());

/** Selector factory: whether a scenario detail fetch is in flight. */
export const selectScenarioLoading = stryMutAct_9fa48("1188") ? () => undefined : (stryCov_9fa48("1188"), (() => {
  const selectScenarioLoading = (scenarioId: string | null) => stryMutAct_9fa48("1189") ? () => undefined : (stryCov_9fa48("1189"), (state: ScenarioStateData): boolean => scenarioId ? stryMutAct_9fa48("1192") ? state.detailLoading[scenarioId] !== true : stryMutAct_9fa48("1191") ? false : stryMutAct_9fa48("1190") ? true : (stryCov_9fa48("1190", "1191", "1192"), state.detailLoading[scenarioId] === (stryMutAct_9fa48("1193") ? false : (stryCov_9fa48("1193"), true))) : stryMutAct_9fa48("1194") ? true : (stryCov_9fa48("1194"), false));
  return selectScenarioLoading;
})());

/** Pure helper: find a model row by id. */
export function findModel(models: ModelInfo[], modelId: string): ModelInfo | null {
  if (stryMutAct_9fa48("1195")) {
    {}
  } else {
    stryCov_9fa48("1195");
    return stryMutAct_9fa48("1196") ? models.find(model => model.model_id === modelId) && null : (stryCov_9fa48("1196"), models.find(stryMutAct_9fa48("1197") ? () => undefined : (stryCov_9fa48("1197"), model => stryMutAct_9fa48("1200") ? model.model_id !== modelId : stryMutAct_9fa48("1199") ? false : stryMutAct_9fa48("1198") ? true : (stryCov_9fa48("1198", "1199", "1200"), model.model_id === modelId))) ?? null);
  }
}

/* -------------------------------------------------------------------------- */
/* Model source grouping — shared by ModelPanel and DeterminismLauncher       */
/* -------------------------------------------------------------------------- */

/**
 * Fallback `providers` used whenever `GET /models` omitted the field (older
 * or fake-mode servers): only bedrock is treated as usable, matching the
 * server's pre-multi-provider behavior.
 */
export const DEFAULT_MODEL_PROVIDERS: ModelProviders = stryMutAct_9fa48("1201") ? {} : (stryCov_9fa48("1201"), {
  bedrock: stryMutAct_9fa48("1202") ? {} : (stryCov_9fa48("1202"), {
    configured: stryMutAct_9fa48("1203") ? false : (stryCov_9fa48("1203"), true)
  }),
  anthropic: stryMutAct_9fa48("1204") ? {} : (stryCov_9fa48("1204"), {
    configured: stryMutAct_9fa48("1205") ? true : (stryCov_9fa48("1205"), false)
  }),
  openai: stryMutAct_9fa48("1206") ? {} : (stryCov_9fa48("1206"), {
    configured: stryMutAct_9fa48("1207") ? true : (stryCov_9fa48("1207"), false)
  }),
  ollama: stryMutAct_9fa48("1208") ? {} : (stryCov_9fa48("1208"), {
    configured: stryMutAct_9fa48("1209") ? true : (stryCov_9fa48("1209"), false),
    reachable: null
  })
});

/** Never crash on a missing `providers` object — fall back defensively. */
export function resolveModelProviders(providers: ModelProviders | null | undefined): ModelProviders {
  if (stryMutAct_9fa48("1210")) {
    {}
  } else {
    stryCov_9fa48("1210");
    return stryMutAct_9fa48("1211") ? providers && DEFAULT_MODEL_PROVIDERS : (stryCov_9fa48("1211"), providers ?? DEFAULT_MODEL_PROVIDERS);
  }
}
const SOURCE_ORDER: ModelSource[] = stryMutAct_9fa48("1212") ? [] : (stryCov_9fa48("1212"), [stryMutAct_9fa48("1213") ? "" : (stryCov_9fa48("1213"), 'bedrock'), stryMutAct_9fa48("1214") ? "" : (stryCov_9fa48("1214"), 'anthropic'), stryMutAct_9fa48("1215") ? "" : (stryCov_9fa48("1215"), 'openai'), stryMutAct_9fa48("1216") ? "" : (stryCov_9fa48("1216"), 'ollama')]);
const SOURCE_LABELS: Record<ModelSource, string> = stryMutAct_9fa48("1217") ? {} : (stryCov_9fa48("1217"), {
  bedrock: stryMutAct_9fa48("1218") ? "" : (stryCov_9fa48("1218"), 'Bedrock'),
  anthropic: stryMutAct_9fa48("1219") ? "" : (stryCov_9fa48("1219"), 'Anthropic'),
  openai: stryMutAct_9fa48("1220") ? "" : (stryCov_9fa48("1220"), 'OpenAI'),
  ollama: stryMutAct_9fa48("1221") ? "" : (stryCov_9fa48("1221"), 'Ollama (local)')
});

/** Whether a source's models are currently selectable. */
function sourceUsable(source: ModelSource, providers: ModelProviders): boolean {
  if (stryMutAct_9fa48("1222")) {
    {}
  } else {
    stryCov_9fa48("1222");
    const status = providers[source];
    if (stryMutAct_9fa48("1225") ? false : stryMutAct_9fa48("1224") ? true : stryMutAct_9fa48("1223") ? status.configured : (stryCov_9fa48("1223", "1224", "1225"), !status.configured)) return stryMutAct_9fa48("1226") ? true : (stryCov_9fa48("1226"), false);
    if (stryMutAct_9fa48("1229") ? source === 'ollama' || providers.ollama.reachable === false : stryMutAct_9fa48("1228") ? false : stryMutAct_9fa48("1227") ? true : (stryCov_9fa48("1227", "1228", "1229"), (stryMutAct_9fa48("1231") ? source !== 'ollama' : stryMutAct_9fa48("1230") ? true : (stryCov_9fa48("1230", "1231"), source === (stryMutAct_9fa48("1232") ? "" : (stryCov_9fa48("1232"), 'ollama')))) && (stryMutAct_9fa48("1234") ? providers.ollama.reachable !== false : stryMutAct_9fa48("1233") ? true : (stryCov_9fa48("1233", "1234"), providers.ollama.reachable === (stryMutAct_9fa48("1235") ? true : (stryCov_9fa48("1235"), false)))))) return stryMutAct_9fa48("1236") ? true : (stryCov_9fa48("1236"), false);
    return stryMutAct_9fa48("1237") ? false : (stryCov_9fa48("1237"), true);
  }
}

/** Suffix appended to a source's group label when it isn't usable. */
function sourceSuffix(source: ModelSource, providers: ModelProviders): string {
  if (stryMutAct_9fa48("1238")) {
    {}
  } else {
    stryCov_9fa48("1238");
    const status = providers[source];
    if (stryMutAct_9fa48("1241") ? false : stryMutAct_9fa48("1240") ? true : stryMutAct_9fa48("1239") ? status.configured : (stryCov_9fa48("1239", "1240", "1241"), !status.configured)) return stryMutAct_9fa48("1242") ? "" : (stryCov_9fa48("1242"), ' (not configured)');
    if (stryMutAct_9fa48("1245") ? source === 'ollama' || providers.ollama.reachable === false : stryMutAct_9fa48("1244") ? false : stryMutAct_9fa48("1243") ? true : (stryCov_9fa48("1243", "1244", "1245"), (stryMutAct_9fa48("1247") ? source !== 'ollama' : stryMutAct_9fa48("1246") ? true : (stryCov_9fa48("1246", "1247"), source === (stryMutAct_9fa48("1248") ? "" : (stryCov_9fa48("1248"), 'ollama')))) && (stryMutAct_9fa48("1250") ? providers.ollama.reachable !== false : stryMutAct_9fa48("1249") ? true : (stryCov_9fa48("1249", "1250"), providers.ollama.reachable === (stryMutAct_9fa48("1251") ? true : (stryCov_9fa48("1251"), false)))))) return stryMutAct_9fa48("1252") ? "" : (stryCov_9fa48("1252"), ' (unreachable)');
    return stryMutAct_9fa48("1253") ? "Stryker was here!" : (stryCov_9fa48("1253"), '');
  }
}
export interface ModelSourceGroup {
  source: ModelSource;
  /** Display label, with a "(not configured)"/"(unreachable)" suffix when relevant. */
  label: string;
  /** True when the provider is unconfigured (or ollama is unreachable). */
  disabled: boolean;
  models: ModelInfo[];
}
export interface GroupedModels {
  /** One entry per source that has at least one catalog row, in a fixed order. */
  groups: ModelSourceGroup[];
  /**
   * Sources with *no* catalog rows at all that are also unusable — nothing to
   * group, so callers render these as a footnote instead of an empty optgroup.
   */
  unavailable: Array<{
    source: ModelSource;
    label: string;
  }>;
}

/**
 * Group a flat model catalog into per-source buckets (Bedrock / Anthropic /
 * OpenAI / Ollama (local)), in that fixed order, folding in `providers` to
 * mark unconfigured/unreachable sources. A model with no `source` (older/
 * fake-mode payloads) is treated as `'bedrock'`.
 *
 * Pure and framework-free so `ModelPanel` and `DeterminismLauncher` share one
 * implementation instead of two ad hoc `<select>` groupings.
 */
export function groupModelsBySource(models: ModelInfo[], providers?: ModelProviders | null): GroupedModels {
  if (stryMutAct_9fa48("1254")) {
    {}
  } else {
    stryCov_9fa48("1254");
    const resolved = resolveModelProviders(providers);
    const bySource = new Map<ModelSource, ModelInfo[]>();
    for (const model of models) {
      if (stryMutAct_9fa48("1255")) {
        {}
      } else {
        stryCov_9fa48("1255");
        const source = stryMutAct_9fa48("1256") ? model.source && 'bedrock' : (stryCov_9fa48("1256"), model.source ?? (stryMutAct_9fa48("1257") ? "" : (stryCov_9fa48("1257"), 'bedrock')));
        const existing = bySource.get(source);
        if (stryMutAct_9fa48("1259") ? false : stryMutAct_9fa48("1258") ? true : (stryCov_9fa48("1258", "1259"), existing)) existing.push(model);else bySource.set(source, stryMutAct_9fa48("1260") ? [] : (stryCov_9fa48("1260"), [model]));
      }
    }
    const groups: ModelSourceGroup[] = stryMutAct_9fa48("1261") ? ["Stryker was here"] : (stryCov_9fa48("1261"), []);
    const unavailable: Array<{
      source: ModelSource;
      label: string;
    }> = stryMutAct_9fa48("1262") ? ["Stryker was here"] : (stryCov_9fa48("1262"), []);
    for (const source of SOURCE_ORDER) {
      if (stryMutAct_9fa48("1263")) {
        {}
      } else {
        stryCov_9fa48("1263");
        const sourceModels = bySource.get(source);
        if (stryMutAct_9fa48("1266") ? sourceModels || sourceModels.length > 0 : stryMutAct_9fa48("1265") ? false : stryMutAct_9fa48("1264") ? true : (stryCov_9fa48("1264", "1265", "1266"), sourceModels && (stryMutAct_9fa48("1269") ? sourceModels.length <= 0 : stryMutAct_9fa48("1268") ? sourceModels.length >= 0 : stryMutAct_9fa48("1267") ? true : (stryCov_9fa48("1267", "1268", "1269"), sourceModels.length > 0)))) {
          if (stryMutAct_9fa48("1270")) {
            {}
          } else {
            stryCov_9fa48("1270");
            groups.push(stryMutAct_9fa48("1271") ? {} : (stryCov_9fa48("1271"), {
              source,
              label: stryMutAct_9fa48("1272") ? `` : (stryCov_9fa48("1272"), `${SOURCE_LABELS[source]}${sourceSuffix(source, resolved)}`),
              disabled: stryMutAct_9fa48("1273") ? sourceUsable(source, resolved) : (stryCov_9fa48("1273"), !sourceUsable(source, resolved)),
              models: sourceModels
            }));
          }
        } else if (stryMutAct_9fa48("1276") ? false : stryMutAct_9fa48("1275") ? true : stryMutAct_9fa48("1274") ? sourceUsable(source, resolved) : (stryCov_9fa48("1274", "1275", "1276"), !sourceUsable(source, resolved))) {
          if (stryMutAct_9fa48("1277")) {
            {}
          } else {
            stryCov_9fa48("1277");
            unavailable.push(stryMutAct_9fa48("1278") ? {} : (stryCov_9fa48("1278"), {
              source,
              label: SOURCE_LABELS[source]
            }));
          }
        }
      }
    }
    return stryMutAct_9fa48("1279") ? {} : (stryCov_9fa48("1279"), {
      groups,
      unavailable
    });
  }
}