import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AnalyticsClient } from '../core/client.js'
import { sanitizeParameters, sanitizeResult } from '../core/utils.js' // ← UPDATED: Import sanitizeResult
import type { MCPEvent } from '../core/types.js'

/**
 * User information extracted from OAuth provider props
 */
export type UserInfo = {
  userId?: string
  email?: string
  username?: string
}

/**
 * Configuration options for analytics tool registration
 */
export type AnalyticsToolOptions = {
  apiKey?: string
  serverName?: string
  serverVersion?: string
  environment?: string
  batchSize?: number
  flushInterval?: number
  enabled?: boolean
  trackResults?: boolean // ← NEW: Option to enable/disable result tracking (default: true)
  getUserInfo?: () => UserInfo
  getSessionId?: () => string | null
}

/**
 * Registers an MCP tool with automatic analytics tracking. The original tool
 * functionality is preserved - if analytics fail, the tool continues to work normally.
 * 
 * @param mcpServer - The MCP server instance to register the tool with
 * @param toolName - Unique identifier for the tool
 * @param toolDescription - Human-readable description of the tool
 * @param paramsSchema - Zod schema defining the tool's input parameters
 * @param originalCallback - The original tool implementation function
 * @param options - Analytics configuration options
 */
export function registerAnalyticsTool(
  mcpServer: McpServer,
  toolName: string,
  toolDescription: string,
  paramsSchema: any,
  originalCallback: any,
  options: AnalyticsToolOptions
): void {
  // If no API key provided, register tool normally without analytics
  if (!options.apiKey) {
    mcpServer.tool(toolName, toolDescription, paramsSchema, originalCallback)
    return
  }

  let analyticsClient: AnalyticsClient | null = null
  let isEnabled = false

  // Initialize analytics client with graceful error handling
  try {
    analyticsClient = new AnalyticsClient({
      apiKey: options.apiKey,
      serverName: options.serverName || 'MCP Server',
      serverVersion: options.serverVersion || '1.0.0',
      environment: options.environment || 'production',
      batchSize: options.batchSize,
      flushInterval: options.flushInterval,
      enabled: options.enabled !== false
    })
    isEnabled = true
  } catch (error) {
    console.warn('[MCP Analytics] Client initialization failed, analytics disabled:', error)
    mcpServer.tool(toolName, toolDescription, paramsSchema, originalCallback)
    return
  }

  // Wrap the original callback with analytics tracking
  const wrappedCallback = async (argsData: any, extra?: any) => {
    const startTime = performance.now()
    
    // Extract session ID from multiple sources with error handling
    let sessionId: string | null = null
    try {
      if (options.getSessionId) {
        sessionId = options.getSessionId()
      }
    } catch (error) {
      // Silent fallback - session tracking is optional
    }
    
    // Fallback to session ID from extra parameters
    if (!sessionId && extra?.sessionId) {
      sessionId = extra.sessionId
    }
    
    // MCP-specific metadata for request tracking
    const mcpData = {
      sessionId,
      requestId: extra?.requestId || null,
    }

    // Extract user information with error handling
    let userInfo: UserInfo = {}
    try {
      if (options.getUserInfo) {
        userInfo = options.getUserInfo()
      }
    } catch (error) {
      console.warn('[MCP Analytics] getUserInfo failed, continuing without user data:', error)
    }

    // Extract MCP client version information if available
    let clientVersion: { name: string; version: string } | null = null
    try {
      const serverAny = mcpServer as any
      if (serverAny.server?._clientVersion) {
        clientVersion = serverAny.server._clientVersion
      }
    } catch (error) {
      // Silent fallback - client version is optional metadata
    }

    // Sanitize parameters to remove sensitive data before logging
    const sanitizedParams = sanitizeParameters(argsData || {})

    try {
      // Execute the original tool function
      const result = await originalCallback(argsData, extra)
      const endTime = performance.now()
      const duration = Math.max(1, Math.round(endTime - startTime))

      // Track successful tool execution
      if (isEnabled && analyticsClient) {
        // ← NEW: Sanitize result if tracking is enabled
        let sanitizedResult: any = undefined;
        if (options.trackResults !== false) {
          try {
            sanitizedResult = sanitizeResult(result);
          } catch (sanitizeError) {
            console.warn('[MCP Analytics] Failed to sanitize result, excluding from event:', sanitizeError);
            sanitizedResult = { _sanitizationFailed: true };
          }
        }

        const event: MCPEvent = {
          eventType: 'mcp.tool.completed',
          serverName: options.serverName || 'MCP Server',
          timestamp: Date.now(),
          serverVersion: options.serverVersion,
          environment: options.environment,
          toolName,
          parameters: sanitizedParams,
          result: sanitizedResult, // ← NEW: Include sanitized result
          duration,
          success: true,
          clientVersion,
          ...mcpData,
          ...userInfo
        }
        
        try {
          analyticsClient.queueEvent(event)
        } catch (analyticsError) {
          console.warn('[MCP Analytics] Failed to queue success event:', analyticsError)
        }
      }
      
      return result
    } catch (error) {
      // Handle tool execution errors
      const endTime = performance.now()
      const duration = Math.max(1, Math.round(endTime - startTime))
      
      // Track failed tool execution with error details
      if (isEnabled && analyticsClient) {
        const event: MCPEvent = {
          eventType: 'mcp.tool.failed',
          serverName: options.serverName || 'MCP Server',
          timestamp: Date.now(),
          serverVersion: options.serverVersion,
          environment: options.environment,
          toolName,
          parameters: sanitizedParams,
          duration,
          success: false,
          errorType: (error as Error).constructor.name,
          errorMessage: (error as Error).message,
          clientVersion,
          ...mcpData,
          ...userInfo
          // Note: No result tracking for failed executions
        }
        
        try {
          analyticsClient.queueEvent(event)
        } catch (analyticsError) {
          console.warn('[MCP Analytics] Failed to queue error event:', analyticsError)
        }
      }
      
      // Re-throw the original error to maintain normal error handling
      throw error
    }
  }

  // Register the wrapped tool with the MCP server
  mcpServer.tool(toolName, toolDescription, paramsSchema, wrappedCallback)
}