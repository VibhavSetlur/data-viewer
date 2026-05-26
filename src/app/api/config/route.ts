import { NextRequest, NextResponse } from 'next/server';
import { getDbConfig, getDbType, setDbConfig, getTables } from '@/lib/db';

export async function GET() {
  const config = getDbConfig();
  const dbType = getDbType();
  let tables: string[] = [];
  let error: string | null = null;

  try {
    tables = await getTables();
  } catch (e: any) {
    error = e.message;
  }

  return NextResponse.json({
    type: dbType,
    tables,
    error,
    // Only send non-sensitive info
    mysqlHost: config.mysqlHost,
    mysqlPort: config.mysqlPort,
    mysqlDatabase: config.mysqlDatabase,
    sqlitePath: config.sqlitePath,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, mysqlHost, mysqlPort, mysqlUser, mysqlPassword, mysqlDatabase, sqlitePath } = body;

    if (type && !['sqlite', 'mysql'].includes(type)) {
      return NextResponse.json({ error: 'Invalid DB type. Must be "sqlite" or "mysql".' }, { status: 400 });
    }

    setDbConfig({
      type: type || undefined,
      ...(mysqlHost !== undefined && { mysqlHost }),
      ...(mysqlPort !== undefined && { mysqlPort: parseInt(String(mysqlPort), 10) }),
      ...(mysqlUser !== undefined && { mysqlUser }),
      ...(mysqlPassword !== undefined && { mysqlPassword }),
      ...(mysqlDatabase !== undefined && { mysqlDatabase }),
      ...(sqlitePath !== undefined && { sqlitePath }),
    });

    // Test the new connection by fetching tables
    let tables: string[] = [];
    let error: string | null = null;
    try {
      tables = await getTables();
    } catch (e: any) {
      error = e.message;
    }

    return NextResponse.json({
      type: getDbType(),
      tables,
      error,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
