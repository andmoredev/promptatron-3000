/**
 * Pure fixture -> single-table item collection conversion.
 *
 * No AWS calls happen here -- everything is synchronous filesystem reads
 * plus in-memory object construction, so it can be exercised directly in
 * unit tests and by `seed.mjs --dry-run` without any DynamoDB access.
 *
 * The item shapes mirror functions/common/repository.ts + keys.ts exactly:
 *   pk = SCENARIO#{scenarioId}
 *     sk = METADATA                  (+ GSI1PK = "SCENARIO", GSI1SK = name)
 *     sk = PROMPT#SYSTEM#{promptId}
 *     sk = PROMPT#USER#{promptId}
 *     sk = TOOL#{toolName}
 *     sk = DATASET#{datasetId}
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const METADATA_SK = 'METADATA';

export const scenarioPk = (scenarioId) => `SCENARIO#${scenarioId}`;
export const promptSk = (kind, promptId) => `PROMPT#${kind}#${promptId}`;
export const toolSk = (toolName) => `TOOL#${toolName}`;
export const datasetSk = (datasetId) => `DATASET#${datasetId}`;

/** Finds every immediate subdirectory of `fixturesRoot` that contains a scenario.json, sorted for stable output. */
export function discoverFixtureDirs(fixturesRoot) {
  return readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(fixturesRoot, entry.name))
    .filter((dir) => existsSync(path.join(dir, 'scenario.json')))
    .sort();
}

/** Reads and parses one fixture folder's scenario.json. */
export function loadScenarioFixture(fixtureDir) {
  const scenario = JSON.parse(readFileSync(path.join(fixtureDir, 'scenario.json'), 'utf8'));
  return { fixtureDir, scenario };
}

/**
 * Converts one legacy scenario fixture into the item collections the
 * repository expects. Dataset content is inlined from the referenced CSV
 * files; if the fixture folder also contains a seed-data.json (legacy
 * shipping-logistics-style seed data), it is inlined as an extra
 * `application/json` dataset item with id "seed-data".
 */
export function buildScenarioItems({ fixtureDir, scenario }) {
  const scenarioId = scenario.id;
  if (!scenarioId) {
    throw new Error(`fixture at ${fixtureDir} is missing required "id"`);
  }

  const pk = scenarioPk(scenarioId);

  const metadata = {
    pk,
    sk: METADATA_SK,
    GSI1PK: 'SCENARIO',
    GSI1SK: scenario.name,
    id: scenarioId,
    name: scenario.name,
    ...(scenario.description ? { description: scenario.description } : {}),
  };

  const systemPrompts = (scenario.systemPrompts ?? []).map((prompt) => ({
    pk,
    sk: promptSk('SYSTEM', prompt.id),
    id: prompt.id,
    name: prompt.name,
    content: prompt.content,
    kind: 'SYSTEM',
  }));

  const userPrompts = (scenario.userPrompts ?? []).map((prompt) => ({
    pk,
    sk: promptSk('USER', prompt.id),
    id: prompt.id,
    name: prompt.name,
    content: prompt.content,
    kind: 'USER',
  }));

  const tools = (scenario.tools ?? []).map((tool) => ({
    pk,
    sk: toolSk(tool.name),
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    handlerKey: `${scenarioId}.${tool.name}`,
  }));

  const datasets = (scenario.datasets ?? []).map((dataset) => {
    const content = readFileSync(path.join(fixtureDir, dataset.file), 'utf8');
    return {
      pk,
      sk: datasetSk(dataset.id),
      id: dataset.id,
      name: dataset.name,
      ...(dataset.description ? { description: dataset.description } : {}),
      contentType: 'text/csv',
      content,
    };
  });

  const seedDataPath = path.join(fixtureDir, 'seed-data.json');
  if (existsSync(seedDataPath)) {
    datasets.push({
      pk,
      sk: datasetSk('seed-data'),
      id: 'seed-data',
      name: 'Seed Data',
      contentType: 'application/json',
      content: readFileSync(seedDataPath, 'utf8'),
    });
  }

  return { scenarioId, metadata, systemPrompts, userPrompts, tools, datasets };
}

/** Loads + converts every fixture under `fixturesRoot`. */
export function loadAllFixtures(fixturesRoot) {
  return discoverFixtureDirs(fixturesRoot).map((dir) => buildScenarioItems(loadScenarioFixture(dir)));
}
