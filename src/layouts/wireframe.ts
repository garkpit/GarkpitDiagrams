// Wireframe kit: low-fi UI drawn on a Scene. Every helper takes the scene and a box and draws inside
// that box, so screens compose from boxes: split a box with `stack` and `row`, inset it with `inset`,
// and hand the pieces to the helpers. Frames (browser, phone, card) return the content box inside
// them. Text is measured in Excalifont and cut short with an ellipsis rather than spill out; labelled
// controls (buttons, tabs, markers) bind their text to the shape, so the fit check verifies them.
// Callouts put numbered markers on the UI and notes in a margin column, joined by dashed lines.
import { measure, textHeight } from '../font.ts';
import { colour, type El, type Scene } from '../scene.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Smallest text the kit draws; keeps a full screen legible once printed on A4. */
export const WF_TEXT = 16;
export const WF_SMALL = 15;
const LINK = colour.blueDark;
const FAINT = '#ced4da';

// ---- box arithmetic ----

export const inset = (b: Box, dx: number, dy = dx): Box => ({ x: b.x + dx, y: b.y + dy, w: b.w - 2 * dx, h: b.h - 2 * dy });

/** Split a box top to bottom into rows of the given heights (a negative height takes a share of what is left). */
export function stack(b: Box, heights: number[], gap = 12): Box[] {
  const fixed = heights.filter((h) => h >= 0).reduce((t, h) => t + h, 0) + gap * (heights.length - 1);
  const flex = heights.filter((h) => h < 0).reduce((t, h) => t - h, 0);
  if (fixed > b.h + 0.5) throw new Error(`wireframe stack: rows need ${Math.ceil(fixed)} px but the box is ${Math.floor(b.h)} px tall; make the box taller or the rows shorter`);
  let y = b.y;
  return heights.map((h) => {
    const hh = h >= 0 ? h : ((b.h - fixed) * -h) / flex;
    const out = { x: b.x, y, w: b.w, h: hh };
    y += hh + gap;
    return out;
  });
}

/** Split a box left to right into columns of the given widths (negative = a share of what is left). */
export function row(b: Box, widths: number[], gap = 12): Box[] {
  const fixed = widths.filter((w) => w >= 0).reduce((t, w) => t + w, 0) + gap * (widths.length - 1);
  const flex = widths.filter((w) => w < 0).reduce((t, w) => t - w, 0);
  if (fixed > b.w + 0.5) throw new Error(`wireframe row: columns need ${Math.ceil(fixed)} px but the box is ${Math.floor(b.w)} px wide`);
  let x = b.x;
  return widths.map((w) => {
    const ww = w >= 0 ? w : ((b.w - fixed) * -w) / flex;
    const out = { x, y: b.y, w: ww, h: b.h };
    x += ww + gap;
    return out;
  });
}

