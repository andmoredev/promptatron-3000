/**
 * Single-table key helpers.
 *
 * Item collection layout (per scenario partition):
 *   pk = SCENARIO#{scenarioId}
 *     sk = METADATA                      -> scenario metadata
 *     sk = PROMPT#SYSTEM#{promptId}      -> system prompt
 *     sk = PROMPT#USER#{promptId}        -> user prompt
 *     sk = TOOL#{toolName}               -> tool definition
 *     sk = DATASET#{datasetId}           -> dataset (metadata + inline content)
 *
 * GSI1 (listing scenarios):
 *   GSI1PK = "SCENARIO", GSI1SK = {name}
 */

export const METADATA_SK = 'METADATA';
export const PROMPT_PREFIX = 'PROMPT#';
export const TOOL_PREFIX = 'TOOL#';
export const DATASET_PREFIX = 'DATASET#';
export const SCENARIO_GSI1PK = 'SCENARIO';

export type PromptKind = 'SYSTEM' | 'USER';

export const scenarioPk = (scenarioId: string): string => `SCENARIO#${scenarioId}`;

export const promptSk = (kind: PromptKind, promptId: string): string => `${PROMPT_PREFIX}${kind}#${promptId}`;

export const toolSk = (toolName: string): string => `${TOOL_PREFIX}${toolName}`;

export const datasetSk = (datasetId: string): string => `${DATASET_PREFIX}${datasetId}`;

export const isPromptSk = (sk: string): boolean => sk.startsWith(PROMPT_PREFIX);
export const isToolSk = (sk: string): boolean => sk.startsWith(TOOL_PREFIX);
export const isDatasetSk = (sk: string): boolean => sk.startsWith(DATASET_PREFIX);

export const promptKindFromSk = (sk: string): PromptKind =>
  sk.startsWith(`${PROMPT_PREFIX}SYSTEM#`) ? 'SYSTEM' : 'USER';
