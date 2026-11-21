# @garkpit/diagrams

Excalidraw diagrams from a small TypeScript DSL. You describe nodes on a grid and the edges between
them; the library lays them out, measures every label in the real Excalifont (fontkit glyph
advances, not a guessed character width), grows each shape to fit its text, and writes:

- `.excalidraw` files that open and edit in excalidraw.com (Excalidraw v2 schema, valid fractional indices)
- `.svg` with the Excalifont embedded, so the drawing looks the same in GitHub, a Markdown viewer or a PDF
- `.png` previews (headless Chrome) for the visual pass
- a gallery page of a whole set, and Markdown → HTML → A4 PDF with the diagrams inlined (printed by headless Chrome)

A **fit check** automates most of the visual pass: text inside its shape, arrow labels off nodes, no
overlapping nodes, arrows routed round nodes rather than through them, nothing straddling a lane or
group, file integrity (ids, bindings, indices) and legibility once printed. It runs on every render
and on any `.excalidraw` file, however it was made. It does not judge clarity, so still look at the
previews.

Bun + TypeScript. Runtime dependencies: `@excalidraw/excalidraw` (with its React peers), happy-dom,
fontkit, marked.

## Quick start

```ts
// docs/my-doc/diagrams.ts
import { colour, flow, type Scene } from '@garkpit/diagrams';

export const scenes: Record<string, Scene> = {
  'review-loop': flow({
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
  })
};
```

```sh
diagrams render docs/my-doc --preview /tmp/previews   # images/*.excalidraw + *.svg, PNGs, fit check
diagrams pdf docs/my-doc/My-Doc.md                     # out/My-Doc.html + .pdf
```

Reference a diagram from Markdown as `![Caption](images/review-loop.svg)`.

Under the `diagrams` CLI, `import … from '@garkpit/diagrams'` works in a scenes module in any folder: the CLI points it at its own copy of the library, so a doc folder needs no `node_modules`. (An editor will not resolve it there; a project that vendors the library can import its synced export by relative path instead.)

## The DSL

- **`flow(spec)`**: flowcharts and swim lanes on a grid. Nodes have a column `c` and row `r`
  (fractions allowed), a `kind` (`box`, `diamond`, `pill`, `circle`, `store`, `note`), optional
  `span`, `fill`, `size`. Rows grow to their tallest node. Edges route `straight`, `direct`, `h`
  (across then down), `v` (down then across), `below`/`above`/`left`/`right` (loop round the
  outside), or through grid waypoints `via: [[c, r], …]` where 2.5 means the gap after column 2.
  `exit`/`enter` pick the side an edge leaves or arrives at, with an optional offset along it
  (`'bottom'` or `['bottom', 0.25]`, a fraction of the side from its middle); routes then run from
  those ports. `self: 'top'` (with `from === to`) draws a self-loop out of and back into that side,
  `off` px out, label centred on the loop.
  `lanes` give each owner a row range and a label column; `bands` group cells behind a label
  (`labelAt: 'right'` for the top-right corner) and nest by themselves: a band whose cells lie
  within another's is drawn inside it, each level padded `bandPad` px further out (default 20) with
  a label line on top, and the gap above a row grows to fit the bands starting or ending there.
  `notes` drop grey annotations on the grid.
- **`Scene`**: the primitives when a layout does not fit a grid: `node`, `band`, `lane`, `rect`,
  `line`, `text` (`valign: 'top'` pins a container's label to its top), `note`, `title`, `arrow` (edge to edge, waypoints, label on a white plate,
  `startAt`/`endAt` to pin an end to a point and leave it unbound, `startPort`/`endPort`
  `{ side, at }` to leave or arrive at a side while staying bound, `elbowed` with ports and
  orthogonal waypoints for an Excalidraw elbow arrow, `pin` to keep segments put when it
  re-routes), `plate`. `portPoint(el, port)`
  gives a port's coordinates.
- **`sequence(spec)`**: participants, lifelines, calls and replies, activation bars, notes and
  frames. A message label is centred over its arrow when it clears every lifeline there, else it
  sits in the gap beside the sender.
- **`timeline(spec)`**: events as cards above and below an axis, phases, milestones. A card's
  title leads (its label, pinned to the card's top) and its `text` sits underneath at `detailSize`
  (default 13).
- **`tree(spec)`**: org charts, decision trees, module trees (`down`, `right`) and mind maps. In
  down/right trees each child hangs from its parent by one elbow arrow bound at both ends, along a
  shared stem and bus, so excalidraw.com re-routes it when either node is dragged.
- Also `quadrant`, `er` and the `wireframe` kit; see their spec types.
- **`colour`**: Excalidraw's palette (`blue`, `yellow`, `green`, `red`, `violet`, `orange`, `teal`,
  `pink`, `paper`, `grey`, `ink`).

