/**
 * Compile les sources JSON (src/packs/<pack>) en compendiums LevelDB (packs/<pack>).
 *   node tools/packs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const SOURCES = "src/packs";
const SORTIE = "packs";
fs.rmSync(SORTIE, { recursive: true, force: true });
for (const pack of fs.readdirSync(SOURCES)) {
  await compilePack(path.join(SOURCES, pack), path.join(SORTIE, pack), { log: false });
  console.log(`compilé : ${pack}`);
}
