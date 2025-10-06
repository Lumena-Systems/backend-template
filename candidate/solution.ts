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
// TASK C: Worker Crash Recovery
// ============================================================================

export async function recoverStalledJobs(
  timeoutSeconds: number = 300
): Promise<number> {
  /**
   * Find and recover jobs that are stuck in 'processing' state.
   * 
   * A job is considered stalled if:
   * - status = 'processing' 
   * - last_heartbeat (or started_at if no heartbeat) is older than timeoutSeconds
   * 
   * Recovery means:
   * - Reset status back to 'pending'
   * - Clear workerId
   * - Clear startedAt
   * - Clear lastHeartbeat
   * 
   * Must handle race conditions:
   * - Worker might complete the job while cleanup runs
   * - Multiple cleanup processes might run simultaneously
   * - Only recover jobs that are actually stalled (atomic check + update)
   * 
   * @param timeoutSeconds - How old a job must be to be considered stalled
   * @returns Number of jobs recovered
   * 
   * Consider: 
   * - What if the job completes between your SELECT and UPDATE?
   * - How do you ensure only stalled jobs are reset, not actively processing ones?
   * - Should this handle jobs in other states (failed, completed)?
   */

  // TODO: Implement this function
  throw new Error('Not implemented');
}

// ============================================================================
// HELPER FUNCTIONS (Optional)
// ============================================================================

// Add any helper functions you need here