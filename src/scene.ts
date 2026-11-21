// A scene is a list of Excalidraw v2 elements built from a few primitives. Every element carries
// `customData.role`, which the fit check reads to know what each element is for (a node, its
// label, a lane, an arrow's label plate). The file opens unchanged in excalidraw.com.
import { blockWidth, FONT_EXCALIFONT, LINE_HEIGHT, measure, textHeight, wrapPx } from './font.ts';

export type El = Record<string, unknown> & {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Role =
  | 'title'
  | 'note'
  | 'text'
  | 'node'
  | 'node-label'
  | 'lane'
  | 'lane-label'
  | 'band'
  | 'band-label'
  | 'arrow'
  | 'arrow-plate'
  | 'arrow-label'
  | 'rect'
  | 'line';

export const roleOf = (e: Record<string, unknown>): Role | undefined => (e.customData as { role?: Role } | undefined)?.role;

export const colour = {
  ink: '#1e1e1e',
  grey: '#868e96',
  blue: '#a5d8ff',
  blueDark: '#1971c2',
  yellow: '#ffec99',
  green: '#b2f2bb',
  red: '#ffc9c9',
  violet: '#d0bfff',
  orange: '#ffd8a8',
  teal: '#96f2d7',
  pink: '#fcc2d7',
  paper: '#f8f9fa',
  white: '#ffffff',
  none: 'transparent'
};

/** Pale fills for lanes and groups, in the order lanes take them. */
export const laneFills = ['#e7f5ff', '#fff9db', '#f3f0ff', '#e6fcf5', '#fff4e6', '#f8f0fc'];

export type Kind = 'box' | 'diamond' | 'pill' | 'note' | 'store' | 'circle' | 'start' | 'final';

/** Diameter of the state-machine pseudostates. */
export const PSEUDO = { start: 26, final: 32 };

export interface NodeOpts {
  fill?: string;
  size?: number;
  dashed?: boolean;
  bold?: boolean;
  stroke?: string;
}

/** The inner text width a node of this kind and width can hold. */
export const innerWidth = (kind: Kind, w: number) => (kind === 'diamond' ? w * 0.56 : kind === 'pill' || kind === 'circle' ? w * 0.72 : w - 28);

/** The height a node must have to hold its wrapped label. */
export function neededHeight(kind: Kind, w: number, label: string, size: number): number {
  if (!label) return 0;
  const lines = wrapPx(label, innerWidth(kind, w), size).length;
  const th = textHeight(lines, size);
  if (kind === 'diamond') return th / 0.5 + 16;
  if (kind === 'pill' || kind === 'circle') return th / 0.7 + 20;
  return th + 28;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

/**
 * A point on one side of a node: `at` is the offset along that side from its centre, as a fraction
 * of the side's length (-0.5 to 0.5; negative is left on top/bottom, up on left/right).
 */
export interface Port {
  side: Side;
  at?: number;
}

/**
 * Where a port sits: just outside the node (by `gap` px) on the given side, at the given offset.
 * Exact for rectangles; for ellipses and diamonds the point is where a line through the offset,
 * square to the side, meets the outline, so an arrow leaving it runs straight out from that side.
 */
export function portPoint(e: El, port: Port, gap = 6): [number, number] {
  const u = 2 * Math.max(-0.5, Math.min(0.5, port.at ?? 0));
  const hw = e.width / 2;
  const hh = e.height / 2;
  const cx = e.x + hw;
  const cy = e.y + hh;
  const depth = e.type === 'ellipse' ? Math.sqrt(Math.max(0, 1 - u * u)) : e.type === 'diamond' ? 1 - Math.abs(u) : 1;
  const sign = port.side === 'top' || port.side === 'left' ? -1 : 1;
  if (port.side === 'top' || port.side === 'bottom') return [cx + u * hw, cy + sign * (depth * hh + gap)];
  return [cx + sign * (depth * hw + gap), cy + u * hh];
}

/**
 * Excalidraw's fixed point for a port: where it sits on the node's bounding box, as fractions of its
 * width and height. Exactly 0.5 is stored as 0.5001, as Excalidraw itself does (normalizeFixedPoint).
 */
export function fixedPoint(port: Port): [number, number] {
  const along = Math.max(0, Math.min(1, 0.5 + (port.at ?? 0)));
  const norm = (v: number) => (Math.abs(v - 0.5) < 1e-4 ? 0.5001 : v);
  const sides: Record<Side, [number, number]> = { top: [along, 0], bottom: [along, 1], left: [0, along], right: [1, along] };
  return sides[port.side].map(norm) as [number, number];
}

/**
 * Excalidraw's binding `focus` for an arrow end at `edge` whose neighbouring point is `adjacent`
 * (a port of determineFocusDistance in Excalidraw 0.18, unrotated shapes). It records how far off
 * centre the arrow meets the shape, so excalidraw.com keeps that offset when the node is dragged.
 */
export function bindingFocus(e: El, adjacent: [number, number], edge: [number, number]): number {
  const [ax, ay] = adjacent;
  const [bx, by] = edge;
  if (ax === bx && ay === by) return 0;
  const cx = e.x + e.width / 2;
  const cy = e.y + e.height / 2;
  const sign = -Math.sign((bx - ax) * (by - cy) - (by - ay) * (bx - cx));
  const len = Math.hypot(bx - ax, by - ay);
  const reach = Math.max(e.width * 2, e.height * 2);
  const far: [number, number] = [bx + ((bx - ax) / len) * reach, by + ((by - ay) / len) * reach];
  const { x, y, width: w, height: h } = e;
  const lines: Array<[[number, number], [number, number]]> =
    e.type === 'diamond'
      ? [[[x + w / 2, y - h], [x + w / 2, y + 2 * h]], [[x - w, y + h / 2], [x + 2 * w, y + h / 2]]]
      : [[[x - w, y - h], [x + 2 * w, y + 2 * h]], [[x + 2 * w, y - h], [x - w, y + 2 * h]]];
  // Excalidraw divides by the axis at the hit's position after sorting (not the line it hit); kept as is.
  const norm = (i: number) => (e.type === 'diamond' ? (i === 0 ? h : w) / 2 : Math.hypot(w, h) / 2);
  const hits = lines
    .map((l) => segmentIntersection([bx, by], far, l[0], l[1]))
    .filter((p): p is [number, number] => p !== null)
    .sort((m, n) => Math.hypot(m[0] - bx, m[1] - by) - Math.hypot(n[0] - bx, n[1] - by))
    .map((p, i) => (sign * Math.hypot(cx - p[0], cy - p[1])) / norm(i))
    .sort((m, n) => Math.abs(m) - Math.abs(n));
  return hits[0] ?? 0;
}

function segmentIntersection(p: [number, number], p2: [number, number], q: [number, number], q2: [number, number]): [number, number] | null {
  const rx = p2[0] - p[0];
  const ry = p2[1] - p[1];
  const sx = q2[0] - q[0];
  const sy = q2[1] - q[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * sy - (q[1] - p[1]) * sx) / den;
  const u = ((q[0] - p[0]) * ry - (q[1] - p[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [p[0] + t * rx, p[1] + t * ry] : null;
}

export interface ArrowOpts {
  label?: string;
  /** Absolute waypoints between the two ends. */
  via?: [number, number][];
  colour?: string;
  dashed?: boolean;
  /** Where the label's centre goes; default the midpoint of the longest segment. */
  labelAt?: [number, number];
  /** Arrowheads: 'end' (default), 'both' or 'none'. */
  heads?: 'end' | 'both' | 'none';
  /** Pin the start or end to an exact point instead of the shape's edge (e.g. a lifeline); that end is left unbound. */
  startAt?: [number, number];
  endAt?: [number, number];
  /** Leave from, or arrive at, a point on one side of the node instead of aiming at its centre; the end stays bound. */
  startPort?: Port;
  endPort?: Port;
  /**
   * An Excalidraw elbow arrow: needs startPort and endPort and orthogonal waypoints. Both ends bind
   * to fixed points on the ports' sides, so excalidraw.com re-routes the arrow round the nodes when
   * either is dragged. `pin` lists segments (1 = the first) to keep where they are when it does.
   */
  elbowed?: boolean;
  pin?: number[];
  labelSize?: number;
  /** Widest a label may run before it wraps. */
  labelMaxPx?: number;
  /** The label plate's fill (default white; match the background it sits on). */
  labelFill?: string;
}

export class Scene {
  elements: El[] = [];
  private nextId = 0;
  private seed = 7;

  /** Each scene numbers its own ids and seeds, so a scene renders the same whatever else is built alongside it. */
  private id(p: string) {
    return `${p}${(++this.nextId).toString(36)}`;
  }
  private rnd() {
    return (this.seed = (this.seed * 48271) % 2147483647);
  }

  private base(type: string, x: number, y: number, w: number, h: number, role: Role, extra: Record<string, unknown>): El {
    return {
      id: this.id(type[0]!),
      type,
      x,
      y,
      width: w,
      height: h,
      angle: 0,
      strokeColor: colour.ink,
      backgroundColor: colour.none,
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: null,
      roundness: null,
      seed: this.rnd(),
      version: 1,
      versionNonce: this.rnd(),
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
      customData: { role },
      ...extra
    };
  }

  private push<T extends El>(el: T): T {
    this.elements.push(el);
    return el;
  }

  /** Text at (x, y), wrapped to `maxPx` when given. Inside a container it is centred on the container. */
  text(
    text: string,
    x: number,
    y: number,
    opts: {
      size?: number;
      align?: 'left' | 'center' | 'right';
      colour?: string;
      maxPx?: number;
      container?: El;
      role?: Role;
      /** In a container: 'top' pins the text to the container's top, where excalidraw.com keeps it when edited. */
      valign?: 'top' | 'middle';
    } = {}
  ): El {
    const size = opts.size ?? 16;
    const lines = opts.maxPx ? wrapPx(text, opts.maxPx, size) : text.split('\n');
    const w = Math.max(...lines.map((l) => measure(l, size))) + 2;
    const h = textHeight(lines.length, size);
    const el = this.base('text', x, y, w, h, opts.role ?? (opts.container ? 'node-label' : 'text'), {
      strokeColor: opts.colour ?? colour.ink,
      text: lines.join('\n'),
      originalText: text,
      fontSize: size,
      fontFamily: FONT_EXCALIFONT,
      textAlign: opts.align ?? 'left',
      verticalAlign: opts.container ? (opts.valign ?? 'middle') : 'top',
      containerId: opts.container ? opts.container.id : null,
      autoResize: true,
      lineHeight: LINE_HEIGHT
    });
    if (opts.container) {
      el.x = opts.container.x + (opts.container.width - w) / 2;
      // Excalidraw's BOUND_TEXT_PADDING is 5 px; a top-aligned label sits exactly where it would put it.
      el.y = opts.valign === 'top' ? opts.container.y + 5 : opts.container.y + (opts.container.height - h) / 2;
      opts.container.boundElements = [...((opts.container.boundElements as unknown[]) ?? []), { id: el.id, type: 'text' }];
    } else if (opts.align === 'center') el.x = x - w / 2;
    else if (opts.align === 'right') el.x = x - w;
    return this.push(el);
  }

  /** A heading for the whole drawing. */
  title(x: number, y: number, text: string, size = 24): El {
    return this.text(text, x, y, { size, role: 'title' });
  }

  /** Free-standing grey annotation text. */
  note(x: number, y: number, text: string, opts: { size?: number; colour?: string; maxPx?: number; align?: 'left' | 'center' | 'right' } = {}): El {
    return this.text(text, x, y, { size: opts.size ?? 15, colour: opts.colour ?? colour.grey, maxPx: opts.maxPx, align: opts.align, role: 'note' });
  }

  /** A node with its label centred inside; it grows downwards to fit the label. */
  node(kind: Kind, x: number, y: number, w: number, h: number, label: string, opts: NodeOpts = {}): El {
    if (kind === 'start' || kind === 'final') return this.pseudo(kind, x + w / 2, y + h / 2);
    const size = opts.size ?? 16;
    h = Math.max(h, neededHeight(kind, w, label, size));
    if (kind === 'circle') h = w = Math.max(w, h);
    const shape = kind === 'diamond' ? 'diamond' : kind === 'pill' || kind === 'circle' ? 'ellipse' : 'rectangle';
    const fill =
      opts.fill ??
      (kind === 'diamond' ? colour.yellow : kind === 'pill' || kind === 'circle' ? colour.blue : kind === 'note' ? colour.white : kind === 'store' ? colour.violet : colour.paper);
    const el = this.push(
      this.base(shape, x, y, w, h, 'node', {
        backgroundColor: fill,
        strokeColor: opts.stroke ?? colour.ink,
        roundness: kind === 'box' || kind === 'store' || kind === 'note' ? { type: 3 } : kind === 'diamond' ? { type: 2 } : null,
        strokeStyle: opts.dashed || kind === 'note' ? 'dashed' : 'solid',
        strokeWidth: opts.bold ? 3 : 2,
        customData: { role: 'node', kind }
      })
    );
    if (label) this.text(label, 0, 0, { size, align: 'center', container: el, maxPx: innerWidth(kind, w) });
    return el;
  }

  /** A state-machine start dot or final bullseye centred on (cx, cy); label-less. */
  pseudo(kind: 'start' | 'final', cx: number, cy: number): El {
    const d = PSEUDO[kind];
    const el = this.push(
      this.base('ellipse', cx - d / 2, cy - d / 2, d, d, 'node', {
        backgroundColor: kind === 'start' ? colour.ink : colour.white,
        roughness: 0.6,
        customData: { role: 'node', kind }
      })
    );
    if (kind === 'final') {
      const r = 10;
      this.push(this.base('ellipse', cx - r, cy - r, 2 * r, 2 * r, 'rect', { backgroundColor: colour.ink, roughness: 0.6, groupIds: [el.id] }));
      el.groupIds = [el.id];
    }
    return el;
  }

  /** A swim lane: a wide pale band with its owner's name in a column at the left. */
  lane(x: number, y: number, w: number, h: number, name: string, labelW: number, fill = colour.paper): El {
    const el = this.push(this.base('rectangle', x, y, w, h, 'lane', { backgroundColor: fill, strokeColor: colour.grey, strokeWidth: 1, roughness: 0.5 }));
    const size = 18;
    const lines = wrapPx(name, labelW - 24, size);
    this.text(name, x + 14, y + (h - textHeight(lines.length, size)) / 2, { size, maxPx: labelW - 24, role: 'lane-label' });
    return el;
  }

  /** A group band behind nodes, with an optional label at its top left (or right). Draw it before the nodes it holds. */
  band(x: number, y: number, w: number, h: number, label: string, fill = colour.paper, dashed = true, size = 17, labelAt: 'left' | 'right' = 'left'): El {
    const el = this.push(
      this.base('rectangle', x, y, w, h, 'band', {
        backgroundColor: fill,
        strokeColor: colour.grey,
        strokeWidth: 1,
        strokeStyle: dashed ? 'dashed' : 'solid',
        roughness: 0.5,
        roundness: { type: 3 }
      })
    );
    if (label)
      this.text(label, labelAt === 'right' ? x + w - 14 : x + 14, y + 10, { size, colour: colour.ink, maxPx: w - 28, role: 'band-label', align: labelAt === 'right' ? 'right' : 'left' });
    return el;
  }

  /** A raw rectangle with no label (bars, markers, wireframe blocks). */
  rect(x: number, y: number, w: number, h: number, opts: { fill?: string; stroke?: string; dashed?: boolean; width?: number; rounded?: boolean; roughness?: number } = {}): El {
    return this.push(
      this.base('rectangle', x, y, w, h, 'rect', {
        backgroundColor: opts.fill ?? colour.none,
        strokeColor: opts.stroke ?? colour.ink,
        strokeStyle: opts.dashed ? 'dashed' : 'solid',
        strokeWidth: opts.width ?? 2,
        roughness: opts.roughness ?? 0.6,
        roundness: opts.rounded ? { type: 3 } : null
      })
    );
  }

  /** A straight line, or a polyline through `more` points. */
  line(x1: number, y1: number, x2: number, y2: number, opts: { colour?: string; dashed?: boolean; dotted?: boolean; width?: number; more?: [number, number][] } = {}): El {
    const abs: [number, number][] = [[x1, y1], [x2, y2], ...(opts.more ?? [])];
    const xs = abs.map((p) => p[0]);
    const ys = abs.map((p) => p[1]);
    return this.push(
      this.base('line', x1, y1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 'line', {
        strokeColor: opts.colour ?? colour.ink,
        strokeStyle: opts.dotted ? 'dotted' : opts.dashed ? 'dashed' : 'solid',
        strokeWidth: opts.width ?? 2,
        points: abs.map(([px, py]) => [px - x1, py - y1]),
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: null
      })
    );
  }

  /** An arrow from one element's edge to another's, optionally via waypoints, with an optional label on a white plate. */
  arrow(from: El, to: El, opts: ArrowOpts = {}): El {
    const c = (e: El): [number, number] => [e.x + e.width / 2, e.y + e.height / 2];
    const edge = (e: El, towards: [number, number]): [number, number] => {
      const [cx, cy] = c(e);
      const dx = towards[0] - cx;
      const dy = towards[1] - cy;
      const hw = e.width / 2;
      const hh = e.height / 2;
      if (dx === 0 && dy === 0) return [cx, cy];
      let t: number;
      if (e.type === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh); // |x|/hw + |y|/hh = 1
      else if (e.type === 'ellipse') t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
      else t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
      const gap = 6;
      const len = Math.hypot(dx, dy);
      return [cx + dx * t + (dx / len) * gap, cy + dy * t + (dy / len) * gap];
    };
    const via = opts.via ?? [];
    const endPort = opts.endPort ? portPoint(to, opts.endPort) : undefined;
    const start = opts.startAt ?? (opts.startPort ? portPoint(from, opts.startPort) : edge(from, via[0] ?? opts.endAt ?? endPort ?? c(to)));
    const end = opts.endAt ?? endPort ?? edge(to, via[via.length - 1] ?? start);
    const abs: [number, number][] = [start, ...via, end];
    const xs = abs.map((p) => p[0]);
    const ys = abs.map((p) => p[1]);
    const heads = opts.heads ?? 'end';
    if (opts.elbowed) {
      if (!opts.startPort || !opts.endPort) throw new Error('Scene.arrow: an elbowed arrow needs startPort and endPort');
      for (let i = 1; i < abs.length; i++)
        if (Math.abs(abs[i]![0] - abs[i - 1]![0]) > 1 && Math.abs(abs[i]![1] - abs[i - 1]![1]) > 1) throw new Error('Scene.arrow: an elbowed arrow must run in horizontal and vertical segments');
    }
    const el = this.push(
      this.base('arrow', start[0], start[1], Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 'arrow', {
        strokeColor: opts.colour ?? colour.ink,
        strokeStyle: opts.dashed ? 'dashed' : 'solid',
        roundness: null,
        points: abs.map(([px, py]) => [px - start[0], py - start[1]]),
        lastCommittedPoint: null,
        startBinding: opts.startAt ? null : { elementId: from.id, focus: opts.startPort ? bindingFocus(from, abs[1]!, start) : 0, gap: 6, fixedPoint: null },
        endBinding: opts.endAt ? null : { elementId: to.id, focus: opts.endPort ? bindingFocus(to, abs[abs.length - 2]!, end) : 0, gap: 6, fixedPoint: null },
        startArrowhead: heads === 'both' ? 'arrow' : null,
        endArrowhead: heads === 'none' ? null : 'arrow',
        elbowed: false,
        customData: { role: 'arrow', from: from.id, to: to.id }
      })
    );
    if (opts.elbowed) {
      const local = el.points as [number, number][];
      Object.assign(el, {
        elbowed: true,
        startBinding: { elementId: from.id, focus: 0, gap: 6, fixedPoint: fixedPoint(opts.startPort!) },
        endBinding: { elementId: to.id, focus: 0, gap: 6, fixedPoint: fixedPoint(opts.endPort!) },
        fixedSegments: opts.pin?.length ? opts.pin.map((i) => ({ index: i, start: local[i - 1]!, end: local[i]! })) : null,
        startIsSpecial: false,
        endIsSpecial: false
      });
    }
    for (const e of from === to ? [from] : [from, to]) e.boundElements = [...((e.boundElements as unknown[]) ?? []), { id: el.id, type: 'arrow' }];
    if (opts.label) this.plate(opts.label, opts.labelAt ?? longestMidpoint(abs), el.id, opts.labelSize ?? 14, opts.labelMaxPx ?? 150, opts.labelFill);
    return el;
  }

  /** A label on a white plate centred at `at`, so it never sits on a line. */
  plate(label: string, at: [number, number], arrowId: string | null, size = 14, maxPx = 150, fill: string = colour.white): El {
    const lines = wrapPx(label, maxPx, size);
    const w = Math.max(...lines.map((l) => measure(l, size))) + 12;
    const h = textHeight(lines.length, size) + 6;
    const plate = this.push(
      this.base('rectangle', at[0] - w / 2, at[1] - h / 2, w, h, 'arrow-plate', {
        backgroundColor: fill,
        strokeColor: colour.none,
        strokeWidth: 1,
        roughness: 0,
        customData: { role: 'arrow-plate', arrow: arrowId }
      })
    );
    this.text(label, 0, 0, { size, align: 'center', colour: colour.ink, maxPx, container: plate, role: 'arrow-label' });
    return plate;
  }

  /** Bounding box of everything drawn so far. */
  bounds(): { x: number; y: number; w: number; h: number } {
    if (this.elements.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    // Arrows and lines: x/y is the start point and the extent comes from the points, which may be negative.
    const span = (e: El, axis: 0 | 1): number[] => {
      const pts = e.points as [number, number][] | undefined;
      const o = axis === 0 ? e.x : e.y;
      if (pts?.length) return pts.map((p) => o + p[axis]);
      return [o, o + (axis === 0 ? e.width : e.height)];
    };
    const xs = this.elements.flatMap((e) => span(e, 0));
    const ys = this.elements.flatMap((e) => span(e, 1));
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  /** The .excalidraw file text. */
  file(source = 'garkpit-diagrams'): string {
    this.elements.forEach((e, i) => (e.index = fractionalIndex(i)));
    return JSON.stringify({ type: 'excalidraw', version: 2, source, elements: this.elements, appState: { viewBackgroundColor: '#ffffff', gridSize: null }, files: {} }, null, 1);
  }

  /** A scene from a parsed .excalidraw file (for checking and rendering drawings made elsewhere). */
  static fromFile(json: { elements?: unknown[] }): Scene {
    const s = new Scene();
    s.elements = ((json.elements ?? []) as El[]).filter((e) => !e.isDeleted);
    return s;
  }
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * The i-th Excalidraw fractional index, in order: a0..az, then b00..bzz. Integer-part keys only,
 * because a key whose fraction ends in 0 (the old "a000") is invalid and excalidraw.com rejects
 * or rewrites the file.
 */
export function fractionalIndex(i: number): string {
  if (i < 62) return `a${B62[i]}`;
  const j = i - 62;
  if (j < 62 * 62) return `b${B62[Math.floor(j / 62)]}${B62[j % 62]}`;
  const k = j - 62 * 62;
  if (k < 62 ** 3) return `c${B62[Math.floor(k / 3844)]}${B62[Math.floor(k / 62) % 62]}${B62[k % 62]}`;
  throw new Error(`scene has more than ${62 + 3844 + 62 ** 3} elements`);
}

/** Midpoint of the longest segment of a polyline. */
export function longestMidpoint(abs: [number, number][]): [number, number] {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < abs.length - 1; i++) {
    const l = Math.hypot(abs[i + 1]![0] - abs[i]![0], abs[i + 1]![1] - abs[i]![1]);
    if (l > bestLen) {
      bestLen = l;
      best = i;
    }
  }
  return [(abs[best]![0] + abs[best + 1]![0]) / 2, (abs[best]![1] + abs[best + 1]![1]) / 2];
}

export { blockWidth };
