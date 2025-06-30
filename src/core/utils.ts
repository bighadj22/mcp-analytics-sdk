export function sanitizeParameters(params: Record<string, any>): Record<string, any> {
  if (!params || typeof params !== 'object') return {}
  
  const sanitized = { ...params }
  const sensitiveKeys = [
    'password', 'token', 'key', 'secret', 'apikey', 'api_key',
    'auth', 'authorization', 'credential', 'pass', 'pwd'
  ]
  
  for (const key in sanitized) {
    const lowerKey = key.toLowerCase()
    if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]'
    }
    
    if (typeof sanitized[key] === 'string' && sanitized[key].length > 1000) {
      sanitized[key] = sanitized[key].substring(0, 1000) + '...[TRUNCATED]'
    }
  }
  
  return sanitized
}

// ← NEW: Result sanitization function
export function sanitizeResult(result: any): any {
  if (!result) return result;
  
  try {
    // Handle MCP-style results with content array
    if (result.content && Array.isArray(result.content)) {
      return {
        ...result,
        content: result.content.map((item: any) => sanitizeContentItem(item))
      };
    }
    
    // Handle other result types
    return sanitizeGenericResult(result);
  } catch (error) {
    // If sanitization fails, return a safe fallback
    return {
      _sanitizationError: 'Failed to sanitize result',
      _resultType: typeof result
    };
  }
}

// ← NEW: Sanitize individual content items
function sanitizeContentItem(item: any): any {
  if (!item || typeof item !== 'object') return item;
  
  let sanitized = { ...item }; // ← FIXED: Changed const to let
  
  // Handle different content types
  switch (item.type) {
    case 'text':
      if (typeof item.text === 'string') {
        // Truncate long text content (start lenient)
        if (item.text.length > 2000) {
          sanitized.text = item.text.substring(0, 2000) + '...[TRUNCATED]';
          sanitized._originalLength = item.text.length;
        }
      }
      break;
      
    case 'image':
      // Don't store image data, just metadata
      if (item.data) {
        sanitized.data = '[BINARY_DATA_REMOVED]';
        sanitized._dataSize = typeof item.data === 'string' ? item.data.length : 'unknown';
        sanitized._mimeType = item.mimeType || 'unknown';
      }
      break;
      
    case 'resource':
      // Keep resource references but truncate large content
      if (item.text && typeof item.text === 'string' && item.text.length > 1000) {
        sanitized.text = item.text.substring(0, 1000) + '...[TRUNCATED]';
        sanitized._originalLength = item.text.length;
      }
      break;
      
    default:
      // Handle unknown content types safely
      sanitized = sanitizeGenericResult(item);
  }
  
  return sanitized;
}

// ← NEW: Generic result sanitization
function sanitizeGenericResult(result: any): any {
  if (typeof result === 'string') {
    if (result.length > 2000) {
      return result.substring(0, 2000) + '...[TRUNCATED]';
    }
    return result;
  }
  
  if (typeof result === 'number' || typeof result === 'boolean') {
    return result;
  }
  
  if (Array.isArray(result)) {
    // Limit array size (start lenient)
    const truncatedArray = result.slice(0, 20);
    return {
      _type: 'array',
      _originalLength: result.length,
      items: truncatedArray.map(item => sanitizeGenericResult(item))
    };
  }
  
  if (result && typeof result === 'object') {
    const sanitized: any = {};
    let fieldCount = 0;
    
    for (const [key, value] of Object.entries(result)) {
      if (fieldCount >= 50) { // Start lenient
        sanitized._truncated = true;
        sanitized._totalFields = Object.keys(result).length;
        break;
      }
      
      // Handle binary data
      if (value instanceof Uint8Array || Buffer.isBuffer?.(value)) {
        sanitized[key] = `[BINARY_DATA:${value.length}_bytes]`;
      } else {
        sanitized[key] = sanitizeGenericResult(value);
      }
      fieldCount++;
    }
    
    return sanitized;
  }
  
  return result;
}