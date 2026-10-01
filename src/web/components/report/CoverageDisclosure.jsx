"use client";
import React, { useState, useId } from "react";
import { useReport } from "./ReportContext";
import { Icon } from "./Icon";
export function CoverageDisclosure() {
  const model = useReport();
  const panelId = useId();
  const [coverageOpen, setCoverageOpen] = useState(false);
  return (
    <section className="coverage t-acc" data-open={coverageOpen}>
      <button
        className="coverage-heading t-acc-head"
        aria-expanded={coverageOpen}
        aria-controls={panelId}
        onClick={() => setCoverageOpen(!coverageOpen)}
      >
        <span>
          <span className="coverage-title">
            A clear record includes its limits.
          </span>
          <span className="coverage-caption">
            {model.source_documents} annual reports · {model.extracted_claims}{" "}
            saved excerpts
          </span>
        </span>
        <span className="t-acc-chevron">
          <Icon name="chevron-down" />
        </span>
      </button>
      <div
        id={panelId}
        className="t-acc-panel"
        inert={!coverageOpen}
        aria-hidden={!coverageOpen}
      >
        <div className="t-acc-panel-inner">
          <div className="coverage-body">
            <p>
              {model.review} This view selects {model.events.length} major
              moments from {model.ledger_entries} normalized entries.{" "}
              {model.uncurated_claims} extracted records still need ledger
              curation.
            </p>
            <ul className="coverage-years">
              {model.coverage.map((c) => (
                <li key={c.year}>
                  <strong>FY{c.year}</strong>
                  <span>
                    {c.status} · {c.collector_excerpts} collected excerpts
                    {c.supplemental_excerpts
                      ? ` + ${c.supplemental_excerpts} source supplement`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
            {model.limitations.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
            {model.collection_gaps.length > 0 && (
              <details>
                <summary>
                  Collection notes ({model.collection_gaps.length})
                </summary>
                <ul>
                  {model.collection_gaps.map((gap, i) => (
                    <li key={i}>{gap}</li>
                  ))}
                </ul>
              </details>
            )}
            {model.ledger_url && (
              <p>
                <a
                  className="source-out"
                  href={model.ledger_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open the full evidence ledger <Icon name="arrow-up-right" />
                </a>
              </p>
            )}
            <p>
              Individual board profiles need roles, tenure, documented decisions
              and comparable outcomes. Unknown evidence is not a poor rating.
            </p>
            <p>
              Rail positions use month-level anchors. Annual results are
              anchored at their period end; year-only events at December for
              layout. Perspective compresses distant time; no exact event day is
              implied.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
