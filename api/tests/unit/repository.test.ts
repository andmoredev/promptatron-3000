import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDataset,
  createPrompt,
  createScenario,
  deleteDataset,
  deletePrompt,
  deleteScenario,
  getDataset,
  getTool,
  hydrateScenario,
  listDatasets,
  listPrompts,
  listScenarios,
  listTools,
  putTool,
  updateDataset,
  updatePrompt,
  updateScenarioMetadata,
} from '../../functions/common/repository';

const conditionalCheckFailed = () => {
  const err: any = new Error('The conditional request failed');
  err.name = 'ConditionalCheckFailedException';
  return err;
};

const TABLE_NAME = 'promptatron-table';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ddbMock = mockClient(ddb);

beforeEach(() => {
  ddbMock.reset();
});

describe('listScenarios', () => {
  it('queries GSI1 by GSI1PK = "SCENARIO" and maps summaries', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          pk: 'SCENARIO#fraud-detection-comprehensive',
          sk: 'METADATA',
          GSI1PK: 'SCENARIO',
          GSI1SK: 'Fraud Detection',
          id: 'fraud-detection-comprehensive',
          name: 'Fraud Detection',
          description: 'Comprehensive fraud detection scenario',
          createdAt: '2026-01-05T09:00:00.000Z',
          updatedAt: '2026-01-05T09:00:00.000Z',
        },
      ],
    });

    const page = await listScenarios(ddb, TABLE_NAME, {});

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.IndexName).toBe('GSI1');
    expect(call.args[0].input.KeyConditionExpression).toBe('GSI1PK = :gsi1pk');
    expect(call.args[0].input.ExpressionAttributeValues).toEqual({ ':gsi1pk': 'SCENARIO' });
    expect(call.args[0].input.Limit).toBeUndefined();

    expect(page.count).toBe(1);
    expect(page.items[0]).toEqual({
      id: 'fraud-detection-comprehensive',
      name: 'Fraud Detection',
      description: 'Comprehensive fraud detection scenario',
      createdAt: '2026-01-05T09:00:00.000Z',
      updatedAt: '2026-01-05T09:00:00.000Z',
    });
    expect(page.nextToken).toBeUndefined();
  });

  it('encodes LastEvaluatedKey into an opaque nextToken', async () => {
    const lastKey = { pk: 'SCENARIO#shipping-logistics', sk: 'METADATA', GSI1PK: 'SCENARIO', GSI1SK: 'Shipping Logistics' };
    ddbMock.on(QueryCommand).resolves({ Items: [], LastEvaluatedKey: lastKey });

    const page = await listScenarios(ddb, TABLE_NAME, { limit: 1 });

    expect(page.nextToken).toBeDefined();
    const decoded = JSON.parse(Buffer.from(page.nextToken as string, 'base64url').toString('utf8'));
    expect(decoded).toEqual(lastKey);
  });

  it('decodes an incoming nextToken into ExclusiveStartKey', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const key = { pk: 'SCENARIO#a', sk: 'METADATA', GSI1PK: 'SCENARIO', GSI1SK: 'A' };
    const token = Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');

    await listScenarios(ddb, TABLE_NAME, { nextToken: token });

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.ExclusiveStartKey).toEqual(key);
  });

  it('omits description from the summary when the item has none', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ id: 's1', name: 'S1', createdAt: 't', updatedAt: 't' }],
    });

    const page = await listScenarios(ddb, TABLE_NAME, {});
    expect(page.items[0]).toEqual({ id: 's1', name: 'S1', createdAt: 't', updatedAt: 't' });
    expect(page.items[0]).not.toHaveProperty('description');
  });

  it('treats a response with no Items key at all as an empty page', async () => {
    ddbMock.on(QueryCommand).resolves({});
    const page = await listScenarios(ddb, TABLE_NAME, {});
    expect(page.items).toEqual([]);
    expect(page.count).toBe(0);
  });

  it('passes limit through as the DynamoDB Limit', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    await listScenarios(ddb, TABLE_NAME, { limit: 7 });
    expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input.Limit).toBe(7);
  });
});

