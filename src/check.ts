// The fit check: the visual pass, automated. It reads a scene's elements (ours, or any .excalidraw
// file) and reports what a careful reader would catch: text spilling out of its shape, labels on
// nodes, nodes on nodes, arrows running through nodes, things straddling a lane, and file damage
// that makes excalidraw.com reject a drawing. It cannot judge whether a diagram is clear, so the
// human/agent look at the preview stays.
import { LINE_HEIGHT, measure } from './font.ts';
import { type El, type Role, roleOf, type Scene } from './scene.ts';

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  /** Element ids involved. */
  ids: string[];
  /** A point to look at, in scene coordinates. */
  at?: [number, number];
}

export interface CheckResult {
  name: string;
  ok: boolean;
  errors: number;
  warnings: number;
  elements: number;
  findings: Finding[];
}

export interface Rule {
  rule: string;
  severity: Severity;
  what: string;
}

/** Every rule, for `diagrams check --rules` and the docs. */
export const RULES: Rule[] = [
  { rule: 'duplicate-id', severity: 'error', what: 'Two elements share an id.' },
  { rule: 'bad-index', severity: 'error', what: 'An element `index` is not a valid fractional key or is out of order (excalidraw.com rejects or rewrites the file).' },
  { rule: 'broken-binding', severity: 'error', what: 'A containerId, arrow binding or boundElements entry points at an element that is missing or does not point back.' },
  { rule: 'text-overflow', severity: 'error', what: 'Text measured in Excalifont does not fit inside its box, diamond, ellipse or label plate; a second text placed in a node (customData.in) must also clear the node\'s own label.' },
  { rule: 'node-overlap', severity: 'error', what: 'Two nodes overlap.' },
  { rule: 'label-on-node', severity: 'error', what: 'An arrow label sits on a node.' },
  { rule: 'label-overlap', severity: 'error', what: 'Two arrow labels overlap.' },
  { rule: 'text-on-node', severity: 'error', what: 'A title, note or lane/band label sits on a node.' },
  { rule: 'arrow-through-node', severity: 'error', what: 'An arrow runs through a node that is not one of its ends, or doubles back through its own end node.' },
  { rule: 'arrow-through-text', severity: 'error', what: 'An arrow runs through a title, note, or lane or band label.' },
  { rule: 'crosses-boundary', severity: 'error', what: 'A node, text or band is partly inside a lane or band (it should be wholly in or wholly out).' },
  { rule: 'arrow-overlap', severity: 'warn', what: 'Two arrows run along the same line for a stretch, so a reader cannot tell which goes where. One exception, a shared trunk: elbow arrows bound to the same fixed point on the same node may run together from there until they part (a tree bus, which Excalidraw re-routes as one), since each then goes its own way; any overlap after they part still counts.' },
  { rule: 'label-covers-arrow', severity: 'warn', what: "An arrow label's white plate hides part of a different arrow." },
  { rule: 'small-on-page', severity: 'warn', what: 'Scaled to fit an A4 page (landscape or portrait, whichever suits it better), the smallest text would print under 7 pt.' },
  { rule: 'font-not-measured', severity: 'warn', what: 'Text uses a font other than Excalifont, so its fit was measured approximately.' },
  { rule: 'arrow-crossing', severity: 'info', what: 'Two arrows cross (sometimes unavoidable; fewer is clearer).' }
];

type Box = { x: number; y: number; w: number; h: number };
const boxOf = (e: El): Box => ({ x: e.x, y: e.y, w: e.width, h: e.height });
const centre = (b: Box): [number, number] => [b.x + b.w / 2, b.y + b.h / 2];
const shrink = (b: Box, s: number): Box => ({ x: b.x + s, y: b.y + s, w: b.w - 2 * s, h: b.h - 2 * s });
const intersect = (a: Box, b: Box): Box | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
};
const contains = (outer: Box, inner: Box, tol = 1) =>
  inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;

