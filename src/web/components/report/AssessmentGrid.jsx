"use client";
import React, { useRef, useState, useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useReport } from "./ReportContext";
import { Icon } from "./Icon";
import { Evidence } from "./Evidence";
export function AssessmentGrid() {
  const model = useReport();
  const panelId = useId();
  const [assessment, setAssessment] = useState(null);
  const [lastAssessment, setLastAssessment] = useState(model.assessments[0]);
  const reduced = useReducedMotion();
  const sectionRef = useRef(null);
  return (
    <section
      ref={sectionRef}
      className="ws-overview"
      aria-label="Four separate evidence assessments"
    >
      <div className="assessment-grid">
        {model.assessments.map((a) => (
          <motion.button
            key={a.id}
            type="button"
            className="assessment-card t-acc-head"
            data-assessment={a.id}
            data-selected={assessment === a.id}
            aria-expanded={assessment === a.id}
            aria-controls={panelId}
            onClick={() => {
              const next = assessment === a.id ? null : a.id;
              setAssessment(next);
              setLastAssessment(a);
            }}
            whileTap={reduced ? undefined : { scale: 0.985 }}
          >
            <span className="assessment-name">
              <span className="signal unknown" />
              {a.name}
            </span>
            <span className="assessment-value">{a.value}</span>
            <span className="assessment-summary">{a.summary}</span>
            <span className="assessment-proof">
              {a.caption}
              <Icon name="arrow-up-right" />
            </span>
          </motion.button>
        ))}
      </div>
      <div className="assessment-disclosure t-acc" data-open={!!assessment}>
        <div
          className="t-acc-panel"
          id={panelId}
          aria-hidden={!assessment}
          inert={!assessment}
        >
          <div className="t-acc-panel-inner">
            <div className="assessment-inspector">
              <div className="inspector-heading">
                <h2>{lastAssessment.name}</h2>
                <span>Provisional assessment</span>
                <button
                  className="quiet-button"
                  aria-label="Close assessment evidence"
                  onClick={() => {
                    Array.from(
                      sectionRef.current.querySelectorAll("[data-assessment]"),
                    )
                      .find(
                        (element) => element.dataset.assessment === assessment,
                      )
                      ?.focus();
                    setAssessment(null);
                  }}
                >
                  <Icon name="x" />
                </button>
              </div>
              <Evidence key={lastAssessment.id} item={lastAssessment} />
            </div>
          </div>
        </div>
      </div>
      <p className="overview-note">
        <Icon name="info" />
        Company performance does not establish a director’s individual
        contribution.
      </p>
    </section>
  );
}
