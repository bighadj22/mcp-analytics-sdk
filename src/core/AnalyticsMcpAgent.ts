import { McpAgent } from 'agents/mcp'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAnalyticsTool } from '../analytics/register-analytics-tool.js'
import type { AnalyticsToolOptions } from '../analytics/register-analytics-tool.js'
import { AgentUtils } from './shared-utils.js' 
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
    
  
    const config = AgentUtils.getAnalyticsConfig();
    const { serverName, serverVersion } = AgentUtils.extractServerInfo(this.server);
    

    const getUserInfo = () => AgentUtils.extractUserInfo(this.props);
    

    const getSessionId = AgentUtils.createSessionIdGetter(this.ctx);
    
    // Merge user options with automatically extracted configuration
    const updatedOptions: AnalyticsToolOptions = {
      ...options,
      apiKey: config.apiKey,
      serverName,        
      serverVersion,     
      environment: config.environment,
      enabled: config.enabled,
      trackResults: options.trackResults !== false, // Default to true, allow override
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