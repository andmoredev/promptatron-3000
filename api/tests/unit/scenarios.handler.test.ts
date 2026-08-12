import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

  it('rethrows (and does not treat as a 409) an unrelated DynamoDB error, surfacing as a 500', async () => {
    ddbMock.on(PutCommand).rejects(new Error('boom'));

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios',
        body: JSON.stringify({ name: 'X' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(500);
  });

  it('returns 409 with a message body when the id already exists', async () => {
    const err: any = new Error('conflict');
    err.name = 'ConditionalCheckFailedException';
    ddbMock.on(PutCommand).rejects(err);

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios',
        body: JSON.stringify({ id: 'dup', name: 'Dup' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body as string).message).toMatch(/already exists/i);
  });
});

describe('PUT /scenarios/{scenarioId}', () => {
  it('returns 400 when neither name nor description is provided', async () => {
    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({}),
      }),
      fakeContext()
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 204 and issues the UpdateCommand on a successful update', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ name: 'Renamed' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(204);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
  });

  it('returns 204 when only description is provided (no name)', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ description: 'New desc only' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(204);
    const call = ddbMock.commandCalls(UpdateCommand)[0];
    expect(call.args[0].input.ExpressionAttributeValues).toMatchObject({ ':description': 'New desc only' });
    expect(call.args[0].input.ExpressionAttributeValues).not.toHaveProperty(':name');
  });

  it('returns 404 when the scenario does not exist', async () => {
    const err: any = new Error('not found');
    err.name = 'ConditionalCheckFailedException';
    ddbMock.on(UpdateCommand).rejects(err);

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/missing',
        pathParameters: { scenarioId: 'missing' },
        body: JSON.stringify({ name: 'x' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
  });

  it('rethrows (and does not treat as a 404) an unrelated DynamoDB error, surfacing as a 500', async () => {
    ddbMock.on(UpdateCommand).rejects(new Error('boom'));

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ name: 'x' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(500);
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

  it('returns 204 and deletes every item in the partition on success', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { pk: 'SCENARIO#s1', sk: 'METADATA' },
        { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1' },
      ],
    });
    ddbMock.on(DeleteCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({ httpMethod: 'DELETE', path: '/scenarios/s1', pathParameters: { scenarioId: 's1' } }),
      fakeContext()
    );

    expect(res.statusCode).toBe(204);
    expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(2);
  });
});
