// sequence(): UML-style sequence diagrams. Participants across the top, dashed lifelines down from
// each, and messages as horizontal arrows between lifelines in the order given: solid for calls,
// dashed for replies, a small loop on the right of the lifeline for a message to self. Activation
// bars, notes and grouping frames (loop, alt with else sections, opt, par) are optional.
//
// Spacing is measured, not guessed. Every message label sits on a white plate just above its arrow,
// centred over the arrow when it clears every lifeline there, else in the gap next to the sender;
// that gap grows until the label fits with the activation bars cleared on both sides. Self-message labels, side notes and participant boxes add their own
// requirements, and a note spanning several lifelines spreads any extra width over its gaps. Each
// row is as tall as its wrapped label. Lifelines break where a frame tag, else guard or note sits on
// them, so no text ever has a line through it.
import { measure, textHeight, wrapPx } from '../font.ts';
import { colour, type El, innerWidth, type Kind, neededHeight, Scene } from '../scene.ts';

export interface SequenceParticipant {
  id: string;
  text: string;
  /** Shape of the header: 'box' (default), 'pill' for an actor or person, 'store' for a database. */
  kind?: Kind;
  fill?: string;
}

export interface SequenceMessage {
  from: string;
  /** The receiver; the same as `from` draws a message to self. */
  to: string;
  text?: string;
  /** A reply: dashed. A reply from a participant with an open activation bar closes that bar. */
  reply?: boolean;
  /** Open an activation bar on the receiver from this message (closed by its next reply). */
  activate?: boolean;
  colour?: string;
}

export interface SequenceNote {
  note: string;
  /** One participant, or two to span the note from the first lifeline to the second. */
  at: string | [string, string];
  /** With one participant: over its lifeline (default), or to its left or right. */
  side?: 'over' | 'left' | 'right';
  fill?: string;
}

export interface SequenceFrame {
  /** The operator in the frame's tag: loop, alt, opt, par, critical, … */
  frame: string;
  /** Guard or description beside the tag, e.g. "[token expired]". */
  label?: string;
  steps: SequenceStep[];
  /** Further sections below a dashed divider, each with its own guard (alt's else branches). */
  else?: Array<{ label?: string; steps: SequenceStep[] }>;
  fill?: string;
}

export type SequenceStep = SequenceMessage | SequenceNote | SequenceFrame;

export interface SequenceSpec {
  title?: string;
  participants: SequenceParticipant[];
  steps: SequenceStep[];
  /** Widest a message label runs before it wraps (default 200). */
  labelMaxPx?: number;
  /** Smallest distance between neighbouring lifelines (default 150). */
  minGap?: number;
  /** Message label size (default 14). */
  labelSize?: number;
}

const BAR = 12; // activation bar width
const NEST = 6; // each nested bar moves this far right
const CLEAR = 26; // a label stays this far from a lifeline (clears two nested bars)
const SELF_W = 32; // how far a self-message loop reaches right of its lifeline
const NOTE_MAX = 200;
const NOTE_SIZE = 15;
const ROW_GAP = 16; // below each arrow
const FRAME_PAD = 16; // frame edge beyond the outermost thing it holds
const TAG_SIZE = 15;
const GUARD_SIZE = 14;

const isFrame = (s: SequenceStep): s is SequenceFrame => 'frame' in s;
const isNote = (s: SequenceStep): s is SequenceNote => 'note' in s;

/** Plate size exactly as Scene.plate draws it. */
function plateSize(label: string, size: number, maxPx: number): { w: number; h: number } {
  const lines = wrapPx(label, maxPx, size);
  return { w: Math.max(...lines.map((l) => measure(l, size))) + 12, h: textHeight(lines.length, size) + 6 };
}

/** A note box: text wrapped at NOTE_MAX, box width to fit. */
function noteSize(text: string, minW = 0): { w: number; h: number } {
  const lines = wrapPx(text, NOTE_MAX, NOTE_SIZE);
  const w = Math.max(minW, Math.max(...lines.map((l) => measure(l, NOTE_SIZE))) + 30);
  return { w, h: neededHeight('note', w, text, NOTE_SIZE) };
}

/** Header width for a participant of this kind: one line up to 200 px, wrapped beyond. */
function participantWidth(p: SequenceParticipant): number {
  const kind = p.kind ?? 'box';
  const tw = Math.min(measure(p.text, 16), 200) + 4;
  const w = kind === 'diamond' ? tw / 0.56 + 10 : kind === 'pill' || kind === 'circle' ? tw / 0.72 + 12 : tw + 28 + 16;
  const out = Math.max(120, w);
  return innerWidth(kind, out) > 0 ? out : 120;
}