describe('createScenario', () => {
  it('writes the exact item shape (pk/sk/GSI1PK/GSI1SK/id/name/description/timestamps) and a not-exists ConditionExpression', async () => {
    ddbMock.on(PutCommand).resolves({});

    const summary = await createScenario(ddb, TABLE_NAME, { id: 'my-id', name: 'My Scenario', description: 'desc' });

    const call = ddbMock.commandCalls(PutCommand)[0];
    expect(call.args[0].input.TableName).toBe(TABLE_NAME);
    expect(call.args[0].input.ConditionExpression).toBe('attribute_not_exists(pk)');
    expect(call.args[0].input.Item).toMatchObject({
      pk: 'SCENARIO#my-id',
      sk: 'METADATA',
      GSI1PK: 'SCENARIO',
      GSI1SK: 'My Scenario',
      id: 'my-id',
      name: 'My Scenario',
      description: 'desc',
    });
    // the returned summary must not leak the internal pk/sk/GSI1 attributes
    expect(summary).not.toHaveProperty('pk');
    expect(summary).not.toHaveProperty('sk');
    expect(summary).not.toHaveProperty('GSI1PK');
    expect(summary).not.toHaveProperty('GSI1SK');
    expect(summary.id).toBe('my-id');
    expect(summary.description).toBe('desc');
  });

  it('omits description from the item when none is given', async () => {
    ddbMock.on(PutCommand).resolves({});
    await createScenario(ddb, TABLE_NAME, { id: 'x', name: 'X' });
    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).not.toHaveProperty('description');
  });

  it('trims a provided id before using it as the pk', async () => {
    ddbMock.on(PutCommand).resolves({});
    await createScenario(ddb, TABLE_NAME, { id: '  padded-id  ', name: 'X' });
    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item?.pk).toBe('SCENARIO#padded-id');
    expect(item?.id).toBe('padded-id');
  });

  it('falls back to a random id when id is omitted', async () => {
    ddbMock.on(PutCommand).resolves({});
    const summary = await createScenario(ddb, TABLE_NAME, { name: 'X' });
    expect(summary.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('falls back to a random id when the given id is blank/whitespace-only', async () => {
    ddbMock.on(PutCommand).resolves({});
    const summary = await createScenario(ddb, TABLE_NAME, { id: '   ', name: 'X' });
    expect(summary.id).not.toBe('   ');
    expect(summary.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('hydrateScenario', () => {
  it('folds a single partition Query into systemPrompts/userPrompts/tools/datasets', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          pk: 'SCENARIO#fraud-detection-comprehensive',
          sk: 'METADATA',
          id: 'fraud-detection-comprehensive',
          name: 'Fraud Detection',
          description: 'Comprehensive fraud detection scenario',
          createdAt: '2026-01-05T09:00:00.000Z',
          updatedAt: '2026-01-05T09:00:00.000Z',
        },
        {
          pk: 'SCENARIO#fraud-detection-comprehensive',
          sk: 'PROMPT#SYSTEM#fraud-analyst',
          id: 'fraud-analyst',
          name: 'Expert Fraud Detection Analyst',
          content: 'You are an expert fraud detection analyst...',
          kind: 'SYSTEM',
        },
        {
          pk: 'SCENARIO#fraud-detection-comprehensive',
          sk: 'PROMPT#USER#analyze-transactions',
          id: 'analyze-transactions',
          name: 'Comprehensive Fraud Pattern Analysis',
          content: 'Analyze the provided transaction data...',
          kind: 'USER',
        },
        {
          pk: 'SCENARIO#fraud-detection-comprehensive',
          sk: 'TOOL#freeze_account',
          name: 'freeze_account',
          description: 'Immediately freeze an account...',
          handlerKey: 'tools/freezeAccount.freezeAccount',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          pk: 'SCENARIO#fraud-detection-comprehensive',
          sk: 'DATASET#retail-transactions',
          id: 'retail-transactions',
          name: 'Retail Transaction Data',
          description: 'Sample retail transaction data',
          contentType: 'text/csv',
          content: 'transaction_id,account_id,amount\nT0001,A1234,25.99\n',
        },
      ],
    });

    const scenario = await hydrateScenario(ddb, TABLE_NAME, 'fraud-detection-comprehensive');

    expect(scenario).not.toBeNull();
    expect(scenario?.id).toBe('fraud-detection-comprehensive');
    expect(scenario?.description).toBe('Comprehensive fraud detection scenario');
    expect(scenario?.systemPrompts).toHaveLength(1);
    expect(scenario?.systemPrompts[0]).toEqual({
      id: 'fraud-analyst',
      name: 'Expert Fraud Detection Analyst',
      content: 'You are an expert fraud detection analyst...',
    });
    expect(scenario?.userPrompts).toHaveLength(1);
    expect(scenario?.userPrompts[0]).toEqual({
      id: 'analyze-transactions',
      name: 'Comprehensive Fraud Pattern Analysis',
      content: 'Analyze the provided transaction data...',
    });
    expect(scenario?.tools).toHaveLength(1);
    expect(scenario?.tools[0].name).toBe('freeze_account');
    expect(scenario?.datasets).toHaveLength(1);
    // hydrated view must NOT inline dataset content
    expect(scenario?.datasets[0]).toEqual({
      id: 'retail-transactions',
      name: 'Retail Transaction Data',
      description: 'Sample retail transaction data',
      contentType: 'text/csv',
    });
    expect((scenario?.datasets[0] as any).content).toBeUndefined();
  });

  it('omits scenario-level description when the METADATA item has none', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ pk: 'SCENARIO#s1', sk: 'METADATA', id: 's1', name: 'S1', createdAt: 't', updatedAt: 't' }],
    });
    const scenario = await hydrateScenario(ddb, TABLE_NAME, 's1');
    expect(scenario).not.toBeNull();
    expect(scenario).not.toHaveProperty('description');
  });

  it('finds the METADATA item regardless of its position in the partition (not just items[0])', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { pk: 'SCENARIO#s1', sk: 'DATASET#d1', id: 'd1', name: 'D1', contentType: 'text/csv' },
        { pk: 'SCENARIO#s1', sk: 'METADATA', id: 's1', name: 'Real Scenario', createdAt: 't', updatedAt: 't' },
      ],
    });
    const scenario = await hydrateScenario(ddb, TABLE_NAME, 's1');
    expect(scenario?.id).toBe('s1');
    expect(scenario?.name).toBe('Real Scenario');
  });

  it('returns null when no METADATA item exists for the scenario', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const scenario = await hydrateScenario(ddb, TABLE_NAME, 'missing-scenario');
    expect(scenario).toBeNull();
  });

  it('treats a Query response with no Items key as an empty page for that call', async () => {
    ddbMock.on(QueryCommand).resolves({}); // no METADATA -> queryPartition still folds to []
    const scenario = await hydrateScenario(ddb, TABLE_NAME, 's1');
    expect(scenario).toBeNull();
  });

  it('paginates through the full partition before folding, feeding LastEvaluatedKey into the next ExclusiveStartKey', async () => {
    const lastKey = { pk: 'SCENARIO#s1', sk: 'METADATA' };
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [{ pk: 'SCENARIO#s1', sk: 'METADATA', id: 's1', name: 'S1', createdAt: 't', updatedAt: 't' }],
        LastEvaluatedKey: lastKey,
      })
      .resolvesOnce({
        Items: [{ pk: 'SCENARIO#s1', sk: 'TOOL#some_tool', name: 'some_tool', description: 'd', handlerKey: 'h', inputSchema: {} }],
      });

    const scenario = await hydrateScenario(ddb, TABLE_NAME, 's1');
    const calls = ddbMock.commandCalls(QueryCommand);
    expect(calls).toHaveLength(2);
    expect(calls[0].args[0].input.ExpressionAttributeValues).toEqual({ ':pk': 'SCENARIO#s1' });
    expect(calls[0].args[0].input.ExclusiveStartKey).toBeUndefined();
    expect(calls[1].args[0].input.ExclusiveStartKey).toEqual(lastKey);
    expect(scenario?.tools).toHaveLength(1);
  });
});

