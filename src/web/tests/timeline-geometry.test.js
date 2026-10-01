import test from "node:test";
import assert from "node:assert/strict";
import {
  projectTimeline,
  makeTicks,
  PIXELS_PER_DAY,
  visibleMonthLabels,
  visibleEventPoints,
} from "../lib/timeline-geometry.js";

test("selected timestamp projects to center at desktop and mobile widths", () => {
  for (const width of [320, 390, 1280, 1920]) {
    const center = projectTimeline(0, width);
    assert.equal(center.x, 0);
    assert.equal(Math.abs(center.y), 0);
    assert.equal(center.scale, 1);
    assert.equal(center.visible, true);
  }
});

test("future events rise to the right, shrink with distance, and retain ordering", () => {
  const near = projectTimeline(8 * PIXELS_PER_DAY, 1440);
  const far = projectTimeline(19 * PIXELS_PER_DAY, 1440);
  assert.ok(near.x > 0);
  assert.ok(far.x > near.x);
  assert.ok(far.y < near.y && near.y < 0);
  assert.ok(far.scale < near.scale && near.scale < 1);
  assert.ok(
    Math.abs((Math.atan2(-near.y, near.x) * 180) / Math.PI - 26) < 0.001,
  );
});

test("monthly source events retain broad spacing", () => {
  assert.ok(28 * PIXELS_PER_DAY >= 672);
});

test("far month labels and event hit areas do not pile up", () => {
  const ticks = makeTicks(
    Date.parse("2024-04-01"),
    Date.parse("2025-04-01"),
  ).filter((t) => t.major);
  for (const width of [288, 320, 736, 1024])
    for (const offset of [0, -1400, -4300]) {
      const visible = [...visibleMonthLabels(ticks, offset, width)].map((p) =>
        projectTimeline(p + offset, width),
      );
      for (let i = 0; i < visible.length; i++)
        for (let j = i + 1; j < visible.length; j++)
          assert.ok(Math.abs(visible[i].x - visible[j].x) >= 112);
      const points = [0, 1464, 2952, 3696, 4416, 5880, 8784];
      const marks = [...visibleEventPoints(points, offset, width)].map((p) =>
        projectTimeline(p + offset, width),
      );
      for (let i = 0; i < marks.length; i++)
        for (let j = i + 1; j < marks.length; j++)
          assert.ok(
            Math.hypot(marks[i].x - marks[j].x, marks[i].y - marks[j].y) >= 52,
          );
    }
});

test("projection stays finite across the full rail and hides points behind camera", () => {
  for (let distance = -12000; distance <= 12000; distance += 20) {
    const point = projectTimeline(distance, 390);
    assert.ok([point.x, point.y, point.scale].every(Number.isFinite));
    assert.ok(point.scale > 0 && point.scale <= 1.35);
  }
  assert.equal(projectTimeline(-12000, 390).visible, false);
});

test("calendar labels appear once per month, never on individual event dates", () => {
  const ticks = makeTicks(Date.parse("2026-03-04"), Date.parse("2026-04-24"));
  const labels = ticks.filter((tick) => tick.label).map((tick) => tick.label);
  assert.ok(labels.includes("March 2026"));
  assert.ok(labels.includes("April 2026"));
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(labels.every((label) => /^[A-Za-z]+ 2026$/.test(label)));
  assert.ok(
    ticks.filter((tick) => !tick.major).every((tick) => tick.label === ""),
  );
});
