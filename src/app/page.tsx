import { getTables } from '@/lib/db';
import Dashboard from '@/components/Dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let tables: string[] = [];
  try {
    tables = await getTables();
  } catch (error) {
    console.error('Failed to get tables from DB:', error);
  }
  // Counts are populated by the client after mount (via /api/tables?withCounts=1)
  // — keeps initial render fast on large DBs.

  return (
    <main className="h-screen w-full flex flex-col overflow-hidden">
      <Dashboard initialTables={tables} />
    </main>
  );
}