describe('deleteScenario', () => {
  it('deletes every item found in the partition (by its own exact pk/sk) and returns true', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { pk: 'SCENARIO#s1', sk: 'METADATA' },
        { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1' },
        { pk: 'SCENARIO#s1', sk: 'DATASET#d1' },
      ],
    });
    ddbMock.on(DeleteCommand).resolves({});

    const result = await deleteScenario(ddb, TABLE_NAME, 's1');

    expect(result).toBe(true);
    const deletes = ddbMock.commandCalls(DeleteCommand);
    expect(deletes).toHaveLength(3);
    expect(deletes.map((c) => c.args[0].input.Key)).toEqual(
      expect.arrayContaining([
        { pk: 'SCENARIO#s1', sk: 'METADATA' },
        { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1' },
        { pk: 'SCENARIO#s1', sk: 'DATASET#d1' },
      ])
    );
    for (const call of deletes) {
      expect(call.args[0].input.TableName).toBe(TABLE_NAME);
    }
  });

  it('returns false when the partition has no METADATA item (scenario does not exist)', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const result = await deleteScenario(ddb, TABLE_NAME, 'missing');
    expect(result).toBe(false);
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });

  it('returns false when the partition has OTHER items but none is METADATA', async () => {
    // A non-empty partition without a METADATA item must not be mistaken for "exists" --
    // .some() over a non-empty array is the real behavior under test here.
    ddbMock.on(QueryCommand).resolves({
      Items: [{ pk: 'SCENARIO#orphan', sk: 'PROMPT#SYSTEM#p1' }],
    });

    const result = await deleteScenario(ddb, TABLE_NAME, 'orphan');

    expect(result).toBe(false);
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });
});

