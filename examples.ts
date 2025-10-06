/**
 * EXAMPLES - Working code demonstrating how to use the available APIs
 * 
 * Run this file with: tsx examples.ts
 */

import { JobModel, JobStepModel, CampaignModel, Job, JobStep, Campaign, JobStatus, JobStepName, JobStepStatus, CampaignStatus } from './lib/orm.js';
import { executeSql, transaction, resetDatabase } from './lib/database.js';
import {
  sendEmail,
  fetchSalesforceData,
  analyzeSentiment,
  RateLimitError,
  InvalidEmailError,
  TimeoutError,
  resetApis
} from './lib/external-apis.js';

// ============================================================================
// Example 1: ORM - Basic CRUD Operations
// ============================================================================

async function example1_BasicCRUD() {
  console.log('\n📝 Example 1: Basic CRUD Operations');
  console.log('='.repeat(60));
  
  // Create a campaign
  const campaign = await CampaignModel.create({
    name: 'Summer Sale Campaign',
    userId: 1,
    status: CampaignStatus.Active,
    createdAt: new Date()
  });
  console.log('✅ Created campaign:', campaign.id);
  
  // Create a job
  const job = await JobModel.create({
    campaignId: campaign.id,
    customerEmail: 'customer@example.com',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 0
  });
  console.log('✅ Created job:', job.id);
  
  // Get a job by ID
  const fetchedJob = await JobModel.get({ id: job.id });
  console.log('✅ Fetched job:', fetchedJob.customerEmail);
  
  // Update a job
  await JobModel.filter({ id: job.id }).update({
    status: JobStatus.Processing,
    workerId: 'worker-1'
  });
  console.log('✅ Updated job status to processing');
  
  // Verify update
  const updatedJob = await JobModel.get({ id: job.id });
  console.log('✅ Job status:', updatedJob.status, '| Worker:', updatedJob.workerId);
}

// ============================================================================
// Example 2: ORM - Query Builder
// ============================================================================

async function example2_QueryBuilder() {
  console.log('\n🔍 Example 2: Query Builder');
  console.log('='.repeat(60));
  
  // Setup test data
  const campaign = await CampaignModel.create({
    name: 'Test Campaign',
    userId: 1,
    status: CampaignStatus.Active,
    createdAt: new Date()
  });
  
  for (let i = 1; i <= 5; i++) {
    await JobModel.create({
      campaignId: campaign.id,
      customerEmail: `user${i}@example.com`,
      currentStep: JobStepName.SendEmail,
      status: i <= 3 ? JobStatus.Pending : JobStatus.Completed,
      retryCount: 0
    });
  }
  
  // Find first pending job
  const firstPending = await JobModel.filter({ status: JobStatus.Pending })
    .orderBy('createdAt', 'ASC')
    .first();
  console.log('✅ First pending job:', firstPending?.customerEmail);
  
  // Find all pending jobs
  const allPending = await JobModel.filter({ status: JobStatus.Pending }).all();
  console.log('✅ All pending jobs:', allPending.length);
  
  // Count pending jobs
  const count = await JobModel.filter({ status: JobStatus.Pending }).count();
  console.log('✅ Count of pending jobs:', count);
  
  // Find jobs with limit
  const limited = await JobModel.filter({ campaignId: campaign.id })
    .limit(2)
    .all();
  console.log('✅ Limited to 2 jobs:', limited.length);
  
  // Find and order by multiple criteria
  const ordered = await JobModel.filter({ campaignId: campaign.id })
    .orderBy('status', 'DESC')
    .all();
  console.log('✅ Ordered jobs:', ordered.map(j => j.status));
}

// ============================================================================
// Example 3: Transactions
// ============================================================================

async function example3_Transactions() {
  console.log('\n💰 Example 3: Transactions');
  console.log('='.repeat(60));
  
  const campaign = await CampaignModel.create({
    name: 'Transaction Test',
    userId: 1,
    status: CampaignStatus.Active,
    createdAt: new Date()
  });
  
  try {
    // All operations in this block are atomic
    const result = await transaction(async () => {
      const job1 = await JobModel.create({
        campaignId: campaign.id,
        customerEmail: 'tx1@example.com',
        currentStep: JobStepName.SendEmail,
        status: JobStatus.Pending,
        retryCount: 0
      });
      
      const job2 = await JobModel.create({
        campaignId: campaign.id,
        customerEmail: 'tx2@example.com',
        currentStep: JobStepName.SendEmail,
        status: JobStatus.Pending,
        retryCount: 0
      });
      
      // Update campaign status
      await CampaignModel.filter({ id: campaign.id }).update({
        status: CampaignStatus.Active
      });
      
      return { job1Id: job1.id, job2Id: job2.id };
    });
    
    console.log('✅ Transaction completed:', result);
    console.log('✅ Both jobs created atomically');
    
  } catch (error) {
    console.log('❌ Transaction rolled back');
  }
}

