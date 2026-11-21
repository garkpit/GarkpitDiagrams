// flow(): flowcharts and swim lanes on a grid. Nodes sit in cells (fractions allowed); each row is
// as tall as its tallest node, so nothing overlaps vertically; edges route straight, as an elbow,
// around the outside, or through grid waypoints.
import { measure, textHeight, wrapPx } from './font.ts';
import { colour, type El, type Kind, laneFills, neededHeight, type Port, portPoint, Scene, type Side } from './scene.ts';

/** A side of a node, optionally with an offset along it (fraction of the side, -0.5 to 0.5; default 0, the middle). */
export type FlowPort = Side | [Side, number];

export interface FlowNode {
  id: string;
  /** Grid column and row (fractions allowed). */
  c: number;
  r: number;
  text: string;
  kind?: Kind;
  fill?: string;
  /** Width in grid cells (default 1). */
  span?: number;
  size?: number;
  bold?: boolean;
  dashed?: boolean;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
  colour?: string;
  /** straight (default when aligned), direct (diagonal), h = horizontal then vertical, v = vertical then
   *  horizontal, below/above/left/right = loop around the outside by `off` px past the two nodes. */
  route?: 'straight' | 'direct' | 'h' | 'v' | 'below' | 'above' | 'left' | 'right';
  /** Explicit waypoints in grid units: [column, row], fractions allowed (2.5 = the gap after column 2). */
  via?: Array<[number, number]>;
  off?: number;
  labelAt?: [number, number];
  heads?: 'end' | 'both' | 'none';
  /** Leave `from` from this side (and offset) instead of aiming from its centre; routes start at the port. */
  exit?: FlowPort;
  /** Arrive at `to` on this side (and offset); routes end at the port. */
  enter?: FlowPort;
  /** A self-loop (from === to): an orthogonal loop out of this side at -0.25, `off` px out, and back in at +0.25. */
  self?: Side;
}

export interface FlowBand {
  c: number;
  r: number;
  /** Width in columns and height in rows. */
  cw: number;
  rh: number;
  label: string;
  fill?: string;
  /** Which top corner the label sits in (default left). */
  labelAt?: 'left' | 'right';
}

/** A band's header: 10 px above its 17 px label, the label, 13 px below; grows by a line per wrapped line. */
const BAND_HEAD = 44;
const BAND_LABEL = 17;
/** The least open space between a band's edge and the nodes facing it across a row gap. */
const BAND_CLEAR = 16;

export interface FlowSpec {
  title?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  cellW?: number;
  cellH?: number;
  gapX?: number;
  gapY?: number;
  /**
   * Bands drawn behind the nodes: a grid rectangle in cells, with a label. Bands nest by themselves:
   * a band whose rectangle lies within another's is drawn inside it, each level padded further out,
   * and the gap above a row grows to fit the labels of the bands that start there.
   */
  bands?: FlowBand[];
  /** Padding per band level at the sides and bottom, in px (default 20). The top gets a label line per level. */
  bandPad?: number;
  notes?: Array<{ c: number; r: number; text: string; w?: number }>;
  /** Lanes: each lane owns grid rows [r0, r1]. Lanes add a label column on the left. */
  lanes?: Array<{ name: string; r0: number; r1: number; fill?: string }>;
}

