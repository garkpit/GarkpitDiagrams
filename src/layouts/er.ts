// er(): entity-relationship / data-model diagrams. Entities are drawn as tables (a header band with
// the entity name, then one row per field: key marker, name, type), placed on a grid of columns and
// rows like flow(). Every column is as wide as its widest table and every row as tall as its tallest,
// with tables centred in their column and top-aligned in their row. Relationships are orthogonal
// lines between table edges with a cardinality label near each end and an optional name. Routes
// are chosen from candidates (straight, L, Z through a column or row gap, C round one side) by
// fewest bends, then fewest crossings, then length; a route never passes through a table. A
// relationship whose tables sit side by side leaves and enters at its fields' row heights.
import { measure, textHeight } from '../font.ts';
import { colour, type El, Scene } from '../scene.ts';

export interface ErField {
  name: string;
  type?: string;
  pk?: boolean;
  fk?: boolean;
  /** Unique (shown as UQ). */
  uq?: boolean;
}

/** A field, or the shorthand `"name: type PK FK UQ"` (markers last, any order). */
export type ErFieldSpec = ErField | string;

export interface ErEntity {
  id: string;
  /** Header text (default the id). */
  name?: string;
  /** Grid column and row (fractions allowed). */
  c: number;
  r: number;
  fields: ErFieldSpec[];
  /** Header fill (default blue). */
  fill?: string;
}

export interface ErRelation {
  from: string;
  to: string;
  /** Field the line leaves from / arrives at (its row height when the tables sit side by side). */
  fromField?: string;
  toField?: string;
  /** Cardinality at each end: '1', 'N', '0..1', '1..*' and so on. */
  fromCard?: string;
  toCard?: string;
  /** The relationship's name, on a plate along the line. */
  label?: string;
  /** Grid waypoints [column, row]; fractions allowed (2.5 = the middle of the gap after column 2). Skips the router. */
  via?: Array<[number, number]>;
  dashed?: boolean;
  colour?: string;
  /** Arrowheads: 'none' (default), 'end' (at `to`) or 'both'. */
  heads?: 'end' | 'both' | 'none';
  /** Where the name's plate is centred (scene px); default the first clear segment midpoint. */
  labelAt?: [number, number];
}

export interface ErSpec {
  title?: string;
  entities: ErEntity[];
  relations: ErRelation[];
  /** Gap between columns and between rows (px). Columns need room for two cardinality labels and a track or two. */
  gapX?: number;
  gapY?: number;
  /** Field text size (default 15); header is `size + 2`. */
  size?: number;
  /** Narrowest a table may be (default 170). */
  minWidth?: number;
}

export interface TableOpts {
  size?: number;
  headerSize?: number;
  minWidth?: number;
  /** Force a width (at least the measured one). */
  width?: number;
}

/** A drawn table: its frame node (what relationships bind to) and the centre y of each field row. */
export interface ErTable {
  id: string;
  frame: El;
  x: number;
  y: number;
  w: number;
  h: number;
  headerH: number;
  /** Centre y of a field's row, or undefined for an unknown field. */
  fieldY(name: string): number | undefined;
}

type P = [number, number];

const KEY_COLOUR = { PK: colour.blueDark, FK: '#7048e8', UQ: colour.grey } as const;
const PAD_X = 12;
const COL_GAP = 12;
const TYPE_GAP = 26;

/** Parse the `"name: type PK FK"` shorthand. */
export function parseField(f: ErFieldSpec): ErField {
  if (typeof f !== 'string') return f;
  const [name, rest = ''] = f.split(/:(.*)/s, 2) as [string, string?];
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  const out: ErField = { name: name.trim() };
  while (tokens.length && ['PK', 'FK', 'UQ'].includes(tokens[tokens.length - 1]!)) {
    const t = tokens.pop()!;
    if (t === 'PK') out.pk = true;
    else if (t === 'FK') out.fk = true;
    else out.uq = true;
  }
  if (tokens.length) out.type = tokens.join(' ');
  return out;
}

const markers = (f: ErField) => [f.pk && 'PK', f.fk && 'FK', f.uq && 'UQ'].filter(Boolean) as Array<keyof typeof KEY_COLOUR>;

