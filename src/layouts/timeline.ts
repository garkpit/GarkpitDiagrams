// timeline(): a horizontal timeline. An axis band carries the tick labels; events are cards above
// and below it, joined to their date by a short connector; phases tint the columns behind their
// range with the phase name across the top; milestones add a diamond where the connector meets the
// axis.
//
// Two kinds of axis, chosen by the ticks you pass:
// - `ticks: ['Q1', 'Q2', …]` — equal slots, one per label, tick marks between them. An event's `at`
//   names a slot and the card sits over the slot's centre; a phase covers whole slots.
// - `ticks: [{ at: 0, label: 'Jan' }, …]` — a proportional scale. `at` values are numbers anywhere on
//   it (2.5 is halfway between ticks 2 and 3); a phase runs from one number to another.
//
// Cards never collide. Each card's size comes from its measured text; cards alternate above and
// below; a card that would touch a neighbour on its side goes up a level, provided its connector
// would not run through a nearer card and it would not cover a farther card's connector. When no
// placement works the scale grows and the whole layout is tried again.
import { measure, textHeight, wrapPx } from '../font.ts';
import { colour, type El, laneFills, neededHeight, Scene } from '../scene.ts';

export interface TimelineEvent {
  /** A slot label (equal ticks) or a number on the scale (proportional ticks). */
  at: string | number;
  title: string;
  /** A line or two of detail under the title. */
  text?: string;
  fill?: string;
  /** Mark as a milestone: a diamond on the axis and a bold card. */
  milestone?: boolean;
  /** Force the side; default alternates above, below, above… in date order. */
  side?: 'above' | 'below';
}

export interface TimelinePhase {
  from: string | number;
  to: string | number;
  label: string;
  fill?: string;
}

export interface TimelineSpec {
  title?: string;
  /** Strings for equal slots, or { at, label } for a proportional scale. */
  ticks: string[] | Array<{ at: number; label: string }>;
  events: TimelineEvent[];
  phases?: TimelinePhase[];
  /** Starting px per slot or per unit; grows when labels or cards need more room. */
  unitPx?: number;
  /** Widest a card grows before its text wraps (default 190). */
  cardMaxPx?: number;
  /** Card title size (default 15). */
  size?: number;
  /** Size of an event's detail line under its title (default 13). */
  detailSize?: number;
}

const BAND_H = 34; // axis band
const CONN = 40; // connector from the axis to the nearest level of cards
const LEVEL_GAP = 18;
const CARD_GAP = 18; // between cards on one level
const CLEAR = 10; // a connector stays this far from the side of any card it passes
const DIAMOND = 24;
const TICK_SIZE = 14;
const PHASE_SIZE = 17;
const MAX_LEVEL = 3;

interface Card {
  ev: TimelineEvent;
  x: number;
  w: number;
  h: number;
  side: 'above' | 'below';
  level: number;
  /** Height of the wrapped title block (the detail goes under it). */
  titleH: number;
}

/** Detail text colour: dark grey, so the title leads. */
const DETAIL_INK = '#495057';
/** Space between a card's title and its detail. */
const DETAIL_GAP = 3;
/** Excalidraw's padding round text bound in a box; the title sits this far below the card's top. */
const TEXT_PAD = 5;