/** Lay out a flowchart or swim-lane diagram on a grid and return the scene. */
export function flow(spec: FlowSpec): Scene {
  const s = new Scene();
  const W = spec.cellW ?? 220;
  const H = spec.cellH ?? 84;
  const GX = spec.gapX ?? 70;
  const GY = spec.gapY ?? 60;
  const LABEL = spec.lanes ? 170 : 0;
  const PAD = spec.bandPad ?? 20;
  const nest = nestBands(spec.bands ?? [], PAD, (b, left, right) => {
    const w = b.cw * (W + GX) - GX + left + right;
    const lines = b.label ? wrapPx(b.label, w - 28, BAND_LABEL).length : 1;
    return BAND_HEAD + textHeight(lines, BAND_LABEL) - textHeight(1, BAND_LABEL);
  });
  // Bands nested in column 0 push the grid right, so the outermost keeps its edge where one band's would be.
  const X0 = 30 + LABEL + (spec.lanes ? 24 : 0) + Math.max(0, ...nest.filter((n) => n.band.c === 0).map((n) => n.left - PAD));
  // The header stack of the bands starting at a row, and the bottom padding of the bands ending at one.
  const startsAt = (r: number) => Math.max(0, ...nest.filter((n) => n.band.r === r).map((n) => n.top));
  const endsAt = (r: number) => Math.max(0, ...nest.filter((n) => n.band.r + n.band.rh - 1 === r).map((n) => n.bottom));

  let Y0 = 30 + Math.max(0, startsAt(0) - BAND_HEAD);
  if (spec.title) {
    s.title(30, 20, spec.title);
    Y0 = startsAt(0) > 0 ? 84 + startsAt(0) : 72;
  }

  // Row heights: the tallest node in each row decides, so nothing overlaps vertically.
  const maxRow = Math.max(...spec.nodes.map((n) => Math.ceil(n.r)), ...(spec.lanes ?? []).map((l) => l.r1), ...(spec.notes ?? []).map((n) => Math.ceil(n.r)));
  const rowH: number[] = Array.from({ length: maxRow + 1 }, () => H);
  const width = (n: FlowNode) => (n.span ?? 1) * W + ((n.span ?? 1) - 1) * GX;
  for (const n of spec.nodes) {
    if (!Number.isInteger(n.r)) continue;
    rowH[n.r] = Math.max(rowH[n.r]!, neededHeight(n.kind ?? 'box', width(n), n.text, n.size ?? 16));
  }
  // The gap above each row: gapY, or more where bands end in the row above or start in this one,
  // so their padding and header stacks fit and leave open space between them: half a gapY (at least
  // BAND_CLEAR) between a band edge and nodes, a whole gapY between two band edges facing each other,
  // so an arrow crossing from one group to the next has room for its label.
  const gapAbove = (r: number) => {
    const end = endsAt(r - 1);
    const start = startsAt(r);
    if (end === 0 && start === 0) return GY;
    return Math.max(GY, end + start + (end > 0 && start > 0 ? GY : Math.max(BAND_CLEAR, GY / 2)));
  };
  const rowTop: number[] = [];
  let y = Y0 + (spec.lanes ? 20 : 0);
  for (let r = 0; r <= maxRow; r++) {
    if (r > 0) y += gapAbove(r);
    rowTop[r] = y;
    y += rowH[r]!;
  }
  y += GY;
  const rowY = (r: number) => {
    const lo = Math.floor(r);
    const top = rowTop[lo] ?? y;
    const next = rowTop[lo + 1] ?? top + (rowH[lo] ?? H) + GY;
    return top + (next - top) * (r - lo);
  };
  const colX = (c: number) => X0 + c * (W + GX);
  const maxCol = Math.max(...spec.nodes.map((n) => n.c + (n.span ?? 1)));
  const right = colX(maxCol) - GX + 30;

  spec.lanes?.forEach((l, i) => {
    const top = rowTop[l.r0]! - GY / 2;
    const bottom = rowTop[l.r1]! + rowH[l.r1]! + GY / 2;
    s.lane(30, top, right - 30, bottom - top, l.name, LABEL, l.fill ?? laneFills[i % laneFills.length]);
  });
  // Outermost first, so each band is drawn over the one that holds it.
  for (const n of [...nest].sort((p, q) => q.depth - p.depth || p.order - q.order)) {
    const b = n.band;
    const x = colX(b.c) - n.left;
    const top = rowY(b.r) - n.top;
    const w = b.cw * (W + GX) - GX + n.left + n.right;
    const bottom = rowY(b.r + b.rh - 1) + rowH[Math.min(maxRow, Math.floor(b.r + b.rh - 1))]! + n.bottom;
    s.band(x, top, w, bottom - top, b.label, b.fill ?? colour.paper, true, BAND_LABEL, b.labelAt);
  }

  const els = new Map<string, El>();
  for (const n of spec.nodes) {
    if (els.has(n.id)) throw new Error(`flow: node id "${n.id}" is used twice`);
    const kind = n.kind ?? 'box';
    if (kind === 'start' || kind === 'final') {
      const rh = Number.isInteger(n.r) ? rowH[n.r]! : H;
      els.set(n.id, s.pseudo(kind, colX(n.c) + width(n) / 2, rowY(n.r) + rh / 2));
      continue;
    }
    const w = width(n);
    const rh = Number.isInteger(n.r) ? rowH[n.r]! : H;
    const h = Math.max(kind === 'diamond' ? rh : H, neededHeight(kind, w, n.text, n.size ?? 16));
    const top = rowY(n.r) + (rh - h) / 2;
    els.set(n.id, s.node(kind, colX(n.c), top, w, h, n.text, { fill: n.fill, size: n.size, bold: n.bold, dashed: n.dashed }));
  }

  // Integer row: the row's centre. Fractional r: that fraction of the gap below row floor(r).
  const gx = (c: number) => colX(c) + W / 2;
  const gy = (r: number) => {
    if (Number.isInteger(r)) return rowY(r) + rowH[r]! / 2;
    const lo = Math.floor(r);
    if (lo < 0) return rowTop[0]! - GY * (lo - r + 1);
    const gap = (rowTop[lo + 1] ?? rowTop[lo]! + rowH[lo]! + GY) - rowTop[lo]! - rowH[lo]!;
    return rowTop[lo]! + rowH[lo]! + gap * (r - lo);
  };

  for (const e of spec.edges) {
    const a = els.get(e.from);
    const b = els.get(e.to);
    if (!a || !b) throw new Error(`flow: edge ${e.from} -> ${e.to} names an unknown node`);
    const ax = a.x + a.width / 2;
    const ay = a.y + a.height / 2;
    const bx = b.x + b.width / 2;
    const by = b.y + b.height / 2;
    const off = e.off ?? 36;
    if (e.self) {
      if (a !== b) throw new Error(`flow: edge ${e.from} -> ${e.to} has \`self\` but joins two different nodes`);
      selfLoop(s, a, e.self, off, e);
      continue;
    }
    const startPort = toPort(e.exit);
    const endPort = toPort(e.enter);
    // Routes run from the ports when given, else from the centres.
    const [px, py] = startPort ? portPoint(a, startPort) : [ax, ay];
    const [qx, qy] = endPort ? portPoint(b, endPort) : [bx, by];
    let via: [number, number][] = [];
    const route = e.route ?? (Math.abs(py - qy) < 2 || Math.abs(px - qx) < 2 ? 'straight' : 'h');
    if (e.via) via = e.via.map(([c, r]) => [gx(c), gy(r)] as [number, number]);
    else if (route === 'h') via = [[qx, py]];
    else if (route === 'v') via = [[px, qy]];
    else if (route === 'below') {
      const yy = Math.max(a.y + a.height, b.y + b.height) + off;
      via = [[px, yy], [qx, yy]];
    } else if (route === 'above') {
      const yy = Math.min(a.y, b.y) - off;
      via = [[px, yy], [qx, yy]];
    } else if (route === 'left') {
      const xx = Math.min(a.x, b.x) - off;
      via = [[xx, py], [xx, qy]];
    } else if (route === 'right') {
      const xx = Math.max(a.x + a.width, b.x + b.width) + off;
      via = [[xx, py], [xx, qy]];
    }
    s.arrow(a, b, { label: e.label, dashed: e.dashed, colour: e.colour, via, labelAt: e.labelAt, heads: e.heads, startPort, endPort });
  }

  for (const n of spec.notes ?? []) s.note(colX(n.c), rowY(n.r), n.text, { size: 15, maxPx: n.w ?? 2 * W });
  return s;
}

