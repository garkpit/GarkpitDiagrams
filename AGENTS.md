# AGENTS.md: @garkpit/diagrams

Excalidraw diagram library + `diagrams` CLI. Read README.md first.

- Bun + TypeScript only. `bun run check` must pass before every push (typecheck, tests, README drift, gallery fit check). No GitHub Actions.
- `src/font.ts` measures text with real Excalifont metrics; never replace it with a guessed character width.
- `src/check.ts` is the fit check. A finding is fixed by changing the drawing (gap, width, route, label), or by fixing the rule when it is provably wrong (show the preview). Never weaken a rule to make a drawing pass.
- The CLI help and the README command section both come from `cli/commands.ts`; run `bun run docs` after changing it.
- Every new layout gets a gallery scene in `gallery/kinds/` with a note, and must pass the fit check and a look at its preview.
- Everything that ships is public: the code (`bun run publish` pushes HEAD, minus the `[exclude]` paths in the local `.publicignore`, to the `public` remote after gitleaks and a private-word scan) and the Pages site (`bun run pages --push`, which publish also runs). Keep wording in tracked files public: no local paths, hosts or internal consumers.
- Remotes: `public` is github.com/garkpit/GarkpitDiagrams (public, read-only, one commit per publish); the site is https://garkpit.github.io/GarkpitDiagrams/. Consumers take a synced export with a SOURCE.md.