describe('dataset content round trip', () => {
  it('stores and returns the exact inline content for a created dataset', async () => {
    const content = 'transaction_id,account_id,amount\nT0001,A1234,25.99\n';
    ddbMock.on(PutCommand).resolves({});

    const id = await createDataset(ddb, TABLE_NAME, 'fraud-detection-comprehensive', {
      id: 'retail-transactions',
      name: 'Retail Transaction Data',
      description: 'Sample retail transaction data',
      contentType: 'text/csv',
      content,
    });

    expect(id).toBe('retail-transactions');
    const putCall = ddbMock.commandCalls(PutCommand)[0];
    expect(putCall.args[0].input.Item?.content).toBe(content);

    ddbMock.on(GetCommand).resolves({
      Item: {
        id: 'retail-transactions',
        name: 'Retail Transaction Data',
        description: 'Sample retail transaction data',
        contentType: 'text/csv',
        content,
      },
    });

    const dataset = await getDataset(ddb, TABLE_NAME, 'fraud-detection-comprehensive', 'retail-transactions');
    expect(dataset?.content).toBe(content);
    expect(dataset?.contentType).toBe('text/csv');
    expect(dataset?.description).toBe('Sample retail transaction data');

    const getCall = ddbMock.commandCalls(GetCommand)[0];
    expect(getCall.args[0].input.Key).toEqual({
      pk: 'SCENARIO#fraud-detection-comprehensive',
      sk: 'DATASET#retail-transactions',
    });
  });

  it('getDataset omits description when the stored item has none', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'd1', name: 'D1', contentType: 'application/json', content: '{}' },
    });

    const dataset = await getDataset(ddb, TABLE_NAME, 's1', 'd1');
    expect(dataset).toEqual({ id: 'd1', name: 'D1', contentType: 'application/json', content: '{}' });
    expect(dataset).not.toHaveProperty('description');
  });

  it('createDataset generates a random id when none is provided', async () => {
    ddbMock.on(PutCommand).resolves({});

    const id = await createDataset(ddb, TABLE_NAME, 's1', {
      name: 'D',
      contentType: 'application/json',
      content: '{}',
    });

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const putCall = ddbMock.commandCalls(PutCommand)[0];
    expect(putCall.args[0].input.Item?.id).toBe(id);
  });

  it('createDataset falls back to a random id when the provided id is blank/whitespace', async () => {
    ddbMock.on(PutCommand).resolves({});

    const id = await createDataset(ddb, TABLE_NAME, 's1', {
      id: '   ',
      name: 'D',
      contentType: 'application/json',
      content: '{}',
    });

    expect(id).not.toBe('   ');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('updateScenarioMetadata', () => {
  it('sets updatedAt, name and GSI1SK (mirrored) when name is provided', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await updateScenarioMetadata(ddb, TABLE_NAME, 's1', { name: 'Renamed' });

    const call = ddbMock.commandCalls(UpdateCommand)[0];
    expect(call.args[0].input.Key).toEqual({ pk: 'SCENARIO#s1', sk: 'METADATA' });
    expect(call.args[0].input.UpdateExpression).toBe(
      'SET #updatedAt = :updatedAt, #name = :name, #gsi1sk = :gsi1sk'
    );
    expect(call.args[0].input.ExpressionAttributeNames).toEqual({
      '#updatedAt': 'updatedAt',
      '#name': 'name',
      '#gsi1sk': 'GSI1SK',
    });
    expect(call.args[0].input.ExpressionAttributeValues).toEqual({
      ':updatedAt': expect.any(String),
      ':name': 'Renamed',
      ':gsi1sk': 'Renamed',
    });
    expect(call.args[0].input.ConditionExpression).toBe('attribute_exists(pk) AND attribute_exists(sk)');
  });

  it('sets only description (no GSI1SK touch) when only description is provided', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await updateScenarioMetadata(ddb, TABLE_NAME, 's1', { description: 'New desc' });

    const call = ddbMock.commandCalls(UpdateCommand)[0];
    expect(call.args[0].input.UpdateExpression).toBe('SET #updatedAt = :updatedAt, #description = :description');
    expect(call.args[0].input.ExpressionAttributeNames).toEqual({
      '#updatedAt': 'updatedAt',
      '#description': 'description',
    });
    expect(call.args[0].input.ExpressionAttributeValues).toEqual({
      ':updatedAt': expect.any(String),
      ':description': 'New desc',
    });
  });

  it('propagates ConditionalCheckFailedException when the scenario does not exist', async () => {
    ddbMock.on(UpdateCommand).rejects(conditionalCheckFailed());

    await expect(updateScenarioMetadata(ddb, TABLE_NAME, 'missing', { name: 'x' })).rejects.toMatchObject({
      name: 'ConditionalCheckFailedException',
    });
  });
});

