/**
 * The workbench form: everything that goes into `POST /runs`.
 *
 * This store is *only* form state — it never calls the API. `runStore.startRun`
 * takes the request built from here (see `toRunRequest`), which keeps the form
 * editable while a run is in flight and makes "re-run this exact config"
 * trivial.
 *
 * Persisted to localStorage under `promptatron.run-config.v1`. Everything in
 * the state is plain configuration (no credentials, no outputs), so
 * `partialize` keeps all of it and drops only the action functions.
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
import { persist } from 'zustand/middleware';
import type { InferenceConfig, ModelSource, RunGuardrailConfig, RunRequest, ScenarioDetail } from '../api';

/** localStorage key. Bump the suffix when the shape changes incompatibly. */
export const RUN_CONFIG_STORAGE_KEY = stryMutAct_9fa48("747") ? "" : (stryCov_9fa48("747"), 'promptatron.run-config.v1');

/** The serializable half of the store (this is exactly what is persisted). */
export interface RunConfigData {
  model_id: string;
  /**
   * Which backend `model_id` is served from. Guardrails only work with
   * `'bedrock'` — see `setProvider`, which clears `guardrail` whenever this
   * is set to anything else, keeping that invariant enforced in one place.
   */
  provider: ModelSource;
  system_prompt: string;
  user_prompt: string;
  scenario_id: string | null;
  dataset_id: string | null;
  /**
   * Which scenario prompt each text area was filled from. Purely a UI
   * bookkeeping aid (prompt pickers highlight the active entry); the run
   * request only ever carries the prompt *text*.
   */
  system_prompt_id: string | null;
  user_prompt_id: string | null;
  inference: InferenceConfig;
  tools_enabled: boolean;
  /** 1 – 100. */
  max_tool_iterations: number;
  guardrail: RunGuardrailConfig | null;
  stream: boolean;
}
export interface RunConfigActions {
  setModelId(modelId: string): void;
  /**
   * Sets `provider` alone (e.g. from the manual-model-id fallback's provider
   * select). Switching away from `'bedrock'` clears `guardrail`, since a
   * guardrail with a non-bedrock provider is a server-side 400.
   */
  setProvider(provider: ModelSource): void;
  /**
   * Sets `model_id` and `provider` together, as the catalog picker does
   * (`ModelInfo.source` -> `provider`). Applies the same guardrail-clearing
   * invariant as `setProvider`.
   */
  selectModel(modelId: string, source: ModelSource): void;
  setSystemPrompt(text: string): void;
  setUserPrompt(text: string): void;
  setScenarioId(scenarioId: string | null): void;
  setDatasetId(datasetId: string | null): void;
  /** Sets the prompt text *and* records which scenario prompt it came from. */
  selectSystemPrompt(promptId: string | null, content?: string): void;
  selectUserPrompt(promptId: string | null, content?: string): void;
  /** Shallow-merges into `inference`; `undefined` values delete the key. */
  setInference(patch: Partial<InferenceConfig>): void;
  setToolsEnabled(enabled: boolean): void;
  setMaxToolIterations(iterations: number): void;
  setGuardrail(guardrail: RunGuardrailConfig | null): void;
  setStream(stream: boolean): void;
  /**
   * Prefill from a scenario: always sets `scenario_id`, and fills the system /
   * user prompt from the scenario's *first* prompt of each kind — but only
   * when that field is currently empty, so it never clobbers typed text.
   * A single dataset is auto-selected the same way.
   */
  applyScenarioDefaults(scenario: ScenarioDetail): void;
  /** Back to `DEFAULT_RUN_CONFIG` (also rewrites the persisted copy). */
  reset(): void;
}
export type RunConfigStore = RunConfigData & RunConfigActions;
export const DEFAULT_RUN_CONFIG: RunConfigData = stryMutAct_9fa48("748") ? {} : (stryCov_9fa48("748"), {
  model_id: stryMutAct_9fa48("749") ? "Stryker was here!" : (stryCov_9fa48("749"), ''),
  provider: stryMutAct_9fa48("750") ? "" : (stryCov_9fa48("750"), 'bedrock'),
  system_prompt: stryMutAct_9fa48("751") ? "Stryker was here!" : (stryCov_9fa48("751"), ''),
  user_prompt: stryMutAct_9fa48("752") ? "Stryker was here!" : (stryCov_9fa48("752"), ''),
  scenario_id: null,
  dataset_id: null,
  system_prompt_id: null,
  user_prompt_id: null,
  inference: {},
  tools_enabled: stryMutAct_9fa48("753") ? true : (stryCov_9fa48("753"), false),
  max_tool_iterations: 10,
  guardrail: null,
  stream: stryMutAct_9fa48("754") ? false : (stryCov_9fa48("754"), true)
});

