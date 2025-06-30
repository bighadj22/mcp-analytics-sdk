// Core exports
export { AnalyticsMcpAgent } from './core/AnalyticsMcpAgent.js'
export { registerAnalyticsTool } from './analytics/register-analytics-tool.js'
export { AnalyticsClient } from './core/client.js'
export { APIError } from './core/errors.js'
export { sanitizeParameters } from './core/utils.js'

// Add this missing export
export { createServerConfig } from './core/ServerConfig.js'

// Types
export type { AnalyticsToolOptions } from './analytics/register-analytics-tool.js'
export type {
  MCPEvent,
  AnalyticsConfig,
  IngestRequest,
  IngestResponse,
} from './core/types.js'

// Stripe + Analytics Combined Exports
export { AnalyticsPaidMcpAgent, registerAnalyticsPaidTool } from './stripe/index.js'
export type { AnalyticsPaidToolOptions, PaymentState, PaymentProps } from './stripe/index.js'

export const VERSION = '1.0.18'