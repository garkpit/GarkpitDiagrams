import { colour, flow } from '../../src/index.ts';

// flow() with the start/final pseudostates (added after this scene showed the gap).
export const stateMachine = flow({
  title: 'Order lifecycle',
  cellW: 150,
  cellH: 52,
  gapX: 120,
  gapY: 90,
  nodes: [
    { id: 'start', c: 0, r: 0, text: '', kind: 'start' },
    { id: 'created', c: 1, r: 0, text: 'created', kind: 'pill' },
    { id: 'paid', c: 2, r: 0, text: 'paid', kind: 'pill' },
    { id: 'packed', c: 3, r: 0, text: 'packed', kind: 'pill' },
    { id: 'shipped', c: 4, r: 0, text: 'shipped', kind: 'pill' },
    { id: 'cancelled', c: 1, r: 1, text: 'cancelled', kind: 'pill', fill: colour.red },
    { id: 'refunded', c: 2, r: 1, text: 'refunded', kind: 'pill', fill: colour.orange },
    { id: 'delivered', c: 4, r: 1, text: 'delivered', kind: 'pill', fill: colour.green },
    { id: 'end1', c: 0, r: 1, text: '', kind: 'final' },
    { id: 'end2', c: 4, r: 2, text: '', kind: 'final' }
  ],
  edges: [
    { from: 'start', to: 'created', label: 'place order' },
    { from: 'created', to: 'paid', label: 'payment ok' },
    { from: 'paid', to: 'packed', label: 'pick' },
    { from: 'packed', to: 'shipped', label: 'collected' },
    { from: 'shipped', to: 'delivered', label: 'signed for' },
    { from: 'delivered', to: 'end2', label: '14 days' },
    { from: 'created', to: 'cancelled', label: 'timeout / cancel' },
    { from: 'paid', to: 'refunded', label: 'cancel' },
    { from: 'delivered', to: 'refunded', label: 'return accepted' },
    { from: 'cancelled', to: 'end1' },
    { from: 'refunded', to: 'end1', route: 'below' },
    // Self-loops: out of the top and back into the top, each on its own state.
    { from: 'created', to: 'created', self: 'top', label: 'card declined' },
    { from: 'shipped', to: 'shipped', self: 'top', label: 'tracking update' }
  ]
});

export const stateMachineNote =
  "Order lifecycle in flow(). Works: states as pills, labelled transitions, kind 'start' (dot) and 'final' (bullseye) pseudostates at a fixed size centred in their cell, a 'below' route to the final state, and two self-loops with `self: 'top'`: each leaves the top at -0.25 of its width and comes back in at +0.25, bound to the state at both ends, so created's loop (dropped in the first version for colliding with its outgoing transition) fits again. A label wider than the loop sits just above it rather than hiding its corners. Edges can also leave and arrive at a chosen side and offset (`exit`/`enter`, e.g. ['bottom', 0.25]), and the below/above/left/right routes run from those ports.";
