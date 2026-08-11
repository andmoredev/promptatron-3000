import type { Context } from 'aws-lambda';
import { BadRequestError, NotFoundError, Router } from '@aws-lambda-powertools/event-handler/http';
import { cors, metrics as metricsMiddleware, tracer as tracerMiddleware } from '@aws-lambda-powertools/event-handler/http/middleware';
import { TABLE_NAME, createDocClient } from '../common/ddb';
import { json, readJsonBody } from '../common/http';
import { createObservability } from '../common/observability';
import { parseLimit } from '../common/pagination';
import {
  createDataset,
  deleteDataset,
  getDataset,
  getScenarioMetadata,
  listDatasets,
  updateDataset,
} from '../common/repository';
import type { DatasetContentType } from '../common/types';

const CONTENT_TYPES: DatasetContentType[] = ['text/csv', 'application/json'];
const isValidContentType = (value: unknown): value is DatasetContentType =>
  typeof value === 'string' && (CONTENT_TYPES as string[]).includes(value);

const { logger, tracer, metrics } = createObservability('datasets');
const ddb = createDocClient(tracer);

const app = new Router({ logger });
app.use(cors({ origin: process.env.ORIGIN || '*' }));
app.use(tracerMiddleware(tracer));
app.use(metricsMiddleware(metrics));

const requireScenario = async (scenarioId: string) => {
  const scenario = await getScenarioMetadata(ddb, TABLE_NAME, scenarioId);
  if (!scenario) throw new NotFoundError('Scenario not found');
};

// GET /scenarios/:scenarioId/datasets - metadata only, no content
app.get('/scenarios/:scenarioId/datasets', async ({ params, req }) => {
  await requireScenario(params.scenarioId);
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const nextToken = url.searchParams.get('nextToken') ?? undefined;
  return json(await listDatasets(ddb, TABLE_NAME, params.scenarioId, { limit, nextToken }));
});

// POST /scenarios/:scenarioId/datasets
app.post('/scenarios/:scenarioId/datasets', async ({ params, req }) => {
  await requireScenario(params.scenarioId);
  const body = await readJsonBody(req);
  if (typeof body.name !== 'string' || !body.name.trim()) {
    throw new BadRequestError('name is required');
  }
  if (!isValidContentType(body.contentType)) {
    throw new BadRequestError(`contentType must be one of: ${CONTENT_TYPES.join(', ')}`);
  }
  if (typeof body.content !== 'string') {
    throw new BadRequestError('content is required');
  }

  const id = await createDataset(ddb, TABLE_NAME, params.scenarioId, {
    id: typeof body.id === 'string' ? body.id : undefined,
    name: body.name,
    description: typeof body.description === 'string' ? body.description : undefined,
    contentType: body.contentType,
    content: body.content,
  });
  logger.info('Created dataset', { scenarioId: params.scenarioId, datasetId: id });
  return json({ id }, 201);
});

// GET /scenarios/:scenarioId/datasets/:datasetId - metadata + inline content
app.get('/scenarios/:scenarioId/datasets/:datasetId', async ({ params }) => {
  await requireScenario(params.scenarioId);
  const dataset = await getDataset(ddb, TABLE_NAME, params.scenarioId, params.datasetId);
  if (!dataset) throw new NotFoundError('Dataset not found');
  return json(dataset);
});

// PUT /scenarios/:scenarioId/datasets/:datasetId
app.put('/scenarios/:scenarioId/datasets/:datasetId', async ({ params, req }) => {
  await requireScenario(params.scenarioId);
  const body = await readJsonBody(req);
  if (body.contentType !== undefined && !isValidContentType(body.contentType)) {
    throw new BadRequestError(`contentType must be one of: ${CONTENT_TYPES.join(', ')}`);
  }

  const hasName = typeof body.name === 'string';
  const hasDescription = typeof body.description === 'string';
  const hasContentType = isValidContentType(body.contentType);
  const hasContent = typeof body.content === 'string';
  if (!hasName && !hasDescription && !hasContentType && !hasContent) {
    throw new BadRequestError('No updatable fields provided');
  }

  const updated = await updateDataset(ddb, TABLE_NAME, params.scenarioId, params.datasetId, {
    name: typeof body.name === 'string' ? body.name : undefined,
    description: typeof body.description === 'string' ? body.description : undefined,
    contentType: isValidContentType(body.contentType) ? body.contentType : undefined,
    content: typeof body.content === 'string' ? body.content : undefined,
  });
  if (!updated) throw new NotFoundError('Dataset not found');
  return new Response(null, { status: 204 });
});

// DELETE /scenarios/:scenarioId/datasets/:datasetId
app.delete('/scenarios/:scenarioId/datasets/:datasetId', async ({ params }) => {
  await requireScenario(params.scenarioId);
  const deleted = await deleteDataset(ddb, TABLE_NAME, params.scenarioId, params.datasetId);
  if (!deleted) throw new NotFoundError('Dataset not found');
  return new Response(null, { status: 204 });
});

export const handler = async (event: unknown, context: Context) => {
  logger.addContext(context);
  return app.resolve(event, context);
};
