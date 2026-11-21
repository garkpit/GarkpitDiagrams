// quadrant(): a 2×2 matrix. Two optional axes with end labels, four titled quadrants with pale
// fills, and content either as bullet lists inside each quadrant (a SWOT) or as points placed at
// (x, y) in 0..1 (an effort/impact matrix), drawn as small cards or as dots with a label.
// Quadrants grow to fit their lists, and points are nudged apart (growing the quadrants if they
// must) until no two collide, while staying wholly inside the quadrant their coordinates name.
import { measure, textHeight, wrapPx } from '../font.ts';
import { colour, type El, Scene } from '../scene.ts';
import { fitNode } from './tree.ts';

export interface Quadrant {
  title: string;
  fill?: string;
  /** Bullet points listed inside the quadrant. */
  items?: string[];
  /** Fill for points that land in this quadrant (cards, or the dot). */
  pointFill?: string;
}

export interface QuadrantPoint {
  text: string;
  /** 0 = left/low, 1 = right/high. */
  x: number;
  /** 0 = bottom/low, 1 = top/high. */
  y: number;
  fill?: string;
}

export interface QuadrantAxis {
  title?: string;
  low: string;
  high: string;
}

export interface QuadrantSpec {
  title?: string;
  /** Horizontal axis, low end on the left. */
  xAxis?: QuadrantAxis;
  /** Vertical axis, low end at the bottom. */
  yAxis?: QuadrantAxis;
  /** In reading order: top-left, top-right, bottom-left, bottom-right. */
  quadrants: [Quadrant, Quadrant, Quadrant, Quadrant];
  points?: QuadrantPoint[];
  /** How points are drawn: small labelled cards (default) or dots with the label beside them. */
  mark?: 'card' | 'dot';
  /** Smallest quadrant size (default 330 × 230). */
  minW?: number;
  minH?: number;
  /** Widest a quadrant grows to fit a long bullet before wrapping it (default 430). */
  maxW?: number;
  /** Widest a card or dot label runs before it wraps (default 150). */
  pointW?: number;
}

/** Pale quadrant fills in reading order, and the stronger fill used for points in each. */
export const quadrantFills = ['#ebfbee', '#e7f5ff', '#fff4e6', '#fff5f5'];
const pointFills = [colour.green, colour.blue, colour.orange, colour.red];

const TITLE = 20;
const BULLET = 16;
const POINT = 15;
const PAD = 16;
const GUTTER = 14;

interface Placed {
  q: number;
  p: QuadrantPoint;
  /** Mark size: the card, or the dot plus its label. */
  w: number;
  h: number;
  x: number;
  y: number;
  card?: { w: number; h: number };
  label?: { lines: string[]; w: number; h: number };
}

