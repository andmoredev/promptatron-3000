import type { APIGatewayProxyEvent } from 'aws-lambda';

export interface FakeEventOptions {
  httpMethod: string;
  path: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  body?: string | null;
  headers?: Record<string, string>;
}

/**
 * Builds a minimal, realistic API Gateway REST (v1) proxy event.
 *
 * Note: real API Gateway sends `null` (not `undefined`) for absent
 * `queryStringParameters` / `pathParameters` -- this mirrors that exactly so
 * tests exercise the same "null queryStringParameters" shape production sees.
 */
export const fakeApiGatewayEvent = ({
  httpMethod,
  path,
  pathParameters = null,
  queryStringParameters = null,
  body = null,
  headers = {},
}: FakeEventOptions): APIGatewayProxyEvent =>
  ({
    httpMethod,
    path,
    resource: path,
    pathParameters,
    queryStringParameters,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    headers: { Host: 'example.execute-api.us-east-1.amazonaws.com', ...headers },
    multiValueHeaders: {},
    body,
    isBase64Encoded: false,
    requestContext: {
      domainName: 'example.execute-api.us-east-1.amazonaws.com',
      requestId: 'test-request-id',
      apiId: 'testapi',
      stage: 'api',
      identity: { sourceIp: '127.0.0.1' },
    } as any,
  }) as unknown as APIGatewayProxyEvent;

export const fakeContext = () =>
  ({
    functionName: 'test-function',
    awsRequestId: 'test-aws-request-id',
    getRemainingTimeInMillis: () => 30000,
  }) as any;
