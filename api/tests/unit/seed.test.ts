import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildScenarioItems,
  datasetSk,
  discoverFixtureDirs,
  loadAllFixtures,
  loadScenarioFixture,
  METADATA_SK,
  promptSk,
  scenarioPk,
  toolSk,
} from '../../seed/lib/transform.mjs';
import { upsertFixtures, upsertScenario } from '../../seed/lib/write.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.join(__dirname, '../../seed/fixtures');

const TABLE_NAME = 'promptatron-table';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ddbMock = mockClient(ddb);

beforeEach(() => {
  ddbMock.reset();
});

describe('key helpers', () => {
  it('match functions/common/keys.ts exactly', () => {
    expect(scenarioPk('fraud-detection-comprehensive')).toBe('SCENARIO#fraud-detection-comprehensive');
    expect(METADATA_SK).toBe('METADATA');
    expect(promptSk('SYSTEM', 'fraud-analyst')).toBe('PROMPT#SYSTEM#fraud-analyst');
    expect(promptSk('USER', 'analyze-transactions')).toBe('PROMPT#USER#analyze-transactions');
    expect(toolSk('freeze_account')).toBe('TOOL#freeze_account');
    expect(datasetSk('retail-transactions')).toBe('DATASET#retail-transactions');
  });
});

describe('discoverFixtureDirs', () => {
  it('finds both known fixture folders', () => {
    const dirs = discoverFixtureDirs(FIXTURES_ROOT).map((d) => path.basename(d));
    expect(dirs).toEqual(['fraud-detection', 'shipping-logistics']);
  });
});

describe('buildScenarioItems: fraud-detection (real fixture)', () => {
  const fixture = loadScenarioFixture(path.join(FIXTURES_ROOT, 'fraud-detection'));
  const items = buildScenarioItems(fixture);

  it('produces the exact item counts read from the fixture', () => {
    expect(items.scenarioId).toBe('fraud-detection-comprehensive');
    expect(items.systemPrompts).toHaveLength(fixture.scenario.systemPrompts.length);
    expect(items.userPrompts).toHaveLength(fixture.scenario.userPrompts.length);
    expect(items.tools).toHaveLength(fixture.scenario.tools.length);
    expect(items.datasets).toHaveLength(fixture.scenario.datasets.length);

    // pin the actual numbers so a fixture edit that silently drops content is caught
    expect(items.systemPrompts).toHaveLength(4);
    expect(items.userPrompts).toHaveLength(5);
    expect(items.tools).toHaveLength(4);
    expect(items.datasets).toHaveLength(4);
  });

  it('builds a METADATA item with the exact pk/sk/GSI1 shape', () => {
    expect(items.metadata).toEqual({
      pk: 'SCENARIO#fraud-detection-comprehensive',
      sk: 'METADATA',
      GSI1PK: 'SCENARIO',
      GSI1SK: 'Fraud Detection',
      id: 'fraud-detection-comprehensive',
      name: 'Fraud Detection',
      description: fixture.scenario.description,
    });
  });

  it('builds PROMPT#SYSTEM and PROMPT#USER items with matching kind', () => {
    for (const item of items.systemPrompts) {
      expect(item.pk).toBe('SCENARIO#fraud-detection-comprehensive');
      expect(item.sk).toBe(`PROMPT#SYSTEM#${item.id}`);
      expect(item.kind).toBe('SYSTEM');
    }
    for (const item of items.userPrompts) {
      expect(item.pk).toBe('SCENARIO#fraud-detection-comprehensive');
      expect(item.sk).toBe(`PROMPT#USER#${item.id}`);
      expect(item.kind).toBe('USER');
    }
    const analyst = items.systemPrompts.find((p) => p.id === 'fraud-analyst');
    expect(analyst?.name).toBe('Expert Fraud Detection Analyst');
    expect(analyst?.content).toContain('expert fraud detection analyst');
  });

  it('builds TOOL items with a derived {scenarioId}.{toolName} handlerKey', () => {
    for (const item of items.tools) {
      expect(item.pk).toBe('SCENARIO#fraud-detection-comprehensive');
      expect(item.sk).toBe(`TOOL#${item.name}`);
      expect(item.handlerKey).toBe(`fraud-detection-comprehensive.${item.name}`);
      expect(item.inputSchema).toBeTypeOf('object');
    }
    const freeze = items.tools.find((t) => t.name === 'freeze_account');
    expect(freeze?.handlerKey).toBe('fraud-detection-comprehensive.freeze_account');
    expect(freeze?.description).toContain('freeze an account');
  });

  it('builds DATASET items whose content round-trips the referenced CSV file exactly', () => {
    for (const dataset of items.datasets) {
      expect(dataset.pk).toBe('SCENARIO#fraud-detection-comprehensive');
      expect(dataset.sk).toBe(`DATASET#${dataset.id}`);
      expect(dataset.contentType).toBe('text/csv');
    }
    const retail = items.datasets.find((d) => d.id === 'retail-transactions');
    expect(retail?.content).toContain('transaction_id,account_id,amount,merchant,location,timestamp,category');
    expect(retail?.content).toContain('T0001,A1234,25.99,Coffee Shop,New York');
    // every dataset in this fixture declares a description -- pin that it survives conversion
    expect(retail?.description).toBe(fixture.scenario.datasets.find((d: any) => d.id === 'retail-transactions').description);
    for (const dataset of items.datasets) {
      const sourceDescription = fixture.scenario.datasets.find((d: any) => d.id === dataset.id).description;
      expect(dataset.description).toBe(sourceDescription);
    }
  });
});

