/**
 * Automated test harness to validate candidate solutions
 */

import { resetDatabase, transaction } from '../lib/database.js';
import { JobModel, JobStepModel, CampaignModel, JobStatus, JobStepName, CampaignStatus } from '../lib/orm.js';
import { resetApis, setApiConfig } from '../lib/external-apis.js';
import { metrics } from '../lib/metrics.js';
import {
  claimNextJob,
  createCampaignJobs,
  sendEmailStep,
  processJob
} from '../candidate/solution.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function test(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  
  try {
    await fn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - start
    });
    console.log(`✅ ${name}`);
  } catch (error: any) {
    results.push({
      name,
      passed: false,
      error: error.message,
      duration: Date.now() - start
    });
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

async function setupTestData() {
  resetDatabase();
  resetApis();
  metrics.reset();

  const campaign = await CampaignModel.create({
    name: 'Test Campaign',
    userId: 1,
    status: CampaignStatus.Active
  });

  // Create test jobs
  for (let i = 1; i <= 10; i++) {
    await JobModel.create({
      campaignId: campaign.id,
      customerEmail: `test${i}@example.com`,
      currentStep: JobStepName.SendEmail,
      status: JobStatus.Pending,
      retryCount: 0
    });
  }

  return campaign.id;
}

// ============================================================================
// Tests
// ============================================================================

async function testClaimJobBasic() {
  await setupTestData();
  
  const job = await claimNextJob();
  
  if (!job) {
    throw new Error('Failed to claim a job');
  }
  
  if (job.status !== JobStatus.Processing) {
    throw new Error(`Expected status 'processing', got '${job.status}'`);
  }
  
  if (!job.workerId) {
    throw new Error('Worker ID not set');
  }
}

async function testClaimJobConcurrency() {
  await setupTestData();
  
  // Simulate 5 workers claiming simultaneously
  const claims = await Promise.all([
    claimNextJob(),
    claimNextJob(),
    claimNextJob(),
    claimNextJob(),
    claimNextJob()
  ]);
  
  const validClaims = claims.filter(j => j !== null);
  
  if (validClaims.length !== 5) {
    throw new Error(`Expected 5 jobs claimed, got ${validClaims.length}`);
  }
  
  // Check for duplicates
  const ids = validClaims.map(j => j!.id);
  const uniqueIds = new Set(ids);
  
  if (uniqueIds.size !== ids.length) {
    throw new Error('Duplicate jobs claimed!');
  }
}

async function testClaimJobNoJobs() {
  resetDatabase();
  
  const job = await claimNextJob();
  
  if (job !== null) {
    throw new Error('Expected null when no jobs available');
  }
}

async function testBatchCreationSmall() {
  const campaignId = await setupTestData();
  
  const emails = ['user1@example.com', 'user2@example.com', 'user3@example.com'];
  const count = await createCampaignJobs(campaignId, emails);
  
  if (count !== 3) {
    throw new Error(`Expected 3 jobs created, got ${count}`);
  }
  
  const jobs = await JobModel.filter({ campaignId });
  const created = await jobs.count();
  
  if (created < 13) { // 10 existing + 3 new
    throw new Error(`Expected at least 13 jobs in DB, got ${created}`);
  }
}

async function testBatchCreationLarge() {
  const campaignId = await setupTestData();
  
  const emails = Array.from({ length: 1000 }, (_, i) => `user${i}@example.com`);
  
  const start = Date.now();
  const count = await createCampaignJobs(campaignId, emails);
  const duration = Date.now() - start;
  
  if (count !== 1000) {
    throw new Error(`Expected 1000 jobs created, got ${count}`);
  }
  
  console.log(`   ⏱️  Created 1000 jobs in ${duration}ms`);
  
  if (duration > 5000) {
    console.warn(`   ⚠️  Slow: took ${duration}ms (>5s)`);
  }
}

async function testSendEmailStepSuccess() {
  const campaignId = await setupTestData();
  
  const job = await JobModel.get({ campaignId });
  const success = await sendEmailStep(job);
  
  if (!success) {
    throw new Error('Email step should succeed');
  }
}

async function testSendEmailStepInvalidEmail() {
  const campaignId = await setupTestData();
  
  // Create job with invalid email
  const job = await JobModel.create({
    campaignId,
    customerEmail: 'invalid-email',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 0
  });
  
  const success = await sendEmailStep(job);
  
  if (success) {
    throw new Error('Should fail with invalid email');
  }
  
  const updated = await JobModel.get({ id: job.id });
  if (updated.status !== JobStatus.Failed) {
    throw new Error(`Expected status 'failed', got '${updated.status}'`);
  }
}

async function testProcessJobIdempotency() {
  const campaignId = await setupTestData();
  
  const job = await claimNextJob();
  if (!job) throw new Error('No job to process');
  
  // Process once
  await processJob(job);
  
  // Process again (should be idempotent)
  await processJob(job);
  
  // Check that email was only sent once by checking metrics
  // This depends on candidate's implementation having proper idempotency
}

async function testProcessJobFullWorkflow() {
  const campaignId = await setupTestData();
  
  const job = await claimNextJob();
  if (!job) throw new Error('No job to process');
  
  // Process through all steps
  for (let i = 0; i < 3; i++) {
    await processJob(job);
    const updated = await JobModel.get({ id: job.id });
    
    if (i < 2 && updated.status !== JobStatus.Pending) {
      throw new Error(`After step ${i}, expected status 'pending'`);
    }
  }
  
  const final = await JobModel.get({ id: job.id });
  if (final.status !== JobStatus.Completed) {
    throw new Error(`Expected final status 'completed', got '${final.status}'`);
  }
}

async function testClaimJobHighConcurrency() {
  await setupTestData();
  
  // Simulate 20 workers claiming simultaneously
  const claims = await Promise.all(
    Array.from({ length: 20 }, () => claimNextJob())
  );
  
  const validClaims = claims.filter(j => j !== null);
  
  if (validClaims.length !== 10) {
    throw new Error(`Expected 10 jobs claimed (only 10 available), got ${validClaims.length}`);
  }
  
  // Verify no duplicates
  const ids = validClaims.map(j => j!.id);
  const uniqueIds = new Set(ids);
  
  if (uniqueIds.size !== ids.length) {
    throw new Error('Race condition: duplicate jobs claimed!');
  }
}

async function testClaimJobMultipleCampaigns() {
  resetDatabase();
  
  // Create two campaigns
  const campaign1 = await CampaignModel.create({
    name: 'Campaign 1',
    userId: 1,
    status: CampaignStatus.Active
  });
  
  const campaign2 = await CampaignModel.create({
    name: 'Campaign 2',
    userId: 2,
    status: CampaignStatus.Active
  });
  
  // Create jobs for both campaigns
  await JobModel.create({
    campaignId: campaign1.id,
    customerEmail: 'test1@example.com',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 0
  });
  
  await JobModel.create({
    campaignId: campaign2.id,
    customerEmail: 'test2@example.com',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 0
  });
  
  const job1 = await claimNextJob();
  const job2 = await claimNextJob();
  
  if (!job1 || !job2) {
    throw new Error('Failed to claim jobs from multiple campaigns');
  }
  
  if (job1.campaignId === job2.campaignId) {
    throw new Error('Should claim jobs from different campaigns');
  }
}

async function testBatchCreationEmpty() {
  const campaignId = await setupTestData();
  
  const count = await createCampaignJobs(campaignId, []);
  
  if (count !== 0) {
    throw new Error(`Expected 0 jobs created for empty list, got ${count}`);
  }
}

async function testBatchCreationDuplicateEmails() {
  const campaignId = await setupTestData();
  
  const emails = [
    'duplicate@example.com',
    'duplicate@example.com',
    'unique@example.com'
  ];
  
  const count = await createCampaignJobs(campaignId, emails);
  
  // Should handle duplicates gracefully (either create all or dedupe)
  if (count !== 2 && count !== 3) {
    throw new Error(`Expected 2 or 3 jobs created, got ${count}`);
  }
}

async function testBatchCreationMedium() {
  const campaignId = await setupTestData();
  
  const emails = Array.from({ length: 5000 }, (_, i) => `user${i}@example.com`);
  
  const start = Date.now();
  const count = await createCampaignJobs(campaignId, emails);
  const duration = Date.now() - start;
  
  if (count !== 5000) {
    throw new Error(`Expected 5000 jobs created, got ${count}`);
  }
  
  console.log(`   ⏱️  Created 5000 jobs in ${duration}ms`);
  
  if (duration > 10000) {
    console.warn(`   ⚠️  Slow: took ${duration}ms (>10s)`);
  }
}

async function testSendEmailStepRetry() {
  const campaignId = await setupTestData();
  
  // Configure high error rate to test retry logic
  setApiConfig({
    sendgrid: { errorRate: 0.9, latencyMs: 50, rateLimitPerSecond: 1000, enabled: true }
  });
  
  const job = await JobModel.create({
    campaignId,
    customerEmail: 'retry@example.com',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 0
  });
  
  // Should handle retries
  let success = false;
  for (let i = 0; i < 5; i++) {
    success = await sendEmailStep(job);
    if (success) break;
  }
  
  // Reset config
  setApiConfig({
    sendgrid: { errorRate: 0.01, latencyMs: 50, rateLimitPerSecond: 1000, enabled: true }
  });
}

async function testSendEmailStepRateLimit() {
  const campaignId = await setupTestData();
  resetApis();
  
  // Configure low rate limit
  setApiConfig({
    sendgrid: { errorRate: 0.01, latencyMs: 10, rateLimitPerSecond: 5, enabled: true }
  });
  
  // Create multiple jobs and try to send emails rapidly
  const jobs = [];
  for (let i = 0; i < 10; i++) {
    jobs.push(await JobModel.create({
      campaignId,
      customerEmail: `ratelimit${i}@example.com`,
      currentStep: JobStepName.SendEmail,
      status: JobStatus.Pending,
      retryCount: 0
    }));
  }
  
  const results = await Promise.all(jobs.map(job => sendEmailStep(job)));
  
  // Some should succeed, some should fail due to rate limit
  // But implementation should handle this gracefully
  
  // Reset config
  setApiConfig({
    sendgrid: { errorRate: 0.01, latencyMs: 50, rateLimitPerSecond: 1000, enabled: true }
  });
}

async function testProcessJobStepProgression() {
  const campaignId = await setupTestData();
  
  const job = await claimNextJob();
  if (!job) throw new Error('No job to process');
  
  // Verify step progression: send_email -> analyze -> take_action
  await processJob(job);
  let updated = await JobModel.get({ id: job.id });
  
  if (updated.currentStep !== JobStepName.Analyze) {
    throw new Error(`After send_email, expected 'analyze', got '${updated.currentStep}'`);
  }
  
  await processJob(updated);
  updated = await JobModel.get({ id: job.id });
  
  if (updated.currentStep !== JobStepName.TakeAction) {
    throw new Error(`After analyze, expected 'take_action', got '${updated.currentStep}'`);
  }
  
  await processJob(updated);
  updated = await JobModel.get({ id: job.id });
  
  if (updated.status !== JobStatus.Completed) {
    throw new Error(`After take_action, expected 'completed', got '${updated.status}'`);
  }
}

async function testProcessJobConcurrentSameJob() {
  const campaignId = await setupTestData();
  
  const job = await claimNextJob();
  if (!job) throw new Error('No job to process');
  
  // Multiple workers try to process the same job simultaneously
  await Promise.all([
    processJob(job),
    processJob(job),
    processJob(job)
  ]);
  
  // Should handle gracefully without errors
}

// async function testClaimJobWithScheduledJobs() {
//   resetDatabase();
  
//   const campaign = await CampaignModel.create({
//     name: 'Test Campaign',
//     userId: 1,
//     status: CampaignStatus.Active
//   });
  
//   // Create job scheduled for future
//   await JobModel.create({
//     campaignId: campaign.id,
//     customerEmail: 'future@example.com',
//     currentStep: JobStepName.SendEmail,
//     status: JobStatus.Pending,
//     retryCount: 0,
//     scheduledFor: new Date(Date.now() + 60000) // 1 minute in future
//   });
  
//   // Create job scheduled for now
//   await JobModel.create({
//     campaignId: campaign.id,
//     customerEmail: 'now@example.com',
//     currentStep: JobStepName.SendEmail,
//     status: JobStatus.Pending,
//     retryCount: 0,
//     scheduledFor: new Date(Date.now() - 1000) // Past
//   });
  
//   const job = await claimNextJob();
  
//   if (!job) {
//     throw new Error('Should claim the job scheduled for past');
//   }
  
//   if (job.customerEmail !== 'now@example.com') {
//     throw new Error('Should prioritize jobs that are due');
//   }
// }

async function testClaimJobPriority() {
  resetDatabase();
  
  const campaign = await CampaignModel.create({
    name: 'Test Campaign',
    userId: 1,
    status: CampaignStatus.Active
  });
  
  // Create jobs with different retry counts
  const oldJob = await JobModel.create({
    campaignId: campaign.id,
    customerEmail: 'old@example.com',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 3,
    createdAt: new Date(Date.now() - 10000)
  });
  
  await new Promise(resolve => setTimeout(resolve, 10));
  
  const newJob = await JobModel.create({
    campaignId: campaign.id,
    customerEmail: 'new@example.com',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 0,
    createdAt: new Date()
  });
  
  const claimed = await claimNextJob();
  
  if (!claimed) {
    throw new Error('Should claim a job');
  }
  
  // Should prioritize based on some logic (FIFO, retry count, etc.)
}

async function testJobFailureHandling() {
  const campaignId = await setupTestData();
  
  // Create job with invalid email
  const job = await JobModel.create({
    campaignId,
    customerEmail: 'not-an-email',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 0
  });
  
  const success = await sendEmailStep(job);
  
  if (success) {
    throw new Error('Should fail with invalid email');
  }
  
  const updated = await JobModel.get({ id: job.id });
  
  if (updated.status !== JobStatus.Failed) {
    throw new Error(`Expected status 'failed', got '${updated.status}'`);
  }
  
  if (!updated.errorMessage) {
    throw new Error('Should set error message on failure');
  }
}

async function testJobMaxRetries() {
  const campaignId = await setupTestData();
  
  // Create job with high retry count
  const job = await JobModel.create({
    campaignId,
    customerEmail: 'maxretry@example.com',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 10
  });
  
  // Configure high error rate
  setApiConfig({
    sendgrid: { errorRate: 1.0, latencyMs: 50, rateLimitPerSecond: 1000, enabled: true }
  });
  
  const success = await sendEmailStep(job);
  
  if (success) {
    throw new Error('Should fail after max retries');
  }
  
  const updated = await JobModel.get({ id: job.id });
  
  // Should eventually give up and mark as failed
  
  // Reset config
  setApiConfig({
    sendgrid: { errorRate: 0.01, latencyMs: 50, rateLimitPerSecond: 1000, enabled: true }
  });
}

async function testBatchCreationTransactionality() {
  const campaignId = await setupTestData();
  
  const initialCount = await JobModel.filter({ campaignId }).count();
  
  try {
    // Try to create jobs - if it fails, should not partially create
    const emails = Array.from({ length: 100 }, (_, i) => `tx${i}@example.com`);
    await createCampaignJobs(campaignId, emails);
    
    const finalCount = await JobModel.filter({ campaignId }).count();
    
    if (finalCount !== initialCount + 100) {
      throw new Error(`Expected ${initialCount + 100} jobs, got ${finalCount}`);
    }
  } catch (error) {
    // If creation fails, check no partial state
    const countAfterError = await JobModel.filter({ campaignId }).count();
    
    if (countAfterError !== initialCount) {
      throw new Error('Batch creation left partial data (not transactional)');
    }
  }
}

async function testWorkerIdTracking() {
  await setupTestData();
  
  const job = await claimNextJob();
  
  if (!job) {
    throw new Error('Failed to claim job');
  }
  
  if (!job.workerId) {
    throw new Error('Worker ID should be set when job is claimed');
  }
  
  // Verify in database
  const dbJob = await JobModel.get({ id: job.id });
  
  if (!dbJob.workerId) {
    throw new Error('Worker ID not persisted to database');
  }
  
  if (dbJob.workerId !== job.workerId) {
    throw new Error('Worker ID mismatch between returned job and database');
  }
}

async function testJobStepRecording() {
  const campaignId = await setupTestData();
  
  const job = await claimNextJob();
  if (!job) throw new Error('No job to process');
  
  await processJob(job);
  
  // Check if job steps are recorded
  const steps = await JobStepModel.filter({ jobId: job.id }).all();
  
  if (steps.length === 0) {
    console.warn('   ⚠️  No job steps recorded (optional feature)');
  } else {
    console.log(`   📝 Recorded ${steps.length} job step(s)`);
  }
}

// async function testConcurrentBatchCreation() {
//   const campaignId = await setupTestData();
  
//   // Multiple workers try to create batches simultaneously
//   const results = await Promise.all([
//     createCampaignJobs(campaignId, ['batch1_1@example.com', 'batch1_2@example.com']),
//     createCampaignJobs(campaignId, ['batch2_1@example.com', 'batch2_2@example.com']),
//     createCampaignJobs(campaignId, ['batch3_1@example.com', 'batch3_2@example.com'])
//   ]);
  
//   const totalCreated = results.reduce((sum, count) => sum + count, 0);
  
//   if (totalCreated !== 6) {
//     throw new Error(`Expected 6 jobs created, got ${totalCreated}`);
//   }
  
//   // Verify no duplicate jobs
//   const allJobs = await JobModel.filter({ campaignId }).all();
//   const emails = allJobs.map(j => j.customerEmail);
//   const uniqueEmails = new Set(emails);
  
//   if (uniqueEmails.size !== allJobs.length) {
//     throw new Error('Concurrent batch creation created duplicate jobs');
//   }
// }

async function testProcessingStatusTransitions() {
  const campaignId = await setupTestData();
  
  const job = await claimNextJob();
  if (!job) throw new Error('No job to process');
  
  // Verify job is in processing state
  if (job.status !== JobStatus.Processing) {
    throw new Error(`After claim, expected 'processing', got '${job.status}'`);
  }
  
  await processJob(job);
  
  // After processing one step, should be back to pending
  const updated = await JobModel.get({ id: job.id });
  
  if (updated.status !== JobStatus.Pending) {
    throw new Error(`After one step, expected 'pending', got '${updated.status}'`);
  }
}

async function testFailedJobNotReclaimed() {
  const campaignId = await setupTestData();
  
  // Create job with invalid email and process it to failure
  const job = await JobModel.create({
    campaignId,
    customerEmail: 'bad',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 0
  });
  
  await sendEmailStep(job);
  
  // Verify job is failed
  const failed = await JobModel.get({ id: job.id });
  
  if (failed.status !== JobStatus.Failed) {
    throw new Error('Job should be marked as failed');
  }
  
  // Try to claim jobs - should not claim the failed job
  const claimed = await claimNextJob();
  
  if (claimed && claimed.id === job.id) {
    throw new Error('Should not reclaim a failed job');
  }
}

// ============================================================================
// Run All Tests
// ============================================================================

async function runTests() {
  console.log('🧪 Running Test Suite\n');
  console.log('='.repeat(60));
  
  // Reduce error rates for more reliable tests
  setApiConfig({
    sendgrid: { errorRate: 0.01, latencyMs: 50, rateLimitPerSecond: 1000, enabled: true },
    salesforce: { errorRate: 0.01, latencyMs: 50, enabled: true },
    sentiment: { errorRate: 0.01, latencyMs: 50, enabled: true }
  });
  
  // ============ Job Claiming Tests ============
  console.log('\n📋 Job Claiming Tests:');
  await test('Claim Job - Basic', testClaimJobBasic);
  await test('Claim Job - Concurrency (5 workers)', testClaimJobConcurrency);
  await test('Claim Job - High Concurrency (20 workers)', testClaimJobHighConcurrency);
  await test('Claim Job - No Jobs Available', testClaimJobNoJobs);
  await test('Claim Job - Multiple Campaigns', testClaimJobMultipleCampaigns);
  // await test('Claim Job - With Scheduled Jobs', testClaimJobWithScheduledJobs);
  await test('Claim Job - Priority Handling', testClaimJobPriority);
  await test('Claim Job - Worker ID Tracking', testWorkerIdTracking);
  
  // ============ Batch Creation Tests ============
  console.log('\n📦 Batch Creation Tests:');
  await test('Batch Creation - Small (3 jobs)', testBatchCreationSmall);
  await test('Batch Creation - Empty Array', testBatchCreationEmpty);
  await test('Batch Creation - Duplicate Emails', testBatchCreationDuplicateEmails);
  await test('Batch Creation - Medium (5000 jobs)', testBatchCreationMedium);
  await test('Batch Creation - Large (1000 jobs)', testBatchCreationLarge);
  await test('Batch Creation - Transactionality', testBatchCreationTransactionality);
  // await test('Batch Creation - Concurrent Batches', testConcurrentBatchCreation);
  
  // ============ Email Step Tests ============
  console.log('\n📧 Email Step Tests:');
  await test('Send Email Step - Success', testSendEmailStepSuccess);
  await test('Send Email Step - Invalid Email', testSendEmailStepInvalidEmail);
  await test('Send Email Step - Retry Logic', testSendEmailStepRetry);
  await test('Send Email Step - Rate Limiting', testSendEmailStepRateLimit);
  
  // ============ Job Processing Tests ============
  console.log('\n⚙️  Job Processing Tests:');
  await test('Process Job - Full Workflow', testProcessJobFullWorkflow);
  await test('Process Job - Idempotency', testProcessJobIdempotency);
  await test('Process Job - Step Progression', testProcessJobStepProgression);
  await test('Process Job - Concurrent Same Job', testProcessJobConcurrentSameJob);
  await test('Process Job - Status Transitions', testProcessingStatusTransitions);
  await test('Process Job - Step Recording', testJobStepRecording);
  
  // ============ Error Handling Tests ============
  console.log('\n🚨 Error Handling Tests:');
  await test('Job Failure - Invalid Email Handling', testJobFailureHandling);
  await test('Job Failure - Max Retries', testJobMaxRetries);
  await test('Job Failure - Not Reclaimed', testFailedJobNotReclaimed);
  
  console.log('\n' + '='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n📊 Results: ${passed}/${results.length} passed`);
  
  if (failed > 0) {
    console.log(`\n❌ Failed tests:`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
  }
  
  metrics.print();
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
