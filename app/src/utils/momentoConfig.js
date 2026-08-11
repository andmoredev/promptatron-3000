/**
 * Momento SDK Configuration Utility
 *
 * Provides simple setup and fallback behavior for Momento caching.
 * When VITE_MOMENTO_API_KEY is not available, all operations gracefully degrade.
 */

let momentoClient = null;
let momentoEnabled = false;

/**
 * Initialize Momento client if API key is available
 * @returns {Promise<boolean>} True if Momento is enabled and ready
 */
export async function initializeMomento() {
  // Check if VITE_MOMENTO_API_KEY environment variable is present
  const apiKey = import.meta.env.VITE_MOMENTO_API_KEY;

  if (!apiKey) {
    console.log('VITE_MOMENTO_API_KEY not found - caching and rate limiting disabled');
    momentoEnabled = false;
    return false;
  }

  try {
    // Dynamically import Momento SDK
    const { CacheClient, Configurations, CredentialProvider } = await import('@gomomento/sdk-web');

    // Create Momento client
    momentoClient = new CacheClient({
      configuration: Configurations.Laptop.v1(),
      credentialProvider: CredentialProvider.fromString({
        apiKey: apiKey
      }),
      defaultTtlSeconds: 300 // 5 minutes default TTL
    });

    momentoEnabled = true;
    console.log('Momento client initialized successfully');
    return true;
  } catch (error) {
    console.warn('Failed to initialize Momento client:', error.message);
    momentoEnabled = false;
    momentoClient = null;
    return false;
  }
}

/**
 * Check if Momento is enabled and available
 * @returns {boolean} True if Momento is ready for use
 */
export function isMomentoEnabled() {
  return momentoEnabled && momentoClient !== null;
}

/**
 * Get the Momento client instance
 * @returns {Object|null} Momento client or null if not available
 */
export function getMomentoClient() {
  return momentoClient;
}

/**
 * Get current minute timestamp for rate limiting keys
 * @returns {string} Current minute in format YYYY-MM-DD-HH-MM
 */
export function getCurrentMinute() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}-${hour}-${minute}`;
}

/**
 * Simple cache key generator for shipping tools
 * @param {string} toolName - Name of the tool
 * @param {string} orderId - Order ID or identifier
 * @returns {string} Cache key
 */
export function generateCacheKey(toolName, orderId) {
  return `shipping:${toolName}:${orderId}`;
}

/**
 * Get the configured cache name from environment variable
 * @returns {string} Cache name to use for Momento operations
 */
export function getCacheName() {
  const cacheName = import.meta.env.VITE_CACHE_NAME || 'promptatron';
  console.log(`Momento cache name: ${cacheName}`);
  return cacheName;
}

/**
 * Get the configured app name for storage keys
 * @returns {string} App name to use for localStorage keys
 */
export function getAppName() {
  return import.meta.env.VITE_APP_NAME || import.meta.env.VITE_CACHE_NAME || 'promptatron';
}

/**
 * Generate a storage key with the configured app prefix
 * @param {string} key - The key suffix
 * @returns {string} Full storage key with app prefix
 */
export function generateStorageKey(key) {
  return `${getAppName()}_${key}`;
}

/**
 * Simple rate limit key generator
 * @returns {string} Rate limit key for current minute
 */
export function generateRateLimitKey() {
  return `rate_limit:shipping:${getCurrentMinute()}`;
}

// Auto-initialize when module is loaded
initializeMomento().catch(error => {
  console.warn('Auto-initialization of Momento failed:', error.message);
});
