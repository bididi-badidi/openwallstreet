"use client";
import React, { useEffect, useMemo, useRef, useState, useId } from "react";
import {
  motion,
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import EventCard from "./EventCard";
import { Evidence } from "./Evidence";
import { Icon } from "./Icon";
import { useReport } from "./ReportContext";
import {
  DAY_MS,
  PIXELS_PER_DAY,
  projectTimeline,
  makeTicks,
  visibleMonthLabels,
  visibleEventPoints,
} from "../../lib/timeline-geometry";
function useProjection(position, point, width) {
  const projected = useTransform(position, (value) =>
    projectTimeline(point + value, width),
  );
  return {
    x: useTransform(projected, (v) => v.x),
    y: useTransform(projected, (v) => v.y),
    scale: useTransform(projected, (v) => v.scale),
    visibility: useTransform(projected, (v) =>
      v.visible ? "visible" : "hidden",
    ),
  };
}
function Tick({ tick, position, width, visibleLabels }) {
  const { x, y, scale, visibility } = useProjection(
    position,
    tick.point,
    width,
  );
  const opacity = useTransform(visibleLabels, (value) =>
    value.has(tick.point) ? 1 : 0,
  );
  return (
    <motion.div
      className={"rail-tick " + (tick.major ? "major" : "week")}
      style={{ x, y, visibility }}
    >
      <motion.span className="tick-stroke" style={{ scaleY: scale }} />
      {tick.major && (
        <motion.span className="month-label" style={{ opacity }}>
          {tick.label}
        </motion.span>
      )}
    </motion.div>
  );
}
function TimelineEvent({
  event,
  index,
  active,
  expanded,
  select,
  position,
  width,
  reduced,
  onSize,
  visiblePoints,
  point,
}) {
  const { x, y, scale } = useProjection(position, point, width);
  const visible = useTransform(visiblePoints, (value) =>
    value.has(point) ? "visible" : "hidden",
  );
  return (
    <motion.div
      className="event-anchor"
      data-active={active}
      style={{ x, y, visibility: visible, zIndex: active ? 10 : 2 }}
    >
      <motion.div className="event-depth" style={{ scale }}>
        <div className="billboard">
          <EventCard
            event={event}
            index={index}
            active={active}
            expanded={expanded}
            select={select}
            reduced={reduced}
            onSize={onSize}
          />
        </div>
        <span className="event-stem" aria-hidden="true" />
      </motion.div>
      <button
        className="event-dot"
        aria-label={`Select ${event.date}: ${event.title}`}
        aria-current={active ? "step" : undefined}
        onClick={() => select(index)}
      >
        <span />
      </button>
    </motion.div>
  );
}

export function EvidenceTimeline() {
  const model = useReport();
  const headingId = useId();
  const sourceId = useId();
  const events = model.events;
  const { points, ticks, monthTicks } = useMemo(() => {
    const start = Date.parse(events[0].month + "-01T00:00:00Z");
    const points = events.map(
      (e) =>
        ((Date.parse(e.month + "-01T00:00:00Z") - start) / DAY_MS) *
        PIXELS_PER_DAY,
    );
    const ticks = makeTicks(
      start,
      Date.parse(events.at(-1).month + "-01T00:00:00Z"),
    ).filter((t) => t.major || t.week);
    return { points, ticks, monthTicks: ticks.filter((t) => t.major) };
  }, [events]);
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [phase, setPhase] = useState("moving");
  const [width, setWidth] = useState(736);
  const [maxCardHeight, setMaxCardHeight] = useState(310);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const viewer = useRef(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const position = useMotionValue(-points[0]);
  const reduced = useReducedMotion();
  const visibleLabels = useTransform(position, (value) =>
    visibleMonthLabels(monthTicks, value, width),
  );
  const visiblePoints = useTransform(position, (value) =>
    visibleEventPoints(points, value, width),
  );
  const selectedEvent = events[selected];
  const onSize = React.useCallback(
    (size) => setMaxCardHeight((h) => Math.max(h, size.height)),
    [],
  );
  const select = React.useCallback(
    (index) => {
      const next = Math.max(0, Math.min(events.length - 1, index));
      if (next === selectedRef.current) return;
      setSelected(next);
      setSourcesOpen(false);
    },
    [events.length],
  );
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(viewer.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false,
      pause;
    setExpanded(null);
    if (reduced) {
      position.jump(-points[selected]);
      setExpanded(selected);
      setPhase("expanded");
      return;
    }
    setPhase("moving");
    const controls = animate(position, -points[selected], {
      type: "spring",
      bounce: 0,
      duration: 1.8,
      onComplete: () => {
        if (cancelled) return;
        setPhase("pause");
        pause = setTimeout(() => {
          if (!cancelled) {
            setExpanded(selected);
            setPhase("expanded");
          }
        }, 450);
      },
    });
    return () => {
      cancelled = true;
      clearTimeout(pause);
      controls.stop();
    };
  }, [selected, reduced, position, points]);
  useEffect(() => {
    const key = (e) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.target.closest("input,textarea,select,[contenteditable]")
      )
        return;
      const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (delta) {
        e.preventDefault();
        select(selectedRef.current + delta);
      }
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        select(e.key === "Home" ? 0 : events.length - 1);
      }
    };
    const area = viewer.current.parentElement;
    area.addEventListener("keydown", key);
    return () => area.removeEventListener("keydown", key);
  }, [select, events.length]);
  return (
    <section className="ws-story" aria-labelledby={headingId}>
      <div className="story-heading">
        <div>
          <span className="eyebrow">THE DECISIONS. THE CONSEQUENCES.</span>
          <h2 id={headingId}>{model.title}</h2>
        </div>
        <span className="story-count">{events.length} selected milestones</span>
      </div>
      <p className="coverage-status">
        {model.coverage.filter((c) => c.status !== "collected; review pending")
          .length
          ? "Coverage gaps: " +
            model.coverage
              .filter((c) => c.status !== "collected; review pending")
              .map((c) => `FY${c.year} (${c.status})`)
              .join(" · ")
          : `${model.source_documents} annual reports collected. Interpretation and guidance-revision review remain open.`}
      </p>
      <section
        ref={viewer}
        className="viewer"
        aria-label="Cinematic evidence timeline"
        data-phase={phase}
        data-selected={selectedEvent.id}
        style={{
          "--viewer-height": `${Math.max(480, maxCardHeight + 170)}px`,
          "--measured-card-width": `${Math.min(300, Math.max(210, width - 56))}px`,
        }}
      >
        <p className="visually-hidden" aria-live="polite">
          {selectedEvent.date}. {selectedEvent.title}{" "}
          {expanded === selected ? selectedEvent.summary : ""}
        </p>
        <div className="timeline-window">
          <div className="rail-line" aria-hidden="true" />
          <div className="projection-origin">
            <div className="tick-layer" aria-hidden="true">
              {ticks.map((t) => (
                <Tick
                  key={t.point}
                  tick={t}
                  position={position}
                  width={width}
                  visibleLabels={visibleLabels}
                />
              ))}
            </div>
            {events.map((e, i) => (
              <TimelineEvent
                key={e.id}
                event={e}
                index={i}
                active={i === selected}
                expanded={i === expanded}
                select={select}
                reduced={reduced}
                position={position}
                width={width}
                onSize={onSize}
                visiblePoints={visiblePoints}
                point={points[i]}
              />
            ))}
          </div>
        </div>
      </section>
      <nav className="story-controls" aria-label="Timeline navigation">
        <motion.button
          type="button"
          className="round-button"
          aria-label="Previous event"
          disabled={selected === 0}
          onClick={() => select(selected - 1)}
          whileTap={reduced ? undefined : { scale: 0.94 }}
        >
          <Icon name="chevron-left" />
        </motion.button>
        <span className="selected-date">
          {selectedEvent.date}
          <span>
            {selected + 1} of {events.length} · {selectedEvent.type}
          </span>
        </span>
        <motion.button
          type="button"
          className="round-button"
          aria-label="Next event"
          disabled={selected === events.length - 1}
          onClick={() => select(selected + 1)}
          whileTap={reduced ? undefined : { scale: 0.94 }}
        >
          <Icon name="chevron-right" />
        </motion.button>
      </nav>
      <nav className="year-jumps" aria-label="Jump to a year">
        {model.coverage.map((c) => {
          const index = events.findIndex((e) =>
            e.month.startsWith(String(c.year)),
          );
          return (
            <button
              key={c.year}
              type="button"
              disabled={index < 0}
              aria-current={
                selectedEvent.month.startsWith(String(c.year))
                  ? "date"
                  : undefined
              }
              onClick={() => select(index)}
            >
              {c.year}
            </button>
          );
        })}
      </nav>
      <p className="story-hint">
        Select a year or use the arrow keys · Proposed interpretation
      </p>
      <div className="event-evidence t-acc" data-open={sourcesOpen}>
        <button
          className="evidence-trigger t-acc-head"
          type="button"
          aria-expanded={sourcesOpen}
          aria-controls={sourceId}
          onClick={() => {
            setSourcesOpen(!sourcesOpen);
          }}
        >
          <span>
            <Icon name="file-text" />
            Evidence &amp; context
            <span className="evidence-trigger-page">
              p. {model.evidence[selectedEvent.refs[0]].page}
            </span>
          </span>
          <span className="t-acc-chevron">
            <Icon name="chevron-down" />
          </span>
        </button>
        <div
          className="t-acc-panel"
          id={sourceId}
          aria-hidden={!sourcesOpen}
          inert={!sourcesOpen}
        >
          <div className="t-acc-panel-inner">
            <div className="event-inspector">
              <p className="attribution">
                {selectedEvent.date_kind} · {selectedEvent.owner}
                {selectedEvent.decision_by !== "not_applicable" &&
                selectedEvent.decision_by !== "unknown"
                  ? " · Decision: " + selectedEvent.decision_by
                  : ""}
                {selectedEvent.target_period
                  ? " · Target: " + selectedEvent.target_period
                  : ""}
              </p>
              <Evidence key={selectedEvent.id} item={selectedEvent} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
