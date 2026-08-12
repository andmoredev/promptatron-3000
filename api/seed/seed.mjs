#!/usr/bin/env node
/**
 * Seeds the Promptatron 3000 DynamoDB table from api/seed/fixtures/**.
 *
 * Usage:
 *   node seed/seed.mjs [--table NAME] [--region REGION] [--dry-run]
 *   npx tsx seed/seed.mjs ...   (tsx works too since this is plain ESM)
 *
 * Config:
 *   --table NAME     DynamoDB table name (defaults to $TABLE_NAME)
 *   --region REGION  AWS region (defaults to $AWS_REGION / $AWS_DEFAULT_REGION,
 *                     then whatever the default provider chain resolves)
 *   --dry-run        Print the converted item collections as JSON and exit --
 *                     makes no AWS calls at all, so it works with no
 *                     credentials/network access. This is how CI and local
 *                     dev verify the seeder without a real deploy.
 *
 * Idempotent: safe to run repeatedly against the same table. See
 * seed/lib/write.mjs for the upsert + createdAt-preservation strategy.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { loadAllFixtures } from './lib/transform.mjs';
import { upsertFixtures } from './lib/write.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.join(__dirname, 'fixtures');

function parseArgs(argv) {
  const args = { dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--table':
        args.table = argv[++i];
        break;
      case '--region':
        args.region = argv[++i];
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Seed the Promptatron 3000 DynamoDB table from api/seed/fixtures/**.

Usage:
  node seed/seed.mjs [--table NAME] [--region REGION] [--dry-run]

Options:
  --table NAME    DynamoDB table name (default: $TABLE_NAME)
  --region REGION AWS region (default: $AWS_REGION / $AWS_DEFAULT_REGION)
  --dry-run       Print converted item collections as JSON; makes no AWS calls
  -h, --help      Show this help
`);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }

  const fixtures = loadAllFixtures(FIXTURES_ROOT);

  if (args.dryRun) {
    console.log(JSON.stringify(fixtures, null, 2));
    return;
  }

  const tableName = args.table || process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error(
      'Table name required: pass --table <name> or set TABLE_NAME. (Use --dry-run to preview items with no AWS access.)'
    );
  }

  const region = args.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  const client = new DynamoDBClient(region ? { region } : {});
  const ddb = DynamoDBDocumentClient.from(client);

  const results = await upsertFixtures(ddb, tableName, fixtures);
  for (const result of results) {
    console.log(`seeded ${result.scenarioId}: ${result.itemCount} items -> table "${tableName}"`);
  }
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
