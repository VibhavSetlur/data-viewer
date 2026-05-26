'use client';

import React, { useState } from 'react';
import DataTable from './DataTable';
import { Database, Search } from 'lucide-react';
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DashboardProps {
  initialTables: string[];
}

export default function Dashboard({ initialTables }: DashboardProps) {
  const [activeTable, setActiveTable] = useState<string>(initialTables[0] || '');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTables = initialTables.filter(t => 
    t.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full w-full bg-slate-100">
      {/* Sidebar for tables */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-sm z-10">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search tables..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {filteredTables.map((table) => (
            <button
              key={table}
              onClick={() => setActiveTable(table)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left",
                activeTable === table 
                  ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200" 
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Database className={cn(
                "w-4 h-4", 
                activeTable === table ? "text-blue-600" : "text-slate-400"
              )} />
              <span className="truncate">{table}</span>
            </button>
          ))}
          {filteredTables.length === 0 && (
            <div className="text-center p-4 text-sm text-slate-500">
              No tables found.
            </div>
          )}
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 min-w-0 p-6 flex flex-col overflow-hidden relative bg-slate-50">
        {/* Subtle decorative background elements */}
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-blue-100/50 to-transparent pointer-events-none" />
        
        <div className="relative z-10 mb-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              {activeTable}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Viewing data from the <span className="font-semibold text-slate-700">{activeTable}</span> table
            </p>
          </div>
        </div>
        
        <div className="relative z-10 flex-1 min-h-0 drop-shadow-sm">
          {activeTable ? (
            <DataTable tableName={activeTable} />
          ) : (
            <div className="flex items-center justify-center h-full bg-white rounded-xl border border-slate-200 text-slate-500">
              Select a table from the sidebar to view data.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
