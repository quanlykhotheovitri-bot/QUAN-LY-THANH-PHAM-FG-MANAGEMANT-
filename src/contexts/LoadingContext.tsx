import React, { createContext, useContext, useState, useCallback } from 'react';
import LoadingBar from '../components/LoadingBar';

interface LoadingContextType {
  setIsLoading: (loading: boolean) => void;
  isLoading: boolean;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoadingState] = useState(false);
  const [loadingCount, setLoadingCount] = useState(0);

  const setIsLoading = useCallback((loading: boolean) => {
    setLoadingCount(prev => {
      const nextCount = loading ? prev + 1 : Math.max(0, prev - 1);
      setIsLoadingState(nextCount > 0);
      return nextCount;
    });
  }, []);

  return (
    <LoadingContext.Provider value={{ setIsLoading, isLoading }}>
      <LoadingBar isLoading={isLoading} />
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
}
