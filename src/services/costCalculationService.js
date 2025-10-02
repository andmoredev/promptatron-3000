import { analyzeError, handleError, ErrorTypes } from '../utils/errorHandling.js';
import { handleCostCalculationError, createFallbackCostData } from '../utils/tokenCostErrorHandling.js';
import { notificationManager } from '../utils/notificationManager.js';
import { AWS_BEDROCK_PRICING_DATA, getSupportedRegions, getRegionInfo, getPricingDataVersion } from '../data/aws-bedrock-pricing.js';
import { validatePricingData, generatePricingHealthReport, PricingValidationError } from '../utils/pricingDataValidation.js';
import { LRUCache } from '../utils/lruCache.js';
import { performanceMonitor } from '../utils/performanceMonitor.js';

/**
 * Service class for cost calculation
 * Handles pricing calculations based on AWS Bedrock pricing data
 * Includes performance optimizations: calculation caching and monitoring
 */
export class CostCalculationService {
  constructor() {
    this.pricingData = new Map(); // Model pricing cache
    this.calculationCache = new LRUCache(500); // Cache for cost calculations
    this.lastUpdated = null;
    this.isInitialized = false;
    this.lastError = null;
    this.defaultRegion = 'us-east-1';
    this.performanceStats = {
      calculationCacheHits: 0,
      calculationCacheMisses: 0,
      totalCalculations: 0,
      pricingLookups: 0
    };
  }

