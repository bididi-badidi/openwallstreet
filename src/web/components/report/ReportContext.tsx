"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { LeadershipReport } from "../../lib/report-schema";

const ReportContext = createContext<LeadershipReport | null>(null);
export function ReportProvider({
  report,
  children,
}: {
  report: LeadershipReport;
  children: ReactNode;
}) {
  return (
    <ReportContext.Provider value={report}>{children}</ReportContext.Provider>
  );
}
export function useReport() {
  const report = useContext(ReportContext);
  if (!report) throw new Error("Report components need a ReportProvider");
  return report;
}