describe('buildScenarioItems: shipping-logistics (real fixture)', () => {
  const fixture = loadScenarioFixture(path.join(FIXTURES_ROOT, 'shipping-logistics'));
  const items = buildScenarioItems(fixture);

  it('produces the exact item counts read from the fixture, including the derived seed-data dataset', () => {
    expect(items.scenarioId).toBe('shipping-logistics');
    expect(items.systemPrompts).toHaveLength(fixture.scenario.systemPrompts.length);
    expect(items.userPrompts).toHaveLength(fixture.scenario.userPrompts.length);
    expect(items.tools).toHaveLength(fixture.scenario.tools.length);
    // scenario.json declares zero `datasets`; the seed-data.json file adds exactly one DATASET item
    expect(fixture.scenario.datasets).toEqual([]);
    expect(items.datasets).toHaveLength(1);

    expect(items.systemPrompts).toHaveLength(1);
    expect(items.userPrompts).toHaveLength(1);
    expect(items.tools).toHaveLength(10);
  });

  it('adds a seed-data DATASET item with contentType application/json whose content round-trips seed-data.json', () => {
    const seedData = items.datasets[0];
    expect(seedData).toMatchObject({
      pk: 'SCENARIO#shipping-logistics',
      sk: 'DATASET#seed-data',
      id: 'seed-data',
      name: 'Seed Data',
      contentType: 'application/json',
    });

    const rawFile = readFileSync(path.join(FIXTURES_ROOT, 'shipping-logistics', 'seed-data.json'), 'utf8');
    expect(seedData.content).toBe(rawFile);
    expect(JSON.parse(seedData.content)).toEqual(JSON.parse(rawFile));
    expect(JSON.parse(seedData.content).orders.B456).toBeDefined();
  });

  it('builds TOOL items with a derived {scenarioId}.{toolName} handlerKey', () => {
    const expedite = items.tools.find((t) => t.name === 'expediteShipment');
    expect(expedite?.handlerKey).toBe('shipping-logistics.expediteShipment');
  });
});

describe('loadAllFixtures', () => {
  it('converts every fixture under fixtures/ and preserves discovery order', () => {
    const all = loadAllFixtures(FIXTURES_ROOT);
    expect(all.map((s) => s.scenarioId)).toEqual(['fraud-detection-comprehensive', 'shipping-logistics']);
  });
});

