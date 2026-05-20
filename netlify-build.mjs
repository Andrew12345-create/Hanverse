import { execSync } from 'child_process';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';

const ROOT    = process.cwd();
const FNS_DIR = resolve(ROOT, 'functions');

function run(cmd) {
  let out;
  try { out = execSync(cmd, { encoding: 'utf8', timeout: 120_000 }); }
  catch (e) {
    const m = e?.stdout || e?.stderr || String(e);
    console.warn(`  [warn] ${cmd.split(' ')[0]} returned non-zero (continuing)`);
    console.warn(m.trimStart().trimEnd().slice(-500));
    return;
  }
  console.log(out.trimStart().trimEnd());
}

console.log('\n▸ Installing functions directory dependencies …');
try { mkdirSync(FNS_DIR, { recursive: true }); } catch {}

run(`npm install --prefix "${FNS_DIR}" --package-lock=false --ignore-scripts --no-audit=false 2>&1`);

console.log('\n✅ Functions setup ready.\n');
