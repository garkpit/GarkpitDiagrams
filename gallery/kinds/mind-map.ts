import { tree } from '../../src/layouts/tree.ts';

export const mindMap = tree({
  title: 'Launching a side project',
  direction: 'mindmap',
  root: {
    text: 'Launch a side project',
    children: [
      { text: 'Idea', children: [{ text: 'A problem I have myself' }, { text: 'Who else has it?' }, { text: 'One-line pitch' }] },
      { text: 'Build', children: [{ text: 'Smallest useful version' }, { text: 'Ship every week' }, { text: 'Boring, known stack' }, { text: 'Automate the deploy' }] },
      { text: 'Audience', children: [{ text: 'Landing page and waitlist' }, { text: 'Write about it in public' }, { text: 'Talk to ten users' }] },
      { text: 'Money', children: [{ text: 'Charge from day one' }, { text: 'Keep costs under £50 a month' }] },
      { text: 'Time', children: [{ text: 'Two mornings a week' }, { text: 'Kill criteria at three months' }] }
    ]
  }
});

export const mindMapNote = 'tree() in mindmap mode: the root in the centre, first-level branches split left and right by breadth so the two sides balance, each side its own tidy tree, one colour per branch (strong fill on the branch, pale fill and a coloured outline on its leaves). Connectors are headless arrows with Excalidraw curve roundness, leaving each parent at evenly spread heights so siblings never share a stroke. The fit check samples their control polygon, which stays within a few pixels of the drawn curve. A branch with five or more leaves bunches its exits; split it.';
