import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { handler } from '../../functions/scenarios/index';
import { fakeApiGatewayEvent, fakeContext } from './helpers/event';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe('GET /scenarios', () => {
  it('handles a null queryStringParameters (no query string on the request) without throwing', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const res = await handler(
      fakeApiGatewayEvent({ httpMethod: 'GET', path: '/scenarios', queryStringParameters: null }),
      fakeContext()
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body).toEqual({ items: [], count: 0 });
  });

  it('lists scenarios from the GSI1 query', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          id: 'fraud-detection-comprehensive',
          name: 'Fraud Detection',
          description: 'desc',
          createdAt: '2026-01-05T09:00:00.000Z',
          updatedAt: '2026-01-05T09:00:00.000Z',
        },
      ],
    });

    const res = await handler(fakeApiGatewayEvent({ httpMethod: 'GET', path: '/scenarios' }), fakeContext());

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.count).toBe(1);
    expect(body.items[0].id).toBe('fraud-detection-comprehensive');

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.IndexName).toBe('GSI1');
  });
});

describe('GET /scenarios/{scenarioId}', () => {
  it('returns 404 with a message body when the scenario does not exist', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const res = await handler(
      fakeApiGatewayEvent({ httpMethod: 'GET', path: '/scenarios/missing', pathParameters: { scenarioId: 'missing' } }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body as string);
    expect(body.message).toMatch(/not found/i);
  });

  it('returns the fully hydrated scenario for a single Query', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { pk: 'SCENARIO#s1', sk: 'METADATA', id: 's1', name: 'S1', createdAt: 't1', updatedAt: 't1' },
        { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1', id: 'p1', name: 'Sys', content: 'c1', kind: 'SYSTEM' },
        { pk: 'SCENARIO#s1', sk: 'DATASET#d1', id: 'd1', name: 'D1', contentType: 'application/json', content: '{}' },
      ],
    });

    const res = await handler(
      fakeApiGatewayEvent({ httpMethod: 'GET', path: '/scenarios/s1', pathParameters: { scenarioId: 's1' } }),
      fakeContext()
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.systemPrompts).toHaveLength(1);
    expect(body.datasets).toHaveLength(1);
    expect(body.datasets[0].content).toBeUndefined();

    const call = ddbMock.commandCalls(QueryCommand)[0];
    expect(call.args[0].input.KeyConditionExpression).toBe('pk = :pk');
  });
});

describe('POST /scenarios', () => {
  it('creates a scenario and returns 201 with an empty item collection', async () => {
    ddbMock.on(PutCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios',
        body: JSON.stringify({ name: 'New Scenario', description: 'desc' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.name).toBe('New Scenario');
    expect(body.systemPrompts).toEqual([]);
    expect(body.tools).toEqual([]);
  });

  it('returns 400 when name is missing', async () => {
    const res = await handler(
      fakeApiGatewayEvent({ httpMethod: 'POST', path: '/scenarios', body: JSON.stringify({}) }),
      fakeContext()
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /scenarios/{scenarioId}', () => {
  it('returns 404 when the scenario partition has no METADATA item', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const res = await handler(
      fakeApiGatewayEvent({ httpMethod: 'DELETE', path: '/scenarios/missing', pathParameters: { scenarioId: 'missing' } }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
  });
});
