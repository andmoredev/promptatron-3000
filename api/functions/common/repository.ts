import { randomUUID } from 'node:crypto';
import {
  DeleteCommand,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { METADATA_SK, SCENARIO_GSI1PK, datasetSk, promptSk, scenarioPk, toolSk } from './keys';
import { decodeCursor, encodeCursor } from './pagination';
import type {
  DatasetContentType,
  DatasetMetadata,
  DatasetRecord,
  HydratedScenario,
  Page,
  PromptKind,
  PromptRecord,
  PromptSummary,
  ScenarioSummary,
  ToolRecord,
} from './types';

const GSI1_NAME = 'GSI1';

export interface PageOptions {
  limit?: number;
  nextToken?: string;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export const listScenarios = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  { limit, nextToken }: PageOptions
): Promise<Page<ScenarioSummary>> => {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: GSI1_NAME,
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: { ':gsi1pk': SCENARIO_GSI1PK },
      ...(limit ? { Limit: limit } : {}),
      ...(nextToken ? { ExclusiveStartKey: decodeCursor(nextToken) } : {}),
    })
  );

  const items: ScenarioSummary[] = (res.Items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    ...(item.description ? { description: item.description } : {}),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  return {
    items,
    count: items.length,
    ...(res.LastEvaluatedKey ? { nextToken: encodeCursor(res.LastEvaluatedKey) } : {}),
  };
};

export interface CreateScenarioInput {
  id?: string;
  name: string;
  description?: string;
}

export const createScenario = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  input: CreateScenarioInput
): Promise<ScenarioSummary> => {
  const id = input.id?.trim() || randomUUID();
  const now = new Date().toISOString();
  const item = {
    pk: scenarioPk(id),
    sk: METADATA_SK,
    GSI1PK: SCENARIO_GSI1PK,
    GSI1SK: input.name,
    id,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(pk)',
    })
  );

  const { pk: _pk, sk: _sk, GSI1PK: _g1, GSI1SK: _g2, ...summary } = item;
  return summary as ScenarioSummary;
};

export const getScenarioMetadata = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string
): Promise<Record<string, any> | null> => {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: scenarioPk(scenarioId), sk: METADATA_SK },
    })
  );
  return res.Item ?? null;
};

export interface UpdateScenarioInput {
  name?: string;
  description?: string;
}

export const updateScenarioMetadata = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  input: UpdateScenarioInput
): Promise<void> => {
  const now = new Date().toISOString();
  const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
  const values: Record<string, unknown> = { ':updatedAt': now };
  const sets = ['#updatedAt = :updatedAt'];

  if (typeof input.name === 'string') {
    names['#name'] = 'name';
    values[':name'] = input.name;
    sets.push('#name = :name');
    names['#gsi1sk'] = 'GSI1SK';
    values[':gsi1sk'] = input.name;
    sets.push('#gsi1sk = :gsi1sk');
  }
  if (typeof input.description === 'string') {
    names['#description'] = 'description';
    values[':description'] = input.description;
    sets.push('#description = :description');
  }

  await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: scenarioPk(scenarioId), sk: METADATA_SK },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
    })
  );
};

const queryPartition = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string
): Promise<Record<string, any>[]> => {
  const items: Record<string, any>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': scenarioPk(scenarioId) },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      })
    );
    items.push(...(res.Items ?? []));
    exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
  return items;
};

/** Hydrates a full scenario (metadata + prompts + tools + datasets) from a single partition Query. */
export const hydrateScenario = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string
): Promise<HydratedScenario | null> => {
  const items = await queryPartition(ddb, tableName, scenarioId);
  const metadata = items.find((item) => item.sk === METADATA_SK);
  if (!metadata) return null;

  const systemPrompts: PromptSummary[] = [];
  const userPrompts: PromptSummary[] = [];
  const tools: ToolRecord[] = [];
  const datasets: DatasetMetadata[] = [];

  for (const item of items) {
    const sk = String(item.sk);
    if (sk.startsWith('PROMPT#SYSTEM#')) {
      systemPrompts.push({ id: item.id, name: item.name, content: item.content });
    } else if (sk.startsWith('PROMPT#USER#')) {
      userPrompts.push({ id: item.id, name: item.name, content: item.content });
    } else if (sk.startsWith('TOOL#')) {
      tools.push({
        name: item.name,
        description: item.description,
        inputSchema: item.inputSchema,
        handlerKey: item.handlerKey,
      });
    } else if (sk.startsWith('DATASET#')) {
      datasets.push({
        id: item.id,
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        contentType: item.contentType,
      });
    }
  }

  return {
    id: metadata.id,
    name: metadata.name,
    ...(metadata.description ? { description: metadata.description } : {}),
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    systemPrompts,
    userPrompts,
    tools,
    datasets,
  };
};

