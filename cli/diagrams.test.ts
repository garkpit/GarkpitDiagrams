import { describe, expect, test } from 'bun:test';
import { COMMANDS } from './commands.ts';

const cli = `${import.meta.dir}/diagrams.ts`;
const run = (...args: string[]) => {
  const p = Bun.spawnSync(['bun', cli, ...args], { env: { ...process.env, NO_COLOR: '1' } });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};

describe('cli', () => {
  test('bare invocation lists the commands and exits 0', () => {
    const r = run();
    expect(r.code).toBe(0);
    for (const c of COMMANDS) expect(r.out).toContain(c.name);
  });
  test('every command has --help, help <cmd>, a usage line and an example', () => {
    for (const c of COMMANDS) {
      for (const args of [[c.name, '--help'], ['help', c.name]]) {
        const r = run(...args);
        expect(r.code).toBe(0);
        expect(r.out).toContain(`diagrams ${c.name}`);
        expect(r.out).toContain('Examples');
      }
    }
  });
  test('a typo suggests the closest command', () => {
    const r = run('rendr');
    expect(r.code).toBe(2);
    expect(r.err).toContain('did you mean `diagrams render`');
  });
  test('an unknown flag suggests the closest flag', () => {
    const r = run('check', 'x', '--strcit');
    expect(r.code).toBe(2);
    expect(r.err).toContain('did you mean --strict');
  });
  test('rules --json is valid JSON', () => {
    const r = run('rules', '--json');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).length).toBeGreaterThan(5);
  });
  test('check on a missing path names it and exits 2', () => {
    const r = run('check', '/nope/nothing.excalidraw');
    expect(r.code).toBe(2);
    expect(r.err).toContain('no such file');
  });
});
