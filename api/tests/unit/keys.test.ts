import { describe, expect, it } from 'vitest';
import {
  DATASET_PREFIX,
  datasetSk,
  isDatasetSk,
  isPromptSk,
  isToolSk,
  METADATA_SK,
  promptKindFromSk,
  promptSk,
  PROMPT_PREFIX,
  scenarioPk,
  SCENARIO_GSI1PK,
  toolSk,
  TOOL_PREFIX,
} from '../../functions/common/keys';

describe('key constants', () => {
  it('pins the exact literal values the single-table design depends on', () => {
    expect(METADATA_SK).toBe('METADATA');
    expect(PROMPT_PREFIX).toBe('PROMPT#');
    expect(TOOL_PREFIX).toBe('TOOL#');
    expect(DATASET_PREFIX).toBe('DATASET#');
    expect(SCENARIO_GSI1PK).toBe('SCENARIO');
  });
});

describe('key builders', () => {
  it('scenarioPk prefixes with SCENARIO#', () => {
    expect(scenarioPk('fraud-detection-comprehensive')).toBe('SCENARIO#fraud-detection-comprehensive');
  });

  it('promptSk composes PROMPT#{kind}#{id}', () => {
    expect(promptSk('SYSTEM', 'fraud-analyst')).toBe('PROMPT#SYSTEM#fraud-analyst');
    expect(promptSk('USER', 'analyze-transactions')).toBe('PROMPT#USER#analyze-transactions');
  });

  it('toolSk prefixes with TOOL#', () => {
    expect(toolSk('freeze_account')).toBe('TOOL#freeze_account');
  });

  it('datasetSk prefixes with DATASET#', () => {
    expect(datasetSk('retail-transactions')).toBe('DATASET#retail-transactions');
  });
});

describe('sk predicates', () => {
  it('isPromptSk matches only PROMPT# sks', () => {
    expect(isPromptSk('PROMPT#SYSTEM#p1')).toBe(true);
    expect(isPromptSk('PROMPT#USER#p1')).toBe(true);
    expect(isPromptSk('TOOL#t1')).toBe(false);
    expect(isPromptSk('DATASET#d1')).toBe(false);
    expect(isPromptSk('METADATA')).toBe(false);
  });

  it('isToolSk matches only TOOL# sks', () => {
    expect(isToolSk('TOOL#freeze_account')).toBe(true);
    expect(isToolSk('PROMPT#SYSTEM#p1')).toBe(false);
    expect(isToolSk('DATASET#d1')).toBe(false);
  });

  it('isDatasetSk matches only DATASET# sks', () => {
    expect(isDatasetSk('DATASET#retail-transactions')).toBe(true);
    expect(isDatasetSk('TOOL#t1')).toBe(false);
    expect(isDatasetSk('PROMPT#USER#p1')).toBe(false);
  });
});

describe('promptKindFromSk', () => {
  it('returns SYSTEM for a PROMPT#SYSTEM# sk', () => {
    expect(promptKindFromSk('PROMPT#SYSTEM#fraud-analyst')).toBe('SYSTEM');
  });

  it('returns USER for a PROMPT#USER# sk', () => {
    expect(promptKindFromSk('PROMPT#USER#analyze-transactions')).toBe('USER');
  });

  it('falls back to USER for any sk that is not a PROMPT#SYSTEM# sk', () => {
    // documents the fallback behavior explicitly rather than leaving it implicit
    expect(promptKindFromSk('PROMPT#USER#x')).toBe('USER');
    expect(promptKindFromSk('garbage')).toBe('USER');
  });
});
