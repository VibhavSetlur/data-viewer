'use client';

import React, { useState, useEffect } from 'react';
import DataTable from './DataTable';
import {
  Database, Search, Sun, Moon, Table2,
  Server, HardDrive, RefreshCw, AlertCircle, CheckCircle2, XCircle
} from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DashboardProps {
  initialTables: string[];
}

type DbType = 'sqlite' | 'mysql';

export default function Dashboard({ initialTables }: DashboardProps) {
  const [activeTable, setActiveTable] = useState<string>(initialTables[0] || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [dark, setDark] = useState(false);
  const [tables, setTables] = useState<string[]>(initialTables);
  const [dbType, setDbType] = useState<DbType>('sqlite');
  const [dbConnected, setDbConnected] = useState(true);
  const [showDbSwitcher, setShowDbSwitcher] = useState(false);
  // MySQL connection fields
  const [mysqlHost, setMysqlHost] = useState('localhost');
  const [mysqlPort, setMysqlPort] = useState('3306');
  const [mysqlUser, setMysqlUser] = useState('root');
  const [mysqlPassword, setMysqlPassword] = useState('');
  const [mysqlDatabase, setMysqlDatabase] = useState('lims');
  // SQLite path
  const [sqlitePath, setSqlitePath] = useState('data/lims_mirror.db');
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setDark(isDark);
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setDbType(data.type);
      if (data.tables) setTables(data.tables);
      setDbConnected(!data.error);
      if (data.mysqlHost) setMysqlHost(data.mysqlHost);
      if (data.mysqlPort) setMysqlPort(String(data.mysqlPort));
      if (data.mysqlDatabase) setMysqlDatabase(data.mysqlDatabase);
      if (data.sqlitePath) setSqlitePath(data.sqlitePath);
    } catch {}
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch {}
  };

  const switchDatabase = async (type: DbType) => {
    setSwitching(true);
    setSwitchError(null);
    setShowDbSwitcher(false);
    try {
      const body: any = { type };
      if (type === 'mysql') {
        body.mysqlHost = mysqlHost;
        body.mysqlPort = parseInt(mysqlPort, 10);
        body.mysqlUser = mysqlUser;
        body.mysqlPassword = mysqlPassword;
        body.mysqlDatabase = mysqlDatabase;
      }
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        setSwitchError(data.error);
        setDbConnected(false);
      } else {
        setDbType(data.type);
        if (data.tables && data.tables.length > 0) {
          setTables(data.tables);
          setActiveTable(data.tables[0]);
        } else {
          setTables(data.tables || []);
          setActiveTable('');
        }
        setDbConnected(true);
      }
    } catch (e: any) {
      setSwitchError(e.message);
      setDbConnected(false);
    } finally {
      setSwitching(false);
    }
  };

  const filteredTables = tables.filter(t =>
    t.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full w-full">
      {/* Top header */}
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-4 py-2.5 flex items-center justify-between shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">A</div>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold text-slate-800 dark:text-gray-100 tracking-tight">AI-ALE</h1>
              <p className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">Laboratory Information Management</p>
            </div>
          </div>
          <div className="h-6 w-px bg-slate-200 dark:bg-gray-700" />

          {/* DB connection indicator + switcher */}
          <div className="relative">
            <button
              onClick={() => setShowDbSwitcher(!showDbSwitcher)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
            >
              {dbType === 'mysql' ? (
                <Server className={cn("w-3.5 h-3.5", dbConnected ? "text-blue-500" : "text-red-400")} />
              ) : (
                <HardDrive className={cn("w-3.5 h-3.5", dbConnected ? "text-green-500" : "text-red-400")} />
              )}
              <span className="text-[11px] font-medium text-slate-600 dark:text-gray-300">
                {dbType === 'mysql' ? 'MySQL' : 'SQLite'}
              </span>
              {switching ? (
                <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />
              ) : dbConnected ? (
                <CheckCircle2 className="w-3 h-3 text-green-500" />
              ) : (
                <XCircle className="w-3 h-3 text-red-500" />
              )}
            </button>

            {showDbSwitcher && (
              <div className="absolute left-0 top-full mt-1 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-slate-200 dark:border-gray-700 z-50 p-3 transition-colors">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-gray-200 mb-3">Database Connection</h3>

                <div className="space-y-2 mb-3">
                  <p className="text-[10px] text-slate-400 dark:text-gray-500 mb-1">Production (Poplar server)</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => switchDatabase('sqlite')}
                      className={cn(
                        "flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium border transition-colors",
                        dbType === 'sqlite' && dbConnected
                          ? "bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300"
                          : "bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-600"
                      )}
                    >
                      <HardDrive className="w-3.5 h-3.5" />
                      SQLite (Local Dev)
                    </button>
                    <button
                      onClick={() => switchDatabase('mysql')}
                      className={cn(
                        "flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium border transition-colors",
                        dbType === 'mysql' && dbConnected
                          ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                          : "bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-600"
                      )}
                    >
                      <Server className="w-3.5 h-3.5" />
                      MySQL (Poplar Prod)
                    </button>
                  </div>

                  {dbType === 'mysql' && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-gray-700">
                      <input value={mysqlHost} onChange={e => setMysqlHost(e.target.value)}
                        placeholder="Host" className="col-span-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 outline-none" />
                      <input value={mysqlPort} onChange={e => setMysqlPort(e.target.value)}
                        placeholder="Port" className="col-span-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 outline-none" />
                      <input value={mysqlUser} onChange={e => setMysqlUser(e.target.value)}
                        placeholder="User" className="col-span-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 outline-none" />
                      <input type="password" value={mysqlPassword} onChange={e => setMysqlPassword(e.target.value)}
                        placeholder="Password" className="col-span-1 px-2 py-1.5 text-xs border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 outline-none" />
                      <input value={mysqlDatabase} onChange={e => setMysqlDatabase(e.target.value)}
                        placeholder="Database" className="col-span-2 px-2 py-1.5 text-xs border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 outline-none" />
                    </div>
                  )}
                </div>

                {switchError && (
                  <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded mb-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{switchError}</span>
                  </div>
                )}

                {dbType === 'sqlite' && (
                  <button
                    onClick={() => switchDatabase('sqlite')}
                    className="w-full py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Connect SQLite
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {activeTable && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-xs font-medium border border-blue-200 dark:border-blue-800">
              <Table2 className="w-3 h-3" />
              <span>{activeTable}</span>
            </div>
          )}

          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        <div className="w-64 bg-white dark:bg-gray-800 border-r border-slate-200 dark:border-gray-700 flex flex-col shrink-0 z-10">
          <div className="p-3 border-b border-slate-200 dark:border-gray-700 bg-slate-50/80 dark:bg-gray-800/80">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Search tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-[13px] border border-slate-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            {filteredTables.map((table) => (
              <button
                key={table}
                onClick={() => setActiveTable(table)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-[4px] text-[13px] font-medium transition-all text-left",
                  activeTable === table
                    ? "bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-800"
                    : "text-slate-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-700 hover:text-slate-900 dark:hover:text-gray-200 border border-transparent"
                )}
              >
                <Database className={cn(
                  "w-4 h-4 shrink-0",
                  activeTable === table ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-gray-500"
                )} />
                <span className="truncate max-w-[180px]">{table}</span>
              </button>
            ))}
            {filteredTables.length === 0 && (
              <div className="text-center p-3 text-[13px] text-slate-500 dark:text-gray-400">No tables found.</div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 p-3 flex flex-col overflow-hidden bg-slate-50 dark:bg-gray-900 relative">
          <div className="flex-1 min-h-0">
            {activeTable ? (
              <DataTable tableName={activeTable} />
            ) : (
              <div className="flex items-center justify-center h-full bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400 shadow-sm text-sm">
                Select a table from the sidebar to view data.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