## Commands

Install the CLI as `~/.local/bin/diagrams` with `bun run install:bin`, or run `bun cli/diagrams.ts`.

<!-- cli:start (generated by `bun run docs` from cli/commands.ts; do not edit) -->

An <input> is a scenes module (a .ts file exporting `scenes: Record<string, Scene>`), a folder holding diagrams.ts or scenes.ts, a folder of .excalidraw files, or one .excalidraw file drawn by anything.

### `diagrams render <input>...`

Write .excalidraw and .svg for each scene, then fit-check it. Each scene becomes <out>/<name>.excalidraw (opens in excalidraw.com) and <out>/<name>.svg (Excalifont embedded). The fit check runs on every scene; any error makes the exit code 1, so a render in `bun run check` fails when text spills out of a box.

| Flag | What it does |
|---|---|
| `-o, --out <dir>` | Output folder. Default: images/ beside the scenes module, or beside the .excalidraw file. |
| `--only <name>` | Work on one scene (repeat the flag for several). |
| `-p, --preview <dir>` | Also screenshot each SVG to <dir>/<name>.png with headless Chrome for the visual pass. |
| `--scale <n>` | Device pixel ratio of previews (default 1; 2 for sharp review images). |
| `--allow-errors` | Exit 0 even when the fit check finds errors (they are still reported). |
| `--source <text>` | The `source` field written into .excalidraw files (default "garkpit-diagrams"). |
| `--json` | Print machine-readable JSON on stdout instead of the report. |

```sh
diagrams render docs/concepts/evals
diagrams render docs/concepts/evals --only p1-loop --preview /tmp/previews --scale 2
```

### `diagrams preview <input>...`

Screenshot each scene to a PNG for the visual pass (writes no SVG beside the source). Renders in memory and screenshots with headless Chrome. Look at every PNG before calling a diagram done: the fit check catches overflow and collisions, not whether the drawing is clear.

| Flag | What it does |
|---|---|
| `-o, --out <dir>` | Where the PNGs go. Default: $TMPDIR/garkpit-diagrams/previews. |
| `--only <name>` | Work on one scene (repeat the flag for several). |
| `--scale <n>` | Device pixel ratio (default 1). |
| `--json` | Print machine-readable JSON on stdout instead of the report. |

```sh
diagrams preview gallery/scenes.ts --only sequence
diagrams preview drawing.excalidraw --out ./previews --scale 2
```

### `diagrams check <input>...`

Run the fit check: text inside its shape, labels off nodes, no overlaps, arrows round nodes, file integrity. Works on any .excalidraw file, not only ones this library drew. Exit 0 when there are no errors, 1 when there are (or warnings too, with --strict). `diagrams rules` lists every rule.

| Flag | What it does |
|---|---|
| `--only <name>` | Work on one scene (repeat the flag for several). |
| `--strict` | Treat warnings as errors. |
| `-q, --quiet` | Print only scenes with findings. |
| `--json` | Print machine-readable JSON on stdout instead of the report. |

```sh
diagrams check docs/concepts/evals
diagrams check ~/diagrams/hand-made.excalidraw --json
```

### `diagrams gallery <input>...`

Render every scene into one HTML page with its fit-check result, for looking through a set. Writes <out>/index.html plus each scene's .excalidraw and .svg under <out>/images. A scenes module may also export `notes: Record<string, string>`, shown under each drawing.

| Flag | What it does |
|---|---|
| `-o, --out <dir>` | Output folder (required). |
| `-t, --title <text>` | Page title. Default "<folder> diagrams". |
| `--only <name>` | Work on one scene (repeat the flag for several). |
| `--open` | Open the page in the default browser when done. |
| `--json` | Print machine-readable JSON on stdout instead of the report. |

```sh
diagrams gallery gallery/scenes.ts --out gallery/out --title "GarkpitDiagrams gallery"
```

### `diagrams pdf <doc.md>`

Turn a Markdown doc into HTML and an A4 PDF, with its diagrams inlined as SVG. Images are inlined (SVGs as markup so the hand-drawn font travels with the page). Every H2 starts a new page. The PDF is printed by headless Chrome; CHROME_BIN overrides the Chrome path. Render the diagrams first.

