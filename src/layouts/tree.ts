// tree(): tidy trees from nested data. 'down' draws a top-down org chart or decision tree with
// elbow connectors, 'right' a left-to-right tree, 'mindmap' puts the root in the centre with its
// first-level branches split left and right, each side a tree of its own, one colour per branch.
//
// Placement is a Reingold-Tilford-style contour pass: every subtree keeps the extent it occupies
// at each depth, and a sibling is pushed along until its contour clears the one before it by
// `gap` at every depth both share. Node sizes come from the measured Excalifont label, so siblings
// never overlap however long their text is.
import { measure, wrapPx } from '../font.ts';
import { colour, type El, innerWidth, type Kind, neededHeight, Scene } from '../scene.ts';

export interface TreeNode {
  text: string;
  kind?: Kind;
  fill?: string;
  /** Label on the connector from this node's parent (yes / no on a decision tree). */
  edgeLabel?: string;
  children?: TreeNode[];
  size?: number;
  bold?: boolean;
  dashed?: boolean;
}

export interface TreeSpec {
  title?: string;
  root: TreeNode;
  /** 'down' (default), 'right', or 'mindmap' (root centred, branches left and right). */
  direction?: 'down' | 'right' | 'mindmap';
  /** Widest a node grows before its label wraps (default 210; 190 in a mind map). */
  maxW?: number;
  /** Narrowest a node may be (default 90). */
  minW?: number;
  /** Space between neighbouring nodes at the same depth (default 30 down, 18 otherwise). */
  gap?: number;
  /** Space between levels (default 70 down, 80 right, 90 mind map); grows to fit edge labels. */
  levelGap?: number;
  /** Connector shape: 'elbow' (default for down/right), 'straight', or 'curve' (default for mind maps). */
  connector?: 'elbow' | 'straight' | 'curve';
  /** Arrowheads on connectors (default 'end' for down/right, 'none' for mind maps). */
  heads?: 'end' | 'none';
  /** One colour per first-level branch: fills, outlines and connectors (default on for mind maps). */
  branchColours?: boolean;
  /** Every node at a depth gets that depth's widest width (tidier org charts). */
  uniform?: boolean;
}

/** Branch colours: a strong fill for the first-level node, a pale fill below it, a line colour. */
export const branchPalette = [
  { strong: colour.blue, pale: '#e7f5ff', line: '#1971c2' },
  { strong: colour.orange, pale: '#fff4e6', line: '#e8590c' },
  { strong: colour.green, pale: '#ebfbee', line: '#2f9e44' },
  { strong: colour.violet, pale: '#f3f0ff', line: '#6741d9' },
  { strong: colour.pink, pale: '#fff0f6', line: '#c2255c' },
  { strong: colour.teal, pale: '#e6fcf5', line: '#0c8599' },
  { strong: colour.yellow, pale: '#fff9db', line: '#e67700' },
  { strong: colour.red, pale: '#fff5f5', line: '#e03131' }
];

interface L {
  src: TreeNode;
  kind: Kind;
  size: number;
  w: number;
  h: number;
  depth: number;
  kids: L[];
  /** Centre offset along the breadth axis from the parent's centre. */
  off: number;
  /** Absolute centre on the breadth axis. */
  b: number;
  x: number;
  y: number;
  branch: number;
  /** Mind map side: 1 right, -1 left, 0 the root. */
  side: number;
  el?: El;
}

/** Outer width a node of this kind needs for a text block `tw` px wide (inverse of innerWidth, with a little slack). */
const outerWidth = (kind: Kind, tw: number) => (kind === 'diamond' ? (tw + 6) / 0.56 : kind === 'pill' || kind === 'circle' ? (tw + 6) / 0.72 : tw + 28 + 8);

/** A node's size from its measured label: as narrow as its text, wrapping at maxW. */
export function fitNode(kind: Kind, text: string, size: number, maxW: number, minW: number): { w: number; h: number } {
  const lines = wrapPx(text, innerWidth(kind, maxW), size);
  const tw = Math.max(...lines.map((l) => measure(l, size)));
  const w = Math.ceil(Math.max(minW, Math.min(maxW, outerWidth(kind, tw))));
  const minH = kind === 'diamond' ? 76 : kind === 'pill' || kind === 'circle' ? 56 : 48;
  return { w, h: Math.ceil(Math.max(minH, neededHeight(kind, w, text, size))) };
}

type Contour = Array<[number, number]>;

