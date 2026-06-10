import { randomUUID } from 'crypto';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { formatResponse } from '../utils/responses.mjs';

const ddb = new DynamoDBClient();

export const handler = async (event) => {
  try {
    const scenarioId = event.pathParameters.scenarioId;
    const body = JSON.parse(event.body || '{}');

    const scenario = await ddb.send(new GetItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: marshall({ pk: scenarioId, sk: 'scenario' }),
      ProjectionExpression: 'pk'
    }));
    if (!scenario?.Item) return formatResponse(404, { message: 'Scenario not found' });

    const now = new Date().toISOString();
    const promptId = randomUUID();

    await ddb.send(new PutItemCommand({
      TableName: process.env.TABLE_NAME,
      Item: marshall({
        pk: `${scenarioId}#${promptId}`,
        sk: 'prompt',
        GSI1PK: scenarioId,
        GSI1SK: `prompt#${body.type}`,
        name: body.name,
        content: body.content,
        createdAt: now,
        updatedAt: now,
      })
    }));

    return formatResponse(201, { id: promptId });
  } catch (err) {
    console.error(err);
    return formatResponse(500, { message: 'Something went wrong' });
  }
};
