<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/static/logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="src/static/logo-light.png">
    <img alt="MCP Analytics Logo" src="https://mcpanalytics.dev/logo-light.png" width="80%">
  </picture>
</div>

<h3 align="center">
    <a href="https://mcpanalytics.dev">Getting Started</a>
    <span> · </span>
    <a href="https://mcpanalytics.dev/#features">Features</a>
    <span> · </span>
    <a href="https://docs.mcpanalytics.dev">Docs</a>
    <span> · </span>
    <a href="https://mcpanalytics.dev">Website</a>
    <span> · </span>
    <a href="https://github.com/bighadj22/mcp-analytics-sdk">Open Source</a>
    <span> · </span>
</h3>

<p align="center">

  <a href="https://www.npmjs.com/package/mcp-analytics"><img src="https://img.shields.io/npm/dm/mcp-analytics.svg" alt="npm downloads"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg" alt="TypeScript"></a>
</p>

<br>

# 📊 MCP Analytics + Payments for Cloudflare

**Add powerful analytics tracking AND Stripe payments to your Cloudflare MCP servers with just 2 simple changes.**

Track tool usage, user behavior, performance metrics, results, errors, AND process payments automatically while maintaining full compatibility with existing MCP tools built on Cloudflare's platform.

## 🚀 Quick Start

### Installation
```bash
npm install mcp-analytics
```

### Choose Your Agent Type

#### Free Tools Only (Analytics Only)
```typescript
import { AnalyticsMcpAgent } from 'mcp-analytics';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export class MyMCP extends AnalyticsMcpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: 'My Analytics-Only MCP',
    version: '1.0.0',
  });

  async init() {
    // Free tool with analytics tracking
    this.analyticsTool(
      'add',
      'Add two numbers',
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: 'text', text: `Result: ${a + b}` }],
      })
    );
  }
}
```

#### Free + Paid Tools (Analytics + Payments)
```typescript
import { AnalyticsPaidMcpAgent } from 'mcp-analytics';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export class MyMCP extends AnalyticsPaidMcpAgent<Env, PaymentState, PaymentProps> {
  server = new McpServer({
    name: 'My Analytics + Payments MCP',
    version: '1.0.0',
  });

  async init() {
    // Free tool with analytics
    this.analyticsTool(
      'add',
      'Add two numbers',
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: 'text', text: `Result: ${a + b}` }],
      })
    );

    // Paid tool with analytics + payments
    this.analyticsPaidTool(
      'generate_image',
      'Generate AI image with premium quality',
      { prompt: z.string() },
      async ({ prompt }) => ({
        content: [{ type: 'text', text: `Generated image for: ${prompt}` }],
      }),
      {
        checkout: {
          success_url: 'https://yoursite.com/success',
          line_items: [{ price: 'price_123', quantity: 1 }],
          mode: 'payment',
        },
        paymentReason: 'High-quality AI image generation',
      }
    );
  }
}
```

### Environment Variables
```bash
# Required for analytics
MCP_ANALYTICS_API_KEY=your_analytics_api_key

# Required for paid tools
STRIPE_SECRET_KEY=your_stripe_secret_key

# Optional
MCP_ANALYTICS_ENABLED=true
ENVIRONMENT=production
```

## 🏗️ Platform Requirements

**This SDK is specifically designed for Cloudflare MCP Agents:**

- ✅ **Cloudflare Workers** - Deploys on Cloudflare's edge platform
- ✅ **Cloudflare MCP Agent** - Extends the `McpAgent` class from `agents/mcp`
- ✅ **Durable Objects** - Automatic session management and state persistence
- ✅ **OAuth Provider Library** - Built-in authentication with `@cloudflare/workers-oauth-provider`

**Not compatible with:**
- ❌ Local MCP servers (stdio-based)
- ❌ Other cloud platforms (AWS, GCP, Azure)
- ❌ Standard MCP SDK without Cloudflare extensions

## 🎯 What Gets Tracked Automatically

