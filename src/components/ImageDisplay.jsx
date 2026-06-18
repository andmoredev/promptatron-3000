import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import LoadingSpinner from './LoadingSpinner'

const ImageDisplay = ({
  imageResult,
  verificationResults,
  onRegenerate,
  onSaveToHistory,
  isLoading,
  error
}) => {
  const [imageError, setImageError] = useState(false)
  const [isImageLoading, setIsImageLoading] = useState(true)

  const handleImageLoad = useCallback(() => {
    setIsImageLoading(false)
    setImageError(false)
  }, [])

  const handleImageError = useCallback(() => {
    setIsImageLoading(false)
    setImageError(true)
  }, [])

  const handleDownload = useCallback(() => {
    if (!imageResult?.imageData) return

    try {
      // Create download link for base64 image
      const link = document.createElement('a')
      link.href = `data:image/png;base64,${imageResult.imageData}`
      link.download = `generated-image-${imageResult.id || Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Failed to download image:', error)
    }
  }, [imageResult])

  const handleCopyToClipboard = useCallback(async () => {
    if (!imageResult?.imageData) return

    try {
      // Convert base64 to blob
      const response = await fetch(`data:image/png;base64,${imageResult.imageData}`)
      const blob = await response.blob()

      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ])
    } catch (error) {
      console.error('Failed to copy image to clipboard:', error)
      // Fallback: copy the base64 data URL
      try {
        await navigator.clipboard.writeText(`data:image/png;base64,${imageResult.imageData}`)
      } catch (fallbackError) {
        console.error('Failed to copy image data to clipboard:', fallbackError)
      }
    }
  }, [imageResult])

  const formatGenerationTime = useCallback((time) => {
    if (!time) return 'Unknown'
    if (time < 1000) return `${Math.round(time)}ms`
    return `${(time / 1000).toFixed(1)}s`
  }, [])

  const formatTimestamp = useCallback((timestamp) => {
    if (!timestamp) return 'Unknown'
    try {
      return new Date(timestamp).toLocaleString()
    } catch (error) {
      return 'Invalid date'
    }
  }, [])

  if (isLoading) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">Generated Image</h3>
        </div>
        <div className="card-body">
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" text="Generating image..." />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">Generated Image</h3>
        </div>
        <div className="card-body">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Image Generation Failed</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!imageResult) {
    return (
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">Generated Image</h3>
        </div>
        <div className="card-body">
          <div className="text-center py-12">
            <div className="text-gray-400 mb-2">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">
              Generated images will appear here
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Generated Image</h3>
          <div className="flex items-center space-x-2">
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                title="Generate another image with the same parameters"
              >
                Regenerate
              </button>
            )}
            <button
              onClick={handleDownload}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              title="Download image"
            >
              Download
            </button>
            <button
              onClick={handleCopyToClipboard}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              title="Copy image to clipboard"
            >
              Copy
            </button>
            {onSaveToHistory && (
              <button
                onClick={() => onSaveToHistory(imageResult)}
                className="text-sm text-green-600 hover:text-green-700 font-medium"
                title="Save to history"
              >
                Save
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card-body space-y-4">
        {/* Image Container */}
        <div className="relative bg-gray-50 rounded-lg overflow-hidden">
          {isImageLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <LoadingSpinner size="md" text="Loading image..." />
            </div>
          )}

          {imageError ? (
            <div className="flex items-center justify-center py-12 bg-gray-100">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">Failed to load image</p>
              </div>
            </div>
          ) : (
            <img
              src={`data:image/png;base64,${imageResult.imageData}`}
              alt={imageResult.prompt || 'Generated image'}
              className={`w-full h-auto max-w-full transition-opacity duration-200 ${
                isImageLoading ? 'opacity-0' : 'opacity-100'
              }`}
              style={{
                aspectRatio: imageResult.parameters ?
                  `${imageResult.parameters.width}/${imageResult.parameters.height}` :
                  'auto'
              }}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}
        </div>

        {/* Image Metadata */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Image Details</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {/* Prompt */}
            <div className="md:col-span-2">
              <dt className="font-medium text-gray-700">Prompt</dt>
              <dd className="mt-1 text-gray-600 break-words">
                {imageResult.prompt || 'No prompt available'}
              </dd>
            </div>

            {/* Model */}
            <div>
              <dt className="font-medium text-gray-700">Model</dt>
              <dd className="mt-1 text-gray-600">
                {imageResult.modelInfo?.name || imageResult.modelId || 'Unknown'}
              </dd>
            </div>

            {/* Generation Time */}
            <div>
              <dt className="font-medium text-gray-700">Generation Time</dt>
              <dd className="mt-1 text-gray-600">
                {formatGenerationTime(imageResult.generationTime)}
              </dd>
            </div>

            {/* Dimensions */}
            {imageResult.parameters && (
              <div>
                <dt className="font-medium text-gray-700">Dimensions</dt>
                <dd className="mt-1 text-gray-600">
                  {imageResult.parameters.width} × {imageResult.parameters.height}
                </dd>
              </div>
            )}

            {/* Quality */}
            {imageResult.parameters?.quality && (
              <div>
                <dt className="font-medium text-gray-700">Quality</dt>
                <dd className="mt-1 text-gray-600 capitalize">
                  {imageResult.parameters.quality}
                </dd>
              </div>
            )}

            {/* Seed */}
            {imageResult.seed !== undefined && (
              <div>
                <dt className="font-medium text-gray-700">Seed</dt>
                <dd className="mt-1 text-gray-600 font-mono text-xs">
                  {imageResult.seed}
                </dd>
              </div>
            )}

            {/* Timestamp */}
            <div>
              <dt className="font-medium text-gray-700">Generated</dt>
              <dd className="mt-1 text-gray-600">
                {formatTimestamp(imageResult.timestamp)}
              </dd>
            </div>
          </div>
        </div>

        {/* Verification Results */}
        {verificationResults && (
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Verification Status</h4>

            {verificationResults.isVerifying ? (
              <div className="flex items-center space-x-2">
                <LoadingSpinner size="sm" inline />
                <span className="text-sm text-gray-600">Running verification checks...</span>
              </div>
            ) : verificationResults.error ? (
              <div className="text-sm text-red-600">
                Verification failed: {verificationResults.error}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Overall Status */}
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-700">Overall Status:</span>
                  <span className={`text-sm font-medium ${
                    verificationResults.summary?.overallRecommendation === 'accept' ? 'text-green-600' :
                    verificationResults.summary?.overallRecommendation === 'warning' ? 'text-yellow-600' :
                    verificationResults.summary?.overallRecommendation === 'reject' ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {verificationResults.summary?.overallRecommendation === 'accept' ? '✓ Approved' :
                     verificationResults.summary?.overallRecommendation === 'warning' ? '⚠ Warning' :
                     verificationResults.summary?.overallRecommendation === 'reject' ? '✗ Rejected' :
                     'Pending'}
                  </span>
                </div>

                {/* Quick Summary */}
                {verificationResults.summary?.message && (
                  <p className="text-sm text-gray-600">{verificationResults.summary.message}</p>
                )}

                {/* Verification Count */}
                <div className="text-xs text-gray-500">
                  {verificationResults.summary?.successfulVerifications ||
                   Object.keys(verificationResults.results || {}).filter(key =>
                     ['contentSafety', 'promptAdherence', 'imageQuality'].includes(key)
                   ).length} verification checks completed
                </div>
              </div>
            )}
          </div>
        )}

        {/* Technical Information (Collapsible) */}
        <details className="bg-gray-50 rounded-lg">
          <summary className="p-3 cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
            Technical Information
          </summary>
          <div className="px-3 pb-3 text-xs text-gray-600 space-y-2">
            <div>
              <span className="font-medium">Image ID:</span> {imageResult.id || 'Not available'}
            </div>
            {imageResult.modelId && (
              <div>
                <span className="font-medium">Model ID:</span> {imageResult.modelId}
              </div>
            )}
            {imageResult.parameters && (
              <div>
                <span className="font-medium">Parameters:</span>
                <pre className="mt-1 text-xs bg-white p-2 rounded border overflow-x-auto">
                  {JSON.stringify(imageResult.parameters, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  )
}

ImageDisplay.propTypes = {
  imageResult: PropTypes.shape({
    id: PropTypes.string,
    imageData: PropTypes.string.isRequired,
    prompt: PropTypes.string,
    modelId: PropTypes.string,
    modelInfo: PropTypes.object,
    parameters: PropTypes.object,
    seed: PropTypes.number,
    generationTime: PropTypes.number,
    timestamp: PropTypes.string
  }),
  verificationResults: PropTypes.shape({
    isVerifying: PropTypes.bool,
    error: PropTypes.string,
    overallRecommendation: PropTypes.oneOf(['accept', 'warning', 'reject']),
    summary: PropTypes.string,
    contentSafety: PropTypes.object,
    promptAdherence: PropTypes.object,
    imageQuality: PropTypes.object
  }),
  onRegenerate: PropTypes.func,
  onSaveToHistory: PropTypes.func,
  isLoading: PropTypes.bool,
  error: PropTypes.string
}

ImageDisplay.defaultProps = {
  imageResult: null,
  verificationResults: null,
  onRegenerate: null,
  onSaveToHistory: null,
  isLoading: false,
  error: null
}

export default ImageDisplay