/** Is the point inside the element's shape, shrunk by `s` px all round? */
function inside(e: El, px: number, py: number, s = 0): boolean {
  const hw = e.width / 2 - s;
  const hh = e.height / 2 - s;
  if (hw <= 0 || hh <= 0) return false;
  const dx = Math.abs(px - (e.x + e.width / 2));
  const dy = Math.abs(py - (e.y + e.height / 2));
  if (e.type === 'diamond') return dx / hw + dy / hh <= 1;
  if (e.type === 'ellipse') return (dx / hw) ** 2 + (dy / hh) ** 2 <= 1;
  if (dx > hw || dy > hh) return false;
  // Rounded rectangles (roundness type 3): Excalidraw's adaptive radius, 25% of the short side up to 32 px.
  if ((e.roundness as { type?: number } | null)?.type === 3) {
    const short = Math.min(e.width, e.height);
    const r = Math.max(0, (short <= 128 ? short * 0.25 : 32) - s);
    const cx = dx - (hw - r);
    const cy = dy - (hh - r);
    if (cx > 0 && cy > 0) return cx * cx + cy * cy <= r * r;
  }
  return true;
}

/** Do two shapes overlap (beyond `tol` px)? Rectangles exactly; diamonds and ellipses by sampling the shared box. */
function shapesOverlap(a: El, b: El, tol = 2): [number, number] | null {
  const i = intersect(shrink(boxOf(a), tol), shrink(boxOf(b), tol));
  if (!i) return null;
  if (a.type === 'rectangle' && b.type === 'rectangle') return centre(i);
  const n = 12;
  for (let gx = 0; gx <= n; gx++)
    for (let gy = 0; gy <= n; gy++) {
      const px = i.x + (i.w * gx) / n;
      const py = i.y + (i.h * gy) / n;
      if (inside(a, px, py, tol) && inside(b, px, py, tol)) return [px, py];
    }
  return null;
}

/** Does a box overlap a shape? */
function boxOnShape(b: Box, e: El, tol = 2): [number, number] | null {
  const pseudo = { ...b, x: b.x, y: b.y, width: b.w, height: b.h, type: 'rectangle', id: '' } as El;
  return shapesOverlap(pseudo, e, tol);
}

function polyline(e: El): [number, number][] {
  return ((e.points as [number, number][]) ?? []).map(([px, py]) => [e.x + px, e.y + py]);
}

/** Points every `step` px along a polyline, skipping `skipStart`/`skipEnd` px at its ends. */
function samples(pts: [number, number][], step = 4, skipStart = 0, skipEnd = 0): [number, number][] {
  const total = pts.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);
  const out: [number, number][] = [];
  let walked = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[i + 1]!;
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let d = 0; d < len; d += step) {
      const at = walked + d;
      if (at >= skipStart && at <= total - skipEnd) out.push([x1 + ((x2 - x1) * d) / len, y1 + ((y2 - y1) * d) / len]);
    }
    walked += len;
  }
  return out;
}

function segmentsCross(p: [number, number], p2: [number, number], q: [number, number], q2: [number, number]): [number, number] | null {
  const r = [p2[0] - p[0], p2[1] - p[1]];
  const s = [q2[0] - q[0], q2[1] - q[1]];
  const den = r[0]! * s[1]! - r[1]! * s[0]!;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * s[1]! - (q[1] - p[1]) * s[0]!) / den;
  const u = ((q[0] - p[0]) * r[1]! - (q[1] - p[1]) * r[0]!) / den;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98 ? [p[0] + t * r[0]!, p[1] + t * r[1]!] : null;
}

/** The longest stretch two polylines run along together (collinear, within 3 px), if over 12 px. */
function sharedRun(p: [number, number][], q: [number, number][]): { len: number; at: [number, number] } | null {
  let best: { len: number; at: [number, number] } | null = null;
  for (let s = 0; s < p.length - 1; s++)
    for (let t = 0; t < q.length - 1; t++) {
      const [a, b] = [p[s]!, p[s + 1]!];
      const [c, d] = [q[t]!, q[t + 1]!];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1) continue;
      const ux = (b[0] - a[0]) / len;
      const uy = (b[1] - a[1]) / len;
      const off = (pt: [number, number]) => Math.abs((pt[0] - a[0]) * uy - (pt[1] - a[1]) * ux);
      if (off(c) > 3 || off(d) > 3) continue;
      const proj = (pt: [number, number]) => (pt[0] - a[0]) * ux + (pt[1] - a[1]) * uy;
      const lo = Math.max(0, Math.min(proj(c), proj(d)));
      const hi = Math.min(len, Math.max(proj(c), proj(d)));
      if (hi - lo > 12 && (!best || hi - lo > best.len)) best = { len: hi - lo, at: [a[0] + ux * (lo + hi) / 2, a[1] + uy * (lo + hi) / 2] };
    }
  return best;
}

