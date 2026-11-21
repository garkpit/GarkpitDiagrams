import { timeline } from '../../src/layouts/timeline.ts';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const timelineScene = timeline({
  title: 'Ledgerly 2.0: the 2026 product year',
  ticks: [...months.map((label, at) => ({ at, label })), { at: 12, label: '2027' }],
  phases: [
    { from: 0, to: 3, label: 'Discover' },
    { from: 3, to: 8, label: 'Build' },
    { from: 8, to: 12, label: 'Launch and grow' }
  ],
  events: [
    { at: 0.3, title: 'Kick-off', text: 'Goals and research plan agreed' },
    { at: 1.4, title: '42 customer interviews', text: 'Month-end close is the pain' },
    { at: 2.6, title: 'Prototype tested', text: '8 of 10 finish the close' },
    { at: 3, title: 'Scope frozen', milestone: true },
    { at: 4.5, title: 'Private alpha', text: '40 design-partner teams' },
    { at: 6.1, title: 'Bank feeds live', text: 'UK and EU banks' },
    { at: 7.4, title: 'Public beta', text: '1,200 sign-ups in week one' },
    { at: 8.2, title: 'Launch 2.0', text: 'Paid plans open', milestone: true },
    { at: 9.6, title: '1,000 paying teams' },
    { at: 11.3, title: 'Year-end review', text: 'Plan 2027' }
  ]
});

export const timelineNote =
  "timeline(): a proportional month scale (ticks as { at, label }), ten events alternating above and below, three phases tinting their columns, and two milestones with a diamond at the axis and a heavier card. Each card's title is its own label, pinned to the top of the card (where excalidraw.com keeps it when edited), with the detail underneath in a smaller dark-grey size (`detailSize`, default 13); the detail is a second text grouped with the card, so they move together, and the fit check keeps it inside the card and clear of the title. Card sizes come from measured text; a card that would touch a neighbour moves up a level, and only where its connector misses every nearer card and it covers no farther connector. Equal slots work too (ticks as strings, at names a slot). Limits: the title cannot be truly bold, because Excalidraw text has no weight and Excalifont has one (the only bold face, Lilita One, is a different font the fit check cannot measure), so the title leads by size and colour instead; at most two events can share an exact date; and a dense cluster grows the whole scale, because the axis stays linear.";