/** Lay out a tree and return the scene. */
export function tree(spec: TreeSpec): Scene {
  const s = new Scene();
  const dir = spec.direction ?? 'down';
  const mind = dir === 'mindmap';
  const down = dir === 'down';
  const maxW = spec.maxW ?? (mind ? 190 : 210);
  const minW = spec.minW ?? 90;
  const gap = spec.gap ?? (down ? 30 : 18);
  const connector = spec.connector ?? (mind ? 'curve' : 'elbow');
  const heads = spec.heads ?? (mind ? 'none' : 'end');
  const colourful = spec.branchColours ?? mind;

  // ---- measure ----
  const build = (src: TreeNode, depth: number, branch: number): L => {
    const kind = src.kind ?? (mind && depth === 0 ? 'pill' : 'box');
    const size = src.size ?? (mind && depth === 0 ? 20 : depth >= 2 && mind ? 15 : 16);
    const { w, h } = fitNode(kind, src.text, size, mind && depth === 0 ? maxW + 40 : maxW, minW);
    const n: L = { src, kind, size, w, h, depth, kids: [], off: 0, b: 0, x: 0, y: 0, branch, side: 0 };
    n.kids = (src.children ?? []).map((c, i) => build(c, depth + 1, depth === 0 ? i : branch));
    return n;
  };
  const root = build(spec.root, 0, -1);
  const all: L[] = [];
  const walk = (n: L) => {
    all.push(n);
    n.kids.forEach(walk);
  };
  walk(root);
  if (spec.uniform) {
    const widest = new Map<number, number>();
    for (const n of all) widest.set(n.depth, Math.max(widest.get(n.depth) ?? 0, n.w));
    for (const n of all) {
      n.w = widest.get(n.depth)!;
      n.h = Math.max(n.h, Math.ceil(neededHeight(n.kind, n.w, n.src.text, n.size)));
    }
  }
  // Breadth axis runs across the levels' direction: x for a down tree, y otherwise.
  const bs = (n: L) => (down ? n.w : n.h);
  const ds = (n: L) => (down ? n.h : n.w);

  // Level gap: room for the widest edge label on the last leg of each connector.
  const labelled = all.filter((n) => n.src.edgeLabel);
  let levelGap = spec.levelGap ?? (down ? 70 : mind ? 90 : 80);
  if (labelled.length) {
    if (down) levelGap = Math.max(levelGap, 92);
    else {
      const lw = Math.max(...labelled.map((n) => measure(n.src.edgeLabel!, 14)));
      levelGap = Math.max(levelGap, (lw + 12 + 24 + 6) / 0.55);
    }
  }

  // ---- contour placement ----
  const place = (n: L): Contour => {
    const self: [number, number] = [-bs(n) / 2, bs(n) / 2];
    if (n.kids.length === 0) return [self];
    const contours = n.kids.map(place);
    const pos: number[] = [0];
    const acc: Contour = contours[0]!.map(([a, b]) => [a, b]);
    for (let i = 1; i < contours.length; i++) {
      const c = contours[i]!;
      let shift = -Infinity;
      for (let k = 0; k < Math.min(acc.length, c.length); k++) shift = Math.max(shift, acc[k]![1] + gap - c[k]![0]);
      pos.push(shift);
      for (let k = 0; k < c.length; k++) {
        if (k < acc.length) acc[k] = [Math.min(acc[k]![0], c[k]![0] + shift), Math.max(acc[k]![1], c[k]![1] + shift)];
        else acc.push([c[k]![0] + shift, c[k]![1] + shift]);
      }
    }
    const mid = (pos[0]! + pos[pos.length - 1]!) / 2;
    n.kids.forEach((k, i) => (k.off = pos[i]! - mid));
    return [self, ...acc.map(([a, b]) => [a - mid, b - mid] as [number, number])];
  };
  const assign = (n: L, b: number) => {
    n.b = b;
    for (const k of n.kids) assign(k, b + k.off);
  };

  /** Per-depth size along the depth axis, for the nodes given. */
  const levelSizes = (nodes: L[]) => {
    const out: number[] = [];
    for (const n of nodes) out[n.depth] = Math.max(out[n.depth] ?? 0, ds(n));
    return out;
  };

  // Where each level starts on the depth axis: levelStart[d], and its size levelSize[d] (down/right trees).
  const levelStart: number[] = [];
  let levelSize: number[] = [];

  if (!mind) {
    place(root);
    assign(root, 0);
    levelSize = levelSizes(all);
    let p = 0;
    for (let d = 0; d < levelSize.length; d++) {
      levelStart[d] = p;
      p += levelSize[d]! + levelGap;
    }
    for (const n of all) {
      if (down) {
        n.x = n.b - n.w / 2;
        n.y = levelStart[n.depth]! + (levelSize[n.depth]! - n.h) / 2;
      } else {
        n.y = n.b - n.h / 2;
        n.x = levelStart[n.depth]!;
      }
    }
  } else {
    // Split the first-level branches into a right group and a left group of near-equal breadth,
    // keeping their order (clockwise: right side top to bottom, then left side bottom to top).
    const breadth = root.kids.map((k) => {
      const c = place(k);
      return Math.min(...c.map((r) => r[0])) - Math.max(...c.map((r) => r[1]));
    }).map((v) => -v);
    let split = root.kids.length;
    if (root.kids.length > 1) {
      let best = Infinity;
      for (let k = 1; k < root.kids.length; k++) {
        const r = breadth.slice(0, k).reduce((a, b) => a + b + gap, 0);
        const l = breadth.slice(k).reduce((a, b) => a + b + gap, 0);
        if (Math.abs(r - l) < best) {
          best = Math.abs(r - l);
          split = k;
        }
      }
    }
    const right = root.kids.slice(0, split);
    const left = root.kids.slice(split).reverse();
    const sides: Array<[L[], number]> = [
      [right, 1],
      [left, -1]
    ];
    const deeper = Math.round(levelGap * 0.85);
    const gapFor = (d: number) => (d === 0 ? levelGap : deeper);
    for (const [group, side] of sides) {
      if (!group.length) continue;
      const v: L = { ...root, w: 0, h: 0, kids: group };
      place(v);
      // The side's own breadth extent is centred on the root.
      assign(v, 0);
      const nodes: L[] = [];
      const collect = (n: L) => {
        nodes.push(n);
        n.side = side;
        n.kids.forEach(collect);
      };
      group.forEach(collect);
      const sizes = levelSizes(nodes);
      const starts: number[] = [];
      let p = root.w / 2;
      for (let d = 0; d < sizes.length; d++) {
        if (d === 0) continue;
        p += gapFor(d - 1);
        starts[d] = p;
        p += sizes[d]!;
      }
      for (const n of nodes) {
        n.y = n.b - n.h / 2;
        // Right side: left-aligned in its column. Left side: mirrored, right-aligned.
        n.x = side > 0 ? starts[n.depth]! : -starts[n.depth]! - n.w;
      }
    }
    root.side = 0;
    root.x = -root.w / 2;
    root.y = -root.h / 2;
  }

  // ---- shift onto the page ----
  const top = spec.title ? 76 : 30;
  const minX = Math.min(...all.map((n) => n.x));
  const minY = Math.min(...all.map((n) => n.y));
  const dx = 30 - minX;
  const dy = top - minY;
  for (const n of all) {
    n.x += dx;
    n.y += dy;
  }
  if (spec.title) s.title(30, 20, spec.title);

  // ---- nodes ----
  const pal = (n: L) => (colourful && n.branch >= 0 ? branchPalette[n.branch % branchPalette.length]! : null);
  for (const n of all) {
    const p = pal(n);
    let fill = n.src.fill;
    let stroke: string | undefined;
    if (!fill && mind && n.depth === 0) fill = colour.yellow;
    if (!fill && p) fill = n.depth === 1 ? p.strong : p.pale;
    if (p && n.depth >= 2) stroke = p.line;
    n.el = s.node(n.kind, n.x, n.y, n.w, n.h, n.src.text, { fill, stroke, size: n.size, bold: n.src.bold ?? (mind && n.depth <= 1), dashed: n.src.dashed });
  }

  // ---- connectors ----
  // Mind maps: one curve per child, bent through a point in the gap at the child's height, so
  // siblings leave the parent at different points and never share a stroke.
  // Down/right trees: a diamond with two children far enough to either side exits from its side
  // vertices (as in a flowchart); otherwise each child gets one Excalidraw elbow arrow bound to the
  // parent and to it, running down a stem it shares with its siblings, along the bus and into the
  // child, so dragging either node in excalidraw.com re-routes the connector instead of breaking it.
  const ARROW_GAP = 6;
  const deeper = Math.round(levelGap * 0.85);
  const pt = (b: number, d: number): [number, number] => (down ? [b, d] : [d, b]);
  const mid = (e: El) => (down ? e.x + e.width / 2 : e.y + e.height / 2);
  const depthMid = (e: El) => (down ? e.y + e.height / 2 : e.x + e.width / 2);
  const near = (e: El) => (down ? e.y : e.x);
  const lo = (e: El) => (down ? e.x : e.y);
  const hi = (e: El) => (down ? e.x + e.width : e.y + e.height);
  const lineOf = (n: L) => pal(n)?.line ?? colour.ink;

  for (const par of all) {
    if (!par.kids.length) continue;
    const a = par.el!;
    if (mind) {
      for (const n of par.kids) {
        const b = n.el!;
        const side = n.side;
        const g = par.depth === 0 ? levelGap : deeper;
        const childEdge = side > 0 ? b.x : b.x + b.width;
        const cy = b.y + b.height / 2;
        // Below the root, a first control point just outside the parent's facing side, offset towards
        // the child, makes each curve leave from that side at its own height.
        const py = a.y + a.height / 2;
        const k = par.kids.length;
        // Exit heights spread evenly down the facing side, in sibling order (siblings are sorted by height).
        const lean = k > 1 ? (par.kids.indexOf(n) / (k - 1) - 0.5) * a.height * 0.7 : 0;
        const parentEdge = side > 0 ? a.x + a.width : a.x;
        const via: [number, number][] =
          connector === 'straight'
            ? []
            : par.depth === 0
              ? [[childEdge - side * g * 0.45, cy]]
              : [
                  [parentEdge + side * g * 0.32, py + lean],
                  [childEdge - side * g * 0.32, cy]
                ];
        const el = s.arrow(a, b, {
          via,
          label: n.src.edgeLabel,
          labelAt: n.src.edgeLabel ? [childEdge - side * g * 0.25, cy] : undefined,
          heads,
          colour: lineOf(n)
        });
        if (connector === 'curve') el.roundness = { type: 2 };
      }
      continue;
    }
    const pb = mid(a);
    const bus = levelStart[par.depth]! + levelSize[par.depth]! + (down ? dy : dx) + levelGap * 0.4;
    const kids = par.kids.map((n) => n.el!);
    const sideExit =
      connector === 'elbow' && par.kind === 'diamond' && kids.length === 2 && mid(kids[0]!) < lo(a) - 20 && mid(kids[1]!) > hi(a) + 20;
    const single = kids.length === 1 && Math.abs(mid(kids[0]!) - pb) < 1;
    if (connector === 'straight' || sideExit || single) {
      par.kids.forEach((n, i) => {
        const b = kids[i]!;
        const from = sideExit ? depthMid(a) : bus;
        const labelAt = n.src.edgeLabel && connector !== 'straight' ? pt(mid(b), (from + near(b) - ARROW_GAP) / 2) : undefined;
        // Elbow connectors bind at fixed points too (out of a side vertex, or straight on to a lone
        // aligned child), so excalidraw.com keeps them square when a node is dragged.
        const elbow = connector !== 'straight';
        const exitSide = sideExit ? (down ? (mid(b) < pb ? 'left' : 'right') : mid(b) < pb ? 'top' : 'bottom') : down ? 'bottom' : 'right';
        s.arrow(a, b, {
          via: sideExit ? [pt(mid(b), depthMid(a))] : [],
          label: n.src.edgeLabel,
          labelAt,
          heads,
          colour: lineOf(n),
          ...(elbow ? { elbowed: true, startPort: { side: exitSide }, endPort: { side: down ? 'top' : 'left' } } : {})
        });
      });
      continue;
    }
    // One elbow arrow per child, bound to the parent and the child: down the shared stem, along the
    // bus, into the child. excalidraw.com re-routes each when either end is dragged; the bus segment
    // is pinned so a re-routed connector keeps the bus where it was.
    // The siblings share a stroke along the stem and part of the bus, so they share the parent's line
    // colour and one rough-drawing seed: their common stretch is drawn identically, as one line.
    const exit = { side: down ? 'bottom' : 'right', at: 0 } as const;
    let seed: unknown;
    par.kids.forEach((n, i) => {
      const b = kids[i]!;
      const enter = { side: down ? 'top' : 'left', at: 0 } as const;
      const straight = Math.abs(mid(b) - pb) < 1;
      const el = s.arrow(a, b, {
        startPort: exit,
        endPort: enter,
        via: straight ? [] : [pt(pb, bus), pt(mid(b), bus)],
        pin: straight ? undefined : [2],
        elbowed: true,
        label: n.src.edgeLabel,
        labelAt: n.src.edgeLabel ? pt(mid(b), (bus + near(b) - ARROW_GAP) / 2) : undefined,
        heads,
        colour: lineOf(par)
      });
      seed ??= el.seed;
      el.seed = seed;
    });
  }
  return s;
}