### For All Tools (Free + Paid)
- ✅ **Tool execution time** - How long each tool takes to run
- ✅ **Success/failure status** - Which tools succeed or fail
- ✅ **Input parameters** - What data users provide (sensitive data auto-redacted)
- ✅ **Tool results** - Output data from tool executions (automatically sanitized)
- ✅ **Error details** - Full error information when tools fail
- ✅ **User information** - Automatic user identification from OAuth props
- ✅ **Session tracking** - Group tool calls by user session
- ✅ **Server metadata** - Server name and version automatically detected

### Additional for Paid Tools
- 💳 **Payment events** - Payment required, completed, failed
- 💳 **Payment amounts** - Dollar amounts and currency
- 💳 **Customer data** - Stripe customer IDs and payment sessions
- 💳 **Payment types** - One-time, subscription, usage-based billing
- 💳 **Revenue tracking** - Track revenue by tool, user, server
- 💳 **Subscription status** - Active subscriptions and cancellations

## 💳 Payment Integration with Stripe

The `AnalyticsPaidMcpAgent` provides seamless Stripe integration with automatic analytics tracking:

### Payment Event Types
- `mcp.tool.payment_required` - User needs to pay to use tool
- `mcp.tool.payment_completed` - Payment successful, tool executed
- `mcp.tool.payment_failed` - Payment or tool execution failed

### Usage-Based Billing Example
```typescript
this.analyticsPaidTool(
  'api_call',
  'Make API call with usage-based billing',
  { endpoint: z.string() },
  async ({ endpoint }) => {
    // Your API call logic
    return { content: [{ type: 'text', text: 'API response' }] };
  },
  {
    checkout: {
      success_url: 'https://yoursite.com/success',
      line_items: [{ price: 'price_usage_123' }],
      mode: 'subscription',
    },
    meterEvent: 'api_call', // Records usage for billing
    paymentReason: 'Pay per API call',
  }
);
```

### One-Time Payment Example
```typescript
this.analyticsPaidTool(
  'premium_analysis',
  'Advanced data analysis (one-time payment)',
  { data: z.array(z.number()) },
  async ({ data }) => {
    // Premium analysis logic
    return { content: [{ type: 'text', text: 'Analysis complete' }] };
  },
  {
    checkout: {
      success_url: 'https://yoursite.com/success',
      line_items: [{ price: 'price_onetime_123', quantity: 1 }],
      mode: 'payment',
    },
    paymentReason: 'One-time premium analysis',
  }
);
```

## 🔒 User Tracking with OAuth

### Automatic User Detection
The SDK automatically extracts user information from `this.props` when available:

```typescript
// These props are automatically detected and tracked:
{
  userId: props.userId || props.sub || props.email,
  email: props.email || props.userEmail, 
  username: props.username || props.name,
  authProvider: props.authProvider || 'oauth'
}
```

### Works with Any OAuth Provider
- **Google** ✅ (tested)
- **Logto** ✅ (tested)
- **Auth0** ✅
- **GitHub** ✅ 
- **Custom OAuth** ✅

## 📊 Example Analytics Events

### Free Tool Event
```json
{
  "eventType": "mcp.tool.completed",
  "timestamp": 1750360317997,
  "serverName": "My Analytics MCP",
  "toolName": "add",
  "parameters": { "a": 5, "b": 3 },
  "result": { "content": [{ "type": "text", "text": "8" }] },
  "duration": 156,
  "success": true,
  "userId": "john@gmail.com",
  "email": "john@gmail.com"
}
```

### Paid Tool Event (Payment Required)
```json
{
  "eventType": "mcp.tool.payment_required",
  "timestamp": 1750360317997,
  "serverName": "My Paid MCP",
  "toolName": "generate_image",
  "parameters": { "prompt": "sunset over mountains" },
  "duration": 89,
  "success": false,
  "customerId": "cus_stripe123",
  "paymentType": "oneTimeSubscription",
  "paymentStatus": "required",
  "priceId": "price_123",
  "userId": "john@gmail.com"
}
```

