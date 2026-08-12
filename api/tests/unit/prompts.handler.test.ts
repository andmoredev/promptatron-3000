import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

  it('rejects a missing name with 400', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios/s1/prompts',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ kind: 'SYSTEM', content: 'y' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(400);
  });

  it('rejects missing content with 400', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios/s1/prompts',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ kind: 'SYSTEM', name: 'x' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /scenarios/{scenarioId}/prompts/{promptId}', () => {
  it('returns 400 when no updatable fields are provided', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/prompts/p1',
        pathParameters: { scenarioId: 's1', promptId: 'p1' },
        body: JSON.stringify({}),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(400);
  });

  it('returns 204 on a successful update', async () => {
    ddbMock.on(GetCommand).callsFake((input) => {
      if (input.Key.sk === 'METADATA') return { Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } };
      if ((input.Key.sk as string).startsWith('PROMPT#SYSTEM#')) {
        return { Item: { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1', id: 'p1' } };
      }
      return { Item: undefined };
    });
    ddbMock.on(UpdateCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/prompts/p1',
        pathParameters: { scenarioId: 's1', promptId: 'p1' },
        body: JSON.stringify({ name: 'Renamed' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(204);
  });

  it('returns 204 when only content is provided (no name)', async () => {
    ddbMock.on(GetCommand).callsFake((input) => {
      if (input.Key.sk === 'METADATA') return { Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } };
      if ((input.Key.sk as string).startsWith('PROMPT#SYSTEM#')) {
        return { Item: { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1', id: 'p1' } };
      }
      return { Item: undefined };
    });
    ddbMock.on(UpdateCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/prompts/p1',
        pathParameters: { scenarioId: 's1', promptId: 'p1' },
        body: JSON.stringify({ content: 'new content only' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(204);
    const updateCall = ddbMock.commandCalls(UpdateCommand)[0];
    expect(updateCall.args[0].input.ExpressionAttributeValues).toEqual({ ':content': 'new content only' });
  });

  it('returns 404 when the prompt does not exist', async () => {
    ddbMock.on(GetCommand).callsFake((input) => {
      if (input.Key.sk === 'METADATA') return { Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } };
      return { Item: undefined };
    });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/prompts/missing',
        pathParameters: { scenarioId: 's1', promptId: 'missing' },
        body: JSON.stringify({ name: 'x' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /scenarios/{scenarioId}/prompts/{promptId}', () => {
  it('returns 204 on successful delete', async () => {
    ddbMock.on(GetCommand).callsFake((input) => {
      if (input.Key.sk === 'METADATA') return { Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } };
      if ((input.Key.sk as string).startsWith('PROMPT#SYSTEM#')) {
        return { Item: { pk: 'SCENARIO#s1', sk: 'PROMPT#SYSTEM#p1', id: 'p1' } };
      }
      return { Item: undefined };
    });
    ddbMock.on(DeleteCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'DELETE',
        path: '/scenarios/s1/prompts/p1',
        pathParameters: { scenarioId: 's1', promptId: 'p1' },
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when the prompt does not exist', async () => {
    ddbMock.on(GetCommand).callsFake((input) => {
      if (input.Key.sk === 'METADATA') return { Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } };
      return { Item: undefined };
    });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'DELETE',
        path: '/scenarios/s1/prompts/missing',
        pathParameters: { scenarioId: 's1', promptId: 'missing' },
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /scenarios/{scenarioId}/prompts (list with items)', () => {
  it('returns mapped prompt items', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(QueryCommand).resolves({
      Items: [{ id: 'p1', name: 'Sys', content: 'c', kind: 'SYSTEM' }],
    });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'GET',
        path: '/scenarios/s1/prompts',
        pathParameters: { scenarioId: 's1' },
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.count).toBe(1);
    expect(body.items[0]).toEqual({ id: 'p1', name: 'Sys', content: 'c', kind: 'SYSTEM' });
  });
});
