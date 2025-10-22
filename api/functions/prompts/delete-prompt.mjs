import { DynamoDBClient, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { formatEmptyResponse, formatResponse } from '../utils/responses.mjs';

const ddb = new DynamoDBClient();

export const handler = async (event) => {
  try {
    const scenarioId = event.pathParameters.scenarioId;
    const promptId = event.pathParameters.promptId;
    const pk = `${scenarioId}#${promptId}`;

    const res = await ddb.send(new DeleteItemCommand({
      TableName: process.env.TABLE_NAME,
      Key: marshall({ pk, sk: 'prompt' }),
      ReturnValues: 'ALL_OLD'
    }));

    if (!res?.Attributes) return formatResponse(404, { message: 'Prompt not found' });

    return formatEmptyResponse();
  } catch (err) {
    console.error(err);
    return formatResponse(500, { message: 'Something went wrong' });
  }
};