describe('upsertScenario (write path, mocked DynamoDB)', () => {
  const fixture = buildScenarioItems(loadScenarioFixture(path.join(FIXTURES_ROOT, 'shipping-logistics')));

  it('Puts every item in the collection and sets createdAt = updatedAt = now when the METADATA item is new', async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});

    const now = '2026-08-11T00:00:00.000Z';
    const result = await upsertScenario(ddb, TABLE_NAME, fixture, { now });

    const expectedItemCount =
      1 + fixture.systemPrompts.length + fixture.userPrompts.length + fixture.tools.length + fixture.datasets.length;
    expect(result).toEqual({ scenarioId: 'shipping-logistics', itemCount: expectedItemCount });

    const puts = ddbMock.commandCalls(PutCommand);
    expect(puts).toHaveLength(expectedItemCount);

    const metadataPut = puts.find((call) => call.args[0].input.Item?.sk === 'METADATA');
    expect(metadataPut?.args[0].input.TableName).toBe(TABLE_NAME);
    expect(metadataPut?.args[0].input.Item).toMatchObject({ createdAt: now, updatedAt: now });
  });

  it('preserves the existing createdAt on re-seed while still overwriting updatedAt and every other field', async () => {
    const originalCreatedAt = '2025-01-01T00:00:00.000Z';
    ddbMock.on(GetCommand).resolves({ Item: { ...fixture.metadata, createdAt: originalCreatedAt, updatedAt: originalCreatedAt } });
    ddbMock.on(PutCommand).resolves({});

    const now = '2026-08-11T00:00:00.000Z';
    await upsertScenario(ddb, TABLE_NAME, fixture, { now });

    const metadataPut = ddbMock.commandCalls(PutCommand).find((call) => call.args[0].input.Item?.sk === 'METADATA');
    expect(metadataPut?.args[0].input.Item).toMatchObject({ createdAt: originalCreatedAt, updatedAt: now });
  });

  it('reads the existing METADATA item by the exact pk/sk key before writing', async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});

    await upsertScenario(ddb, TABLE_NAME, fixture, { now: '2026-08-11T00:00:00.000Z' });

    const get = ddbMock.commandCalls(GetCommand)[0];
    expect(get.args[0].input).toEqual({
      TableName: TABLE_NAME,
      Key: { pk: 'SCENARIO#shipping-logistics', sk: 'METADATA' },
    });
  });
});

describe('upsertFixtures (write path, mocked DynamoDB)', () => {
  it('upserts every scenario returned by loadAllFixtures', async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});

    const all = loadAllFixtures(FIXTURES_ROOT);
    const results = await upsertFixtures(ddb, TABLE_NAME, all, { now: '2026-08-11T00:00:00.000Z' });

    expect(results.map((r) => r.scenarioId)).toEqual(['fraud-detection-comprehensive', 'shipping-logistics']);
    expect(results.find((r) => r.scenarioId === 'fraud-detection-comprehensive')?.itemCount).toBe(18); // 1 + 4 + 5 + 4 + 4
    expect(results.find((r) => r.scenarioId === 'shipping-logistics')?.itemCount).toBe(14); // 1 + 1 + 1 + 10 + 1
  });
});

describe('buildScenarioItems: edge cases (synthetic fixtures)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'promptatron-seed-test-'));
  });

  afterEach(() => rmSync(tmpRoot, { recursive: true, force: true }));

  it('throws a descriptive error when the fixture scenario.json has no "id"', () => {
    const dir = path.join(tmpRoot, 'no-id');
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify({ name: 'No Id' }));

    const fixture = loadScenarioFixture(dir);
    expect(() => buildScenarioItems(fixture)).toThrowError(/missing required "id"/);
  });

  it('omits the description field entirely when the scenario has none', () => {
    const dir = path.join(tmpRoot, 'no-description');
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify({ id: 'no-desc', name: 'No Desc' }));

    const items = buildScenarioItems(loadScenarioFixture(dir));
    expect(items.metadata).not.toHaveProperty('description');
    expect(items.metadata).toEqual({
      pk: 'SCENARIO#no-desc',
      sk: 'METADATA',
      GSI1PK: 'SCENARIO',
      GSI1SK: 'No Desc',
      id: 'no-desc',
      name: 'No Desc',
    });
  });

  it('produces empty arrays when systemPrompts/userPrompts/tools/datasets are entirely absent from scenario.json', () => {
    const dir = path.join(tmpRoot, 'minimal');
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify({ id: 'minimal-scenario', name: 'Minimal' }));

    const items = buildScenarioItems(loadScenarioFixture(dir));
    expect(items.systemPrompts).toEqual([]);
    expect(items.userPrompts).toEqual([]);
    expect(items.tools).toEqual([]);
    expect(items.datasets).toEqual([]);
  });

  it('produces empty arrays when systemPrompts/userPrompts/tools/datasets are explicit empty arrays', () => {
    const dir = path.join(tmpRoot, 'explicit-empty');
    mkdirSync(dir);
    writeFileSync(
      path.join(dir, 'scenario.json'),
      JSON.stringify({ id: 'explicit-empty', name: 'Explicit Empty', systemPrompts: [], userPrompts: [], tools: [], datasets: [] })
    );

    const items = buildScenarioItems(loadScenarioFixture(dir));
    expect(items.systemPrompts).toEqual([]);
    expect(items.userPrompts).toEqual([]);
    expect(items.tools).toEqual([]);
    expect(items.datasets).toEqual([]);
  });

  it('omits description on a CSV dataset item when the fixture dataset entry has none', () => {
    const dir = path.join(tmpRoot, 'dataset-no-desc');
    mkdirSync(dir);
    writeFileSync(
      path.join(dir, 'scenario.json'),
      JSON.stringify({
        id: 'dataset-no-desc',
        name: 'Dataset No Desc',
        datasets: [{ id: 'd1', name: 'D1', file: 'd1.csv' }],
      })
    );
    writeFileSync(path.join(dir, 'd1.csv'), 'a,b\n1,2\n');

    const items = buildScenarioItems(loadScenarioFixture(dir));
    expect(items.datasets).toHaveLength(1);
    expect(items.datasets[0]).not.toHaveProperty('description');
    expect(items.datasets[0]).toEqual({
      pk: 'SCENARIO#dataset-no-desc',
      sk: 'DATASET#d1',
      id: 'd1',
      name: 'D1',
      contentType: 'text/csv',
      content: 'a,b\n1,2\n',
    });
  });

  it('adds only the seed-data dataset when scenario.json declares no datasets but seed-data.json is present', () => {
    const dir = path.join(tmpRoot, 'seed-data-only');
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'scenario.json'), JSON.stringify({ id: 'seed-data-only', name: 'Seed Data Only' }));
    writeFileSync(path.join(dir, 'seed-data.json'), JSON.stringify({ foo: 'bar' }));

    const items = buildScenarioItems(loadScenarioFixture(dir));
    expect(items.datasets).toHaveLength(1);
    expect(items.datasets[0]).toMatchObject({ id: 'seed-data', contentType: 'application/json' });
    expect(JSON.parse(items.datasets[0].content)).toEqual({ foo: 'bar' });
  });
});

