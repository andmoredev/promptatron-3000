import type { PromptKind } from './keys';

export type { PromptKind };

export interface ScenarioSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptSummary {
  id: string;
  name: string;
  content: string;
}

export interface PromptRecord extends PromptSummary {
  kind: PromptKind;
}

export interface ToolRecord {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handlerKey: string;
}

export type DatasetContentType = 'text/csv' | 'application/json';

export interface DatasetMetadata {
  id: string;
  name: string;
  description?: string;
  contentType: DatasetContentType;
}

export interface DatasetRecord extends DatasetMetadata {
  content: string;
}

export interface HydratedScenario extends ScenarioSummary {
  systemPrompts: PromptSummary[];
  userPrompts: PromptSummary[];
  tools: ToolRecord[];
  datasets: DatasetMetadata[];
}

export interface Page<T> {
  items: T[];
  count: number;
  nextToken?: string;
}
