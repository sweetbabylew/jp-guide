#!/usr/bin/env node
// render.mjs — CLI. The only file in the renderer that touches the filesystem.
//
//   node render.mjs <spec.json> -o <outdir>
//
// Writes sheet.svg, seat-pattern.svg and angles.json into <outdir>.

import { validate } from './src/schema.js';
import { resolve as resolveGeometry } from './src/geometry.js';
import { buildSheet, buildAngles } from './src/package.js';
import { buildSeatPattern } from './src/seatPattern.js';

/**
 * Pure pipeline: spec object -> the three output strings. Usable in a browser.
 *
 * `provenance` is optional (RENDERER.md, artifact provenance): with one, the
 * artifacts say how much of the drawing came from the user's chair; without
 * one, every byte is unchanged.
 */
export function renderPackage(specInput, { specName = 'spec.json', provenance = null } = {}) {
  const { spec, warnings } = validate(specInput);
  const model = resolveGeometry(spec);
  return {
    warnings,
    model,
    files: {
      'sheet.svg': buildSheet(model, { specName, provenance }),
      'seat-pattern.svg': buildSeatPattern(model, { specName, provenance }),
      'angles.json': `${JSON.stringify(buildAngles(model, specName, { provenance }), null, 2)}\n`,
    },
  };
}

function parseArgs(argv) {
  const args = { spec: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-o' || a === '--out') {
      args.out = argv[i + 1];
      i += 1;
    } else if (a === '-h' || a === '--help') {
      args.help = true;
    } else if (!args.spec) {
      args.spec = a;
    } else {
      throw new Error(`unexpected argument "${a}"`);
    }
  }
  return args;
}

const USAGE = 'usage: node render.mjs <spec.json> -o <outdir>';

async function main() {
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  const { basename, resolve: resolvePath, join } = await import('node:path');
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.spec || !args.out) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(args.help ? 0 : 2);
  }
  const specPath = resolvePath(args.spec);
  const outDir = resolvePath(args.out);
  const raw = await readFile(specPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${specPath}: not valid JSON — ${err.message}`);
  }

  const { warnings, files } = renderPackage(parsed, { specName: basename(specPath) });
  await mkdir(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(outDir, name), content, 'utf8');
  }

  for (const w of warnings) process.stderr.write(`warning: ${w}\n`);
  process.stdout.write(`${basename(specPath)} -> ${outDir}\n`);
  for (const name of Object.keys(files)) process.stdout.write(`  ${name}\n`);
}

const isNode = typeof process !== 'undefined' && !!process.versions?.node;

if (isNode && process.argv[1]) {
  const { pathToFileURL } = await import('node:url');
  if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((err) => {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(1);
    });
  }
}
