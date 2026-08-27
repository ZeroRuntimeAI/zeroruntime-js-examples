#!/usr/bin/env tsx
/**
 * Render the TypeScript examples into a standalone JavaScript examples repo.
 *
 *     npm run gen:js            # write ../zeroruntime-javascript-examples
 *     npm run gen:js -- --check # fail if regenerating would change a file
 *
 * The `.ts` files are the source of truth, for one reason that is not taste:
 * `tsc --noEmit` over this repo is what catches a provider called with an
 * argument its class does not accept, and a hand-maintained `.js` twin would
 * catch nothing. So the JavaScript repo is generated and never edited.
 *
 * Two stages. `tsc` strips the types -- it keeps comments and leaves class
 * fields as class fields, which esbuild does not -- and `prettier` puts the
 * formatting back afterwards, since `tsc` emits four-space indent and drops
 * blank lines between statements.
 *
 * A handful of runtime references have to move with the language: an MCP
 * example spawns its server, and in a JavaScript repo it spawns `node
 * current_time.js`, not `npx tsx current_time.ts`.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JS_ROOT = resolve(TS_ROOT, '..', 'zeroruntime-javascript-examples');
const PKG = '@zeroruntime/js-sdk';

/**
 * Source-level rewrites applied before transpiling.
 *
 * These are the places where the file names its own language at runtime rather
 * than merely being written in it -- spawning an MCP server, resolving a path
 * to one. Type-stripping cannot see them.
 */
const RUNTIME_FIXUPS: Array<[RegExp | string, string]> = [
  ["join(here, 'mcp_servers', 'current_time.ts')", "join(here, 'mcp_servers', 'current_time.js')"],
  ["join(dirname(fileURLToPath(import.meta.url)), 'discord_mcp_server.ts')",
   "join(dirname(fileURLToPath(import.meta.url)), 'discord_mcp_server.js')"],
  // `npx tsx server.ts` -> `node server.js`; process.execPath is the very
  // interpreter running this, so the server starts on the same one.
  ["executable_path: 'npx',\n          process_arguments: ['tsx', MCP_SERVER],",
   'executable_path: process.execPath,\n          process_arguments: [MCP_SERVER],'],
  ["executable_path: 'npx',\n          process_arguments: ['tsx', SERVER],",
   'executable_path: process.execPath,\n          process_arguments: [SERVER],'],
  ['// `npx tsx` so the server runs straight from TypeScript source,\n          // with no build step in between.',
   '// process.execPath is the Node running this file, so the server starts\n          // on the same interpreter with no launcher in between.'],
];

const HEADER = (source: string): string =>
  `// GENERATED from ${source} in zeroruntime-js-examples.\n` +
  `// Do not edit here -- edit the TypeScript source and run \`npm run gen:js\`.\n`;

function ts_sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'scripts' || entry.name.startsWith('.')) {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) out.push(relative(TS_ROOT, full));
    }
  };
  walk(TS_ROOT);
  return out.sort();
}

