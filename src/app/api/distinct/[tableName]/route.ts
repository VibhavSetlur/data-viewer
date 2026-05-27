import { NextRequest, NextResponse } from 'next/server';
import { getDistinctValues } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableName: string }> }
) {
  try {
    const { tableName } = await params;
    const column = request.nextUrl.searchParams.get('column');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '200', 10);
    if (!column) {
      return NextResponse.json({ error: 'Missing column parameter' }, { status: 400 });
    }
    const result = await getDistinctValues(tableName, column, limit);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch distinct values';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