/** Lay out a 2×2 matrix and return the scene. */
export function quadrant(spec: QuadrantSpec): Scene {
  const s = new Scene();
  const mark = spec.mark ?? 'card';
  const pointW = spec.pointW ?? 150;
  const qs = spec.quadrants;

  // ---- quadrant size from content ----
  let W = spec.minW ?? 330;
  let H = spec.minH ?? 230;
  const maxW = Math.max(W, spec.maxW ?? 430);
  const longest = Math.max(0, ...qs.flatMap((q) => (q.items ?? []).map((t) => measure(t, BULLET))));
  W = Math.max(W, Math.min(maxW, Math.ceil(longest + 2 * PAD + 22)), ...qs.map((q) => Math.ceil(measure(q.title, TITLE) + 2 * PAD)));
  const titleH = (w: number) => Math.max(...qs.map((q) => textHeight(wrapPx(q.title, w - 28, TITLE).length, TITLE)));
  const bodyTop = () => 10 + titleH(W) + 12;
  const listH = (q: Quadrant) => (q.items ?? []).reduce((h, t) => h + textHeight(wrapPx(t, W - 2 * PAD - 22, BULLET).length, BULLET) + 6, 0);
  H = Math.max(H, Math.ceil(bodyTop() + Math.max(...qs.map(listH)) + PAD));

  // ---- points: place, then push apart; grow the quadrants until nothing collides ----
  const quadOf = (p: QuadrantPoint) => (p.y >= 0.5 ? 0 : 2) + (p.x >= 0.5 ? 1 : 0);
  const marks: Placed[] = (spec.points ?? []).map((p) => {
    const q = quadOf(p);
    if (mark === 'card') {
      const card = fitNode('box', p.text, POINT, pointW, 60);
      card.h = Math.max(40, card.h - 6);
      return { q, p, w: card.w, h: card.h, x: 0, y: 0, card };
    }
    const lines = wrapPx(p.text, pointW, POINT);
    const lw = Math.max(...lines.map((l) => measure(l, POINT))) + 2;
    const lh = textHeight(lines.length, POINT);
    return { q, p, w: 14 + 8 + lw, h: Math.max(14, lh), x: 0, y: 0, label: { lines, w: lw, h: lh } };
  });
  const SEP = 10;
  const quadBox = (q: number, ox: number, oy: number) => {
    const qx = ox + (q % 2) * (W + GUTTER);
    const qy = oy + Math.floor(q / 2) * (H + GUTTER);
    return { x: qx + PAD, y: qy + bodyTop(), x2: qx + W - PAD, y2: qy + H - PAD };
  };
  const clamp = (m: Placed) => {
    const b = quadBox(m.q, 0, 0);
    m.x = Math.min(Math.max(m.x, b.x), b.x2 - m.w);
    m.y = Math.min(Math.max(m.y, b.y), b.y2 - m.h);
  };
  const collisions = () => {
    let n = 0;
    for (let i = 0; i < marks.length; i++)
      for (let j = i + 1; j < marks.length; j++) {
        const a = marks[i]!;
        const b = marks[j]!;
        const ox = Math.min(a.x + a.w, b.x + b.w) + SEP - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) + SEP - Math.max(a.y, b.y);
        if (ox > 0 && oy > 0) n++;
      }
    return n;
  };
  for (let attempt = 0; attempt < 12 && marks.length; attempt++) {
    // Wide enough for the widest mark, and tall enough for the body to hold one.
    W = Math.max(W, Math.ceil(Math.max(...marks.map((m) => m.w)) + 2 * PAD));
    H = Math.max(H, Math.ceil(bodyTop() + Math.max(...marks.map((m) => m.h)) + PAD));
    const plotW = 2 * W + GUTTER;
    const plotH = 2 * H + GUTTER;
    for (const m of marks) {
      // The mark's anchor (card centre, or dot centre) sits at the point's coordinates.
      const cx = m.p.x * plotW;
      const cy = (1 - m.p.y) * plotH;
      m.x = m.card ? cx - m.w / 2 : cx - 7;
      m.y = cy - m.h / 2;
      clamp(m);
    }
    for (let it = 0; it < 300 && collisions(); it++) {
      for (let i = 0; i < marks.length; i++)
        for (let j = i + 1; j < marks.length; j++) {
          const a = marks[i]!;
          const b = marks[j]!;
          const ox = Math.min(a.x + a.w, b.x + b.w) + SEP - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) + SEP - Math.max(a.y, b.y);
          if (ox <= 0 || oy <= 0) continue;
          // Push apart along the axis that needs the smaller move.
          if (oy <= ox) {
            const d = oy / 2 + 0.5;
            if (a.y + a.h / 2 <= b.y + b.h / 2) (a.y -= d), (b.y += d);
            else (a.y += d), (b.y -= d);
          } else {
            const d = ox / 2 + 0.5;
            if (a.x + a.w / 2 <= b.x + b.w / 2) (a.x -= d), (b.x += d);
            else (a.x += d), (b.x -= d);
          }
          clamp(a);
          clamp(b);
        }
    }
    if (!collisions()) break;
    W = Math.ceil(W * 1.12);
    H = Math.ceil(H * 1.12);
  }

  // ---- frame ----
  const Y0 = spec.title ? 76 : 30;
  const yLabelW = spec.yAxis ? Math.ceil(Math.max(measure(spec.yAxis.low, 15), measure(spec.yAxis.high, 15)) + 14) : 0;
  const yTitleH = spec.yAxis?.title ? 34 : 0;
  const ox = 30 + (spec.yAxis ? yLabelW + 26 : 0);
  const oy = Y0 + yTitleH;
  const plotW = 2 * W + GUTTER;
  const plotH = 2 * H + GUTTER;
  if (spec.title) s.title(30, 20, spec.title);

  qs.forEach((q, i) => {
    const qx = ox + (i % 2) * (W + GUTTER);
    const qy = oy + Math.floor(i / 2) * (H + GUTTER);
    s.band(qx, qy, W, H, q.title, q.fill ?? quadrantFills[i]!, false, TITLE);
    let y = qy + bodyTop();
    for (const t of q.items ?? []) {
      const lines = wrapPx(t, W - 2 * PAD - 22, BULLET);
      s.text('•', qx + PAD + 2, y, { size: BULLET });
      s.text(t, qx + PAD + 22, y, { size: BULLET, maxPx: W - 2 * PAD - 22 });
      y += textHeight(lines.length, BULLET) + 6;
    }
  });

  // ---- axes: a line with a chevron at the high end, end labels, and a title ----
  const ink = colour.ink;
  if (spec.yAxis) {
    const ax = ox - 14;
    // Lines start at their top-left point: Scene.bounds() reads a line's x/y as its corner.
    s.line(ax, oy - 4, ax, oy + plotH, { colour: ink });
    s.line(ax - 7, oy + 8, ax, oy - 4, { colour: ink });
    s.line(ax, oy - 4, ax + 7, oy + 8, { colour: ink });
    s.note(ax - 10, oy + 14, spec.yAxis.high, { size: 15, colour: ink, align: 'right' });
    s.note(ax - 10, oy + plotH - 19, spec.yAxis.low, { size: 15, colour: ink, align: 'right' });
    if (spec.yAxis.title) s.note(ax, oy - 32, spec.yAxis.title, { size: 17, colour: ink, align: 'center' });
  }
  if (spec.xAxis) {
    const ay = oy + plotH + 14;
    s.line(ox, ay, ox + plotW + 4, ay, { colour: ink });
    s.line(ox + plotW - 8, ay - 7, ox + plotW + 4, ay, { colour: ink });
    s.line(ox + plotW - 8, ay + 7, ox + plotW + 4, ay, { colour: ink });
    s.note(ox, ay + 8, spec.xAxis.low, { size: 15, colour: ink });
    s.note(ox + plotW - 14, ay + 8, spec.xAxis.high, { size: 15, colour: ink, align: 'right' });
    if (spec.xAxis.title) s.note(ox + plotW / 2, ay + 30, spec.xAxis.title, { size: 17, colour: ink, align: 'center' });
  }

  // ---- points ----
  for (const m of marks) {
    const x = ox + m.x;
    const y = oy + m.y;
    const fill = m.p.fill ?? qs[m.q]!.pointFill ?? pointFills[m.q]!;
    if (m.card) {
      s.node('box', x, y, m.w, m.h, m.p.text, { fill, size: POINT });
    } else {
      const dot: El = s.node('circle', x, y + m.h / 2 - 7, 14, 14, '', { fill: darker(fill) });
      dot.width = dot.height = 14;
      dot.y = y + m.h / 2 - 7;
      s.text(m.p.text, x + 22, y + (m.h - m.label!.h) / 2, { size: POINT, maxPx: pointW });
    }
  }
  return s;
}

/** The strong Excalidraw stroke colour that goes with a pale fill, for dots. */
function darker(fill: string): string {
  const map: Record<string, string> = {
    [colour.green]: '#2f9e44',
    [colour.blue]: '#1971c2',
    [colour.orange]: '#e8590c',
    [colour.red]: '#e03131',
    [colour.yellow]: '#f08c00',
    [colour.violet]: '#6741d9',
    [colour.teal]: '#0c8599',
    [colour.pink]: '#c2255c'
  };
  return map[fill] ?? fill;
}