const toPort = (p: FlowPort | undefined): Port | undefined => (p === undefined ? undefined : Array.isArray(p) ? { side: p[0], at: p[1] } : { side: p });

/**
 * A self-loop on one side of a node: out at -0.25 of the side, `off` px past the node's edge, along,
 * and back in at +0.25. The label is centred on the outer segment, or just beyond it when the
 * segment is too short to show either side of the label's plate.
 */
function selfLoop(s: Scene, n: El, side: Side, off: number, e: FlowEdge): void {
  const p0 = portPoint(n, { side, at: -0.25 });
  const p3 = portPoint(n, { side, at: 0.25 });
  const vertical = side === 'top' || side === 'bottom';
  const outer = side === 'top' ? n.y - off : side === 'bottom' ? n.y + n.height + off : side === 'left' ? n.x - off : n.x + n.width + off;
  const p1: [number, number] = vertical ? [p0[0], outer] : [outer, p0[1]];
  const p2: [number, number] = vertical ? [p3[0], outer] : [outer, p3[1]];
  let labelAt = e.labelAt;
  if (e.label && !labelAt) {
    const size = 14;
    const lines = wrapPx(e.label, 150, size);
    const w = Math.max(...lines.map((l) => measure(l, size))) + 12;
    const h = textHeight(lines.length, size) + 6;
    const seg = vertical ? Math.abs(p2[0] - p1[0]) : Math.abs(p2[1] - p1[1]);
    const along = vertical ? w : h;
    const mid: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    if (along <= seg - 20) labelAt = mid;
    else {
      const out = (vertical ? h : w) / 2 + 4;
      labelAt = side === 'top' ? [mid[0], outer - out] : side === 'bottom' ? [mid[0], outer + out] : side === 'left' ? [outer - out, mid[1]] : [outer + out, mid[1]];
    }
  }
  s.arrow(n, n, {
    label: e.label,
    dashed: e.dashed,
    colour: e.colour,
    heads: e.heads,
    via: [p1, p2],
    labelAt,
    startPort: { side, at: -0.25 },
    endPort: { side, at: 0.25 }
  });
}