### Paid Tool Event (Payment Completed)
```json
{
  "eventType": "mcp.tool.payment_completed",
  "timestamp": 1750360318997,
  "serverName": "My Paid MCP",
  "toolName": "generate_image",
  "parameters": { "prompt": "sunset over mountains" },
  "result": { "content": [{ "type": "text", "text": "Image generated successfully" }] },
  "duration": 2340,
  "success": true,
  "customerId": "cus_stripe123",
  "paymentAmount": 999,
  "paymentCurrency": "usd",
  "paymentSessionId": "cs_stripe456",
  "paymentType": "oneTimeSubscription",
  "paymentStatus": "paid",
  "priceId": "price_123",
  "userId": "john@gmail.com"
}
```

## 🌟 Complete Example: Free + Paid Tools

```typescript
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AnalyticsPaidMcpAgent, PaymentState, PaymentProps } from "mcp-analytics";
import { z } from "zod";
import { GoogleHandler } from "./google-handler";

type Props = PaymentProps & {
  name: string;
  email: string;
  accessToken: string;
};

type State = PaymentState & {};

export class MyMCP extends AnalyticsPaidMcpAgent<Env, State, Props> {
  server = new McpServer({
    name: "Demo Analytics + Payments MCP",
    version: "1.0.0",
  });

  initialState: State = {};

  async init() {
    // Free tool - analytics only
    this.analyticsTool(
      'add',
      'Add two numbers together',
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: 'text', text: `${a} + ${b} = ${a + b}` }],
      })
    );

    // Paid tool - analytics + payments
    this.analyticsPaidTool(
      'generate_emoji',
      'Generate an emoji given a single word',
      { object: z.string().describe('one word') },
      ({ object }) => ({
        content: [{ type: 'text', text: generateImage(object) }],
      }),
      {
        checkout: {
          success_url: 'https://yoursite.com/success',
          line_items: [{ price: 'price_emoji_123' }],
          mode: 'subscription',
        },
        meterEvent: 'image_generation',
        paymentReason: 'You get 3 free generations, then we charge 10 cents per generation.',
      }
    );
  }
}

export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: MyMCP.mount("/sse"),
  defaultHandler: GoogleHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
```

## 📈 Migration Guide

### From Stripe Agent Toolkit
```typescript
// Before (Stripe Agent Toolkit)
import { experimental_PaidMcpAgent as PaidMcpAgent } from '@stripe/agent-toolkit/cloudflare';

export class MyMCP extends PaidMcpAgent<Bindings, State, Props> {
  async init() {
    this.paidTool('tool_name', 'description', schema, callback, options);
  }
}

// After (MCP Analytics)
import { AnalyticsPaidMcpAgent } from 'mcp-analytics';

export class MyMCP extends AnalyticsPaidMcpAgent<Env, State, Props> {
  async init() {
    // Same exact API + automatic analytics
    this.analyticsPaidTool('tool_name', 'description', schema, callback, options);
  }
}
```

### From Standard Cloudflare MCP Agent
```typescript
// Before (Standard Cloudflare MCP Agent)
import { McpAgent } from "agents/mcp";

export class MyMCP extends McpAgent<Env, State, Props> {
  async init() {
    this.server.tool("add", { a: z.number(), b: z.number() }, callback);
  }
}

// After (Analytics-Enabled)
import { AnalyticsMcpAgent } from 'mcp-analytics';

export class MyMCP extends AnalyticsMcpAgent<Env, State, Props> {
  async init() {
    this.analyticsTool("add", "Add two numbers", { a: z.number(), b: z.number() }, callback);
  }
}

// Or for paid tools
import { AnalyticsPaidMcpAgent } from 'mcp-analytics';

export class MyMCP extends AnalyticsPaidMcpAgent<Env, State, Props> {
  async init() {
    // Free tools
    this.analyticsTool("add", "Add two numbers", schema, callback);
    
    // Paid tools
    this.analyticsPaidTool("premium", "Premium feature", schema, callback, paymentOptions);
  }
}
```

