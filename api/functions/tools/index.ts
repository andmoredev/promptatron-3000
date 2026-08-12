import type { Context } from 'aws-lambda';
import { BadRequestError, NotFoundError, Router } from '@aws-lambda-powertools/event-handler/http';
import { cors, metrics as metricsMiddleware, tracer as tracerMiddleware } from '@aws-lambda-powertools/event-handler/http/middleware';
import { TABLE_NAME, createDocClient } from '../common/ddb';
import { json, readJsonBody } from '../common/http';
import { createObservability } from '../common/observability';
import { getScenarioMetadata, getTool, listTools, putTool } from '../common/repository';

const { logger, tracer, metrics } = createObservability('tools');
const ddb = createDocClient(tracer);

const app = new Router({ logger });
app.use(cors({ origin: process.env.ORIGIN || '*' }));
app.use(tracerMiddleware(tracer));
app.use(metricsMiddleware(metrics));

const requireScenario = async (scenarioId: string) => {
  const scenario = await getScenarioMetadata(ddb, TABLE_NAME, scenarioId);
  if (!scenario) throw new NotFoundError('Scenario not found');
};

// GET /scenarios/:scenarioId/tools
app.get('/scenarios/:scenarioId/tools', async ({ params }) => {
  await requireScenario(params.scenarioId);
  const items = await listTools(ddb, TABLE_NAME, params.scenarioId);
  return json({ items, count: items.length });
});

// GET /scenarios/:scenarioId/tools/:toolName
app.get('/scenarios/:scenarioId/tools/:toolName', async ({ params }) => {
  await requireScenario(params.scenarioId);
  const tool = await getTool(ddb, TABLE_NAME, params.scenarioId, params.toolName);
  if (!tool) throw new NotFoundError('Tool not found');
  return json(tool);
});

// PUT /scenarios/:scenarioId/tools/:toolName - upsert (create or replace)
app.put('/scenarios/:scenarioId/tools/:toolName', async ({ params, req }) => {
  await requireScenario(params.scenarioId);
  const body = await readJsonBody(req);
  if (typeof body.description !== 'string' || !body.description.trim()) {
    throw new BadRequestError('description is required');
  }
  if (!body.inputSchema || typeof body.inputSchema !== 'object' || Array.isArray(body.inputSchema)) {
    throw new BadRequestError('inputSchema must be a JSON object');
  }
  if (typeof body.handlerKey !== 'string' || !body.handlerKey.trim()) {
    throw new BadRequestError('handlerKey is required');
  }

  const tool = await putTool(ddb, TABLE_NAME, params.scenarioId, params.toolName, {
    description: body.description,
    inputSchema: body.inputSchema as Record<string, unknown>,
    handlerKey: body.handlerKey,
  });
  logger.info('Upserted tool', { scenarioId: params.scenarioId, toolName: params.toolName });
  return json(tool);
});

export const handler = async (event: unknown, context: Context) => {
  logger.addContext(context);
  return app.resolve(event, context);
};