describe('listPrompts', () => {
  it('queries pk = :pk AND begins_with(sk, PROMPT#) and maps id/name/content/kind', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1', id: 'p1', name: 'Sys Prompt', content: 'sys content', kind: 'SYSTEM' },
        { pk: 'SCENARIO#s1', sk: 'PROMPT#USER#p2', id: 'p2', name: 'User Prompt', content: 'user content', kind: 'USER' },
      ],
    });

    const page = await listPrompts(ddb, TABLE_NAME, 's1', { limit: 5 });

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.KeyConditionExpression).toBe('pk = :pk AND begins_with(sk, :pfx)');
    expect(call.args[0].input.ExpressionAttributeValues).toEqual({ ':pk': 'SCENARIO#s1', ':pfx': 'PROMPT#' });
    expect(call.args[0].input.Limit).toBe(5);

    expect(page.count).toBe(2);
    expect(page.items[0]).toEqual({ id: 'p1', name: 'Sys Prompt', content: 'sys content', kind: 'SYSTEM' });
    expect(page.items[1]).toEqual({ id: 'p2', name: 'User Prompt', content: 'user content', kind: 'USER' });
  });

  it('encodes LastEvaluatedKey as nextToken when the query is truncated', async () => {
    const lastKey = { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1' };
    ddbMock.on(QueryCommand).resolves({ Items: [], LastEvaluatedKey: lastKey });

    const page = await listPrompts(ddb, TABLE_NAME, 's1', {});
    expect(page.nextToken).toBeDefined();
    expect(JSON.parse(Buffer.from(page.nextToken as string, 'base64url').toString('utf8'))).toEqual(lastKey);
  });

  it('decodes an incoming nextToken into ExclusiveStartKey', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const key = { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1' };
    const token = Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');

    await listPrompts(ddb, TABLE_NAME, 's1', { nextToken: token });

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.ExclusiveStartKey).toEqual(key);
  });

  it('treats a response with no Items key at all as an empty page', async () => {
    ddbMock.on(QueryCommand).resolves({});
    const page = await listPrompts(ddb, TABLE_NAME, 's1', {});
    expect(page.items).toEqual([]);
  });
});

