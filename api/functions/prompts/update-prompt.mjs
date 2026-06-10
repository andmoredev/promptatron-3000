import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { formatEmptyResponse, formatResponse } from '../utils/responses.mjs';

const ddb = new DynamoDBClient();

export const handler = async (event) => {
  try {
    const scenarioId = event.pathParameters.scenarioId;
    const promptId = event.pathParameters.promptId;
    const pk = `${scenarioId}#${promptId}`;
    const body = JSON.parse(event.body || '{}');

    const now = new Date().toISOString();

    // Update in place (name/content/type via GSI1SK)
    const exprNames = { '#updatedAt': 'updatedAt' };
    const exprValues = { ':updatedAt': now };
    const sets = ['#updatedAt = :updatedAt'];
    let hasField = false;

    if (typeof body.name === 'string') {
      exprNames['#name'] = 'name';
      exprValues[':name'] = body.name;
      sets.push('#name = :name');
      hasField = true;
    }
    if (typeof body.content === 'string') {
      exprNames['#content'] = 'content';
      exprValues[':content'] = body.content;
      sets.push('#content = :content');
      hasField = true;
    }

    if (typeof body.type === 'string') {
      exprNames['#gsi1sk'] = 'GSI1SK';
      exprValues[':gsi1sk'] = `prompt#${body.type}`;
      sets.push('#gsi1sk = :gsi1sk');
      hasField = true;
    }

    if (!hasField) return formatResponse(400, { message: 'No updatable fields provided' });

    await ddb.send(new UpdateItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: marshall({ pk, sk: 'prompt' }),
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: marshall(exprValues),
      ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)'
    }));

    return formatEmptyResponse();
  } catch (err) {
    console.error(err);
    return formatResponse(500, { message: 'Something went wrong' });
  }
};
