import type { Context } from 'aws-lambda';
import { BadRequestError, NotFoundError, Router } from '@aws-lambda-powertools/event-handler/http';
import { cors, metrics as metricsMiddleware, tracer as tracerMiddleware } from '@aws-lambda-powertools/event-handler/http/middleware';
import { TABLE_NAME, createDocClient } from '../common/ddb';
import { json, readJsonBody } from '../common/http';
import { createObservability } from '../common/observability';
import { parseLimit } from '../common/pagination';
import {
  createScenario,
  deleteScenario,
  hydrateScenario,
  listScenarios,
  updateScenarioMetadata,
} from '../common/repository';

const { logger, tracer, metrics } = createObservability('scenarios');
const ddb = createDocClient(tracer);

const app = new Router({ logger });
app.use(cors({ origin: process.env.ORIGIN || '*' }));
app.use(tracerMiddleware(tracer));
app.use(metricsMiddleware(metrics));

// GET /scenarios - paginated list, sourced from GSI1 (GSI1PK = "SCENARIO")
app.get('/scenarios', async ({ req }) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const nextToken = url.searchParams.get('nextToken') ?? undefined;
  logger.info('Listing scenarios', { limit });
  return json(await listScenarios(ddb, TABLE_NAME, { limit, nextToken }));
});

// POST /scenarios - create scenario metadata item
app.post('/scenarios', async ({ req }) => {
  const body = await readJsonBody(req);
  if (typeof body.name !== 'string' || !body.name.trim()) {
    throw new BadRequestError('name is required');
  }

  try {
    const scenario = await createScenario(ddb, TABLE_NAME, {
      id: typeof body.id === 'string' ? body.id : undefined,
      name: body.name,
      description: typeof body.description === 'string' ? body.description : undefined,
    });
    logger.info('Created scenario', { scenarioId: scenario.id });
    return json({ ...scenario, systemPrompts: [], userPrompts: [], tools: [], datasets: [] }, 201);
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      return json({ message: 'Scenario with this id already exists' }, 409);
    }
    throw err;
  }
});

// GET /scenarios/:scenarioId - full hydrated scenario from a single partition Query
app.get('/scenarios/:scenarioId', async ({ params }) => {
  const scenario = await hydrateScenario(ddb, TABLE_NAME, params.scenarioId);
  if (!scenario) throw new NotFoundError('Scenario not found');
  return json(scenario);
});

// PUT /scenarios/:scenarioId - update metadata only
app.put('/scenarios/:scenarioId', async ({ params, req }) => {
  const body = await readJsonBody(req);
  const hasName = typeof body.name === 'string';
  const hasDescription = typeof body.description === 'string';
  if (!hasName && !hasDescription) throw new BadRequestError('No updatable fields provided');

  try {
    await updateScenarioMetadata(ddb, TABLE_NAME, params.scenarioId, {
      name: typeof body.name === 'string' ? body.name : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
    });
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') throw new NotFoundError('Scenario not found');
    throw err;
  }
  return new Response(null, { status: 204 });
});

// DELETE /scenarios/:scenarioId - deletes every item in the partition
app.delete('/scenarios/:scenarioId', async ({ params }) => {
  const deleted = await deleteScenario(ddb, TABLE_NAME, params.scenarioId);
  if (!deleted) throw new NotFoundError('Scenario not found');
  logger.info('Deleted scenario', { scenarioId: params.scenarioId });
  return new Response(null, { status: 204 });
});

export const handler = async (event: unknown, context: Context) => {
  logger.addContext(context);
  return app.resolve(event, context);
};