/** The point `d` px along a polyline. */
function along(pts: [number, number][], d: number): [number, number] {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[i + 1]!;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (d <= len) return len ? [x1 + ((x2 - x1) * d) / len, y1 + ((y2 - y1) * d) / len] : [x1, y1];
    d -= len;
  }
  return pts[pts.length - 1]!;
}

const lengthOf = (pts: [number, number][]) => pts.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);

/** How far two polylines run together from a common start point before they part (0 if they start apart). */
function trunk(p: [number, number][], q: [number, number][]): number {
  const max = Math.min(lengthOf(p), lengthOf(q));
  let d = 0;
  while (d <= max) {
    const a = along(p, d);
    const b = along(q, d);
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1.5) break;
    d += 2;
  }
  return Math.max(0, d - 2);
}

/** The polyline from `d` px along it to its end. */
function after(pts: [number, number][], d: number): [number, number][] {
  const out: [number, number][] = [along(pts, d)];
  let walked = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    walked += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
    if (walked > d) out.push(pts[i + 1]!);
  }
  return out;
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** A fractional-indexing key: integer part sized by its head letter, then a fraction that must not end in 0. */
export function validIndex(key: string): boolean {
  if (!key || [...key].some((c) => !B62.includes(c))) return false;
  const head = key[0]!;
  let intLen: number;
  if (head >= 'a' && head <= 'z') intLen = head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  else if (head >= 'A' && head <= 'Z') intLen = 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  else return false;
  if (key.length < intLen) return false;
  const frac = key.slice(intLen);
  return !frac.endsWith('0');
}

/** What an element is for: its own customData role, or inferred for drawings made elsewhere. */
function inferRoles(els: El[]): Map<string, Role> {
  const byId = new Map(els.map((e) => [e.id, e]));
  const roles = new Map<string, Role>();
  for (const e of els) {
    const own = roleOf(e);
    if (own) {
      roles.set(e.id, own);
      continue;
    }
    if (e.type === 'arrow') roles.set(e.id, 'arrow');
    else if (e.type === 'line' || e.type === 'freedraw') roles.set(e.id, 'line');
    else if (e.type === 'text') {
      const c = e.containerId ? byId.get(e.containerId as string) : undefined;
      roles.set(e.id, c ? (c.type === 'arrow' ? 'arrow-label' : 'node-label') : 'text');
    }
  }
  const shapes = els.filter((e) => !roles.has(e.id) && ['rectangle', 'diamond', 'ellipse'].includes(e.type));
  for (const e of shapes) {
    const hasText = ((e.boundElements as Array<{ type: string }>) ?? []).some((b) => b.type === 'text');
    const holdsOthers = shapes.some((o) => o !== e && contains(boxOf(e), boxOf(o), 0));
    roles.set(e.id, hasText && !holdsOthers ? 'node' : holdsOthers ? 'band' : 'rect');
  }
  return roles;
}

/** Text block size as Excalidraw lays it out: the given lines, measured, at the element's line height. */
function textBlock(e: El): { w: number; h: number } {
  const size = (e.fontSize as number) ?? 20;
  const lines = String(e.text ?? '').split('\n');
  return { w: Math.max(0, ...lines.map((l) => measure(l, size))), h: lines.length * size * ((e.lineHeight as number) ?? LINE_HEIGHT) };
}

const label = (e: El) => {
  const t = (e.originalText ?? e.text) as string | undefined;
  return t ? `"${t.replace(/\s+/g, ' ').slice(0, 40)}${t.length > 40 ? '…' : ''}"` : e.id;
};

export interface CheckOptions {
  /** Page content width and height in px the drawing must fit for `small-on-page`. Default A4 landscape inside 15 mm margins. */
  pagePx?: { w: number; h: number };
  /** Smallest acceptable printed text in px (96 dpi). Default 9.33 (7 pt). */
  minPrintPx?: number;
}

