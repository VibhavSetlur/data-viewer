import { NextRequest, NextResponse } from 'next/server';
import { getTables, getTablesWithCounts } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const withCounts = request.nextUrl.searchParams.get('withCounts') === '1';
    if (withCounts) {
      const tables = await getTablesWithCounts();
      return NextResponse.json({ tables });
    }
    const tables = await getTables();
    return NextResponse.json({ tables });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch tables';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