describe('discoverFixtureDirs: filters non-scenario directories', () => {
  it('ignores subdirectories that lack a scenario.json and sorts the rest', () => {
    const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'promptatron-discover-test-'));
    try {
      mkdirSync(path.join(tmpRoot, 'zeta'));
      writeFileSync(path.join(tmpRoot, 'zeta', 'scenario.json'), JSON.stringify({ id: 'z', name: 'Z' }));
      mkdirSync(path.join(tmpRoot, 'alpha'));
      writeFileSync(path.join(tmpRoot, 'alpha', 'scenario.json'), JSON.stringify({ id: 'a', name: 'A' }));
      mkdirSync(path.join(tmpRoot, 'not-a-scenario')); // no scenario.json -- must be skipped
      writeFileSync(path.join(tmpRoot, 'stray-file.json'), '{}'); // not even a directory

      const dirs = discoverFixtureDirs(tmpRoot).map((d) => path.basename(d));
      expect(dirs).toEqual(['alpha', 'zeta']);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('upsertScenario: re-seed corner cases', () => {
  const fixture = buildScenarioItems(loadScenarioFixture(path.join(FIXTURES_ROOT, 'fraud-detection')));

  it('treats an existing METADATA item with no createdAt as if it were new (falls back to now)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { ...fixture.metadata } }); // no createdAt on the stored item
    ddbMock.on(PutCommand).resolves({});

    const now = '2026-08-12T00:00:00.000Z';
    await upsertScenario(ddb, TABLE_NAME, fixture, { now });

    const metadataPut = ddbMock.commandCalls(PutCommand).find((call) => call.args[0].input.Item?.sk === 'METADATA');
    expect(metadataPut?.args[0].input.Item).toMatchObject({ createdAt: now, updatedAt: now });
  });

  it('re-running upsertScenario twice is idempotent: same item count and same final content both times', async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});

    const first = await upsertScenario(ddb, TABLE_NAME, fixture, { now: '2026-08-11T00:00:00.000Z' });
    const secondRunExisting = { ...fixture.metadata, createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' };
    ddbMock.on(GetCommand).resolves({ Item: secondRunExisting });
    const second = await upsertScenario(ddb, TABLE_NAME, fixture, { now: '2026-08-12T00:00:00.000Z' });

    expect(second.itemCount).toBe(first.itemCount);

    const metadataPuts = ddbMock.commandCalls(PutCommand).filter((call) => call.args[0].input.Item?.sk === 'METADATA');
    expect(metadataPuts).toHaveLength(2);
    expect(metadataPuts[1].args[0].input.Item).toMatchObject({
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    });
  });
});