/** Deletes every item in the scenario's partition (metadata, prompts, tools, datasets). */
export const deleteScenario = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string
): Promise<boolean> => {
  const items = await queryPartition(ddb, tableName, scenarioId);
  const hasMetadata = items.some((item) => item.sk === METADATA_SK);
  if (!hasMetadata) return false;

  await Promise.all(
    items.map((item) =>
      ddb.send(new DeleteCommand({ TableName: tableName, Key: { pk: item.pk, sk: item.sk } }))
    )
  );
  return true;
};

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export const listPrompts = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  { limit, nextToken }: PageOptions
): Promise<Page<PromptRecord>> => {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :pfx)',
      ExpressionAttributeValues: { ':pk': scenarioPk(scenarioId), ':pfx': 'PROMPT#' },
      ...(limit ? { Limit: limit } : {}),
      ...(nextToken ? { ExclusiveStartKey: decodeCursor(nextToken) } : {}),
    })
  );

  const items: PromptRecord[] = (res.Items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    content: item.content,
    kind: item.kind,
  }));

  return {
    items,
    count: items.length,
    ...(res.LastEvaluatedKey ? { nextToken: encodeCursor(res.LastEvaluatedKey) } : {}),
  };
};

export interface CreatePromptInput {
  kind: PromptKind;
  name: string;
  content: string;
}

export const createPrompt = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  input: CreatePromptInput
): Promise<string> => {
  const id = randomUUID();
  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        pk: scenarioPk(scenarioId),
        sk: promptSk(input.kind, id),
        id,
        name: input.name,
        content: input.content,
        kind: input.kind,
      },
    })
  );
  return id;
};

const findPromptItem = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  promptId: string
): Promise<Record<string, any> | null> => {
  for (const kind of ['SYSTEM', 'USER'] as const) {
    const res = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: scenarioPk(scenarioId), sk: promptSk(kind, promptId) },
      })
    );
    if (res.Item) return res.Item;
  }
  return null;
};

export interface UpdatePromptInput {
  name?: string;
  content?: string;
}

export const updatePrompt = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  promptId: string,
  input: UpdatePromptInput
): Promise<boolean> => {
  const existing = await findPromptItem(ddb, tableName, scenarioId, promptId);
  if (!existing) return false;

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  if (typeof input.name === 'string') {
    names['#name'] = 'name';
    values[':name'] = input.name;
    sets.push('#name = :name');
  }
  if (typeof input.content === 'string') {
    names['#content'] = 'content';
    values[':content'] = input.content;
    sets.push('#content = :content');
  }
  if (sets.length === 0) return true;

  await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { pk: existing.pk, sk: existing.sk },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
  return true;
};

export const deletePrompt = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  promptId: string
): Promise<boolean> => {
  const existing = await findPromptItem(ddb, tableName, scenarioId, promptId);
  if (!existing) return false;
  await ddb.send(
    new DeleteCommand({ TableName: tableName, Key: { pk: existing.pk, sk: existing.sk } })
  );
  return true;
};

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export const listDatasets = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  { limit, nextToken }: PageOptions
): Promise<Page<DatasetMetadata>> => {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :pfx)',
      ExpressionAttributeValues: { ':pk': scenarioPk(scenarioId), ':pfx': 'DATASET#' },
      ProjectionExpression: 'id, #n, description, contentType',
      ExpressionAttributeNames: { '#n': 'name' },
      ...(limit ? { Limit: limit } : {}),
      ...(nextToken ? { ExclusiveStartKey: decodeCursor(nextToken) } : {}),
    })
  );

  const items: DatasetMetadata[] = (res.Items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    ...(item.description ? { description: item.description } : {}),
    contentType: item.contentType,
  }));

  return {
    items,
    count: items.length,
    ...(res.LastEvaluatedKey ? { nextToken: encodeCursor(res.LastEvaluatedKey) } : {}),
  };
};

