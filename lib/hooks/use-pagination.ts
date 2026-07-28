'use client';

import { useState, useCallback, useMemo } from 'react';

interface UsePaginationOptions {
  pageSize: number;
}

interface UsePaginationReturn {
  currentPage: number;
  offset: number;
  limit: number;
  totalPages: number;
  setPage: (page: number) => void;
  resetPage: () => void;
  setTotal: (total: number) => void;
}

export function usePagination({ pageSize }: UsePaginationOptions): UsePaginationReturn {
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotalState] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const offset = (currentPage - 1) * pageSize;

  const setPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const resetPage = useCallback(() => {
    setCurrentPage(1);
  }, []);

  const setTotal = useCallback((t: number) => {
    setTotalState(t);
  }, []);

  return {
    currentPage,
    offset,
    limit: pageSize,
    totalPages,
    setPage,
    resetPage,
    setTotal,
  };
}
