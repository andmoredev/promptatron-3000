import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { handler } from '../../functions/tools/index';
import { fakeApiGatewayEvent, fakeContext } from './helpers/event';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe('GET /scenarios/{scenarioId}/tools/{toolName}', () => {
  it('returns 404 when the tool does not exist', async () => {
    ddbMock.on(GetCommand).callsFake((input) => {
      if (input.Key.sk === 'METADATA') return { Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } };
      return { Item: undefined };
    });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'GET',
        path: '/scenarios/s1/tools/missing_tool',
        pathParameters: { scenarioId: 's1', toolName: 'missing_tool' },
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body as string).message).toMatch(/not found/i);
  });

  it('returns 404 when the parent scenario does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'GET',
        path: '/scenarios/missing/tools/freeze_account',
        pathParameters: { scenarioId: 'missing', toolName: 'freeze_account' },
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /scenarios/{scenarioId}/tools/{toolName}', () => {
  it('upserts a tool definition', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(PutCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/tools/freeze_account',
        pathParameters: { scenarioId: 's1', toolName: 'freeze_account' },
        body: JSON.stringify({
          description: 'Freeze an account',
          inputSchema: { type: 'object', properties: {} },
          handlerKey: 'tools/freezeAccount.freezeAccount',
        }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.name).toBe('freeze_account');
    expect(body.handlerKey).toBe('tools/freezeAccount.freezeAccount');
  });

  it('rejects a non-object inputSchema with 400', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/tools/freeze_account',
        pathParameters: { scenarioId: 's1', toolName: 'freeze_account' },
        body: JSON.stringify({ description: 'x', inputSchema: 'not-an-object', handlerKey: 'h' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /scenarios/{scenarioId}/tools', () => {
  it('lists tools for a scenario', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(QueryCommand).resolves({
      Items: [{ name: 'freeze_account', description: 'd', handlerKey: 'h', inputSchema: {} }],
    });

    const res = await handler(
      fakeApiGatewayEvent({ httpMethod: 'GET', path: '/scenarios/s1/tools', pathParameters: { scenarioId: 's1' } }),
      fakeContext()
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).count).toBe(1);
  });
});
