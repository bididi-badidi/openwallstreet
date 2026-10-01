"use client";
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
} from "react";
import { motion, useAnimationControls } from "motion/react";
import "./event-card.css";

const COMPACT_SIZE = 72;
const COMPACT_IMAGE = 64;
const OPEN_IMAGE = 80;
const IMAGE_TOP = 20;
const IMAGE_GAP = 16;
const smoothOut = [0.22, 1, 0.36, 1];

// The timeline owns travel and its pause. This component owns only the
// reversible surface -> copy sequence, from the thumbnail's bottom center.
export default function EventCard({
  event,
  index,
  active,
  expanded,
  select,
  reduced,
  onSize,
}) {
  const cardRef = useRef(null);
  const copyRef = useRef(null);
  const phaseRef = useRef("collapsed");
  const [phase, setPhase] = useState("collapsed");
  const [size, setSize] = useState({ width: 300, height: 252 });
  const surface = useAnimationControls();
  const thumbnail = useAnimationControls();
  const title = useAnimationControls();
  const summary = useAnimationControls();

  // Measure untransformed content, even while it is clipped and transparent.
  // This keeps the surface fitted to longer copy and narrow viewports.
  useLayoutEffect(() => {
    const measure = () => {
      const copy = copyRef.current;
      if (!copy) return;
      const width = copy.offsetWidth;
      const height = Math.ceil(
        IMAGE_TOP + OPEN_IMAGE + IMAGE_GAP + copy.offsetHeight,
      );
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
      onSize?.({ width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(copyRef.current);
    return () => observer.disconnect();
  }, [event.title, event.summary, onSize]);

  useEffect(() => {
    let cancelled = false;
    const tokens = getComputedStyle(cardRef.current);
    const milliseconds = (name, fallback) => {
      const value = tokens.getPropertyValue(name).trim();
      const number = Number.parseFloat(value);
      if (!Number.isFinite(number)) return fallback;
      return value.endsWith("ms") ? number / 1000 : number;
    };
    const distance =
      Number.parseFloat(tokens.getPropertyValue("--card-text-distance")) || 12;
    const openDuration = milliseconds("--card-open-duration", 0.76);
    const closeDuration = milliseconds("--card-close-duration", 0.56);
    const textDuration = milliseconds("--card-text-duration", 0.36);
    const textExitDuration = milliseconds("--card-text-exit-duration", 0.16);
    const stagger = milliseconds("--card-text-stagger", 0.06);
    const hidden = { opacity: 0, y: distance, filter: "blur(3px)" };
    const visible = { opacity: 1, y: 0, filter: "blur(0px)" };
    const compactSurface = {
      width: COMPACT_SIZE,
      height: COMPACT_SIZE,
      borderRadius: 36,
    };
    const openSurface = {
      width: size.width,
      height: size.height,
      borderRadius: 24,
    };
    const compactThumbnail = {
      width: COMPACT_IMAGE,
      height: COMPACT_IMAGE,
      y: 0,
    };
    const openThumbnail = {
      width: OPEN_IMAGE,
      height: OPEN_IMAGE,
      y: -(size.height - IMAGE_TOP - OPEN_IMAGE - 4),
    };
    const changePhase = (next) => {
      if (cancelled) return;
      phaseRef.current = next;
      setPhase(next);
    };

    if (reduced) {
      surface.set(expanded ? openSurface : compactSurface);
      thumbnail.set(expanded ? openThumbnail : compactThumbnail);
      title.set(expanded ? visible : { ...hidden, y: 0, filter: "none" });
      summary.set(expanded ? visible : { ...hidden, y: 0, filter: "none" });
      changePhase(expanded ? "open" : "collapsed");
    } else if (!expanded && phaseRef.current === "collapsed") {
      surface.set(compactSurface);
      thumbnail.set(compactThumbnail);
      title.set(hidden);
      summary.set(hidden);
    } else {
      const run = async () => {
        if (expanded) {
          changePhase("expanding");
          // If a closing card is reopened, retire any remaining copy while
          // its existing surface smoothly redirects toward the open size.
          await Promise.all([
            surface.start({
              ...openSurface,
              transition: { type: "spring", bounce: 0, duration: openDuration },
            }),
            thumbnail.start({
              ...openThumbnail,
              transition: { type: "spring", bounce: 0, duration: openDuration },
            }),
            title.start({
              opacity: 0,
              transition: { duration: textExitDuration },
            }),
            summary.start({
              opacity: 0,
              transition: { duration: textExitDuration },
            }),
          ]);
          if (cancelled) return;
          title.set(hidden);
          summary.set(hidden);
          changePhase("revealing");
          await Promise.all([
            title.start({
              ...visible,
              transition: { duration: textDuration, ease: smoothOut },
            }),
            summary.start({
              ...visible,
              transition: {
                duration: textDuration,
                delay: stagger,
                ease: smoothOut,
              },
            }),
          ]);
          changePhase("open");
        } else {
          changePhase("hiding");
          // Copy leaves first, in place. Only the empty surface contracts.
          await Promise.all([
            title.start({
              opacity: 0,
              transition: { duration: textExitDuration, ease: "easeOut" },
            }),
            summary.start({
              opacity: 0,
              transition: { duration: textExitDuration, ease: "easeOut" },
            }),
          ]);
          if (cancelled) return;
          title.set(hidden);
          summary.set(hidden);
          changePhase("contracting");
          await Promise.all([
            surface.start({
              ...compactSurface,
              transition: {
                type: "spring",
                bounce: 0,
                duration: closeDuration,
              },
            }),
            thumbnail.start({
              ...compactThumbnail,
              transition: {
                type: "spring",
                bounce: 0,
                duration: closeDuration,
              },
            }),
          ]);
          changePhase("collapsed");
        }
      };
      void run();
    }

    return () => {
      cancelled = true;
      // Stop preserves presentation values. The next sequence starts here,
      // and stale completions cannot reveal a superseded selection.
      surface.stop();
      thumbnail.stop();
      title.stop();
      summary.stop();
    };
  }, [
    expanded,
    reduced,
    size.width,
    size.height,
    surface,
    thumbnail,
    title,
    summary,
  ]);

  const copyId = useId();

  return (
    <motion.button
      ref={cardRef}
      type="button"
      className="event-card"
      data-active={active}
      data-card-phase={phase}
      aria-label={`${event.date}: ${event.title}`}
      aria-expanded={expanded}
      aria-controls={copyId}
      aria-current={active ? "step" : undefined}
      onClick={() => select(index)}
      style={{ x: "-50%" }}
      whileTap={reduced ? undefined : { scale: 0.98 }}
    >
      <motion.span
        className="event-card__surface"
        initial={{
          width: COMPACT_SIZE,
          height: COMPACT_SIZE,
          borderRadius: 36,
        }}
        animate={surface}
        style={{ x: "-50%" }}
      >
        <motion.span
          className="event-card__thumbnail"
          data-type={event.type}
          aria-hidden="true"
          initial={{ width: COMPACT_IMAGE, height: COMPACT_IMAGE, y: 0 }}
          animate={thumbnail}
          style={{ x: "-50%" }}
        >
          <span className="tile-value">{event.tile}</span>
          <span className="tile-label">{event.label}</span>
        </motion.span>
        <span
          ref={copyRef}
          id={copyId}
          className="event-card__copy"
          aria-hidden={!expanded || (phase !== "revealing" && phase !== "open")}
        >
          <motion.span
            className="event-card__title"
            initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
            animate={title}
          >
            <span className="event-card__category">
              {event.type} · {event.date}
            </span>
            {event.title}
          </motion.span>
          <motion.span
            className="event-card__summary"
            initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
            animate={summary}
          >
            {event.summary}
          </motion.span>
        </span>
      </motion.span>
    </motion.button>
  );
}
