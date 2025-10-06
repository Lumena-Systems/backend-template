/**
 * Database connection and raw SQL execution
 */

import Database from 'better-sqlite3';

const DB_PATH = './interview.db';
let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export interface SqlResult {
  affectedRows: number;
  insertId?: number;
}

export async function executeSql<T = any>(
  query: string,
  params: any[] = []
): Promise<T[]> {
  const db = getDatabase();
  
  // Normalize query - remove extra whitespace
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  
  try {
    if (normalizedQuery.toUpperCase().startsWith('SELECT')) {
      const stmt = db.prepare(query);
      const rows = stmt.all(...params);
      return rows as T[];
    } else {
      // INSERT, UPDATE, DELETE
      const stmt = db.prepare(query);
      const info = stmt.run(...params);
      
      // Return result info in a format similar to what candidates expect
      return [{
        affectedRows: info.changes,
        insertId: info.lastInsertRowid
      } as any];
    }
  } catch (error: any) {
    // Enhanced error messages
    if (error.message.includes('UNIQUE constraint failed')) {
      const err = new Error('Unique constraint violation') as any;
      err.code = 'UNIQUE_VIOLATION';
      throw err;
    }
    throw error;
  }
}

// Transaction support
let transactionDepth = 0;

export async function transaction<T>(
  callback: () => Promise<T>
): Promise<T> {
  const db = getDatabase();
  
  if (transactionDepth === 0) {
    db.prepare('BEGIN').run();
  }
  
  transactionDepth++;
  
  try {
    const result = await callback();
    
    transactionDepth--;
    
    if (transactionDepth === 0) {
      db.prepare('COMMIT').run();
    }
    
    return result;
  } catch (error) {
    transactionDepth--;
    
    if (transactionDepth === 0) {
      db.prepare('ROLLBACK').run();
    }
    
    throw error;
  }
}

// Helper to reset database for testing
export function resetDatabase(): void {
  const db = getDatabase();
  db.exec(`
    DELETE FROM job_steps;
    DELETE FROM jobs;
    DELETE FROM campaigns;
  `);
}