// ============================================================================
// Example 4: Raw SQL Queries
// ============================================================================

async function example4_RawSQL() {
  console.log('\n⚡ Example 4: Raw SQL Queries');
  console.log('='.repeat(60));
  
  // Insert with raw SQL
  const insertResult = await executeSql(
    'INSERT INTO campaigns (name, user_id, status, created_at) VALUES (?, ?, ?, ?)',
    ['SQL Campaign', 1, CampaignStatus.Active, new Date().toISOString()]
  );
  console.log('✅ Inserted campaign, ID:', insertResult[0].insertId);
  
  // Select with raw SQL
  const selectResult = await executeSql<Campaign>(
    'SELECT * FROM campaigns WHERE name = ?',
    ['SQL Campaign']
  );
  console.log('✅ Selected campaign:', selectResult[0]?.name);
  
  // Update with raw SQL
  const updateResult = await executeSql(
    'UPDATE campaigns SET status = ? WHERE name = ?',
    [CampaignStatus.Paused, 'SQL Campaign']
  );
  console.log('✅ Updated rows:', updateResult[0].affectedRows);
  
  // Complex query with JOIN
  const campaign = await CampaignModel.create({
    name: 'Join Test',
    userId: 1,
    status: CampaignStatus.Active
  });
  
  await JobModel.create({
    campaignId: campaign.id,
    customerEmail: 'join@example.com',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 0
  });
  
  const joinResult = await executeSql(
    `SELECT c.name as campaign_name, j.customer_email 
     FROM campaigns c 
     JOIN jobs j ON j.campaign_id = c.id 
     WHERE c.id = ?`,
    [campaign.id]
  );
  console.log('✅ Join result:', joinResult[0]);
}

// ============================================================================
// Example 5: External API - Send Email
// ============================================================================

async function example5_SendEmail() {
  console.log('\n📧 Example 5: Send Email API');
  console.log('='.repeat(60));
  
  try {
    // Send email with idempotency key
    const messageId1 = await sendEmail(
      'customer@example.com',
      'Hello! This is a test email.',
      'idempotency-key-123'
    );
    console.log('✅ Email sent, message ID:', messageId1);
    
    // Send again with same idempotency key (should return cached result)
    const messageId2 = await sendEmail(
      'customer@example.com',
      'Hello! This is a test email.',
      'idempotency-key-123'
    );
    console.log('✅ Idempotent request returned same ID:', messageId1 === messageId2);
    
  } catch (error) {
    if (error instanceof InvalidEmailError) {
      console.log('❌ Invalid email address');
    } else if (error instanceof RateLimitError) {
      console.log('❌ Rate limit exceeded');
    } else if (error instanceof TimeoutError) {
      console.log('❌ Request timeout');
    }
  }
}

// ============================================================================
// Example 6: Error Handling
// ============================================================================

async function example6_ErrorHandling() {
  console.log('\n🚨 Example 6: Error Handling');
  console.log('='.repeat(60));
  
  // Test invalid email
  try {
    await sendEmail('not-an-email', 'Test body', 'error-test-1');
  } catch (error) {
    if (error instanceof InvalidEmailError) {
      console.log('✅ Caught InvalidEmailError:', error.message);
    }
  }
  
  // Demonstrate retry logic for transient errors
  let retries = 0;
  const MAX_RETRIES = 3;
  
  while (retries < MAX_RETRIES) {
    try {
      await sendEmail(
        'retry@example.com',
        'Testing retry logic',
        `retry-key-${retries}`
      );
      console.log('✅ Email sent successfully');
      break;
    } catch (error) {
      if (error instanceof RateLimitError || error instanceof TimeoutError) {
        retries++;
        console.log(`⚠️  Transient error, retry ${retries}/${MAX_RETRIES}`);
        if (retries >= MAX_RETRIES) {
          console.log('❌ Max retries exceeded, giving up');
        }
      } else {
        console.log('❌ Permanent error, not retrying');
        break;
      }
    }
  }
}

