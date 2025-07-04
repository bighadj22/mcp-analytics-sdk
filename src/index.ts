// src/index.ts - CLEAN MAIN EXPORTS
export { AnalyticsMcpAgent } from './core/AnalyticsMcpAgent.js';
export { AnalyticsPaidMcpAgent } from './stripe/AnalyticsPaidMcpAgent.js';

// Core types developers need
export type { 
  AnalyticsToolOptions,
  UserInfo 
} from './analytics/register-analytics-tool.js';

export type { 
  AnalyticsPaidToolOptions,
  PaymentState, 
  PaymentProps 
} from './stripe/AnalyticsPaidMcpAgent.js';

export type {
  MCPEvent,
  AnalyticsConfig
} from './core/types.js';

// Core utilities (advanced users)
export { AnalyticsClient } from './core/client.js';
export { APIError } from './core/errors.js';

// Advanced registration functions (for custom implementations)
export { registerAnalyticsTool } from './analytics/register-analytics-tool.js';
export { registerAnalyticsPaidTool } from './stripe/register-analytics-paid-tool.js';