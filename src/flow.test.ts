import { describe, expect, test } from 'bun:test';
import { checkScene } from './check.ts';
import { flow } from './flow.ts';
import { bindingFocus, type El, portPoint, Scene } from './scene.ts';

const arrows = (s: Scene) => s.elements.filter((e) => e.type === 'arrow');
const pts = (a: El) => (a.points as [number, number][]).map(([x, y]) => [a.x + x, a.y + y] as [number, number]);
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

describe('ports', () => {
  const s = new Scene();
  const box = s.node('box', 100, 100, 200, 80, 'box');
  const pill = s.node('pill', 100, 300, 200, 80, 'pill');
  const dia = s.node('diamond', 100, 500, 200, 100, 'dia');

  test('rectangle: on the side, offset along it, 6 px out', () => {
    expect(portPoint(box, { side: 'top' })).toEqual([200, 94]);
    expect(portPoint(box, { side: 'top', at: -0.25 })).toEqual([150, 94]);
    expect(portPoint(box, { side: 'right', at: 0.5 })).toEqual([306, 180]);
    expect(portPoint(box, { side: 'bottom', at: 9 })).toEqual([300, 186]); // clamped to the corner
  });

  test('ellipse: where the line square to the side meets the outline', () => {
    const [x, y] = portPoint(pill, { side: 'top', at: 0.25 });
    expect(x).toBe(250);
    // (dx/hw)^2 + (dy/hh)^2 = 1 at dx = 50, hw = 100, hh = 40
    expect(near(y, 340 - 40 * Math.sqrt(0.75) - 6)).toBe(true);
  });

  test('diamond: on the slanted edge', () => {
    const [x, y] = portPoint(dia, { side: 'left', at: 0.25 });
    expect(near(y, 575)).toBe(true);
    expect(near(x, 200 - 100 * 0.5 - 6)).toBe(true);
  });

  test('binding focus: 0 through the centre, signed and symmetric off it', () => {
    expect(near(bindingFocus(box, [200, 0], [200, 94]), 0)).toBe(true);
    const left = bindingFocus(box, [150, 0], [150, 94]);
    const right = bindingFocus(box, [250, 0], [250, 94]);
    expect(Math.abs(left)).toBeGreaterThan(0.1);
    expect(near(left, -right)).toBe(true);
  });

  test('an arrow with ports starts and ends on them and stays bound', () => {
    const t = new Scene();
    const a = t.node('box', 0, 0, 200, 80, 'a');
    const b = t.node('box', 400, 0, 200, 80, 'b');
    const arr = t.arrow(a, b, { startPort: { side: 'bottom', at: 0.25 }, endPort: { side: 'bottom', at: -0.25 }, via: [[150, 140], [450, 140]] });
    const p = pts(arr);
    expect(p[0]).toEqual([150, 86]);
    expect(p[p.length - 1]).toEqual([450, 86]);
    expect((arr.startBinding as { elementId: string }).elementId).toBe(a.id);
    expect((arr.endBinding as { elementId: string }).elementId).toBe(b.id);
    expect((arr.startBinding as { focus: number }).focus).not.toBe(0);
  });
});

describe('flow edges with ports and self-loops', () => {
  test('self: an orthogonal loop out of and back into the same side, bound at both ends', () => {
    const s = flow({
      nodes: [{ id: 'a', c: 0, r: 0, text: 'Waiting', kind: 'pill' }],
      edges: [{ from: 'a', to: 'a', self: 'top', label: 'retry' }]
    });
    const [loop] = arrows(s);
    const node = s.elements.find((e) => (e.customData as { role?: string }).role === 'node')!;
    const p = pts(loop!);
    expect(p).toHaveLength(4);
    expect(p[0]![1]).toBeLessThan(node.y);
    expect(p[3]![1]).toBeLessThan(node.y);
    expect(p[0]![0]).toBeLessThan(node.x + node.width / 2);
    expect(p[3]![0]).toBeGreaterThan(node.x + node.width / 2);
    expect(near(p[1]![1], node.y - 36)).toBe(true);
    expect(p[1]![0]).toBe(p[0]![0]);
    expect(p[2]![0]).toBe(p[3]![0]);
    expect((loop!.startBinding as { elementId: string }).elementId).toBe(node.id);
    expect((loop!.endBinding as { elementId: string }).elementId).toBe(node.id);
    expect(checkScene(s).ok).toBe(true);
  });

  test('self: a label too wide for the loop sits just beyond it, centred', () => {
    const s = flow({
      cellW: 150,
      nodes: [{ id: 'a', c: 0, r: 0, text: 'shipped', kind: 'pill' }],
      edges: [{ from: 'a', to: 'a', self: 'top', label: 'tracking update' }]
    });
    const plate = s.elements.find((e) => (e.customData as { role?: string }).role === 'arrow-plate')!;
    const p = pts(arrows(s)[0]!);
    expect(plate.y + plate.height).toBeLessThanOrEqual(p[1]![1]);
    expect(near(plate.x + plate.width / 2, (p[1]![0] + p[2]![0]) / 2)).toBe(true);
  });

  test('self on two different nodes is an error', () => {
    expect(() => flow({ nodes: [{ id: 'a', c: 0, r: 0, text: 'a' }, { id: 'b', c: 1, r: 0, text: 'b' }], edges: [{ from: 'a', to: 'b', self: 'top' }] })).toThrow(/self/);
  });

  test('exit/enter: a below route runs from the ports, not the centres', () => {
    const s = flow({
      nodes: [{ id: 'a', c: 0, r: 0, text: 'a' }, { id: 'b', c: 2, r: 0, text: 'b' }],
      edges: [{ from: 'a', to: 'b', route: 'below', exit: ['bottom', 0.25], enter: ['bottom', -0.25] }]
    });
    const [n1, n2] = s.elements.filter((e) => (e.customData as { role?: string }).role === 'node');
    const p = pts(arrows(s)[0]!);
    expect(near(p[0]![0], n1!.x + n1!.width * 0.75)).toBe(true);
    expect(p[1]![0]).toBe(p[0]![0]);
    expect(near(p[3]![0], n2!.x + n2!.width * 0.25)).toBe(true);
    expect(p[2]![0]).toBe(p[3]![0]);
  });
});