/**
 * Build the `POST /runs` body from form state.
 *
 * Pure and standalone so evaluations (`kind: "determinism"` needs a
 * `run_config`) can reuse it without going through `runStore`. Empty optional
 * fields are omitted rather than sent as `""`/`null` noise.
 */
export function toRunRequest(config: RunConfigData): RunRequest {
  if (stryMutAct_9fa48("755")) {
    {}
  } else {
    stryCov_9fa48("755");
    const request: RunRequest = stryMutAct_9fa48("756") ? {} : (stryCov_9fa48("756"), {
      model_id: config.model_id,
      user_prompt: config.user_prompt,
      tools_enabled: config.tools_enabled,
      max_tool_iterations: config.max_tool_iterations,
      // Always included (not just when non-default): a simpler, contract-legal
      // request shape beats the marginal byte savings of omitting 'bedrock'.
      provider: config.provider,
      stream: config.stream
    });
    if (stryMutAct_9fa48("759") ? config.system_prompt.trim() === '' : stryMutAct_9fa48("758") ? false : stryMutAct_9fa48("757") ? true : (stryCov_9fa48("757", "758", "759"), (stryMutAct_9fa48("760") ? config.system_prompt : (stryCov_9fa48("760"), config.system_prompt.trim())) !== (stryMutAct_9fa48("761") ? "Stryker was here!" : (stryCov_9fa48("761"), '')))) request.system_prompt = config.system_prompt;
    if (stryMutAct_9fa48("763") ? false : stryMutAct_9fa48("762") ? true : (stryCov_9fa48("762", "763"), config.scenario_id)) request.scenario_id = config.scenario_id;
    if (stryMutAct_9fa48("765") ? false : stryMutAct_9fa48("764") ? true : (stryCov_9fa48("764", "765"), config.dataset_id)) request.dataset_id = config.dataset_id;
    if (stryMutAct_9fa48("769") ? Object.keys(config.inference).length <= 0 : stryMutAct_9fa48("768") ? Object.keys(config.inference).length >= 0 : stryMutAct_9fa48("767") ? false : stryMutAct_9fa48("766") ? true : (stryCov_9fa48("766", "767", "768", "769"), Object.keys(config.inference).length > 0)) request.inference = stryMutAct_9fa48("770") ? {} : (stryCov_9fa48("770"), {
      ...config.inference
    });
    if (stryMutAct_9fa48("772") ? false : stryMutAct_9fa48("771") ? true : (stryCov_9fa48("771", "772"), config.guardrail)) request.guardrail = stryMutAct_9fa48("773") ? {} : (stryCov_9fa48("773"), {
      ...config.guardrail
    });
    return request;
  }
}

