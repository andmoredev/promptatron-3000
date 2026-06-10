import { DynamoDBClient, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { formatResponse } from '../utils/responses.mjs';

const ddb = new DynamoDBClient();

export const handler = async (event) => {
  try {
    const id = event.pathParameters.scenarioId;
    const scenarioRes = await ddb.send(new GetItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: marshall({
        pk: id,
        sk: 'scenario'
      })
    }));

    if (!scenarioRes?.Item) return formatResponse(404, { message: 'Scenario not found' });
    const base = unmarshall(scenarioRes.Item);

    const promptsRes = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :id AND begins_with(GSI1SK, :pfx)',
      ExpressionAttributeValues: marshall({
        ':id': id,
        ':pfx': 'prompt#',
      }),
      ProjectionExpression: 'GSI1SK, #n, content',
      ExpressionAttributeNames: { '#n': 'name' },
    }));

    const prompts = (promptsRes.Items || []).map((i) => {
      const item = unmarshall(i);
      const type = String(item.GSI1SK || '').split('#')[1] || 'USER';
      return { type, name: item.name, content: item.content };
    });

    return formatResponse(200, {
      id: base.pk,
      name: base.name,
      ...base.description && { description: base.description },
      prompts,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    });
  } catch (err) {
    console.error(err);
    return formatResponse(500, { message: 'Something went wrong' });
  }
};
