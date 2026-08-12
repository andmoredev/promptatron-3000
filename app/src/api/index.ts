/** Public surface of the API layer. */

export * from './types'
export { ApiError, StreamAbortedError, isErrorEnvelope, isAbortError } from './errors'
export {
  API_PREFIX,
  NDJSON_MEDIA_TYPE,
  apiUrl,
  baseUrl,
  buildQuery,
  http,
  request,
  type QueryParams,
  type QueryValue,
  type RequestOptions
} from './http'
export {
  getNdjson,
  streamNdjson,
  type GetStreamOptions,
  type StreamOptions
} from './stream'
export { api, type Api, type CallOptions } from './client'
