"use client";
import { useId } from "react";
import type { LeadershipReport as Report } from "../../lib/report-schema";
import { ReportProvider } from "./ReportContext";
import { AssessmentGrid } from "./AssessmentGrid";
import { EvidenceTimeline } from "./EvidenceTimeline";
import { CoverageDisclosure } from "./CoverageDisclosure";
import "./style.css";
import "./disclosure.css";

export function LeadershipReport({
  report,
  sample = false,
}: {
  report: Report;
  sample?: boolean;
}) {
  const headingId = useId();
  return (
    <ReportProvider report={report}>
      <article className="leadership-report ws-app" aria-labelledby={headingId}>
        <header className="ws-toolbar">
          <span className="ws-location">
            {sample ? "Sample report" : "Agent report"}
          </span>
          <span className="ws-vintage">
            {report.scope} <span>Annual evidence</span>
          </span>
        </header>
        <section className="ws-intro">
          <div className="company-lockup">
            <span className="company-monogram" aria-hidden="true">
              {report.company.charAt(0)}
            </span>
            <div>
              <span className="company-name">{report.company}</span>
              <span className="company-caption">Board &amp; management</span>
            </div>
          </div>
          <h2 className="report-headline" id={headingId}>
            The record behind
            <br className="mobile-break" /> the leadership.
          </h2>
          <p className="ws-deck">{report.deck}</p>
        </section>
        <AssessmentGrid />
        <EvidenceTimeline />
        <CoverageDisclosure />
        <footer className="ws-footer">
          <span>{report.company} · Historical evidence</span>
          <span>Evidence cutoff · {report.as_of}</span>
        </footer>
      </article>
    </ReportProvider>
  );
}