/** Run every rule over a scene. */
export function checkScene(scene: Scene, name = 'scene', opts: CheckOptions = {}): CheckResult {
  const els = scene.elements.filter((e) => !e.isDeleted);
  const byId = new Map<string, El>();
  const findings: Finding[] = [];
  const add = (rule: string, message: string, ids: string[], at?: [number, number]) => {
    const r = RULES.find((x) => x.rule === rule)!;
    findings.push({ rule, severity: r.severity, message, ids, at: at ? [Math.round(at[0]), Math.round(at[1])] : undefined });
  };

  // ---- integrity ----
  for (const e of els) {
    if (byId.has(e.id)) add('duplicate-id', `id ${e.id} is used by more than one element`, [e.id]);
    byId.set(e.id, e);
  }
  let prev = '';
  for (const e of els) {
    const ix = e.index as string | null | undefined;
    if (ix == null) continue;
    if (!validIndex(ix)) add('bad-index', `${e.id} has index "${ix}", which is not a valid fractional key`, [e.id]);
    else if (prev && !(ix > prev)) add('bad-index', `${e.id} has index "${ix}", not after the previous element's "${prev}"`, [e.id]);
    prev = ix;
  }
  for (const e of els) {
    if (e.containerId) {
      const c = byId.get(e.containerId as string);
      if (!c) add('broken-binding', `text ${label(e)} names container ${e.containerId}, which does not exist`, [e.id]);
      else if (!((c.boundElements as Array<{ id: string }>) ?? []).some((b) => b.id === e.id))
        add('broken-binding', `container ${c.id} does not list its text ${label(e)} in boundElements`, [c.id, e.id]);
    }
    for (const k of ['startBinding', 'endBinding'] as const) {
      const b = e[k] as { elementId?: string } | null | undefined;
      if (b?.elementId && !byId.has(b.elementId)) add('broken-binding', `arrow ${e.id} ${k} points at ${b.elementId}, which does not exist`, [e.id]);
    }
    for (const b of (e.boundElements as Array<{ id: string }>) ?? []) {
      if (!byId.has(b.id)) add('broken-binding', `${e.id} lists bound element ${b.id}, which does not exist`, [e.id]);
    }
  }

  const roles = inferRoles(els);
  const is = (...rs: Role[]) => els.filter((e) => rs.includes(roles.get(e.id)!));
  const nodes = is('node');
  const arrows = is('arrow');
  const plates = is('arrow-plate');
  const regions = is('lane', 'band');

  // ---- text fit ----
  let foreignFont = false;
  for (const t of els.filter((e) => e.type === 'text')) {
    if ((t.fontFamily as number) !== 5) foreignFont = true;
    const host = (t.customData as { in?: string } | undefined)?.in;
    if (!t.containerId && host) {
      // A second text placed in a node (a timeline card's detail): it must lie inside the node and
      // clear the node's own label.
      const n = byId.get(host);
      if (!n) {
        add('broken-binding', `text ${label(t)} says it sits in ${host}, which does not exist`, [t.id]);
        continue;
      }
      const tb: Box = { x: t.x, y: t.y, ...textBlock(t) };
      const own = textOf(n, els);
      const clash = own !== n ? intersect(tb, { x: own.x, y: own.y, ...textBlock(own) }) : null;
      if (!contains(shrink(boxOf(n), 5), tb, 0.5) || clash)
        add(
          'text-overflow',
          clash
            ? `${label(t)} overlaps ${label(own)}, the label of the node it sits in; make the node taller`
            : `${label(t)} (${Math.round(tb.w)}×${Math.round(tb.h)} px) does not fit inside its ${n.type} (${Math.round(n.width)}×${Math.round(n.height)} px)`,
          [t.id, n.id],
          centre(tb)
        );
      continue;
    }
    const c = t.containerId ? byId.get(t.containerId as string) : undefined;
    if (!c || c.type === 'arrow' || c.type === 'line') continue;
    const { w, h } = textBlock(t);
    const pad = roles.get(c.id) === 'arrow-plate' ? 0 : 5;
    let fits: boolean;
    if (c.type === 'diamond' || c.type === 'ellipse') {
      // Each line's ink box (cap height to descender, not the full line box) must lie inside the shape.
      const size = (t.fontSize as number) ?? 20;
      const lh = size * ((t.lineHeight as number) ?? LINE_HEIGHT);
      const lines = String(t.text ?? '').split('\n');
      const [cx, cy] = centre(boxOf(c));
      const top = cy - h / 2;
      fits = lines.every((l, i) => {
        const lw = measure(l, size) / 2;
        const y0 = top + i * lh + (lh - size) / 2 + size * 0.12;
        const y1 = top + i * lh + (lh - size) / 2 + size * 1.0;
        return [[cx - lw, y0], [cx + lw, y0], [cx - lw, y1], [cx + lw, y1]].every(([px, py]) => inside(c, px!, py!, 2));
      });
    } else fits = w <= c.width - 2 * pad + 0.5 && h <= c.height - 2 * pad + 0.5;
    if (!fits) {
      const longest = String(t.text ?? '').split('\n').reduce((a, l) => (measure(l, t.fontSize as number) > measure(a, t.fontSize as number) ? l : a), '');
      add(
        'text-overflow',
        `${label(t)} (${Math.round(w)}×${Math.round(h)} px) does not fit its ${c.type} (${Math.round(c.width)}×${Math.round(c.height)} px); widest line "${longest}". Widen the node, shorten the text, or use a smaller size`,
        [t.id, c.id],
        centre(boxOf(c))
      );
    }
  }
  if (foreignFont) add('font-not-measured', 'some text is not Excalifont (fontFamily 5); its fit was measured with Excalifont metrics, so treat text-overflow as approximate', []);

  // ---- node on node ----
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const at = shapesOverlap(nodes[i]!, nodes[j]!);
      if (at) add('node-overlap', `nodes ${label(textOf(nodes[i]!, els))} and ${label(textOf(nodes[j]!, els))} overlap`, [nodes[i]!.id, nodes[j]!.id], at);
    }

  // ---- labels ----
  for (const p of plates) {
    for (const n of nodes) {
      const at = boxOnShape(boxOf(p), n, 1);
      if (at) add('label-on-node', `arrow label ${label(textOf(p, els))} sits on node ${label(textOf(n, els))}; widen the gap between the nodes (gapX/gapY), move it with labelAt, or shorten the label`, [p.id, n.id], at);
    }
  }
  for (let i = 0; i < plates.length; i++)
    for (let j = i + 1; j < plates.length; j++) {
      const at = intersect(boxOf(plates[i]!), boxOf(plates[j]!));
      if (at) add('label-overlap', `arrow labels ${label(textOf(plates[i]!, els))} and ${label(textOf(plates[j]!, els))} overlap`, [plates[i]!.id, plates[j]!.id], centre(at));
    }
  for (const t of els.filter((e) => e.type === 'text' && ['title', 'note', 'text', 'lane-label', 'band-label'].includes(roles.get(e.id)!))) {
    const { w, h } = textBlock(t);
    const tb: Box = { x: t.x, y: t.y, w, h };
    for (const n of nodes) {
      const at = boxOnShape(tb, n, 1);
      if (at) add('text-on-node', `${roles.get(t.id)} ${label(t)} sits on node ${label(textOf(n, els))}`, [t.id, n.id], at);
    }
  }

  // ---- arrows ----
  const freeTexts = els.filter((e) => e.type === 'text' && !e.containerId && ['title', 'note', 'text', 'lane-label', 'band-label'].includes(roles.get(e.id)!));
  for (const a of arrows) {
    const pts = polyline(a);
    if (pts.length < 2) continue;
    const ends = new Set([(a.startBinding as { elementId?: string } | null)?.elementId, (a.endBinding as { elementId?: string } | null)?.elementId].filter(Boolean) as string[]);
    for (const n of nodes) {
      const own = ends.has(n.id);
      const hit = samples(pts, 4, own ? 14 : 0, own ? 14 : 0).find((p) => inside(n, p[0], p[1], own ? 6 : 3));
      if (hit)
        add(
          'arrow-through-node',
          own
            ? `arrow ${a.id} doubles back through its own end ${label(textOf(n, els))}; route it out of the facing side`
            : `arrow ${a.id} runs through ${label(textOf(n, els))}; add waypoints (via) or a route that goes round it`,
          [a.id, n.id],
          hit
        );
    }
    for (const t of freeTexts) {
      const { w, h } = textBlock(t);
      const hit = samples(pts, 3).find((q) => q[0] > t.x + 1 && q[0] < t.x + w - 1 && q[1] > t.y + 2 && q[1] < t.y + h - 2);
      if (hit) add('arrow-through-text', `arrow ${a.id} runs through ${roles.get(t.id)} ${label(t)}; reroute it or move the text`, [a.id, t.id], hit);
    }
    for (const p of plates) {
      if ((p.customData as { arrow?: string } | undefined)?.arrow === a.id) continue;
      const hit = samples(pts, 3).find((q) => inside(p, q[0], q[1], 1));
      if (hit) add('label-covers-arrow', `the label ${label(textOf(p, els))} covers part of arrow ${a.id}`, [p.id, a.id], hit);
    }
  }
  // Elbow arrows bound to the same fixed point of the same node: the only arrows allowed a trunk.
  const trunkKey = (a: El) => {
    const b = a.startBinding as { elementId?: string; fixedPoint?: number[] | null } | null | undefined;
    return a.elbowed && b?.elementId && b.fixedPoint ? `${b.elementId}@${b.fixedPoint.join(',')}` : null;
  };
  for (let i = 0; i < arrows.length; i++)
    for (let j = i + 1; j < arrows.length; j++) {
      const p = polyline(arrows[i]!);
      const q = polyline(arrows[j]!);
      let run = sharedRun(p, q);
      // A shared trunk: together from the same start until they part. Only overlap after the parting counts.
      if (run && trunkKey(arrows[i]!) && trunkKey(arrows[i]!) === trunkKey(arrows[j]!)) {
        const t = trunk(p, q);
        if (t > 0) run = sharedRun(after(p, t), after(q, t));
      }
      if (run) add('arrow-overlap', `arrows ${arrows[i]!.id} and ${arrows[j]!.id} share ${Math.round(run.len)} px of line; give one its own route`, [arrows[i]!.id, arrows[j]!.id], run.at);
    }
  for (let i = 0; i < arrows.length; i++)
    for (let j = i + 1; j < arrows.length; j++) {
      const p = polyline(arrows[i]!);
      const q = polyline(arrows[j]!);
      let at: [number, number] | null = null;
      for (let s = 0; s < p.length - 1 && !at; s++) for (let t = 0; t < q.length - 1 && !at; t++) at = segmentsCross(p[s]!, p[s + 1]!, q[t]!, q[t + 1]!);
      if (at) add('arrow-crossing', `arrows ${arrows[i]!.id} and ${arrows[j]!.id} cross`, [arrows[i]!.id, arrows[j]!.id], at);
    }

  // ---- lanes and bands ----
  const boxed = [...nodes, ...regions, ...els.filter((e) => e.type === 'text' && !e.containerId)];
  for (const r of regions) {
    const rb = boxOf(r);
    for (const e of boxed) {
      if (e === r) continue;
      const eb = e.type === 'text' ? { x: e.x, y: e.y, ...textBlock(e) } : boxOf(e);
      const i = intersect(rb, shrink(eb, 1));
      if (!i || contains(rb, eb, 1)) continue;
      if (regions.includes(e) && contains(eb, rb, 1)) continue; // e holds r
      add('crosses-boundary', `${roles.get(e.id)} ${label(e.type === 'text' ? e : textOf(e, els))} is partly inside ${roles.get(r.id)} ${label(laneName(r, els))}`, [e.id, r.id], centre(i));
    }
  }

  // ---- legibility on a page (whichever A4 orientation suits the drawing) ----
  const pages = opts.pagePx ? [{ name: 'the page', ...opts.pagePx }] : [{ name: 'A4 landscape', w: 1009, h: 605 }, { name: 'A4 portrait', w: 680, h: 870 }];
  const minPx = opts.minPrintPx ?? 9.33;
  const texts = els.filter((e) => e.type === 'text');
  if (texts.length) {
    const b = scene.bounds();
    const fit = pages.map((pg) => ({ ...pg, scale: Math.min(1, pg.w / (b.w + 48), pg.h / (b.h + 48)) })).sort((x, y) => y.scale - x.scale)[0]!;
    const smallest = Math.min(...texts.map((t) => t.fontSize as number));
    if (smallest * fit.scale < minPx)
      add(
        'small-on-page',
        `at ${Math.round(b.w)}×${Math.round(b.h)} px the drawing prints at ${(fit.scale * 100).toFixed(0)}% even on ${fit.name}, so ${smallest}px text becomes ${((smallest * fit.scale * 72) / 96).toFixed(1)} pt; split it or tighten the layout`,
        []
      );
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  return { name, ok: errors === 0, errors, warnings: findings.filter((f) => f.severity === 'warn').length, elements: els.length, findings };
}

/** The text bound to a shape, or the shape itself. */
function textOf(e: El, els: El[]): El {
  const tid = ((e.boundElements as Array<{ id: string; type: string }>) ?? []).find((b) => b.type === 'text')?.id;
  return (tid && els.find((x) => x.id === tid)) || e;
}

/** A lane's or band's label: the first free text whose top-left lies inside it. */
function laneName(r: El, els: El[]): El {
  return els.find((t) => t.type === 'text' && !t.containerId && ['lane-label', 'band-label'].includes(roleOf(t) ?? '') && contains(boxOf(r), { x: t.x, y: t.y, w: 1, h: 1 })) ?? r;
}
