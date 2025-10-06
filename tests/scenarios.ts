/**
 * Interactive debugging scenarios
 */

import { resetDatabase } from '../lib/database.js';
import { JobModel, JobStepModel, CampaignModel, JobStatus, JobStepName, CampaignStatus } from '../lib/orm.js';
import { resetApis, setApiConfig, apiConfig } from '../lib/external-apis.js';
import { metrics } from '../lib/metrics.js';
import { claimNextJob, processJob } from '../candidate/solution.js';

async function setupScenario() {
  resetDatabase();
  resetApis();
  metrics.reset();

  const campaign = await CampaignModel.create({
    name: 'Debug Campaign',
    userId: 1,
    status: CampaignStatus.Active
  });

  return campaign.id;
}

// ============================================================================
// Scenario 1: Slow Throughput
// ============================================================================

async function scenarioSlowThroughput() {
  console.log('📉 Scenario 1: Slow Throughput\n');
  console.log('Simulating 20 workers processing jobs with slow external API...\n');

  const campaignId = await setupScenario();

  // Create 5000 jobs
  console.log('Creating 5000 jobs...');
  for (let i = 0; i < 5000; i++) {
    await JobModel.create({
      campaignId,
      customerEmail: `customer${i}@example.com`,
      currentStep: JobStepName.SendEmail,
      status: JobStatus.Pending,
      retryCount: 0
    });
  }

  // Simulate slow SendGrid
  setApiConfig({
    sendgrid: {
      errorRate: 0.05,
      latencyMs: 1800, // p50
      rateLimitPerSecond: 500,
      enabled: true
    }
  });

  console.log('Processing jobs with 20 simulated workers...\n');

  const workers = [];
  const startTime = Date.now();
  const DURATION_MS = 60000; // 1 minute

  for (let i = 0; i < 20; i++) {
    workers.push(
      (async () => {
        let processed = 0;
        while (Date.now() - startTime < DURATION_MS) {
          try {
            const job = await claimNextJob();
            if (!job) {
              await new Promise(r => setTimeout(r, 100));
              continue;
            }

            const jobStart = Date.now();
            await processJob(job);
            metrics.histogram('job.duration', Date.now() - jobStart);
            processed++;
          } catch (error) {
            // Continue on error
          }
        }
        return processed;
      })()
    );
  }

  const results = await Promise.all(workers);
  const totalProcessed = results.reduce((a, b) => a + b, 0);

  console.log('\n📊 Results after 1 minute:');
  console.log(`   Jobs completed: ${totalProcessed}`);
  console.log(`   Rate: ${totalProcessed}/min`);
  console.log(`   Queue remaining: ${await JobModel.filter({ status: JobStatus.Pending }).count()}`);

  metrics.print();
}

// ============================================================================
// Scenario 2: Duplicate Detection
// ============================================================================

async function scenarioDuplicateDetection() {
  console.log('🔍 Scenario 2: Duplicate Email Detection\n');
  console.log('Testing what happens when job is processed twice...\n');

  const campaignId = await setupScenario();

  const job = await JobModel.create({
    campaignId,
    customerEmail: 'test@example.com',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 0
  });

  console.log(`Created job ${job.id}\n`);

  // Process once
  console.log('Worker 1: Processing job...');
  await processJob(job);
  console.log('Worker 1: Completed\n');

  // Check job steps
  const steps1 = await JobStepModel.filter({ jobId: job.id });
  const count1 = await steps1.count();
  console.log(`JobSteps after first processing: ${count1}\n`);

  // Manually reset job to simulate cleanup race condition
  await JobModel.filter({ id: job.id }).update({
    status: JobStatus.Pending,
    workerId: null
  });

  console.log('Simulated cleanup: Reset job to pending\n');

  // Process again
  console.log('Worker 2: Processing same job...');
  await processJob(job);
  console.log('Worker 2: Completed\n');

  // Check for duplicates
  const steps2 = await JobStepModel.filter({ jobId: job.id });
  const count2 = await steps2.count();
  console.log(`JobSteps after second processing: ${count2}`);

  if (count2 > count1) {
    console.log('⚠️  WARNING: Duplicate JobStep created!');
    console.log('This indicates idempotency check is not working properly.');
  } else {
    console.log('✅ No duplicates - idempotency working correctly');
  }
}

// ============================================================================
// Scenario 3: Connection Pool
// ============================================================================

async function scenarioConnectionPool() {
  console.log('🔌 Scenario 3: Connection Pool Stress\n');
  console.log('Simulating many workers to stress database connections...\n');

  const campaignId = await setupScenario();

  // Create jobs
  for (let i = 0; i < 100; i++) {
    await JobModel.create({
      campaignId,
      customerEmail: `customer${i}@example.com`,
      currentStep: JobStepName.SendEmail,
      status: JobStatus.Pending,
      retryCount: 0
    });
  }

  console.log('Created 100 jobs\n');
  console.log('Starting 50 concurrent workers...\n');

  const workers = [];
  for (let i = 0; i < 50; i++) {
    workers.push(
      (async () => {
        try {
          const job = await claimNextJob();
          if (job) {
            await processJob(job);
          }
        } catch (error: any) {
          console.error(`Worker ${i} error:`, error.message);
        }
      })()
    );
  }

  await Promise.all(workers);

  const remaining = await JobModel.filter({ status: JobStatus.Pending }).count();
  console.log(`\nJobs remaining: ${remaining}/100`);
  console.log('If this is less than 100, some jobs were processed successfully.');
}

// ============================================================================
// Main Menu
// ============================================================================

async function main() {
  const scenario = process.argv[2];

  console.log('🔬 Debugging Scenarios\n');
  console.log('=' .repeat(60));
  console.log('\n');

  switch (scenario) {
    case '1':
    case 'throughput':
      await scenarioSlowThroughput();
      break;
    case '2':
    case 'duplicate':
      await scenarioDuplicateDetection();
      break;
    case '3':
    case 'connections':
      await scenarioConnectionPool();
      break;
    default:
      console.log('Usage: npm run scenarios [1|2|3]');
      console.log('\nAvailable scenarios:');
      console.log('  1 (throughput)   - Slow throughput debugging');
      console.log('  2 (duplicate)    - Duplicate email detection');
      console.log('  3 (connections)  - Connection pool stress test');
  }
}

main().catch(console.error);
