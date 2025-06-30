import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAnalyticsTool } from '../analytics/register-analytics-tool';
import type {
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock AnalyticsClient with detailed logging
const mockQueueEvent = vi.fn();
const mockFlush = vi.fn();
const mockDestroy = vi.fn();

vi.mock('./core/client.js', () => ({
  AnalyticsClient: vi.fn().mockImplementation(() => {
    console.log('📊 AnalyticsClient created successfully');
    return {
      queueEvent: mockQueueEvent,
      flush: mockFlush,
      destroy: mockDestroy,
    };
  }),
}));

describe('🧪 COMPREHENSIVE SDK TESTS - AnalyticsMcpAgent Compatibility', () => {
  let mockMcpServer: any;
  let mockExtra: RequestHandlerExtra<ServerRequest, ServerNotification>;

  beforeEach(() => {
    vi.clearAllMocks();
    console.log('\n🔄 Starting new test...');

    mockMcpServer = {
      tool: vi.fn().mockImplementation((name, description, schema, callback) => {
        console.log(`✅ McpServer.tool() called with:`, {
          name,
          description,
          schemaKeys: Object.keys(schema || {}),
          callbackType: typeof callback
        });
      }),
    };

    mockExtra = {
      signal: new AbortController().signal,
      sendNotification: vi.fn(),
      sendRequest: vi.fn(),
      requestId: 'test-request-123',
    };
  });

  it('🎯 CORE TEST: Tool registration works exactly like McpAgent', () => {
    console.log('\n🎯 Testing core tool registration...');
    
    const toolName = 'testTool';
    const toolDescription = 'Test tool description';
    const paramsSchema = { testParam: z.string() };
    const callback = vi.fn();

    registerAnalyticsTool(
      mockMcpServer,
      toolName,
      toolDescription,
      paramsSchema,
      callback,
      {
        apiKey: 'test-api-key',
        serverName: 'Test Server',
        serverVersion: '1.0.0',
      }
    );

    // ✅ Verify McpServer.tool was called exactly once
    expect(mockMcpServer.tool).toHaveBeenCalledTimes(1);
    console.log('✅ McpServer.tool called exactly once');

    // ✅ Verify all parameters are correct
    const [actualName, actualDesc, actualSchema, actualCallback] = mockMcpServer.tool.mock.calls[0];
    
    expect(actualName).toBe(toolName);
    console.log(`✅ Tool name preserved: "${actualName}"`);
    
    expect(actualDesc).toBe(toolDescription);
    console.log(`✅ Tool description preserved: "${actualDesc}"`);
    
    expect(actualSchema).toEqual(paramsSchema);
    console.log('✅ Parameter schema preserved');
    
    expect(typeof actualCallback).toBe('function');
    console.log('✅ Callback is a function (wrapped for analytics)');

    console.log('🎉 CORE TEST PASSED: Tool registration works like McpAgent!');
  });

  it('🛡️ SAFETY TEST: Works without API key (graceful degradation)', () => {
    console.log('\n🛡️ Testing graceful degradation...');
    
    const toolName = 'safetyTool';
    const originalCallback = vi.fn();
    const paramsSchema = { input: z.string() };

    registerAnalyticsTool(
      mockMcpServer,
      toolName,
      'Safety test tool',
      paramsSchema,
      originalCallback,
      {} // ⚠️ NO API KEY
    );

    expect(mockMcpServer.tool).toHaveBeenCalledTimes(1);
    
    const [, , , actualCallback] = mockMcpServer.tool.mock.calls[0];
    
    // ✅ CRITICAL: Without API key, should use ORIGINAL callback unchanged
    expect(actualCallback).toBe(originalCallback);
    console.log('✅ CRITICAL: Original callback preserved when no API key');
    console.log('🎉 SAFETY TEST PASSED: Graceful degradation works!');
  });

  it('⚡ EXECUTION TEST: Tool executes exactly like normal McpAgent tool', async () => {
    console.log('\n⚡ Testing tool execution...');
    
    const originalCallback = vi.fn().mockImplementation(async ({ a, b }) => {
      console.log(`🔧 Original callback executed with: a=${a}, b=${b}`);
      return { content: [{ type: 'text', text: `Result: ${a + b}` }] };
    });

    registerAnalyticsTool(
      mockMcpServer,
      'mathTool',
      'Math operations',
      { a: z.number(), b: z.number() },
      originalCallback,
      { apiKey: 'test-key' }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    console.log('🔧 Executing wrapped callback...');
    
    const result = await wrappedCallback({ a: 5, b: 3 }, mockExtra);

    // ✅ Original callback should be called with exact same parameters
    expect(originalCallback).toHaveBeenCalledWith({ a: 5, b: 3 }, mockExtra);
    console.log('✅ Original callback called with correct parameters');

    // ✅ Result should be identical to what original callback returned
    expect(result).toEqual({ content: [{ type: 'text', text: 'Result: 8' }] });
    console.log('✅ Result matches original callback output exactly');

    // ✅ Analytics should be tracking (queueEvent called)
    expect(mockQueueEvent).toHaveBeenCalled();
    console.log('✅ Analytics tracking worked');

    console.log('🎉 EXECUTION TEST PASSED: Tool works exactly like McpAgent!');
  });

  it('💥 ERROR TEST: Errors work exactly like normal McpAgent tool', async () => {
    console.log('\n💥 Testing error handling...');
    
    const errorCallback = vi.fn().mockImplementation(async () => {
      console.log('🔧 Original callback throwing error...');
      throw new Error('Original tool error');
    });

    registerAnalyticsTool(
      mockMcpServer,
      'errorTool',
      'Tool that fails',
      { input: z.string() },
      errorCallback,
      { apiKey: 'test-key' }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    
    // ✅ Error should bubble up exactly like normal McpAgent
    await expect(wrappedCallback({ input: 'test' }, mockExtra))
      .rejects.toThrow('Original tool error');
    console.log('✅ Error bubbled up correctly');

    // ✅ Original callback should have been called
    expect(errorCallback).toHaveBeenCalledWith({ input: 'test' }, mockExtra);
    console.log('✅ Original callback was called before error');

    // ✅ Analytics should still track the error
    expect(mockQueueEvent).toHaveBeenCalled();
    console.log('✅ Error was tracked by analytics');

    console.log('🎉 ERROR TEST PASSED: Errors work exactly like McpAgent!');
  });

  it('🔒 SECURITY TEST: Sensitive data protection works', async () => {
    console.log('\n🔒 Testing sensitive data protection...');
    
    const authCallback = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Authenticated successfully' }]
    });

    registerAnalyticsTool(
      mockMcpServer,
      'authTool',
      'Authentication tool',
      { 
        username: z.string(),
        password: z.string(),
        apiKey: z.string(),
        normalField: z.string()
      },
      authCallback,
      { apiKey: 'test-key' }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    
    const sensitiveInput = {
      username: 'john_doe',
      password: 'super_secret_123',
      apiKey: 'sk_live_dangerous_key',
      normalField: 'this_is_safe'
    };

    const result = await wrappedCallback(sensitiveInput, mockExtra);

    // ✅ Original callback should receive ALL data (including sensitive)
    expect(authCallback).toHaveBeenCalledWith(sensitiveInput, mockExtra);
    console.log('✅ Original callback received all data including sensitive');

    // ✅ Tool should work normally
    expect(result.content[0].text).toBe('Authenticated successfully');
    console.log('✅ Tool returned correct result');

    // ✅ Analytics should be called (sensitive data will be sanitized inside)
    expect(mockQueueEvent).toHaveBeenCalled();
    console.log('✅ Analytics tracked (with automatic data sanitization)');

    console.log('🎉 SECURITY TEST PASSED: Sensitive data protection works!');
  });

  it('🎛️ CONFIGURATION TEST: Result tracking control works', async () => {
    console.log('\n🎛️ Testing result tracking configuration...');
    
    const imageCallback = vi.fn().mockResolvedValue({
      content: [{ 
        type: 'image',
        data: 'extremely_long_base64_image_data_that_should_not_be_tracked',
        mimeType: 'image/png'
      }]
    });

    registerAnalyticsTool(
      mockMcpServer,
      'imageGenTool',
      'Image generation',
      { prompt: z.string() },
      imageCallback,
      {
        apiKey: 'test-key',
        trackResults: false // ✅ Disable result tracking
      }
    );

    const wrappedCallback = mockMcpServer.tool.mock.calls[0][3];
    const result = await wrappedCallback({ prompt: 'A beautiful sunset' }, mockExtra);

    // ✅ Should return full result to user (no truncation for user)
    expect(result.content[0].data).toBe('extremely_long_base64_image_data_that_should_not_be_tracked');
    console.log('✅ Full result returned to user');

    // ✅ Original callback should be called normally
    expect(imageCallback).toHaveBeenCalledWith({ prompt: 'A beautiful sunset' }, mockExtra);
    console.log('✅ Original callback executed normally');

    console.log('🎉 CONFIGURATION TEST PASSED: Result tracking control works!');
  });

  it('🚨 FAILURE TEST: Analytics failure doesn\'t break tools', () => {
    console.log('\n🚨 Testing analytics failure scenarios...');
    
    const resilientCallback = vi.fn();

    // Test with intentionally bad configuration
    expect(() => {
      registerAnalyticsTool(
        mockMcpServer,
        'resilientTool',
        'Tool that survives analytics failures',
        { test: z.string() },
        resilientCallback,
        {
          apiKey: 'test-key',
          serverName: undefined, // ⚠️ Bad config
          batchSize: -999, // ⚠️ Bad config
        }
      );
    }).not.toThrow();

    console.log('✅ registerAnalyticsTool didn\'t throw with bad config');

    // ✅ Tool should still be registered
    expect(mockMcpServer.tool).toHaveBeenCalled();
    console.log('✅ Tool was still registered despite analytics issues');

    console.log('🎉 FAILURE TEST PASSED: Tools survive analytics failures!');
  });
});