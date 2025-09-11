/**
 * Utility functions for service worker communication
 * Provides helper functions for managing service worker interactions
 */

/**
 * Check if service workers are supported in the current browser
 */
export function isServiceWorkerSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Register a service worker with error handling
 */
export async function registerServiceWorker(scriptURL, options = {}) {
  if (!isServiceWorkerSupported()) {
    throw new Error('Service Workers are not supported in this browser')
  }

  try {
    const registration = await navigator.serviceWorker.register(scriptURL, options)
    console.log('Service Worker registered successfully:', registration)
    return registration
  } catch (error) {
    console.error('Service Worker registration failed:', error)
    throw error
  }
}

/**
 * Wait for service worker to be ready and active
 */
export async function waitForServiceWorker(registration) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Service Worker activation timeout'))
    }, 10000) // 10 second timeout

    function checkServiceWorker() {
      if (registration.active) {
        clearTimeout(timeout)
        resolve(registration.active)
      } else if (registration.installing) {
        registration.installing.addEventListener('statechange', function() {
          if (this.state === 'activated') {
            clearTimeout(timeout)
            resolve(registration.active)
          } else if (this.state === 'redundant') {
            clearTimeout(timeout)
            reject(new Error('Service Worker became redundant'))
          }
        })
      } else {
        // Check again in a short while
        setTimeout(checkServiceWorker, 100)
      }
    }

    checkServiceWorker()
  })
}

/**
 * Send a message to service worker and wait for response using MessageChannel
 */
export function sendMessageToServiceWorker(serviceWorker, message, timeout = 5000) {
  return new Promise((resolve, reject) => {
    // Create a message channel for this communication
    const channel = new MessageChannel()

    // Set up timeout
    const timeoutId = setTimeout(() => {
      reject(new Error('Service Worker message timeout'))
    }, timeout)

    // Listen for response
    channel.port1.onmessage = (event) => {
      clearTimeout(timeoutId)
      const { type, payload, error } = event.data

      if (error) {
        reject(new Error(error))
      } else {
        resolve({ type, payload })
      }
    }

    // Send message with the port
    serviceWorker.postMessage(message, [channel.port2])
  })
}

/**
 * Create a message listener for service worker broadcasts
 */
export function createServiceWorkerListener(callback) {
  if (!isServiceWorkerSupported()) {
    console.warn('Service Workers not supported - listener not created')
    return () => {} // Return empty cleanup function
  }

  const messageHandler = (event) => {
    try {
      callback(event.data)
    } catch (error) {
      console.error('Error in service worker message handler:', error)
    }
  }

  navigator.serviceWorker.addEventListener('message', messageHandler)

  // Return cleanup function
  return () => {
    navigator.serviceWorker.removeEventListener('message', messageHandler)
  }
}

/**
 * Get service worker registration by scope
 */
export async function getServiceWorkerRegistration(scope = '/') {
  if (!isServiceWorkerSupported()) {
    return null
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    return registrations.find(reg => reg.scope.endsWith(scope)) || null
  } catch (error) {
    console.error('Failed to get service worker registrations:', error)
    return null
  }
}

/**
 * Unregister a service worker
 */
export async function unregisterServiceWorker(registration) {
  if (!registration) {
    return false
  }

  try {
    const result = await registration.unregister()
    console.log('Service Worker unregistered:', result)
    return result
  } catch (error) {
    console.error('Failed to unregister service worker:', error)
    return false
  }
}

/**
 * Check if a service worker is active and ready
 */
export function isServiceWorkerActive(registration) {
  return registration && registration.active && registration.active.state === 'activated'
}

/**
 * Get browser compatibility information for service workers
 */
export function getServiceWorkerCompatibility() {
  const isSupported = isServiceWorkerSupported()
  const userAgent = navigator.userAgent

  let reason, recommendation, fallbackAvailable = false

  if (isSupported) {
    reason = 'Service Workers are fully supported'
    recommendation = null
  } else {
    reason = 'Service Workers are not supported in this browser'

    // Detect browser and provide specific recommendations
    if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) {
      recommendation = 'Safari supports Service Workers in version 11.1+. Please update Safari or use Chrome/Firefox.'
      fallbackAvailable = typeof Worker !== 'undefined'
    } else if (/Firefox/.test(userAgent)) {
      recommendation = 'Firefox supports Service Workers in version 44+. Please update Firefox.'
      fallbackAvailable = typeof Worker !== 'undefined'
    } else if (/Chrome/.test(userAgent)) {
      recommendation = 'Chrome supports Service Workers in version 40+. Please update Chrome.'
      fallbackAvailable = typeof Worker !== 'undefined'
    } else if (/Edg/.test(userAgent)) {
      recommendation = 'Edge supports Service Workers in version 17+. Please update Edge.'
      fallbackAvailable = typeof Worker !== 'undefined'
    } else if (/MSIE|Trident/.test(userAgent)) {
      recommendation = 'Internet Explorer does not support Service Workers. Please use Chrome, Firefox, Safari, or Edge.'
      fallbackAvailable = false
    } else {
      recommendation = 'Please use a modern browser like Chrome, Firefox, Safari, or Edge'
      fallbackAvailable = typeof Worker !== 'undefined'
    }
  }

  return {
    supported: isSupported,
    reason,
    recommendation,
    fallbackAvailable,
    hasWebWorkers: typeof Worker !== 'undefined',
    browserInfo: {
      userAgent,
      isChrome: /Chrome/.test(userAgent) && /Google Inc/.test(navigator.vendor || ''),
      isFirefox: /Firefox/.test(userAgent),
      isSafari: /Safari/.test(userAgent) && /Apple Computer/.test(navigator.vendor || ''),
      isEdge: /Edg/.test(userAgent),
      isIE: /MSIE|Trident/.test(userAgent)
    }
  }
}