describe('updatePrompt / deletePrompt (findPromptItem SYSTEM-then-USER lookup)', () => {
  it('finds a USER prompt on the second lookup (SYSTEM miss, USER hit) and updates by its exact pk/sk', async () => {
    ddbMock.on(GetCommand).callsFake((input) => {
      if ((input.Key.sk as string).startsWith('PROMPT#SYSTEM#')) return { Item: undefined };
      return { Item: { pk: 'SCENARIO#s1', sk: 'PROMPT#USER#p2', id: 'p2', name: 'old', content: 'old content' } };
    });
    ddbMock.on(UpdateCommand).resolves({});

    const updated = await updatePrompt(ddb, TABLE_NAME, 's1', 'p2', { name: 'new name' });

    expect(updated).toBe(true);
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(2);
    const updateCall = ddbMock.commandCalls(UpdateCommand)[0];
    expect(updateCall.args[0].input.Key).toEqual({ pk: 'SCENARIO#s1', sk: 'PROMPT#USER#p2' });
    expect(updateCall.args[0].input.UpdateExpression).toBe('SET #name = :name');
    expect(updateCall.args[0].input.ExpressionAttributeNames).toEqual({ '#name': 'name' });
    expect(updateCall.args[0].input.ExpressionAttributeValues).toEqual({ ':name': 'new name' });
  });

  it('joins both SET clauses with a comma when both name and content are provided', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1', id: 'p1' } });
    ddbMock.on(UpdateCommand).resolves({});

    await updatePrompt(ddb, TABLE_NAME, 's1', 'p1', { name: 'N', content: 'C' });

    const call = ddbMock.commandCalls(UpdateCommand)[0];
    expect(call.args[0].input.UpdateExpression).toBe('SET #name = :name, #content = :content');
    expect(call.args[0].input.ExpressionAttributeNames).toEqual({ '#name': 'name', '#content': 'content' });
    expect(call.args[0].input.ExpressionAttributeValues).toEqual({ ':name': 'N', ':content': 'C' });
  });

  it('updates content only when name is omitted', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1', id: 'p1' } });
    ddbMock.on(UpdateCommand).resolves({});

    const updated = await updatePrompt(ddb, TABLE_NAME, 's1', 'p1', { content: 'only content' });

    expect(updated).toBe(true);
    const call = ddbMock.commandCalls(UpdateCommand)[0];
    expect(call.args[0].input.UpdateExpression).toBe('SET #content = :content');
    expect(call.args[0].input.ExpressionAttributeNames).toEqual({ '#content': 'content' });
    expect(call.args[0].input.ExpressionAttributeValues).toEqual({ ':content': 'only content' });
  });

  it('returns false when neither SYSTEM nor USER sk has an item', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const updated = await updatePrompt(ddb, TABLE_NAME, 's1', 'missing', { name: 'x' });

    expect(updated).toBe(false);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('returns true without calling UpdateCommand when the prompt exists but no updatable fields are given', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1', id: 'p1' } });

    const updated = await updatePrompt(ddb, TABLE_NAME, 's1', 'p1', {});

    expect(updated).toBe(true);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('deletePrompt deletes by the found item exact pk/sk and returns true', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1', id: 'p1' } });
    ddbMock.on(DeleteCommand).resolves({});

    const deleted = await deletePrompt(ddb, TABLE_NAME, 's1', 'p1');

    expect(deleted).toBe(true);
    const call = ddbMock.commandCalls(DeleteCommand)[0];
    expect(call.args[0].input.Key).toEqual({ pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1' });
  });

  it('deletePrompt returns false when the prompt is not found under either kind', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const deleted = await deletePrompt(ddb, TABLE_NAME, 's1', 'missing');

    expect(deleted).toBe(false);
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(0);
  });
});

describe('createPrompt', () => {
  it('writes the item under PROMPT#{kind}#{id} and returns the generated id', async () => {
    ddbMock.on(PutCommand).resolves({});

    const id = await createPrompt(ddb, TABLE_NAME, 's1', { kind: 'USER', name: 'Q', content: 'c' });

    const call = ddbMock.commandCalls(PutCommand)[0];
    expect(call.args[0].input.Item?.sk).toBe(`PROMPT#USER#${id}`);
    expect(call.args[0].input.Item?.pk).toBe('SCENARIO#s1');
  });
});

