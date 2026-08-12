/**
 * DynamoDB write path for seeding. Kept separate from transform.mjs so the
 * fixture -> item conversion can be unit tested with zero AWS involvement.
 *
 * Idempotency strategy: every item is written with an unconditional
 * PutCommand (same pk/sk => overwrite), EXCEPT the METADATA item's
 * `createdAt`, which is preserved across re-seeds. We read-then-write
 * (GetCommand for the existing METADATA item, then PutCommand) rather than
 * UpdateCommand because every other seeded field on every item must be
 * fully replaced on each run (fixture is the source of truth), not merged
 * field-by-field -- a plain conditional Put keeps that "fixture wins"
 * semantics simple while still special-casing the one field that should
 * survive a re-seed.
 */

import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

/** Upserts a single scenario's item collection (as produced by transform.mjs). */
export async function upsertScenario(ddb, tableName, items, { now = new Date().toISOString() } = {}) {
  const existing = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: items.metadata.pk, sk: items.metadata.sk },
    })
  );
  const createdAt = existing.Item?.createdAt ?? now;
  const metadataItem = { ...items.metadata, createdAt, updatedAt: now };

  const allItems = [
    metadataItem,
    ...items.systemPrompts,
    ...items.userPrompts,
    ...items.tools,
    ...items.datasets,
  ];

  for (const item of allItems) {
    await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
  }

  return { scenarioId: items.scenarioId, itemCount: allItems.length };
}

/** Upserts every scenario in `fixtureItemsList` sequentially, returning a per-scenario summary. */
export async function upsertFixtures(ddb, tableName, fixtureItemsList, options = {}) {
  const results = [];
  for (const items of fixtureItemsList) {
    results.push(await upsertScenario(ddb, tableName, items, options));
  }
  return results;
}
