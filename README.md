# Backend System Design Interview - Candidate Guide

## Overview

**Duration:** ~60 minutes  
**Format:** Design discussion + Live coding + Debugging

You'll build a distributed job processing system that executes workflow-based campaigns at scale.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Initialize database with sample data
npm run setup

# 3. Start coding (watch mode - auto-reloads)
npm run dev
```

> **Note:** You only edit `candidate/solution.ts` – Everything else is provided infrastructure. Do not modify other files.

## The Problem

Build the backend for an automation platform where users create campaigns with workflows like:

1. Query Salesforce for 50,000 customers
2. Send personalized emails via SendGrid
3. Wait 48 hours for reply
4. Analyze sentiment
5. Route based on response

**Your challenge:** Make this work reliably with multiple workers processing jobs concurrently.

## Your Tasks

### Task A: Claim a Job (~10 min)

Implement `claimNextJob()` - atomically claim one pending job for this worker.

**Key challenge:** 20 workers calling this simultaneously. Each job should be claimed by exactly one worker.

### Task B: Batch Job Creation (~8 min)

Implement `createCampaignJobs(campaignId, customerEmails)` - create jobs for 50,000 emails efficiently.

**Key challenge:** Individual inserts would take 60+ seconds. Make it performant.

### Task C: Handle External API Failure (~10 min)

Implement `sendEmailStep(job)` - send email with proper error handling.

**Error types:**
- `RateLimitError` - transient, should retry
- `TimeoutError` - transient, should retry
- `InvalidEmailError` - permanent, should not retry

**Key challenge:** Different errors require different handling strategies.

### Task D: Idempotent Processing (~12 min)

Implement `processJob(job)` - process job through current step, then advance to next step. Must be safe to call multiple times.

**Workflow steps:** `send_email` → `analyze` → `take_action` → `done`

**Key challenge:** Workers crash and jobs get retried. Ensure work is not duplicated.

## Testing

```bash
# During development
npm run dev

# Run full test suite
npm test

# Debug scenarios (for Part 3 discussion)
npm run scenarios 1  # Slow throughput
npm run scenarios 2  # Duplicate detection
npm run scenarios 3  # Connection pool stress
```

## Quick Reference

### ORM Basics

```typescript
// Query
const job = await JobModel.filter({ status: 'pending' }).first();
const job = await JobModel.get({ id: 123 }); // Throws if not found

// Create
const job = await JobModel.create({ campaignId: 1, ... });

// Update
job.status = 'completed';
await job.save();
```

### Transactions

```typescript
await transaction(async () => {
  // All operations commit together or rollback together
  await JobModel.create({...});
  await job.save();
});
```

### Raw SQL (for advanced operations)

```typescript
const rows = await executeSql<Job>(`
  SELECT * FROM jobs WHERE status = 'pending'
  FOR UPDATE SKIP LOCKED LIMIT 1
`, []);
```

### External APIs

```typescript
const messageId = await sendEmail(to, body, idempotencyKey);
const sentiment = await analyzeSentiment(text); // Returns: 'positive' | 'negative' | 'neutral'
```

## Interview Structure

### Part 1 (15 min): Design discussion
- What tables/data structures do you need?
- What are the system components and how do they interact?

### Part 2 (25 min): Implement the 4 tasks
- Evaluation focuses on correctness, concurrency handling, and error handling

### Part 3 (15 min): Debug production issues
- Given metrics from a running system, diagnose problems
- Example: "5000 jobs queued, 20 workers active, only 300 jobs/min processed. What's wrong?"

## Key Concepts to Demonstrate

- **Concurrency control** - Prevent race conditions between workers
- **Idempotency** - Operations must be safe to retry
- **Error handling** - Distinguish transient vs permanent failures
- **Bulk operations** - Efficient processing of large datasets
- **Transactions** - Atomic database operations
- **Observability** - Understanding how to debug distributed systems with metrics

## Troubleshooting

**Reset everything:**
```bash
rm interview.db
npm run setup
```

**Module errors:** Ensure you use `.js` extensions in imports (TypeScript requirement)

**TypeScript errors:** Node.js 18+ required

## Checklist Before Completion

- [ ] All 4 functions implemented
- [ ] Ran `npm test` at least once
- [ ] Code handles concurrent workers correctly (no race conditions)
- [ ] Code handles worker crashes gracefully (operations are idempotent)
- [ ] Can explain design decisions and trade-offs

## Guidelines

- **External resources permitted** - This is not a memorization test. Looking up SQL syntax or TypeScript methods is acceptable.
- **Ask clarifying questions** - When requirements are ambiguous, ask rather than assume.
- **Communicate your thinking** - Explain your approach as you work.
- **Iterate incrementally** - Get basic functionality working first, then add error handling and optimizations.
- **Test frequently** - Use `npm run dev` to validate your code as you progress.

## Common Pitfalls to Avoid

- Writing code without considering concurrent access
- Treating all errors identically
- Placing external API calls inside database transactions
- Assuming operations are atomic without explicit locking
- Not implementing idempotency checks

---

**Good luck with the interview!**