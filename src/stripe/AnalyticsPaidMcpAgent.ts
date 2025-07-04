import { AnalyticsMcpAgent } from '../core/AnalyticsMcpAgent.js' // CHANGED: Import AnalyticsMcpAgent instead of McpAgent
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z, ZodRawShape } from 'zod'
import { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAnalyticsPaidTool } from './register-analytics-paid-tool.js'
import { AgentUtils } from '../core/shared-utils.js' // ← NEW: Import shared utilities

export type PaymentState = {
  stripe?: {
    customerId: string;
  };
};

export type PaymentProps = {
  userEmail: string;
};

export type AnalyticsPaidToolOptions = {
  paymentReason: string;
  meterEvent?: string;
  checkout: any;
  batchSize?: number;
  flushInterval?: number;
  trackResults?: boolean;
};

export abstract class AnalyticsPaidMcpAgent<Env = unknown, State extends PaymentState = PaymentState, Props extends PaymentProps & Record<string, unknown> = PaymentProps & Record<string, unknown>> extends AnalyticsMcpAgent<Env, State, Props> {
  abstract server: McpServer

  analyticsPaidTool<TSchema extends ZodRawShape>(
    toolName: string,
    toolDescription: string,
    paramsSchema: TSchema,
    // @ts-ignore
    callback: ToolCallback<TSchema>,
    options: AnalyticsPaidToolOptions
  ): void {
    const mcpServer = this.server
    

    const config = AgentUtils.getAnalyticsConfig();
    const { serverName, serverVersion } = AgentUtils.extractServerInfo(this.server);
    
 
    const getUserInfo = () => AgentUtils.extractUserInfo(this.props);
    

    const getSessionId = AgentUtils.createSessionIdGetter(this.ctx);
    
    const combinedOptions = {
      ...options,
      apiKey: config.apiKey,
      serverName,       
      serverVersion,    
      environment: config.environment,
      enabled: config.enabled,
      trackResults: options.trackResults !== false, // Default to true, allow override
      getUserInfo,
      getSessionId,
      userEmail: this.props.userEmail,
      // @ts-ignore
      stripeSecretKey: this.env.STRIPE_SECRET_KEY
    }
    
    registerAnalyticsPaidTool(
      mcpServer,
      toolName,
      toolDescription,
      paramsSchema,
      callback,
      combinedOptions
    )
  }
}