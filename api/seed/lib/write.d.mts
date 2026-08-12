import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ScenarioItems } from './transform.d.mts';

export interface UpsertResult {
  scenarioId: string;
  itemCount: number;
}

export interface UpsertOptions {
  now?: string;
}

export function upsertScenario(
  ddb: DynamoDBDocumentClient,
  tableName: string,
  items: ScenarioItems,
  options?: UpsertOptions
): Promise<UpsertResult>;

export function upsertFixtures(
  ddb: DynamoDBDocumentClient,
  tableName: string,
  fixtureItemsList: ScenarioItems[],
  options?: UpsertOptions
): Promise<UpsertResult[]>;
