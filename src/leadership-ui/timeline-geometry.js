// A bounded perspective projection keeps the rail cinematic and the content upright.
export const DAY_MS = 86_400_000;
// Adjacent month-level source dates sit roughly 720 layout pixels apart.
export const PIXELS_PER_DAY = 24;
export const TILT_RADIANS = 26 * Math.PI / 180;
const DEPTH_RADIANS = 48 * Math.PI / 180;

export function projectTimeline(distance, viewportWidth) {
  const focal = 1400;
  const denominator = 1 + distance * Math.sin(DEPTH_RADIANS) / focal;
  if (denominator < .25) return { x: -10000, y: 10000, scale: .25, visible: false };
  const perspective = 1 / denominator;
  const responsive = Math.min(1, Math.max(.52, viewportWidth / 1100));
  const along = distance * Math.cos(DEPTH_RADIANS) * perspective * responsive;
  const x = along * Math.cos(TILT_RADIANS);
  const y = -along * Math.sin(TILT_RADIANS);
  return {
    x, y,
    scale: Math.min(1.35, perspective),
    visible: x > -viewportWidth / 2 - 200 && x < viewportWidth / 2 + 200,
  };
}

export function monthLabel(date) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

export function makeTicks(startTime, endTime) {
  const ticks = [];
  // Full calendar boundaries; label each month once, never each event date.
  const start = new Date(startTime);
  start.setUTCMonth(start.getUTCMonth() - 2, 1);
  const end = new Date(endTime);
  end.setUTCMonth(end.getUTCMonth() + 3, 1);
  for (let time = start.getTime(); time <= end.getTime(); time += DAY_MS) {
    const date = new Date(time);
    const major = date.getUTCDate() === 1;
    ticks.push({
      point: (time - startTime) / DAY_MS * PIXELS_PER_DAY,
      major,
      week: date.getUTCDay() === 1,
      label: major ? monthLabel(date) : '',
    });
  }
  return ticks;
}

export function visibleMonthLabels(ticks, offset, width) {
  const accepted=[];
  const ordered=ticks.map(t=>({point:t.point,...projectTimeline(t.point+offset,width)})).filter(t=>t.visible&&Math.abs(t.x)<width/2-58).sort((a,b)=>Math.abs(a.x)-Math.abs(b.x));
  for(const t of ordered) if(accepted.every(a=>Math.abs(a.x-t.x)>=112)) accepted.push(t);
  return new Set(accepted.map(t=>t.point));
}

export function visibleEventPoints(points, offset, width) {
  const accepted=[];
  const ordered=points.map(point=>({point,...projectTimeline(point+offset,width)})).filter(p=>p.visible&&Math.abs(p.x)<width/2-22).sort((a,b)=>Math.abs(a.x)-Math.abs(b.x));
  for(const p of ordered) if(accepted.every(a=>Math.hypot(a.x-p.x,a.y-p.y)>=52)) accepted.push(p);
  return new Set(accepted.map(p=>p.point));
}
