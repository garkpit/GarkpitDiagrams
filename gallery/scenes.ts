// The gallery: one scene per diagram kind, each with a note on what worked and what did not.
// `bun run gallery` renders them to gallery/out/index.html; `bun run check` fit-checks every one.
import type { Scene } from '../src/index.ts';
import { architecture, architectureNote } from './kinds/architecture.ts';
import { decisionTree, decisionTreeNote } from './kinds/decision-tree.ts';
import { effortImpact, effortImpactNote } from './kinds/effort-impact.ts';
import { erDiagram, erNote } from './kinds/er.ts';
import { mindMap, mindMapNote } from './kinds/mind-map.ts';
import { moduleTree, moduleTreeNote } from './kinds/org-or-module-tree.ts';
import { quickStart } from './kinds/quick-start.ts';
import { sequenceNote, sequenceScene } from './kinds/sequence.ts';
import { stateMachine, stateMachineNote } from './kinds/state-machine.ts';
import { swot, swotNote } from './kinds/swot.ts';
import { timelineNote, timelineScene } from './kinds/timeline.ts';
import { wireframeNote, wireframeSignIn } from './kinds/wireframe.ts';

export const scenes: Record<string, Scene> = {
  'quick-start': quickStart,
  'state-machine': stateMachine,
  architecture,
  sequence: sequenceScene,
  'decision-tree': decisionTree,
  'mind-map': mindMap,
  'module-tree': moduleTree,
  timeline: timelineScene,
  er: erDiagram,
  swot,
  'effort-impact': effortImpact,
  wireframe: wireframeSignIn
};

export const notes: Record<string, string> = {
  'quick-start': 'The README example: flow() with a decision diamond, labelled edges and an elbow back to the start.',
  'state-machine': stateMachineNote,
  architecture: architectureNote,
  sequence: sequenceNote,
  'decision-tree': decisionTreeNote,
  'mind-map': mindMapNote,
  'module-tree': moduleTreeNote,
  timeline: timelineNote,
  er: erNote,
  swot: swotNote,
  'effort-impact': effortImpactNote,
  wireframe: wireframeNote
};

/** Display titles for the demonstration and the Pages site. */
export const titles: Record<string, string> = {
  'quick-start': 'Quick start: a flowchart',
  'state-machine': 'State machine',
  architecture: 'Architecture with nested groups',
  sequence: 'Sequence diagram',
  'decision-tree': 'Decision tree',
  'mind-map': 'Mind map',
  'module-tree': 'Module tree',
  timeline: 'Timeline',
  er: 'Data model (ER)',
  swot: 'SWOT',
  'effort-impact': 'Effort and impact quadrant',
  wireframe: 'Wireframe'
};