  /**
   * Initialize the cost calculation service
   * Loads and validates pricing data into memory cache
   */
  async initialize() {
    try {
      // Validate pricing data structure first
      const validation = validatePricingData(AWS_BEDROCK_PRICING_DATA);
      if (!validation.success) {
        throw new PricingValidationError(
          `Pricing data validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Log validation warnings if any
      if (validation.warnings.length > 0) {
        console.warn('Pricing data validation warnings:', validation.warnings);

        // Notify about pricing data issues if significant
        if (validation.warnings.length > 5) {
          notificationManager.notifyPricingDataIssue({
            severity: 'warning',
            message: `Pricing data has ${validation.warnings.length} validation warnings. Cost estimates may be less accurate.`,
            actions: ['Continue with estimates', 'Check AWS pricing page']
          });
        }
      }

      await this.loadPricingData();
      this.isInitialized = true;
      this.lastError = null;

      console.log('Cost calculation service initialized successfully', {
        modelsLoaded: this.pricingData.size,
        regionsSupported: getSupportedRegions().length,
        dataVersion: getPricingDataVersion().version,
        validationWarnings: validation.warnings.length
      });

      return {
        success: true,
        message: 'Cost calculation service initialized successfully',
        modelsLoaded: this.pricingData.size,
        regionsSupported: getSupportedRegions().length,
        lastUpdated: this.lastUpdated,
        dataVersion: getPricingDataVersion().version,
        validationWarnings: validation.warnings.length
      };
    } catch (error) {
      this.isInitialized = false;
      this.lastError = error;

      console.error('Cost calculation service initialization failed:', error);

      // Handle initialization error with user notification
      const errorResult = handleCostCalculationError(error, {
        component: 'CostCalculationService',
        action: 'initialize'
      });

      // Notify user about initialization failure
      notificationManager.notifyServiceInitializationError(
        'CostCalculationService',
        errorResult.errorInfo,
        {
          canContinue: true,
          userNotification: {
            message: 'Cost estimates are temporarily unavailable. Token tracking continues to work normally.',
            actions: ['Continue without cost info', 'Refresh page to retry']
          }
        }
      );

      return {
        success: false,
        message: `Cost calculation service initialization failed: ${error.message}`,
        error: error,
        fallbackAvailable: true
      };
    }
  }

  /**
   * Load AWS Bedrock pricing data into cache
   * @param {string} region - AWS region for pricing lookup
   */
  async loadPricingData(region = this.defaultRegion) {
    try {
      this.pricingData.clear();

      // Validate region exists
      const supportedRegions = getSupportedRegions();
      if (!supportedRegions.includes(region)) {
        console.warn(`Region ${region} not found in pricing data, using ${this.defaultRegion}`);
        region = this.defaultRegion;
      }

      // Load pricing data for the specified region
      const regionData = AWS_BEDROCK_PRICING_DATA.regions[region];
      if (!regionData || !regionData.models) {
        // Fallback to default region if specified region has no models
        const fallbackData = AWS_BEDROCK_PRICING_DATA.regions[this.defaultRegion];
        if (!fallbackData || !fallbackData.models) {
          throw new Error(`No pricing data available for region ${region} or default region ${this.defaultRegion}`);
        }

        console.warn(`No models found for region ${region}, using ${this.defaultRegion} pricing`);
        Object.entries(fallbackData.models).forEach(([modelId, pricing]) => {
          this.pricingData.set(modelId, {
            ...pricing,
            region: this.defaultRegion,
            fallbackUsed: true
          });
        });
      } else {
        Object.entries(regionData.models).forEach(([modelId, pricing]) => {
          // Only load available models
          if (pricing.available !== false) {
            this.pricingData.set(modelId, {
              ...pricing,
              region,
              fallbackUsed: false
            });
          }
        });
      }

      this.lastUpdated = AWS_BEDROCK_PRICING_DATA.metadata.lastUpdated;

      console.log(`Loaded pricing data for ${this.pricingData.size} models in region ${region}`, {
        region,
        modelsLoaded: this.pricingData.size,
        dataVersion: AWS_BEDROCK_PRICING_DATA.metadata.version
      });
    } catch (error) {
      console.error('Failed to load pricing data:', error.message);
      this.lastError = error;
      throw error;
    }
  }

  /**
   * Get pricing information for a specific model with performance monitoring
   * @param {string} modelId - The model identifier
   * @param {string} region - AWS region (optional)
   * @returns {Object|null} - Pricing information or null if not found
   */
  getModelPricing(modelId, region = this.defaultRegion) {
    const timerId = performanceMonitor.startTimer('pricing_lookup');
    this.performanceStats.pricingLookups++;

    try {
      // First try to get pricing from cache
      if (this.pricingData.has(modelId)) {
        const cachedPricing = this.pricingData.get(modelId);
        // Return cached pricing if it's for the requested region or if using fallback
        if (cachedPricing.region === region || cachedPricing.fallbackUsed) {
          performanceMonitor.stopTimer('pricing_lookup', timerId);
          return cachedPricing;
        }
      }

      // If not in cache and region is different, try to load for that region
      if (region !== this.defaultRegion && getSupportedRegions().includes(region)) {
        const regionData = AWS_BEDROCK_PRICING_DATA.regions[region];
        if (regionData && regionData.models && regionData.models[modelId]) {
          const modelData = regionData.models[modelId];
          // Only return if model is available
          if (modelData.available !== false) {
            const pricing = {
              ...modelData,
              region,
              fallbackUsed: false
            };
            this.pricingData.set(modelId, pricing);
            performanceMonitor.stopTimer('pricing_lookup', timerId);
            return pricing;
          }
        }
      }

      // Try default region as fallback
      const defaultRegionData = AWS_BEDROCK_PRICING_DATA.regions[this.defaultRegion];
      if (defaultRegionData && defaultRegionData.models && defaultRegionData.models[modelId]) {
        const modelData = defaultRegionData.models[modelId];
        if (modelData.available !== false) {
          const pricing = {
            ...modelData,
            region: this.defaultRegion,
            fallbackUsed: region !== this.defaultRegion
          };
          this.pricingData.set(modelId, pricing);
          performanceMonitor.stopTimer('pricing_lookup', timerId);
          return pricing;
        }
      }

      performanceMonitor.stopTimer('pricing_lookup', timerId);
      return null;
    } catch (error) {
      console.warn(`Failed to get pricing for model ${modelId}:`, error.message);
      this.lastError = error;
      performanceMonitor.stopTimer('pricing_lookup', timerId);
      return null;
    }
  }

  /**
   * Generate cache key for cost calculation
   * @param {Object} usage - Token usage data
   * @param {string} modelId - The model identifier
   * @param {string} region - AWS region
   * @returns {string} - Cache key
   * @private
   */
  generateCalculationCacheKey(usage, modelId, region) {
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const toolTokens = usage.tool_tokens || 0;
    return `${modelId}:${region}:${inputTokens}:${outputTokens}:${toolTokens}`;
  }

  /**
   * Calculate cost based on token usage and model pricing with caching and performance monitoring
   * @param {Object} usage - Token usage data
   * @param {string} modelId - The model identifier
   * @param {string} region - AWS region (optional)
   * @returns {Object} - Cost calculation result
   */
  calculateCost(usage, modelId, region = this.defaultRegion) {
    const timerId = performanceMonitor.startTimer('cost_calculation');
    this.performanceStats.totalCalculations++;

    try {
      if (!usage || typeof usage !== 'object') {
        performanceMonitor.stopTimer('cost_calculation', timerId);
        return {
          inputCost: 0,
          outputCost: 0,
          toolCost: 0,
          totalCost: 0,
          currency: 'USD',
          isEstimated: true,
          error: 'Invalid usage data provided',
          cached: false,
          duration: 0
        };
      }

      // Check calculation cache first
      const cacheKey = this.generateCalculationCacheKey(usage, modelId, region);
      const cachedResult = this.calculationCache.get(cacheKey);

      if (cachedResult) {
        this.performanceStats.calculationCacheHits++;
        const duration = performanceMonitor.stopTimer('cost_calculation', timerId);
        return {
          ...cachedResult,
          cached: true,
          duration
        };
      }

      this.performanceStats.calculationCacheMisses++;

      const pricing = this.getModelPricing(modelId, region);
      if (!pricing) {
        const duration = performanceMonitor.stopTimer('cost_calculation', timerId);

        // Use enhanced error handling for missing pricing data
        const errorResult = handleCostCalculationError(
          new Error(`Pricing data not available for model ${modelId}`),
          { modelId, region, usage }
        );

        // Notify user about pricing data unavailability
        notificationManager.notifyCostCalculationError(
          errorResult.errorInfo,
          errorResult
        );

        return {
          ...errorResult,
          modelId,
          region,
          cached: false,
          duration
        };
      }

      // Extract token counts, defaulting to 0 if not provided
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const toolTokens = usage.tool_tokens || 0;

      // Calculate costs (pricing is per 1000 tokens) - optimized calculation
      const inputCost = this.calculateTokenCost(inputTokens, pricing.inputPrice);
      const outputCost = this.calculateTokenCost(outputTokens, pricing.outputPrice);
      const toolPrice = pricing.toolTokenPrice || pricing.inputPrice;
      const toolCost = this.calculateTokenCost(toolTokens, toolPrice);

      const totalCost = inputCost + outputCost + toolCost;

      // Determine if this is an estimate based on token source
      const isEstimated = usage.tokens_source === 'estimated' || usage.tokens_source === 'api';

      const result = {
        inputCost: this.roundCost(inputCost),
        outputCost: this.roundCost(outputCost),
        toolCost: this.roundCost(toolCost),
        totalCost: this.roundCost(totalCost),
        currency: pricing.currency,
        isEstimated,
        pricingDate: this.lastUpdated,
        modelId,
        region: pricing.region,
        provider: pricing.provider,
        error: null
      };

      // Check for stale pricing data
      if (this.isDataStale()) {
        result.show_stale_data_warning = true;

        // Notify about stale data if it's significantly old
        const dataAge = this.calculateDataAge(this.lastUpdated);
        if (dataAge > 30) { // More than 30 days old
          notificationManager.notifyPricingDataIssue({
            severity: 'warning',
            message: `Pricing data is ${dataAge} days old. Cost estimates may not reflect current rates.`,
            actions: ['Continue with estimates', 'Check AWS pricing page']
          });
        }
      }

      // Cache the result
      this.calculationCache.set(cacheKey, result);

      const duration = performanceMonitor.stopTimer('cost_calculation', timerId);
      return {
        ...result,
        cached: false,
        duration
      };
    } catch (error) {
      console.error(`Cost calculation failed for model ${modelId}:`, error.message);
      this.lastError = error;

      // Use enhanced error handling
      const errorResult = handleCostCalculationError(error, {
        modelId,
        region,
        usage
      });

      // Notify user about calculation error
      notificationManager.notifyCostCalculationError(
        errorResult.errorInfo,
        errorResult
      );

      const duration = performanceMonitor.stopTimer('cost_calculation', timerId);
      return {
        ...errorResult,
        modelId,
        region,
        cached: false,
        duration
      };
    }
  }

  /**
   * Optimized token cost calculation
   * @param {number} tokens - Number of tokens
   * @param {number} pricePerThousand - Price per 1000 tokens
   * @returns {number} - Calculated cost
   * @private
   */
  calculateTokenCost(tokens, pricePerThousand) {
    return (tokens / 1000) * pricePerThousand;
  }

  /**
   * Round cost to 6 decimal places for consistency
   * @param {number} cost - Cost to round
   * @returns {number} - Rounded cost
   * @private
   */
  roundCost(cost) {
    return Math.round(cost * 1000000) / 1000000;
  }

  /**
   * Update pricing data (for future use when pricing data source becomes dynamic)
   * Currently validates and reloads the static data
   */
  async updatePricingData() {
    try {
      // Validate pricing data before reloading
      const validation = validatePricingData(AWS_BEDROCK_PRICING_DATA);
      if (!validation.success) {
        throw new PricingValidationError(
          `Cannot update - pricing data validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Generate health report
      const healthReport = generatePricingHealthReport(AWS_BEDROCK_PRICING_DATA);

      // Reload the data
      await this.loadPricingData();

      const versionInfo = getPricingDataVersion();

      console.log('Pricing data updated successfully', {
        version: versionInfo.version,
        modelsCount: this.pricingData.size,
        healthScore: healthReport.validation.isValid ? 'Good' : 'Issues Found'
      });

      return {
        success: true,
        message: 'Pricing data updated successfully',
        version: versionInfo.version,
        lastUpdated: this.lastUpdated,
        modelsCount: this.pricingData.size,
        regionsSupported: getSupportedRegions().length,
        healthReport: healthReport.summary,
        validationWarnings: validation.warnings.length
      };
    } catch (error) {
      this.lastError = error;
      console.error('Failed to update pricing data:', error);

      return {
        success: false,
        message: `Failed to update pricing data: ${error.message}`,
        error: error
      };
    }
  }

  /**
   * Get all available models with pricing information
   * @param {string} region - AWS region (optional)
   * @returns {Array} - Array of models with pricing info
   */
  getAvailableModels(region = this.defaultRegion) {
    try {
      const models = [];

      for (const [modelId, pricing] of this.pricingData.entries()) {
        if (!region || pricing.region === region) {
          models.push({
            modelId,
            provider: pricing.provider,
            inputPrice: pricing.inputPrice,
            outputPrice: pricing.outputPrice,
            toolPrice: pricing.toolTokenPrice || pricing.inputPrice,
            currency: pricing.currency,
            region: pricing.region
          });
        }
      }

      return models.sort((a, b) => {
        // Sort by provider first, then by model name
        if (a.provider !== b.provider) {
          return a.provider.localeCompare(b.provider);
        }
        return a.modelId.localeCompare(b.modelId);
      });
    } catch (error) {
      console.error('Failed to get available models:', error.message);
      this.lastError = error;
      return [];
    }
  }

  /**
   * Check if the service is ready to use
   * @returns {boolean} - True if service is initialized and has pricing data
   */
  isReady() {
    return this.isInitialized && this.pricingData.size > 0;
  }

  /**
   * Get service status information including performance metrics
   * @returns {Object} - Status information
   */
  getStatus() {
    const versionInfo = getPricingDataVersion();
    const supportedRegions = getSupportedRegions();
    const cacheStats = this.calculationCache.getStats();
    const performanceMetrics = performanceMonitor.getMetrics('cost_calculation');

    return {
      initialized: this.isInitialized,
      ready: this.isReady(),
      modelsLoaded: this.pricingData.size,
      lastUpdated: this.lastUpdated,
      pricingVersion: versionInfo.version,
      pricingDataAge: this.calculateDataAge(versionInfo.lastUpdated),
      defaultRegion: this.defaultRegion,
      lastError: this.lastError?.message || null,
      supportedRegions: supportedRegions,
      regionsCount: supportedRegions.length,
      dataSource: versionInfo.dataSource,
      nextReviewDate: versionInfo.nextReviewDate,
      performance: {
        ...this.performanceStats,
        calculationCacheHitRate: this.performanceStats.totalCalculations > 0
          ? Math.round((this.performanceStats.calculationCacheHits / this.performanceStats.totalCalculations) * 100)
          : 0,
        avgCalculationTime: performanceMetrics?.avgTime || null,
        recentAvgTime: performanceMetrics?.recentAvg || null
      },
      cache: {
        ...cacheStats,
        memoryUsageMB: Math.round(this.calculationCache.getMemoryUsage() / 1024 / 1024 * 100) / 100
      }
    };
  }

  /**
   * Check if performance requirements are met
   * @returns {Object} - Performance check result
   */
  checkPerformanceRequirements() {
    const requirements = {
      maxAvgCalculationTime: 10, // 10ms for cost calculations
      minCacheHitRate: 60, // 60% cache hit rate for cost calculations
      maxMemoryUsageMB: 10 // 10MB memory limit for calculation cache
    };

    const status = this.getStatus();
    const performanceCheck = performanceMonitor.checkPerformanceRequirements(
      'cost_calculation',
      requirements.maxAvgCalculationTime,
      requirements.maxAvgCalculationTime
    );

    const cacheHitRate = status.performance.calculationCacheHitRate;
    const memoryUsage = status.cache.memoryUsageMB;

    const checks = {
      calculationSpeed: performanceCheck.passed,
      cacheEfficiency: cacheHitRate >= requirements.minCacheHitRate,
      memoryUsage: memoryUsage <= requirements.maxMemoryUsageMB
    };

    const allPassed = Object.values(checks).every(check => check);

    return {
      passed: allPassed,
      requirements,
      actual: {
        avgCalculationTime: performanceCheck.avgTime,
        cacheHitRate,
        memoryUsageMB: memoryUsage
      },
      checks,
      recommendations: this.generatePerformanceRecommendations(checks, status)
    };
  }

  /**
   * Generate performance recommendations
   * @param {Object} checks - Performance check results
   * @param {Object} status - Service status
   * @returns {Array} - Array of recommendations
   * @private
   */
  generatePerformanceRecommendations(checks, status) {
    const recommendations = [];

    if (!checks.calculationSpeed) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: `Cost calculation is slower than 10ms (avg: ${status.performance.avgCalculationTime}ms). Consider optimizing calculation logic.`
      });
    }

