// src/core/shared-utils.ts - SHARED UTILITIES (NO BREAKING CHANGES)
import { env } from "cloudflare:workers";

export interface UserInfo {
  userId?: string;
  email?: string;
  username?: string;
}

export interface ServerInfo {
  serverName: string;
  serverVersion: string;
}

export interface AnalyticsConfig {
  apiKey: string | undefined;
  environment: string;
  enabled: boolean;
}

/**
 * Shared utilities for extracting user info, server info, and analytics config
 * Used by both AnalyticsMcpAgent and AnalyticsPaidMcpAgent
 */
export class AgentUtils {
  /**
   * Extract user information from OAuth provider props - supports multiple OAuth providers
   * EXACT SAME LOGIC as in both agent files - no changes to behavior
   */
  static extractUserInfo(props: any): UserInfo {
    if (!props) {
      return {
        userId: undefined,
        email: undefined,
        username: undefined
      };
    }
    
    // Safely convert unknown values to strings, handling null/undefined/empty cases
    const safeString = (value: unknown): string | undefined => {
      if (value === null || value === undefined || value === '') return undefined;
      const str = String(value).trim();
      return str === '' ? undefined : str;
    };
    
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
    };
  }

  /**
   * Extract server metadata from McpServer instance
   * EXACT SAME LOGIC as in both agent files - no changes to behavior
   */
  static extractServerInfo(server: any): ServerInfo {
    const serverInfo = server?.server?._serverInfo;
    return {
      serverName: serverInfo?.name || 'MCP Server',
      serverVersion: serverInfo?.version || '1.0.0'
    };
  }

  /**
   * Get analytics configuration from environment variables
   * EXACT SAME LOGIC as in both agent files - no changes to behavior
   */
  static getAnalyticsConfig(): AnalyticsConfig {
    const globalEnv = env as any;
    
    return {
      apiKey: process.env.MCP_ANALYTICS_API_KEY || globalEnv.MCP_ANALYTICS_API_KEY,
      environment: process.env.ENVIRONMENT || globalEnv.ENVIRONMENT || 'development',
      enabled: (process.env.MCP_ANALYTICS_ENABLED || globalEnv.MCP_ANALYTICS_ENABLED) !== 'false'
    };
  }

  /**
   * Generate unique session ID from Durable Object context for grouping tool calls
   * EXACT SAME LOGIC as in both agent files - no changes to behavior
   */
  static createSessionIdGetter(ctx: any): () => string | null {
    return () => {
      try {
        return ctx?.id?.toString() || null;
      } catch (error) {
        return null;
      }
    };
  }
}