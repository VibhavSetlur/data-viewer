import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import path from 'path';

export type DbType = 'sqlite' | 'mysql';

interface DbConfig {
  type: DbType;
  sqlitePath: string;
  mysqlHost: string;
  mysqlPort: number;
  mysqlUser: string;
  mysqlPassword: string;
  mysqlDatabase: string;
}

function parseMysqlUrl(url: string): { host: string; port: number; user: string; password: string; database: string } {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: parseInt(u.port || '3306', 10),
      user: decodeURIComponent(u.username) || 'root',
      password: decodeURIComponent(u.password || ''),
      database: (u.pathname || '/lims').replace(/^\//, '') || 'lims',
    };
  } catch {
    return { host: 'localhost', port: 3306, user: 'root', password: '', database: 'lims' };
  }
}

const envType = process.env.DB_TYPE as string | undefined;
const mysqlUrl = process.env.MYSQL_URL ? parseMysqlUrl(process.env.MYSQL_URL) : null;
let config: DbConfig = {
  type: (envType === 'sqlite' || envType === 'mysql' ? envType : 'sqlite') as DbType,
  sqlitePath: path.resolve(process.cwd(), process.env.SQLITE_PATH || 'data/lims_mirror.db'),
  mysqlHost: mysqlUrl?.host ?? process.env.MYSQL_HOST ?? 'localhost',
  mysqlPort: mysqlUrl?.port ?? parseInt(process.env.MYSQL_PORT || '3306', 10),
  mysqlUser: mysqlUrl?.user ?? process.env.MYSQL_USER ?? 'root',
  mysqlPassword: mysqlUrl?.password ?? process.env.MYSQL_PASSWORD ?? '',
  mysqlDatabase: mysqlUrl?.database ?? process.env.MYSQL_DATABASE ?? 'lims',
};

let sqliteDb: Database.Database | null = null;
let mysqlPool: mysql.Pool | null = null;
let configVersion = 0;

function needsPoolReset(partial: Partial<DbConfig>): boolean {
  return 'mysqlHost' in partial || 'mysqlPort' in partial || 'mysqlUser' in partial ||
         'mysqlPassword' in partial || 'mysqlDatabase' in partial;
}

export function getDbType(): DbType {
  return config.type;
}

export function getDbConfig(): DbConfig {
  return { ...config };
}

export function setDbConfig(partial: Partial<DbConfig>): void {
  const changed = needsPoolReset(partial);
  if ((partial.type && partial.type !== config.type) || changed) {
    closeConnections();
  }
  config = { ...config, ...partial };
  if (changed) configVersion++;
}

function closeConnections(): void {
  if (sqliteDb) {
    try { sqliteDb.close(); } catch {}
    sqliteDb = null;
  }
  if (mysqlPool) {
    try { mysqlPool.end(); } catch {}
    mysqlPool = null;
  }
}

let lastSqlitePath = '';
function getSqliteDb(): Database.Database {
  if (!sqliteDb || lastSqlitePath !== config.sqlitePath) {
    if (sqliteDb) { try { sqliteDb.close(); } catch {} }
    sqliteDb = new Database(config.sqlitePath, { readonly: true, fileMustExist: false });
    lastSqlitePath = config.sqlitePath;
  }
  return sqliteDb;
}

let lastConfigVersion = -1;
function getMySqlPool(): mysql.Pool {
  if (!mysqlPool || lastConfigVersion !== configVersion) {
    if (mysqlPool) { try { mysqlPool.end(); } catch {} }
    mysqlPool = mysql.createPool({
      host: config.mysqlHost,
      port: config.mysqlPort,
      user: config.mysqlUser,
      password: config.mysqlPassword,
      database: config.mysqlDatabase,
      waitForConnections: true,
      connectionLimit: 5,
    });
    lastConfigVersion = configVersion;
  }
  return mysqlPool;
}

function quoteIdent(name: string): string {
  return config.type === 'mysql' ? `\`${name}\`` : `"${name}"`;
}

import type { RowDataPacket } from 'mysql2/promise';

interface MysqlTableRow extends RowDataPacket { name: string }
interface MysqlColumnRow extends RowDataPacket { name: string; type: string; nullable: string; dflt_value: string | null }
interface MysqlCountRow extends RowDataPacket { count: number }
interface MysqlDataRow extends RowDataPacket { [key: string]: unknown }

export interface ColumnSchema {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null | number | undefined;
  pk: number;
}

