// @garkpit/diagrams: Excalidraw diagrams from a small TypeScript DSL.
export { blockWidth, fontFaceCss, LINE_HEIGHT, measure, textHeight, wrapPx } from './font.ts';
export { type ArrowOpts, colour, type El, fractionalIndex, innerWidth, type Kind, laneFills, longestMidpoint, neededHeight, type NodeOpts, bindingFocus, fixedPoint, type Port, portPoint, PSEUDO, type Role, roleOf, Scene, type Side } from './scene.ts';
export { flow, type FlowBand, type FlowEdge, type FlowNode, type FlowPort, type FlowSpec, nestBands, type NestedBand } from './flow.ts';
export { renderSvg, type SvgOptions, svgSize } from './svg.ts';
export { type CheckOptions, type CheckResult, checkScene, type Finding, RULES, type Severity, validIndex } from './check.ts';
export { LoadError, type Loaded, loadScenes } from './load.ts';
export { galleryPage, type GalleryOptions, type Rendered, type RenderOptions, renderOne } from './output.ts';
export { type DocOptions, type DocResult, docHtml, renderDoc } from './doc.ts';
export { sequence, type SequenceFrame, type SequenceMessage, type SequenceNote, type SequenceParticipant, type SequenceSpec, type SequenceStep } from './layouts/sequence.ts';
export { timeline, type TimelineEvent, type TimelinePhase, type TimelineSpec } from './layouts/timeline.ts';
export { branchPalette, fitNode, tree, type TreeNode, type TreeSpec } from './layouts/tree.ts';
export { type Quadrant, type QuadrantAxis, quadrant, quadrantFills, type QuadrantPoint, type QuadrantSpec } from './layouts/quadrant.ts';
export { entityTable, er, type ErEntity, type ErField, type ErFieldSpec, type ErRelation, type ErSpec, type ErTable, parseField, tableSize, type TableOpts } from './layouts/er.ts';
/** Low-fi UI pieces: frames, controls, callouts. `wireframe.browserFrame(scene, box, …)` etc. */
export * as wireframe from './layouts/wireframe.ts';
