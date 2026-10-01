"use client";
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { TimelineView } from "../../lib/timeline-view-transition";
import "./timeline-views.css";

export function TimelineViewSwitch({
  view,
  onChange,
  panelId,
}: {
  view: TimelineView;
  onChange: (view: TimelineView) => void;
  panelId: string;
}) {
  const bar = useRef<HTMLDivElement>(null),
    pill = useRef<HTMLSpanElement>(null),
    initialized = useRef(false);
  function move(animate: boolean) {
    const active = bar.current?.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    if (!active || !pill.current) return;
    const highlight = pill.current!;
    const previous = highlight.style.transition;
    if (!animate) highlight.style.transition = "none";
    highlight.style.transform = `translateX(${active.offsetLeft}px)`;
    highlight.style.width = `${active.offsetWidth}px`;
    if (!animate) {
      void highlight.offsetWidth;
      highlight.style.transition = previous;
    }
  }
  useLayoutEffect(() => {
    move(initialized.current);
    initialized.current = true;
  }, [view]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => move(false));
    observer.observe(bar.current!);
    return () => observer.disconnect();
  }, []);
  function key(event: KeyboardEvent<HTMLDivElement>) {
    let next: TimelineView | undefined;
    if (["ArrowLeft", "ArrowRight"].includes(event.key))
      next = view === "list" ? "perspective" : "list";
    if (event.key === "Home") next = "perspective";
    if (event.key === "End") next = "list";
    if (next) {
      event.preventDefault();
      event.stopPropagation();
      onChange(next);
      bar.current
        ?.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)
        ?.focus();
    }
  }
  return (
    <div
      className="t-tabs timeline-view-switch"
      role="tablist"
      aria-label="Timeline view"
      ref={bar}
      onKeyDown={key}
    >
      <span className="t-tabs-pill" aria-hidden="true" ref={pill} />
      {(["perspective", "list"] as const).map((mode) => (
        <button
          key={mode}
          id={`${panelId}-${mode}`}
          className="t-tab"
          role="tab"
          type="button"
          data-view={mode}
          aria-selected={view === mode}
          aria-controls={panelId}
          tabIndex={view === mode ? 0 : -1}
          onClick={() => onChange(mode)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {mode === "list" ? (
              <>
                <path d="M5 3v14M9 5h7M9 10h7M9 15h7" />
                <circle cx="5" cy="5" r="1.5" />
                <circle cx="5" cy="10" r="1.5" />
                <circle cx="5" cy="15" r="1.5" />
              </>
            ) : (
              <>
                <path d="m2 16 16-9M5 14v-4M11 11V7M16 8V5" />
                <path d="M3 6h4v4H3zM9 3h4v4H9zM14 2h4v3h-4z" />
              </>
            )}
          </svg>
          {mode === "list" ? "List" : "Perspective"}
        </button>
      ))}
    </div>
  );
}
