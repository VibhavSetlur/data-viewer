'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowDownAZ, ArrowUpZA, ArrowUpDown, Search, Settings2, Eye, EyeOff,
  X, AlertCircle, Filter, Plus, ListFilter, Download, RefreshCw,
  ChevronDown, Info, Copy, Table2,
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
  dflt_value: unknown;
  pk: number;
}

interface DataTableProps {
  tableName: string;
}

type ColType = 'text' | 'number' | 'datetime' | 'boolean';

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
  if (['BOOL', 'BOOLEAN'].some(t => u.includes(t))) return 'boolean';
  if (['INTEGER', 'REAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'DECIMAL', 'BIGINT', 'SMALLINT', 'TINYINT', 'INT', 'NUMBER'].some(t => u.includes(t))) return 'number';
  if (['DATE', 'DATETIME', 'TIMESTAMP', 'TIME'].some(t => u.includes(t))) return 'datetime';
  return 'text';
}

const TEXT_OPS = [
  { value: 'contains', label: 'contains' },
  { value: 'notContains', label: 'does not contain' },
  { value: 'equals', label: 'equals' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'in', label: 'in (csv)' },
  { value: 'notIn', label: 'not in (csv)' },
  { value: 'isNull', label: 'is null' },
  { value: 'isNotNull', label: 'is not null' },
];
const NUM_DATE_OPS = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: 'between', label: 'between (a,b)' },
  { value: 'in', label: 'in (csv)' },
  { value: 'notIn', label: 'not in (csv)' },
  { value: 'isNull', label: 'is null' },
  { value: 'isNotNull', label: 'is not null' },
];
const BOOL_OPS = [
  { value: 'equals', label: 'equals' },
  { value: 'isNull', label: 'is null' },
  { value: 'isNotNull', label: 'is not null' },
];

const NO_VALUE_OPS = new Set(['isNull', 'isNotNull']);

function opsForType(t: ColType) {
  if (t === 'boolean') return BOOL_OPS;
  if (t === 'number' || t === 'datetime') return NUM_DATE_OPS;
  return TEXT_OPS;
}

function operatorSymbol(op: string): string {
  switch (op) {
    case 'contains': return '~';
    case 'notContains': return '!~';
    case 'equals': return '=';
    case 'startsWith': return '^';
    case 'endsWith': return '$';
    case 'isNull': return 'IS NULL';
    case 'isNotNull': return 'NOT NULL';
    case 'in': return 'IN';
    case 'notIn': return 'NOT IN';
    case 'between': return 'BETWEEN';
    default: return op;
  }
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-300/60 dark:bg-yellow-500/40 rounded-[2px] px-0.5">{part}</mark>
      : part
  );
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