describe('listDatasets', () => {
  it('queries pk = :pk AND begins_with(sk, DATASET#) with a name-only projection and maps metadata', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ id: 'd1', name: 'D1', description: 'desc', contentType: 'text/csv' }],
    });

    const page = await listDatasets(ddb, TABLE_NAME, 's1', { limit: 3 });

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.KeyConditionExpression).toBe('pk = :pk AND begins_with(sk, :pfx)');
    expect(call.args[0].input.ExpressionAttributeValues).toEqual({ ':pk': 'SCENARIO#s1', ':pfx': 'DATASET#' });
    expect(call.args[0].input.ProjectionExpression).toBe('id, #n, description, contentType');
    expect(call.args[0].input.ExpressionAttributeNames).toEqual({ '#n': 'name' });
    expect(call.args[0].input.Limit).toBe(3);

    expect(page.items[0]).toEqual({ id: 'd1', name: 'D1', description: 'desc', contentType: 'text/csv' });
    expect((page.items[0] as any).content).toBeUndefined();
  });

  it('omits description when the item has none', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ id: 'd1', name: 'D1', contentType: 'application/json' }] });

    const page = await listDatasets(ddb, TABLE_NAME, 's1', {});
    expect(page.items[0]).toEqual({ id: 'd1', name: 'D1', contentType: 'application/json' });
    expect(page.items[0]).not.toHaveProperty('description');
  });

  it('decodes an incoming nextToken and encodes an outgoing one', async () => {
    const inKey = { pk: 'SCENARIO#s1', sk: 'DATASET#d0' };
    const outKey = { pk: 'SCENARIO#s1', sk: 'DATASET#d1' };
    ddbMock.on(QueryCommand).resolves({ Items: [], LastEvaluatedKey: outKey });

    const token = Buffer.from(JSON.stringify(inKey), 'utf8').toString('base64url');
    const page = await listDatasets(ddb, TABLE_NAME, 's1', { nextToken: token });

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.ExclusiveStartKey).toEqual(inKey);
    expect(JSON.parse(Buffer.from(page.nextToken as string, 'base64url').toString('utf8'))).toEqual(outKey);
  });

  it('treats a response with no Items key at all as an empty page', async () => {
    ddbMock.on(QueryCommand).resolves({});
    const page = await listDatasets(ddb, TABLE_NAME, 's1', {});
    expect(page.items).toEqual([]);
  });
});

describe('updateDataset', () => {
  it('builds SET expressions for every provided field and returns true on success', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    const updated = await updateDataset(ddb, TABLE_NAME, 's1', 'd1', {
      name: 'New name',
      description: 'New desc',
      contentType: 'application/json',
      content: '{}',
    });

    expect(updated).toBe(true);
    const call = ddbMock.commandCalls(UpdateCommand)[0];
    expect(call.args[0].input.Key).toEqual({ pk: 'SCENARIO#s1', sk: 'DATASET#d1' });
    expect(call.args[0].input.UpdateExpression).toBe(
      'SET #name = :name, #description = :description, #contentType = :contentType, #content = :content'
    );
    expect(call.args[0].input.ExpressionAttributeNames).toEqual({
      '#name': 'name',
      '#description': 'description',
      '#contentType': 'contentType',
      '#content': 'content',
    });
    expect(call.args[0].input.ExpressionAttributeValues).toEqual({
      ':name': 'New name',
      ':description': 'New desc',
      ':contentType': 'application/json',
      ':content': '{}',
    });
    expect(call.args[0].input.ConditionExpression).toBe('attribute_exists(pk) AND attribute_exists(sk)');
  });

  it('returns false (no DynamoDB call) when no updatable fields are provided', async () => {
    const updated = await updateDataset(ddb, TABLE_NAME, 's1', 'd1', {});
    expect(updated).toBe(false);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('returns false when the dataset does not exist (ConditionalCheckFailedException swallowed)', async () => {
    ddbMock.on(UpdateCommand).rejects(conditionalCheckFailed());

    const updated = await updateDataset(ddb, TABLE_NAME, 's1', 'missing', { name: 'x' });
    expect(updated).toBe(false);
  });

  it('rethrows non-conditional errors', async () => {
    ddbMock.on(UpdateCommand).rejects(new Error('boom'));

    await expect(updateDataset(ddb, TABLE_NAME, 's1', 'd1', { name: 'x' })).rejects.toThrow('boom');
  });

});

describe('deleteDataset', () => {
  it('returns true when ReturnValues ALL_OLD has attributes (item existed)', async () => {
    ddbMock.on(DeleteCommand).resolves({ Attributes: { id: 'd1' } });

    const deleted = await deleteDataset(ddb, TABLE_NAME, 's1', 'd1');

    expect(deleted).toBe(true);
    const call = ddbMock.commandCalls(DeleteCommand)[0];
    expect(call.args[0].input.Key).toEqual({ pk: 'SCENARIO#s1', sk: 'DATASET#d1' });
    expect(call.args[0].input.ReturnValues).toBe('ALL_OLD');
  });

  it('returns false when ReturnValues ALL_OLD has no attributes (item did not exist)', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    const deleted = await deleteDataset(ddb, TABLE_NAME, 's1', 'missing');
    expect(deleted).toBe(false);
  });
});

