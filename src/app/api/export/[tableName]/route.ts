import { NextRequest } from 'next/server';
import { getTableData, getTableSchema } from '@/lib/db';

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableName: string }> }
) {
  try {
    const { tableName } = await params;
    const sp = request.nextUrl.searchParams;

    const sortBy = sp.get('sortBy') || undefined;
    const sortDirection = (sp.get('sortDirection') as 'asc' | 'desc') || undefined;
    const globalSearch = sp.get('globalSearch') || undefined;
    const filterLogic = (sp.get('filterLogic') as 'AND' | 'OR') || 'AND';
    const limit = parseInt(sp.get('limit') || '10000', 10);
    const columnsCsv = sp.get('columns');
    const requestedColumns = columnsCsv ? columnsCsv.split(',').map(s => s.trim()).filter(Boolean) : undefined;

    const filters: Record<string, { value: string; operator: string }> = {};
    sp.forEach((value, key) => {
      if (['page', 'pageSize', 'sortBy', 'sortDirection', 'globalSearch', 'filterLogic', 'limit', 'columns'].includes(key)) return;
      if (key.endsWith('[operator]')) {
        const col = key.slice(0, -10);
        filters[col] = filters[col] || { value: '', operator: 'contains' };
        filters[col].operator = value;
      } else if (key.endsWith('[value]')) {
        const col = key.slice(0, -7);
        filters[col] = filters[col] || { value: '', operator: 'contains' };
        filters[col].value = value;
      }
    });

    const schema = await getTableSchema(tableName);
    const allCols = schema.map(c => c.name);
    const cols = requestedColumns && requestedColumns.length > 0
      ? requestedColumns.filter(c => allCols.includes(c))
      : allCols;

    const { rows } = await getTableData({
      tableName, page: 1, pageSize: limit, sortBy, sortDirection,
      filters, globalSearch, filterLogic, columns: cols, limit,
    });

    const header = cols.map(csvEscape).join(',');
    const body = (rows as Record<string, unknown>[])
      .map(r => cols.map(c => csvEscape(r[c])).join(','))
      .join('\n');
    const csv = header + (body ? '\n' + body : '');

    const safeName = tableName.replace(/[^A-Za-z0-9._-]/g, '_');
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeName}.csv"`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to export';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
