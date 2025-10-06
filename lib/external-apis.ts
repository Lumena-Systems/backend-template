/**
 * Mock external APIs with configurable behavior
 */

// ============================================================================
// Configuration
// ============================================================================

interface ApiConfig {
  sendgrid: {
    rateLimitPerSecond: number;
    errorRate: number; // 0-1, probability of error
    latencyMs: number;
    enabled: boolean;
  };
  salesforce: {
    errorRate: number;
    latencyMs: number;
    enabled: boolean;
  };
  sentiment: {
    errorRate: number;
    latencyMs: number;
    enabled: boolean;
  };
}

export const apiConfig: ApiConfig = {
  sendgrid: {
    rateLimitPerSecond: 500,
    errorRate: 0.05, // 5% error rate
    latencyMs: 200,
    enabled: true
  },
  salesforce: {
    errorRate: 0.02,
    latencyMs: 500,
    enabled: true
  },
  sentiment: {
    errorRate: 0.01,
    latencyMs: 300,
    enabled: true
  }
};

// ============================================================================
// Error Classes
// ============================================================================

export class SendGridError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SendGridError';
  }
}

export class RateLimitError extends SendGridError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class InvalidEmailError extends SendGridError {
  constructor(message: string = 'Invalid email address') {
    super(message);
    this.name = 'InvalidEmailError';
  }
}

export class TimeoutError extends Error {
  constructor(message: string = 'Request timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class SalesforceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalesforceError';
  }
}

export class SentimentAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SentimentAPIError';
  }
}

// ============================================================================
// Rate Limiting
// ============================================================================

class RateLimiter {
  private requests: number[] = [];
  private idempotencyCache = new Map<string, { messageId: string; timestamp: number }>();

  checkRateLimit(limitPerSecond: number): boolean {
    const now = Date.now();
    // Clean up old requests (older than 1 second)
    this.requests = this.requests.filter(time => now - time < 1000);
    
    if (this.requests.length >= limitPerSecond) {
      return false; // Rate limit exceeded
    }
    
    this.requests.push(now);
    return true;
  }

  checkIdempotency(key: string): string | null {
    const cached = this.idempotencyCache.get(key);
    if (cached) {
      // Idempotency keys valid for 24 hours
      if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
        return cached.messageId;
      }
      this.idempotencyCache.delete(key);
    }
    return null;
  }

  cacheIdempotency(key: string, messageId: string): void {
    this.idempotencyCache.set(key, { messageId, timestamp: Date.now() });
  }

  reset(): void {
    this.requests = [];
    this.idempotencyCache.clear();
  }
}

const sendgridLimiter = new RateLimiter();

// ============================================================================
// Mock APIs
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export async function sendEmail(
  to: string,
  body: string,
  idempotencyKey: string
): Promise<string> {
  if (!apiConfig.sendgrid.enabled) {
    throw new SendGridError('SendGrid API is disabled');
  }

  // Check idempotency first
  const cachedMessageId = sendgridLimiter.checkIdempotency(idempotencyKey);
  if (cachedMessageId) {
    console.log(`📧 [SendGrid] Idempotent request detected: ${idempotencyKey} -> ${cachedMessageId}`);
    await sleep(50); // Small delay even for cached
    return cachedMessageId;
  }

  // Simulate latency
  await sleep(apiConfig.sendgrid.latencyMs);

  // Validate email
  if (!to.includes('@') || !to.includes('.')) {
    throw new InvalidEmailError(`Invalid email format: ${to}`);
  }

  // Check rate limit
  if (!sendgridLimiter.checkRateLimit(apiConfig.sendgrid.rateLimitPerSecond)) {
    throw new RateLimitError('SendGrid rate limit exceeded (500/sec)');
  }

  // Random errors
  const rand = Math.random();
  if (rand < apiConfig.sendgrid.errorRate * 0.3) {
    throw new TimeoutError('SendGrid request timeout');
  }
  if (rand < apiConfig.sendgrid.errorRate * 0.6) {
    throw new RateLimitError('SendGrid rate limit exceeded');
  }
  if (rand < apiConfig.sendgrid.errorRate) {
    throw new SendGridError('SendGrid internal error');
  }

  const messageId = generateMessageId();
  
  // Cache the result
  sendgridLimiter.cacheIdempotency(idempotencyKey, messageId);

  console.log(`📧 [SendGrid] Email sent to ${to}: ${messageId}`);
  return messageId;
}

export async function fetchSalesforceData(
  query: string
): Promise<Array<Record<string, any>>> {
  if (!apiConfig.salesforce.enabled) {
    throw new SalesforceError('Salesforce API is disabled');
  }

  await sleep(apiConfig.salesforce.latencyMs);

  if (Math.random() < apiConfig.salesforce.errorRate) {
    throw new SalesforceError('Salesforce query failed');
  }

  // Return mock data
  const count = query.toLowerCase().includes('limit') ? 10 : 100;
  const results: Array<Record<string, any>> = [];

  for (let i = 0; i < count; i++) {
    results.push({
      Id: `SF${1000 + i}`,
      Email: `customer${i}@example.com`,
      Name: `Customer ${i}`,
      Company: `Company ${i}`
    });
  }

  console.log(`☁️  [Salesforce] Query returned ${results.length} records`);
  return results;
}

export async function analyzeSentiment(text: string): Promise<string> {
  if (!apiConfig.sentiment.enabled) {
    throw new SentimentAPIError('Sentiment API is disabled');
  }

  await sleep(apiConfig.sentiment.latencyMs);

  if (Math.random() < apiConfig.sentiment.errorRate) {
    throw new SentimentAPIError('Sentiment analysis failed');
  }

  // Simple sentiment analysis
  const lowerText = text.toLowerCase();
  
  const positiveWords = ['great', 'excellent', 'good', 'love', 'perfect', 'thank', 'yes'];
  const negativeWords = ['bad', 'terrible', 'hate', 'no', 'poor', 'awful'];

  const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
  const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;

  let sentiment: string;
  if (positiveCount > negativeCount) {
    sentiment = 'positive';
  } else if (negativeCount > positiveCount) {
    sentiment = 'negative';
  } else {
    sentiment = 'neutral';
  }

  console.log(`💭 [Sentiment] Analyzed: "${text.substring(0, 30)}..." -> ${sentiment}`);
  return sentiment;
}

// ============================================================================
// Utilities
// ============================================================================

export function resetApis(): void {
  sendgridLimiter.reset();
}

export function setApiConfig(config: Partial<ApiConfig>): void {
  Object.assign(apiConfig, config);
}


export function killWorker(): void {
  
}