// ============================================================================
// Example 7: Salesforce API
// ============================================================================

async function example7_SalesforceAPI() {
  console.log('\n☁️  Example 7: Salesforce API');
  console.log('='.repeat(60));
  
  try {
    // Query Salesforce data
    const contacts = await fetchSalesforceData(
      "SELECT Id, Name, Email FROM Contact LIMIT 5"
    );
    console.log('✅ Fetched contacts:', contacts.length);
    console.log('✅ First contact:', contacts[0]?.Name);
    
  } catch (error) {
    console.log('❌ Salesforce error:', error);
  }
}

// ============================================================================
// Example 8: Sentiment Analysis API
// ============================================================================

async function example8_SentimentAPI() {
  console.log('\n💭 Example 8: Sentiment Analysis API');
  console.log('='.repeat(60));
  
  try {
    // Analyze positive sentiment
    const positive = await analyzeSentiment(
      'This is great! I love this product. Thank you so much!'
    );
    console.log('✅ Positive sentiment:', positive);
    
    // Analyze negative sentiment
    const negative = await analyzeSentiment(
      'This is terrible. I hate it. Very poor quality.'
    );
    console.log('✅ Negative sentiment:', negative);
    
    // Analyze neutral sentiment
    const neutral = await analyzeSentiment(
      'The product arrived on time.'
    );
    console.log('✅ Neutral sentiment:', neutral);
    
  } catch (error) {
    console.log('❌ Sentiment API error:', error);
  }
}

// ============================================================================
// Example 9: Batch Operations
// ============================================================================

async function example9_BatchOperations() {
  console.log('\n📦 Example 9: Batch Operations');
  console.log('='.repeat(60));
  
  const campaign = await CampaignModel.create({
    name: 'Batch Test',
    userId: 1,
    status: CampaignStatus.Active
  });
  
  // Method 1: Loop (slower for large datasets)
  console.log('Method 1: Loop insertion');
  const start1 = Date.now();
  for (let i = 0; i < 10; i++) {
    await JobModel.create({
      campaignId: campaign.id,
      customerEmail: `loop${i}@example.com`,
      currentStep: JobStepName.SendEmail,
      status: JobStatus.Pending,
      retryCount: 0
    });
  }
  console.log(`✅ Loop: ${Date.now() - start1}ms for 10 jobs`);
  
  // Method 2: Batch insert with raw SQL (faster)
  console.log('\nMethod 2: Batch SQL insertion');
  const start2 = Date.now();
  const values = Array.from({ length: 10 }, (_, i) => 
    `(${campaign.id}, 'batch${i}@example.com', ${JobStepName.SendEmail}, ${JobStatus.Pending}, 0)`
  ).join(',');
  
  await executeSql(
    `INSERT INTO jobs (campaign_id, customer_email, current_step, status, retry_count)
     VALUES ${values}`
  );
  console.log(`✅ Batch: ${Date.now() - start2}ms for 10 jobs`);
  
  // Method 3: Batch with transaction
  console.log('\nMethod 3: Transaction with batching');
  const start3 = Date.now();
  await transaction(async () => {
    const BATCH_SIZE = 5;
    const emails = Array.from({ length: 10 }, (_, i) => `tx${i}@example.com`);
    
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const batchValues = batch.map(email => 
        `(${campaign.id}, '${email}', ${JobStepName.SendEmail}, ${JobStatus.Pending}, 0)`
      ).join(',');
      
      await executeSql(
        `INSERT INTO jobs (campaign_id, customer_email, current_step, status, retry_count)
         VALUES ${batchValues}`
      );
    }
  });
  console.log(`✅ Transaction batch: ${Date.now() - start3}ms for 10 jobs`);
  
  const totalJobs = await JobModel.filter({ campaignId: campaign.id }).count();
  console.log(`\n✅ Total jobs created: ${totalJobs}`);
}

// ============================================================================
// Example 10: Job Steps Recording
// ============================================================================

