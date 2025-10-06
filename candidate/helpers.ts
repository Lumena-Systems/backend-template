/**
 * Helper functions that candidates can use
 */

import { Job, JobStep } from '../lib/orm.js';

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function generateIdempotencyKey(jobId: number, step: string): string {
  return `${jobId}-${step}`;
}

export const WORKFLOW_STEPS = ['send_email', 'analyze', 'take_action'] as const;

export function getNextStep(current: string): string | null {
  const index = WORKFLOW_STEPS.indexOf(current as any);
  return index >= 0 && index < WORKFLOW_STEPS.length - 1
    ? WORKFLOW_STEPS[index + 1]
    : null;
}

export function isTransientError(error: Error): boolean {
  return error.name === 'RateLimitError' || 
         error.name === 'TimeoutError';
}

export function isPermanentError(error: Error): boolean {
  return error.name === 'InvalidEmailError';
}
