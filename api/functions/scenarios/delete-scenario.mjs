import { DynamoDBClient, DeleteItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { formatEmptyResponse, formatResponse } from '../utils/responses.mjs';

const ddb = new DynamoDBClient();

export const handler = async (event) => {
  try {
    const id = event.pathParameters.scenarioId;
    const base = await ddb.send(new DeleteItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: marshall({
        pk: id,
        sk: 'scenario'
      }),
      ReturnValues: 'ALL_OLD',
      ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)'
    }));
    if (!base?.Attributes) return formatResponse(404, { message: 'Scenario not found' });

    const promptsRes = await ddb.send(new QueryCommand({
      TableName: process.env.TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :id AND begins_with(GSI1SK, :pfx)',
      ExpressionAttributeValues: marshall({
        ':id': id,
        ':pfx': 'prompt#'
      }),
      ProjectionExpression: 'pk, sk',
    }));
    await Promise.all(
      (promptsRes.Items || []).map((i) => ddb.send(new DeleteItemCommand({
        TableName: process.env.TABLE_NAME,
        Key: marshall({
          pk: i.pk,
          sk: i.sk
        }),
      })))
    );

    return formatEmptyResponse();
  } catch (err) {
    if (err?.name === 'ConditionalCheckFailedException') return formatResponse(404, { message: 'Scenario not found' });
    console.error(err);
    return formatResponse(500, { message: 'Something went wrong' });
  }
};
