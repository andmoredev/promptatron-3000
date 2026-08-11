import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { handler } from '../../functions/prompts/index';
import { fakeApiGatewayEvent, fakeContext } from './helpers/event';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe('GET /scenarios/{scenarioId}/prompts', () => {
  it('returns 404 when the parent scenario does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'GET',
        path: '/scenarios/missing/prompts',
        pathParameters: { scenarioId: 'missing' },
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
  });

  it('handles a null queryStringParameters without throwing', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'GET',
        path: '/scenarios/s1/prompts',
        pathParameters: { scenarioId: 's1' },
        queryStringParameters: null,
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ items: [], count: 0 });
  });
});

describe('POST /scenarios/{scenarioId}/prompts', () => {
  it('creates a prompt and returns 201 with the generated id', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(PutCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios/s1/prompts',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ kind: 'SYSTEM', name: 'Analyst', content: 'You are...' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body as string).id).toBeDefined();
  });

  it('rejects an invalid kind with 400', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios/s1/prompts',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ kind: 'BOGUS', name: 'x', content: 'y' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(400);
  });
});