async function example10_JobSteps() {
  console.log('\n📋 Example 10: Job Steps Recording');
  console.log('='.repeat(60));
  
  const campaign = await CampaignModel.create({
    name: 'Step Recording Test',
    userId: 1,
    status: CampaignStatus.Active
  });
  
  const job = await JobModel.create({
    campaignId: campaign.id,
    customerEmail: 'steps@example.com',
    currentStep: JobStepName.SendEmail,
    status: JobStatus.Pending,
    retryCount: 0
  });
  
  // Record step 1: Send Email
  await JobStepModel.create({
    jobId: job.id,
    stepName: JobStepName.SendEmail,
    status: JobStepStatus.Completed,
    outputData: { messageId: 'msg_123' },
    startedAt: new Date()
  });
  console.log('✅ Recorded step: send_email');
  
  // Update job to next step
  await JobModel.filter({ id: job.id }).update({
    currentStep: JobStepName.Analyze,
    status: JobStatus.Pending
  });
  
  // Record step 2: Analyze
  await JobStepModel.create({
    jobId: job.id,
    stepName: JobStepName.Analyze,
    status: JobStepStatus.Completed,
    outputData: { sentiment: 'positive' },
    startedAt: new Date()
  });
  console.log('✅ Recorded step: analyze');
  
  // Record step 3: Take Action
  await JobStepModel.create({
    jobId: job.id,
    stepName: JobStepName.TakeAction,
    status: JobStepStatus.Completed,
    outputData: { action: 'sent_to_salesforce' },
    startedAt: new Date()
  });
  console.log('✅ Recorded step: take_action');
  
  // Mark job as completed
  await JobModel.filter({ id: job.id }).update({
    status: JobStatus.Completed,
    completedAt: new Date()
  });
  
  // Retrieve all steps for this job
  const steps = await JobStepModel.filter({ jobId: job.id }).all();
  console.log(`\n✅ Total steps recorded: ${steps.length}`);
  steps.forEach(step => {
    console.log(`   - ${step.stepName}: ${step.status}`);
  });
}

// ============================================================================
// Example 11: Atomic Job Claiming
// ============================================================================

async function example11_AtomicClaiming() {
  console.log('\n🔒 Example 11: Atomic Job Claiming');
  console.log('='.repeat(60));
  
  const campaign = await CampaignModel.create({
    name: 'Claiming Test',
    userId: 1,
    status: CampaignStatus.Active
  });
  
  // Create 5 jobs
  for (let i = 1; i <= 5; i++) {
    await JobModel.create({
      campaignId: campaign.id,
      customerEmail: `claim${i}@example.com`,
      currentStep: JobStepName.SendEmail,
      status: JobStatus.Pending,
      retryCount: 0
    });
  }
  
  // Simulate 3 workers claiming jobs simultaneously
  const claimJob = async (workerId: string) => {
    return await transaction(async () => {
      const job = await JobModel.filter({ status: JobStatus.Pending })
        .orderBy('createdAt', 'ASC')
        .first();
      
      if (job) {
        await JobModel.filter({ id: job.id }).update({
          status: JobStatus.Processing,
          workerId: workerId
        });
        return job;
      }
      return null;
    });
  };
  
  const claims = await Promise.all([
    claimJob('worker-1'),
    claimJob('worker-2'),
    claimJob('worker-3')
  ]);
  
  const successfulClaims = claims.filter(c => c !== null);
  console.log(`✅ ${successfulClaims.length} jobs claimed`);
  successfulClaims.forEach(job => {
    console.log(`   - Job ${job?.id} claimed by ${job?.workerId}`);
  });
  
  // Verify no duplicates
  const claimedIds = successfulClaims.map(j => j?.id);
  const uniqueIds = new Set(claimedIds);
  console.log(`✅ All claims unique: ${claimedIds.length === uniqueIds.size}`);
}

// ============================================================================
// Run All Examples
// ============================================================================

async function runAllExamples() {
  console.log('\n🚀 Running All Examples\n');
  console.log('='.repeat(60));
  
  // Note: Run 'npm run setup' first to initialize the database
  // resetDatabase() only clears data, doesn't recreate tables
  
  // Reset APIs for clean state
  resetApis();
  
  try {
    await example1_BasicCRUD();
    await example2_QueryBuilder();
    await example3_Transactions();
    await example4_RawSQL();
    await example5_SendEmail();
    await example6_ErrorHandling();
    await example7_SalesforceAPI();
    await example8_SentimentAPI();
    await example9_BatchOperations();
    await example10_JobSteps();
    await example11_AtomicClaiming();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All examples completed successfully!\n');
    
  } catch (error: any) {
    console.error('\n❌ Error running examples:', error.message);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}
