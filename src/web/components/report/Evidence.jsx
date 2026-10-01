"use client";
import React, { useState } from "react";
import { useReport } from "./ReportContext";
import { Icon } from "./Icon";
function SourceQuote({ reference, roles }) {
  const model = useReport();
  const e = model.evidence[reference];
  const htmlSource = e.snapshot_method.startsWith("HTML");
  const excerptOnly = e.snapshot_method.includes("cited excerpt shown here");
  const [open, setOpen] = useState(false);
  const id = React.useId();
  return (
    <div className="source-record t-acc" data-open={open}>
      <button
        className="source-heading t-acc-head"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>
          <span className="source-label">FY{e.report_year} ANNUAL REPORT</span>
          <span className="source-title">{e.section}</span>
          <span className="source-page">
            {htmlSource ? "HTML report" : `Physical page ${e.page}`} ·{" "}
            {e.attribution || "Attribution not specified"}
          </span>
        </span>
        <span className="t-acc-chevron">
          <Icon name="chevron-down" />
        </span>
      </button>
      <div className="t-acc-panel" id={id} aria-hidden={!open} inert={!open}>
        <div className="t-acc-panel-inner">
          <div className="quote-content">
            <p className="small-note">
              {excerptOnly
                ? `${htmlSource ? "HTML reports have no physical page number." : "Physical PDF page reference."} Full saved text is in the evidence download.`
                : "Physical PDF page; table headers and measurement periods remain in the full page below."}
            </p>
            <p className="small-note">{roles?.join(" · ")}</p>
            <blockquote>{e.excerpt}</blockquote>
            <a
              className="source-out"
              href={e.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open original page <Icon name="arrow-up-right" />
            </a>
            <span className="quote-check">
              {e.quote_verification === "exact_saved_page_substring"
                ? "Exact quote checked against saved source text"
                : "Quote verification: " + e.quote_verification}
              {e.origin === "separate_offline_source_review"
                ? " · Separate offline source review"
                : " · Collector extraction"}
            </span>
            <details className="saved-page">
              <summary>{excerptOnly ? "Cited excerpt & provenance" : "Full saved page & provenance"}</summary>
              <p>
                {e.snapshot_method} · Record {e.claim_id}
              </p>
              <pre>{e.source_page_text}</pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
export function Evidence({ item }) {
  if (!item) return null;
  return (
    <div className="evidence-content">
      <p className="small-note">
        Interpretation: {item.review_status}. Company evidence does not
        establish individual contribution.
      </p>
      <div className="interpretations">
        <div>
          <span className="detail-label">WHAT IT SUPPORTS</span>
          <p>{item.meaning}</p>
        </div>
        <div>
          <span className="detail-label">WHAT REMAINS UNPROVEN</span>
          <p>{item.limit}</p>
        </div>
      </div>
      <details className="date-support">
        <summary>How dates are assigned</summary>
        {item.date_support.map((d, i) => (
          <p key={i}>
            <strong>
              {d.value} · {d.role}
            </strong>
            <br />
            {d.entry}
            <br />
            {d.basis}
          </p>
        ))}
      </details>
      <div className="source-list">
        {item.refs.map((n) => (
          <SourceQuote key={n} reference={n} roles={item.reference_roles[n]} />
        ))}
      </div>
    </div>
  );
}
