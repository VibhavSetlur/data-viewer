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

  return (
    <main className="h-screen w-full flex flex-col overflow-hidden">
      <Dashboard initialTables={tables} />
    </main>
  );
}
