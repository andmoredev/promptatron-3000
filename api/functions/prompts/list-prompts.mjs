import { DynamoDBClient, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { formatResponse } from '../utils/responses.mjs';
import { encrypt, decrypt } from '../utils/encoding.mjs';

const ddb = new DynamoDBClient();

export const handler = async (event) => {
  try {
    const scenarioId = event.pathParameters.scenarioId;

    // Ensure scenario exists
    const scenario = await ddb.send(new GetItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: marshall({ pk: scenarioId, sk: 'scenario' }),
      ProjectionExpression: 'pk'
    }));
    if (!scenario?.Item) return formatResponse(404, { message: 'Scenario not found' });

    // Paging params
    let { limit, nextToken } = event?.queryStringParameters || {};
    if (limit) {
      limit = Math.max(1, Math.min(20, parseInt(limit, 10) || 20));
    }
    if (nextToken) {
      nextToken = decrypt(nextToken);
    }

    // Fetch prompts for scenario
    const res = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :id AND begins_with(GSI1SK, :pfx)',
      ExpressionAttributeValues: marshall({ ':id': scenarioId, ':pfx': 'prompt#' }),
      ProjectionExpression: 'pk, GSI1SK, #n, content',
      ExpressionAttributeNames: { '#n': 'name' },
      ...(limit ? { Limit: limit } : {}),
      ...(nextToken ? { ExclusiveStartKey: nextToken } : {}),
    }));

    const items = (res.Items || []).map((i) => {
      const item = unmarshall(i);
      const [, promptId] = String(item.pk || '').split('#');
      const type = String(item.GSI1SK || '').split('#')[1] || 'USER';
      return { id: promptId, type, name: item.name, content: item.content };
    });

    return formatResponse(200, {
      items,
      count: items.length,
      ...(res.LastEvaluatedKey ? { nextToken: encrypt(res.LastEvaluatedKey) } : {}),
    });
  } catch (err) {
    console.error(err);
    return formatResponse(500, { message: 'Something went wrong' });
  }
};
