// Vireo City submission entry (Node 22, standard library only).
// This is an original offline open-world crime game set in a neon night city. Players can
// explore on foot or steal and drive vehicles through live traffic and pedestrian crowds,
// escape wanted-level police pursuits, follow mission stories, fight enemies, and use the
// minimap HUD. The static game includes a title menu, radio and combat audio, vehicle and
// player health displays, plus persistent local save data. It is delivered as plain files:
// game/index.html and its ES modules run in desktop Chrome without network resources.
//
// Serve the work locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Use the kit dossier builder rather than inventing submission metadata:
// it applies the make.fun schema and keeps the entry compatible with the judge.
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copying is intentional: the dossier describes exactly what is handed to reviewers,
// so game/ and screenshots/ must exist under the same output root as their metadata.
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// These limits are submission gate values, not style preferences. Changing them could
// make the generated entry look valid while exceeding the judge's actual constraints.
// /output/game/ contains the playable offline files, /output/screenshots/ contains the
// review images, and /output/dossier.json indexes their names and sizes consistently.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
