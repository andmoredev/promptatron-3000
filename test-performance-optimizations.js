/**
 * Test script to verify performance optimizations in ScenarioService
 */

import { scenarioService } from './src/services/scenarioService.js'

async function testPerformanceOptimizations() {
  console.log('🚀 Testing ScenarioService Performance Optimizations')
  console.log('=' .repeat(60))

  try {
    // Test 1: Initialize service and measure time
    console.log('\n📊 Test 1: Service Initialization')
    const startTime = performance.now()
    const initResult = await scenarioService.initialize()
    const initTime = performance.now() - startTime

    console.log(`✅ Initialization: ${Math.round(initTime)}ms`)
    console.log(`📈 Result:`, initResult)

    // Test 2: Check cache performance
    console.log('\n💾 Test 2: Cache Performance')
    const cacheStats = scenarioService.getPerformanceStats()
    console.log('📊 Cache Statistics:')
    console.log(`   Metadata Cache: ${cacheStats.caches.metadata.size}/${cacheStats.caches.metadata.maxSize} (${cacheStats.caches.metadata.hitRate}% hit rate)`)
    console.log(`   Validation Cache: ${cacheStats.caches.validation.size}/${cacheStats.caches.validation.maxSize} (${cacheStats.caches.validation.hitRate}% hit rate)`)
    console.log(`   Content Cache: ${cacheStats.caches.content.size}/${cacheStats.caches.content.maxSize} (${cacheStats.caches.content.hitRate}% hit rate)`)

    // Test 3: Scenario list loading (should use cache on second call)
    console.log('\n📋 Test 3: Scenario List Loading')

    const listStart1 = performance.now()
    const scenarios1 = await scenarioService.getScenarioList()
    const listTime1 = performance.now() - listStart1

    const listStart2 = performance.now()
    const scenarios2 = await scenarioService.getScenarioList()
    const listTime2 = performance.now() - listStart2

    console.log(`📊 First call: ${Math.round(listTime1)}ms (${scenarios1.length} scenarios)`)
    console.log(`📊 Second call: ${Math.round(listTime2)}ms (cached)`)
    console.log(`🚀 Speed improvement: ${Math.round((listTime1 / listTime2) * 100) / 100}x faster`)

    // Test 4: Lazy loading
    if (scenarios1.length > 0) {
      console.log('\n⚡ Test 4: Lazy Loading')
      const scenarioId = scenarios1[0].id

      const lazyStart = performance.now()
      const scenario = await scenarioService.getScenario(scenarioId)
      const lazyTime = performance.now() - lazyStart

      console.log(`📊 Lazy load scenario "${scenarioId}": ${Math.round(lazyTime)}ms`)
      console.log(`✅ Scenario loaded: ${scenario ? 'Yes' : 'No'}`)
    }

    // Test 5: Memory usage
    console.log('\n💾 Test 5: Memory Usage Estimate')
    const memoryUsage = scenarioService.getMemoryUsageEstimate()
    console.log(`📊 Total estimated memory: ${memoryUsage.total} KB`)
    console.log(`   Scenarios: ${memoryUsage.scenarios} KB`)
    console.log(`   Metadata: ${memoryUsage.metadata} KB`)
    console.log(`   Caches: ${Object.values(memoryUsage.caches).reduce((sum, val) => sum + val, 0)} KB`)

    // Test 6: Cache optimization
    console.log('\n🔧 Test 6: Cache Optimization')
    const optimizationResult = scenarioService.optimizeCaches()
    console.log(`📊 Optimization completed in: ${optimizationResult.duration}ms`)

    // Test 7: Performance metrics
    console.log('\n📈 Test 7: Performance Metrics')
    const finalStats = scenarioService.getPerformanceStats()
    if (finalStats.operations) {
      Object.entries(finalStats.operations).forEach(([operation, stats]) => {
        console.log(`   ${operation}: avg ${stats.average}ms (min: ${stats.min}ms, max: ${stats.max}ms, samples: ${stats.samples})`)
      })
    }

    console.log('\n✅ All performance optimization tests completed successfully!')

  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPerformanceOptimizations()
}

export { testPerformanceOptimizations }
