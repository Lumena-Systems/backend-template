/**
 * ORM implementation - mimics Prisma/TypeORM
 */

import { getDatabase, executeSql } from './database.js';

// ============================================================================
// Enums
// ============================================================================

export enum JobStatus {
  Pending,
  Processing,
  Failed,
  Completed
}

export enum JobStepName {
  SendEmail,
  Analyze,
  TakeAction
}

export enum JobStepStatus {
  Pending,
  InProgress,
  Completed,
  Failed
}

export enum CampaignStatus {
  Draft,
  Active,
  Paused,
  Completed,
  Archived
}

// ============================================================================
// Interfaces
// ============================================================================

export interface Job {
  id: number;
  campaignId: number;
  customerEmail: string;
  currentStep: JobStepName;
  status: JobStatus;
  workerId: string | null;
  retryCount: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  scheduledFor: Date | null;
  lastHeartbeat: Date | null;
}

export interface JobStep {
  id: number;
  jobId: number;
  stepName: JobStepName;
  status: JobStepStatus;
  outputData: Record<string, any>;
  startedAt: Date;
  completedAt: Date | null;
}

export interface Campaign {
  id: number;
  name: string;
  userId: number;
  status: CampaignStatus;
  createdAt: Date;
}

// ============================================================================
// Query Builder
// ============================================================================

export class QuerySet<T> {
  private table: string;
  private conditions: Partial<T> = {};
  private orderByField?: keyof T;
  private orderDirection: 'ASC' | 'DESC' = 'ASC';
  private limitCount?: number;

  constructor(table: string) {
    this.table = table;
  }

  filter(conditions: Partial<T>): QuerySet<T> {
    this.conditions = { ...this.conditions, ...conditions };
    return this;
  }

  orderBy(field: keyof T, direction: 'ASC' | 'DESC' = 'ASC'): QuerySet<T> {
    this.orderByField = field;
    this.orderDirection = direction;
    return this;
  }

  limit(n: number): QuerySet<T> {
    this.limitCount = n;
    return this;
  }

  async first(): Promise<T | null> {
    this.limitCount = 1;
    const results = await this.all();
    return results[0] || null;
  }

  async count(): Promise<number> {
    const where = this.buildWhere();
    const query = `SELECT COUNT(*) as count FROM ${this.table} ${where.clause}`;
    const result = await executeSql<{ count: number }>(query, where.params);
    return result[0]?.count || 0;
  }

  async update(values: Partial<T>): Promise<number> {
    const where = this.buildWhere();
    const setClauses: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(values)) {
      setClauses.push(`${this.toSnakeCase(key)} = ?`);
      params.push(this.serializeValue(value));
    }

    // If no fields to update, return 0
    if (setClauses.length === 0) {
      return 0;
    }

    params.push(...where.params);

    const query = `
      UPDATE ${this.table}
      SET ${setClauses.join(', ')}
      ${where.clause}
    `;

    const result = await executeSql(query, params);
    return result[0]?.affectedRows || 0;
  }

  async all(): Promise<T[]> {
    const where = this.buildWhere();
    let query = `SELECT * FROM ${this.table} ${where.clause}`;

    if (this.orderByField) {
      const field = this.toSnakeCase(this.orderByField as string);
      query += ` ORDER BY ${field} ${this.orderDirection}`;
    }

    if (this.limitCount) {
      query += ` LIMIT ${this.limitCount}`;
    }

    const rows = await executeSql<any>(query, where.params);
    return rows.map(row => this.deserializeRow(row));
  }

  private buildWhere(): { clause: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(this.conditions)) {
      const column = this.toSnakeCase(key);
      conditions.push(`${column} = ?`);
      params.push(this.serializeValue(value));
    }

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params
    };
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private serializeValue(value: any): any {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return value;
  }

  private deserializeRow(row: any): T {
    const result: any = {};
    
    for (const [key, value] of Object.entries(row)) {
      const camelKey = this.toCamelCase(key);
      
      // Handle dates
      if (key.includes('_at') || key === 'scheduled_for') {
        result[camelKey] = value ? new Date(value as string) : null;
      }
      // Handle JSON
      else if (key === 'output_data' && typeof value === 'string') {
        try {
          result[camelKey] = JSON.parse(value);
        } catch {
          result[camelKey] = {};
        }
      }
      else {
        result[camelKey] = value;
      }
    }
    
    return result as T;
  }
}

// ============================================================================
// Model Classes
// ============================================================================

class BaseModel<T> {
  constructor(protected table: string, protected data: Partial<T> = {}) {}

  static filter<T>(this: new (table?: string) => BaseModel<T>, conditions: Partial<T>): QuerySet<T> {
    const instance = new this();
    return new QuerySet<T>(instance.getTable()).filter(conditions);
  }

  static async get<T>(this: new (table?: string) => BaseModel<T>, conditions: Partial<T>): Promise<T> {
    const instance = new this();
    const result = await new QuerySet<T>(instance.getTable()).filter(conditions).first();
    
    if (!result) {
      throw new Error(`Record not found in ${instance.getTable()}`);
    }
    
    return result;
  }

  static async create<T>(this: new () => BaseModel<T>, data: Partial<T>): Promise<T> {
    const temp = new this();
    const instance = new (this as any)(temp.getTable(), data);
    return instance.save() as Promise<T>;
  }

  async save(): Promise<T> {
    const id = (this.data as any).id;
    
    if (id) {
      // Update existing
      const setClauses: string[] = [];
      const params: any[] = [];

      for (const [key, value] of Object.entries(this.data)) {
        if (key !== 'id') {
          setClauses.push(`${this.toSnakeCase(key)} = ?`);
          params.push(this.serializeValue(value));
        }
      }

      // If no fields to update, just return the data as is
      if (setClauses.length === 0) {
        return this.data as T;
      }

      params.push(id);

      const query = `
        UPDATE ${this.table}
        SET ${setClauses.join(', ')}
        WHERE id = ?
      `;

      await executeSql(query, params);
      return this.data as T;
    } else {
      // Insert new
      const columns: string[] = [];
      const placeholders: string[] = [];
      const params: any[] = [];

      for (const [key, value] of Object.entries(this.data)) {
        columns.push(this.toSnakeCase(key));
        placeholders.push('?');
        params.push(this.serializeValue(value));
      }

      const query = `
        INSERT INTO ${this.table} (${columns.join(', ')})
        VALUES (${placeholders.join(', ')})
      `;

      const result = await executeSql(query, params);
      (this.data as any).id = result[0].insertId;
      
      return this.data as T;
    }
  }

  async delete(): Promise<void> {
    const id = (this.data as any).id;
    if (!id) throw new Error('Cannot delete record without id');
    
    await executeSql(`DELETE FROM ${this.table} WHERE id = ?`, [id]);
  }

  protected getTable(): string {
    return this.table;
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  private serializeValue(value: any): any {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return value;
  }
}

export class JobModelClass extends BaseModel<Job> {
  constructor(table: string = 'jobs', data: Partial<Job> = {}) {
    super(table, data);
  }
}

export class JobStepModelClass extends BaseModel<JobStep> {
  constructor(table: string = 'job_steps', data: Partial<JobStep> = {}) {
    super(table, data);
  }
}

export class CampaignModelClass extends BaseModel<Campaign> {
  constructor(table: string = 'campaigns', data: Partial<Campaign> = {}) {
    super(table, data);
  }
}

// Export as static classes for the interface
export const JobModel = JobModelClass;
export const JobStepModel = JobStepModelClass;
export const CampaignModel = CampaignModelClass;
