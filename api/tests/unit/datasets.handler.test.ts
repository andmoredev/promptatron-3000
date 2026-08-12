import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { handler } from '../../functions/datasets/index';
import { fakeApiGatewayEvent, fakeContext } from './helpers/event';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const datasetFixture = JSON.parse(readFileSync(path.join(__dirname, '../fixtures/dataset.json'), 'utf8'));

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe('GET /scenarios/{scenarioId}/datasets/{datasetId}', () => {
  it('returns the dataset with inline content', async () => {
    ddbMock.on(GetCommand).callsFake((input) => {
      if (input.Key.sk === 'METADATA') return { Item: { pk: 'SCENARIO#fraud-detection-comprehensive', sk: 'METADATA' } };
      return { Item: datasetFixture };
    });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'GET',
        path: '/scenarios/fraud-detection-comprehensive/datasets/retail-transactions',
        pathParameters: { scenarioId: 'fraud-detection-comprehensive', datasetId: 'retail-transactions' },
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.content).toBe(datasetFixture.content);
    expect(body.contentType).toBe('text/csv');
  });

  it('returns 404 when the dataset does not exist', async () => {
    ddbMock.on(GetCommand).callsFake((input) => {
      if (input.Key.sk === 'METADATA') return { Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } };
      return { Item: undefined };
    });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'GET',
        path: '/scenarios/s1/datasets/missing',
        pathParameters: { scenarioId: 's1', datasetId: 'missing' },
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
  });
});

describe('GET /scenarios/{scenarioId}/datasets', () => {
  it('returns the metadata-only list', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(QueryCommand).resolves({
      Items: [{ id: 'd1', name: 'D1', contentType: 'text/csv' }],
    });

    const res = await handler(
      fakeApiGatewayEvent({ httpMethod: 'GET', path: '/scenarios/s1/datasets', pathParameters: { scenarioId: 's1' } }),
      fakeContext()
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.count).toBe(1);
    expect(body.items[0]).toEqual({ id: 'd1', name: 'D1', contentType: 'text/csv' });
    expect(body.items[0].content).toBeUndefined();
  });

  it('returns 404 when the parent scenario does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const res = await handler(
      fakeApiGatewayEvent({ httpMethod: 'GET', path: '/scenarios/missing/datasets', pathParameters: { scenarioId: 'missing' } }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /scenarios/{scenarioId}/datasets', () => {
  it('rejects a missing name with 400', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios/s1/datasets',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ contentType: 'text/csv', content: 'x' }),
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
        path: '/scenarios/s1/datasets',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ name: 'D', contentType: 'text/csv' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid contentType with 400', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios/s1/datasets',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ name: 'D', contentType: 'text/plain', content: 'x' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(400);
  });

  it('creates a dataset with inline content and round-trips it byte-for-byte', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(PutCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios/s1/datasets',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({
          id: 'retail-transactions',
          name: 'Retail Transaction Data',
          contentType: 'text/csv',
          content: datasetFixture.content,
        }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(201);
    const putCall = ddbMock.commandCalls(PutCommand)[0];
    expect(putCall.args[0].input.Item?.content).toBe(datasetFixture.content);
  });

  it('generates an id when none is provided in the body', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(PutCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios/s1/datasets',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ name: 'D', contentType: 'application/json', content: '{}' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(201);
    const id = JSON.parse(res.body as string).id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('passes through an explicit id and description when provided', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(PutCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'POST',
        path: '/scenarios/s1/datasets',
        pathParameters: { scenarioId: 's1' },
        body: JSON.stringify({ id: 'explicit-id', name: 'D', description: 'desc', contentType: 'application/json', content: '{}' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body as string).id).toBe('explicit-id');
    const putCall = ddbMock.commandCalls(PutCommand)[0];
    expect(putCall.args[0].input.Item?.id).toBe('explicit-id');
    expect(putCall.args[0].input.Item?.description).toBe('desc');
  });
});

describe('PUT /scenarios/{scenarioId}/datasets/{datasetId}', () => {
  it('rejects an invalid contentType with 400', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/datasets/d1',
        pathParameters: { scenarioId: 's1', datasetId: 'd1' },
        body: JSON.stringify({ contentType: 'text/plain' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(400);
  });

  it('rejects an empty update body with 400', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/datasets/d1',
        pathParameters: { scenarioId: 's1', datasetId: 'd1' },
        body: JSON.stringify({}),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(400);
  });

  it('returns 204 on a successful update', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(UpdateCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/datasets/d1',
        pathParameters: { scenarioId: 's1', datasetId: 'd1' },
        body: JSON.stringify({ name: 'Renamed' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(204);
  });

  it('passes every field through to updateDataset when all are provided', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(UpdateCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/datasets/d1',
        pathParameters: { scenarioId: 's1', datasetId: 'd1' },
        body: JSON.stringify({ name: 'Renamed', description: 'New desc', contentType: 'application/json', content: '{}' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(204);
    const updateCall = ddbMock.commandCalls(UpdateCommand)[0];
    expect(updateCall.args[0].input.ExpressionAttributeValues).toEqual({
      ':name': 'Renamed',
      ':description': 'New desc',
      ':contentType': 'application/json',
      ':content': '{}',
    });
  });

  it('returns 204 when only description is provided (no name)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(UpdateCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/datasets/d1',
        pathParameters: { scenarioId: 's1', datasetId: 'd1' },
        body: JSON.stringify({ description: 'Desc only' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(204);
    const updateCall = ddbMock.commandCalls(UpdateCommand)[0];
    expect(updateCall.args[0].input.ExpressionAttributeValues).toEqual({ ':description': 'Desc only' });
  });

  it('returns 404 when the dataset does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    const err: any = new Error('not found');
    err.name = 'ConditionalCheckFailedException';
    ddbMock.on(UpdateCommand).rejects(err);

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'PUT',
        path: '/scenarios/s1/datasets/missing',
        pathParameters: { scenarioId: 's1', datasetId: 'missing' },
        body: JSON.stringify({ name: 'x' }),
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /scenarios/{scenarioId}/datasets/{datasetId}', () => {
  it('returns 204 when the dataset existed', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(DeleteCommand).resolves({ Attributes: { id: 'd1' } });

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'DELETE',
        path: '/scenarios/s1/datasets/d1',
        pathParameters: { scenarioId: 's1', datasetId: 'd1' },
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when the dataset did not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { pk: 'SCENARIO#s1', sk: 'METADATA' } });
    ddbMock.on(DeleteCommand).resolves({});

    const res = await handler(
      fakeApiGatewayEvent({
        httpMethod: 'DELETE',
        path: '/scenarios/s1/datasets/missing',
        pathParameters: { scenarioId: 's1', datasetId: 'missing' },
      }),
      fakeContext()
    );

    expect(res.statusCode).toBe(404);
  });
});
