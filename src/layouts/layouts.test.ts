import { describe, expect, test } from 'bun:test';
import { checkScene } from '../check.ts';
import { type El, fixedPoint, Scene } from '../scene.ts';
import { renderSvg } from '../svg.ts';
import { sequence } from './sequence.ts';
import { timeline } from './timeline.ts';
import { tree } from './tree.ts';

const plateOf = (s: Scene, text: string): El => {
  const t = s.elements.find((e) => e.type === 'text' && e.originalText === text)!;
  return s.elements.find((e) => e.id === t.containerId)!;
};
const lifelineXs = (s: Scene) => [...new Set(s.elements.filter((e) => e.type === 'line' && e.strokeStyle === 'dashed').map((e) => Math.round(e.x)))].sort((a, b) => a - b);

describe('sequence message labels', () => {
  const s = sequence({
    minGap: 240,
    participants: ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id.toUpperCase() })),
    steps: [
      { from: 'a', to: 'd', text: 'over three gaps' },
      { from: 'a', to: 'c', text: 'over two gaps' },
      { from: 'a', to: 'b', text: 'one gap' }
    ]
  });
  const xs = lifelineXs(s);

  test('a label over a long arrow is centred when it clears every lifeline there', () => {
    const p = plateOf(s, 'over three gaps');
    expect(Math.abs(p.x + p.width / 2 - (xs[0]! + xs[3]!) / 2)).toBeLessThan(1);
  });

  test('a label whose centre would sit on a lifeline stays in the gap beside the sender', () => {
    const p = plateOf(s, 'over two gaps');
    expect(Math.abs(p.x + p.width / 2 - (xs[0]! + xs[1]!) / 2)).toBeLessThan(1);
  });

  test('passes the fit check', () => {
    expect(checkScene(s).ok).toBe(true);
  });
});

describe('timeline cards', () => {
  const s = timeline({
    ticks: ['Q1', 'Q2', 'Q3'],
    events: [
      { at: 'Q1', title: 'Kick-off', text: 'Goals and research plan agreed with the whole team' },
      { at: 'Q2', title: 'Launch', text: 'Paid plans open', milestone: true },
      { at: 'Q3', title: 'Review only' }
    ]
  });

  test('title bound at the top of the card, detail smaller and underneath, grouped with it', () => {
    const title = s.elements.find((e) => e.originalText === 'Kick-off')!;
    const detail = s.elements.find((e) => e.originalText === 'Goals and research plan agreed with the whole team')!;
    const card = s.elements.find((e) => e.id === title.containerId)!;
    expect(title.verticalAlign).toBe('top');
    expect(title.y).toBe(card.y + 5);
    expect(detail.fontSize as number).toBeLessThan(title.fontSize as number);
    expect(detail.y).toBeGreaterThanOrEqual(title.y + title.height);
    expect(detail.y + detail.height).toBeLessThanOrEqual(card.y + card.height - 5);
    expect((detail.customData as { in?: string }).in).toBe(card.id);
    expect(detail.groupIds).toEqual(card.groupIds);
    expect(title.groupIds).toEqual(card.groupIds);
  });

  test('a card without detail keeps one centred label; milestones stay bold', () => {
    const only = s.elements.find((e) => e.originalText === 'Review only')!;
    expect(only.verticalAlign).toBe('middle');
    const launch = s.elements.find((e) => e.originalText === 'Launch')!;
    expect(s.elements.find((e) => e.id === launch.containerId)!.strokeWidth).toBe(3);
  });

  test('passes the fit check, and the check catches a detail that collides with the title', () => {
    expect(checkScene(s).ok).toBe(true);
    const detail = s.elements.find((e) => e.originalText === 'Paid plans open')!;
    const title = s.elements.find((e) => e.originalText === 'Launch')!;
    detail.y = title.y;
    expect(checkScene(s).findings.map((f) => f.rule)).toContain('text-overflow');
  });
});

