"use client";
import { useLayoutEffect, useRef } from "react";
import { useReport } from "./ReportContext";
import { Evidence } from "./Evidence";
import { Icon } from "./Icon";

export function VerticalTimeline({
  selected,
  select,
  active,
  reduced,
  open,
  onOpenChange,
  idPrefix,
}: {
  selected: number;
  select: (index: number) => void;
  active: boolean;
  reduced: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  idPrefix: string;
}) {
  const model = useReport(),
    scroller = useRef<HTMLDivElement>(null),
    wasActive = useRef(false);
  useLayoutEffect(() => {
    const list = scroller.current;
    if (!active || !list) {
      wasActive.current = false;
      return;
    }
    const card = list.querySelector<HTMLElement>(
      `[data-event-index="${selected}"]`,
    );
    if (card)
      list.scrollTo({
        top: Math.max(
          0,
          list.scrollTop +
            card.getBoundingClientRect().top -
            list.getBoundingClientRect().top -
            24,
        ),
        behavior: reduced || !wasActive.current ? "instant" : "smooth",
      });
    wasActive.current = true;
  }, [active, selected, reduced]);
  return (
    <div
      className="vertical-timeline-scroll"
      ref={scroller}
      tabIndex={active ? 0 : -1}
      aria-label="Scroll chronological milestones"
    >
      <ol className="vertical-timeline">
        {model.events.map((event, index) => {
          const expanded = selected === index && open;
          const sourceId = `${idPrefix}-${event.id}-source`;
          return (
            <li
              key={event.id}
              className="vertical-milestone"
              data-event-index={index}
              data-selected={selected === index}
            >
              <span className="vertical-milestone-dot" aria-hidden="true" />
              <article
                className="vertical-milestone-card t-acc"
                data-open={expanded}
              >
                <button
                  type="button"
                  className="vertical-milestone-button"
                  aria-expanded={expanded}
                  aria-controls={sourceId}
                  aria-current={selected === index ? "step" : undefined}
                  onClick={() => {
                    select(index);
                    onOpenChange(selected === index ? !open : true);
                  }}
                >
                  <span className="vertical-milestone-tile" aria-hidden="true">
                    <span className="tile-value">
                      {event.tile
                        .replace(/\s*billion\b/gi, "B")
                        .replace(/\s*million\b/gi, "M")}
                    </span>
                    <span className="tile-label">{event.label}</span>
                  </span>
                  <span className="vertical-milestone-copy">
                    <span className="vertical-milestone-date">
                      {event.date}
                      <span>{event.type}</span>
                    </span>
                    <span className="vertical-milestone-title">
                      {event.title}
                    </span>
                    <span className="vertical-milestone-summary">
                      {event.summary}
                    </span>
                    <span className="vertical-milestone-source">
                      <Icon name="file-text" /> Evidence &amp; context{" "}
                      <span className="t-acc-chevron">
                        <Icon name="chevron-down" />
                      </span>
                    </span>
                  </span>
                </button>
                <div
                  className="t-acc-panel"
                  id={sourceId}
                  aria-hidden={!expanded}
                  inert={!expanded}
                >
                  <div className="t-acc-panel-inner">
                    <div className="vertical-milestone-evidence">
                      {expanded && <Evidence item={event} />}
                    </div>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