/** Pure form of `applyScenarioDefaults`, exported for tests and previews. */
export function scenarioDefaults(current: RunConfigData, scenario: ScenarioDetail): Partial<RunConfigData> {
  if (stryMutAct_9fa48("774")) {
    {}
  } else {
    stryCov_9fa48("774");
    const next: Partial<RunConfigData> = stryMutAct_9fa48("775") ? {} : (stryCov_9fa48("775"), {
      scenario_id: scenario.id
    });
    const firstSystem = stryMutAct_9fa48("776") ? scenario.systemPrompts[0] : (stryCov_9fa48("776"), scenario.systemPrompts?.[0]);
    if (stryMutAct_9fa48("779") ? firstSystem || current.system_prompt.trim() === '' : stryMutAct_9fa48("778") ? false : stryMutAct_9fa48("777") ? true : (stryCov_9fa48("777", "778", "779"), firstSystem && (stryMutAct_9fa48("781") ? current.system_prompt.trim() !== '' : stryMutAct_9fa48("780") ? true : (stryCov_9fa48("780", "781"), (stryMutAct_9fa48("782") ? current.system_prompt : (stryCov_9fa48("782"), current.system_prompt.trim())) === (stryMutAct_9fa48("783") ? "Stryker was here!" : (stryCov_9fa48("783"), '')))))) {
      if (stryMutAct_9fa48("784")) {
        {}
      } else {
        stryCov_9fa48("784");
        next.system_prompt = firstSystem.content;
        next.system_prompt_id = firstSystem.id;
      }
    }
    const firstUser = stryMutAct_9fa48("785") ? scenario.userPrompts[0] : (stryCov_9fa48("785"), scenario.userPrompts?.[0]);
    if (stryMutAct_9fa48("788") ? firstUser || current.user_prompt.trim() === '' : stryMutAct_9fa48("787") ? false : stryMutAct_9fa48("786") ? true : (stryCov_9fa48("786", "787", "788"), firstUser && (stryMutAct_9fa48("790") ? current.user_prompt.trim() !== '' : stryMutAct_9fa48("789") ? true : (stryCov_9fa48("789", "790"), (stryMutAct_9fa48("791") ? current.user_prompt : (stryCov_9fa48("791"), current.user_prompt.trim())) === (stryMutAct_9fa48("792") ? "Stryker was here!" : (stryCov_9fa48("792"), '')))))) {
      if (stryMutAct_9fa48("793")) {
        {}
      } else {
        stryCov_9fa48("793");
        next.user_prompt = firstUser.content;
        next.user_prompt_id = firstUser.id;
      }
    }

    // Only auto-pick a dataset when there is exactly one and nothing is chosen.
    if (stryMutAct_9fa48("796") ? !current.dataset_id || scenario.datasets?.length === 1 : stryMutAct_9fa48("795") ? false : stryMutAct_9fa48("794") ? true : (stryCov_9fa48("794", "795", "796"), (stryMutAct_9fa48("797") ? current.dataset_id : (stryCov_9fa48("797"), !current.dataset_id)) && (stryMutAct_9fa48("799") ? scenario.datasets?.length !== 1 : stryMutAct_9fa48("798") ? true : (stryCov_9fa48("798", "799"), (stryMutAct_9fa48("800") ? scenario.datasets.length : (stryCov_9fa48("800"), scenario.datasets?.length)) === 1)))) {
      if (stryMutAct_9fa48("801")) {
        {}
      } else {
        stryCov_9fa48("801");
        next.dataset_id = scenario.datasets[0].id;
      }
    }

    // A scenario with tools implies the workbench should offer them.
    if (stryMutAct_9fa48("804") ? scenario.tools.length : stryMutAct_9fa48("803") ? false : stryMutAct_9fa48("802") ? true : (stryCov_9fa48("802", "803", "804"), scenario.tools?.length)) next.tools_enabled = stryMutAct_9fa48("805") ? false : (stryCov_9fa48("805"), true);
    return next;
  }
}

/**
 * Guardrails only run against Bedrock (a non-bedrock provider + guardrail is
 * a server-side 400). Central place that enforces it: any state change that
 * sets `provider` should route through this so `guardrail` never gets left
 * pointing at a now-incompatible provider.
 */