describe('nested bands', () => {
  const role = (s: Scene, r: string) => s.elements.filter((e) => (e.customData as { role?: string }).role === r);
  const byLabel = (s: Scene, text: string) => {
    const label = s.elements.find((e) => e.type === 'text' && e.originalText === text)!;
    return role(s, 'band').find((b) => label.x >= b.x && label.x <= b.x + b.width && label.y >= b.y && label.y <= b.y + 20)!;
  };
  const nested = flow({
    title: 'Nested',
    nodes: [
      { id: 'top', c: 0, r: 0, text: 'Outside the inner bands' },
      { id: 'a', c: 0, r: 1, text: 'a' },
      { id: 'b', c: 1, r: 1, text: 'b' },
      { id: 'c', c: 0, r: 2, text: 'c' }
    ],
    edges: [{ from: 'top', to: 'a' }, { from: 'a', to: 'c', label: 'calls' }],
    bands: [
      { c: 1, r: 1, cw: 1, rh: 1, label: 'Inner right', labelAt: 'right' },
      { c: 0, r: 0, cw: 2, rh: 3, label: 'Account' },
      { c: 0, r: 1, cw: 2, rh: 2, label: 'Network' },
      { c: 0, r: 2, cw: 2, rh: 1, label: 'Private' }
    ]
  });

  test('passes the fit check with integer cells and no tuning', () => {
    expect(checkScene(nested).findings.filter((f) => f.severity !== 'info')).toEqual([]);
  });

  test('each level is padded further out, and outer bands are drawn first', () => {
    const acc = byLabel(nested, 'Account');
    const net = byLabel(nested, 'Network');
    const priv = byLabel(nested, 'Private');
    expect(net.x - acc.x).toBe(20);
    expect(priv.x - net.x).toBe(20);
    expect(acc.y + acc.height - (priv.y + priv.height)).toBe(40);
    const bands = role(nested, 'band');
    expect(bands.indexOf(acc)).toBeLessThan(bands.indexOf(net));
    expect(bands.indexOf(net)).toBeLessThan(bands.indexOf(byLabel(nested, 'Inner right')));
  });

  test('the gap above a row grows to fit the header stack of the bands starting there', () => {
    const net = byLabel(nested, 'Network');
    const top = nested.elements.find((e) => e.type === 'text' && e.originalText === 'Outside the inner bands')!;
    const topNode = role(nested, 'node').find((n) => n.id === top.containerId)!;
    expect(net.y - (topNode.y + topNode.height)).toBeGreaterThanOrEqual(30);
  });

  test("labelAt 'right' puts the label in the band's top-right corner", () => {
    const inner = byLabel(nested, 'Inner right');
    const label = nested.elements.find((e) => e.type === 'text' && e.originalText === 'Inner right')!;
    expect(label.textAlign).toBe('right');
    expect(Math.abs(label.x + label.width - (inner.x + inner.width - 14))).toBeLessThan(0.01);
  });

  test('a single band keeps its old padding: 20 px sides and bottom, 44 px top', () => {
    const s = flow({ title: 'One', nodes: [{ id: 'a', c: 0, r: 0, text: 'a' }], edges: [], bands: [{ c: 0, r: 0, cw: 1, rh: 1, label: 'Group' }] });
    const [band] = role(s, 'band');
    const [node] = role(s, 'node');
    expect(node!.x - band!.x).toBe(20);
    expect(node!.y - band!.y).toBe(44);
    expect(band!.y + band!.height - (node!.y + node!.height)).toBe(20);
    expect(node!.y).toBe(128);
  });
});