/** Lay out a horizontal timeline and return the scene. */
export function timeline(spec: TimelineSpec): Scene {
  const s = new Scene();
  const size = spec.size ?? 15;
  const maxW = spec.cardMaxPx ?? 190;
  if (spec.ticks.length === 0) throw new Error('timeline: no ticks');
  const slots = typeof spec.ticks[0] === 'string';
  const slotLabels = slots ? (spec.ticks as string[]) : [];
  const scaleTicks = slots ? [] : (spec.ticks as Array<{ at: number; label: string }>);

  /** Position on the axis in units: slot centre (i + 0.5) or the number itself. */
  const unit = (v: string | number, where: string): number => {
    if (slots) {
      if (typeof v !== 'string') throw new Error(`timeline: ${where} uses ${v}, but the ticks are labels; name one of ${slotLabels.join(', ')}`);
      const i = slotLabels.indexOf(v);
      if (i < 0) throw new Error(`timeline: ${where} names "${v}", which is not a tick (${slotLabels.join(', ')})`);
      return i + 0.5;
    }
    if (typeof v !== 'number') throw new Error(`timeline: ${where} uses "${v}", but the ticks are a number scale`);
    return v;
  };
  const phaseRange = (p: TimelinePhase): [number, number] => {
    const a = unit(p.from, `phase "${p.label}"`);
    const b = unit(p.to, `phase "${p.label}"`);
    return slots ? [Math.min(a, b) - 0.5, Math.max(a, b) + 0.5] : [Math.min(a, b), Math.max(a, b)];
  };

  // Domain of the axis in units.
  const evUnits = spec.events.map((e, i) => unit(e.at, `event ${i + 1} ("${e.title}")`));
  const lo = slots ? 0 : Math.min(...scaleTicks.map((t) => t.at), ...evUnits, ...(spec.phases ?? []).map((p) => phaseRange(p)[0]));
  const hi = slots ? slotLabels.length : Math.max(...scaleTicks.map((t) => t.at), ...evUnits, ...(spec.phases ?? []).map((p) => phaseRange(p)[1]));

  // Cards, sized once from their measured text: the title at `size`, the detail smaller underneath.
  const dsize = spec.detailSize ?? 13;
  const cards: Card[] = spec.events
    .map((ev, i) => {
      const tl = wrapPx(ev.title, maxW - 28, size);
      const dl = ev.text ? wrapPx(ev.text, maxW - 28, dsize) : [];
      const w = Math.max(96, Math.max(...tl.map((l) => measure(l, size)), ...dl.map((l) => measure(l, dsize))) + 28 + 4);
      const titleH = textHeight(tl.length, size);
      const h = dl.length ? Math.max(neededHeight('box', w, ev.title, size), TEXT_PAD + titleH + DETAIL_GAP + textHeight(dl.length, dsize) + 12) : neededHeight('box', w, ev.title, size);
      return { ev, x: evUnits[i]!, w, h, titleH, side: 'above' as const, level: 0, u: evUnits[i]! };
    })
    .map((c) => c as Card & { u: number })
    .sort((a, b) => a.u - b.u);

  // Starting scale: tick labels must fit between neighbouring ticks.
  let px = spec.unitPx ?? (slots ? 110 : 90);
  if (slots) px = Math.max(px, ...slotLabels.map((l) => measure(l, TICK_SIZE) + 20));
  else {
    const ts = [...scaleTicks].sort((a, b) => a.at - b.at);
    for (let i = 1; i < ts.length; i++) {
      const d = ts[i]!.at - ts[i - 1]!.at;
      const need = (measure(ts[i]!.label, TICK_SIZE) + measure(ts[i - 1]!.label, TICK_SIZE)) / 2 + 16;
      if (d > 0) px = Math.max(px, need / d);
    }
  }

  // Place cards; grow the scale until everything fits.
  const place = (): boolean => {
    const placed: Card[] = [];
    let alt = 0;
    for (const c of cards as Array<Card & { u: number }>) {
      c.x = (c.u - lo) * px;
      const pref = c.ev.side ?? (alt++ % 2 === 0 ? 'above' : 'below');
      const other = pref === 'above' ? 'below' : 'above';
      const tries: Array<['above' | 'below', number]> = [];
      for (let l = 0; l < MAX_LEVEL; l++) {
        tries.push([pref, l]);
        if (!c.ev.side && l < MAX_LEVEL) tries.push([other, l]);
      }
      // Prefer the alternating side for two levels before switching.
      tries.sort((a, b) => rank(a, pref) - rank(b, pref));
      const ok = tries.find(([side, level]) => fits(c, side, level, placed));
      if (!ok) return false;
      [c.side, c.level] = ok;
      placed.push(c);
    }
    // Milestone diamonds on one side must not touch.
    const ms = placed.filter((c) => c.ev.milestone);
    for (let i = 0; i < ms.length; i++)
      for (let j = i + 1; j < ms.length; j++) if (ms[i]!.side === ms[j]!.side && Math.abs(ms[i]!.x - ms[j]!.x) < DIAMOND + 8) return false;
    return true;
  };
  let attempts = 0;
  while (!place()) {
    if (++attempts > 40) throw new Error('timeline: cannot place the cards without collisions; events share a date three or more times, or give fewer events per date');
    px *= 1.1;
  }

  // ---- vertical layout ----
  const levelH = { above: [] as number[], below: [] as number[] };
  for (const c of cards) levelH[c.side][c.level] = Math.max(levelH[c.side][c.level] ?? 0, c.h);
  const stack = (side: 'above' | 'below', level: number) => {
    let d = CONN;
    for (let l = 0; l < level; l++) d += (levelH[side][l] ?? 0) + LEVEL_GAP;
    return d;
  };
  const aboveH = levelH.above.length ? stack('above', levelH.above.length - 1) + levelH.above[levelH.above.length - 1]! : 20;
  const belowH = levelH.below.length ? stack('below', levelH.below.length - 1) + levelH.below[levelH.below.length - 1]! : 20;

  const phases = spec.phases ?? [];
  const phaseLines = phases.map((p) => {
    const [a, b] = phaseRange(p);
    return wrapPx(p.label, (b - a) * px - 16, PHASE_SIZE).length;
  });
  const headH = phases.length ? textHeight(Math.max(...phaseLines), PHASE_SIZE) + 22 : 0;
  const top = spec.title ? 72 : 30;
  const axisTop = top + headH + aboveH;
  const axisBottom = axisTop + BAND_H;
  const bottom = axisBottom + belowH + 20;

  // ---- draw ----
  const X = (u: number) => (u - lo) * px;
  phases.forEach((p, i) => {
    const [a, b] = phaseRange(p);
    const fill = p.fill ?? laneFills[i % laneFills.length]!;
    s.rect(X(a), top, X(b) - X(a), bottom - top, { fill, stroke: colour.none, roughness: 0, width: 1 });
    s.text(p.label, (X(a) + X(b)) / 2, top + 10, { size: PHASE_SIZE, align: 'center', maxPx: (b - a) * px - 16 });
  });
  const cardL = Math.min(...cards.map((c) => c.x - c.w / 2));
  const cardR = Math.max(...cards.map((c) => c.x + c.w / 2));
  // The band covers every card and every tick label.
  const tickSpan = slots ? [] : scaleTicks.map((t) => [X(t.at) - measure(t.label, TICK_SIZE) / 2, X(t.at) + measure(t.label, TICK_SIZE) / 2] as const);
  const ax0 = Math.min(X(lo), cardL, ...tickSpan.map((t) => t[0] - 8)) - 16;
  const ax1 = Math.max(X(hi), cardR, ...tickSpan.map((t) => t[1] + 8)) + 16;
  s.rect(ax0, axisTop, ax1 - ax0, BAND_H, { fill: colour.white, width: 2 });
  const tick = (x: number) => {
    s.line(x, axisTop, x, axisTop + 7, { width: 1.5 });
    s.line(x, axisBottom - 7, x, axisBottom, { width: 1.5 });
  };
  const ty = axisTop + (BAND_H - textHeight(1, TICK_SIZE)) / 2;
  if (slots) {
    slotLabels.forEach((l, i) => s.text(l, X(i + 0.5), ty, { size: TICK_SIZE, align: 'center' }));
    for (let i = 0; i <= slotLabels.length; i++) tick(X(i));
  } else {
    for (const t of scaleTicks) {
      tick(X(t.at));
      s.text(t.label, X(t.at), ty, { size: TICK_SIZE, align: 'center' });
    }
  }

  for (const c of cards) {
    const d = stack(c.side, c.level);
    const y = c.side === 'above' ? axisTop - d - c.h : axisBottom + d;
    const near = c.side === 'above' ? y + c.h : y;
    const edge = c.side === 'above' ? axisTop : axisBottom;
    const dir = c.side === 'above' ? -1 : 1;
    let root = edge;
    if (c.ev.milestone) {
      const dy = c.side === 'above' ? edge - DIAMOND - 1 : edge + 1;
      const dm: El = s.node('diamond', c.x - DIAMOND / 2, dy, DIAMOND, DIAMOND, '', { fill: colour.yellow });
      dm.height = DIAMOND; // an empty diamond keeps the size asked for (Scene.node sizes for a label)
      root = edge + dir * (DIAMOND + 1);
    }
    s.line(c.x, root, c.x, near, { width: 1.5 });
    const fill = c.ev.fill ?? (c.ev.milestone ? colour.yellow : colour.white);
    if (!c.ev.text) {
      s.node('box', c.x - c.w / 2, y, c.w, c.h, c.ev.title, { size, fill, bold: c.ev.milestone });
      continue;
    }
    // Title bound to the card at its top; the detail is a second, smaller text under it, grouped with
    // the card so they move together in excalidraw.com, and tagged so the fit check keeps it inside.
    const card = s.node('box', c.x - c.w / 2, y, c.w, c.h, '', { fill, bold: c.ev.milestone });
    const title = s.text(c.ev.title, 0, 0, { size, align: 'center', container: card, maxPx: maxW - 28, valign: 'top' });
    const detail = s.text(c.ev.text, c.x, y + TEXT_PAD + c.titleH + DETAIL_GAP, { size: dsize, align: 'center', colour: DETAIL_INK, maxPx: maxW - 28, role: 'node-label' });
    detail.customData = { role: 'node-label', in: card.id };
    for (const e of [card, title, detail]) e.groupIds = [`${card.id}-card`];
  }

  const b = s.bounds();
  const dx = 30 - b.x;
  for (const e of s.elements) e.x += dx;
  if (spec.title) s.title(30, 20, spec.title);
  return s;
}

/** Order candidate (side, level) pairs: preferred side at levels 0 and 1 first, then the other side. */
function rank([side, level]: ['above' | 'below', number], pref: 'above' | 'below'): number {
  const mine = side === pref;
  if (mine && level <= 1) return level;
  if (!mine && level <= 1) return 2 + level;
  return 4 + level * 2 + (mine ? 0 : 1);
}

/** Can card c go at this side and level, given the cards already placed? */
function fits(c: Card, side: 'above' | 'below', level: number, placed: Card[]): boolean {
  const l = c.x - c.w / 2;
  const r = c.x + c.w / 2;
  for (const o of placed) {
    if (o.side !== side) continue;
    const ol = o.x - o.w / 2;
    const or = o.x + o.w / 2;
    if (o.level === level && l < or + CARD_GAP && ol < r + CARD_GAP) return false;
    // c's connector runs past every nearer level; it must miss the cards there.
    if (o.level < level && c.x > ol - CLEAR && c.x < or + CLEAR) return false;
    // A farther card's connector runs past c's level; c must not cover it.
    if (o.level > level && o.x > l - CLEAR && o.x < r + CLEAR) return false;
  }
  return true;
}
