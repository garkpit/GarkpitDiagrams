import { colour, flow } from '../../src/index.ts';

export const quickStart = flow({
  title: 'Review loop',
  nodes: [
    { id: 'pr', c: 0, r: 0, text: 'Open a pull request', kind: 'pill' },
    { id: 'ok', c: 1, r: 0, text: 'Checks green?', kind: 'diamond' },
    { id: 'merge', c: 2, r: 0, text: 'Merge', fill: colour.green },
    { id: 'fix', c: 1, r: 1, text: 'Fix and push', fill: colour.red }
  ],
  edges: [
    { from: 'pr', to: 'ok' },
    { from: 'ok', to: 'merge', label: 'yes' },
    { from: 'ok', to: 'fix', label: 'no' },
    { from: 'fix', to: 'pr', route: 'h' }
  ]
});
