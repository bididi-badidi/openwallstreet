export type TimelineView = "perspective" | "list";
export type ViewPhase = "idle" | "fading-out" | "morphing" | "fading-in";
export type Rail = { x: number; y: number; rotate: number; scaleX: number };

export function timelineRail(
  view: TimelineView,
  width: number,
  height: number,
  inset: number,
): Rail {
  return view === "list"
    ? { x: inset, y: height / 2, rotate: -90, scaleX: Math.max(1, height - 48) }
    : { x: width / 2, y: height - 105, rotate: -26, scaleX: width * 1.4 };
}

export function railSpring(response: number) {
  const frequency = (2 * Math.PI) / Math.max(0.1, response);
  // Explicit critically damped physics preserves MotionValue velocity when
  // reversed. Motion's duration/bounce springs discard inherited velocity.
  return {
    type: "spring" as const,
    mass: 1,
    stiffness: frequency * frequency,
    damping: 2 * frequency,
  };
}

type Track = { get: () => number; jump: (value: number) => void };
type Playback = {
  then: (resolve: () => void, reject?: () => void) => Promise<unknown>;
  stop: () => void;
};
type Options = {
  opacity: Track;
  rail: Record<keyof Rail, Track>;
  target: Rail;
  view: TimelineView;
  reduced: boolean;
  timings: { out: number; line: number; in: number };
  animateValue: (
    track: Track,
    target: number,
    options: Record<string, unknown>,
  ) => Playback;
  swap: (view: TimelineView) => void;
  phase: (phase: ViewPhase) => void;
};

// A single cancellable sequence owns the handoff. The rail stays mounted;
// stopping leaves every presentation value and its velocity in place.
export function transitionTimelineView(options: Options) {
  let cancelled = false;
  const running: Playback[] = [];
  const play = (
    track: Track,
    value: number,
    settings: Record<string, unknown>,
  ) => {
    const playback = options.animateValue(track, value, settings);
    running.push(playback);
    return playback;
  };
  const finished = (async () => {
    if (options.reduced) {
      options.swap(options.view);
      for (const key of Object.keys(options.target) as (keyof Rail)[])
        options.rail[key].jump(options.target[key]);
      options.opacity.jump(1);
      options.phase("idle");
      return;
    }
    if (options.opacity.get() > 0.001) {
      options.phase("fading-out");
      await play(options.opacity, 0, {
        duration: options.timings.out,
        ease: "easeOut",
      });
      if (cancelled) return;
    }
    options.swap(options.view);
    options.phase("morphing");
    await Promise.all(
      (Object.keys(options.target) as (keyof Rail)[]).map((key) =>
        play(
          options.rail[key],
          options.target[key],
          railSpring(options.timings.line),
        ),
      ),
    );
    if (cancelled) return;
    options.phase("fading-in");
    await play(options.opacity, 1, {
      duration: options.timings.in,
      ease: [0.22, 1, 0.36, 1],
    });
    if (!cancelled) options.phase("idle");
  })();
  return {
    finished,
    cancel() {
      cancelled = true;
      running.forEach((playback) => playback.stop());
    },
  };
}
