import { describe, expect, test } from 'bun:test';
import { checkScene, validIndex } from './check.ts';
import { flow } from './flow.ts';
import { measure, wrapPx } from './font.ts';
import { fractionalIndex, Scene } from './scene.ts';

const rules = (s: Scene) => checkScene(s).findings.map((f) => f.rule);

describe('font', () => {
  test('measures real glyph widths: W is wider than i', () => {
    expect(measure('WWWW', 16)).toBeGreaterThan(measure('iiii', 16) * 2);
  });
  test('wraps by pixel width', () => {
    const lines = wrapPx('one two three four five six seven', 80, 16);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) if (l.includes(' ')) expect(measure(l, 16)).toBeLessThanOrEqual(80);
  });
});

describe('fractional index', () => {
  test('keys are valid and strictly increasing', () => {
    const keys = Array.from({ length: 5000 }, (_, i) => fractionalIndex(i));
    for (const k of keys) expect(validIndex(k)).toBe(true);
    for (let i = 1; i < keys.length; i++) expect(keys[i]! > keys[i - 1]!).toBe(true);
  });
  test('rejects a fraction ending in 0, the old a000 form', () => {
    expect(validIndex('a000')).toBe(false);
    expect(validIndex('a0')).toBe(true);
    expect(validIndex('a0V')).toBe(true);
  });
});

describe('fit check', () => {
  test('a clean flow passes', () => {
    const s = flow({
      title: 'Clean',
      nodes: [
        { id: 'a', c: 0, r: 0, text: 'Start here' },
        { id: 'b', c: 1, r: 0, text: 'Decide?', kind: 'diamond' },
        { id: 'c', c: 1, r: 1, text: 'Done', kind: 'pill' }
      ],
      edges: [
        { from: 'a', to: 'b', label: 'go' },
        { from: 'b', to: 'c', label: 'yes' }
      ]
    });
    expect(checkScene(s).ok).toBe(true);
  });

  test('text-overflow: a long unbreakable word in a narrow box', () => {
    const s = new Scene();
    s.node('box', 0, 0, 80, 60, 'supercalifragilisticexpialidocious');
    expect(rules(s)).toContain('text-overflow');
  });

  test('text-overflow: hand-written JSON whose box is too small for its text', () => {
    const s = Scene.fromFile({
      elements: [
        { id: 'r', type: 'rectangle', x: 0, y: 0, width: 60, height: 30, boundElements: [{ id: 't', type: 'text' }] },
        { id: 't', type: 'text', x: 0, y: 0, width: 50, height: 25, text: 'A much longer label', fontSize: 20, fontFamily: 5, containerId: 'r' }
      ]
    });
    expect(rules(s)).toContain('text-overflow');
  });

  test('node-overlap', () => {
    const s = new Scene();
    s.node('box', 0, 0, 200, 80, 'one');
    s.node('box', 150, 20, 200, 80, 'two');
    expect(rules(s)).toContain('node-overlap');
  });

  test('arrow-through-node: a straight arrow across a node in between', () => {
    const s = new Scene();
    const a = s.node('box', 0, 0, 120, 60, 'a');
    s.node('box', 200, 0, 120, 60, 'middle');
    const c = s.node('box', 400, 0, 120, 60, 'c');
    s.arrow(a, c);
    expect(rules(s)).toContain('arrow-through-node');
  });

  test('label-on-node: a label wider than the gap', () => {
    const s = new Scene();
    const a = s.node('box', 0, 0, 120, 60, 'a');
    const b = s.node('box', 160, 0, 120, 60, 'b');
    s.arrow(a, b, { label: 'a label far wider than the gap' });
    expect(rules(s)).toContain('label-on-node');
  });

  test('text-on-node: a note dropped on a node', () => {
    const s = new Scene();
    s.node('box', 0, 0, 200, 80, 'node');
    s.note(20, 20, 'stray note');
    expect(rules(s)).toContain('text-on-node');
  });

  test('arrow-through-text: an arrow across a band label', () => {
    const s = new Scene();
    s.band(0, 0, 400, 200, 'A long group label here');
    const a = s.node('box', 40, 300, 100, 50, 'a');
    const b = s.node('box', 40, 60, 100, 50, 'b');
    s.arrow(a, b, { via: [[90, 260], [90, 20], [240, 20], [240, 85]], endAt: [146, 85] });
    expect(rules(s)).toContain('arrow-through-text');
  });

  test('start and final pseudostates are small label-less circles', () => {
    const s = flow({ nodes: [{ id: 's', c: 0, r: 0, text: '', kind: 'start' }, { id: 'a', c: 1, r: 0, text: 'Created' }, { id: 'f', c: 2, r: 0, text: '', kind: 'final' }], edges: [{ from: 's', to: 'a' }, { from: 'a', to: 'f' }] });
    expect(checkScene(s).ok).toBe(true);
    const start = s.elements.find((e) => (e.customData as { kind?: string }).kind === 'start')!;
    expect(start.width).toBe(26);
  });

  test('crosses-boundary: a node straddling a band', () => {
    const s = new Scene();
    s.band(0, 0, 300, 200, 'group');
    s.node('box', 250, 50, 120, 60, 'half in');
    expect(rules(s)).toContain('crosses-boundary');
  });

  test('arrow-overlap: two arrows sharing a trunk', () => {
    const s = new Scene();
    const a = s.node('box', 0, 0, 120, 60, 'a');
    const b = s.node('box', 300, 200, 120, 60, 'b');
    const c = s.node('box', 300, 400, 120, 60, 'c');
    s.arrow(a, b, { via: [[60, 230]] });
    s.arrow(a, c, { via: [[60, 430]] });
    expect(rules(s)).toContain('arrow-overlap');
  });

  test('broken-binding and duplicate-id in a damaged file', () => {
    const s = Scene.fromFile({
      elements: [
        { id: 'x', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, boundElements: [{ id: 'gone', type: 'text' }] },
        { id: 'x', type: 'rectangle', x: 50, y: 0, width: 10, height: 10 }
      ]
    });
    const r = rules(s);
    expect(r).toContain('broken-binding');
    expect(r).toContain('duplicate-id');
  });

  test('bounds() follows arrow points drawn leftward and upward', () => {
    const s = new Scene();
    const a = s.node('box', 400, 400, 100, 60, 'a');
    const b = s.node('box', 0, 0, 100, 60, 'b');
    s.arrow(a, b);
    const bb = s.bounds();
    expect(bb.x + bb.w).toBe(500);
    expect(bb.y + bb.h).toBe(460);
  });

  test('a scene file round-trips and re-checks the same', () => {
    const s = flow({ nodes: [{ id: 'a', c: 0, r: 0, text: 'a' }, { id: 'b', c: 1, r: 0, text: 'b' }], edges: [{ from: 'a', to: 'b' }] });
    const again = Scene.fromFile(JSON.parse(s.file()));
    expect(checkScene(again).findings).toEqual(checkScene(s).findings);
  });
});
