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
    const globalSearch = searchParams.get('globalSearch') || undefined;
    const filterLogic = (searchParams.get('filterLogic') as 'AND' | 'OR') || 'AND';

    const filters: Record<string, { value: string; operator: string }> = {};
    searchParams.forEach((value, key) => {
      if (!['page', 'pageSize', 'sortBy', 'sortDirection', 'globalSearch', 'filterLogic'].includes(key)) {
        if (key.endsWith('[operator]')) {
          const columnName = key.slice(0, -10);
          if (!filters[columnName]) filters[columnName] = { value: '', operator: 'contains' };
          filters[columnName].operator = value;
        } else if (key.endsWith('[value]')) {
          const columnName = key.slice(0, -7);
          if (!filters[columnName]) filters[columnName] = { value: '', operator: 'contains' };
          filters[columnName].value = value;
        }
      }
    });

    const [schema, data] = await Promise.all([
      getTableSchema(tableName),
      getTableData({ tableName, page, pageSize, sortBy, sortDirection, filters, globalSearch, filterLogic }),
    ]);

    return NextResponse.json({ schema, ...data });
  } catch (error: unknown) {
    console.error(`Error fetching data for table:`, error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch data';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
