import type { Context } from 'aws-lambda';
import { BadRequestError, NotFoundError, Router } from '@aws-lambda-powertools/event-handler/http';
import { cors, metrics as metricsMiddleware, tracer as tracerMiddleware } from '@aws-lambda-powertools/event-handler/http/middleware';
import { TABLE_NAME, createDocClient } from '../common/ddb';
import { json, readJsonBody } from '../common/http';
import { createObservability } from '../common/observability';
import { parseLimit } from '../common/pagination';
import {
  createPrompt,
  deletePrompt,
  getScenarioMetadata,
  listPrompts,
  updatePrompt,
} from '../common/repository';

const { logger, tracer, metrics } = createObservability('prompts');
const ddb = createDocClient(tracer);

const app = new Router({ logger });
app.use(cors({ origin: process.env.ORIGIN || '*' }));
app.use(tracerMiddleware(tracer));
app.use(metricsMiddleware(metrics));

const requireScenario = async (scenarioId: string) => {
  const scenario = await getScenarioMetadata(ddb, TABLE_NAME, scenarioId);
  if (!scenario) throw new NotFoundError('Scenario not found');
};

// GET /scenarios/:scenarioId/prompts
app.get('/scenarios/:scenarioId/prompts', async ({ params, req }) => {
  await requireScenario(params.scenarioId);
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const nextToken = url.searchParams.get('nextToken') ?? undefined;
  return json(await listPrompts(ddb, TABLE_NAME, params.scenarioId, { limit, nextToken }));
});

// POST /scenarios/:scenarioId/prompts
app.post('/scenarios/:scenarioId/prompts', async ({ params, req }) => {
  await requireScenario(params.scenarioId);
  const body = await readJsonBody(req);
  if (body.kind !== 'SYSTEM' && body.kind !== 'USER') {
    throw new BadRequestError('kind must be SYSTEM or USER');
  }
  if (typeof body.name !== 'string' || !body.name.trim()) {
    throw new BadRequestError('name is required');
  }
  if (typeof body.content !== 'string' || !body.content.trim()) {
    throw new BadRequestError('content is required');
  }

  const id = await createPrompt(ddb, TABLE_NAME, params.scenarioId, {
    kind: body.kind,
    name: body.name,
    content: body.content,
  });
  logger.info('Created prompt', { scenarioId: params.scenarioId, promptId: id });
  return json({ id }, 201);
});

// PUT /scenarios/:scenarioId/prompts/:promptId
app.put('/scenarios/:scenarioId/prompts/:promptId', async ({ params, req }) => {
  await requireScenario(params.scenarioId);
  const body = await readJsonBody(req);
  const hasName = typeof body.name === 'string';
  const hasContent = typeof body.content === 'string';
  if (!hasName && !hasContent) throw new BadRequestError('No updatable fields provided');

  const updated = await updatePrompt(ddb, TABLE_NAME, params.scenarioId, params.promptId, {
    name: typeof body.name === 'string' ? body.name : undefined,
    content: typeof body.content === 'string' ? body.content : undefined,
  });
  if (!updated) throw new NotFoundError('Prompt not found');
  return new Response(null, { status: 204 });
});

// DELETE /scenarios/:scenarioId/prompts/:promptId
app.delete('/scenarios/:scenarioId/prompts/:promptId', async ({ params }) => {
  await requireScenario(params.scenarioId);
  const deleted = await deletePrompt(ddb, TABLE_NAME, params.scenarioId, params.promptId);
  if (!deleted) throw new NotFoundError('Prompt not found');
  return new Response(null, { status: 204 });
});

export const handler = async (event: unknown, context: Context) => {
  logger.addContext(context);
  return app.resolve(event, context);
};
