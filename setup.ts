/**
 * Database initialization script
 * Run this first: npm run setup
 */

import Database from 'better-sqlite3';
import { existsSync, unlinkSync } from 'fs';

const DB_PATH = './interview.db';

// Clean start
if (existsSync(DB_PATH)) {
  unlinkSync(DB_PATH);
  console.log('🗑️  Removed old database');
}

const db = new Database(DB_PATH);

console.log('📦 Creating database schema...');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    status INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    customer_email TEXT NOT NULL,
    current_step INTEGER NOT NULL,
    status INTEGER NOT NULL DEFAULT 0,
    worker_id TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    error_message TEXT,
    scheduled_for DATETIME,
    last_heartbeat DATETIME,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
  );

  CREATE TABLE job_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    step_name INTEGER NOT NULL,
    status INTEGER NOT NULL,
    output_data TEXT,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    UNIQUE(job_id, step_name)
  );

  -- Indexes for performance
  CREATE INDEX idx_jobs_status_created ON jobs(status, created_at);
  CREATE INDEX idx_jobs_campaign ON jobs(campaign_id);
  CREATE INDEX idx_job_steps_job ON job_steps(job_id);
`);

console.log('✅ Database schema created');

// Insert sample data
console.log('📝 Inserting sample data...');

// CampaignStatus: Draft=0, Active=1, Paused=2, Completed=3, Archived=4
// JobStepName: SendEmail=0, Analyze=1, TakeAction=2
// JobStatus: Pending=0, Processing=1, Failed=2, Completed=3

const campaign = db.prepare(`
  INSERT INTO campaigns (name, user_id, status)
  VALUES (?, ?, ?)
`).run('Test Campaign', 1, 1); // Active = 1

const campaignId = campaign.lastInsertRowid;

// Insert 100 sample jobs
const insertJob = db.prepare(`
  INSERT INTO jobs (campaign_id, customer_email, current_step, status)
  VALUES (?, ?, ?, ?)
`);

for (let i = 1; i <= 100; i++) {
  insertJob.run(
    campaignId,
    `customer${i}@example.com`,
    0, // SendEmail = 0
    0  // Pending = 0
  );
}

console.log(`✅ Inserted ${campaign.changes} campaign and 100 jobs`);

// Verify
const count = db.prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number };
console.log(`\n📊 Total jobs in database: ${count.count}`);

db.close();
console.log('\n🎉 Setup complete! Run: npm run dev');
