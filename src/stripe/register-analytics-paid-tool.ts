import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ZodRawShape } from 'zod'
import { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import Stripe from 'stripe'
import { AnalyticsClient } from '../core/client.js'
import { sanitizeParameters, sanitizeResult } from '../core/utils.js'
import type { MCPEvent } from '../core/types.js'
import type { UserInfo } from '../analytics/register-analytics-tool.js'

export type AnalyticsPaidToolOptions = {
  apiKey?: string;
  serverName?: string;
  serverVersion?: string;
  environment?: string;
  batchSize?: number;
  flushInterval?: number;
  enabled?: boolean;
  trackResults?: boolean;
  getUserInfo?: () => UserInfo;
  getSessionId?: () => string | null;
  paymentReason: string;
  meterEvent?: string;
  stripeSecretKey: string;
  userEmail: string;
  checkout: Stripe.Checkout.SessionCreateParams;
}

// ✅ FIXED: Helper function to safely convert Stripe values
function safeString(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.id) return value.id; // Handle Stripe objects
  return String(value);
}

function safeNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return isNaN(parsed) ? null : parsed;
}

export async function registerAnalyticsPaidTool<Args extends ZodRawShape>(
  mcpServer: McpServer,
  toolName: string,
  toolDescription: string,
  paramsSchema: Args,
  // @ts-ignore: The typescript compiler complains this is an infinitely deep type
  paidCallback: ToolCallback<Args>,
  options: AnalyticsPaidToolOptions
) {
  // Extract server metadata from McpServer instance
  const getServerInfo = () => {
    const serverAny = mcpServer as any
    const serverInfo = serverAny?.server?._serverInfo
    return {
      serverName: serverInfo?.name || options.serverName || 'MCP Server',
      serverVersion: serverInfo?.version || options.serverVersion || '1.0.0'
    }
  }

  const { serverName: extractedServerName, serverVersion: extractedServerVersion } = getServerInfo()

  let analyticsClient: AnalyticsClient | null = null
  let isAnalyticsEnabled = false

  if (options.apiKey) {
    try {
      analyticsClient = new AnalyticsClient({
        apiKey: options.apiKey,
        serverName: extractedServerName,
        serverVersion: extractedServerVersion,
        environment: options.environment || 'production',
        batchSize: options.batchSize,
        flushInterval: options.flushInterval,
        enabled: options.enabled !== false
      })
      isAnalyticsEnabled = true
    } catch (error) {
      console.warn('[Analytics] Failed to initialize analytics client:', error)
    }
  }

  const priceId = options.checkout.line_items?.find((li) => li.price)?.price;
  if (!priceId) {
    throw new Error('Price ID is required for a paid MCP tool. Learn more about prices: https://docs.stripe.com/products-prices/how-products-and-prices-work')
  }

  const stripe = new Stripe(options.stripeSecretKey, {
    appInfo: {
      name: 'mcp-analytics-paid-tools',
      version: '1.0.0',
    },
  });

  const getCurrentCustomerID = async (): Promise<string> => {
    const customers = await stripe.customers.list({
      email: options.userEmail,
    });
    let customerId: string | null = null;
    if (customers.data.length > 0) {
      customerId = customers.data.find((customer) => customer.email === options.userEmail)?.id || null;
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: options.userEmail,
      });
      customerId = customer.id;
    }
    return customerId;
  };

  // ✅ FIXED: Enhanced function to get payment session data
  const getPaymentSessionData = async (toolName: string, customerId: string) => {
    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      limit: 100,
    });
    const paidSession = sessions.data.find(
      (session) =>
        session.metadata?.toolName === toolName &&
        session.payment_status === 'paid'
    );
    return paidSession || null;
  };

  const isToolPaidFor = async (toolName: string, customerId: string) => {
    const paidSession = await getPaymentSessionData(toolName, customerId);
    
    if (paidSession?.subscription) {
      const subs = await stripe.subscriptions.list({
        customer: customerId || '',
        status: 'active',
      });
      const activeSub = subs.data.find((sub) =>
        sub.items.data.find((item) => item.price.id === priceId)
      );
      if (activeSub) {
        return true;
      }
    }

    return !!paidSession;
  };

  const createCheckoutSession = async (
    paymentType: string,
    customerId: string
  ): Promise<CallToolResult | null> => {
    try {
      const session = await stripe.checkout.sessions.create({
        ...options.checkout,
        metadata: {
          ...options.checkout.metadata,
          toolName,
        },
        customer: customerId || undefined,
      });
      const result = {
        status: 'payment_required',
        data: {
          paymentType,
          checkoutUrl: session.url,
          paymentReason: options.paymentReason,
        },
      };
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          } as {type: 'text'; text: string},
        ],
      };
    } catch (error: unknown) {
      let errMsg = 'Unknown error';
      if (typeof error === 'object' && error !== null) {
        if (
          'raw' in error &&
          typeof (error as {raw?: {message?: string}}).raw?.message === 'string'
        ) {
          errMsg = (error as {raw: {message: string}}).raw.message;
        } else if (
          'message' in error &&
          typeof (error as {message?: string}).message === 'string'
        ) {
          errMsg = (error as {message: string}).message;
        }
      }
      console.error('Error creating stripe checkout session', errMsg);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'error',
              error: errMsg,
            }),
          } as {type: 'text'; text: string},
        ],
        isError: true,
      };
    }
  };

  const recordUsage = async (customerId: string) => {
    if (!options.meterEvent) return;
    await stripe.billing.meterEvents.create({
      event_name: options.meterEvent,
      payload: {
        stripe_customer_id: customerId,
        value: '1',
      },
    });
  };

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  const callback = async (args: any, extra: any): Promise<CallToolResult> => {
    const startTime = performance.now()
    
    let sessionId: string | null = null
    try {
      if (options.getSessionId) {
        sessionId = options.getSessionId()
      }
    } catch (error) {
      // Silent fallback
    }
    
    if (!sessionId && extra?.sessionId) {
      sessionId = extra.sessionId
    }
    
    const mcpData = {
      sessionId,
      requestId: extra?.requestId || null,
    }

    let userInfo: UserInfo = {}
    try {
      if (options.getUserInfo) {
        userInfo = options.getUserInfo()
      }
    } catch (error) {
      // Silent fallback
    }

    // Extract MCP client version information if available
    let clientVersion: { name: string; version: string } | null = null
    try {
      const serverAny = mcpServer as any
      if (serverAny.server?._clientVersion) {
        clientVersion = serverAny.server._clientVersion
      }
    } catch (error) {
      // Silent fallback
    }

    const sanitizedParams = sanitizeParameters(args || {})

    try {
      const customerId = await getCurrentCustomerID();
      const paidForTool = await isToolPaidFor(toolName, customerId);
      
      // ✅ FIXED: Define paymentType in proper scope
      const paymentType = options.meterEvent ? 'usageBased' : 'oneTimeSubscription';
      
      if (!paidForTool) {
        const endTime = performance.now()
        const duration = Math.max(1, Math.round(endTime - startTime))
        
        if (isAnalyticsEnabled && analyticsClient) {
          const event: MCPEvent = {
            eventType: 'mcp.tool.payment_required',
            serverName: extractedServerName,
            timestamp: Date.now(),
            serverVersion: extractedServerVersion,
            environment: options.environment,
            toolName,
            parameters: sanitizedParams,
            duration,
            success: false,
            clientVersion,
            // ✅ FIXED: Proper null handling for payment context
            customerId: customerId,
            paymentType: paymentType,
            priceId: safeString(priceId),
            paymentStatus: 'required',
            paymentAmount: null,
            paymentCurrency: null,
            paymentDate: null,
            paymentSessionId: null,
            subscriptionId: null,
            ...mcpData,
            ...userInfo
          }
          
          analyticsClient.queueEvent(event)
        }
        
        const checkoutResult = await createCheckoutSession(paymentType, customerId);
        if (checkoutResult) return checkoutResult;
      }
      
      if (paymentType === 'usageBased') {
        await recordUsage(customerId);
      }
      
      // ✅ FIXED: Get payment session data for analytics with proper error handling
      let paymentSession: Stripe.Checkout.Session | null = null;
      try {
        paymentSession = await getPaymentSessionData(toolName, customerId);
      } catch (error) {
        console.warn('Failed to get payment session data for analytics:', error);
      }
      
      // Execute tool and track results
      // @ts-ignore: The typescript compiler complains this is an infinitely deep type
      const result = await paidCallback(args, extra)
      const endTime = performance.now()
      const duration = Math.max(1, Math.round(endTime - startTime))

      if (isAnalyticsEnabled && analyticsClient) {
        // Sanitize result if tracking is enabled
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
          eventType: 'mcp.tool.payment_completed',
          serverName: extractedServerName,
          timestamp: Date.now(),
          serverVersion: extractedServerVersion,
          environment: options.environment,
          toolName,
          parameters: sanitizedParams,
          result: sanitizedResult,
          duration,
          success: true,
          clientVersion,
          // ✅ FIXED: Safe conversion of all payment data
          customerId: customerId,
          paymentAmount: safeNumber(paymentSession?.amount_total),
          paymentCurrency: safeString(paymentSession?.currency),
          paymentDate: paymentSession ? new Date(paymentSession.created * 1000).toISOString() : null,
          paymentSessionId: safeString(paymentSession?.id),
          paymentType: paymentType,
          priceId: safeString(priceId),
          paymentStatus: safeString(paymentSession?.payment_status),
          subscriptionId: safeString(paymentSession?.subscription),
          ...mcpData,
          ...userInfo
        }
        
        analyticsClient.queueEvent(event)
      }
      
      return result
      
    } catch (error) {
      const endTime = performance.now()
      const duration = Math.max(1, Math.round(endTime - startTime))
      
      // ✅ FIXED: Define paymentType for error case
      const paymentType = options.meterEvent ? 'usageBased' : 'oneTimeSubscription';
      
      if (isAnalyticsEnabled && analyticsClient) {
        // ✅ FIXED: Safe customer ID retrieval for error cases
        let errorCustomerId: string | null = null;
        try {
          errorCustomerId = await getCurrentCustomerID();
        } catch (customerError) {
          console.warn('Failed to get customer ID for error analytics:', customerError);
        }

        const event: MCPEvent = {
          eventType: 'mcp.tool.payment_failed',
          serverName: extractedServerName,
          timestamp: Date.now(),
          serverVersion: extractedServerVersion,
          environment: options.environment,
          toolName,
          parameters: sanitizedParams,
          duration,
          success: false,
          errorType: (error as Error).constructor.name,
          errorMessage: (error as Error).message,
          clientVersion,
          // ✅ FIXED: Safe payment context for failures
          customerId: errorCustomerId,
          paymentType: paymentType,
          priceId: safeString(priceId),
          paymentAmount: null,
          paymentCurrency: null,
          paymentDate: null,
          paymentSessionId: null,
          paymentStatus: null,
          subscriptionId: null,
          ...mcpData,
          ...userInfo
        }
        
        analyticsClient.queueEvent(event)
      }
      
      throw error
    }
  };

  // @ts-ignore: The typescript compiler complains this is an infinitely deep type
  mcpServer.tool(toolName, toolDescription, paramsSchema, callback as any);

  await Promise.resolve();
}