function metrics(entity: ErEntity, o: TableOpts) {
  const size = o.size ?? 15;
  const headerSize = o.headerSize ?? size + 2;
  const keySize = size - 2;
  const fields = entity.fields.map(parseField);
  const keyW = Math.max(0, ...fields.map((f) => measure(markers(f).join(' '), keySize)));
  const nameW = Math.max(0, ...fields.map((f) => measure(f.name, size)));
  const typeW = Math.max(0, ...fields.map((f) => (f.type ? measure(f.type, size) : 0)));
  const bodyW = PAD_X + (keyW ? keyW + COL_GAP : 0) + nameW + (typeW ? TYPE_GAP + typeW : 0) + PAD_X + 2;
  const headerW = measure(entity.name ?? entity.id, headerSize) + 2 * PAD_X + 12;
  const w = Math.ceil(Math.max(o.minWidth ?? 170, o.width ?? 0, bodyW, headerW));
  const rowH = Math.ceil(textHeight(1, size) + 11);
  const headerH = Math.ceil(textHeight(1, headerSize) + 16);
  const h = headerH + fields.length * rowH + 4;
  return { size, headerSize, keySize, fields, keyW, typeW, w, h, rowH, headerH };
}

/** The size a table will be, for laying tables out before drawing them. */
export function tableSize(entity: ErEntity, o: TableOpts = {}): { w: number; h: number } {
  const m = metrics(entity, o);
  return { w: m.w, h: m.h };
}

/**
 * Draw one entity table at (x, y). The frame is a 'node' (so the fit check keeps arrows and labels
 * off it); the header, fields and rules sit inside it, all in one Excalidraw group so the table
 * drags as a unit in excalidraw.com.
 */
export function entityTable(s: Scene, x: number, y: number, entity: ErEntity, o: TableOpts = {}): ErTable {
  const m = metrics(entity, o);
  const { w, h, rowH, headerH } = m;
  const group = `tbl-${entity.id}`;
  const first = s.elements.length;

  s.rect(x, y, w, h, { fill: colour.white, stroke: colour.none, roughness: 0 });
  const header = s.rect(x, y, w, headerH, { fill: entity.fill ?? colour.blue, stroke: colour.none, roughness: 0 });
  s.text(entity.name ?? entity.id, 0, 0, { size: m.headerSize, align: 'center', container: header, maxPx: w - 2 * PAD_X });
  s.line(x, y + headerH, x + w, y + headerH, { width: 2 });

  const ys = new Map<string, number>();
  const lineH = textHeight(1, m.size);
  const nameX = x + PAD_X + (m.keyW ? m.keyW + COL_GAP : 0);
  const typeX = x + w - PAD_X - m.typeW;
  m.fields.forEach((f, i) => {
    const top = y + headerH + i * rowH;
    ys.set(f.name, top + rowH / 2);
    if (i > 0) {
      const rule = s.line(x + 6, top, x + w - 6, top, { colour: '#dee2e6', width: 1 });
      rule.roughness = 0;
    }
    const ty = top + (rowH - lineH) / 2;
    const keys = markers(f);
    let kx = x + PAD_X;
    for (const k of keys) {
      s.text(k, kx, ty + (lineH - textHeight(1, m.keySize)) / 2 + 1, { size: m.keySize, colour: KEY_COLOUR[k], role: 'node-label' });
      kx += measure(`${k} `, m.keySize);
    }
    s.text(f.name, nameX, ty, { size: m.size, role: 'node-label' });
    if (f.type) s.text(f.type, typeX, ty, { size: m.size, colour: colour.grey, role: 'node-label' });
  });

  const frame = s.node('box', x, y, w, h, '', { fill: colour.none });
  frame.roundness = null;
  frame.customData = { role: 'node', kind: 'box', entity: entity.id };
  for (const e of s.elements.slice(first)) e.groupIds = [group];

  return { id: entity.id, frame, x, y, w, h, headerH, fieldY: (n) => ys.get(n) };
}

// ---------------------------------------------------------------------------------------------
// Routing

type Side = 'l' | 'r' | 't' | 'b';
const DIR: Record<Side, P> = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };
const horiz = (s: Side) => s === 'l' || s === 'r';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Channel {
  key: string;
  /** 'v' = vertical channel (a column gap, fixed x); 'h' = horizontal channel (a row gap, fixed y). */
  kind: 'v' | 'h';
  at: number;
  /** Half the channel's clear width, so tracks stay inside it. */
  half: number;
}

