import { colour } from '../../src/index.ts';
import { tree } from '../../src/layouts/tree.ts';

export const decisionTree = tree({
  title: 'Build, buy or adopt open source?',
  direction: 'down',
  root: {
    text: 'Is it core to what makes us different?',
    kind: 'diamond',
    children: [
      {
        text: 'Do we have the people to build and run it?',
        kind: 'diamond',
        edgeLabel: 'yes',
        children: [
          { text: 'Build it in-house', fill: colour.green, edgeLabel: 'yes' },
          { text: 'Hire or partner first, then build', fill: colour.orange, edgeLabel: 'no' }
        ]
      },
      {
        text: 'Is there a mature open-source option?',
        kind: 'diamond',
        edgeLabel: 'no',
        children: [
          { text: 'Adopt it and contribute fixes upstream', fill: colour.teal, edgeLabel: 'yes' },
          { text: 'Buy a SaaS product', fill: colour.blue, edgeLabel: 'no' }
        ]
      }
    ]
  }
});

export const decisionTreeNote = 'tree() pointing down: diamonds for questions, coloured leaves for outcomes, and yes/no on white plates on the last leg into each child (the level gap grows to fit them). A question with two children that sit clear of its sides exits from its side vertices, as in a flowchart; otherwise each child gets one Excalidraw elbow arrow, bound to the question and to the child at fixed points, down a shared stem and along the bus with that segment pinned, so dragging either node in excalidraw.com re-routes the connector and keeps the bus (Excalidraw draws elbow corners rounded, so a short stem forks like a brace). The fit check treats the shared stem as a trunk, not an arrow-overlap. Limits: diamonds are wide for their text (the label gets 56% of the width), so keep questions under about eight words.';
