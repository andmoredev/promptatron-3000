export interface MetadataItem {
  pk: string;
  sk: 'METADATA';
  GSI1PK: 'SCENARIO';
  GSI1SK: string;
  id: string;
  name: string;
  description?: string;
}

export interface PromptItem {
  pk: string;
  sk: string;
  id: string;
  name: string;
  content: string;
  kind: 'SYSTEM' | 'USER';
}

export interface ToolItem {
  pk: string;
  sk: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handlerKey: string;
}

export interface DatasetItem {
  pk: string;
  sk: string;
  id: string;
  name: string;
  description?: string;
  contentType: 'text/csv' | 'application/json';
  content: string;
}

export interface ScenarioItems {
  scenarioId: string;
  metadata: MetadataItem;
  systemPrompts: PromptItem[];
  userPrompts: PromptItem[];
  tools: ToolItem[];
  datasets: DatasetItem[];
}

export interface ScenarioFixture {
  fixtureDir: string;
  scenario: Record<string, any>;
}

export const METADATA_SK: 'METADATA';

export function scenarioPk(scenarioId: string): string;
export function promptSk(kind: 'SYSTEM' | 'USER', promptId: string): string;
export function toolSk(toolName: string): string;
export function datasetSk(datasetId: string): string;

export function discoverFixtureDirs(fixturesRoot: string): string[];
export function loadScenarioFixture(fixtureDir: string): ScenarioFixture;
export function buildScenarioItems(fixture: ScenarioFixture): ScenarioItems;
export function loadAllFixtures(fixturesRoot: string): ScenarioItems[];