## 🔧 API Reference

### AnalyticsMcpAgent (Free Tools Only)

#### analyticsTool()
```typescript
this.analyticsTool<TSchema extends Record<string, z.ZodType>>(
  toolName: string,
  toolDescription: string,
  paramsSchema: TSchema,
  callback: (params: { [K in keyof TSchema]: z.infer<TSchema[K]> }) => any,
  options?: {
    trackResults?: boolean;  // Default: true
    batchSize?: number;      // Default: 20
    flushInterval?: number;  // Default: 30000ms
  }
): void
```

### AnalyticsPaidMcpAgent (Free + Paid Tools)

Extends `AnalyticsMcpAgent` with additional payment capabilities:

#### analyticsTool() 
Same as above - for free tools with analytics tracking.

#### analyticsPaidTool()
```typescript
this.analyticsPaidTool<TSchema extends ZodRawShape>(
  toolName: string,
  toolDescription: string,
  paramsSchema: TSchema,
  callback: ToolCallback<TSchema>,
  options: {
    // Payment configuration (required)
    checkout: Stripe.Checkout.SessionCreateParams;
    paymentReason: string;
    
    // Optional payment settings
    meterEvent?: string;     // For usage-based billing
    
    // Optional analytics settings
    trackResults?: boolean;  // Default: true
    batchSize?: number;      // Default: 20
    flushInterval?: number;  // Default: 30000ms
  }
): void
```

## 🔒 Data Privacy & Security

### Automatic Data Sanitization
Sensitive parameters and results are automatically redacted:

```typescript
// Input parameters
{
  username: "john_doe",
  password: "secret123",    // ⚠️ Sensitive
  apiKey: "sk_test_123",    // ⚠️ Sensitive
  creditCard: "4111-1111"   // ⚠️ Sensitive
}

// Tracked parameters (auto-sanitized)
{
  username: "john_doe",
  password: "[REDACTED]",   // ✅ Protected
  apiKey: "[REDACTED]",     // ✅ Protected
  creditCard: "[REDACTED]"  // ✅ Protected
}
```

### Protected Field Names
- `password`, `pass`, `pwd`
- `token`, `apikey`, `api_key`
- `secret`, `key`, `auth`
- `authorization`, `credential`
- `creditcard`, `cc`, `cvv`

### Disable Result Tracking for Sensitive Tools

```typescript
// Normal tool - tracks everything including results
this.analyticsTool('add', 'Add numbers', schema, callback);

// Sensitive tool - disable result tracking for privacy
this.analyticsTool(
  'processDocument', 
  'Process sensitive document', 
  schema, 
  callback,
  { trackResults: false }  // ← Tool calls tracked, results ignored
);

// Paid sensitive tool - payment tracked, results ignored
this.analyticsPaidTool(
  'generateMedicalReport',
  'Generate confidential medical report',
  schema,
  callback,
  {
    checkout: { /* payment config */ },
    paymentReason: 'Medical report generation',
    trackResults: false  // ← Payment data tracked, results protected
  }
);
```


## ⚙️ Configuration

### Environment Variables
```bash
# Analytics (Required for tracking)
MCP_ANALYTICS_API_KEY=your_analytics_api_key

# Payments (Required for AnalyticsPaidMcpAgent)
STRIPE_SECRET_KEY=your_stripe_secret_key

# Optional Settings
MCP_ANALYTICS_ENABLED=true                    # Enable/disable analytics
ENVIRONMENT=production                         # Environment tag
MCP_ANALYTICS_API_URL=https://custom.api.com  # Custom analytics endpoint
```

### Cloudflare Deployment
```bash
# Local development (.dev.vars file)
MCP_ANALYTICS_API_KEY=your_key_here
STRIPE_SECRET_KEY=your_stripe_key_here

# Production deployment
npx wrangler secret put MCP_ANALYTICS_API_KEY
npx wrangler secret put STRIPE_SECRET_KEY
```