interface Bar {
  p: number;
  level: number;
  y0: number;
  y1: number;
}

interface FrameBox {
  depth: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  frame: string;
  label?: string;
  fill?: string;
  elses: Array<{ y: number; label?: string }>;
}

/** Lay out a sequence diagram and return the scene. */
export function sequence(spec: SequenceSpec): Scene {
  const s = new Scene();
  const LS = spec.labelSize ?? 14;
  const LMAX = spec.labelMaxPx ?? 200;
  const ps = spec.participants;
  const n = ps.length;
  if (n === 0) throw new Error('sequence: no participants');
  const idx = new Map<string, number>();
  ps.forEach((p, i) => {
    if (idx.has(p.id)) throw new Error(`sequence: participant id "${p.id}" is used twice`);
    idx.set(p.id, i);
  });
  const at = (id: string, where: string) => {
    const i = idx.get(id);
    if (i === undefined) throw new Error(`sequence: ${where} names unknown participant "${id}"`);
    return i;
  };

  // ---- pass 1: horizontal requirements ----
  const pw = ps.map(participantWidth);
  const gap: number[] = Array.from({ length: Math.max(0, n - 1) }, (_, i) => Math.max(spec.minGap ?? 150, (pw[i]! + pw[i + 1]!) / 2 + 40));
  const spans: Array<{ a: number; b: number; need: number }> = [];
  const needGap = (g: number, w: number) => {
    if (g >= 0 && g < gap.length) gap[g] = Math.max(gap[g]!, w);
  };
  const require = (steps: SequenceStep[]) => {
    for (const st of steps) {
      if (isFrame(st)) {
        require(st.steps);
        for (const e of st.else ?? []) require(e.steps);
      } else if (isNote(st)) {
        if (Array.isArray(st.at)) {
          const a = Math.min(at(st.at[0], 'a note'), at(st.at[1], 'a note'));
          const b = Math.max(at(st.at[0], 'a note'), at(st.at[1], 'a note'));
          const { w } = noteSize(st.note);
          if (b > a) spans.push({ a, b, need: w - 2 * 30 });
        } else {
          const i = at(st.at, 'a note');
          const { w } = noteSize(st.note);
          const side = st.side ?? 'over';
          if (side === 'right') needGap(i, BAR + 8 + w + 16);
          else if (side === 'left') needGap(i - 1, BAR + 8 + w + 16);
          else {
            needGap(i, w / 2 + 16);
            needGap(i - 1, w / 2 + 16);
          }
        }
      } else {
        const f = at(st.from, 'a message');
        const t = at(st.to, 'a message');
        if (!st.text) continue;
        const { w } = plateSize(st.text, LS, LMAX);
        if (f === t) needGap(f, BAR / 2 + NEST + SELF_W + 6 + w + CLEAR);
        else needGap(f < t ? f : f - 1, w + 2 * CLEAR);
      }
    }
  };
  require(spec.steps);
  for (const sp of spans.sort((p, q) => p.b - p.a - (q.b - q.a))) {
    const have = gap.slice(sp.a, sp.b).reduce((t, g) => t + g, 0);
    if (have < sp.need) for (let g = sp.a; g < sp.b; g++) gap[g]! += (sp.need - have) / (sp.b - sp.a);
  }
  const xs: number[] = [0];
  for (let i = 1; i < n; i++) xs[i] = xs[i - 1]! + gap[i - 1]!;
  /**
   * Where a message label's centre goes: over the middle of the arrow when, there, it clears every
   * lifeline the arrow spans (its own ends included) by CLEAR; otherwise in the gap beside the
   * sender, which pass 1 sized to hold it.
   */
  const labelX = (f: number, t: number, w: number) => {
    const mid = (xs[f]! + xs[t]!) / 2;
    const lo = Math.min(f, t);
    const hi = Math.max(f, t);
    let clear = true;
    for (let k = lo; k <= hi; k++) if (Math.abs(xs[k]! - mid) < w / 2 + CLEAR) clear = false;
    if (clear) return mid;
    const dir = t > f ? 1 : -1;
    return (xs[f]! + xs[f + dir]!) / 2;
  };

  // ---- participants ----
  const top = spec.title ? 72 : 30;
  const ph = Math.max(56, ...ps.map((p, i) => neededHeight(p.kind ?? 'box', pw[i]!, p.text, 16)));
  const heads: El[] = ps.map((p, i) => s.node(p.kind ?? 'box', xs[i]! - pw[i]! / 2, top, pw[i]!, ph, p.text, { fill: p.fill ?? (p.kind === 'pill' ? colour.blue : colour.paper) }));
  // Scene.node draws now, but frames and lifelines must sit behind; move the heads to the end later.
  const headEls = s.elements.splice(0);

  // ---- pass 2: rows ----
  type Msg = { st: SequenceMessage; f: number; t: number; y: number; x1: number; x2: number; loopH: number };
  const msgs: Msg[] = [];
  const notes: Array<{ st: SequenceNote; x: number; y: number; w: number; h: number }> = [];
  const frames: FrameBox[] = [];
  const bars: Bar[] = [];
  const open: Bar[][] = ps.map(() => []);
  const skips: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];

  /** The x a message leaves or reaches participant p from, facing direction dir (+1 right, -1 left). */
  const edgeX = (p: number, dir: number) => {
    const st = open[p]!;
    if (st.length === 0) return xs[p]!;
    const lv = st[st.length - 1]!.level;
    const left = xs[p]! - BAR / 2 + lv * NEST;
    return dir > 0 ? left + BAR : left;
  };

  let y = top + ph + 24;
  type Ext = { min: number; max: number };
  const grow = (e: Ext, a: number, b: number) => {
    e.min = Math.min(e.min, a);
    e.max = Math.max(e.max, b);
  };

  const place = (steps: SequenceStep[], depth: number, ext: Ext) => {
    for (const st of steps) {
      if (isFrame(st)) {
        const fb: FrameBox = { depth, x0: 0, x1: 0, y0: y, y1: 0, frame: st.frame, label: st.label, fill: st.fill, elses: [] };
        frames.push(fb);
        const tagH = textHeight(1, TAG_SIZE) + 8;
        y += tagH + 10;
        const inner: Ext = { min: Infinity, max: -Infinity };
        // Sections are alternatives: each starts from the activation state the frame began with.
        const before = open.map((stack) => [...stack]);
        place(st.steps, depth + 1, inner);
        for (const e of st.else ?? []) {
          const ey = y - ROW_GAP / 2 + 4;
          fb.elses.push({ y: ey, label: e.label });
          open.forEach((stack, p) => {
            for (const b of stack) if (!before[p]!.includes(b)) b.y1 = ey - 2;
            open[p] = before[p]!.map((b) => {
              if (stack.includes(b)) return b;
              const again: Bar = { p, level: b.level, y0: ey + 2, y1: 0 };
              bars.push(again);
              return again;
            });
          });
          y = ey + (e.label ? textHeight(1, GUARD_SIZE) + 14 : 10);
          place(e.steps, depth + 1, inner);
        }
        fb.y1 = y - ROW_GAP / 2 + 8;
        y = fb.y1 + 14;
        fb.x0 = inner.min - FRAME_PAD;
        fb.x1 = inner.max + FRAME_PAD;
        // The header (tag + guard) must fit across the top.
        const head = measure(st.frame, TAG_SIZE) + 16 + 12 + (st.label ? measure(st.label, GUARD_SIZE) + 14 : 0);
        fb.x1 = Math.max(fb.x1, fb.x0 + head + 12);
        grow(ext, fb.x0, fb.x1);
        continue;
      }
      if (isNote(st)) {
        let x0: number;
        let w: number;
        let h: number;
        if (Array.isArray(st.at)) {
          const a = Math.min(at(st.at[0], 'a note'), at(st.at[1], 'a note'));
          const b = Math.max(at(st.at[0], 'a note'), at(st.at[1], 'a note'));
          ({ w, h } = noteSize(st.note, xs[b]! - xs[a]! + 60));
          x0 = (xs[a]! + xs[b]!) / 2 - w / 2;
        } else {
          const i = at(st.at, 'a note');
          ({ w, h } = noteSize(st.note));
          const side = st.side ?? 'over';
          x0 = side === 'right' ? xs[i]! + BAR / 2 + 8 : side === 'left' ? xs[i]! - BAR / 2 - 8 - w : xs[i]! - w / 2;
        }
        const ny = y + 2;
        notes.push({ st, x: x0, y: ny, w, h });
        skips.push({ x0, x1: x0 + w, y0: ny - 2, y1: ny + h + 2 });
        grow(ext, x0, x0 + w);
        y = ny + h + ROW_GAP;
        continue;
      }
      const f = at(st.from, 'a message');
      const t = at(st.to, 'a message');
      const plate = st.text ? plateSize(st.text, LS, LMAX) : { w: 0, h: 0 };
      if (f === t) {
        const loopH = Math.max(26, plate.h + 2);
        const my = y + Math.max(6, (plate.h - loopH) / 2 + 2);
        const x1 = edgeX(f, 1);
        // A reply to self returns from a nested call: it closes the innermost bar.
        if (st.reply && open[f]!.length) open[f]!.pop()!.y1 = my + 4;
        if (st.activate) {
          const b: Bar = { p: f, level: open[f]!.length, y0: my + loopH - 6, y1: 0 };
          open[f]!.push(b);
          bars.push(b);
        }
        const x2 = edgeX(f, 1);
        msgs.push({ st, f, t, y: my, x1, x2, loopH });
        grow(ext, xs[f]! - BAR, x1 + SELF_W + 6 + plate.w);
        y = my + loopH + ROW_GAP;
        continue;
      }
      const dir = t > f ? 1 : -1;
      const my = y + (st.text ? plate.h + 4 : 8);
      const x1 = edgeX(f, dir);
      if (st.reply && open[f]!.length) open[f]!.pop()!.y1 = my + 4;
      if (st.activate) {
        const b: Bar = { p: t, level: open[t]!.length, y0: my - 4, y1: 0 };
        open[t]!.push(b);
        bars.push(b);
      }
      const x2 = edgeX(t, -dir);
      msgs.push({ st, f, t, y: my, x1, x2, loopH: 0 });
      grow(ext, Math.min(xs[f]!, xs[t]!) - BAR, Math.max(xs[f]!, xs[t]!) + BAR);
      y = my + ROW_GAP;
    }
  };
  place(spec.steps, 0, { min: Infinity, max: -Infinity });
  const end = y + 10;
  for (const st of open) for (const b of st) b.y1 = end - 14;

  // Frames nest: an outer frame must clear every frame inside it.
  for (const fb of [...frames].sort((a, b) => b.depth - a.depth)) {
    for (const inner of frames) {
      if (inner === fb || inner.depth <= fb.depth || inner.y0 < fb.y0 || inner.y1 > fb.y1) continue;
      fb.x0 = Math.min(fb.x0, inner.x0 - 12);
      fb.x1 = Math.max(fb.x1, inner.x1 + 12);
    }
  }

  // ---- draw, back to front ----
  const tags: Array<() => void> = [];
  const fills = { loop: '#e7f5ff', alt: '#fff9db', opt: '#f3f0ff', par: '#e6fcf5', critical: '#fff4e6' } as Record<string, string>;
  for (const fb of [...frames].sort((a, b) => a.depth - b.depth)) {
    fb.fill ??= fills[fb.frame] ?? '#f8f0fc';
    // UML frames have square corners, so the tag sits snug in the top-left corner.
    s.band(fb.x0, fb.y0, fb.x1 - fb.x0, fb.y1 - fb.y0, '', fb.fill).roundness = null;
    const tw = measure(fb.frame, TAG_SIZE) + 16;
    const th = textHeight(1, TAG_SIZE) + 8;
    skips.push({ x0: fb.x0, x1: fb.x0 + tw + 10 + (fb.label ? 12 + measure(fb.label, GUARD_SIZE) + 4 : 0), y0: fb.y0, y1: fb.y0 + th + 2 });
    for (const e of fb.elses) {
      if (e.label) skips.push({ x0: fb.x0 + 8, x1: fb.x0 + 14 + measure(e.label, GUARD_SIZE) + 6, y0: e.y + 2, y1: e.y + 6 + textHeight(1, GUARD_SIZE) + 2 });
    }
    tags.push(() => {
      // UML frame tag: a pentagon in the top-left corner holding the operator.
      s.line(fb.x0, fb.y0 + th, fb.x0 + tw, fb.y0 + th, { width: 1.5, more: [[fb.x0 + tw + 10, fb.y0 + th - 10], [fb.x0 + tw + 10, fb.y0]] });
      s.text(fb.frame, fb.x0 + 8, fb.y0 + 4, { size: TAG_SIZE, role: 'band-label' });
      if (fb.label) s.text(fb.label, fb.x0 + tw + 22, fb.y0 + 4 + (TAG_SIZE - GUARD_SIZE) * 0.6, { size: GUARD_SIZE, role: 'band-label' });
      for (const e of fb.elses) {
        s.line(fb.x0, e.y, fb.x1, e.y, { dashed: true, colour: colour.grey, width: 1.5 });
        if (e.label) s.text(e.label, fb.x0 + 12, e.y + 6, { size: GUARD_SIZE, role: 'band-label' });
      }
    });
  }

  // Lifelines, broken under bars, notes, frame tags and guards; bars broken under the text.
  const textSkips = [...skips];
  bars.forEach((b) => skips.push({ x0: xs[b.p]! - BAR / 2 + b.level * NEST, x1: xs[b.p]! + BAR / 2 + b.level * NEST, y0: b.y0, y1: b.y1 }));
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const cuts = skips.filter((k) => k.x0 - 2 <= x && x <= k.x1 + 2).sort((a, b) => a.y0 - b.y0);
    let from = top + ph;
    for (const k of cuts) {
      if (k.y0 - from > 6) s.line(x, from, x, k.y0 - 2, { dashed: true, colour: colour.grey, width: 1.5 });
      from = Math.max(from, k.y1 + 2);
    }
    if (end - from > 6) s.line(x, from, x, end, { dashed: true, colour: colour.grey, width: 1.5 });
  }
  for (const b of bars.sort((a, c) => a.level - c.level)) {
    const bx = xs[b.p]! - BAR / 2 + b.level * NEST;
    const y1 = Math.max(b.y0 + 10, b.y1);
    const cuts = textSkips.filter((k) => k.x0 < bx + BAR && bx < k.x1 && k.y0 < y1 && b.y0 < k.y1).sort((p, q) => p.y0 - q.y0);
    let from = b.y0;
    for (const k of cuts) {
      if (k.y0 - 2 - from >= 6) s.rect(bx, from, BAR, k.y0 - 2 - from, { fill: colour.white, width: 1.5 });
      from = Math.max(from, k.y1 + 2);
    }
    if (y1 - from >= 6) s.rect(bx, from, BAR, y1 - from, { fill: colour.white, width: 1.5 });
  }
  for (const nt of notes) s.node('note', nt.x, nt.y, nt.w, nt.h, nt.st.note, { size: NOTE_SIZE, fill: nt.st.fill ?? '#fff9db' });
  s.elements.push(...headEls);

  // A label plate takes the colour of the innermost frame behind it, so it reads as text, not a white box.
  const tint = (arrow: El) => {
    const plate = s.elements.find((e) => (e.customData as { arrow?: string } | undefined)?.arrow === arrow.id);
    if (!plate) return;
    const cx = plate.x + plate.width / 2;
    const cy = plate.y + plate.height / 2;
    const behind = frames.filter((f) => f.x0 <= cx && cx <= f.x1 && f.y0 <= cy && cy <= f.y1).sort((a, b) => b.depth - a.depth)[0];
    if (behind?.fill) plate.backgroundColor = behind.fill;
  };
  for (const m of msgs) {
    const from = heads[m.f]!;
    const to = heads[m.t]!;
    const label = m.st.text;
    if (m.f === m.t) {
      const lx = m.x1 + SELF_W;
      const pl = label ? plateSize(label, LS, LMAX) : { w: 0, h: 0 };
      const arrow = s.arrow(from, to, {
        startAt: [m.x1, m.y],
        endAt: [m.x2, m.y + m.loopH],
        via: [[lx, m.y], [lx, m.y + m.loopH]],
        dashed: m.st.reply,
        colour: m.st.colour,
        label,
        labelSize: LS,
        labelMaxPx: LMAX,
        labelAt: [lx + 6 + pl.w / 2, m.y + m.loopH / 2]
      });
      tint(arrow);
      // A self-message names its participant at both ends; list the arrow once.
      from.boundElements = [...new Map(((from.boundElements as Array<{ id: string }>) ?? []).map((b) => [b.id, b])).values()];
      continue;
    }
    const dir = m.t > m.f ? 1 : -1;
    const pl = label ? plateSize(label, LS, LMAX) : { w: 0, h: 0 };
    const lx = labelX(m.f, m.t, pl.w);
    const arrow = s.arrow(from, to, {
      startAt: [m.x1, m.y],
      endAt: [m.x2, m.y],
      dashed: m.st.reply,
      colour: m.st.colour,
      label,
      labelSize: LS,
      labelMaxPx: LMAX,
      labelAt: [lx, m.y - 3 - pl.h / 2]
    });
    tint(arrow);
  }
  for (const t of tags) t();

  // Shift so the drawing starts at x = 30, then title it.
  const b = s.bounds();
  const dx = 30 - b.x;
  for (const e of s.elements) e.x += dx;
  if (spec.title) s.title(30, 20, spec.title);
  return s;
}
