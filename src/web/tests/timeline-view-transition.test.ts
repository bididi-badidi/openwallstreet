import test from "node:test";
import assert from "node:assert/strict";
import { spring } from "motion";
import {
  railSpring,
  timelineRail,
  transitionTimelineView,
  type TimelineView,
} from "../lib/timeline-view-transition";

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("the real rail spring carries incoming velocity through a reversal before settling", () => {
  const options = { ...railSpring(0.5), keyframes: [220, 450] };
  const reversed = spring({ ...options, velocity: -1000 });
  assert.ok(
    reversed.next(1).value < 220,
    "the rail retains its incoming momentum",
  );
  const atRest = spring({ ...options, velocity: 0 });
  assert.ok(atRest.next(1).value > 220);
  const settled = reversed.next(2000);
  assert.equal(settled.done, true);
  assert.equal(settled.value, 450);
});
function harness() {
  const values = Object.fromEntries(
    Object.entries({
      opacity: 1,
      ...timelineRail("perspective", 900, 560, 48),
    }).map(([name, value]) => [
      name,
      {
        name,
        value,
        get() {
          return this.value;
        },
        jump(next: number) {
          this.value = next;
        },
      },
    ]),
  );
  const jobs: {
    name: string;
    from: number;
    to: number;
    stopped: boolean;
    finish: () => void;
  }[] = [];
  const phases: string[] = [],
    views: string[] = [];
  const start = (view: TimelineView, reduced = false) =>
    transitionTimelineView({
      opacity: values.opacity,
      rail: {
        x: values.x,
        y: values.y,
        rotate: values.rotate,
        scaleX: values.scaleX,
      },
      target: timelineRail(view, 900, 560, 48),
      view,
      reduced,
      timings: { out: 0.15, line: 0.5, in: 0.25 },
      animateValue: (track, to) => {
        const source = track as (typeof values)[string];
        let resolve!: () => void;
        const promise = new Promise<void>((r) => {
          resolve = r;
        });
        const job = {
          name: source.name,
          from: source.value,
          to,
          stopped: false,
          finish: () => {
            if (!job.stopped) source.value = to;
            resolve();
          },
        };
        jobs.push(job);
        return Object.assign(promise, {
          stop: () => {
            job.stopped = true;
            resolve();
          },
        });
      },
      swap: (next) => views.push(next),
      phase: (next) => phases.push(next),
    });
  return { values, jobs, phases, views, start };
}

test("the vertical rail stays inside desktop and phone frames and aligns with the list markers", () => {
  for (const [width, height, inset] of [
    [900, 560, 48],
    [288, 650, 26],
    [1200, 980, 48],
  ]) {
    const rail = timelineRail("list", width, height, inset);
    const radians = (rail.rotate * Math.PI) / 180;
    const halfX = (Math.cos(radians) * rail.scaleX) / 2,
      halfY = (Math.sin(radians) * rail.scaleX) / 2;
    assert.ok(Math.abs(rail.x - halfX - inset) < 0.001);
    assert.ok(Math.abs(rail.x + halfX - inset) < 0.001);
    assert.equal(Math.min(rail.y - halfY, rail.y + halfY), 24);
    assert.equal(Math.max(rail.y - halfY, rail.y + halfY), height - 24);
    const perspective = timelineRail("perspective", width, height, inset);
    assert.equal(perspective.x, width / 2);
    assert.equal(perspective.y, height - 105);
    assert.equal(perspective.rotate, -26);
  }
});

test("content is hidden before the rail moves and revealed only after every rail track settles", async () => {
  const h = harness(),
    sequence = h.start("list");
  assert.deepEqual(
    h.jobs.map((j) => j.name),
    ["opacity"],
  );
  assert.deepEqual(h.views, []);
  h.jobs[0].finish();
  await flush();
  assert.equal(h.values.opacity.value, 0);
  assert.deepEqual(h.views, ["list"]);
  assert.deepEqual(h.phases, ["fading-out", "morphing"]);
  assert.deepEqual(
    h.jobs.slice(1).map((j) => j.name),
    ["x", "y", "rotate", "scaleX"],
  );
  for (const job of h.jobs.slice(1, 4)) job.finish();
  await flush();
  assert.equal(
    h.jobs.length,
    5,
    "one unsettled rail track must keep content hidden",
  );
  h.jobs[4].finish();
  await flush();
  assert.equal(h.jobs[5].name, "opacity");
  assert.equal(h.jobs[5].to, 1);
  h.jobs[5].finish();
  await sequence.finished;
  assert.deepEqual(h.phases, ["fading-out", "morphing", "fading-in", "idle"]);
});

test("reversal retains presentation values and stale completions cannot reveal the old view", async () => {
  const h = harness(),
    first = h.start("list");
  h.jobs[0].finish();
  await flush();
  h.values.rotate.value = -52;
  h.values.x.value = 220;
  first.cancel();
  const second = h.start("perspective");
  await flush();
  assert.equal(h.values.rotate.value, -52);
  assert.deepEqual(
    h.jobs.slice(5).map((j) => j.name),
    ["x", "y", "rotate", "scaleX"],
    "an already hidden view reverses the rail immediately",
  );
  assert.equal(h.jobs.findLast((j) => j.name === "rotate")!.from, -52);
  assert.equal(h.jobs.findLast((j) => j.name === "x")!.from, 220);
  assert.deepEqual(h.views, ["list", "perspective"]);
  for (const job of h.jobs.slice(5, 9)) job.finish();
  await flush();
  h.jobs[9].finish();
  await second.finished;
  assert.equal(h.phases.filter((p) => p === "fading-in").length, 1);
  assert.equal(h.phases.filter((p) => p === "idle").length, 1);
  assert.equal(h.values.rotate.value, -26);
});

test("reduced motion swaps the view directly without moving or fading the interface", async () => {
  const h = harness();
  await h.start("list", true).finished;
  assert.equal(h.jobs.length, 0);
  assert.deepEqual(h.views, ["list"]);
  assert.deepEqual(h.phases, ["idle"]);
  assert.equal(h.values.opacity.value, 1);
  assert.equal(h.values.rotate.value, -90);
});
