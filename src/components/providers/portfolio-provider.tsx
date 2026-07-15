"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePortfolio, type PortfolioContextValue } from "@/hooks/use-portfolio";

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const value = usePortfolio();
  return (
    <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>
  );
}

export function usePortfolioContext(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) {
    throw new Error("usePortfolioContext must be used within PortfolioProvider");
  }
  return ctx;
}