| Flag | What it does |
|---|---|
| `-o, --out <dir>` | Output folder. Default: out/ beside the doc. |
| `--portrait` | A4 portrait instead of landscape. |
| `--html-only` | Write the HTML and skip the PDF. |
| `--json` | Print machine-readable JSON on stdout instead of the report. |

```sh
diagrams pdf docs/concept.md
diagrams pdf notes.md --portrait --out /tmp/out
```

### `diagrams list <input>...`

List the scenes an input holds, with their size and element count. Builds each scene in memory; renders nothing.

| Flag | What it does |
|---|---|
| `--json` | Print machine-readable JSON on stdout instead of the report. |

```sh
diagrams list gallery/scenes.ts --json
```

### `diagrams rules`

List every fit-check rule and its severity. Errors fail `check` and `render`; warnings fail only with --strict; info is never a failure.

| Flag | What it does |
|---|---|
| `--json` | Print machine-readable JSON on stdout instead of the report. |

```sh
diagrams rules
```

### `diagrams help [command]`

Show help for all commands or one. `diagrams <command> --help` does the same.

```sh
diagrams help render
```

Global flags: `-h, --help` show help; `-V, --version` print the version; `--no-color` plain output (also when no_color is set or output is piped).

### Fit-check rules

| Rule | Severity | Catches |
|---|---|---|
| `duplicate-id` | error | Two elements share an id. |
| `bad-index` | error | An element `index` is not a valid fractional key or is out of order (excalidraw.com rejects or rewrites the file). |
| `broken-binding` | error | A containerId, arrow binding or boundElements entry points at an element that is missing or does not point back. |
| `text-overflow` | error | Text measured in Excalifont does not fit inside its box, diamond, ellipse or label plate; a second text placed in a node (customData.in) must also clear the node's own label. |
| `node-overlap` | error | Two nodes overlap. |
| `label-on-node` | error | An arrow label sits on a node. |
| `label-overlap` | error | Two arrow labels overlap. |
| `text-on-node` | error | A title, note or lane/band label sits on a node. |
| `arrow-through-node` | error | An arrow runs through a node that is not one of its ends, or doubles back through its own end node. |
| `arrow-through-text` | error | An arrow runs through a title, note, or lane or band label. |
| `crosses-boundary` | error | A node, text or band is partly inside a lane or band (it should be wholly in or wholly out). |
| `arrow-overlap` | warn | Two arrows run along the same line for a stretch, so a reader cannot tell which goes where. One exception, a shared trunk: elbow arrows bound to the same fixed point on the same node may run together from there until they part (a tree bus, which Excalidraw re-routes as one), since each then goes its own way; any overlap after they part still counts. |
| `label-covers-arrow` | warn | An arrow label's white plate hides part of a different arrow. |
| `small-on-page` | warn | Scaled to fit an A4 page (landscape or portrait, whichever suits it better), the smallest text would print under 7 pt. |
| `font-not-measured` | warn | Text uses a font other than Excalifont, so its fit was measured approximately. |
| `arrow-crossing` | info | Two arrows cross (sometimes unavoidable; fewer is clearer). |

<!-- cli:end -->

## Developing

`bun run check` runs the typecheck, tests, the README drift check and the fit check over the
gallery. No GitHub Actions: run it locally before every push. `bun run gallery` rebuilds
`gallery/out/index.html`. `bun run demo` renders the gallery and prints the full demonstration
(intro, fit-check rules, one page per diagram kind, build notes) to
`gallery/out/GarkpitDiagrams-Demonstration.pdf`; `--out <dir>` and `--open` are optional.

`bun run pages` builds the GitHub Pages site into `site/` (git-ignored): a landing page with every
diagram kind, the gallery, the demonstration as HTML and PDF, and this README as a reference page,
all in public wording (no local paths). `bun run pages --push` commits that folder to the
`gh-pages` branch of the `public` remote and pushes it; GitHub serves the branch as it is, so there is
no workflow file. The site is live at https://garkpit.github.io/GarkpitDiagrams/.

This repository is published from a working copy with `bun run publish`: one commit per update,
scanned for secrets first, then the site is rebuilt.

## Licence

MIT (see `LICENSE`; font notice in `NOTICE`). The SVGs, pages and PDFs it writes embed Excalifont, © Excalidraw, which is
licensed separately under the SIL Open Font License 1.1.
