#!/usr/bin/env node
// generate.mjs — CLI. The only file in marker/ that touches the filesystem.
//
//   node marker/generate.mjs -o <outdir> [--variant letter|a4|all] [--pgm <dpi>]
//
// Writes marker-sheet-<variant>.svg and marker-manifest-<variant>.json for each
// variant. With --pgm it also rasterises each sheet with raster.js and writes a
// binary PGM, so a human can eyeball exactly what the detector is fed. PGM is a
// 15-byte header plus raw bytes — deliberately not an image codec.
//
// generateSheets() below is pure and runs unchanged in a browser.

import { buildSheet, manifestJson, VARIANT_NAMES } from './src/sheet.js';
import { rasterizeSheet, toPGM } from './src/raster.js';

/**
 * Pure pipeline: variant names -> output files.
 *
 * @param {string[]} [variants] defaults to every variant
 * @param {object}   [opts]
 * @param {number}   [opts.pgmDpi] if set, also produce a PGM per variant
 * @returns {{sheets:object, files:object}} files values are strings or Uint8Array
 */
export function generateSheets(variants = VARIANT_NAMES, opts = {}) {
  const sheets = {};
  const files = {};
  for (const name of variants) {
    const sheet = buildSheet(name);
    sheets[name] = sheet;
    files[`marker-sheet-${name}.svg`] = sheet.svg;
    files[`marker-manifest-${name}.json`] = manifestJson(sheet);
    if (opts.pgmDpi) {
      const raster = rasterizeSheet(sheet, { dpi: opts.pgmDpi });
      files[`marker-sheet-${name}-${Math.round(opts.pgmDpi)}dpi.pgm`] = toPGM(raster);
    }
  }
  return { sheets, files };
}

const USAGE = 'usage: node marker/generate.mjs -o <outdir> [--variant letter|a4|all] [--pgm <dpi>]';

function parseArgs(argv) {
  const args = { out: null, variant: 'all', pgmDpi: 0, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '-o' || a === '--out') { args.out = argv[i + 1]; i += 1; } else if (a === '--variant') { args.variant = argv[i + 1]; i += 1; } else if (a === '--pgm') { args.pgmDpi = Number(argv[i + 1]); i += 1; } else if (a === '-h' || a === '--help') { args.help = true; } else throw new Error(`unexpected argument "${a}"`);
  }
  return args;
}

async function main() {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { resolve: resolvePath, join } = await import('node:path');
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.out) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(args.help ? 0 : 2);
  }
  const variants = args.variant === 'all' ? VARIANT_NAMES : [args.variant];
  for (const v of variants) {
    if (!VARIANT_NAMES.includes(v)) throw new Error(`unknown variant "${v}" (have ${VARIANT_NAMES.join(', ')})`);
  }
  if (args.pgmDpi && !(args.pgmDpi > 0)) throw new Error('--pgm needs a positive dpi');

  const outDir = resolvePath(args.out);
  const { files } = generateSheets(variants, { pgmDpi: args.pgmDpi });
  await mkdir(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(outDir, name), content);
  }
  process.stdout.write(`${variants.join(', ')} -> ${outDir}\n`);
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
