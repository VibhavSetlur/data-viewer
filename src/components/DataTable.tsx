'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownAZ, ArrowUpZA, Search } from 'lucide-react';

interface ColumnSchema {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

interface DataTableProps {
  tableName: string;
}

export default function DataTable({ tableName }: DataTableProps) {
  const [data, setData] = useState<any[]>([]);
  const [schema, setSchema] = useState<ColumnSchema[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);

  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | undefined>(undefined);

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());
      if (sortBy) params.set('sortBy', sortBy);
      if (sortDirection) params.set('sortDirection', sortDirection);
      
      for (const [k, v] of Object.entries(filters)) {
        if (v) params.set(k, v);
      }

      const res = await fetch(`/api/data/${tableName}?${params.toString()}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch data');
      }

      const json = await res.json();
      setSchema(json.schema);
      setData(json.rows);
      setTotalCount(json.totalCount);
      setTotalPages(json.totalPages);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableName, page, pageSize, sortBy, sortDirection, filters]);

  useEffect(() => {
    // Reset state when table changes
    setPage(1);
    setSortBy(undefined);
    setSortDirection(undefined);
    setFilters({});
    setLocalFilters({});
  }, [tableName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (columnName: string) => {
    if (sortBy === columnName) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortBy(undefined);
        setSortDirection(undefined);
      }
    } else {
      setSortBy(columnName);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const applyFilters = () => {
    setFilters(localFilters);
    setPage(1);
  };

  const handleFilterChange = (colName: string, value: string) => {
    setLocalFilters(prev => ({ ...prev, [colName]: value }));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      applyFilters();
    }
  };

  if (error) {
    return (
      <div className="p-8 text-center text-red-500 bg-red-50 rounded-lg shadow-sm border border-red-100">
        <h3 className="font-semibold text-lg mb-2">Error Loading Data</h3>
        <p>{error}</p>
        <button 
          onClick={() => fetchData()}
          className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header controls */}
      <div className="flex flex-wrap items-center justify-between p-4 border-b border-slate-200 bg-slate-50 gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">
            {totalCount.toLocaleString()} Rows
          </span>
          {loading && <span className="text-sm text-blue-500 animate-pulse ml-4">Loading data...</span>}
        </div>

        <div className="flex items-center gap-2">
          <select 
            value={pageSize} 
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="text-sm border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            {[10, 50, 100, 500].map(size => (
              <option key={size} value={size}>Show {size}</option>
            ))}
          </select>
          
          <div className="flex items-center border border-slate-300 rounded-md shadow-sm bg-white overflow-hidden">
            <button 
              onClick={() => setPage(1)} 
              disabled={page === 1 || loading}
              className="p-1.5 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-white text-slate-600 transition-colors"
              title="First Page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))} 
              disabled={page === 1 || loading}
              className="p-1.5 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-white text-slate-600 border-l border-slate-200 transition-colors"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1.5 text-sm font-medium text-slate-700 border-x border-slate-200 min-w-[5rem] text-center">
              {page} / {totalPages || 1}
            </span>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
              disabled={page === totalPages || totalPages === 0 || loading}
              className="p-1.5 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-white text-slate-600 border-r border-slate-200 transition-colors"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setPage(totalPages)} 
              disabled={page === totalPages || totalPages === 0 || loading}
              className="p-1.5 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-white text-slate-600 transition-colors"
              title="Last Page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Table container */}
      <div className="flex-1 overflow-auto relative bg-white">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="text-xs text-slate-600 uppercase bg-slate-100 sticky top-0 z-10 shadow-sm">
            <tr>
              {schema.map((col) => (
                <th key={col.name} className="px-4 py-3 border-b border-slate-200 whitespace-nowrap align-top">
                  <div className="flex flex-col gap-2">
                    <div 
                      className="flex items-center gap-1 cursor-pointer hover:text-blue-600 transition-colors select-none group"
                      onClick={() => handleSort(col.name)}
                    >
                      <span className="font-semibold tracking-wider">{col.name}</span>
                      <span className="text-slate-400 group-hover:text-blue-500">
                        {sortBy === col.name ? (
                          sortDirection === 'asc' ? <ArrowDownAZ className="w-3.5 h-3.5" /> : <ArrowUpZA className="w-3.5 h-3.5" />
                        ) : (
                          <span className="w-3.5 h-3.5 block opacity-0 group-hover:opacity-50"><ArrowDownAZ className="w-3.5 h-3.5" /></span>
                        )}
                      </span>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Filter..." 
                        className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-normal shadow-inner bg-white"
                        value={localFilters[col.name] || ''}
                        onChange={(e) => handleFilterChange(col.name, e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={applyFilters}
                      />
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && data.length === 0 ? (
              <tr>
                <td colSpan={schema.length || 1} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                    <p>Loading records...</p>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={schema.length || 1} className="h-64 text-center text-slate-500">
                  No records found matching your filters.
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                  {schema.map((col) => (
                    <td key={col.name} className="px-4 py-2 text-slate-700 whitespace-nowrap max-w-xs truncate" title={String(row[col.name] ?? '')}>
                      {row[col.name] === null ? (
                        <span className="text-slate-400 italic">null</span>
                      ) : typeof row[col.name] === 'boolean' ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row[col.name] ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {row[col.name] ? 'true' : 'false'}
                        </span>
                      ) : (
                        String(row[col.name])
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