## 📊 Benefits

### For Developers
- **Minimal code changes** - Only 2 changes needed: import and method
- **Full type safety** - Complete TypeScript support with generics
- **Automatic server detection** - No duplicate configuration needed
- **Automatic user tracking** - Works with any OAuth provider
- **Payment integration** - Stripe payments with zero additional code
- **Performance insights** - See which tools are slow
- **Error monitoring** - Get notified when tools fail
- **Revenue tracking** - Track payments and revenue automatically
- **Flexible tracking** - Disable result tracking for sensitive tools

### For Business
- **User behavior analysis** - Which tools are most popular?
- **Performance optimization** - Identify bottlenecks
- **Revenue analytics** - Track income by tool, user, time period
- **Payment insights** - Conversion rates, failed payments, churn
- **Error reduction** - Fix issues before users complain  
- **Growth insights** - Track user engagement over time

## 🆚 Comparison

| Feature | Standard MCP | AnalyticsMcpAgent | AnalyticsPaidMcpAgent |
|---------|-------------|-------------------|----------------------|
| **Basic Tools** | ✅ | ✅ | ✅ |
| **Analytics Tracking** | ❌ | ✅ | ✅ |
| **User Tracking** | ❌ | ✅ | ✅ |
| **Performance Metrics** | ❌ | ✅ | ✅ |
| **Error Tracking** | ❌ | ✅ | ✅ |
| **Payment Processing** | ❌ | ❌ | ✅ |
| **Revenue Tracking** | ❌ | ❌ | ✅ |
| **Usage Billing** | ❌ | ❌ | ✅ |
| **Subscription Support** | ❌ | ❌ | ✅ |
| **Free + Paid Tools** | ❌ | ❌ | ✅ |
| **Stripe Integration** | ❌ | ❌ | ✅ |
| **Payment Analytics** | ❌ | ❌ | ✅ |
| **Setup Complexity** | 🟢 Simple | 🟢 Simple | 🟢 Simple |

## 🚀 Getting Started Checklist

### For Analytics Only
1. ✅ Install: `npm install mcp-analytics`
2. ✅ Get API key from [https://mcpanalytics.dev](https://mcpanalytics.dev)
3. ✅ Import: `AnalyticsMcpAgent`
4. ✅ Replace: `server.tool` → `analyticsTool`
5. ✅ Deploy with `MCP_ANALYTICS_API_KEY`

### For Analytics + Payments
1. ✅ Install: `npm install mcp-analytics`
2. ✅ Get analytics key from [https://mcpanalytics.dev](https://mcpanalytics.dev)
3. ✅ Get Stripe secret key from [https://stripe.com](https://stripe.com)
4. ✅ Import: `AnalyticsPaidMcpAgent`
5. ✅ Use: `analyticsTool` for free tools
6. ✅ Use: `analyticsPaidTool` for paid tools
7. ✅ Deploy with both API keys

## 📈 Best Practices

### ✅ Do's
- Use `AnalyticsPaidMcpAgent` for maximum flexibility (supports both free and paid tools)
- Add descriptive tool names and descriptions for better analytics
- Test with analytics disabled to ensure fallback works
- Set environment variables in Cloudflare Workers
- Disable result tracking for large binary outputs or sensitive data
- Use usage-based billing for APIs and compute-intensive tools
- Use one-time payments for premium features

### ❌ Don'ts
- Don't track sensitive data manually (auto-sanitization handles it)
- Don't rely on analytics for critical app logic
- Don't forget to set your API keys
- Don't enable result tracking for image/video generation tools
- Don't mix payment logic with tool logic (SDK handles it automatically)

## 🤝 Support

- 📧 **Email**: contact@mcpanalytics.dev
- 📖 **Documentation**: [https://docs.mcpanalytics.dev](https://docs.mcpanalytics.dev)


---

## License

MIT License - see [LICENSE](LICENSE) file for details.

**Start tracking your MCP analytics and processing payments today! 🚀💳**