import { MCPEvent } from '../core/types.js'
import { sanitizeParameters } from '../core/utils.js'
import type { UserInfo } from './register-analytics-tool.js'

/**
 * Server configuration data used across all event types
 */
type ServerConfig = {
  serverName: string
  serverVersion: string
  environment: string
}

/**
 * Creates a tool started event for tracking when tool execution begins.
 * Parameters are automatically sanitized to remove sensitive data.
 * 
 * @param serverConfig - Server identification and environment info
 * @param toolName - Name of the tool being executed
 * @param parameters - Input parameters provided to the tool
 * @param sessionId - Optional session identifier for grouping events
 * @param userInfo - Optional user information from OAuth provider
 * @param clientVersion - Optional MCP client version information
 * @returns MCPEvent for tool execution start
 */
export function createToolStartedEvent(
  serverConfig: ServerConfig,
  toolName: string,
  parameters: Record<string, any>,
  sessionId?: string | null,
  userInfo?: UserInfo,
  clientVersion?: { name: string; version: string } | null
): MCPEvent {
  return {
    eventType: 'mcp.tool.started',
    timestamp: Date.now(),
    ...serverConfig,
    toolName,
    parameters: sanitizeParameters(parameters),
    sessionId,
    clientVersion,
    ...userInfo
  }
}

/**
 * Creates a tool completed event for tracking successful tool execution.
 * 
 * @param serverConfig - Server identification and environment info
 * @param toolName - Name of the tool that completed successfully
 * @param duration - Execution time in milliseconds
 * @param sessionId - Optional session identifier for grouping events
 * @param userInfo - Optional user information from OAuth provider
 * @param clientVersion - Optional MCP client version information
 * @returns MCPEvent for successful tool completion
 */
export function createToolCompletedEvent(
  serverConfig: ServerConfig,
  toolName: string,
  duration: number,
  sessionId?: string | null,
  userInfo?: UserInfo,
  clientVersion?: { name: string; version: string } | null
): MCPEvent {
  return {
    eventType: 'mcp.tool.completed',
    timestamp: Date.now(),
    ...serverConfig,
    toolName,
    duration,
    success: true,
    sessionId,
    clientVersion,
    ...userInfo
  }
}

/**
 * Creates a tool failed event for tracking tool execution errors.
 * Captures error type and message for debugging purposes.
 * 
 * @param serverConfig - Server identification and environment info
 * @param toolName - Name of the tool that failed
 * @param duration - Execution time before failure in milliseconds
 * @param error - The error that caused the tool to fail
 * @param sessionId - Optional session identifier for grouping events
 * @param userInfo - Optional user information from OAuth provider
 * @param clientVersion - Optional MCP client version information
 * @returns MCPEvent for failed tool execution
 */
export function createToolFailedEvent(
  serverConfig: ServerConfig,
  toolName: string,
  duration: number,
  error: Error,
  sessionId?: string | null,
  userInfo?: UserInfo,
  clientVersion?: { name: string; version: string } | null
): MCPEvent {
  return {
    eventType: 'mcp.tool.failed',
    timestamp: Date.now(),
    ...serverConfig,
    toolName,
    duration,
    success: false,
    errorType: error.constructor.name,
    errorMessage: error.message,
    sessionId,
    clientVersion,
    ...userInfo
  }
}

/**
 * Creates a server initialization event for tracking when MCP servers start up.
 * Used for monitoring server deployment and restart events.
 * 
 * @param serverConfig - Server identification and environment info
 * @param sessionId - Optional session identifier
 * @param userInfo - Optional user information from OAuth provider
 * @param clientVersion - Optional MCP client version information
 * @returns MCPEvent for server initialization
 */
export function createServerInitEvent(
  serverConfig: ServerConfig,
  sessionId?: string | null,
  userInfo?: UserInfo,
  clientVersion?: { name: string; version: string } | null
): MCPEvent {
  return {
    eventType: 'mcp.server.init',
    timestamp: Date.now(),
    ...serverConfig,
    sessionId,
    clientVersion,
    ...userInfo
  }
}