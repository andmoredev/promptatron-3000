import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDataset,
  deleteScenario,
  getDataset,
  hydrateScenario,
  listScenarios,
} from '../../functions/common/repository';

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
    expect(scenario?.systemPrompts).toHaveLength(1);
    expect(scenario?.systemPrompts[0]).toEqual({
      id: 'fraud-analyst',
      name: 'Expert Fraud Detection Analyst',
      content: 'You are an expert fraud detection analyst...',
    });
    expect(scenario?.userPrompts).toHaveLength(1);
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

  it('returns null when no METADATA item exists for the scenario', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const scenario = await hydrateScenario(ddb, TABLE_NAME, 'missing-scenario');
    expect(scenario).toBeNull();
  });

  it('paginates through the full partition before folding', async () => {
    ddbMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [{ pk: 'SCENARIO#s1', sk: 'METADATA', id: 's1', name: 'S1', createdAt: 't', updatedAt: 't' }],
        LastEvaluatedKey: { pk: 'SCENARIO#s1', sk: 'METADATA' },
      })
      .resolvesOnce({
        Items: [{ pk: 'SCENARIO#s1', sk: 'TOOL#some_tool', name: 'some_tool', description: 'd', handlerKey: 'h', inputSchema: {} }],
      });

    const scenario = await hydrateScenario(ddb, TABLE_NAME, 's1');
    expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(2);
    expect(scenario?.tools).toHaveLength(1);
  });
});

describe('deleteScenario', () => {
  it('deletes every item found in the partition and returns true', async () => {
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
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(3);
  });

  it('returns false when the partition has no METADATA item (scenario does not exist)', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const result = await deleteScenario(ddb, TABLE_NAME, 'missing');
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
  });
});