function validateTableName(tables: string[], tableName: string): void {
  if (!tables.includes(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
}

export async function getTables(): Promise<string[]> {
  if (config.type === 'mysql') {
    const pool = getMySqlPool();
    const [rows] = await pool.query<MysqlTableRow[]>(
      "SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
      [config.mysqlDatabase]
    );
    return rows.map(r => r.name);
  }

  const database = getSqliteDb();
  const stmt = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  return (stmt.all() as { name: string }[]).map(t => t.name);
}

export async function getTableSchema(tableName: string): Promise<ColumnSchema[]> {
  const tables = await getTables();
  validateTableName(tables, tableName);

  if (config.type === 'mysql') {
    const pool = getMySqlPool();
    const [rows] = await pool.query<MysqlColumnRow[]>(
      "SELECT COLUMN_NAME as name, DATA_TYPE as type, IS_NULLABLE as nullable, COLUMN_DEFAULT as dflt_value, COALESCE(CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, 0) as len FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
      [config.mysqlDatabase, tableName]
    );
    return rows.map((r, i: number) => ({
      cid: i,
      name: r.name,
      type: r.type.toUpperCase(),
      notnull: r.nullable === 'NO' ? 1 : 0,
      dflt_value: r.dflt_value,
      pk: 0,
    }));
  }

  const database = getSqliteDb();
  const stmt = database.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`);
  return stmt.all() as ColumnSchema[];
}

export interface FetchDataOptions {
  tableName: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: Record<string, { value: string; operator: string }>;
  globalSearch?: string;
  filterLogic?: 'AND' | 'OR';
}

export async function getTableData({
  tableName, page, pageSize, sortBy, sortDirection, filters, globalSearch, filterLogic,
}: FetchDataOptions) {
  const tables = await getTables();
  validateTableName(tables, tableName);

  const schema = await getTableSchema(tableName);
  const columnNames = schema.map(col => col.name);

  if (sortBy && !columnNames.includes(sortBy)) {
    throw new Error(`Invalid sort column: ${sortBy}`);
  }

  const filterConditions: string[] = [];
  const globalSearchParts: string[] = [];
  const params: (string | number)[] = [];

  // Build column filter conditions
  if (filters) {
    for (const [key, { value, operator }] of Object.entries(filters)) {
      if (columnNames.includes(key) && value !== undefined && value !== '') {
        const column = schema.find(c => c.name === key);
        const isNumeric = column && ['INTEGER', 'REAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'DECIMAL', 'BIGINT', 'SMALLINT', 'TINYINT', 'INT', 'NUMBER'].some(t =>
          column.type.toUpperCase().includes(t));

        let condition: string;
        let param: string | number;
        const qi = quoteIdent(key);

        switch (operator) {
          case 'contains':
            condition = `${qi} LIKE ?`;
            param = `%${value}%`;
            break;
          case 'equals':
            condition = `${qi} = ?`;
            param = value;
            break;
          case 'startsWith':
            condition = `${qi} LIKE ?`;
            param = `${value}%`;
            break;
          case 'endsWith':
            condition = `${qi} LIKE ?`;
            param = `%${value}`;
            break;
          case '>':
            if (isNumeric) { condition = `${qi} > ?`; param = parseFloat(value); }
            else { condition = `${qi} > ?`; param = value; }
            break;
          case '<':
            if (isNumeric) { condition = `${qi} < ?`; param = parseFloat(value); }
            else { condition = `${qi} < ?`; param = value; }
            break;
          case '>=':
            if (isNumeric) { condition = `${qi} >= ?`; param = parseFloat(value); }
            else { condition = `${qi} >= ?`; param = value; }
            break;
          case '<=':
            if (isNumeric) { condition = `${qi} <= ?`; param = parseFloat(value); }
            else { condition = `${qi} <= ?`; param = value; }
            break;
          case '=':
            condition = `${qi} = ?`; param = isNumeric ? parseFloat(value) : value;
            break;
          case '!=':
            condition = `${qi} != ?`; param = isNumeric ? parseFloat(value) : value;
            break;
          default:
            condition = `${qi} LIKE ?`; param = `%${value}%`;
        }

        filterConditions.push(condition);
        params.push(param);
      }
    }
  }

  // Build global search
  if (globalSearch) {
    const textColumns = schema.filter(c =>
      ['TEXT', 'VARCHAR', 'CHAR'].some(t => c.type.toUpperCase().includes(t))
    ).map(c => c.name);
    const searchCols = textColumns.length > 0 ? textColumns : columnNames;
    const clauses = searchCols.map(col => `${quoteIdent(col)} LIKE ?`);
    globalSearchParts.push(`(${clauses.join(' OR ')})`);
    for (let i = 0; i < searchCols.length; i++) {
      params.push(`%${globalSearch}%`);
    }
  }

  // Combine conditions
  const joinLogic = filterLogic === 'OR' ? ' OR ' : ' AND ';
  const combined: string[] = [];
  if (filterConditions.length > 0) {
    combined.push(`(${filterConditions.join(joinLogic)})`);
  }
  if (globalSearchParts.length > 0) {
    combined.push(...globalSearchParts);
  }
  const whereClause = combined.length > 0 ? `WHERE ${combined.join(' AND ')}` : '';
  const orderClause = sortBy ? `ORDER BY ${quoteIdent(sortBy)} ${sortDirection === 'desc' ? 'DESC' : 'ASC'}` : '';
  const offset = (page - 1) * pageSize;

  const qi = quoteIdent(tableName);

  if (config.type === 'mysql') {
    const pool = getMySqlPool();
    const countQuery = `SELECT COUNT(*) as count FROM ${qi} ${whereClause}`;
    const dataQuery = `SELECT * FROM ${qi} ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;

    const [countRows] = await pool.query<MysqlCountRow[]>(countQuery, params);
    const totalCount = countRows[0].count;

    const dataParams: (string | number)[] = [...params, pageSize, offset];
    const [rows] = await pool.query<MysqlDataRow[]>(dataQuery, dataParams);

    return {
      rows,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  }

  // SQLite
  const database = getSqliteDb();
  const dataQuery = `SELECT * FROM ${qi} ${whereClause} ${orderClause} LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) as count FROM ${qi} ${whereClause}`;

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