    if (!checks.cacheEfficiency) {
      recommendations.push({
        type: 'cache',
        priority: 'medium',
        message: `Calculation cache hit rate is low (${status.performance.calculationCacheHitRate}%). Consider increasing cache size.`
      });
    }

    if (!checks.memoryUsage) {
      recommendations.push({
        type: 'memory',
        priority: 'medium',
        message: `Cache memory usage is high (${status.cache.memoryUsageMB}MB). Consider reducing cache size.`
      });
    }

    return recommendations;
  }

  /**
   * Calculate age of pricing data in days
   * @param {string} lastUpdated - ISO date string
   * @returns {number|null} - Age in days or null if invalid date
   */
  calculateDataAge(lastUpdated) {
    try {
      if (!lastUpdated) return null;
      const updated = new Date(lastUpdated);
      const now = new Date();
      return Math.floor((now - updated) / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }

  /**
   * Check if pricing data is considered stale
   * @returns {boolean} - True if data is stale
   */
  isDataStale() {
    const dataAge = this.calculateDataAge(this.lastUpdated);
    return dataAge !== null && dataAge > 7; // Consider stale if older than 7 days
  }

  /**
   * Clear pricing data cache
   */
  clearPricingCache() {
    this.pricingData.clear();
    performanceMonitor.recordMemorySnapshot('pricing_cache_cleared');
    console.log('Pricing cache cleared');
  }

  /**
   * Clear calculation cache
   */
  clearCalculationCache() {
    this.calculationCache.clear();
    performanceMonitor.recordMemorySnapshot('calculation_cache_cleared');
    console.log('Calculation cache cleared');
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this.clearPricingCache();
    this.clearCalculationCache();
  }

  /**
   * Get performance report for the service
   * @returns {Object} - Performance report
   */
  getPerformanceReport() {
    const status = this.getStatus();
    const performanceCheck = this.checkPerformanceRequirements();
    const memorySnapshots = performanceMonitor.getMemorySnapshots(5);

    return {
      timestamp: new Date().toISOString(),
      service: 'CostCalculationService',
      status,
      performanceCheck,
      memorySnapshots,
      recommendations: performanceCheck.recommendations
    };
  }

  /**
   * Get comprehensive pricing health report
   * @returns {Object} - Detailed health report
   */
  getPricingHealthReport() {
    try {
      return generatePricingHealthReport(AWS_BEDROCK_PRICING_DATA);
    } catch (error) {
      console.error('Failed to generate pricing health report:', error);
      return {
        summary: { error: 'Failed to generate report' },
        validation: { isValid: false, errors: [error.message] },
        statistics: {},
        recommendations: ['Fix pricing data issues before generating report']
      };
    }
  }

  /**
   * Get regional pricing information
   * @param {string} region - AWS region code
   * @returns {Object|null} - Regional pricing info or null if not found
   */
  getRegionalPricingInfo(region) {
    try {
      const regionInfo = getRegionInfo(region);
      if (!regionInfo) return null;

      const regionData = AWS_BEDROCK_PRICING_DATA.regions[region];
      if (!regionData) return null;

      const models = Object.entries(regionData.models || {})
        .filter(([, model]) => model.available !== false)
        .map(([modelId, model]) => ({
          modelId,
          name: model.name,
          provider: model.provider,
          inputPrice: model.inputPrice,
          outputPrice: model.outputPrice,
          currency: model.currency
        }));

      return {
        region: regionInfo.code,
        name: regionInfo.name,
        modelCount: models.length,
        models: models.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name)),
        lastUpdated: regionData.lastUpdated || AWS_BEDROCK_PRICING_DATA.metadata.lastUpdated
      };
    } catch (error) {
      console.error(`Failed to get regional pricing info for ${region}:`, error);
      return null;
    }
  }

  /**
   * Compare pricing across regions for a specific model
   * @param {string} modelId - Model identifier
   * @returns {Object} - Pricing comparison across regions
   */
  compareModelPricingAcrossRegions(modelId) {
    try {
      const comparison = {
        modelId,
        regions: [],
        priceVariation: {
          input: { min: null, max: null, variation: 0 },
          output: { min: null, max: null, variation: 0 }
        }
      };

      const inputPrices = [];
      const outputPrices = [];

      for (const [regionCode, regionData] of Object.entries(AWS_BEDROCK_PRICING_DATA.regions)) {
        if (regionData.models && regionData.models[modelId]) {
          const model = regionData.models[modelId];
          if (model.available !== false) {
            const regionInfo = {
              region: regionCode,
              name: regionData.name,
              inputPrice: model.inputPrice,
              outputPrice: model.outputPrice,
              currency: model.currency,
              available: model.available !== false
            };

            comparison.regions.push(regionInfo);
            inputPrices.push(model.inputPrice);
            outputPrices.push(model.outputPrice);
          }
        }
      }

      // Calculate price variations
      if (inputPrices.length > 0) {
        comparison.priceVariation.input.min = Math.min(...inputPrices);
        comparison.priceVariation.input.max = Math.max(...inputPrices);
        comparison.priceVariation.input.variation =
          comparison.priceVariation.input.min > 0
            ? (comparison.priceVariation.input.max - comparison.priceVariation.input.min) / comparison.priceVariation.input.min
            : 0;
      }

      if (outputPrices.length > 0) {
        comparison.priceVariation.output.min = Math.min(...outputPrices);
        comparison.priceVariation.output.max = Math.max(...outputPrices);
        comparison.priceVariation.output.variation =
          comparison.priceVariation.output.min > 0
            ? (comparison.priceVariation.output.max - comparison.priceVariation.output.min) / comparison.priceVariation.output.min
            : 0;
      }

      return comparison;
    } catch (error) {
      console.error(`Failed to compare pricing for model ${modelId}:`, error);
      return {
        modelId,
        regions: [],
        priceVariation: { input: {}, output: {} },
        error: error.message
      };
    }
  }

  /**
   * Get models by provider with pricing information
   * @param {string} provider - Provider name
   * @param {string} region - AWS region (optional)
   * @returns {Array} - Array of models from the provider
   */
  getModelsByProvider(provider, region = this.defaultRegion) {
    try {
      const regionData = AWS_BEDROCK_PRICING_DATA.regions[region];
      if (!regionData || !regionData.models) return [];

      return Object.entries(regionData.models)
        .filter(([, model]) => model.provider === provider && model.available !== false)
        .map(([modelId, model]) => ({
          modelId,
          name: model.name,
          provider: model.provider,
          inputPrice: model.inputPrice,
          outputPrice: model.outputPrice,
          currency: model.currency,
          region,
          lastUpdated: model.lastUpdated
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error(`Failed to get models for provider ${provider}:`, error);
      return [];
    }
  }

  /**
   * Validate pricing data integrity
   * @returns {Object} - Validation result
   */
  validatePricingDataIntegrity() {
    try {
      return validatePricingData(AWS_BEDROCK_PRICING_DATA);
    } catch (error) {
      return {
        success: false,
        errors: [`Validation failed: ${error.message}`],
        warnings: [],
        summary: { totalErrors: 1, totalWarnings: 0 }
      };
    }
  }

  /**
   * Get pricing data metadata and version information
   * @returns {Object} - Metadata information
   */
  getPricingMetadata() {
    return {
      ...getPricingDataVersion(),
      supportedRegions: getSupportedRegions().length,
      totalModels: this.getTotalUniqueModels(),
      serviceStatus: this.getStatus()
    };
  }

  /**
   * Get total number of unique models across all regions
   * @returns {number} - Total unique model count
   */
  getTotalUniqueModels() {
    const uniqueModels = new Set();

    for (const regionData of Object.values(AWS_BEDROCK_PRICING_DATA.regions)) {
      if (regionData.models) {
        Object.keys(regionData.models).forEach(modelId => uniqueModels.add(modelId));
      }
    }

    return uniqueModels.size;
  }

  /**
   * Cleanup resources when service is no longer needed
   */
  cleanup() {
    this.clearAllCaches();
    this.isInitialized = false;
    this.lastError = null;
    this.lastUpdated = null;
    this.performanceStats = {
      calculationCacheHits: 0,
      calculationCacheMisses: 0,
      totalCalculations: 0,
      pricingLookups: 0
    };
    performanceMonitor.recordMemorySnapshot('service_cleanup');
  }
}

// Export a singleton instance
export const costCalculationService = new CostCalculationService();
