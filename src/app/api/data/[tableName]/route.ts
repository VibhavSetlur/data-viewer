import { NextRequest, NextResponse } from 'next/server';
import { getTableData, getTableSchema } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableName: string }> }
) {
  try {
    const { tableName } = await params;
    const searchParams = request.nextUrl.searchParams;
    
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
    const sortBy = searchParams.get('sortBy') || undefined;
    const sortDirection = (searchParams.get('sortDirection') as 'asc' | 'desc') || undefined;

    // Parse filters
    const filters: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      // Ignore known pagination/sorting keys
      if (!['page', 'pageSize', 'sortBy', 'sortDirection'].includes(key)) {
        filters[key] = value;
      }
    });

    const schema = getTableSchema(tableName);
    const data = getTableData({
      tableName,
      page,
      pageSize,
      sortBy,
      sortDirection,
      filters,
    });

    return NextResponse.json({
      schema,
      ...data,
    });
  } catch (error: any) {
    console.error(`Error fetching data for table:`, error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch data' },
      { status: 500 }
    );
  }
}