describe('listTools / getTool', () => {
  it('listTools queries pk = :pk AND begins_with(sk, TOOL#) and maps the tool shape', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [{ name: 'freeze_account', description: 'd', inputSchema: { type: 'object' }, handlerKey: 'h' }],
    });

    const tools = await listTools(ddb, TABLE_NAME, 's1');

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.KeyConditionExpression).toBe('pk = :pk AND begins_with(sk, :pfx)');
    expect(call.args[0].input.ExpressionAttributeValues).toEqual({ ':pk': 'SCENARIO#s1', ':pfx': 'TOOL#' });
    expect(tools).toEqual([{ name: 'freeze_account', description: 'd', inputSchema: { type: 'object' }, handlerKey: 'h' }]);
  });

  it('listTools treats a response with no Items key at all as an empty list', async () => {
    ddbMock.on(QueryCommand).resolves({});
    expect(await listTools(ddb, TABLE_NAME, 's1')).toEqual([]);
  });

  it('getTool fetches by the exact TOOL#{name} sk and returns the tool shape', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { name: 'freeze_account', description: 'd', inputSchema: {}, handlerKey: 'h', pk: 'SCENARIO#s1', sk: 'TOOL#freeze_account' },
    });

    const tool = await getTool(ddb, TABLE_NAME, 's1', 'freeze_account');

    const call = ddbMock.commandCalls(GetCommand)[0];
    expect(call.args[0].input.Key).toEqual({ pk: 'SCENARIO#s1', sk: 'TOOL#freeze_account' });
    expect(tool).toEqual({ name: 'freeze_account', description: 'd', inputSchema: {}, handlerKey: 'h' });
  });

  it('getTool returns null when the tool does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });
    expect(await getTool(ddb, TABLE_NAME, 's1', 'missing')).toBeNull();
  });

  it('putTool writes the exact item shape under TOOL#{name} and returns the tool', async () => {
    ddbMock.on(PutCommand).resolves({});

    const result = await putTool(ddb, TABLE_NAME, 's1', 'freeze_account', {
      description: 'Freeze it',
      inputSchema: { type: 'object', properties: {} },
      handlerKey: 'tools/freezeAccount.freezeAccount',
    });

    const call = ddbMock.commandCalls(PutCommand)[0];
    expect(call.args[0].input.TableName).toBe(TABLE_NAME);
    expect(call.args[0].input.Item).toEqual({
      pk: 'SCENARIO#s1',
      sk: 'TOOL#freeze_account',
      name: 'freeze_account',
      description: 'Freeze it',
      inputSchema: { type: 'object', properties: {} },
      handlerKey: 'tools/freezeAccount.freezeAccount',
    });
    expect(result).toEqual({
      name: 'freeze_account',
      description: 'Freeze it',
      inputSchema: { type: 'object', properties: {} },
      handlerKey: 'tools/freezeAccount.freezeAccount',
    });
  });
});