/** Strip types with tsc, then hand the result to prettier. */
function transpile(sources: string[]): Map<string, string> {
  // Staged inside the repo, not in /tmp: the examples import
  // `@zeroruntime/js-sdk`, and tsc resolves that by walking up to a
  // node_modules. A temp directory has none, so every import would fail.
  const staging = mkdtempSync(join(TS_ROOT, '.gen-js-'));
  const patched = join(staging, 'src');
  const emitted = join(staging, 'out');

  try {
    // The fixups go in before tsc so the emitted JavaScript already names .js
    // files and spawns node; patching the output would mean patching formatted
    // code twice.
    for (const rel of sources) {
      let text = readFileSync(join(TS_ROOT, rel), 'utf-8');
      for (const [from, to] of RUNTIME_FIXUPS) text = text.replaceAll(from as string, to);
      const target = join(patched, rel);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text, 'utf-8');
    }

    try {
    execFileSync(
      'npx',
      [
        'tsc', '--rootDir', patched, '--outDir', emitted,
        '--target', 'ES2022', '--module', 'nodenext', '--moduleResolution', 'nodenext',
        '--skipLibCheck', '--removeComments', 'false',
        ...sources.map((rel) => join(patched, rel)),
      ],
      // tsc writes diagnostics to stdout, so a swallowed stdout is a silent
      // failure. Capture it and surface it.
      { cwd: TS_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    } catch (error) {
      const out = String((error as { stdout?: Buffer }).stdout ?? '').trim();
      throw new Error(`tsc could not transpile the examples:\n${out.slice(0, 2000)}`);
    }

    execFileSync(
      'npx',
      ['--yes', 'prettier@3', '--write', '--single-quote', '--print-width', '92', `${emitted}/**/*.js`],
      { cwd: TS_ROOT, stdio: ['ignore', 'ignore', 'ignore'] },
    );

    const tree = new Map<string, string>();
    for (const rel of sources) {
      const js = rel.replace(/\.ts$/, '.js');
      tree.set(js, HEADER(rel) + '\n' + readFileSync(join(emitted, js), 'utf-8'));
    }
    return tree;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** package.json for a repo with no TypeScript in it at all. */
function manifest(): string {
  const ts = JSON.parse(readFileSync(join(TS_ROOT, 'package.json'), 'utf-8'));
  return (
    JSON.stringify(
      {
        name: 'zeroruntime-javascript-examples',
        version: '0.0.0',
        private: true,
        type: 'module',
        description: 'Runnable JavaScript examples for the ZeroRuntime SDK.',
        engines: ts.engines,
        scripts: { example: 'node' },
        dependencies: {
          [PKG]: ts.dependencies[PKG],
          '@modelcontextprotocol/sdk': ts.dependencies['@modelcontextprotocol/sdk'],
          dotenv: ts.dependencies.dotenv,
          zod: ts.dependencies.zod,
        },
        optionalDependencies: ts.optionalDependencies,
      },
      null,
      2,
    ) + '\n'
  );
}

/** The prose repos share, with every `.ts` turned into `.js`. */
function docs(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) {
        const rel = relative(TS_ROOT, full);
        let text = readFileSync(full, 'utf-8')
          .replaceAll('.ts`', '.js`')
          .replaceAll('.ts |', '.js |')
          .replaceAll('npx tsx ', 'node ')
          .replaceAll('zeroruntime-js-examples', 'zeroruntime-javascript-examples');
        if (rel === 'README.md') {
          text = text
            .replace('# zeroruntime examples', '# zeroruntime examples (JavaScript)')
            .replace(
              'That installs the SDK and `tsx`, which runs a TypeScript file directly. One\ninstall serves every example in this repo.',
              'That installs the SDK. There is no build step and no TypeScript toolchain —\nevery file here is plain ESM JavaScript that `node` runs directly.',
            )
            .replace(
              'Runnable examples for the [zeroruntime](https://zeroruntime.ai) TypeScript SDK.',
              'Runnable examples for the [zeroruntime](https://zeroruntime.ai) SDK, in plain\nJavaScript.\n\nEvery file here is generated from its TypeScript counterpart in\n`zeroruntime-js-examples` — edit that repo, not this one.',
            );
        }
        out.set(rel, text);
      }
    }
  };
  walk(TS_ROOT);
  return out;
}

function gitignore(): string {
  return 'node_modules/\n\n.env\n.env.*\n\n.idea/\n.vscode/\n.DS_Store\n\npackage-lock.json\n';
}

function main(argv: string[]): number {
  const check = argv.includes('--check');
  const sources = ts_sources();

  const tree = new Map<string, string>([
    ...transpile(sources),
    ...docs(),
    ['package.json', manifest()],
    ['.gitignore', gitignore()],
  ]);

  const changes: string[] = [];
  for (const [rel, body] of tree) {
    const full = join(JS_ROOT, rel);
    if (!existsSync(full)) changes.push(`${rel}: would be created`);
    else if (readFileSync(full, 'utf-8') !== body) changes.push(`${rel}: would change`);
  }

  if (check) {
    for (const change of changes) process.stderr.write(`  ${change}\n`);
    process.stderr.write(
      changes.length === 0
        ? `gen:js  up to date  (${tree.size} files)\n`
        : `gen:js  DRIFT  ${changes.length} file(s)\n`,
    );
    return changes.length === 0 ? 0 : 1;
  }

  for (const [rel, body] of tree) {
    const full = join(JS_ROOT, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, 'utf-8');
  }
  process.stderr.write(
    `gen:js  wrote ${tree.size} files to ${relative(TS_ROOT, JS_ROOT)}  ` +
      `(${sources.length} examples)\n`,
  );
  return 0;
}

process.exitCode = main(process.argv.slice(2));