function providerPatch(current: Pick<RunConfigData, 'guardrail'>, provider: ModelSource): Pick<RunConfigData, 'provider' | 'guardrail'> {
  if (stryMutAct_9fa48("806")) {
    {}
  } else {
    stryCov_9fa48("806");
    return stryMutAct_9fa48("807") ? {} : (stryCov_9fa48("807"), {
      provider,
      guardrail: (stryMutAct_9fa48("810") ? provider !== 'bedrock' : stryMutAct_9fa48("809") ? false : stryMutAct_9fa48("808") ? true : (stryCov_9fa48("808", "809", "810"), provider === (stryMutAct_9fa48("811") ? "" : (stryCov_9fa48("811"), 'bedrock')))) ? current.guardrail : null
    });
  }
}
export const useRunConfigStore = create<RunConfigStore>()(persist(stryMutAct_9fa48("812") ? () => undefined : (stryCov_9fa48("812"), (set, get) => stryMutAct_9fa48("813") ? {} : (stryCov_9fa48("813"), {
  ...DEFAULT_RUN_CONFIG,
  setModelId: stryMutAct_9fa48("814") ? () => undefined : (stryCov_9fa48("814"), modelId => set(stryMutAct_9fa48("815") ? {} : (stryCov_9fa48("815"), {
    model_id: modelId
  }))),
  setProvider: stryMutAct_9fa48("816") ? () => undefined : (stryCov_9fa48("816"), provider => set(stryMutAct_9fa48("817") ? () => undefined : (stryCov_9fa48("817"), state => providerPatch(state, provider)))),
  selectModel: stryMutAct_9fa48("818") ? () => undefined : (stryCov_9fa48("818"), (modelId, source) => set(stryMutAct_9fa48("819") ? () => undefined : (stryCov_9fa48("819"), state => stryMutAct_9fa48("820") ? {} : (stryCov_9fa48("820"), {
    model_id: modelId,
    ...providerPatch(state, source)
  })))),
  setSystemPrompt: stryMutAct_9fa48("821") ? () => undefined : (stryCov_9fa48("821"), text => set(stryMutAct_9fa48("822") ? {} : (stryCov_9fa48("822"), {
    system_prompt: text
  }))),
  setUserPrompt: stryMutAct_9fa48("823") ? () => undefined : (stryCov_9fa48("823"), text => set(stryMutAct_9fa48("824") ? {} : (stryCov_9fa48("824"), {
    user_prompt: text
  }))),
  setScenarioId: stryMutAct_9fa48("825") ? () => undefined : (stryCov_9fa48("825"), scenarioId => set(stryMutAct_9fa48("826") ? {} : (stryCov_9fa48("826"), {
    scenario_id: scenarioId
  }))),
  setDatasetId: stryMutAct_9fa48("827") ? () => undefined : (stryCov_9fa48("827"), datasetId => set(stryMutAct_9fa48("828") ? {} : (stryCov_9fa48("828"), {
    dataset_id: datasetId
  }))),
  selectSystemPrompt: stryMutAct_9fa48("829") ? () => undefined : (stryCov_9fa48("829"), (promptId, content) => set((stryMutAct_9fa48("832") ? content !== undefined : stryMutAct_9fa48("831") ? false : stryMutAct_9fa48("830") ? true : (stryCov_9fa48("830", "831", "832"), content === undefined)) ? stryMutAct_9fa48("833") ? {} : (stryCov_9fa48("833"), {
    system_prompt_id: promptId
  }) : stryMutAct_9fa48("834") ? {} : (stryCov_9fa48("834"), {
    system_prompt_id: promptId,
    system_prompt: content
  }))),
  selectUserPrompt: stryMutAct_9fa48("835") ? () => undefined : (stryCov_9fa48("835"), (promptId, content) => set((stryMutAct_9fa48("838") ? content !== undefined : stryMutAct_9fa48("837") ? false : stryMutAct_9fa48("836") ? true : (stryCov_9fa48("836", "837", "838"), content === undefined)) ? stryMutAct_9fa48("839") ? {} : (stryCov_9fa48("839"), {
    user_prompt_id: promptId
  }) : stryMutAct_9fa48("840") ? {} : (stryCov_9fa48("840"), {
    user_prompt_id: promptId,
    user_prompt: content
  }))),
  setInference: patch => {
    if (stryMutAct_9fa48("841")) {
      {}
    } else {
      stryCov_9fa48("841");
      const inference: InferenceConfig = stryMutAct_9fa48("842") ? {} : (stryCov_9fa48("842"), {
        ...get().inference
      });
      for (const [key, value] of Object.entries(patch)) {
        if (stryMutAct_9fa48("843")) {
          {}
        } else {
          stryCov_9fa48("843");
          if (stryMutAct_9fa48("846") ? value !== undefined : stryMutAct_9fa48("845") ? false : stryMutAct_9fa48("844") ? true : (stryCov_9fa48("844", "845", "846"), value === undefined)) delete inference[key as keyof InferenceConfig];else inference[key as keyof InferenceConfig] = value;
        }
      }
      set(stryMutAct_9fa48("847") ? {} : (stryCov_9fa48("847"), {
        inference
      }));
    }
  },
  setToolsEnabled: stryMutAct_9fa48("848") ? () => undefined : (stryCov_9fa48("848"), enabled => set(stryMutAct_9fa48("849") ? {} : (stryCov_9fa48("849"), {
    tools_enabled: enabled
  }))),
  setMaxToolIterations: stryMutAct_9fa48("850") ? () => undefined : (stryCov_9fa48("850"), iterations => set(stryMutAct_9fa48("851") ? {} : (stryCov_9fa48("851"), {
    max_tool_iterations: iterations
  }))),
  setGuardrail: stryMutAct_9fa48("852") ? () => undefined : (stryCov_9fa48("852"), guardrail => set(stryMutAct_9fa48("853") ? {} : (stryCov_9fa48("853"), {
    guardrail
  }))),
  setStream: stryMutAct_9fa48("854") ? () => undefined : (stryCov_9fa48("854"), stream => set(stryMutAct_9fa48("855") ? {} : (stryCov_9fa48("855"), {
    stream
  }))),
  applyScenarioDefaults: stryMutAct_9fa48("856") ? () => undefined : (stryCov_9fa48("856"), scenario => set(scenarioDefaults(get(), scenario))),
  reset: stryMutAct_9fa48("857") ? () => undefined : (stryCov_9fa48("857"), () => set(stryMutAct_9fa48("858") ? {} : (stryCov_9fa48("858"), {
    ...DEFAULT_RUN_CONFIG
  })))
})), stryMutAct_9fa48("859") ? {} : (stryCov_9fa48("859"), {
  name: RUN_CONFIG_STORAGE_KEY,
  // `provider` was added without a version bump: zustand's default
  // `merge` is `{ ...currentState, ...persistedState }`, so a payload
  // that predates it (and therefore doesn't mention it) falls through to
  // the freshly-created store's `'bedrock'` default rather than being
  // clobbered with `undefined`. Same pattern as `settingsStore`.
  version: 1,
  partialize: stryMutAct_9fa48("860") ? () => undefined : (stryCov_9fa48("860"), (state): RunConfigData => stryMutAct_9fa48("861") ? {} : (stryCov_9fa48("861"), {
    model_id: state.model_id,
    provider: state.provider,
    system_prompt: state.system_prompt,
    user_prompt: state.user_prompt,
    scenario_id: state.scenario_id,
    dataset_id: state.dataset_id,
    system_prompt_id: state.system_prompt_id,
    user_prompt_id: state.user_prompt_id,
    inference: state.inference,
    tools_enabled: state.tools_enabled,
    max_tool_iterations: state.max_tool_iterations,
    guardrail: state.guardrail,
    stream: state.stream
  }))
})));

