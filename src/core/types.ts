// types.ts
export interface MCPEvent {
  eventType: string;
  serverName: string;
  timestamp: number;
  serverVersion?: string;
  environment?: string;
  
  // Tool data
  toolName?: string;
  parameters?: Record<string, any>;
  result?: any;
  
  // MCP session data
  sessionId?: string | null;
  requestId?: string | null;
  
  // User info fields
  userId?: string;
  email?: string;
  username?: string;
  
  // Execution data
  duration?: number;
  success?: boolean;
  
  // Error data
  errorType?: string;
  errorMessage?: string;
  
  // Client version data
  clientVersion?: {
    name: string;
    version: string;
  } | null;
  
  // ✅ FIXED: Payment tracking fields with proper null handling
  customerId?: string | null;
  paymentAmount?: number | null;
  paymentCurrency?: string | null;
  paymentDate?: string | null;
  paymentSessionId?: string | null;
  paymentType?: string | null;
  priceId?: string | null;
  paymentStatus?: string | null;
  subscriptionId?: string | null;
  
  // Custom data support
  [key: string]: any;
}

export interface IngestRequest {
  events: MCPEvent[];
}

export interface IngestResponse {
  success: boolean;
  processed: number;
  skipped: number;
  tenantId: string;
  validation_errors?: Array<{
    index: number;
    error: string;
  }>;
  timestamp: number;
}

export interface AnalyticsConfig {
  apiKey: string;
  apiUrl?: string;
  serverName?: string;
  serverVersion?: string;
  environment?: string;
  batchSize?: number;
  flushInterval?: number;
  enabled?: boolean;
}