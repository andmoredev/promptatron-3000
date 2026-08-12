import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Tracer } from '@aws-lambda-powertools/tracer';

export const TABLE_NAME = process.env.TABLE_NAME ?? '';

export const createDocClient = (tracer: Tracer): DynamoDBDocumentClient => {
  const client = tracer.captureAWSv3Client(new DynamoDBClient({}));
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
};