export default function DataTable({ tableName }: DataTableProps) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
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

  const [filterEntries, setFilterEntries] = useState<FilterEntry[]>([
    { id: newFilterId(), col: '', operator: 'contains', value: '' },
  ]);
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND');
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const filterPopupRef = useRef<HTMLDivElement>(null);

  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [showColSettings, setShowColSettings] = useState(false);
  const colSettingsRef = useRef<HTMLDivElement>(null);
  const [colSearch, setColSearch] = useState('');

  const [pageJumpVal, setPageJumpVal] = useState<string>('1');
  const [fetchKey, setFetchKey] = useState(0);

  const [showSchema, setShowSchema] = useState(false);

  // Row detail drawer
  const [detailRow, setDetailRow] = useState<Record<string, unknown> | null>(null);

  // Distinct value cache (per column) — fetched on demand for filter dropdown
  const [distinctCache, setDistinctCache] = useState<Record<string, { values: unknown[]; truncated: boolean }>>({});
  const [distinctLoading, setDistinctLoading] = useState<Record<string, boolean>>({});
  const [openSuggestFor, setOpenSuggestFor] = useState<string | null>(null);
  const suggestRef = useRef<HTMLDivElement>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Convert filter entries to the Record format the API expects
  const appliedFilters = useMemo(() => {
    const result: Record<string, { value: string; operator: string }> = {};
    for (const entry of filterEntries) {
      if (!entry.col) continue;
      const needsValue = !NO_VALUE_OPS.has(entry.operator);
      if (needsValue && !entry.value) continue;
      // Multiple filters on same column: last write wins (limitation of Record API). Acceptable; rare.
      result[entry.col] = { value: entry.value, operator: entry.operator };
    }
    return result;
  }, [filterEntries]);

  // Reset table-specific state when switching tables
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
    setColSearch('');
    setDetailRow(null);
    setDistinctCache({});
    setDistinctLoading({});
    setOpenSuggestFor(null);
    setShowSchema(false);
  }, [tableName]);

  // Build query string used by both data and export endpoints
  const buildQueryString = useCallback((includePagination: boolean) => {
    const params = new URLSearchParams();
    if (includePagination) {
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());
    }
    if (sortBy) params.set('sortBy', sortBy);
    if (sortDirection) params.set('sortDirection', sortDirection);
    if (globalSearch) params.set('globalSearch', globalSearch);
    params.set('filterLogic', filterLogic);
    for (const [k, v] of Object.entries(appliedFilters)) {
      params.set(`${k}[operator]`, v.operator);
      params.set(`${k}[value]`, v.value);
    }
    return params;
  }, [page, pageSize, sortBy, sortDirection, globalSearch, filterLogic, appliedFilters]);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = buildQueryString(true);
        const res = await fetch(`/api/data/${encodeURIComponent(tableName)}?${params.toString()}`);
        if (cancelled) return;
        const json = await res.json();
        if (!res.ok) { setError(json.error || 'Failed to fetch data'); setLoading(false); return; }
        setSchema(json.schema);
        setData(json.rows);
        setTotalCount(json.totalCount);
        setTotalPages(json.totalPages);
        setPageJumpVal(page.toString());
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tableName, buildQueryString, fetchKey, page]);

  // Close popups on outside click
  useEffect(() => {
    if (!showFilterPopup && !showColSettings && !openSuggestFor) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showFilterPopup && filterPopupRef.current && !filterPopupRef.current.contains(target)) {
        // Don't close if click is inside suggestion popup (which is portaled outside via z-index)
        if (suggestRef.current && suggestRef.current.contains(target)) return;
        setShowFilterPopup(false);
        setOpenSuggestFor(null);
      }
      if (showColSettings && colSettingsRef.current && !colSettingsRef.current.contains(target)) {
        setShowColSettings(false);
      }
      if (openSuggestFor && suggestRef.current && !suggestRef.current.contains(target)
          && filterPopupRef.current && filterPopupRef.current.contains(target)) {
        // Clicking other parts of filter popup closes suggest
        setOpenSuggestFor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilterPopup, showColSettings, openSuggestFor]);

  // Detect empty columns within current page
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

  const setAllColsVisible = () => setHiddenCols(new Set());
  const hideAllExceptFirst = () => {
    if (schema.length === 0) return;
    setHiddenCols(new Set(schema.slice(1).map(c => c.name)));
  };

  const visibleCols = useMemo(() => schema.filter(col => !hiddenCols.has(col.name)), [schema, hiddenCols]);
  const searchActive = globalSearch.length > 0;

  const activeFilters = useMemo(() => filterEntries.filter(e => {
    if (!e.col) return false;
    if (NO_VALUE_OPS.has(e.operator)) return true;
    return Boolean(e.value);
  }), [filterEntries]);
  const filterCount = activeFilters.length;

  const addFilterEntry = () => {
    setFilterEntries(prev => [...prev, { id: newFilterId(), col: '', operator: 'contains', value: '' }]);
  };

  const removeFilterEntry = (id: string) => {
    setFilterEntries(prev => prev.length > 1 ? prev.filter(e => e.id !== id) : prev);
    setPage(1);
  };

  const updateFilterEntry = (id: string, field: 'col' | 'operator' | 'value', val: string) => {
    setFilterEntries(prev => prev.map(e => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: val };
      if (field === 'col') {
        const colSchema = schema.find(c => c.name === val);
        const ct = colSchema ? getColType(colSchema.type) : 'text';
        updated.operator = opsForType(ct)[0].value;
        updated.value = '';
      }
      return updated;
    }));
    setPage(1);
  };

  const clearAllFilters = () => {
    setFilterEntries([{ id: newFilterId(), col: '', operator: 'contains', value: '' }]);
    setGlobalSearch('');
    setLocalGlobalSearch('');
    setPage(1);
  };

  const filterColumnQuick = (colName: string, value: unknown) => {
    if (value === null || value === undefined) {
      setFilterEntries([{ id: newFilterId(), col: colName, operator: 'isNull', value: '' }]);
    } else {
      setFilterEntries([{ id: newFilterId(), col: colName, operator: 'equals', value: String(value) }]);
    }
    setPage(1);
    setShowFilterPopup(true);
  };

  const loadDistinct = useCallback(async (column: string) => {
    if (!column || distinctCache[column] || distinctLoading[column]) return;
    setDistinctLoading(p => ({ ...p, [column]: true }));
    try {
      const res = await fetch(`/api/distinct/${encodeURIComponent(tableName)}?column=${encodeURIComponent(column)}&limit=200`);
      const json = await res.json();
      if (!res.ok) return;
      setDistinctCache(p => ({ ...p, [column]: { values: json.values || [], truncated: !!json.truncated } }));
    } finally {
      setDistinctLoading(p => ({ ...p, [column]: false }));
    }
  }, [tableName, distinctCache, distinctLoading]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = buildQueryString(false);
      params.set('limit', '10000');
      const visible = visibleCols.map(c => c.name);
      if (visible.length > 0 && visible.length !== schema.length) {
        params.set('columns', visible.join(','));
      }
      const url = `/api/export/${encodeURIComponent(tableName)}?${params.toString()}`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => setExporting(false), 500);
    }
  };

  const filteredColList = useMemo(() => {
    const q = colSearch.trim().toLowerCase();
    if (!q) return schema;
    return schema.filter(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
  }, [schema, colSearch]);

  // Row detail navigation
  const detailIndex = useMemo(() => {
    if (!detailRow) return -1;
    return data.indexOf(detailRow);
  }, [detailRow, data]);

  const goToDetail = (delta: number) => {
    if (detailIndex < 0) return;
    const next = detailIndex + delta;
    if (next >= 0 && next < data.length) setDetailRow(data[next]);
  };

  useEffect(() => {
    if (!detailRow) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailRow(null);
      else if (e.key === 'ArrowDown' || e.key === 'j') goToDetail(1);
      else if (e.key === 'ArrowUp' || e.key === 'k') goToDetail(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailRow, detailIndex, data]);

  if (error) {
    return (
      <div className="p-6 text-center text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-center justify-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span className="text-sm">{error}</span>
        <button onClick={() => setFetchKey(k => k + 1)} className="ml-3 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-medium transition-colors">Retry</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden transition-colors">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/80 gap-3 transition-colors flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative w-72 max-w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search all text columns..."
              className="w-full pl-10 pr-8 py-1.5 text-[13px] border border-slate-300 dark:border-gray-600 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500 transition-colors"
              value={localGlobalSearch}
              onChange={(e) => setLocalGlobalSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyGlobalSearch(); if (e.key === 'Escape') { setLocalGlobalSearch(''); setGlobalSearch(''); setPage(1); } }}
              onBlur={applyGlobalSearch}
            />
            {localGlobalSearch && (
              <button onClick={() => { setLocalGlobalSearch(''); setGlobalSearch(''); setPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-baseline gap-2 text-slate-500 dark:text-gray-400 text-[13px] font-medium whitespace-nowrap transition-colors">
            <span className="tabular-nums">{totalCount.toLocaleString()}</span>
            <span className="text-[11px] text-slate-400 dark:text-gray-500">rows</span>
            {loading && <span className="inline-block w-3 h-3 ml-0.5 border-2 border-slate-200 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin align-middle" />}
          </div>
          <button
            onClick={() => setShowSchema(s => !s)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors",
              showSchema
                ? "bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-200 border-slate-300 dark:border-gray-600"
                : "text-slate-500 dark:text-gray-400 border-transparent hover:bg-slate-100 dark:hover:bg-gray-700"
            )}
            title="Toggle schema info"
          >
            <Info className="w-3 h-3" /> Schema
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Filters button */}
          <div className="relative" ref={filterPopupRef}>
            <button
              onClick={() => setShowFilterPopup(!showFilterPopup)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border shadow-sm transition-colors font-medium text-[12.5px]",
                showFilterPopup || filterCount > 0
                  ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                  : "bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-600"
              )}
            >
              <ListFilter className="w-3.5 h-3.5" />
              Filters
              {filterCount > 0 && (
                <span className="ml-1 bg-blue-600 dark:bg-blue-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{filterCount}</span>
              )}
            </button>

            {showFilterPopup && (
              <div className="absolute right-0 top-full mt-1 w-[560px] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-slate-200 dark:border-gray-700 z-50 p-3 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-gray-100 flex items-center gap-1.5">
                    <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    Column Filters
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 dark:text-gray-400">Join with:</span>
                    <div className="flex rounded border border-slate-300 dark:border-gray-600 overflow-hidden">
                      <button
                        onClick={() => setFilterLogic('AND')}
                        className={cn("px-2 py-0.5 text-[11px] font-medium transition-colors",
                          filterLogic === 'AND'
                            ? "bg-blue-600 dark:bg-blue-500 text-white"
                            : "bg-white dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-600"
                        )}
                      >AND</button>
                      <button
                        onClick={() => setFilterLogic('OR')}
                        className={cn("px-2 py-0.5 text-[11px] font-medium transition-colors border-l border-slate-300 dark:border-gray-600",
                          filterLogic === 'OR'
                            ? "bg-blue-600 dark:bg-blue-500 text-white"
                            : "bg-white dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-600"
                        )}
                      >OR</button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  {filterEntries.map((entry, idx) => {
                    const colSchema = schema.find(c => c.name === entry.col);
                    const ct = colSchema ? getColType(colSchema.type) : 'text';
                    const ops = opsForType(ct);
                    const noValue = NO_VALUE_OPS.has(entry.operator);
                    const isOpen = openSuggestFor === entry.id;
                    const distinct = entry.col ? distinctCache[entry.col] : undefined;
                    const dLoading = entry.col ? distinctLoading[entry.col] : false;
                    return (
                      <div key={entry.id} className="flex items-start gap-2 bg-slate-50 dark:bg-gray-700/50 rounded-md px-2.5 py-2 border border-slate-200 dark:border-gray-600">
                        {idx > 0 && (
                          <span className={cn("text-[10px] font-bold uppercase tracking-wider pt-1.5 w-8 text-center",
                            filterLogic === 'AND' ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"
                          )}>{filterLogic}</span>
                        )}
                        {idx === 0 && <span className="text-[10px] font-bold uppercase tracking-wider pt-1.5 w-8 text-center text-slate-400 dark:text-gray-500">WHERE</span>}
                        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <select
                              value={entry.col}
                              onChange={(e) => updateFilterEntry(entry.id, 'col', e.target.value)}
                              className="flex-1 min-w-0 py-1.5 px-2 text-[12.5px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                              <option value="">-- column --</option>
                              {schema.map(c => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>

                            <select
                              value={entry.operator}
                              onChange={(e) => updateFilterEntry(entry.id, 'operator', e.target.value)}
                              className="w-40 py-1.5 px-2 text-[12.5px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                              {ops.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>

                            <button
                              onClick={() => removeFilterEntry(entry.id)}
                              disabled={filterEntries.length <= 1}
                              className="p-1.5 text-slate-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 disabled:hover:text-slate-400 dark:disabled:hover:text-gray-500 transition-colors shrink-0"
                              title="Remove filter"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {!noValue && (
                            <div className="relative">
                              {ct === 'datetime' && (entry.operator === '=' || entry.operator === '!=' || entry.operator === '>' || entry.operator === '<' || entry.operator === '>=' || entry.operator === '<=') ? (
                                <input
                                  type="datetime-local"
                                  value={entry.value}
                                  onChange={(e) => updateFilterEntry(entry.id, 'value', e.target.value)}
                                  className="w-full py-1.5 px-2 text-[12.5px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                              ) : ct === 'boolean' && entry.operator === 'equals' ? (
                                <select
                                  value={entry.value}
                                  onChange={(e) => updateFilterEntry(entry.id, 'value', e.target.value)}
                                  className="w-full py-1.5 px-2 text-[12.5px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                >
                                  <option value="">-- value --</option>
                                  <option value="1">true</option>
                                  <option value="0">false</option>
                                </select>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    placeholder={
                                      entry.operator === 'between' ? 'min,max' :
                                      entry.operator === 'in' || entry.operator === 'notIn' ? 'a,b,c' :
                                      'value'
                                    }
                                    value={entry.value}
                                    onChange={(e) => updateFilterEntry(entry.id, 'value', e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') setShowFilterPopup(false); }}
                                    className="flex-1 py-1.5 px-2 text-[12.5px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500"
                                  />
                                  {entry.col && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isOpen) { setOpenSuggestFor(null); return; }
                                        setOpenSuggestFor(entry.id);
                                        loadDistinct(entry.col);
                                      }}
                                      className="p-1.5 text-slate-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 rounded border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                                      title="Suggest values"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                              {isOpen && entry.col && (
                                <div ref={suggestRef} className="absolute right-0 top-full mt-1 w-full max-h-64 overflow-auto bg-white dark:bg-gray-800 rounded-md shadow-lg border border-slate-200 dark:border-gray-700 z-50 p-1">
                                  {dLoading && (
                                    <div className="px-2 py-2 text-[12px] text-slate-500 dark:text-gray-400">Loading…</div>
                                  )}
                                  {distinct && distinct.values.length === 0 && !dLoading && (
                                    <div className="px-2 py-2 text-[12px] text-slate-500 dark:text-gray-400">No distinct values.</div>
                                  )}
                                  {distinct && distinct.values.map((v, i) => {
                                    const s = formatCell(v);
                                    return (
                                      <button
                                        key={i}
                                        onClick={() => {
                                          if (entry.operator === 'in' || entry.operator === 'notIn') {
                                            const existing = entry.value.split(',').map(x => x.trim()).filter(Boolean);
                                            if (!existing.includes(s)) existing.push(s);
                                            updateFilterEntry(entry.id, 'value', existing.join(','));
                                          } else {
                                            updateFilterEntry(entry.id, 'value', s);
                                            setOpenSuggestFor(null);
                                          }
                                        }}
                                        className="flex w-full items-center px-2 py-1 text-left text-[12px] hover:bg-slate-100 dark:hover:bg-gray-700 rounded text-slate-700 dark:text-gray-200 font-mono truncate"
                                        title={s}
                                      >
                                        {s || <span className="italic text-slate-400">(empty)</span>}
                                      </button>
                                    );
                                  })}
                                  {distinct && distinct.truncated && (
                                    <div className="px-2 py-1 text-[10px] text-slate-400 dark:text-gray-500 italic border-t border-slate-100 dark:border-gray-700 mt-1">
                                      First 200 values shown.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-200 dark:border-gray-700">
                  <button
                    onClick={addFilterEntry}
                    className="flex items-center gap-1 text-[12px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Condition
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={clearAllFilters}
                      className="px-3 py-1 text-[12px] text-slate-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 font-medium"
                    >
                      Clear All
                    </button>
                    <button
                      onClick={() => setShowFilterPopup(false)}
                      className="px-4 py-1.5 text-[12px] font-medium bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors shadow-sm"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Columns button */}
          <div className="relative" ref={colSettingsRef}>
            <button
              onClick={() => setShowColSettings(!showColSettings)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border shadow-sm transition-colors font-medium text-[12.5px]",
                showColSettings
                  ? "bg-slate-100 dark:bg-gray-700 border-slate-300 dark:border-gray-600 text-slate-800 dark:text-gray-100"
                  : "bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-600"
              )}
            >
              <Settings2 className="w-3.5 h-3.5" />
              Columns <span className="text-[11px] text-slate-400 dark:text-gray-500">{visibleCols.length}/{schema.length}</span>
            </button>

            {showColSettings && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-slate-200 dark:border-gray-700 z-50 transition-colors flex flex-col max-h-[420px]">
                <div className="p-2 border-b border-slate-200 dark:border-gray-700">
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search columns..."
                      value={colSearch}
                      onChange={(e) => setColSearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1 text-[12px] border border-slate-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 outline-none"
                    />
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <button onClick={setAllColsVisible} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Show all</button>
                    <button onClick={hideAllExceptFirst} className="text-slate-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 font-medium">Hide all</button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-1">
                  {filteredColList.map(col => {
                    const hidden = hiddenCols.has(col.name);
                    return (
                      <button key={col.name} onClick={() => toggleCol(col.name)}
                        className="flex items-center justify-between w-full px-2.5 py-1.5 text-left text-[12.5px] hover:bg-slate-100 dark:hover:bg-gray-700 rounded text-slate-700 dark:text-gray-200 transition-colors gap-2"
                      >
                        <span className="truncate font-mono" title={col.name}>{col.name}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-slate-400 dark:text-gray-500 uppercase tabular-nums">{col.type || ''}</span>
                          {hidden
                            ? <EyeOff className="w-3.5 h-3.5 text-slate-400 dark:text-gray-500" />
                            : <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                        </span>
                      </button>
                    );
                  })}
                  {filteredColList.length === 0 && (
                    <div className="px-2 py-3 text-center text-[12px] text-slate-500 dark:text-gray-400">No columns match.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Export */}
          <button
            onClick={exportCsv}
            disabled={exporting || totalCount === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-600 shadow-sm transition-colors font-medium text-[12.5px] disabled:opacity-50"
            title={`Export current filter to CSV (up to 10,000 rows)`}
          >
            {exporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            CSV
          </button>

          {/* Reset */}
          {(activeFilters.length > 0 || globalSearch || sortBy || hiddenCols.size > 0) && (
            <button
              onClick={() => {
                clearAllFilters();
                setHiddenCols(new Set());
                setSortBy(undefined);
                setSortDirection(undefined);
              }}
              className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[11.5px] text-slate-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
              title="Reset all filters, sort, and column visibility"
            >
              <X className="w-3 h-3" /> Reset
            </button>
          )}

          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="py-1.5 px-2 text-[12.5px] font-medium border-slate-200 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 dark:text-gray-100 outline-none"
            title="Page size"
          >
            {[25, 50, 100, 200, 500].map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>

          <div className="flex items-center border border-slate-200 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 overflow-hidden h-8 transition-colors">
            <button onClick={() => setPage(1)} disabled={page === 1 || loading} className="px-2 hover:bg-slate-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-gray-700 text-slate-600 dark:text-gray-300 transition-colors h-full" title="First"><ChevronsLeft className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading} className="px-2 hover:bg-slate-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-gray-700 text-slate-600 dark:text-gray-300 border-l border-slate-200 dark:border-gray-600 transition-colors h-full" title="Prev"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <div className="px-2 flex items-center gap-1 border-x border-slate-200 dark:border-gray-600 h-full bg-slate-50 dark:bg-gray-800">
              <input type="text" value={pageJumpVal}
                onChange={e => setPageJumpVal(e.target.value)} onKeyDown={handlePageJump}
                onBlur={() => setPageJumpVal(page.toString())}
                className="w-9 px-1 py-0 text-center text-[12.5px] border border-slate-300 dark:border-gray-600 rounded focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-700 dark:text-gray-100"
              />
              <span className="text-slate-500 dark:text-gray-400 font-medium text-[12.5px]">/ {totalPages || 1}</span>
            </div>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0 || loading} className="px-2 hover:bg-slate-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-gray-700 text-slate-600 dark:text-gray-300 border-r border-slate-200 dark:border-gray-600 transition-colors h-full" title="Next"><ChevronRight className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages || totalPages === 0 || loading} className="px-2 hover:bg-slate-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:hover:bg-white dark:disabled:hover:bg-gray-700 text-slate-600 dark:text-gray-300 transition-colors h-full" title="Last"><ChevronsRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      {/* Active filter tags bar */}
      {(activeFilters.length > 0 || globalSearch) && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50/60 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex-wrap transition-colors">
          {globalSearch && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-yellow-300 dark:border-yellow-600 text-[11px] text-yellow-800 dark:text-yellow-200 shadow-sm">
              <Search className="w-3 h-3" />
              <span className="font-mono max-w-[160px] truncate">{globalSearch}</span>
              <button onClick={() => { setLocalGlobalSearch(''); setGlobalSearch(''); setPage(1); }}
                className="text-yellow-500 dark:text-yellow-400 hover:text-red-500 ml-0.5"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          {activeFilters.map((e, idx) => (
            <React.Fragment key={e.id}>
              {idx > 0 && (
                <span className="text-[10px] text-blue-400 dark:text-blue-300 font-bold uppercase">{filterLogic}</span>
              )}
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-blue-200 dark:border-blue-700 text-[11px] text-blue-800 dark:text-blue-200 shadow-sm">
                <span className="font-mono font-medium">{e.col}</span>
                <span className="text-blue-400 dark:text-blue-300">{operatorSymbol(e.operator)}</span>
                {!NO_VALUE_OPS.has(e.operator) && <span className="font-mono max-w-[160px] truncate">{e.value}</span>}
                <button onClick={() => removeFilterEntry(e.id)}
                  className="text-blue-400 dark:text-blue-300 hover:text-red-500 dark:hover:text-red-400 ml-0.5"><X className="w-2.5 h-2.5" /></button>
              </span>
            </React.Fragment>
          ))}
          <button onClick={clearAllFilters}
            className="ml-1 text-[11px] text-blue-500 dark:text-blue-400 hover:text-red-600 dark:hover:text-red-400 font-medium">Clear all</button>
        </div>
      )}

      {/* Optional schema bar */}
      {showSchema && (
        <div className="px-3 py-2 bg-slate-50 dark:bg-gray-800/60 border-b border-slate-200 dark:border-gray-700 text-[11px] text-slate-600 dark:text-gray-400 flex items-center gap-3 overflow-x-auto whitespace-nowrap">
          <span className="font-semibold text-slate-700 dark:text-gray-300">{tableName}</span>
          <span className="text-slate-400">·</span>
          <span>{schema.length} cols</span>
          <span className="text-slate-400">·</span>
          {schema.map(c => (
            <span key={c.name} className="font-mono">
              <span className="text-slate-700 dark:text-gray-300">{c.name}</span>
              <span className="text-slate-400 dark:text-gray-500">:{c.type || 'TEXT'}</span>
              {c.pk ? <span className="text-amber-600 dark:text-amber-400 ml-0.5">·pk</span> : null}
              {c.notnull ? <span className="text-rose-600 dark:text-rose-400 ml-0.5">·nn</span> : null}
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto relative bg-white dark:bg-gray-800 transition-colors">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead className="bg-slate-50 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
            <tr>
              {visibleCols.map((col) => {
                const isEmptyCol = emptyCols.has(col.name);
                const hasFilter = !!appliedFilters[col.name];
                const isSorted = sortBy === col.name;
                return (
                  <th key={col.name} className="p-0 align-top group bg-slate-50 dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700">
                    <div className="px-3 py-2 flex flex-col">
                      <div className="flex items-center justify-between cursor-pointer select-none hover:text-blue-700 dark:hover:text-blue-400 transition-colors text-[12.5px] font-semibold text-slate-700 dark:text-gray-200"
                        onClick={() => handleSort(col.name)}
                        title={`${col.name} (${col.type || 'TEXT'})${col.pk ? ' · PK' : ''}${col.notnull ? ' · NOT NULL' : ''}`}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate max-w-[200px] font-mono">{col.name}</span>
                          {isEmptyCol && (
                            <AlertCircle className="w-3 h-3 text-amber-400/70 shrink-0" />
                          )}
                          {hasFilter && <Filter className="w-3 h-3 text-blue-500 dark:text-blue-400 shrink-0" />}
                        </span>
                        <span className={cn("shrink-0 transition-colors",
                          isSorted ? "text-blue-600 dark:text-blue-400" : "text-slate-300 dark:text-gray-600 opacity-0 group-hover:opacity-100"
                        )}>
                          {isSorted
                            ? (sortDirection === 'desc' ? <ArrowUpZA className="w-3.5 h-3.5" /> : <ArrowDownAZ className="w-3.5 h-3.5" />)
                            : <ArrowUpDown className="w-3 h-3" />}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-gray-500 uppercase font-mono tracking-wider mt-0.5">
                        {col.type || 'TEXT'}
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-700/60 transition-colors">
            {loading && data.length === 0 ? (
              <tr><td colSpan={visibleCols.length || 1} className="h-48 text-center text-slate-400 dark:text-gray-500 align-middle text-sm">Loading...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={visibleCols.length || 1} className="h-48 text-center text-slate-500 dark:text-gray-400 align-middle">
                <p className="text-sm">No records found. Try clearing some filters.</p>
                {(activeFilters.length > 0 || globalSearch) && (
                  <button onClick={clearAllFilters} className="mt-3 px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50">Clear filters</button>
                )}
              </td></tr>
            ) : (
              data.map((row, i) => (
                <tr key={i}
                  className={cn(
                    "transition-colors group cursor-pointer",
                    searchActive ? "even:bg-yellow-50/30 dark:even:bg-yellow-900/10" : "hover:bg-blue-50/40 dark:hover:bg-gray-700/40"
                  )}
                  onClick={() => setDetailRow(row)}
                >
                  {visibleCols.map((col) => {
                    const val = row[col.name];
                    return (
                      <td key={col.name}
                        className="px-3 py-1.5 text-slate-700 dark:text-gray-200 border-r border-slate-100 dark:border-gray-700/60 max-w-[350px] truncate transition-colors"
                        title={val === null || val === undefined ? '' : String(val)}
                      >
                        {val === null || val === undefined ? (
                          <span className="text-slate-400/60 dark:text-gray-500 italic text-[11.5px]">null</span>
                        ) : typeof val === 'boolean' ? (
                          <span className={cn("px-1.5 py-0.5 rounded-[3px] text-[11px] font-semibold uppercase tracking-wider",
                            val ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
                                : "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300")}>
                            {val ? 'True' : 'False'}
                          </span>
                        ) : typeof val === 'number' ? (
                          <span className="font-mono text-[13px] text-slate-600 dark:text-gray-300 tabular-nums">{val}</span>
                        ) : searchActive ? (
                          <span className="text-[13px]">{highlightText(String(val), globalSearch)}</span>
                        ) : (
                          <span className="text-[13px]">{String(val)}</span>
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

      {/* Row detail drawer */}
      {detailRow && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setDetailRow(null)}>
          <div className="absolute inset-0 bg-slate-900/30 dark:bg-black/40 backdrop-blur-[1px]" />
          <div
            className="relative w-[480px] max-w-full h-full bg-white dark:bg-gray-800 border-l border-slate-200 dark:border-gray-700 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/80">
              <div className="flex items-center gap-2 min-w-0">
                <Table2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-200 truncate font-mono">{tableName}</h3>
                <span className="text-xs text-slate-400 dark:text-gray-500 shrink-0">row {detailIndex >= 0 ? detailIndex + 1 : '?'} / {data.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => goToDetail(-1)} disabled={detailIndex <= 0}
                  className="p-1 rounded text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-700 disabled:opacity-30" title="Previous (↑/k)">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => goToDetail(1)} disabled={detailIndex < 0 || detailIndex >= data.length - 1}
                  className="p-1 rounded text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-700 disabled:opacity-30" title="Next (↓/j)">
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(detailRow, null, 2))}
                  className="p-1 rounded text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-700" title="Copy as JSON">
                  <Copy className="w-4 h-4" />
                </button>
                <button onClick={() => setDetailRow(null)}
                  className="p-1 rounded text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-700" title="Close (Esc)">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {schema.map(col => {
                const val = detailRow[col.name];
                const empty = val === null || val === undefined || val === '';
                return (
                  <div key={col.name} className="flex flex-col gap-0.5 border-b border-slate-100 dark:border-gray-700/50 pb-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-gray-400 truncate" title={col.name}>{col.name}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[9.5px] uppercase font-mono text-slate-400 dark:text-gray-500">{col.type || 'TEXT'}</span>
                        <button
                          onClick={() => filterColumnQuick(col.name, val)}
                          className="text-slate-300 dark:text-gray-600 hover:text-blue-600 dark:hover:text-blue-400"
                          title={empty ? 'Filter where this column is null' : 'Filter rows with this value'}
                        >
                          <Filter className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                    <div className="text-[12.5px] text-slate-700 dark:text-gray-200 font-mono break-all">
                      {empty
                        ? <span className="italic text-slate-400 dark:text-gray-500">null</span>
                        : typeof val === 'boolean'
                          ? (val ? 'true' : 'false')
                          : formatCell(val)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
