import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { formatResponse } from '../utils/responses.mjs';
import { encrypt, decrypt } from '../utils/encoding.mjs';

const ddb = new DynamoDBClient();

export const handler = async (event) => {
  try {
    let { limit, nextToken } = event?.queryStringParameters;
    if (limit) {
      limit = Math.max(1, Math.min(20, parseInt(limit, 10) || 20));
    }
    if (nextToken) {
      nextToken = decrypt(nextToken);
    }

    const res = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'GSI1',
      Limit: limit,
      ...nextToken && { ExclusiveStartKey: nextToken },
      KeyConditionExpression: 'sk = :scenario',
      ExpressionAttributeValues: marshall({ ':scenario': 'scenario' }),
    }));

    const items = (res.Items || []).map((i) => {
      const item = unmarshall(i);
      return {
        id: item.pk,
        name: item.name,
        ...item.description && { description: item.description }
      };
    });

    return formatResponse(200, {
      items,
      count: items.length,
      ...res.LastEvaluatedKey && { nextToken: encrypt(res.LastEvaluatedKey) },
    });
  } catch (err) {
    console.error(err);
    return formatResponse(500, { message: 'Something went wrong' });
  }
};
