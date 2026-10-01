"use client";
import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  animate,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  timelineRail,
  transitionTimelineView,
  type TimelineView,
  type ViewPhase,
} from "../../lib/timeline-view-transition";

export function useTimelineView(
  viewer: RefObject<HTMLElement | null>,
  width: number,
  height: number,
  reduced: boolean | null,
) {
  const [view, setView] = useState<TimelineView>("perspective");
  const [renderedView, setRenderedView] = useState<TimelineView>("perspective");
  const [phase, setPhase] = useState<ViewPhase>("idle");
  const phaseRef = useRef<ViewPhase>("idle"),
    settledView = useRef<TimelineView>("perspective");
  const opacity = useMotionValue(1);
  const x = useMotionValue(width / 2),
    y = useMotionValue(height - 105);
  const rotate = useMotionValue(-26),
    scaleX = useMotionValue(width * 1.4);
  // Rotate the already-sized line. Motion's default scale-before-rotation
  // transform order would stretch the rotated one-pixel surface sideways.
  const transform = useTransform(
    [x, y, rotate, scaleX],
    ([left, top, angle, length]) =>
      `translate3d(${left}px, ${top}px, 0) rotate(${angle}deg) scaleX(${length})`,
  );

  useLayoutEffect(() => {
    if (!viewer.current) return;
    const styles = getComputedStyle(viewer.current);
    const seconds = (token: string, fallback: number) => {
      const raw = styles.getPropertyValue(token).trim(),
        value = parseFloat(raw);
      return Number.isFinite(value)
        ? value / (raw.endsWith("ms") ? 1000 : 1)
        : fallback;
    };
    const inset =
      parseFloat(styles.getPropertyValue("--timeline-list-inset")) || 48;
    const target = timelineRail(view, width, height, inset),
      rail = { x, y, rotate, scaleX };
    if (phaseRef.current === "idle" && settledView.current === view) {
      for (const key of Object.keys(target) as (keyof typeof target)[])
        rail[key].jump(target[key]);
      return;
    }
    const sequence = transitionTimelineView({
      opacity,
      rail,
      target,
      view,
      reduced: Boolean(reduced),
      timings: {
        out: seconds("--timeline-fade-out", 0.15),
        line: seconds("--timeline-line-response", 0.5),
        in: seconds("--timeline-fade-in", 0.25),
      },
      animateValue: (track, target, options) =>
        animate(track as MotionValue<number>, target, options),
      swap: setRenderedView,
      phase: (next) => {
        phaseRef.current = next;
        setPhase(next);
        if (next === "idle") settledView.current = view;
      },
    });
    return () => sequence.cancel();
  }, [view, width, height, reduced, viewer, opacity, x, y, rotate, scaleX]);
  return {
    view,
    setView,
    renderedView,
    phase,
    opacity,
    rail: { transform },
  };
}