/**
 * Selector: whether the form has the minimum needed to submit a run.
 *
 * (There is deliberately no `selectRunRequest` selector: `toRunRequest` builds
 * a fresh object, and a zustand v5 selector that does that fails
 * `useSyncExternalStore`'s snapshot identity check. Call `toRunRequest` in the
 * submit handler with `useRunConfigStore.getState()`.)
 */
export const selectCanRun = stryMutAct_9fa48("862") ? () => undefined : (stryCov_9fa48("862"), (() => {
  const selectCanRun = (state: RunConfigStore): boolean => stryMutAct_9fa48("865") ? state.model_id.trim() !== '' || state.user_prompt.trim() !== '' : stryMutAct_9fa48("864") ? false : stryMutAct_9fa48("863") ? true : (stryCov_9fa48("863", "864", "865"), (stryMutAct_9fa48("867") ? state.model_id.trim() === '' : stryMutAct_9fa48("866") ? true : (stryCov_9fa48("866", "867"), (stryMutAct_9fa48("868") ? state.model_id : (stryCov_9fa48("868"), state.model_id.trim())) !== (stryMutAct_9fa48("869") ? "Stryker was here!" : (stryCov_9fa48("869"), '')))) && (stryMutAct_9fa48("871") ? state.user_prompt.trim() === '' : stryMutAct_9fa48("870") ? true : (stryCov_9fa48("870", "871"), (stryMutAct_9fa48("872") ? state.user_prompt : (stryCov_9fa48("872"), state.user_prompt.trim())) !== (stryMutAct_9fa48("873") ? "Stryker was here!" : (stryCov_9fa48("873"), '')))));
  return selectCanRun;
})());