import { tree } from '../../src/layouts/tree.ts';

export const moduleTree = tree({
  title: 'acme monorepo: packages',
  direction: 'right',
  branchColours: true,
  root: {
    text: 'acme/',
    kind: 'store',
    children: [
      {
        text: 'apps/',
        children: [
          { text: 'web: SvelteKit storefront' },
          { text: 'admin: internal dashboard' },
          { text: 'worker: queue consumer for orders and email' }
        ]
      },
      {
        text: 'packages/',
        children: [
          { text: 'ui: Svelte 5 components on Bits UI' },
          { text: 'mediator: commands, queries, pipeline behaviours' },
          { text: 'db: Drizzle schema and migrations' },
          { text: 'config: shared tsconfig and lint rules' }
        ]
      },
      { text: 'tools/', children: [{ text: 'release: changelog and publish' }, { text: 'codegen: typed API clients' }] }
    ]
  }
});

export const moduleTreeNote = "tree() pointing right with branch colours: each top-level folder keeps its colour down to its leaves, nodes are left-aligned in their column so the arrows end on a straight edge, and long descriptions wrap at maxW instead of widening the column. Each child hangs from its parent by one Excalidraw elbow arrow in the parent's colour, bound at both ends, sharing the stem and bus with its siblings (drawn with one seed, so the shared stretch reads as one line); the bus segment is pinned, so dragging a parent or a child in excalidraw.com re-routes the connector along the same bus. With uneven subtrees the contour packing pulls small subtrees close to big ones, which is compact but not evenly spaced.";
