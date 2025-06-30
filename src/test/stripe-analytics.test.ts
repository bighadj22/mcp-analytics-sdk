import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAnalyticsPaidTool } from '../stripe/register-analytics-paid-tool';
import { registerAnalyticsTool } from '../analytics/register-analytics-tool';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock Stripe
const mockStripe = {
  customers: {
    list: vi.fn(),
    create: vi.fn(),
  },
  checkout: {
    sessions: {
      create: vi.fn(),
      list: vi.fn(),
    },
  },
  subscriptions: {
    list: vi.fn(),
  },
  billing: {
    meterEvents: {
      create: vi.fn(),
    },
  },
};

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => mockStripe),
}));

// Mock AnalyticsClient
const mockQueueEvent = vi.fn();
const mockFlush = vi.fn();
const mockDestroy = vi.fn();

vi.mock('../core/client.js', () => ({
  AnalyticsClient: vi.fn().mockImplementation(() => {
    return {
      queueEvent: mockQueueEvent,
      flush: mockFlush,
      destroy: mockDestroy,
    };
  }),
}));

describe('🧪 COMPLETE STRIPE + ANALYTICS TESTS - Full Payment Tracking & Inheritance', () => {
  let mockMcpServer: any;
  let mockExtra: RequestHandlerExtra<ServerRequest, ServerNotification>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock McpServer with server info extraction capability
    mockMcpServer = {
      tool: vi.fn().mockImplementation((name, description, schema, callback) => {
        // Mock implementation for testing
      }),
      server: {
        _serverInfo: {
          name: 'Test Analytics Stripe Server',
          version: '1.0.0'
        },
        _clientVersion: {
          name: 'test-mcp-client',
          version: '1.0.0'
        }
      }
    };

    mockExtra = {
      signal: new AbortController().signal,
      sendNotification: vi.fn(),
      sendRequest: vi.fn(),
      requestId: 'test-request-123',
    };

    // Reset Stripe mocks
    mockStripe.customers.list.mockResolvedValue({ data: [] });
    mockStripe.customers.create.mockResolvedValue({ id: 'cus_test123' });
    mockStripe.checkout.sessions.list.mockResolvedValue({ data: [] });
    mockStripe.subscriptions.list.mockResolvedValue({ data: [] });
  });

  // ================================
  // INHERITANCE TESTS (FIXED)
  // ================================

  it('🔗 INHERITANCE TEST: registerAnalyticsTool works with same server as registerAnalyticsPaidTool', async () => {
    const freeCallback = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Free tool executed' }],
    });
  
    const paidCallback = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Paid tool executed' }],
    });
  
    // ✅ FIXED: Add mock for checkout session creation for the paid tool test
    mockStripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_inheritance_test123',
      url: 'https://checkout.stripe.com/inheritance_test123',
    });
  
    // Register free tool (analytics only)
    await registerAnalyticsTool(
      mockMcpServer,
      'freeTool',
      'Free analytics tool',
      { input: z.string() },
      freeCallback,
      {
        apiKey: 'test-analytics-key',
        serverName: 'Test Analytics Stripe Server',
        serverVersion: '1.0.0',
        environment: 'test',
        trackResults: true,
      }
    );
  
    // Register paid tool (analytics + payments)
    await registerAnalyticsPaidTool(
      mockMcpServer,
      'paidTool',
      'Paid analytics tool',
      { premium: z.string() },
      paidCallback,
      {
        apiKey: 'test-analytics-key',
        paymentReason: 'Premium access',
        stripeSecretKey: 'sk_test_123',
        userEmail: 'test@example.com',
        trackResults: true,
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_test123', quantity: 1 }],
          mode: 'subscription',
        },
      }
    );
  
    // ✅ Both tools should be registered on the same server
    expect(mockMcpServer.tool).toHaveBeenCalledTimes(2);
  
    // ✅ Free tool registration
    const [freeName, freeDesc, freeSchema, freeWrappedCallback] = mockMcpServer.tool.mock.calls[0];
    expect(freeName).toBe('freeTool');
    expect(freeDesc).toBe('Free analytics tool');
    expect(freeSchema).toHaveProperty('input');
    expect(typeof freeWrappedCallback).toBe('function');
  
    // ✅ Paid tool registration
    const [paidName, paidDesc, paidSchema, paidWrappedCallback] = mockMcpServer.tool.mock.calls[1];
    expect(paidName).toBe('paidTool');
    expect(paidDesc).toBe('Paid analytics tool');
    expect(paidSchema).toHaveProperty('premium');
    expect(typeof paidWrappedCallback).toBe('function');
  
    // ✅ Execute free tool - should track analytics only
    await freeWrappedCallback({ input: 'free_test' }, mockExtra);
    
    const freeAnalyticsCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.completed' && call[0]?.toolName === 'freeTool'
    );
    expect(freeAnalyticsCall).toBeTruthy();
    if (freeAnalyticsCall) {
      expect(freeAnalyticsCall[0].success).toBe(true);
      expect(freeAnalyticsCall[0].parameters.input).toBe('free_test');
      expect(freeAnalyticsCall[0].customerId).toBeUndefined();
      expect(freeAnalyticsCall[0].paymentAmount).toBeUndefined();
    }
  
    // ✅ Execute paid tool - should require payment first
    const paidResult = await paidWrappedCallback({ premium: 'paid_test' }, mockExtra);
    
    // ✅ FIXED: Should return payment required response (not error)
    expect(paidResult.content[0].text).toContain('payment_required');
    
    const paidAnalyticsCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.payment_required' && call[0]?.toolName === 'paidTool'
    );
    expect(paidAnalyticsCall).toBeTruthy();
    if (paidAnalyticsCall) {
      expect(paidAnalyticsCall[0].success).toBe(false);
      expect(paidAnalyticsCall[0].parameters.premium).toBe('paid_test');
      expect(paidAnalyticsCall[0].customerId).toBe('cus_test123');
      expect(paidAnalyticsCall[0].paymentType).toBe('oneTimeSubscription');
    }
  });

  it('🎯 INHERITANCE TEST: Both tool types use same analytics infrastructure', async () => {
    const freeCallback = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Free result with sensitive data: API_KEY_123' }],
    });

    await registerAnalyticsTool(
      mockMcpServer,
      'sensitiveFreeTool',
      'Free tool with sensitive result',
      { action: z.string(), apiKey: z.string() },
      freeCallback,
      {
        apiKey: 'test-analytics-key',
        serverName: 'Test Analytics Stripe Server',
        serverVersion: '1.0.0',
        environment: 'test',
        trackResults: true,
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    await wrappedCallback({ 
      action: 'test_action',
      apiKey: 'sk_live_secret_key_456'
    }, mockExtra);

    const analyticsCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.completed'
    );
    
    expect(analyticsCall).toBeTruthy();
    if (analyticsCall) {
      expect(analyticsCall[0].parameters.action).toBe('test_action');
      expect(analyticsCall[0].parameters.apiKey).toBe('[REDACTED]');
      expect(analyticsCall[0].result).toBeDefined();
      expect(analyticsCall[0].serverName).toBe('Test Analytics Stripe Server');
      expect(analyticsCall[0].serverVersion).toBe('1.0.0');
      expect(analyticsCall[0].environment).toBe('test');
    }
  });

  it('🔧 INHERITANCE TEST: Free tool can disable result tracking like paid tools', async () => {
    const sensitiveCallback = vi.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: 'CONFIDENTIAL: patient_data_12345, ssn_987654321'
      }],
    });

    await registerAnalyticsTool(
      mockMcpServer,
      'confidentialFreeTool',
      'Confidential free tool',
      { patientId: z.string() },
      sensitiveCallback,
      {
        apiKey: 'test-analytics-key',
        trackResults: false,
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    const result = await wrappedCallback({ patientId: 'patient_12345' }, mockExtra);

    expect(result.content[0].text).toContain('CONFIDENTIAL');

    const analyticsCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.completed'
    );
    
    expect(analyticsCall).toBeTruthy();
    if (analyticsCall) {
      expect(analyticsCall[0].parameters.patientId).toBe('patient_12345');
      expect(analyticsCall[0].result).toBeUndefined();
    }
  });

  // ================================
  // EXISTING PAYMENT TESTS
  // ================================

  it('🎯 CORE TEST: Tool registration works exactly like McpAgent', async () => {
    const toolName = 'testPaidTool';
    const toolDescription = 'Test paid tool with analytics';
    const paramsSchema = { input: z.string() };
    const callback = vi.fn();

    await registerAnalyticsPaidTool(
      mockMcpServer,
      toolName,
      toolDescription,
      paramsSchema,
      callback,
      {
        apiKey: 'test-analytics-key',
        paymentReason: 'Test payment',
        stripeSecretKey: 'sk_test_123',
        userEmail: 'test@example.com',
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_test123', quantity: 1 }],
          mode: 'subscription',
        },
      }
    );

    expect(mockMcpServer.tool).toHaveBeenCalledTimes(1);

    const [actualName, actualDesc, actualSchema, actualCallback] = mockMcpServer.tool.mock.calls[0];
    
    expect(actualName).toBe(toolName);
    expect(actualDesc).toBe(toolDescription);
    expect(actualSchema).toHaveProperty('input');
    expect(typeof actualCallback).toBe('function');
  });

  it('✅ PAYMENT COMPLETED: Tracks complete payment data', async () => {
    const callback = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Premium feature executed' }],
    });

    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_paid123', email: 'paid@example.com' }],
    });

    mockStripe.checkout.sessions.list.mockResolvedValue({
      data: [{
        id: 'cs_paid123',
        metadata: { toolName: 'paidTool' },
        payment_status: 'paid',
        amount_total: 2999,
        currency: 'usd',
        created: 1703448000,
        subscription: 'sub_123',
      }],
    });

    await registerAnalyticsPaidTool(
      mockMcpServer,
      'paidTool',
      'Premium tool',
      { feature: z.string() },
      callback,
      {
        apiKey: 'test-key',
        paymentReason: 'Premium access',
        stripeSecretKey: 'sk_test_123',
        userEmail: 'paid@example.com',
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_123', quantity: 1 }],
          mode: 'subscription',
        },
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    await wrappedCallback({ feature: 'premium' }, mockExtra);

    expect(mockQueueEvent).toHaveBeenCalled();
    const completedCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.payment_completed'
    );

    expect(completedCall).toBeTruthy();
    if (completedCall) {
      expect(completedCall[0]).toMatchObject({
        eventType: 'mcp.tool.payment_completed',
        toolName: 'paidTool',
        success: true,
        customerId: 'cus_paid123',
        paymentAmount: 2999,
        paymentCurrency: 'usd',
        paymentDate: '2023-12-24T20:00:00.000Z', 
        paymentSessionId: 'cs_paid123',
        paymentType: 'oneTimeSubscription',
        paymentStatus: 'paid',
        subscriptionId: 'sub_123',
        priceId: 'price_123',
      });
    }
  });

  it('❌ PAYMENT REQUIRED: Tracks payment requirement with context', async () => {
    const callback = vi.fn();

    mockStripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_new123',
      url: 'https://checkout.stripe.com/new123',
    });

    await registerAnalyticsPaidTool(
      mockMcpServer,
      'unpaidTool',
      'Tool requiring payment',
      { action: z.string() },
      callback,
      {
        apiKey: 'test-key',
        paymentReason: 'Access required',
        stripeSecretKey: 'sk_test_123',
        userEmail: 'unpaid@example.com',
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_456', quantity: 1 }],
          mode: 'payment',
        },
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    await wrappedCallback({ action: 'test' }, mockExtra);

    expect(mockQueueEvent).toHaveBeenCalled();
    const requiredCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.payment_required'
    );

    expect(requiredCall).toBeTruthy();
    if (requiredCall) {
      expect(requiredCall[0]).toMatchObject({
        eventType: 'mcp.tool.payment_required',
        toolName: 'unpaidTool',
        success: false,
        customerId: 'cus_test123',
        paymentType: 'oneTimeSubscription',
        paymentStatus: 'required',
        priceId: 'price_456',
      });
    }
  });

  it('💳 PAYMENT TEST: Creates checkout session for unpaid tool with analytics', async () => {
    const callback = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Tool executed successfully' }],
    });

    mockStripe.checkout.sessions.create.mockResolvedValue({
      id: 'cs_checkout123',
      url: 'https://checkout.stripe.com/checkout123',
    });

    await registerAnalyticsPaidTool(
      mockMcpServer,
      'unpaidCheckoutTool',
      'Tool requiring payment',
      { action: z.string(), secret: z.string() },
      callback,
      {
        apiKey: 'test-key',
        paymentReason: 'Access to premium tool',
        stripeSecretKey: 'sk_test_123',
        userEmail: 'checkout@example.com',
        trackResults: true,
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_checkout123', quantity: 1 }],
          mode: 'subscription',
        },
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    
    const result = await wrappedCallback({ 
      action: 'test_action', 
      secret: 'sk_live_very_sensitive_key_12345' 
    }, mockExtra);

    expect(mockStripe.customers.create).toHaveBeenCalledWith({
      email: 'checkout@example.com',
    });

    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: 'https://example.com/success',
        line_items: [{ price: 'price_checkout123', quantity: 1 }],
        mode: 'subscription',
        customer: 'cus_test123',
        metadata: { toolName: 'unpaidCheckoutTool' },
      })
    );

    expect(result).toEqual({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'payment_required',
          data: {
            paymentType: 'oneTimeSubscription',
            checkoutUrl: 'https://checkout.stripe.com/checkout123',
            paymentReason: 'Access to premium tool',
          },
        }),
      }],
    });

    expect(callback).not.toHaveBeenCalled();

    expect(mockQueueEvent).toHaveBeenCalled();
    const paymentRequiredCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.payment_required'
    );
    
    expect(paymentRequiredCall).toBeTruthy();
    if (paymentRequiredCall) {
      expect(paymentRequiredCall[0].parameters.action).toBe('test_action');
      expect(paymentRequiredCall[0].parameters.secret).toBe('[REDACTED]');
    }
  });

  it('✅ PAID USER TEST: Executes tool for paid user with result tracking', async () => {
    const callback = vi.fn().mockResolvedValue({
      content: [
        { type: 'text', text: 'Premium feature executed' },
        { type: 'text', text: 'Additional premium data: API_KEY_abc123xyz' }
      ],
      metadata: {
        executionTime: 150,
        premiumFeature: true,
        apiVersion: '2.1'
      }
    });

    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_paid_user123', email: 'paiduser@example.com' }],
    });

    mockStripe.checkout.sessions.list.mockResolvedValue({
      data: [{
        id: 'cs_paid_user123',
        metadata: { toolName: 'paidUserTool' },
        payment_status: 'paid',
        amount_total: 4999,
        currency: 'usd',
        created: 1703448000,
        subscription: 'sub_paid123',
      }],
    });

    mockStripe.subscriptions.list.mockResolvedValue({
      data: [{
        items: {
          data: [{ price: { id: 'price_paid123' } }],
        },
      }],
    });

    await registerAnalyticsPaidTool(
      mockMcpServer,
      'paidUserTool',
      'Premium tool with result tracking',
      { feature: z.string(), apiKey: z.string() },
      callback,
      {
        apiKey: 'test-key',
        paymentReason: 'Premium access',
        stripeSecretKey: 'sk_test_123',
        userEmail: 'paiduser@example.com',
        trackResults: true,
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_paid123', quantity: 1 }],
          mode: 'subscription',
        },
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    
    const result = await wrappedCallback({ 
      feature: 'premium',
      apiKey: 'sk_live_dangerous_secret_key_67890'
    }, mockExtra);

    expect(callback).toHaveBeenCalledWith({ 
      feature: 'premium',
      apiKey: 'sk_live_dangerous_secret_key_67890'
    }, mockExtra);

    expect(result.content).toHaveLength(2);
    expect(result.content[0].text).toBe('Premium feature executed');
    expect(result.content[1].text).toContain('API_KEY_abc123xyz');
    expect(result.metadata.premiumFeature).toBe(true);

    expect(mockQueueEvent).toHaveBeenCalled();
    const completedCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.payment_completed'
    );
    
    expect(completedCall).toBeTruthy();
    if (completedCall) {
      expect(completedCall[0].success).toBe(true);
      expect(completedCall[0].parameters.feature).toBe('premium');
      expect(completedCall[0].parameters.apiKey).toBe('[REDACTED]');
      expect(completedCall[0].result).toBeDefined();
      expect(completedCall[0].result.content).toBeDefined();
      expect(completedCall[0].duration).toBeGreaterThan(0);
      expect(completedCall[0].customerId).toBe('cus_paid_user123');
      expect(completedCall[0].paymentAmount).toBe(4999);
      expect(completedCall[0].paymentCurrency).toBe('usd');
      expect(completedCall[0].subscriptionId).toBe('sub_paid123');
    }
  });

  it('📊 USAGE BILLING TEST: Records usage with payment tracking', async () => {
    const callback = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'API call completed' }],
      usage: {
        tokensUsed: 1500,
        apiCalls: 1,
        executionTime: 230
      }
    });

    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_usage123', email: 'usage@example.com' }],
    });

    mockStripe.checkout.sessions.list.mockResolvedValue({
      data: [{
        id: 'cs_usage123',
        metadata: { toolName: 'usageTool' },
        payment_status: 'paid',
        amount_total: 0,
        currency: 'usd',
        created: 1703448000,
        subscription: 'sub_usage123',
      }],
    });

    await registerAnalyticsPaidTool(
      mockMcpServer,
      'usageTool',
      'Usage-based tool',
      { calls: z.number(), password: z.string() },
      callback,
      {
        apiKey: 'test-key',
        paymentReason: 'API usage',
        meterEvent: 'api.call',
        stripeSecretKey: 'sk_test_123',
        userEmail: 'usage@example.com',
        trackResults: true,
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_usage123' }],
          mode: 'subscription',
        },
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    
    await wrappedCallback({ 
      calls: 10, 
      password: 'super_secret_password_123' 
    }, mockExtra);

    expect(mockStripe.billing.meterEvents.create).toHaveBeenCalledWith({
      event_name: 'api.call',
      payload: {
        stripe_customer_id: 'cus_usage123',
        value: '1',
      },
    });

    const usageCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.payment_completed'
    );
    
    expect(usageCall).toBeTruthy();
    if (usageCall) {
      expect(usageCall[0].paymentType).toBe('usageBased');
      expect(usageCall[0].customerId).toBe('cus_usage123');
      expect(usageCall[0].paymentAmount).toBe(0);
      expect(usageCall[0].subscriptionId).toBe('sub_usage123');
      expect(usageCall[0].parameters.calls).toBe(10);
      expect(usageCall[0].parameters.password).toBe('[REDACTED]');
      expect(usageCall[0].result.usage).toBeDefined();
    }
  });

  it('💥 ERROR TEST: Handles errors with payment context tracking', async () => {
    const errorCallback = vi.fn().mockRejectedValue(new Error('Premium tool failed'));

    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_error123', email: 'error@example.com' }],
    });

    mockStripe.checkout.sessions.list.mockResolvedValue({
      data: [{
        metadata: { toolName: 'errorTool' },
        payment_status: 'paid',
      }],
    });

    await registerAnalyticsPaidTool(
      mockMcpServer,
      'errorTool',
      'Tool that fails',
      { input: z.string(), token: z.string() },
      errorCallback,
      {
        apiKey: 'test-key',
        paymentReason: 'Error test',
        stripeSecretKey: 'sk_test_123',
        userEmail: 'error@example.com',
        trackResults: true,
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_error123', quantity: 1 }],
          mode: 'subscription',
        },
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];

    await expect(wrappedCallback({ 
      input: 'test_input', 
      token: 'secret_token_abc123' 
    }, mockExtra))
      .rejects.toThrow('Premium tool failed');

    expect(errorCallback).toHaveBeenCalledWith({ 
      input: 'test_input', 
      token: 'secret_token_abc123' 
    }, mockExtra);

    expect(mockQueueEvent).toHaveBeenCalled();
    const errorCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.payment_failed'
    );
    
    expect(errorCall).toBeTruthy();
    if (errorCall) {
      expect(errorCall[0].success).toBe(false);
      expect(errorCall[0].errorType).toBe('Error');
      expect(errorCall[0].errorMessage).toBe('Premium tool failed');
      expect(errorCall[0].parameters.input).toBe('test_input');
      expect(errorCall[0].parameters.token).toBe('[REDACTED]');
      expect(errorCall[0].result).toBeUndefined();
      expect(errorCall[0].customerId).toBe('cus_error123');
      expect(errorCall[0].paymentType).toBe('oneTimeSubscription');
    }
  });

  it('🔧 RESULT TRACKING CONTROL TEST: Can disable result tracking for sensitive tools', async () => {
    const sensitiveCallback = vi.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: 'HIGHLY_SENSITIVE: credit_card_4111111111111111, ssn_123456789'
      }],
      sensitiveData: {
        patientId: 'patient_12345',
        diagnosis: 'confidential_medical_info',
        creditScore: 750
      }
    });

    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_sensitive123', email: 'sensitive@example.com' }],
    });

    mockStripe.checkout.sessions.list.mockResolvedValue({
      data: [{
        id: 'cs_sensitive123',
        metadata: { toolName: 'sensitiveTool' },
        payment_status: 'paid',
        amount_total: 9999,
        currency: 'usd',
        created: 1703448000,
      }],
    });

    await registerAnalyticsPaidTool(
      mockMcpServer,
      'sensitiveTool',
      'Sensitive tool without result tracking',
      { patientData: z.string(), apiKey: z.string() },
      sensitiveCallback,
      {
        apiKey: 'test-key',
        paymentReason: 'Sensitive operations',
        stripeSecretKey: 'sk_test_123',
        userEmail: 'sensitive@example.com',
        trackResults: false,
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_sensitive123', quantity: 1 }],
          mode: 'subscription',
        },
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    const result = await wrappedCallback({ 
      patientData: 'sensitive_patient_info',
      apiKey: 'sk_live_medical_api_key_67890'
    }, mockExtra);

    expect(result.content[0].text).toContain('HIGHLY_SENSITIVE');
    expect(result.sensitiveData.patientId).toBe('patient_12345');

    expect(mockQueueEvent).toHaveBeenCalled();
    const sensitiveCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.payment_completed'
    );
    
    expect(sensitiveCall).toBeTruthy();
    if (sensitiveCall) {
      expect(sensitiveCall[0].success).toBe(true);
      expect(sensitiveCall[0].parameters.patientData).toBe('sensitive_patient_info');
      expect(sensitiveCall[0].parameters.apiKey).toBe('[REDACTED]');
      expect(sensitiveCall[0].result).toBeUndefined();
      expect(sensitiveCall[0].customerId).toBe('cus_sensitive123');
      expect(sensitiveCall[0].paymentAmount).toBe(9999);
    }
  });

  it('🛡️ SAFETY TEST: Stripe works without analytics', async () => {
    const callback = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Stripe-only execution' }],
    });

    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_stripe_only123', email: 'stripeonly@example.com' }],
    });

    mockStripe.checkout.sessions.list.mockResolvedValue({
      data: [{
        metadata: { toolName: 'stripeOnlyTool' },
        payment_status: 'paid',
      }],
    });

    await registerAnalyticsPaidTool(
      mockMcpServer,
      'stripeOnlyTool',
      'Stripe without analytics',
      { test: z.string() },
      callback,
      {
        paymentReason: 'Stripe only test',
        stripeSecretKey: 'sk_test_123',
        userEmail: 'stripeonly@example.com',
        trackResults: true,
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_stripe_only123', quantity: 1 }],
          mode: 'subscription',
        },
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    const result = await wrappedCallback({ test: 'stripe_only_input' }, mockExtra);

    expect(mockMcpServer.tool).toHaveBeenCalled();
    expect(result.content[0].text).toBe('Stripe-only execution');

    expect(mockQueueEvent).not.toHaveBeenCalled();
  });

  it('🔒 SENSITIVE DATA: Sanitizes parameters but tracks payment data', async () => {
    const callback = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Secure operation completed' }],
    });

    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_secure123', email: 'secure@example.com' }],
    });

    mockStripe.checkout.sessions.list.mockResolvedValue({
      data: [{
        id: 'cs_secure123',
        metadata: { toolName: 'secureTool' },
        payment_status: 'paid',
        amount_total: 4999,
        currency: 'usd',
        created: 1703448000,
      }],
    });

    await registerAnalyticsPaidTool(
      mockMcpServer,
      'secureTool',
      'Secure tool',
      { 
        action: z.string(),
        apiKey: z.string(),
        password: z.string()
      },
      callback,
      {
        apiKey: 'test-key',
        paymentReason: 'Secure access',
        stripeSecretKey: 'sk_test_123',
        userEmail: 'secure@example.com',
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_secure123', quantity: 1 }],
          mode: 'payment',
        },
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    await wrappedCallback({ 
      action: 'secure_action',
      apiKey: 'sk_live_dangerous_key_123',
      password: 'super_secret_password'
    }, mockExtra);

    const completedCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.payment_completed'
    );

    expect(completedCall).toBeTruthy();
    if (completedCall) {
      expect(completedCall[0]).toMatchObject({
        parameters: {
          action: 'secure_action',
          apiKey: '[REDACTED]',
          password: '[REDACTED]'
        },
        customerId: 'cus_secure123',
        paymentAmount: 4999,
        paymentCurrency: 'usd',
        paymentSessionId: 'cs_secure123',
      });
    }
  });

  it('🔧 STRIPE ERROR TEST: Handles Stripe API failures gracefully', async () => {
    const callback = vi.fn();

    mockStripe.customers.list.mockRejectedValue(new Error('Stripe API error'));

    await registerAnalyticsPaidTool(
      mockMcpServer,
      'stripeErrorTool',
      'Tool with Stripe errors',
      { test: z.string(), secret: z.string() },
      callback,
      {
        apiKey: 'test-key',
        paymentReason: 'Stripe error test',
        stripeSecretKey: 'sk_test_invalid',
        userEmail: 'stripeerror@example.com',
        trackResults: true,
        checkout: {
          success_url: 'https://example.com/success',
          line_items: [{ price: 'price_error123', quantity: 1 }],
          mode: 'subscription',
        },
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];

    await expect(wrappedCallback({ 
      test: 'error_input',
      secret: 'secret_key_for_error_test'
    }, mockExtra))
      .rejects.toThrow('Stripe API error');

    expect(mockQueueEvent).toHaveBeenCalled();
    const stripeErrorCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.payment_failed'
    );
    
    expect(stripeErrorCall).toBeTruthy();
    if (stripeErrorCall) {
      expect(stripeErrorCall[0].errorMessage).toBe('Stripe API error');
      expect(stripeErrorCall[0].parameters.test).toBe('error_input');
      expect(stripeErrorCall[0].parameters.secret).toBe('[REDACTED]');
    }
  });

  it('🎯 COMPREHENSIVE: All payment fields tracked correctly', async () => {
    const callback = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Complete test passed' }],
    });

    mockStripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_complete123', email: 'complete@example.com' }],
    });

    mockStripe.checkout.sessions.list.mockResolvedValue({
      data: [{
        id: 'cs_complete123',
        metadata: { toolName: 'completeTool' },
        payment_status: 'paid',
        amount_total: 9999,
        currency: 'eur',
        created: 1703534400,
        subscription: 'sub_complete123',
      }],
    });

    await registerAnalyticsPaidTool(
      mockMcpServer,
      'completeTool',
      'Complete test tool',
      { test: z.string() },
      callback,
      {
        apiKey: 'test-complete-key',
        serverName: 'Complete Server',
        serverVersion: '2.0.0',
        environment: 'test',
        paymentReason: 'Complete test',
        stripeSecretKey: 'sk_test_complete_123',
        userEmail: 'complete@example.com',
        trackResults: true,
        checkout: {
          success_url: 'https://example.com/complete/success',
          line_items: [{ price: 'price_complete123', quantity: 1 }],
          mode: 'subscription',
        },
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    await wrappedCallback({ test: 'complete' }, mockExtra);

    const completedCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.payment_completed'
    );

    expect(completedCall).toBeTruthy();
    if (completedCall) {
      expect(completedCall[0]).toMatchObject({
        eventType: 'mcp.tool.payment_completed',
        serverName: 'Test Analytics Stripe Server',
        serverVersion: '1.0.0',
        environment: 'test',
        toolName: 'completeTool',
        success: true,
        customerId: 'cus_complete123',
        paymentAmount: 9999,
        paymentCurrency: 'eur',
        paymentDate: '2023-12-25T20:00:00.000Z',
        paymentSessionId: 'cs_complete123',
        paymentType: 'oneTimeSubscription',
        paymentStatus: 'paid',
        subscriptionId: 'sub_complete123',
        priceId: 'price_complete123',
      });

      expect(completedCall[0].parameters).toEqual({ test: 'complete' });
      expect(completedCall[0].result).toBeDefined();
      expect(completedCall[0].duration).toBeGreaterThan(0);
      expect(completedCall[0].timestamp).toBeGreaterThan(0);
    }
  });

  // ================================
  // FREE ANALYTICS TESTS
  // ================================

  it('📊 FREE ANALYTICS TEST: Free tool tracks without payment context', async () => {
    const callback = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Free analytics tool executed' }],
      metrics: {
        executionTime: 100,
        success: true
      }
    });

    await registerAnalyticsTool(
      mockMcpServer,
      'freeAnalyticsTool',
      'Free tool with analytics only',
      { query: z.string(), limit: z.number() },
      callback,
      {
        apiKey: 'test-analytics-key',
        trackResults: true,
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    await wrappedCallback({ query: 'test_query', limit: 10 }, mockExtra);

    expect(mockQueueEvent).toHaveBeenCalled();
    const analyticsCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.completed'
    );
    
    expect(analyticsCall).toBeTruthy();
    if (analyticsCall) {
      expect(analyticsCall[0].success).toBe(true);
      expect(analyticsCall[0].parameters.query).toBe('test_query');
      expect(analyticsCall[0].parameters.limit).toBe(10);
      expect(analyticsCall[0].result).toBeDefined();
      expect(analyticsCall[0].duration).toBeGreaterThan(0);
      expect(analyticsCall[0].customerId).toBeUndefined();
      expect(analyticsCall[0].paymentAmount).toBeUndefined();
      expect(analyticsCall[0].paymentType).toBeUndefined();
    }
  });

  it('💥 FREE ERROR TEST: Free tool error tracking works correctly', async () => {
    const errorCallback = vi.fn().mockRejectedValue(new Error('Free tool failed'));

    await registerAnalyticsTool(
      mockMcpServer,
      'freeErrorTool',
      'Free tool that fails',
      { input: z.string() },
      errorCallback,
      {
        apiKey: 'test-analytics-key',
        trackResults: true,
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];

    await expect(wrappedCallback({ input: 'test_input' }, mockExtra))
      .rejects.toThrow('Free tool failed');

    expect(mockQueueEvent).toHaveBeenCalled();
    const errorCall = mockQueueEvent.mock.calls.find(call => 
      call[0]?.eventType === 'mcp.tool.failed'
    );
    
    expect(errorCall).toBeTruthy();
    if (errorCall) {
      expect(errorCall[0].success).toBe(false);
      expect(errorCall[0].errorType).toBe('Error');
      expect(errorCall[0].errorMessage).toBe('Free tool failed');
      expect(errorCall[0].parameters.input).toBe('test_input');
      expect(errorCall[0].customerId).toBeUndefined();
      expect(errorCall[0].paymentType).toBeUndefined();
    }
  });
});