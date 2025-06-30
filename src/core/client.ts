import { IngestRequest, IngestResponse, AnalyticsConfig, MCPEvent } from './types.js'
import { APIError } from './errors.js'

/**
 * Analytics client for sending MCP events to the analytics API.
 * Handles batching, automatic flushing, and error recovery.
 */
export class AnalyticsClient {
  private apiKey: string
  private apiUrl: string
  private batchSize: number
  private eventQueue: MCPEvent[] = []
  private flushTimer?: any
  private isDestroyed = false

  /**
   * Creates a new analytics client with automatic batching and flushing.
   * 
   * @param config - Analytics configuration including API key and batching options
   */
  constructor(config: AnalyticsConfig) {
    this.apiKey = config.apiKey
    this.apiUrl = (config.apiUrl || 'https://v1.mcpanalytics.dev').replace(/\/$/, '')
    this.batchSize = Math.min(config.batchSize || 20, 25)
    
    // Set up automatic flushing unless explicitly disabled
    if (config.flushInterval !== 0) {
      this.flushTimer = setInterval(() => {
        if (this.eventQueue.length > 0 && !this.isDestroyed) {
          this.flush()
        }
      }, config.flushInterval || 30000)
    }
  }

  /**
   * Sends a batch of events to the analytics API.
   * 
   * @param events - Array of MCP events to send (max 25 events)
   * @returns Promise resolving to the API response
   * @throws APIError if the request fails or validation errors occur
   */
  async sendEvents(events: MCPEvent[]): Promise<IngestResponse> {
    if (this.isDestroyed) {
      throw new APIError('Client has been destroyed')
    }
    if (!this.apiKey) {
      throw new APIError('Analytics API key not configured')
    }
    if (events.length === 0) {
      throw new APIError('No events to send')
    }
    if (events.length > 25) {
      throw new APIError(`Too many events: ${events.length} (max: 25)`)
    }

    const request: IngestRequest = { events }

    try {
      const response = await fetch(`${this.apiUrl}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { error: { message: errorText } }
        }
        
        throw new APIError(
          errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status
        )
      }

      const result = await response.json()
      return result as IngestResponse
    } catch (error) {
      if (error instanceof APIError) throw error
      throw new APIError(`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Adds an event to the queue for batched sending.
   * Automatically flushes when batch size is reached.
   * 
   * @param event - MCP event to queue for sending
   */
  queueEvent(event: MCPEvent): void {
    if (this.isDestroyed) return
    this.eventQueue.push(event)
    
    // Flush when batch size is reached
    if (this.eventQueue.length >= this.batchSize) {
      this.flush()
    }
  }

  /**
   * Immediately sends all queued events to the analytics API.
   * Called automatically when batch size is reached or on timer.
   */
  async flush(): Promise<void> {
    if (this.isDestroyed || this.eventQueue.length === 0) return
    
    // Extract events to send and remove from queue
    const eventsToSend = this.eventQueue.splice(0, this.batchSize)
    
    try {
      await this.sendEvents(eventsToSend)
    } catch (error) {
      console.warn('[MCP Analytics] Flush failed:', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  /**
   * Cleanly shuts down the analytics client.
   * Stops the flush timer and sends any remaining queued events.
   */
  async destroy(): Promise<void> {
    this.isDestroyed = true
    
    // Clean up the flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = undefined
    }
    
    // Send any remaining events
    await this.flush()
  }
}