export interface NestedBand {
  band: FlowBand;
  order: number;
  depth: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Work out how bands nest and how far each reaches past its cells. Band A holds band B when B's
 * grid rectangle lies within A's (for two identical rectangles, the earlier one holds the later).
 * Each side's inset is `pad` plus the inset of the held bands that share that side, so a band
 * clears every band inside it; the top uses the header height instead of `pad`.
 */
export function nestBands(bands: FlowBand[], pad: number, head: (b: FlowBand, left: number, right: number) => number): NestedBand[] {
  const e = 1e-6;
  const holds = (a: number, b: number) => {
    const A = bands[a]!;
    const B = bands[b]!;
    if (a === b) return false;
    const within = B.c >= A.c - e && B.r >= A.r - e && B.c + B.cw <= A.c + A.cw + e && B.r + B.rh <= A.r + A.rh + e;
    const same = Math.abs(A.c - B.c) < e && Math.abs(A.r - B.r) < e && Math.abs(A.cw - B.cw) < e && Math.abs(A.rh - B.rh) < e;
    return within && (!same || a < b);
  };
  const inner = bands.map((_, a) => bands.map((_, b) => b).filter((b) => holds(a, b)));
  const memo = new Map<number, NestedBand>();
  const at = (a: number): NestedBand => {
    const done = memo.get(a);
    if (done) return done;
    const A = bands[a]!;
    const kids = inner[a]!.map(at);
    const edge = (pick: (n: NestedBand) => number, touches: (b: FlowBand) => boolean) => Math.max(0, ...kids.filter((k) => touches(k.band)).map(pick));
    const left = pad + edge((k) => k.left, (b) => Math.abs(b.c - A.c) < e);
    const right = pad + edge((k) => k.right, (b) => Math.abs(b.c + b.cw - A.c - A.cw) < e);
    const n: NestedBand = {
      band: A,
      order: a,
      depth: 1 + Math.max(0, ...kids.map((k) => k.depth)),
      left,
      right,
      top: head(A, left, right) + edge((k) => k.top, (b) => Math.abs(b.r - A.r) < e),
      bottom: pad + edge((k) => k.bottom, (b) => Math.abs(b.r + b.rh - A.r - A.rh) < e)
    };
    memo.set(a, n);
    return n;
  };
  return bands.map((_, a) => at(a));
}