export const getDataset = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  datasetId: string
): Promise<DatasetRecord | null> => {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: scenarioPk(scenarioId), sk: datasetSk(datasetId) },
    })
  );
  if (!res.Item) return null;
  return {
    id: res.Item.id,
    name: res.Item.name,
    ...(res.Item.description ? { description: res.Item.description } : {}),
    contentType: res.Item.contentType,
    content: res.Item.content,
  };
};

export interface CreateDatasetInput {
  id?: string;
  name: string;
  description?: string;
  contentType: DatasetContentType;
  content: string;
}

export const createDataset = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  input: CreateDatasetInput
): Promise<string> => {
  const id = input.id?.trim() || randomUUID();
  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        pk: scenarioPk(scenarioId),
        sk: datasetSk(id),
        id,
        name: input.name,
        ...(input.description ? { description: input.description } : {}),
        contentType: input.contentType,
        content: input.content,
      },
    })
  );
  return id;
};

export interface UpdateDatasetInput {
  name?: string;
  description?: string;
  contentType?: DatasetContentType;
  content?: string;
}

export const updateDataset = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  datasetId: string,
  input: UpdateDatasetInput
): Promise<boolean> => {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  if (typeof input.name === 'string') {
    names['#name'] = 'name';
    values[':name'] = input.name;
    sets.push('#name = :name');
  }
  if (typeof input.description === 'string') {
    names['#description'] = 'description';
    values[':description'] = input.description;
    sets.push('#description = :description');
  }
  if (typeof input.contentType === 'string') {
    names['#contentType'] = 'contentType';
    values[':contentType'] = input.contentType;
    sets.push('#contentType = :contentType');
  }
  if (typeof input.content === 'string') {
    names['#content'] = 'content';
    values[':content'] = input.content;
    sets.push('#content = :content');
  }
  if (sets.length === 0) return false;

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: scenarioPk(scenarioId), sk: datasetSk(datasetId) },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
      })
    );
    return true;
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
};

export const deleteDataset = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  datasetId: string
): Promise<boolean> => {
  const res = await ddb.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { pk: scenarioPk(scenarioId), sk: datasetSk(datasetId) },
      ReturnValues: 'ALL_OLD',
    })
  );
  return Boolean(res.Attributes);
};

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const listTools = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string
): Promise<ToolRecord[]> => {
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :pfx)',
      ExpressionAttributeValues: { ':pk': scenarioPk(scenarioId), ':pfx': 'TOOL#' },
    })
  );
  return (res.Items ?? []).map((item) => ({
    name: item.name,
    description: item.description,
    inputSchema: item.inputSchema,
    handlerKey: item.handlerKey,
  }));
};

export const getTool = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  toolName: string
): Promise<ToolRecord | null> => {
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: scenarioPk(scenarioId), sk: toolSk(toolName) },
    })
  );
  if (!res.Item) return null;
  return {
    name: res.Item.name,
    description: res.Item.description,
    inputSchema: res.Item.inputSchema,
    handlerKey: res.Item.handlerKey,
  };
};

export interface PutToolInput {
  description: string;
  inputSchema: Record<string, unknown>;
  handlerKey: string;
}

export const putTool = async (
  ddb: DynamoDBDocumentClient,
  tableName: string,
  scenarioId: string,
  toolName: string,
  input: PutToolInput
): Promise<ToolRecord> => {
  await ddb.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        pk: scenarioPk(scenarioId),
        sk: toolSk(toolName),
        name: toolName,
        description: input.description,
        inputSchema: input.inputSchema,
        handlerKey: input.handlerKey,
      },
    })
  );
  return { name: toolName, description: input.description, inputSchema: input.inputSchema, handlerKey: input.handlerKey };
};
