/**
 * Manual performance test to verify optimizations are working
 * Run this in the browser console or as a standalone script
 */

import { tokenEstimationService } from '../services/tokenEstimationService.js';
importtCalculationService } from '../services/costCalculationService.js';
import { performanceMonitor } from './performanceMonitor.js';
import { performanceOptimizer } from './performanceOptimizer.js';

/**
 * Test performance optimizations
 */
export async function testPerformanceOptimizations() {
  console.log('🚀 Starting Performance Optimization Tests');
  console.log('==========================================');

  try {
    // Initialize services
    console.log('1. Initializing services...');
    await tokenEstimationService.initialize();
    await costCalculationService.initialize();

    // Test 1: LRU Cache functionality
    console.log('\n2. Testing LRU Cache functionality...');

    const testTexts = [
      'This is a test text for token estimation',
      'Another test text with different content',
      'Third test text to verify caching',
      'Fourth test text for cache eviction test',
      'Fifth test text to trigger LRU eviction'
    ];

    // Generate token estimations to test caching
    console.log('   - Generating token estimations...');
    for (let i = 0; i < testTexts.length; i++) {
      const result = tokenEstimationService.estimateTokens(testTexts[i], 'test-model');
      console.log(`   - Text ${i + 1}: ${result.tokens} tokens (cached: ${result.cached})`);
    }

    // Test cache hits by repeating some estimations
    console.log('   - Testing cache hits...');
    for (let i = 0; i < 3; i++) {
      const result = tokenEstimationService.estimateTokens(testTexts[i], 'test-model');
      console.log(`   - Text ${i + 1} (repeat): ${result.tokens} tokens (cached: ${result.cached})`);
    }

    // Test 2: Cost calculation caching
    console.log('\n3. Testing cost calculation caching...');

    const testUsages = [
      { input_tokens: 100, output_tokens: 50 },
      { input_tokens: 200, output_tokens: 75 },
      { input_tokens: 150, output_tokens: 100 },
      { input_tokens: 300, output_tokens: 125 }
    ];

    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';

    console.log('   - Generating cost calculations...');
    for (let i = 0; i < testUsages.length; i++) {
      const result = costCalculationService.calculateCost(testUsages[i], modelId);
      console.log(`   - Usage ${i + 1}: $${result.totalCost?.toFixed(6)} (cached: ${result.cached})`);
    }

    // Test cache hits
    console.log('   - Testing cache hits...');
    for (let i = 0; i < 2; i++) {
      const result = costCalculationService.calculateCost(testUsages[i], modelId);
      console.log(`   - Usage ${i + 1} (repeat): $${result.totalCost?.toFixed(6)} (cached: ${result.cached})`);
    }

    // Test 3: Performance monitoring
    console.log('\n4. Testing performance monitoring...');

    // Generate some operations to monitor
    for (let i = 0; i < 10; i++) {
      const timerId = performanceMonitor.startTimer('test_operation');
      await new Promise(resolve => setTimeout(resolve, Math.random() * 20)); // Random delay 0-20ms
      performanceMonitor.stopTimer('test_operation', timerId);
    }

    const metrics = performanceMonitor.getMetrics('test_operation');
    console.log('   - Test operation metrics:', {
      count: metrics.count,
      avgTime: `${metrics.avgTime.toFixed(2)}ms`,
      minTime: `${metrics.minTime.toFixed(2)}ms`,
      maxTime: `${metrics.maxTime.toFixed(2)}ms`
    });

    // Test 4: Service status and performance checks
    console.log('\n5. Checking service performance status...');

    const tokenStatus = tokenEstimationService.getStatus();
    const costStatus = costCalculationService.getStatus();

    console.log('   - Token Estimation Service:');
    console.log(`     * Total estimations: ${tokenStatus.performance.totalEstimations}`);
    console.log(`     * Cache hit rate: ${tokenStatus.performance.cacheHitRate}%`);
    console.log(`     * Memory usage: ${tokenStatus.memory.totalMB.toFixed(2)}MB`);

    console.log('   - Cost Calculation Service:');
    console.log(`     * Total calculations: ${costStatus.performance.totalCalculations}`);
    console.log(`     * Cache hit rate: ${costStatus.performance.calculationCacheHitRate}%`);
    console.log(`     * Memory usage: ${costStatus.cache.memoryUsageMB.toFixed(2)}MB`);

    // Test 5: Performance requirements check
    console.log('\n6. Checking performance requirements...');

    const tokenPerformanceCheck = tokenEstimationService.checkPerformanceRequirements();
    const costPerformanceCheck = costCalculationService.checkPerformanceRequirements();

    console.log('   - Token Estimation Performance:');
    console.log(`     * Requirements met: ${tokenPerformanceCheck.passed ? '✅' : '❌'}`);
    console.log(`     * Avg time: ${tokenPerformanceCheck.actual.avgEstimationTime || 'N/A'}ms (max: ${tokenPerformanceCheck.requirements.maxAvgEstimationTime}ms)`);
    console.log(`     * Cache hit rate: ${tokenPerformanceCheck.actual.cacheHitRate}% (min: ${tokenPerformanceCheck.requirements.minCacheHitRate}%)`);

    console.log('   - Cost Calculation Performance:');
    console.log(`     * Requirements met: ${costPerformanceCheck.passed ? '✅' : '❌'}`);
    console.log(`     * Avg time: ${costPerformanceCheck.actual.avgCalculationTime || 'N/A'}ms (max: ${costPerformanceCheck.requirements.maxAvgCalculationTime}ms)`);
    console.log(`     * Cache hit rate: ${costPerformanceCheck.actual.cacheHitRate}% (min: ${costPerformanceCheck.requirements.minCacheHitRate}%)`);

    // Test 6: Memory optimization
    console.log('\n7. Testing memory optimization...');

    const beforeOptimization = {
      tokenMemory: tokenEstimationService.getMemoryUsage(),
      costMemory: costCalculationService.getStatus().cache
    };

    console.log('   - Before optimization:');
    console.log(`     * Token service: ${beforeOptimization.tokenMemory.totalMB.toFixed(2)}MB`);
    console.log(`     * Cost service: ${beforeOptimization.costMemory.memoryUsageMB.toFixed(2)}MB`);

    // Force memory optimization
    const optimization = await performanceOptimizer.optimizeMemory();

    console.log('   - After optimization:');
    console.log(`     * Memory freed: ${optimization.memoryFreedMB.toFixed(2)}MB`);

    // Test 7: Performance optimizer status
    console.log('\n8. Performance optimizer status...');

    const optimizerStatus = performanceOptimizer.getPerformanceStatus();
    console.log('   - Overall health:', optimizerStatus.overall.healthy ? '✅ Healthy' : '❌ Issues detected');
    console.log('   - Recommendations:', optimizerStatus.recommendations.length);

    if (optimizerStatus.recommendations.length > 0) {
      console.log('   - Top recommendations:');
      optimizerStatus.recommendations.slice(0, 3).forEach((rec, index) => {
        console.log(`     ${index + 1}. [${rec.priority}] ${rec.message}`);
      });
    }

    // Final summary
    console.log('\n🎉 Performance Optimization Test Results');
    console.log('========================================');
    console.log(`✅ Token estimation caching: ${tokenStatus.performance.cacheHitRate}% hit rate`);
    console.log(`✅ Cost calculation caching: ${costStatus.performance.calculationCacheHitRate}% hit rate`);
    console.log(`✅ Performance monitoring: ${metrics.count} operations tracked`);
    console.log(`✅ Memory optimization: ${optimization.memoryFreedMB.toFixed(2)}MB freed`);
    console.log(`✅ Requirements check: Token ${tokenPerformanceCheck.passed ? 'PASS' : 'FAIL'}, Cost ${costPerformanceCheck.passed ? 'PASS' : 'FAIL'}`);

    return {
      success: true,
      tokenService: {
        cacheHitRate: tokenStatus.performance.cacheHitRate,
        memoryUsage: tokenStatus.memory.totalMB,
        performancePassed: tokenPerformanceCheck.passed
      },
      costService: {
        cacheHitRate: costStatus.performance.calculationCacheHitRate,
        memoryUsage: costStatus.cache.memoryUsageMB,
        performancePassed: costPerformanceCheck.passed
      },
      optimization: {
        memoryFreed: optimization.memoryFreedMB,
        recommendationsCount: optimizerStatus.recommendations.length
      }
    };

  } catch (error) {
    console.error('❌ Performance test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Auto-run if this file is executed directly
if (typeof window !== 'undefined') {
  // Browser environment
  window.testPerformanceOptimizations = testPerformanceOptimizations;
  console.log('Performance test function available as window.testPerformanceOptimizations()');
}