interface Candidate {
  pts: P[];
  sides: [Side, Side];
  /** Channel uses: which points share the channel coordinate. */
  uses: Array<{ ch: Channel; idx: number[] }>;
  rank: number;
}

const segHitsBox = (a: P, b: P, r: Box, m: number) =>
  Math.max(a[0], b[0]) > r.x - m && Math.min(a[0], b[0]) < r.x + r.w + m && Math.max(a[1], b[1]) > r.y - m && Math.min(a[1], b[1]) < r.y + r.h + m;

function crossings(pts: P[], other: P[]): number {
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++)
    for (let j = 0; j < other.length - 1; j++) {
      const [a, b] = [pts[i]!, pts[i + 1]!];
      const [c, d] = [other[j]!, other[j + 1]!];
      const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
      if (Math.abs(den) < 1e-9) {
        // Collinear overlap counts as worse than a crossing.
        const sameLine = (a[0] === b[0] && c[0] === d[0] && Math.abs(a[0] - c[0]) < 4) || (a[1] === b[1] && c[1] === d[1] && Math.abs(a[1] - c[1]) < 4);
        if (sameLine) {
          const k = a[0] === b[0] ? 1 : 0;
          if (Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k])) - Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k])) > 2) n += 3;
        }
        continue;
      }
      const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
      const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
      if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) n++;
    }
  return n;
}

const pathLen = (pts: P[]) => pts.slice(1).reduce((t, p, i) => t + Math.abs(p[0] - pts[i]![0]) + Math.abs(p[1] - pts[i]![1]), 0);

