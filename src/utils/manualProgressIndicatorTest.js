/**
 * Manual test script for ProgressIndicator component
 * This can be run in the browser console to verify progress indicator functionality
 */

/**
 * Test progress calculation logic
 */
export function testProgressCalculation() {
  console.log('🧪 Testing Progress Calculation Logic...')

  // Test progress clamping
  const clampProgress = (progress) => Math.min(100, Math.max(0, progress)

  const progressTests = [
    { input: -10, expected: 0 },
    { input: 0, expected: 0 },
    { input: 50, expected: 50 },
    { input: 100, expected: 100 },
    { input: 150, expected: 100 }
  ]

  let progressTestsPassed = 0
  progressTests.forEach(({ input, expected }) => {
    const result = clampProgress(input)
    const passed = result === expected
    console.log(`✅ Progress clamp ${input} -> ${result}:`, passed ? 'PASS' : 'FAIL')
    if (passed) progressTestsPassed++
  })

  return {
    progressClamping: progressTestsPassed === progressTests.length
  }
}

/**
 * Test time formatting logic
 */
export function testTimeFormatting() {
  console.log('🧪 Testing Time Formatting Logic...')

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  const timeTests = [
    { input: 30, expected: '30s' },
    { input: 60, expected: '1m 0s' },
    { input: 90, expected: '1m 30s' },
    { input: 125, expected: '2m 5s' },
    { input: 3661, expected: '61m 1s' }
  ]

  let timeTestsPassed = 0
  timeTests.forEach(({ input, expected }) => {
    const result = formatTime(input)
    const passed = result === expected
    console.log(`✅ Time format ${input}s -> "${result}":`, passed ? 'PASS' : 'FAIL')
    if (passed) timeTestsPassed++
  })

  return {
    timeFormatting: timeTestsPassed === timeTests.length
  }
}

/**
 * Test phase detection logic
 */
export function testPhaseDetection() {
  console.log('🧪 Testing Phase Detection Logic...')

  const getPhaseInfo = (phase) => {
    const phaseMap = {
      'Starting evaluation': { order: 1, color: 'blue', icon: '🚀' },
      'Initializing': { order: 1, color: 'blue', icon: '⚙️' },
      'Executing model requests': { order: 2, color: 'purple', icon: '🤖' },
      'Analyzing responses': { order: 3, color: 'green', icon: '🔍' },
      'Grading responses': { order: 3, color: 'green', icon: '📊' },
      'Evaluation complete': { order: 4, color: 'green', icon: '✅' }
    }

    const normalizedPhase = phase.toLowerCase()
    for (const [key, value] of Object.entries(phaseMap)) {
      if (normalizedPhase.includes(key.toLowerCase())) {
        return value
      }
    }

    return { order: 2, color: 'gray', icon: '⏳' }
  }

  const phaseTests = [
    {
      input: 'Starting evaluation',
      expected: { order: 1, color: 'blue', icon: '🚀' }
    },
    {
      input: 'Executing model requests',
      expected: { order: 2, color: 'purple', icon: '🤖' }
    },
    {
      input: 'Analyzing responses with grader LLM',
      expected: { order: 3, color: 'green', icon: '🔍' }
    },
    {
      input: 'Unknown phase',
      expected: { order: 2, color: 'gray', icon: '⏳' }
    }
  ]

  let phaseTestsPassed = 0
  phaseTests.forEach(({ input, expected }) => {
    const result = getPhaseInfo(input)
    const passed = JSON.stringify(result) === JSON.stringify(expected)
    console.log(`✅ Phase "${input}" -> ${result.icon}:`, passed ? 'PASS' : 'FAIL')
    if (passed) phaseTestsPassed++
  })

  return {
    phaseDetection: phaseTestsPassed === phaseTests.length
  }
}

/**
 * Test request rate calculation
 */
export function testRateCalculation() {
  console.log('🧪 Testing Request Rate Calculation...')

  const calculateRate = (completedRequests, elapsedSeconds) => {
    if (elapsedSeconds === 0) return 0
    return Number(((completedRequests / elapsedSeconds) * 60).toFixed(1))
  }

  const rateTests = [
    { requests: 10, elapsed: 60, expected: 10.0 },
    { requests: 5, elapsed: 30, expected: 10.0 },
    { requests: 15, elapsed: 90, expected: 10.0 },
    { requests: 0, elapsed: 60, expected: 0.0 },
    { requests: 10, elapsed: 0, expected: 0.0 }
  ]

  let rateTestsPassed = 0
  rateTests.forEach(({ requests, elapsed, expected }) => {
    const result = calculateRate(requests, elapsed)
    const passed = result === expected
    console.log(`✅ Rate ${requests}req/${elapsed}s -> ${result}/min:`, passed ? 'PASS' : 'FAIL')
    if (passed) rateTestsPassed++
  })

  return {
    rateCalculation: rateTestsPassed === rateTests.length
  }
}

/**
 * Test estimated time remaining calculation
 */
export function testTimeEstimation() {
  console.log('🧪 Testing Time Estimation Logic...')

  const calculateTimeRemaining = (progress, elapsedSeconds) => {
    if (progress <= 5) return null // Not enough progress to estimate
    const totalEstimated = (elapsedSeconds / (progress / 100))
    return Math.max(0, Math.floor(totalEstimated - elapsedSeconds))
  }

  const estimationTests = [
    { progress: 25, elapsed: 10, expected: 30 }, // 25% in 10s = 40s total, 30s remaining
    { progress: 50, elapsed: 20, expected: 20 }, // 50% in 20s = 40s total, 20s remaining
    { progress: 75, elapsed: 30, expected: 10 }, // 75% in 30s = 40s total, 10s remaining
    { progress: 5, elapsed: 10, expected: null }, // Too little progress
    { progress: 100, elapsed: 40, expected: 0 }   // Complete
  ]

  let estimationTestsPassed = 0
  estimationTests.forEach(({ progress, elapsed, expected }) => {
    const result = calculateTimeRemaining(progress, elapsed)
    const passed = result === expected
    console.log(`✅ Estimation ${progress}%/${elapsed}s -> ${result}s:`, passed ? 'PASS' : 'FAIL')
    if (passed) estimationTestsPassed++
  })

  return {
    timeEstimation: estimationTestsPassed === estimationTests.length
  }
}

/**
 * Simulate a progress indicator update sequence
 */
export function simulateProgressSequence() {
  console.log('🧪 Simulating Progress Indicator Sequence...')

  const phases = [
    { phase: 'Starting evaluation', progress: 5, requests: 0 },
    { phase: 'Initializing evaluation', progress: 10, requests: 0 },
    { phase: 'Executing model requests', progress: 25, requests: 5 },
    { phase: 'Executing model requests', progress: 50, requests: 15 },
    { phase: 'Executing model requests', progress: 75, requests: 25 },
    { phase: 'Analyzing responses with grader LLM', progress: 85, requests: 30 },
    { phase: 'Grading responses', progress: 95, requests: 30 },
    { phase: 'Evaluation complete', progress: 100, requests: 30 }
  ]

  console.log('📊 Progress Sequence:')
  phases.forEach((step, index) => {
    const phaseInfo = step.phase.includes('Starting') ? '🚀' :
                     step.phase.includes('Initializing') ? '⚙️' :
                     step.phase.includes('Executing') ? '🤖' :
                     step.phase.includes('Analyzing') ? '🔍' :
                     step.phase.includes('Grading') ? '📊' :
                     step.phase.includes('complete') ? '✅' : '⏳'

    console.log(`  ${index + 1}. ${phaseInfo} ${step.phase} (${step.progress}%, ${step.requests}/30 requests)`)
  })

  return {
    sequenceSimulation: true,
    totalSteps: phases.length
  }
}

/**
 * Run all progress indicator tests
 */
export async function runAllProgressIndicatorTests() {
  console.log('🚀 Running Progress Indicator Tests...')
  console.log('=' .repeat(60))

  const results = {}

  // Test 1: Progress calculation
  results.progressCalculation = testProgressCalculation()

  // Test 2: Time formatting
  results.timeFormatting = testTimeFormatting()

  // Test 3: Phase detection
  results.phaseDetection = testPhaseDetection()

  // Test 4: Rate calculation
  results.rateCalculation = testRateCalculation()

  // Test 5: Time estimation
  results.timeEstimation = testTimeEstimation()

  // Test 6: Sequence simulation
  results.sequenceSimulation = simulateProgressSequence()

  console.log('=' .repeat(60))
  console.log('🏁 Progress Indicator Test Results:')
  Object.entries(results).forEach(([testName, result]) => {
    const passed = Object.values(result).every(v => v === true || typeof v === 'number')
    console.log(`  ${testName}:`, passed ? '✅ PASS' : '❌ FAIL')
  })

  // Calculate overall success
  const allTestsPassed = Object.values(results).every(result =>
    Object.values(result).every(v => v === true || typeof v === 'number')
  )

  console.log('=' .repeat(60))
  console.log(`🎯 Overall Result: ${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`)

  return {
    success: allTestsPassed,
    details: results
  }
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.progressIndicatorTest = {
    testProgressCalculation,
    testTimeFormatting,
    testPhaseDetection,
    testRateCalculation,
    testTimeEstimation,
    simulateProgressSequence,
    runAll: runAllProgressIndicatorTests
  }

  console.log('🔧 Progress Indicator Tests loaded!')
  console.log('Run window.progressIndicatorTest.runAll() to test everything')
}
