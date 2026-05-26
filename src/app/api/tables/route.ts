import { NextResponse } from 'next/server';
import { getTables } from '@/lib/db';

export async function GET() {
  try {
    const tables = getTables();
    return NextResponse.json({ tables });
  } catch (error) {
    console.error('Failed to fetch tables:', error);
    return NextResponse.json({ error: 'Failed to fetch tables' }, { status: 500 });
  }
}
