/**
 * CANDIDATE IMPLEMENTATION
 * 
 * Implement the four functions below.
 * Run with: npm run dev
 * Test with: npm test
 * 
 * ============================================================================
 * AVAILABLE APIs:
 * ============================================================================
 * 
 * ORM Methods:
 * - JobModel.get({ id: 123 }) - Find one job (throws if not found)
 * - JobModel.filter({ status: 'pending' }).first() - Find first match (or null)
 * - JobModel.filter({ status: 'pending' }).all() - Find all matches
 * - JobModel.filter({ status: 'pending' }).count() - Count matches
 * - JobModel.filter({ id: 123 }).update({ status: 'completed' }) - Update records
 * - JobModel.create({ campaignId, customerEmail, ... }) - Create new record
 * - CampaignModel.get/filter/create - Same methods for campaigns
 * - JobStepModel.get/filter/create - Same methods for job steps
 * 
 * Query Builder:
 * - .orderBy('createdAt', 'ASC' | 'DESC') - Sort results
 * - .limit(10) - Limit results
 * - .filter({ field: value }) - Add WHERE conditions
 * 
 * Database:
 * - executeSql(query, params) - Execute raw SQL
 * - transaction(async () => { ... }) - Wrap operations in transaction
 * 
 * External APIs:
 * - sendEmail(to, body, idempotencyKey) - Send email via SendGrid
 * - fetchSalesforceData(query) - Query Salesforce
 * - analyzeSentiment(text) - Analyze sentiment
 * 
 * Error Classes (use instanceof to check):
 * - RateLimitError - Transient, should retry
 * - InvalidEmailError - Permanent, should fail job
 * - TimeoutError - Transient, should retry
 * - SalesforceError - Salesforce API error
 * - SentimentAPIError - Sentiment API error
 * 
 * ============================================================================
 */

import { JobModel, JobStepModel, Job, JobStep } from '../lib/orm.js';
import { executeSql, transaction } from '../lib/database.js';
import {
  sendEmail,
  fetchSalesforceData,
  analyzeSentiment,
  RateLimitError,
  InvalidEmailError,
  TimeoutError,
  SalesforceError,
  SentimentAPIError
} from '../lib/external-apis.js';

const WORKER_ID = 'worker-1';

// ============================================================================
// TASK A: Claim a Job
// ============================================================================

export async function claimNextJob(): Promise<Job | null> {
  /**
   * Atomically claim one pending job for this worker.
   * 
   * Must be safe when 20 workers call this simultaneously.
   * Only one worker should get each job.
   * 
   * @returns The claimed job, or null if no jobs available
   */

  // TODO: Implement this function
  throw new Error('Not implemented');
}

// ============================================================================
// TASK B: Batch Job Creation
// ============================================================================

export async function createCampaignJobs(
  campaignId: number,
  customerEmails: string[]
): Promise<number> {

  /**
   * Create jobs for a campaign with 50,000 customer emails.
   * 
   * Each job should start at step 'send_email' with status 'pending'.
   * 
   * @returns number of jobs created
   * 
   * Consider: This will be called with 50K emails. How do you do this efficiently?
   */

  // TODO: Implement this function
  throw new Error('Not implemented');
}

// ============================================================================
// TASK C: Handle External API Failure
// ============================================================================

export async function sendEmailStep(job: Job): Promise<boolean> {
  /**
   * Send email for this job.
   * 
   * Should:
   * 
   * sendEmail() may throw:
   * - RateLimitError (transient, should retry)
   * - InvalidEmailError (permanent, should not retry)
   * - TimeoutError (transient, should retry)
   */

  // TODO: Implement this function
  throw new Error('Not implemented');
}

// ============================================================================
// TASK D: Idempotent Processing
// ============================================================================


export async function processJob(job: Job): Promise<void> {
  /**
   * Process the current step of a job.
   * 
   * Idempotent: Can be called multiple times safely.
   * Will only advance once per step even if called repeatedly.
   */
  
  // TODO: Implement this function
  throw new Error('Not implemented');
}

// ============================================================================
// HELPER FUNCTIONS (Optional)
// ============================================================================

// Add any helper functions you need here