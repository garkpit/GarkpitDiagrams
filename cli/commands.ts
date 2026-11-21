// The one table of commands and flags. `diagrams help` prints from it and scripts/docs.ts writes
// the README's command reference from it, so the two never drift.

export interface Flag {
  name: string;
  short?: string;
  /** Placeholder for the value, e.g. "<dir>"; omitted for boolean flags. */
  value?: string;
  desc: string;
}

export interface Command {
  name: string;
  args: string;
  summary: string;
  detail: string;
  flags: Flag[];
  examples: string[];
}

const json: Flag = { name: 'json', desc: 'Print machine-readable JSON on stdout instead of the report.' };
const only: Flag = { name: 'only', value: '<name>', desc: 'Work on one scene (repeat the flag for several).' };

export const INPUT_HELP =
  'An <input> is a scenes module (a .ts file exporting `scenes: Record<string, Scene>`), a folder holding diagrams.ts or scenes.ts, a folder of .excalidraw files, or one .excalidraw file drawn by anything.';

export const COMMANDS: Command[] = [
  {
    name: 'render',
    args: '<input>...',
    summary: 'Write .excalidraw and .svg for each scene, then fit-check it.',
    detail:
      'Each scene becomes <out>/<name>.excalidraw (opens in excalidraw.com) and <out>/<name>.svg (Excalifont embedded). The fit check runs on every scene; any error makes the exit code 1, so a render in `bun run check` fails when text spills out of a box.',
    flags: [
      { name: 'out', short: 'o', value: '<dir>', desc: 'Output folder. Default: images/ beside the scenes module, or beside the .excalidraw file.' },
      only,
      { name: 'preview', short: 'p', value: '<dir>', desc: 'Also screenshot each SVG to <dir>/<name>.png with headless Chrome for the visual pass.' },
      { name: 'scale', value: '<n>', desc: 'Device pixel ratio of previews (default 1; 2 for sharp review images).' },
      { name: 'allow-errors', desc: 'Exit 0 even when the fit check finds errors (they are still reported).' },
      { name: 'source', value: '<text>', desc: 'The `source` field written into .excalidraw files (default "garkpit-diagrams").' },
      json
    ],
    examples: ['diagrams render docs/concepts/evals', 'diagrams render docs/concepts/evals --only p1-loop --preview /tmp/previews --scale 2']
  },
  {
    name: 'preview',
    args: '<input>...',
    summary: 'Screenshot each scene to a PNG for the visual pass (writes no SVG beside the source).',
    detail: 'Renders in memory and screenshots with headless Chrome. Look at every PNG before calling a diagram done: the fit check catches overflow and collisions, not whether the drawing is clear.',
    flags: [
      { name: 'out', short: 'o', value: '<dir>', desc: 'Where the PNGs go. Default: $TMPDIR/garkpit-diagrams/previews.' },
      only,
      { name: 'scale', value: '<n>', desc: 'Device pixel ratio (default 1).' },
      json
    ],
    examples: ['diagrams preview gallery/scenes.ts --only sequence', 'diagrams preview drawing.excalidraw --out ./previews --scale 2']
  },
  {
    name: 'check',
    args: '<input>...',
    summary: 'Run the fit check: text inside its shape, labels off nodes, no overlaps, arrows round nodes, file integrity.',
    detail: 'Works on any .excalidraw file, not only ones this library drew. Exit 0 when there are no errors, 1 when there are (or warnings too, with --strict). `diagrams rules` lists every rule.',
    flags: [only, { name: 'strict', desc: 'Treat warnings as errors.' }, { name: 'quiet', short: 'q', desc: 'Print only scenes with findings.' }, json],
    examples: ['diagrams check docs/concepts/evals', 'diagrams check ~/diagrams/hand-made.excalidraw --json']
  },
  {
    name: 'gallery',
    args: '<input>...',
    summary: 'Render every scene into one HTML page with its fit-check result, for looking through a set.',
    detail: 'Writes <out>/index.html plus each scene\'s .excalidraw and .svg under <out>/images. A scenes module may also export `notes: Record<string, string>`, shown under each drawing.',
    flags: [
      { name: 'out', short: 'o', value: '<dir>', desc: 'Output folder (required).' },
      { name: 'title', short: 't', value: '<text>', desc: 'Page title. Default "<folder> diagrams".' },
      only,
      { name: 'open', desc: 'Open the page in the default browser when done.' },
      json
    ],
    examples: ['diagrams gallery gallery/scenes.ts --out gallery/out --title "GarkpitDiagrams gallery"']
  },
  {
    name: 'pdf',
    args: '<doc.md>',
    summary: 'Turn a Markdown doc into HTML and an A4 PDF, with its diagrams inlined as SVG.',
    detail:
      'Images are inlined (SVGs as markup so the hand-drawn font travels with the page). Every H2 starts a new page. The PDF is printed by headless Chrome; CHROME_BIN overrides the Chrome path. Render the diagrams first.',
    flags: [
      { name: 'out', short: 'o', value: '<dir>', desc: 'Output folder. Default: out/ beside the doc.' },
      { name: 'portrait', desc: 'A4 portrait instead of landscape.' },
      { name: 'html-only', desc: 'Write the HTML and skip the PDF.' },
      json
    ],
    examples: ['diagrams pdf docs/concept.md', 'diagrams pdf notes.md --portrait --out /tmp/out']
  },
  {
    name: 'list',
    args: '<input>...',
    summary: 'List the scenes an input holds, with their size and element count.',
    detail: 'Builds each scene in memory; renders nothing.',
    flags: [json],
    examples: ['diagrams list gallery/scenes.ts --json']
  },
  {
    name: 'rules',
    args: '',
    summary: 'List every fit-check rule and its severity.',
    detail: 'Errors fail `check` and `render`; warnings fail only with --strict; info is never a failure.',
    flags: [json],
    examples: ['diagrams rules']
  },
  {
    name: 'help',
    args: '[command]',
    summary: 'Show help for all commands or one.',
    detail: '`diagrams <command> --help` does the same.',
    flags: [],
    examples: ['diagrams help render']
  }
];

export const GLOBAL_FLAGS: Flag[] = [
  { name: 'help', short: 'h', desc: 'Show help.' },
  { name: 'version', short: 'V', desc: 'Print the version.' },
  { name: 'no-color', desc: 'Plain output (also when NO_COLOR is set or output is piped).' }
];
