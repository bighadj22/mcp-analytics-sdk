import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAnalyticsTool } from '../analytics/register-analytics-tool.js'
import type { AnalyticsToolOptions } from '../analytics/register-analytics-tool.js'
import { env } from "cloudflare:workers"
import { z } from "zod"

/**
 * AnalyticsMcpAgent extends Cloudflare's McpAgent to provide automatic analytics tracking
 * for MCP tools with minimal configuration. Server info and user data are automatically
 * extracted from the McpServer instance and OAuth props.
 */
export abstract class AnalyticsMcpAgent<Env = unknown, State = unknown, Props extends Record<string, unknown> = Record<string, unknown>> extends McpAgent<Env, State, Props> {
  // MCP server instance - name and version automatically extracted for analytics
  abstract server: McpServer

  /**
   * Registers an MCP tool with automatic analytics tracking. Tools function normally
   * even if analytics fail, ensuring reliability.
   * 
   * @param toolName - Unique identifier for the tool
   * @param toolDescription - Human-readable description of tool purpose
   * @param paramsSchema - Zod schema defining input parameters
   * @param callback - Tool execution function with typed parameters
   * @param options - Additional analytics configuration options (including trackResults)
   */
  analyticsTool<TSchema extends Record<string, z.ZodType>>(
    toolName: string,
    toolDescription: string,
    paramsSchema: TSchema,
    callback: (params: { [K in keyof TSchema]: z.infer<TSchema[K]> }) => any,
    options: Omit<AnalyticsToolOptions, 'apiKey' | 'getUserInfo' | 'getSessionId'> = {}
  ): void {
    const mcpServer = this.server
    
    // Access Cloudflare Workers environment variables
    const globalEnv = env as any
    
    // Analytics API key from environment (required for tracking)
    const apiKey = process.env.MCP_ANALYTICS_API_KEY || globalEnv.MCP_ANALYTICS_API_KEY
    
    // Extract server metadata from McpServer instance (nested at server.server._serverInfo)
    const getServerInfo = () => {
      const serverInfo = (this.server as any)?.server?._serverInfo
      return {
        serverName: serverInfo?.name,
        serverVersion: serverInfo?.version
      }
    }
    
    const { serverName, serverVersion } = getServerInfo()
    
    // Environment configuration with sensible defaults
    const environment = process.env.ENVIRONMENT || globalEnv.ENVIRONMENT || 'development'
    const enabled = (process.env.MCP_ANALYTICS_ENABLED || globalEnv.MCP_ANALYTICS_ENABLED) !== 'false'
    
    // Extract user information from OAuth provider props - supports multiple OAuth providers
    const getUserInfo = () => {
      if (!this.props) {
        return {
          userId: undefined,
          email: undefined,
          username: undefined
        }
      }
      
      // Safely convert unknown values to strings, handling null/undefined/empty cases
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
        // OAuth2/OIDC standard subject identifier
        userId = safeString(props.sub);
      } else if (props.claims && typeof props.claims === 'object') {
        // JWT/OIDC claims object
        const claims = props.claims as any;
        if (claims.sub) {
          userId = safeString(claims.sub);
        }
      } else if (props.user && typeof props.user === 'object') {
        // Nested user object (custom provider format)
        const user = props.user as any;
        if (user.id) {
          userId = safeString(user.id);
        }
      } else if (props.login) {
        // GitHub-style login identifier
        userId = safeString(props.login);
      }
      
      // email extraction - check standard and provider-specific fields
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
      
      // username extraction - prioritize display names over login identifiers
      if (props.username) {
        username = safeString(props.username);
      } else if (props.name) {
        // Display name (most human-readable)
        username = safeString(props.name);
      } else if (props.login) {
        // Login identifier as fallback
        username = safeString(props.login);
      } else if (props.claims && typeof props.claims === 'object') {
        const claims = props.claims as any;
        if (claims.name) {
          username = safeString(claims.name);
        } else if (claims.preferred_username) {
          // OIDC preferred username
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
    
    // Generate unique session ID from Durable Object context for grouping tool calls
    const getSessionId = () => {
      try {
        return this.ctx?.id?.toString() || null
      } catch (error) {
        return null
      }
    }
    
    // Merge user options with automatically extracted configuration
    const updatedOptions: AnalyticsToolOptions = {
      ...options,
      apiKey,
      serverName,        // Automatically extracted from McpServer configuration
      serverVersion,     // Automatically extracted from McpServer configuration
      environment,
      enabled,
      trackResults: options.trackResults !== false, // ← NEW: Default to true, allow override
      getUserInfo,
      getSessionId
    }
    
    // Register the tool with analytics tracking enabled
    registerAnalyticsTool(
      mcpServer,
      toolName,
      toolDescription,
      paramsSchema,
      callback,
      updatedOptions
    )
  }
}