/** The text cut to fit `maxPx` (measured), with an ellipsis when it had to be cut. */
export function fitText(text: string, maxPx: number, size: number): string {
  if (measure(text, size) <= maxPx) return text;
  let t = text;
  while (t.length > 1 && measure(`${t}…`, size) > maxPx) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// ---- small private primitives built from Scene's public methods ----

function ellipse(s: Scene, x: number, y: number, w: number, h: number, fill: string, stroke: string = colour.ink, width = 2): El {
  const e = s.rect(x, y, w, h, { fill, stroke, width, roughness: 0.6 });
  e.type = 'ellipse';
  e.roundness = null;
  return e;
}

/** One line of text vertically centred in a box, left/centre/right aligned, cut to fit. */
function label(s: Scene, b: Box, text: string, o: { size?: number; align?: 'left' | 'center' | 'right'; colour?: string; pad?: number } = {}): El {
  const size = o.size ?? WF_TEXT;
  const pad = o.pad ?? 0;
  const t = fitText(text, b.w - 2 * pad - 2, size);
  const y = b.y + (b.h - textHeight(1, size)) / 2;
  const x = o.align === 'center' ? b.x + b.w / 2 : o.align === 'right' ? b.x + b.w - pad : b.x + pad;
  return s.text(t, x, y, { size, align: o.align ?? 'left', colour: o.colour });
}

/** A shape with its text bound inside (fit-checked), cut to fit. */
function boxed(s: Scene, b: Box, text: string, o: { fill?: string; stroke?: string; size?: number; rounded?: boolean; dashed?: boolean; width?: number }): El {
  const size = o.size ?? WF_TEXT;
  const r = s.rect(b.x, b.y, b.w, b.h, { fill: o.fill ?? colour.white, stroke: o.stroke ?? colour.ink, rounded: o.rounded ?? true, dashed: o.dashed, width: o.width });
  s.text(fitText(text, b.w - 20, size), 0, 0, { size, align: 'center', container: r });
  return r;
}

// ---- frames ----

/** A desktop browser window: tab strip with the page title, address bar with the URL. Returns the page box. */
export function browserFrame(s: Scene, b: Box, o: { title?: string; url?: string } = {}): Box {
  const TAB = 40;
  const ADDR = 44;
  s.rect(b.x, b.y, b.w, b.h, { fill: colour.white, rounded: true });
  s.rect(b.x + 1, b.y + 1, b.w - 2, TAB - 1, { fill: colour.paper, stroke: colour.none, roughness: 0 });
  ['#ff8787', '#ffd43b', '#69db7c'].forEach((f, i) => ellipse(s, b.x + 16 + i * 20, b.y + TAB / 2 - 6, 12, 12, f, colour.ink, 1));
  if (o.title) {
    const tw = Math.min(260, Math.max(140, measure(o.title, WF_SMALL) + 36));
    const tab = s.rect(b.x + 84, b.y + 8, tw, TAB - 8, { fill: colour.white, rounded: true, width: 1 });
    label(s, { x: tab.x, y: tab.y, w: tw, h: tab.height }, o.title, { size: WF_SMALL, pad: 14 });
  }
  s.line(b.x, b.y + TAB, b.x + b.w, b.y + TAB, { width: 1, colour: colour.grey });
  const ay = b.y + TAB;
  label(s, { x: b.x + 14, y: ay, w: 50, h: ADDR }, '<  >', { size: 18, colour: colour.grey });
  const field: Box = { x: b.x + 70, y: ay + 8, w: b.w - 86, h: ADDR - 16 };
  s.rect(field.x, field.y, field.w, field.h, { fill: colour.paper, stroke: FAINT, rounded: true, width: 1 });
  if (o.url) label(s, field, o.url, { size: WF_SMALL, colour: colour.grey, pad: 12 });
  s.line(b.x, ay + ADDR, b.x + b.w, ay + ADDR, { width: 1, colour: colour.grey });
  return { x: b.x, y: ay + ADDR, w: b.w, h: b.h - TAB - ADDR };
}

/** A phone: rounded body, status bar with the time, notch and home indicator. Returns the screen box. */
export function phoneFrame(s: Scene, b: Box, o: { time?: string } = {}): Box {
  const STATUS = 40;
  const HOME = 28;
  s.rect(b.x, b.y, b.w, b.h, { fill: colour.white, rounded: true, width: 3 });
  label(s, { x: b.x + 28, y: b.y + 8, w: 60, h: STATUS - 8 }, o.time ?? '9:41', { size: WF_SMALL });
  s.rect(b.x + b.w / 2 - 44, b.y + 12, 88, 22, { fill: colour.ink, stroke: colour.ink, rounded: true, roughness: 0.3 });
  s.rect(b.x + b.w - 52, b.y + 18, 24, 11, { stroke: colour.ink, width: 1, roughness: 0.3 });
  s.rect(b.x + b.w - 50, b.y + 20, 15, 7, { fill: colour.ink, stroke: colour.none, roughness: 0 });
  s.rect(b.x + b.w / 2 - 50, b.y + b.h - HOME / 2 - 3, 100, 6, { fill: colour.ink, stroke: colour.ink, rounded: true, roughness: 0.3 });
  return { x: b.x + 4, y: b.y + STATUS + 4, w: b.w - 8, h: b.h - STATUS - HOME - 8 };
}

/** A card: a rounded panel with an optional heading. Returns the box inside its padding (below the heading). */
export function card(s: Scene, b: Box, o: { title?: string; pad?: number; fill?: string; titleSize?: number } = {}): Box {
  const pad = o.pad ?? 20;
  s.rect(b.x, b.y, b.w, b.h, { fill: o.fill ?? colour.white, rounded: true });
  if (!o.title) return inset(b, pad);
  const size = o.titleSize ?? 22;
  const th = textHeight(1, size);
  s.text(fitText(o.title, b.w - 2 * pad, size), b.x + pad, b.y + pad, { size });
  return { x: b.x + pad, y: b.y + pad + th + 14, w: b.w - 2 * pad, h: b.h - 2 * pad - th - 14 };
}

// ---- controls ----

/** A top bar: brand at the left, links and an optional call-to-action button at the right. */
export function navBar(s: Scene, b: Box, o: { brand: string; links?: string[]; cta?: string; fill?: string }): void {
  s.rect(b.x, b.y, b.w, b.h, { fill: o.fill ?? colour.paper, stroke: colour.none, roughness: 0 });
  s.line(b.x, b.y + b.h, b.x + b.w, b.y + b.h, { width: 1, colour: FAINT });
  const brandW = measure(o.brand, 20) + 4;
  label(s, { x: b.x + 20, y: b.y, w: brandW + 4, h: b.h }, o.brand, { size: 20 });
  let right = b.x + b.w - 20;
  if (o.cta) {
    const w = measure(o.cta, WF_SMALL) + 32;
    button(s, { x: right - w, y: b.y + (b.h - 34) / 2, w, h: 34 }, o.cta, { size: WF_SMALL });
    right -= w + 24;
  }
  for (const l of [...(o.links ?? [])].reverse()) {
    const w = measure(l, WF_SMALL) + 4;
    if (right - w < b.x + 20 + brandW + 24) break;
    label(s, { x: right - w, y: b.y, w: w + 2, h: b.h }, l, { size: WF_SMALL, colour: colour.ink });
    right -= w + 24;
  }
}

/** A button; primary buttons are filled. */
export function button(s: Scene, b: Box, text: string, o: { primary?: boolean; size?: number; fill?: string } = {}): El {
  return boxed(s, b, text, { fill: o.fill ?? (o.primary ? colour.blue : colour.white), size: o.size, width: o.primary ? 2 : 1.5 });
}

/** Height a text input needs: the field, plus its label above when there is one. */
export const inputHeight = (withLabel = true) => (withLabel ? textHeight(1, WF_SMALL) + 6 : 0) + 42;

/** A text input with an optional label above; shows the value, or the placeholder in grey; `password` shows dots. Returns the field. */
export function textInput(s: Scene, b: Box, o: { label?: string; placeholder?: string; value?: string; password?: boolean; trailing?: string } = {}): El {
  let top = b.y;
  if (o.label) {
    s.text(fitText(o.label, b.w, WF_SMALL), b.x, b.y, { size: WF_SMALL });
    top += textHeight(1, WF_SMALL) + 6;
  }
  const f = s.rect(b.x, top, b.w, b.y + b.h - top, { fill: colour.white, rounded: true, width: 1.5 });
  const inner: Box = { x: b.x, y: top, w: b.w, h: f.height };
  let tw = inner.w;
  if (o.trailing) {
    const w = measure(o.trailing, WF_SMALL) + 4;
    label(s, { x: inner.x + inner.w - 12 - w, y: inner.y, w: w + 2, h: inner.h }, o.trailing, { size: WF_SMALL, colour: LINK });
    tw -= w + 16;
  }
  const shown = o.value ? (o.password ? '•'.repeat(Math.min(12, o.value.length)) : o.value) : o.placeholder;
  if (shown) label(s, { ...inner, w: tw }, shown, { size: WF_SMALL, colour: o.value ? colour.ink : colour.grey, pad: 12 });
  return f;
}

/** A checkbox with its label; returns the box it used. */
export function checkbox(s: Scene, b: Box, text: string, o: { checked?: boolean } = {}): Box {
  const sz = 18;
  const y = b.y + (b.h - sz) / 2;
  s.rect(b.x, y, sz, sz, { fill: colour.white, width: 1.5, rounded: false });
  if (o.checked) s.line(b.x + 4, y + 9, b.x + 8, y + 14, { more: [[b.x + 15, y + 4]], width: 2 });
  label(s, { x: b.x + sz + 10, y: b.y, w: b.w - sz - 10, h: b.h }, text, { size: WF_SMALL });
  return { x: b.x, y: b.y, w: Math.min(b.w, sz + 12 + measure(text, WF_SMALL)), h: b.h };
}

/** A link: underlined blue text, left-aligned in the box (or centred). */
export function link(s: Scene, b: Box, text: string, o: { align?: 'left' | 'center' | 'right'; size?: number } = {}): El {
  const size = o.size ?? WF_SMALL;
  const t = label(s, b, text, { size, colour: LINK, align: o.align });
  s.line(t.x, t.y + t.height - 1, t.x + t.width - 2, t.y + t.height - 1, { width: 1, colour: LINK });
  return t;
}

/** An image placeholder: a box with a cross through it. */
export function imagePlaceholder(s: Scene, b: Box, o: { caption?: string } = {}): void {
  s.rect(b.x, b.y, b.w, b.h, { fill: colour.paper, stroke: colour.grey, width: 1.5 });
  s.line(b.x, b.y, b.x + b.w, b.y + b.h, { width: 1, colour: colour.grey });
  s.line(b.x + b.w, b.y, b.x, b.y + b.h, { width: 1, colour: colour.grey });
  if (o.caption) {
    const w = Math.min(b.w - 20, measure(o.caption, WF_SMALL) + 24);
    const plate = s.rect(b.x + (b.w - w) / 2, b.y + b.h - 44, w, 30, { fill: colour.white, stroke: colour.none, roughness: 0 });
    label(s, { x: plate.x, y: plate.y, w, h: 30 }, o.caption, { size: WF_SMALL, colour: colour.grey, align: 'center' });
  }
}

/** Grey bars standing in for body text; the last line is shorter. */
export function textLines(s: Scene, b: Box, o: { lines?: number; gap?: number; lastShort?: boolean } = {}): void {
  const gap = o.gap ?? 22;
  const n = o.lines ?? Math.max(1, Math.floor((b.h + gap - 10) / gap));
  for (let i = 0; i < n; i++) {
    const w = i === n - 1 && (o.lastShort ?? true) && n > 1 ? b.w * 0.6 : b.w;
    s.rect(b.x, b.y + i * gap, w, 10, { fill: '#dee2e6', stroke: colour.none, rounded: true, roughness: 0 });
  }
}

/** A horizontal rule with optional centred text ("or"). */
export function divider(s: Scene, b: Box, text?: string): void {
  const y = b.y + b.h / 2;
  if (!text) {
    s.line(b.x, y, b.x + b.w, y, { width: 1, colour: FAINT });
    return;
  }
  const w = measure(text, WF_SMALL) + 24;
  s.line(b.x, y, b.x + (b.w - w) / 2, y, { width: 1, colour: FAINT });
  s.line(b.x + (b.w + w) / 2, y, b.x + b.w, y, { width: 1, colour: FAINT });
  label(s, { x: b.x + (b.w - w) / 2, y: b.y, w, h: b.h }, text, { size: WF_SMALL, colour: colour.grey, align: 'center' });
}

/** A tab strip; the active tab is white and open at the bottom, the rest are grey. */
export function tabs(s: Scene, b: Box, labels: string[], active = 0): void {
  let x = b.x;
  labels.forEach((l, i) => {
    const w = measure(l, WF_SMALL) + 36;
    boxed(s, { x, y: b.y, w, h: b.h }, l, { fill: i === active ? colour.white : colour.paper, size: WF_SMALL, rounded: false, width: 1, stroke: i === active ? colour.ink : colour.grey });
    if (i === active) s.line(x + 1, b.y + b.h, x + w - 1, b.y + b.h, { colour: colour.white, width: 3 });
    x += w + 4;
  });
  s.line(b.x, b.y + b.h, b.x + b.w, b.y + b.h, { width: 1, colour: colour.grey });
}

/** A table or list: a grey header row, then one row per entry, each cell cut to its column. */
export function listRows(s: Scene, b: Box, o: { columns: string[]; rows: string[][]; widths?: number[]; rowH?: number }): void {
  const rh = o.rowH ?? 36;
  const cols = row(b, o.widths ?? o.columns.map(() => -1), 0);
  s.rect(b.x, b.y, b.w, rh, { fill: colour.paper, stroke: colour.none, roughness: 0 });
  o.columns.forEach((c, i) => label(s, { ...cols[i]!, y: b.y, h: rh }, c, { size: WF_SMALL, pad: 12, colour: colour.grey }));
  o.rows.forEach((r, j) => {
    const y = b.y + (j + 1) * rh;
    s.line(b.x, y, b.x + b.w, y, { width: 1, colour: FAINT });
    r.forEach((cell, i) => cols[i] && label(s, { ...cols[i]!, y, h: rh }, cell, { size: WF_SMALL, pad: 12 }));
  });
  s.rect(b.x, b.y, b.w, rh * (o.rows.length + 1), { stroke: colour.grey, width: 1 });
}

// ---- callouts ----

export interface Callout {
  /** The number shown (default its position in the list, from 1). */
  n?: number;
  /** The point on the UI the marker sits on. */
  at: [number, number];
  text: string;
}

const MARK = 30;

/** A numbered marker circle centred at a point. */
export function marker(s: Scene, n: number | string, at: [number, number], fill = colour.yellow): El {
  const e = ellipse(s, at[0] - MARK / 2, at[1] - MARK / 2, MARK, MARK, fill, colour.ink, 2);
  e.customData = { role: 'rect', callout: String(n) };
  s.text(String(n), 0, 0, { size: WF_SMALL, align: 'center', container: e });
  return e;
}

/**
 * Callouts: a marker on each UI point, and its note in a margin column `col` (x, top y, width),
 * joined by a dashed line. Notes stack in order of their points' height, each as level with its
 * marker as the notes above it allow, so lines run flat and never cross. Markers left of the column
 * meet the note's left edge; markers right of it meet the right edge (the note's number sits there).
 * Returns the column's used box.
 */
export function callouts(s: Scene, items: Callout[], col: { x: number; y: number; w: number }, o: { gap?: number; size?: number } = {}): Box {
  const gap = o.gap ?? 18;
  const size = o.size ?? WF_TEXT;
  const numbered = items.map((c, i) => ({ ...c, n: c.n ?? i + 1 }));
  let floor = col.y;
  const textW = col.w - MARK - 10;
  for (const c of [...numbered].sort((p, q) => p.at[1] - q.at[1])) {
    const fromRight = c.at[0] > col.x + col.w;
    const t = s.text(c.text, 0, 0, { size, maxPx: textW });
    const h = Math.max(MARK, t.height);
    const top = Math.max(floor, c.at[1] - MARK / 2);
    const cy = top + MARK / 2;
    const cx = fromRight ? col.x + col.w - MARK / 2 : col.x + MARK / 2;
    t.x = fromRight ? col.x + col.w - MARK - 10 - t.width : col.x + MARK + 10;
    t.y = top + (MARK - textHeight(1, size)) / 2;
    if (fromRight) t.textAlign = 'right';
    const m = marker(s, c.n, c.at);
    marker(s, c.n, [cx, cy]);
    // Dashed line between the two circles' edges.
    const dx = cx - c.at[0];
    const dy = cy - c.at[1];
    const len = Math.hypot(dx, dy) || 1;
    const r = MARK / 2 + 3;
    s.line(c.at[0] + (dx / len) * r, c.at[1] + (dy / len) * r, cx - (dx / len) * r, cy - (dy / len) * r, { dashed: true, width: 1.5, colour: colour.grey });
    // The marker on the UI is drawn above the line.
    s.elements.push(...s.elements.splice(s.elements.indexOf(m), 2));
    floor = top + h + gap;
  }
  return { x: col.x, y: col.y, w: col.w, h: floor - gap - col.y };
}
