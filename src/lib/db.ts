import Database from 'better-sqlite3';
import path from 'path';

// Construct the path to the SQLite database
// In a real application, this path might come from an environment variable.
const DB_PATH = path.resolve(process.cwd(), 'lims_mirror.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, {
      readonly: true, // We only need read access for the viewer
      fileMustExist: true,
    });
  }
  return db;
}

export function getTables(): string[] {
  const database = getDb();
  const stmt = database.prepare(`
    SELECT name 
    FROM sqlite_master 
    WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
  `);
  
  const tables = stmt.all() as { name: string }[];
  return tables.map(t => t.name);
}

export interface ColumnSchema {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

export function getTableSchema(tableName: string): ColumnSchema[] {
  const database = getDb();
  // Using PRAGMA to get table info. Note that PRAGMA statements cannot use bound parameters in the same way,
  // so we must interpolate. However, to prevent SQL injection, we must validate the table name first.
  const tables = getTables();
  if (!tables.includes(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  const stmt = database.prepare(`PRAGMA table_info("${tableName}")`);
  return stmt.all() as ColumnSchema[];
}

export interface FetchDataOptions {
  tableName: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  // simple filter: column name -> value
  filters?: Record<string, string>;
}

export function getTableData({ tableName, page, pageSize, sortBy, sortDirection, filters }: FetchDataOptions) {
  const database = getDb();
  const tables = getTables();
  if (!tables.includes(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  const schema = getTableSchema(tableName);
  const columnNames = schema.map(col => col.name);

  // Validate sort column
  if (sortBy && !columnNames.includes(sortBy)) {
    throw new Error(`Invalid sort column: ${sortBy}`);
  }

  const conditions: string[] = [];
  const params: any[] = [];

  // Add filters safely
  if (filters) {
    for (const [key, value] of Object.entries(filters)) {
      if (columnNames.includes(key) && value !== undefined && value !== '') {
        // Simple case-insensitive LIKE search for text
        conditions.push(`"${key}" LIKE ?`);
        params.push(`%${value}%`);
      }
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderClause = sortBy ? `ORDER BY "${sortBy}" ${sortDirection === 'desc' ? 'DESC' : 'ASC'}` : '';
  
  const offset = (page - 1) * pageSize;
  const limitClause = `LIMIT ? OFFSET ?`;
  
  const dataQuery = `SELECT * FROM "${tableName}" ${whereClause} ${orderClause} ${limitClause}`;
  const countQuery = `SELECT COUNT(*) as count FROM "${tableName}" ${whereClause}`;

  const countStmt = database.prepare(countQuery);
  const dataStmt = database.prepare(dataQuery);

  const totalCount = (countStmt.get(...params) as { count: number }).count;
  const rows = dataStmt.all(...params, pageSize, offset);

  return {
    rows,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}
