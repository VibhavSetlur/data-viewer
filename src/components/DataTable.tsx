'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowDownAZ, ArrowUpZA, Search, Settings2, Eye, EyeOff, X, AlertCircle, Filter, Plus, Trash2, ListFilter
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

type ColType = 'text' | 'number' | 'datetime';

interface FilterEntry {
  id: string;
  col: string;
  operator: string;
  value: string;
}

let filterIdCounter = 0;
function newFilterId() { return `f_${++filterIdCounter}`; }

function getColType(colType: string): ColType {
  const u = colType.toUpperCase();
  if (['INTEGER', 'REAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'DECIMAL', 'BIGINT', 'SMALLINT', 'TINYINT', 'INT', 'NUMBER'].some(t => u.includes(t))) return 'number';
  if (['DATE', 'DATETIME', 'TIMESTAMP', 'TIME'].some(t => u.includes(t))) return 'datetime';
  return 'text';
}

const TEXT_OPS = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'startsWith', label: 'Starts With' },
  { value: 'endsWith', label: 'Ends With' },
];
const NUM_DATE_OPS = [
  { value: '=', label: '=' },
  { value: '!=', label: '\u2260' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '\u2265' },
  { value: '<=', label: '\u2264' },
];

function opsForType(t: ColType) {
  if (t === 'number' || t === 'datetime') return NUM_DATE_OPS;
  return TEXT_OPS;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-300/60 rounded-[2px] px-0.5">{part}</mark>
      : part
  );
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

  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [localGlobalSearch, setLocalGlobalSearch] = useState<string>('');

  // Multi-filter state
  const [filterEntries, setFilterEntries] = useState<FilterEntry[]>([{ id: newFilterId(), col: '', operator: 'contains', value: '' }]);
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND');
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const filterPopupRef = useRef<HTMLDivElement>(null);

  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [showColSettings, setShowColSettings] = useState(false);

  const [pageJumpVal, setPageJumpVal] = useState<string>('1');

  // Convert filter entries to the Record format the API expects
  const appliedFilters = useMemo(() => {
    const result: Record<string, { value: string; operator: string }> = {};
    for (const entry of filterEntries) {
      if (entry.col && entry.value) {
        result[entry.col] = { value: entry.value, operator: entry.operator };
      }
    }
    return result;
  }, [filterEntries]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());
      if (sortBy) params.set('sortBy', sortBy);
      if (sortDirection) params.set('sortDirection', sortDirection);
      if (globalSearch) params.set('globalSearch', globalSearch);
      params.set('filterLogic', filterLogic);

      for (const [k, { value, operator }] of Object.entries(appliedFilters)) {
        if (value) {
          params.set(`${k}[operator]`, operator);
          params.set(`${k}[value]`, value);
        }
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
      setPageJumpVal(page.toString());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableName, page, pageSize, sortBy, sortDirection, appliedFilters, globalSearch, filterLogic]);

  useEffect(() => {
    setPage(1);
    setSortBy(undefined);
    setSortDirection(undefined);
    setFilterEntries([{ id: newFilterId(), col: '', operator: 'contains', value: '' }]);
    setFilterLogic('AND');
    setGlobalSearch('');
    setLocalGlobalSearch('');
    setHiddenCols(new Set());
    setShowColSettings(false);
    setShowFilterPopup(false);
  }, [tableName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Close filter popup on outside click
  useEffect(() => {
    if (!showFilterPopup) return;
    const handler = (e: MouseEvent) => {
      if (filterPopupRef.current && !filterPopupRef.current.contains(e.target as Node)) {
        setShowFilterPopup(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilterPopup]);

  const emptyCols = useMemo(() => {
    const colSet = new Set<string>();
    if (!schema.length || !data.length) return colSet;
    for (const col of schema) {
      if (data.every(row => { const v = row[col.name]; return v === null || v === undefined || v === ''; })) {
        colSet.add(col.name);
      }
    }
    return colSet;
  }, [schema, data]);

  const handleSort = (columnName: string) => {
    if (sortBy === columnName) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') { setSortBy(undefined); setSortDirection(undefined); }
    } else { setSortBy(columnName); setSortDirection('asc'); }
    setPage(1);
  };

  const applyGlobalSearch = () => { setGlobalSearch(localGlobalSearch); setPage(1); };

  const handlePageJump = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const p = parseInt(pageJumpVal, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) setPage(p);
      else setPageJumpVal(page.toString());
    }
  };

  const toggleCol = (colName: string) => {
    setHiddenCols(prev => { const n = new Set(prev); if (n.has(colName)) n.delete(colName); else n.add(colName); return n; });
  };

  const visibleCols = useMemo(() => schema.filter(col => !hiddenCols.has(col.name)), [schema, hiddenCols]);
  const searchActive = globalSearch.length > 0;

  const filterCount = filterEntries.filter(e => e.col && e.value).length;

  // Filter entry management
  const addFilterEntry = () => {
    setFilterEntries(prev => [...prev, { id: newFilterId(), col: '', operator: 'contains', value: '' }]);
  };

  const removeFilterEntry = (id: string) => {
    setFilterEntries(prev => prev.length > 1 ? prev.filter(e => e.id !== id) : prev);
  };

  const updateFilterEntry = (id: string, field: 'col' | 'operator' | 'value', val: string) => {
    setFilterEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: val };
      if (field === 'col') {
        const colSchema = schema.find(c => c.name === val);
        const ct = colSchema ? getColType(colSchema.type) : 'text';
        updated.operator = opsForType(ct)[0].value;
      }
      return updated;
    }));
  };

  const clearAllFilters = () => {
    setFilterEntries([{ id: newFilterId(), col: '', operator: 'contains', value: '' }]);
    setPage(1);
  };

  if (error) {
    return (
      <div className="p-6 text-center text-red-600 bg-red-50 rounded-lg border border-red-200 flex items-center justify-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span className="text-sm">{error}</span>
        <button onClick={() => fetchData()} className="ml-3 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-medium transition-colors">Retry</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden transition-colors">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/80 gap-4 transition-colors">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="relative w-72 max-w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search all columns..."
              className="w-full pl-10 pr-8 py-2 text-[14px] border border-slate-300 dark:border-gray-600 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500 transition-colors"
              value={localGlobalSearch}
              onChange={(e) => setLocalGlobalSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyGlobalSearch()}
              onBlur={applyGlobalSearch}
            />
            {localGlobalSearch && (
              <button onClick={() => { setLocalGlobalSearch(''); setGlobalSearch(''); setPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-slate-500 dark:text-gray-400 text-[14px] font-medium whitespace-nowrap transition-colors">
            {totalCount.toLocaleString()} rows
            {loading && <span className="inline-block w-3 h-3 ml-1.5 border-2 border-slate-200 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin align-middle" />}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Filters button */}
          <div className="relative" ref={filterPopupRef}>
            <button
              onClick={() => setShowFilterPopup(!showFilterPopup)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-md border shadow-sm transition-colors font-medium text-[13px]",
                showFilterPopup || filterCount > 0
                  ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                  : "bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-600"
              )}
            >
              <ListFilter className="w-4 h-4" />
              Filters
              {filterCount > 0 && (
                <span className="ml-1 bg-blue-600 dark:bg-blue-500 text-white text-[10px] font-bold rounded-full w-4.5 h-4.5 flex items-center justify-center">{filterCount}</span>
              )}
            </button>

            {showFilterPopup && (
              <div className="absolute right-0 top-full mt-1 w-[500px] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-slate-200 dark:border-gray-700 z-50 p-3 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100 flex items-center gap-1.5 transition-colors">
                    <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Column Filters
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 dark:text-gray-400 transition-colors">Join with:</span>
                    <button
                      onClick={() => setFilterLogic('AND')}
                      className={cn("px-2 py-0.5 rounded text-[11px] font-medium border transition-colors",
                        filterLogic === 'AND'
                          ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500"
                          : "bg-white dark:bg-gray-700 text-slate-600 dark:text-gray-300 border-slate-300 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-600"
                      )}
                    >AND</button>
                    <button
                      onClick={() => setFilterLogic('OR')}
                      className={cn("px-2 py-0.5 rounded text-[11px] font-medium border transition-colors",
                        filterLogic === 'OR'
                          ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500"
                          : "bg-white dark:bg-gray-700 text-slate-600 dark:text-gray-300 border-slate-300 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-600"
                      )}
                    >OR</button>
                  </div>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {filterEntries.map((entry, idx) => {
                    const colSchema = schema.find(c => c.name === entry.col);
                    const ct = colSchema ? getColType(colSchema.type) : 'text';
                    const ops = opsForType(ct);
                    return (
                      <div key={entry.id} className="flex items-center gap-2 bg-slate-50 dark:bg-gray-700/50 rounded-md px-3 py-2 border border-slate-200 dark:border-gray-600 transition-colors">
                        {idx > 0 && (
                          <span className={cn("text-[11px] font-bold uppercase tracking-wider px-1",
                            filterLogic === 'AND' ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"
                          )}>{filterLogic}</span>
                        )}
                        <select
                          value={entry.col}
                          onChange={(e) => updateFilterEntry(entry.id, 'col', e.target.value)}
                          className="flex-1 min-w-0 py-1.5 px-2 text-[13px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                        >
                          <option value="">-- Select column --</option>
                          {schema.map(c => (
                            <option key={c.name} value={c.name}>
                              {c.name} ({c.type})
                            </option>
                          ))}
                        </select>

                        <select
                          value={entry.operator}
                          onChange={(e) => updateFilterEntry(entry.id, 'operator', e.target.value)}
                          className="w-32 py-1.5 px-2 text-[13px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                        >
                          {ops.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>

                        {ct === 'datetime' ? (
                          <input
                            type="datetime-local"
                            value={entry.value}
                            onChange={(e) => updateFilterEntry(entry.id, 'value', e.target.value)}
                            className="flex-[2] min-w-0 py-1.5 px-2 text-[13px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                          />
                        ) : (
                          <input
                            type="text"
                            placeholder="Value"
                            value={entry.value}
                            onChange={(e) => updateFilterEntry(entry.id, 'value', e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { setShowFilterPopup(false); } }}
                            className="flex-[2] min-w-0 py-1.5 px-2 text-[13px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500 transition-colors"
                          />
                        )}

                        <button
                          onClick={() => removeFilterEntry(entry.id)}
                          disabled={filterEntries.length <= 1}
                          className="p-1.5 text-slate-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 disabled:hover:text-slate-400 dark:disabled:hover:text-gray-500 transition-colors shrink-0"
                          title="Remove filter"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 dark:border-gray-700">
                  <button
                    onClick={addFilterEntry}
                    className="flex items-center gap-1 text-[12px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Condition
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { clearAllFilters(); }}
                      className="px-3 py-1 text-[12px] text-slate-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 font-medium transition-colors"
                    >
                      Clear All
                    </button>
                    <button
                      onClick={() => setShowFilterPopup(false)}
                      className="px-4 py-1.5 text-[12px] font-medium bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors shadow-sm"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Columns button */}
          <div className="relative">
            <button
              onClick={() => setShowColSettings(!showColSettings)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-md border shadow-sm transition-colors font-medium text-[13px]",
                showColSettings
                  ? "bg-slate-100 dark:bg-gray-700 border-slate-300 dark:border-gray-600 text-slate-800 dark:text-gray-100"
                  : "bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-600"
              )}
            >
              <Settings2 className="w-4 h-4" />
              Cols {visibleCols.length}/{schema.length}
            </button>

            {showColSettings && (
              <div className="absolute right-0 top-full mt-1 w-56 max-h-[300px] overflow-auto bg-white dark:bg-gray-800 rounded-md shadow-lg border border-slate-200 dark:border-gray-700 z-50 p-1.5 transition-colors">
                <div className="px-2 py-1.5 text-[12px] font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider transition-colors">Toggle Columns</div>
                {schema.map(col => (
                  <button key={col.name} onClick={() => toggleCol(col.name)}
                    className="flex items-center justify-between w-full px-3 py-2 text-left text-[13px] hover:bg-slate-100 dark:hover:bg-gray-700 rounded text-slate-700 dark:text-gray-200 transition-colors"
                  >
                    <span className="truncate pr-2" title={col.name}>{col.name}</span>
                    {hiddenCols.has(col.name) ? <EyeOff className="w-4 h-4 text-slate-400 dark:text-gray-500 shrink-0 transition-colors" /> : <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 transition-colors" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="py-2 px-3 text-[13px] font-medium border-slate-200 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none transition-colors"
          >
            {[10, 25, 50, 100].map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>

          <div className="flex items-center border border-slate-200 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 overflow-hidden h-9 transition-colors">
            <button onClick={() => setPage(1)} disabled={page === 1 || loading} className="px-2 hover:bg-slate-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-gray-700 text-slate-600 dark:text-gray-300 transition-colors h-full" title="First"><ChevronsLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading} className="px-2 hover:bg-slate-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-gray-700 text-slate-600 dark:text-gray-300 border-l border-slate-200 dark:border-gray-600 transition-colors h-full" title="Prev"><ChevronLeft className="w-4 h-4" /></button>
            <div className="px-3 flex items-center gap-1 border-x border-slate-200 dark:border-gray-600 h-full bg-slate-50 dark:bg-gray-800 transition-colors">
              <input type="text" value={pageJumpVal}
                onChange={e => setPageJumpVal(e.target.value)} onKeyDown={handlePageJump}
                onBlur={() => setPageJumpVal(page.toString())}
                className="w-10 px-1 py-0 text-center text-[14px] border border-slate-300 dark:border-gray-600 rounded focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-700 dark:text-gray-100 transition-colors"
              />
              <span className="text-slate-500 dark:text-gray-400 font-medium text-[14px] transition-colors">/ {totalPages || 1}</span>
            </div>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0 || loading} className="px-2 hover:bg-slate-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-gray-700 text-slate-600 dark:text-gray-300 border-r border-slate-200 dark:border-gray-600 transition-colors h-full" title="Next"><ChevronRight className="w-4 h-4" /></button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages || totalPages === 0 || loading} className="px-2 hover:bg-slate-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-gray-700 text-slate-600 dark:text-gray-300 transition-colors h-full" title="Last"><ChevronsRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Active filter tags bar */}
      {filterCount > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/60 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex-wrap transition-colors">
          <span className="text-[11px] font-medium text-blue-700 dark:text-blue-300 shrink-0 transition-colors">Active filters:</span>
          {filterEntries.filter(e => e.col && e.value).map(e => (
            <span key={e.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-blue-200 dark:border-blue-700 text-[11px] text-blue-800 dark:text-blue-200 shadow-sm transition-colors">
              <span className="font-medium">{e.col}</span>
              <span className="text-blue-400 dark:text-blue-300">{e.operator === 'contains' ? '~' : e.operator}</span>
              <span className="max-w-[120px] truncate">{e.value}</span>
              <button onClick={() => { updateFilterEntry(e.id, 'value', ''); setPage(1); }}
                className="text-blue-400 dark:text-blue-300 hover:text-red-500 dark:hover:text-red-400 ml-0.5 transition-colors"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
          {filterEntries.filter(e => e.col && e.value).length > 1 && (
            <span className="text-[10px] text-blue-400 dark:text-blue-300 font-medium px-1 transition-colors">({filterLogic})</span>
          )}
          <button onClick={() => { clearAllFilters(); }}
            className="ml-1 text-[11px] text-blue-500 dark:text-blue-400 hover:text-red-600 dark:hover:text-red-400 font-medium transition-colors">Clear all</button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto relative bg-white dark:bg-gray-800 transition-colors" onClick={() => { showColSettings && setShowColSettings(false); }}>
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead className="bg-slate-50 dark:bg-gray-800 sticky top-0 z-10 outline outline-1 outline-slate-200 dark:outline-gray-700 shadow-sm transition-colors">
            <tr>
              {visibleCols.map((col) => {
                const isEmptyCol = emptyCols.has(col.name);
                const hasFilter = !!appliedFilters[col.name]?.value;
                return (
                  <th key={col.name} className="p-0 align-top group bg-slate-50 dark:bg-gray-800 transition-colors">
                    <div className="border-b border-r border-slate-200 dark:border-gray-700 px-3 py-3 flex flex-col h-full relative transition-colors">
                      <div className="flex items-center justify-between cursor-pointer select-none hover:text-blue-700 dark:hover:text-blue-400 transition-colors text-[13px] font-semibold text-slate-700 dark:text-gray-200"
                        onClick={() => handleSort(col.name)}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate max-w-[180px]" title={col.name}>{col.name}</span>
                          {isEmptyCol && (
                            <span className="relative group/empty" title="All values in this column are empty">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-400/70 shrink-0" />
                              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-slate-700 dark:bg-gray-900 text-white dark:text-gray-100 text-[10px] rounded shadow-lg whitespace-nowrap opacity-0 group-hover/empty:opacity-100 transition-opacity pointer-events-none z-50">
                                No entries
                              </span>
                            </span>
                          )}
                          {hasFilter && <Filter className="w-3 h-3 text-blue-500 dark:text-blue-400 shrink-0" />}
                        </span>
                        <span className={cn("shrink-0 transition-colors", sortBy === col.name ? "text-blue-600 dark:text-blue-400" : "text-slate-300 dark:text-gray-600 opacity-0 group-hover:opacity-100")}>
                          {sortBy === col.name && sortDirection === 'desc' ? <ArrowUpZA className="w-3.5 h-3.5" /> : <ArrowDownAZ className="w-3.5 h-3.5" />}
                        </span>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-gray-700 transition-colors">
            {loading && data.length === 0 ? (
              <tr><td colSpan={visibleCols.length || 1} className="h-48 text-center text-slate-400 dark:text-gray-500 align-middle text-sm transition-colors">Loading...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={visibleCols.length || 1} className="h-48 text-center text-slate-500 dark:text-gray-400 align-middle transition-colors"><p className="text-sm">No records found. Try clearing some filters.</p></td></tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className={cn("transition-colors group", searchActive ? "even:bg-yellow-50/30 dark:even:bg-yellow-900/20" : "hover:bg-blue-50/40 dark:hover:bg-gray-700/40")}>
                  {visibleCols.map((col) => {
                    const val = row[col.name];
                    return (
                      <td key={col.name}
                        className="px-3 py-2.5 text-slate-700 dark:text-gray-200 border-r border-slate-100 dark:border-gray-700 group-hover:border-blue-100/30 dark:group-hover:border-blue-800/30 max-w-[350px] truncate transition-colors"
                        title={val === null ? '' : String(val)}
                      >
                        {val === null ? (
                          <span className="text-slate-400/60 dark:text-gray-500 italic text-[12px] transition-colors">null</span>
                        ) : typeof val === 'boolean' ? (
                          <span className={cn("px-1.5 py-0.5 rounded-[3px] text-[12px] font-semibold uppercase tracking-wider transition-colors", val ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300" : "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300")}>
                            {val ? 'True' : 'False'}
                          </span>
                        ) : typeof val === 'number' ? (
                          <span className="font-mono text-[14px] text-slate-600 dark:text-gray-300 transition-colors">{val}</span>
                        ) : searchActive ? (
                          highlightText(String(val), globalSearch)
                        ) : (
                          <span className="text-[14px] dark:text-gray-200 transition-colors">{String(val)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
