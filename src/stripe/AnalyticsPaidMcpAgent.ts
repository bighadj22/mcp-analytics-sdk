import { AnalyticsMcpAgent } from '../core/AnalyticsMcpAgent.js' // CHANGED: Import AnalyticsMcpAgent instead of McpAgent
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z, ZodRawShape } from 'zod'
import { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAnalyticsPaidTool } from './register-analytics-paid-tool.js'
import { env } from "cloudflare:workers"

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
  trackResults?: boolean; // ← NEW: Added result tracking option
};

export abstract class AnalyticsPaidMcpAgent<Env = unknown, State extends PaymentState = PaymentState, Props extends PaymentProps & Record<string, unknown> = PaymentProps & Record<string, unknown>> extends AnalyticsMcpAgent<Env, State, Props> { // CHANGED: Extend AnalyticsMcpAgent instead of McpAgent
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
    
    const globalEnv = env as any
    const apiKey = process.env.MCP_ANALYTICS_API_KEY || globalEnv.MCP_ANALYTICS_API_KEY
    
    // ← NEW: Extract server metadata from McpServer instance (same as AnalyticsMcpAgent)
    const getServerInfo = () => {
      const serverInfo = (this.server as any)?.server?._serverInfo
      return {
        serverName: serverInfo?.name,
        serverVersion: serverInfo?.version
      }
    }
    
    const { serverName, serverVersion } = getServerInfo()
    
    const environment = process.env.ENVIRONMENT || globalEnv.ENVIRONMENT || 'development'
    const analyticsEnabled = (process.env.MCP_ANALYTICS_ENABLED || globalEnv.MCP_ANALYTICS_ENABLED) !== 'false'
    
    // Extract user information from OAuth provider props (same as AnalyticsMcpAgent)
    const getUserInfo = () => {
      if (!this.props) {
        return {
          userId: undefined,
          email: undefined,
          username: undefined
        }
      }
      
      const safeString = (value: unknown): string | undefined => {
        if (value === null || value === undefined || value === '') return undefined
        const str = String(value).trim()
        return str === '' ? undefined : str
      }
      
      const props = this.props;
      
      let userId: string | undefined;
      let email: string | undefined;
      let username: string | undefined;
      
      // userId extraction - priority order from most specific to general
      if (props.userId) {
        userId = safeString(props.userId);
      } else if (props.sub) {
        userId = safeString(props.sub);
      } else if (props.claims && typeof props.claims === 'object') {
        const claims = props.claims as any;
        if (claims.sub) {
          userId = safeString(claims.sub);
        }
      } else if (props.user && typeof props.user === 'object') {
        const user = props.user as any;
        if (user.id) {
          userId = safeString(user.id);
        }
      } else if (props.login) {
        userId = safeString(props.login);
      }
      
      // email extraction
      if (props.email) {
        email = safeString(props.email);
      } else if (props.userEmail) {
        email = safeString(props.userEmail);
      } else if (props.claims && typeof props.claims === 'object') {
        const claims = props.claims as any;
        if (claims.email) {
          email = safeString(claims.email);
        }
      } else if (props.user && typeof props.user === 'object') {
        const user = props.user as any;
        if (user.email) {
          email = safeString(user.email);
        }
      }
      
      // username extraction
      if (props.username) {
        username = safeString(props.username);
      } else if (props.name) {
        username = safeString(props.name);
      } else if (props.login) {
        username = safeString(props.login);
      } else if (props.claims && typeof props.claims === 'object') {
        const claims = props.claims as any;
        if (claims.name) {
          username = safeString(claims.name);
        } else if (claims.preferred_username) {
          username = safeString(claims.preferred_username);
        }
      } else if (props.user && typeof props.user === 'object') {
        const user = props.user as any;
        if (user.name) {
          username = safeString(user.name);
        } else if (user.username) {
          username = safeString(user.username);
        }
      }
      
      return {
        userId,
        email,
        username
      }
    }
    
    // Generate unique session ID from Durable Object context
    const getSessionId = () => {
      try {
        return this.ctx?.id?.toString() || null
      } catch (error) {
        return null
      }
    }
    
    const combinedOptions = {
      ...options,
      apiKey,
      serverName,        // ← NOW EXTRACTED FROM McpServer
      serverVersion,     // ← NOW EXTRACTED FROM McpServer
      environment,
      enabled: analyticsEnabled,
      trackResults: options.trackResults !== false, // ← NEW: Default to true, allow override
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