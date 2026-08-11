import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
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

describe('POST /scenarios/{scenarioId}/datasets', () => {
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
});
