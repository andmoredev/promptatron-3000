/**
 * Simple verification script for Momento configuration
 *
 * This can be used to test that Momento is properly configured
 * without requiring a full test suite.
 */

import { initializeMomento, isMomentoEnabled, getMomentoClient } from './momentoConfig.js';
import { checkRateLimit } from './rateLimiting.js';
import { checkCache, cacheResponse } from './caching.js';

/**
 * Verify Momento configuration and basic functionality
 */
export async function verifyMomentoSetup() {
  console.log('🔍 Verifying Momento SDK configuration...');

  // Test initialization
  const initialized = await initializeMomento();
  console.log(`✅ Momento initialization: ${initialized ? 'SUCCESS' : 'SKIPPED (no API key)'}`);

  // Test enabled status
  const enabled = isMomentoEnabled();
  console.log(`✅ Momento enabled: ${enabled}`);

  // Test client availability
  const client = getMomentoClient();
  console.log(`✅ Momento client: ${client ? 'AVAILABLE' : 'NOT AVAILABLE'}`);

  // Test rate limiting
  try {
    const rateLimitResult = await checkRateLimit();
    console.log(`✅ Rate limiting check: ${rateLimitResult.exceeded ? 'EXCEEDED' : 'OK'}`);
    if (rateLimitResult.info) {
      console.log(`   - Limit: ${rateLimitResult.info.limit}`);
      console.log(`   - Remaining: ${rateLimitResult.info.remaining}`);
      console.log(`   - Reset in: ${rateLimitResult.info.reset_seconds}s`);
    } else {
      console.log('   - Rate limiting disabled (no Momento)');
    }
  } catch (error) {
    console.log(`❌ Rate limiting error: ${error.message}`);
  }

  // Test caching
  try {
    const testKey = 'test:verification:' + Date.now();
    const testData = { message: 'Hello Momento!', timestamp: new Date().toISOString() };

    // Try to cache something
    const cached = await cacheResponse(testKey, testData, 60);
    console.log(`✅ Cache write: ${cached ? 'SUCCESS' : 'SKIPPED (no Momento)'}`);

    // Try to read it back
    const retrieved = await checkCache(testKey);
    console.log(`✅ Cache read: ${retrieved ? 'SUCCESS' : 'MISS/SKIPPED'}`);

  } catch (error) {
    console.log(`❌ Caching error: ${error.message}`);
  }

  console.log('🎉 Momento verification complete!');

  return {
    initialized,
    enabled,
    hasClient: !!client
  };
}

// Auto-run verification if this file is imported
if (typeof window !== 'undefined') {
  // Only run in browser environment
  verifyMomentoSetup().catch(error => {
    console.error('Momento verification failed:', error);
  });
}
