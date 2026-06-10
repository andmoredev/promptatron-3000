import { randomUUID } from 'crypto';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { formatResponse } from '../utils/responses.mjs';

const ddb = new DynamoDBClient();

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body);

    const now = new Date().toISOString();
    const id = typeof body.id === 'string' && body.id.trim() ? body.id : randomUUID();

    const scenario = {
      pk: id,
      sk: 'scenario',
      GSI1PK: 'scenario',
      GSI1SK: id,
      name: body.name,
      ...(body.description ? { description: body.description } : {}),
      createdAt: now,
      updatedAt: now,
    };

    await ddb.send(new PutItemCommand({
      TableName: process.env.TABLE_NAME,
      Item: marshall(scenario),
      ConditionExpression: 'attribute_not_exists(pk)'
    }));

    const prompts = Array.isArray(body.prompts) ? body.prompts : [];
    if (prompts.length > 0) {
      await Promise.all(
        prompts.map((p) => {
          const promptId = randomUUID();
          return ddb.send(new PutItemCommand({
            TableName: process.env.TABLE_NAME,
            Item: marshall({
              pk: `${id}#${promptId}`,
              sk: 'prompt',
              GSI1PK: id,
              GSI1SK: `prompt#${p.type}`,
              name: p.name,
              content: p.content,
              createdAt: now,
              updatedAt: now,
            })
          }));
        })
      );
    }

    return formatResponse(201, { id });
  } catch (err) {
    if (err?.name === 'ConditionalCheckFailedException') {
      return formatResponse(409, { message: 'Scenario with this id already exists' });
    }
    console.error(JSON.stringify(err));
    return formatResponse(500, { message: 'Something went wrong' });
  }
};