/** Lay out an ER / data-model diagram on a grid and return the scene. */
export function er(spec: ErSpec): Scene {
  const s = new Scene();
  const GX = spec.gapX ?? 140;
  const GY = spec.gapY ?? 90;
  const topts: TableOpts = { size: spec.size, minWidth: spec.minWidth };
  const labelSize = Math.max(13, (spec.size ?? 15) - 1);

  let Y0 = 30;
  if (spec.title) {
    s.title(30, 20, spec.title);
    Y0 = 84;
  }

  // ---- grid ----
  const ids = new Set<string>();
  for (const e of spec.entities) {
    if (ids.has(e.id)) throw new Error(`er: entity id "${e.id}" is used twice`);
    ids.add(e.id);
  }
  const sizes = new Map(spec.entities.map((e) => [e.id, tableSize(e, topts)]));
  const maxCol = Math.max(...spec.entities.map((e) => Math.floor(e.c)));
  const maxRow = Math.max(...spec.entities.map((e) => Math.floor(e.r)));
  const colW = Array.from({ length: maxCol + 1 }, () => spec.minWidth ?? 170);
  const rowH = Array.from({ length: maxRow + 1 }, () => 60);
  for (const e of spec.entities) {
    const z = sizes.get(e.id)!;
    if (Number.isInteger(e.c)) colW[e.c] = Math.max(colW[e.c]!, z.w);
    if (Number.isInteger(e.r)) rowH[e.r] = Math.max(rowH[e.r]!, z.h);
  }
  const colLeft: number[] = [];
  let x = 30;
  for (let c = 0; c <= maxCol; c++) {
    colLeft[c] = x;
    x += colW[c]! + GX;
  }
  const rowTop: number[] = [];
  let y = Y0;
  for (let r = 0; r <= maxRow; r++) {
    rowTop[r] = y;
    y += rowH[r]! + GY;
  }
  const lerpGrid = (v: number, starts: number[], sizes2: number[], gap: number, mid: boolean) => {
    const i = Math.floor(v);
    const f = v - i;
    const start = (k: number) => starts[k] ?? (k < 0 ? starts[0]! - (gap + 0) : starts[starts.length - 1]! + sizes2[sizes2.length - 1]! + gap);
    const size = (k: number) => sizes2[k] ?? 0;
    if (!mid) return start(i) + f * (start(i + 1) - start(i));
    // Grid waypoints: integer = cell centre, x.5 = gap centre, interpolated piecewise between.
    const centre = (k: number) => start(k) + size(k) / 2;
    const gapMid = (start(i) + size(i) + start(i + 1)) / 2;
    return f <= 0.5 ? centre(i) + (gapMid - centre(i)) * (f / 0.5) : gapMid + (centre(i + 1) - gapMid) * ((f - 0.5) / 0.5);
  };
  const gx = (c: number) => lerpGrid(c, colLeft, colW, GX, true);
  const gy = (r: number) => lerpGrid(r, rowTop, rowH, GY, true);

  // ---- tables ----
  const tables = new Map<string, ErTable>();
  for (const e of spec.entities) {
    const z = sizes.get(e.id)!;
    const i = Math.floor(e.c);
    const left = lerpGrid(e.c, colLeft, colW, GX, false) + ((colW[i] ?? z.w) - z.w) / 2;
    const top = lerpGrid(e.r, rowTop, rowH, GY, false);
    tables.set(e.id, entityTable(s, left, top, e, topts));
  }
  const boxes = [...tables.values()].map((t) => ({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h }));

  // ---- channels: the column gaps and row gaps (and one outside each edge) never hold a table ----
  const channels: Channel[] = [];
  for (let c = -1; c <= maxCol; c++) {
    const lo = c < 0 ? colLeft[0]! - GX : colLeft[c]! + colW[c]!;
    const hi = c === maxCol ? lo + GX : colLeft[c + 1]!;
    channels.push({ key: `v${c}`, kind: 'v', at: (lo + hi) / 2, half: (hi - lo) / 2 });
  }
  for (let r = -1; r <= maxRow; r++) {
    const lo = r < 0 ? rowTop[0]! - GY : rowTop[r]! + rowH[r]!;
    const hi = r === maxRow ? lo + GY : rowTop[r + 1]!;
    channels.push({ key: `h${r}`, kind: 'h', at: (lo + hi) / 2, half: (hi - lo) / 2 });
  }
  const used = new Map<string, Array<{ off: number; lo: number; hi: number }>>();
  const TRACK = 16;
  const allocate = (ch: Channel, lo: number, hi: number): number => {
    const list = used.get(ch.key) ?? [];
    const limit = Math.max(0, ch.half - 46);
    for (let k = 0; k < 12; k++) {
      const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * TRACK;
      if (Math.abs(off) > limit && k > 0) continue;
      if (!list.some((u) => u.off === off && u.lo < hi + 10 && u.hi > lo - 10)) {
        list.push({ off, lo, hi });
        used.set(ch.key, list);
        return off;
      }
    }
    return 0;
  };

  // Anchor points already taken on a table side, so two lines never share an end.
  const taken = new Map<string, number[]>();
  const anchor = (t: ErTable, side: Side, field: string | undefined, gap: number, along?: number): P => {
    const key = `${t.id}:${side}`;
    const list = taken.get(key) ?? [];
    let v: number;
    if (horiz(side)) v = along ?? (field !== undefined ? t.fieldY(field) : undefined) ?? t.y + t.headerH + (t.h - t.headerH) / 2;
    else v = along ?? t.x + t.w / 2;
    const step = horiz(side) ? 9 : 28;
    const base = v;
    for (let k = 1; list.some((u) => Math.abs(u - v) < step - 1) && k <= 8; k++) v = base + (k % 2 ? 1 : -1) * step * Math.ceil(k / 2);
    if (side === 'l') return [t.x - gap, v];
    if (side === 'r') return [t.x + t.w + gap, v];
    if (side === 't') return [v, t.y - gap];
    return [v, t.y + t.h + gap];
  };
  const commitAnchor = (t: ErTable, side: Side, p: P) => {
    const key = `${t.id}:${side}`;
    taken.set(key, [...(taken.get(key) ?? []), horiz(side) ? p[1] : p[0]]);
  };

  const routed: P[][] = [];
  const plates: Box[] = [];

  const clear = (pts: P[], a: ErTable, b: ErTable) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [p, q] = [pts[i]!, pts[i + 1]!];
      for (const bx of boxes) {
        if (bx.id === a.id && i === 0) continue;
        if (bx.id === b.id && i === pts.length - 2) continue;
        if (segHitsBox(p, q, bx, bx.id === a.id || bx.id === b.id ? 4 : 12)) return false;
      }
    }
    return true;
  };

  const candidates = (a: ErTable, b: ErTable, rel: ErRelation, gap: [number, number]): Candidate[] => {
    const out: Candidate[] = [];
    const sides: Side[] = ['l', 'r', 't', 'b'];
    const sideBySide = a !== b && (b.x >= a.x + a.w || b.x + b.w <= a.x);
    // Neither end names a field and the tables face each other: run straight across their overlap.
    const overlapY: [number, number] = [Math.max(a.y + a.headerH, b.y + b.headerH) + 6, Math.min(a.y + a.h, b.y + b.h) - 6];
    const overlapX: [number, number] = [Math.max(a.x, b.x) + 16, Math.min(a.x + a.w, b.x + b.w) - 16];
    for (const sa of sides)
      for (const sb of sides) {
        let alongA: number | undefined;
        let alongB: number | undefined;
        if (horiz(sa) && horiz(sb) && rel.fromField === undefined && rel.toField === undefined && overlapY[1] > overlapY[0]) alongA = alongB = (overlapY[0] + overlapY[1]) / 2;
        if (!horiz(sa) && !horiz(sb) && a !== b && overlapX[1] > overlapX[0]) alongA = alongB = (overlapX[0] + overlapX[1]) / 2;
        const pA = anchor(a, sa, rel.fromField, gap[0], alongA);
        const pB = anchor(b, sb, rel.toField, gap[1], alongB);
        if (a === b && sa === sb && Math.abs(horiz(sa) ? pA[1] - pB[1] : pA[0] - pB[0]) < 2) continue;
        const dA = DIR[sa];
        const dB = DIR[sb];
        // Not anchoring at a named field's row costs, but only when the tables sit side by side.
        let rank = 0;
        if (sideBySide && rel.fromField !== undefined && !horiz(sa)) rank += 90;
        if (sideBySide && rel.toField !== undefined && !horiz(sb)) rank += 90;
        if (a === b && sa !== sb) continue;
        const push = (pts: P[], uses: Candidate['uses'], bends: number) => out.push({ pts, sides: [sa, sb], uses, rank: rank + bends * 40 });
        const ahead = (p: P, d: P, q: P, min = 18) => (q[0] - p[0]) * d[0] + (q[1] - p[1]) * d[1] >= min;

        if (horiz(sa) && horiz(sb)) {
          if (dA[0] === -dB[0] && a !== b) {
            if (!ahead(pA, dA, pB, 30)) continue;
            if (Math.abs(pA[1] - pB[1]) < 1) push([pA, pB], [], 0);
            else
              for (const ch of channels.filter((c) => c.kind === 'v' && ahead(pA, dA, [c.at, 0], 24) && ahead(pB, dB, [c.at, 0], 24)))
                push([pA, [ch.at, pA[1]], [ch.at, pB[1]], pB], [{ ch, idx: [1, 2] }], 2);
          } else if (dA[0] === dB[0]) {
            for (const ch of channels.filter((c) => c.kind === 'v' && ahead(pA, dA, [c.at, 0], 24) && ahead(pB, dB, [c.at, 0], 24)))
              push([pA, [ch.at, pA[1]], [ch.at, pB[1]], pB], [{ ch, idx: [1, 2] }], 2);
          }
        } else if (!horiz(sa) && !horiz(sb)) {
          if (dA[1] === -dB[1] && a !== b) {
            if (!ahead(pA, dA, pB, 30)) continue;
            if (Math.abs(pA[0] - pB[0]) < 1) push([pA, pB], [], 0);
            else
              for (const ch of channels.filter((c) => c.kind === 'h' && ahead(pA, dA, [0, c.at], 24) && ahead(pB, dB, [0, c.at], 24)))
                push([pA, [pA[0], ch.at], [pB[0], ch.at], pB], [{ ch, idx: [1, 2] }], 2);
          } else if (dA[1] === dB[1]) {
            for (const ch of channels.filter((c) => c.kind === 'h' && ahead(pA, dA, [0, c.at], 24) && ahead(pB, dB, [0, c.at], 24)))
              push([pA, [pA[0], ch.at], [pB[0], ch.at], pB], [{ ch, idx: [1, 2] }], 2);
          }
        } else if (a !== b) {
          const corner: P = horiz(sa) ? [pB[0], pA[1]] : [pA[0], pB[1]];
          if (ahead(pA, dA, corner, 30) && ahead(pB, dB, corner, 30)) push([pA, corner, pB], [], 1);
        }
      }
    return out;
  };

  const viaRoute = (a: ErTable, b: ErTable, rel: ErRelation, gap: [number, number]): P[] => {
    const via = rel.via!.map(([c, r]) => [gx(c), gy(r)] as P);
    const endFor = (t: ErTable, towards: P, field: string | undefined, g: number): P => {
      if (towards[1] > t.y + 4 && towards[1] < t.y + t.h - 4) return towards[0] >= t.x + t.w / 2 ? [t.x + t.w + g, towards[1]] : [t.x - g, towards[1]];
      if (towards[0] > t.x + 4 && towards[0] < t.x + t.w - 4) return towards[1] >= t.y + t.h / 2 ? [towards[0], t.y + t.h + g] : [towards[0], t.y - g];
      const fy = field !== undefined ? t.fieldY(field) : undefined;
      return towards[0] >= t.x + t.w / 2 ? [t.x + t.w + g, fy ?? t.y + t.h / 2] : [t.x - g, fy ?? t.y + t.h / 2];
    };
    return [endFor(a, via[0]!, rel.fromField, gap[0]), ...via, endFor(b, via[via.length - 1]!, rel.toField, gap[1])];
  };

  const sideOf = (t: ErTable, p: P): Side => {
    if (Math.abs(p[0] - t.x) < 10) return 'l';
    if (Math.abs(p[0] - (t.x + t.w)) < 10) return 'r';
    return p[1] < t.y + t.h / 2 ? 't' : 'b';
  };

  // ---- relationships ----
  for (const rel of spec.relations) {
    const a = tables.get(rel.from);
    const b = tables.get(rel.to);
    if (!a || !b) throw new Error(`er: relation ${rel.from} -> ${rel.to} names an unknown entity`);
    const heads = rel.heads ?? 'none';
    const gap: [number, number] = [heads === 'both' ? 6 : 3, heads === 'none' ? 3 : 6];
    let pts: P[];
    if (rel.via) pts = viaRoute(a, b, rel, gap);
    else {
      const cands = candidates(a, b, rel, gap).filter((c) => clear(c.pts, a, b));
      if (cands.length === 0) throw new Error(`er: no clear route for ${rel.from} -> ${rel.to}; give it \`via\` waypoints`);
      const score = (c: Candidate) => c.rank + routed.reduce((n, o) => n + crossings(c.pts, o), 0) * 70 + pathLen(c.pts) * 0.08;
      const best = cands.sort((p, q) => score(p) - score(q))[0]!;
      pts = best.pts.map((p) => [...p] as P);
      for (const u of best.uses) {
        const k = u.ch.kind === 'v' ? 1 : 0; // the coordinate the tracks spread along
        const span = u.idx.map((i) => pts[i]![k]);
        const off = allocate(u.ch, Math.min(...span), Math.max(...span));
        for (const i of u.idx) pts[i]![u.ch.kind === 'v' ? 0 : 1] += off;
      }
    }
    const [start, end] = [pts[0]!, pts[pts.length - 1]!];
    const sa = sideOf(a, start);
    const sb = sideOf(b, end);
    commitAnchor(a, sa, start);
    commitAnchor(b, sb, end);

    const arrow = s.arrow(a.frame, b.frame, { startAt: start, endAt: end, via: pts.slice(1, -1), dashed: rel.dashed, colour: rel.colour, heads: heads === 'end' ? 'end' : heads });
    if (heads === 'none') arrow.endArrowhead = null;
    // Keep both ends bound so the line follows its tables when they are dragged in excalidraw.com.
    arrow.startBinding = { elementId: a.frame.id, focus: 0, gap: gap[0], fixedPoint: null };
    arrow.endBinding = { elementId: b.frame.id, focus: 0, gap: gap[1], fixedPoint: null };
    routed.push(pts);

    // ---- labels: cardinality beside each end, then the name on a clear stretch ----
    const plateBox = (text: string, at: P, size: number): Box => {
      const w = measure(text, size) + 12;
      const h = textHeight(1, size) + 6;
      return { x: at[0] - w / 2, y: at[1] - h / 2, w, h };
    };
    const free = (bx: Box, own: P[]) =>
      !boxes.some((t) => segHitsBox([bx.x, bx.y], [bx.x + bx.w, bx.y + bx.h], t, 3)) &&
      !plates.some((p) => segHitsBox([bx.x, bx.y], [bx.x + bx.w, bx.y + bx.h], p, 3)) &&
      !routed.some((o) => o !== own && o.slice(1).some((q, i) => segHitsBox(o[i]!, q, bx, 2)));
    const ownOther = (bx: Box, segs: P[], skip: number) => segs.slice(1).some((q, i) => i !== skip && segHitsBox(segs[i]!, q, bx, 3));

    const card = (text: string | undefined, end: 'start' | 'end') => {
      if (!text) return;
      const p = end === 'start' ? pts[0]! : pts[pts.length - 1]!;
      const nxt = end === 'start' ? pts[1]! : pts[pts.length - 2]!;
      const seg = end === 'start' ? 0 : pts.length - 2;
      const len = Math.hypot(nxt[0] - p[0], nxt[1] - p[1]) || 1;
      const u: P = [(nxt[0] - p[0]) / len, (nxt[1] - p[1]) / len];
      const n: P = [-u[1], u[0]];
      const w = measure(text, labelSize) + 12;
      const h = textHeight(1, labelSize) + 6;
      const alongBase = (Math.abs(u[0]) * w + Math.abs(u[1]) * h) / 2 + 5;
      const perp = (Math.abs(n[0]) * w + Math.abs(n[1]) * h) / 2 + 3;
      // Prefer the outside of the first bend, then the inside, then further along.
      const turn = pts.length > 2 ? (end === 'start' ? pts[2]! : pts[pts.length - 3]!) : null;
      const inside = turn ? Math.sign((turn[0] - nxt[0]) * n[0] + (turn[1] - nxt[1]) * n[1]) : 0;
      const order = inside > 0 ? [-1, 1] : [1, -1];
      const tries: P[] = [];
      for (const extra of [0, 14, 28])
        for (const sgn of order) tries.push([p[0] + u[0] * (alongBase + extra) + n[0] * perp * sgn, p[1] + u[1] * (alongBase + extra) + n[1] * perp * sgn]);
      const at = tries.find((t) => {
        const bx = plateBox(text, t, labelSize);
        return free(bx, pts) && !ownOther(bx, pts, seg);
      }) ?? tries[0]!;
      const plate = s.plate(text, at, arrow.id, labelSize, 200);
      plates.push({ x: plate.x, y: plate.y, w: plate.width, h: plate.height });
    };
    card(rel.fromCard, 'start');
    card(rel.toCard, 'end');

    if (rel.label) {
      const size = labelSize;
      let at = rel.labelAt;
      if (!at) {
        const segs = pts.slice(1).map((q, i) => ({ i, a: pts[i]!, b: q, len: Math.hypot(q[0] - pts[i]![0], q[1] - pts[i]![1]) })).sort((p, q) => q.len - p.len);
        const pw = measure(rel.label, size) + 12;
        const ph = textHeight(1, size) + 6;
        // On the line where the plate leaves some line showing either side; otherwise beside the line.
        const on: P[] = [];
        const beside: P[] = [];
        for (const sg of segs) {
          const vertical = sg.a[0] === sg.b[0];
          const extent = vertical ? ph : pw;
          for (const f of [0.5, 0.35, 0.65]) {
            const m: P = [sg.a[0] + (sg.b[0] - sg.a[0]) * f, sg.a[1] + (sg.b[1] - sg.a[1]) * f];
            if (extent + 20 <= sg.len) on.push(m);
            for (const sgn of [1, -1]) beside.push(vertical ? [m[0] + sgn * (pw / 2 + 4), m[1]] : [m[0], m[1] + sgn * (ph / 2 + 4)]);
          }
        }
        const ok = (p: P) => {
          const bx = plateBox(rel.label!, p, size);
          return free(bx, pts) && !pts.slice(1).some((q, i) => segHitsBox(pts[i]!, q, bx, 1) && !on.includes(p));
        };
        // Nowhere clean: take the spot that hits the fewest tables and labels (the fit check will say so).
        const hits = (p: P) => {
          const bx = plateBox(rel.label!, p, size);
          return boxes.filter((t) => segHitsBox([bx.x, bx.y], [bx.x + bx.w, bx.y + bx.h], t, 0)).length * 2 + plates.filter((q) => segHitsBox([bx.x, bx.y], [bx.x + bx.w, bx.y + bx.h], q, 0)).length;
        };
        at = on.find(ok) ?? beside.find(ok) ?? [...on, ...beside].sort((p, q) => hits(p) - hits(q))[0]!;
      }
      const plate = s.plate(rel.label, at, arrow.id, size, 160);
      plates.push({ x: plate.x, y: plate.y, w: plate.width, h: plate.height });
    }
  }
  return s;
}
