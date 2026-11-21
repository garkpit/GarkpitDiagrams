import { quadrant } from '../../src/layouts/quadrant.ts';

export const effortImpact = quadrant({
  title: 'Q1 backlog: effort against impact',
  xAxis: { title: 'Effort', low: 'low', high: 'high' },
  yAxis: { title: 'Impact', low: 'low', high: 'high' },
  mark: 'dot',
  quadrants: [{ title: 'Quick wins' }, { title: 'Big bets' }, { title: 'Fill-ins' }, { title: 'Money pits' }],
  points: [
    { text: 'Cache the search API', x: 0.18, y: 0.82 },
    { text: 'Fix checkout error copy', x: 0.1, y: 0.68 },
    { text: 'Saved payment cards', x: 0.36, y: 0.9 },
    { text: 'Rebuild pricing engine', x: 0.84, y: 0.86 },
    { text: 'Native mobile app', x: 0.92, y: 0.62 },
    { text: 'Dark mode', x: 0.22, y: 0.22 },
    { text: 'Rename internal services', x: 0.38, y: 0.12 },
    { text: 'Migrate to a new CMS', x: 0.8, y: 0.2 }
  ]
});

export const effortImpactNote = 'quadrant() with points: each item placed by (effort, impact) in 0..1 as a dot with its label beside it, kept wholly inside the quadrant its coordinates name and below the quadrant title, then nudged apart until no two collide (the quadrants grow if they cannot). Positions are therefore approximate near crowded spots; mark: "card" draws small labelled cards instead.';
