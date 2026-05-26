import { getTables } from '@/lib/db';
import Dashboard from '@/components/Dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let tables: string[] = [];
  try {
    tables = getTables();
  } catch (error) {
    console.error('Failed to get tables from DB:', error);
  }

  return (
    <main className="h-screen w-full bg-slate-100 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-blue-500/20">
            A
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 leading-none mb-1">AI-ALE</h1>
            <p className="text-xs text-slate-500 font-medium">Laboratory Information Management System</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold tracking-wide border border-green-200">
            Local SQLite
          </span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tables.length > 0 ? (
          <Dashboard initialTables={tables} />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500 flex-col gap-4">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-slate-400 rounded-full animate-spin"></div>
            <p className="text-lg font-medium">Initializing Database or No Tables Found...</p>
          </div>
        )}
      </div>
    </main>
  );
}
