import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { formatEmptyResponse, formatResponse } from '../utils/responses.mjs';

const ddb = new DynamoDBClient();
const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
  try {
    const id = event.pathParameters.scenarioId;
    const body = JSON.parse(event.body);

    const now = new Date().toISOString();
    const exprNames = { '#updatedAt': 'updatedAt' };
    const exprValues = { ':updatedAt': { S: now } };
    const sets = ['#updatedAt = :updatedAt'];

    let hasField = false;
    if (typeof body.name === 'string') {
      exprNames['#name'] = 'name';
      exprValues[':name'] = body.name;
      sets.push('#name = :name');
      hasField = true;
    }
    if (typeof body.description === 'string') {
      exprNames['#description'] = 'description';
      exprValues[':description'] = body.description;
      sets.push('#description = :description');
      hasField = true;
    }

    if (!hasField) {
      return formatResponse(400, { message: 'No updatable fields provided' });
    }

    await ddb.send(new UpdateItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: marshall({
        pk: id,
        sk: 'scenario'
      }),
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: marshall(exprValues),
      ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)'
    }));

    return formatEmptyResponse();
  } catch (err) {
    if (err?.name === 'ConditionalCheckFailedException') return formatResponse(404, { message: 'Scenario not found' });
    console.error(err);
    return formatResponse(500, { message: 'Something went wrong' });
  }
};