describe('tree connectors', () => {
  const t = tree({
    root: { text: 'root', children: [{ text: 'left child' }, { text: 'middle child' }, { text: 'right child' }] }
  });
  const arrows = t.elements.filter((e) => e.type === 'arrow');
  const rootEl = t.elements.find((e) => e.type === 'rectangle' && t.elements.some((x) => x.containerId === e.id && x.originalText === 'root'))!;

  test('one elbow arrow per child, bound to the parent and the child at fixed points; no loose stem or bus lines', () => {
    expect(arrows).toHaveLength(3);
    expect(t.elements.filter((e) => e.type === 'line')).toHaveLength(0);
    for (const a of arrows) {
      expect(a.elbowed).toBe(true);
      expect((a.startBinding as { elementId: string }).elementId).toBe(rootEl.id);
      expect((a.startBinding as { fixedPoint: number[] }).fixedPoint).toEqual([0.5001, 1]);
      expect((a.endBinding as { fixedPoint: number[] }).fixedPoint).toEqual([0.5001, 0]);
      const p = a.points as [number, number][];
      for (let i = 1; i < p.length; i++) expect(p[i]![0] === p[i - 1]![0] || p[i]![1] === p[i - 1]![1]).toBe(true);
    }
    expect(((rootEl.boundElements as Array<{ id: string }>) ?? []).filter((b) => arrows.some((a) => a.id === b.id))).toHaveLength(3);
  });

  test('the bus segment is pinned, at the same height for every sibling', () => {
    const buses = arrows
      .filter((a) => (a.points as unknown[]).length === 4)
      .map((a) => {
        const seg = (a.fixedSegments as Array<{ index: number; start: number[]; end: number[] }>)[0]!;
        expect(seg.index).toBe(2);
        return a.y + seg.start[1]!;
      });
    expect(buses.length).toBeGreaterThan(0);
    expect(new Set(buses.map(Math.round)).size).toBe(1);
  });

  test("the shared stem is not an arrow-overlap finding, and Excalidraw's restore keeps the arrows as drawn", async () => {
    expect(checkScene(t).findings.map((f) => f.rule)).not.toContain('arrow-overlap');
    await renderSvg(new Scene()); // boots the DOM Excalidraw needs
    const { restoreElements } = (await import('@excalidraw/excalidraw')) as unknown as {
      restoreElements: (els: unknown[], local: null, opts: { repairBindings: boolean }) => El[];
    };
    const restored = restoreElements(JSON.parse(t.file()).elements, null, { repairBindings: true });
    for (const a of arrows) {
      const r = restored.find((e) => e.id === a.id)!;
      expect(r.elbowed).toBe(true);
      expect(r.points).toEqual(a.points);
      expect((r.startBinding as { fixedPoint: number[] }).fixedPoint).toEqual([0.5001, 1]);
    }
  });
});

describe('decision tree connectors', () => {
  test('side-vertex exits and lone aligned children are elbow arrows bound at both ends too', () => {
    const t = tree({
      root: {
        text: 'Is it core to what makes us different?',
        kind: 'diamond',
        children: [
          { text: 'Build it in-house, with a team of our own', edgeLabel: 'yes', children: [{ text: 'Hire' }] },
          { text: 'Buy a SaaS product from a vendor', edgeLabel: 'no' }
        ]
      }
    });
    const arrows = t.elements.filter((e) => e.type === 'arrow');
    expect(arrows.length).toBe(3);
    for (const a of arrows) {
      expect(a.elbowed).toBe(true);
      expect((a.startBinding as { fixedPoint: unknown }).fixedPoint).toBeTruthy();
      expect((a.endBinding as { fixedPoint: unknown }).fixedPoint).toBeTruthy();
    }
    expect(checkScene(t).ok).toBe(true);
  });
});

describe('elbowed arrows', () => {
  test('need ports and orthogonal segments', () => {
    const s = new Scene();
    const a = s.node('box', 0, 0, 100, 50, 'a');
    const b = s.node('box', 200, 200, 100, 50, 'b');
    expect(() => s.arrow(a, b, { elbowed: true })).toThrow(/startPort/);
    expect(() => s.arrow(a, b, { elbowed: true, startPort: { side: 'bottom' }, endPort: { side: 'top' } })).toThrow(/horizontal and vertical/);
    const ok = s.arrow(a, b, { elbowed: true, startPort: { side: 'bottom' }, endPort: { side: 'top' }, via: [[50, 120], [250, 120]] });
    expect(ok.fixedSegments).toBeNull();
  });

  test('fixedPoint maps a port onto the bounding box', () => {
    expect(fixedPoint({ side: 'right', at: 0.25 })).toEqual([1, 0.75]);
    expect(fixedPoint({ side: 'top' })).toEqual([0.5001, 0]);
  });
});

describe('arrow-overlap and trunks', () => {
  const two = (sameStart: boolean, rejoin = false) => {
    const s = new Scene();
    const a = s.node('box', 0, 0, 100, 50, 'a');
    const a2 = s.node('box', 0, 300, 100, 50, 'a2');
    const b = s.node('box', 300, -100, 100, 50, 'b');
    const c = s.node('box', 300, 100, 100, 50, 'c');
    s.arrow(a, b, { elbowed: true, startPort: { side: 'right' }, endPort: { side: 'left' }, via: [[150, 25], [150, -75]] });
    if (sameStart && !rejoin) s.arrow(a, c, { elbowed: true, startPort: { side: 'right' }, endPort: { side: 'left' }, via: [[150, 25], [150, 125]] });
    else if (rejoin) s.arrow(a, b, { elbowed: true, startPort: { side: 'right' }, endPort: { side: 'left' }, via: [[130, 25], [130, -40], [150, -40], [150, -75]] });
    else s.arrow(a2, b, { startAt: [150, 325], endAt: [294, -75], via: [[150, -75]] });
    return checkScene(s).findings.map((f) => f.rule);
  };
  test('elbow arrows from one fixed point that part ways share a trunk, not a finding', () => expect(two(true)).not.toContain('arrow-overlap'));
  test('arrows from different starts running together are still a finding', () => expect(two(false)).toContain('arrow-overlap'));
  test('arrows from one node that meet again after parting are still a finding', () => expect(two(true, true)).toContain('arrow-overlap'));
});
