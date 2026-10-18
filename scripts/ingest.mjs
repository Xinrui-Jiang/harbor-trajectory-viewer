// Offline ingest: run the shared normaliser over a directory and write data/{index.json,tasks/*.json,jobs/*.json}.
// Usage: node scripts/ingest.mjs [root] [--tasks <dir>]     (see src/lib/normalize.js for accepted layouts)
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, rmSync, symlinkSync, lstatSync, unlinkSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { normalize } from '../src/lib/normalize.js';

const argv = process.argv.slice(2);
const ROOT = resolve(argv.find((a) => !a.startsWith('--')) ?? join(import.meta.dirname, '../examples/demo-pack')).replace(/\/$/, '');
const TASKS_DIR = argv.includes('--tasks') ? resolve(argv[argv.indexOf('--tasks') + 1]) : null;
const OUT = join(import.meta.dirname, '../data');

const fs = {
  exists: (p) => existsSync(p),
  isDir: (p) => existsSync(p) && statSync(p).isDirectory(),
  ls: (p) => (existsSync(p) && statSync(p).isDirectory() ? readdirSync(p).filter((n) => !n.startsWith('.')).sort() : []),
  read: (p) => { try { return existsSync(p) && statSync(p).isFile() ? readFileSync(p, 'utf8') : null; } catch { return null; } },
  size: (p) => { try { return statSync(p).size; } catch { return 0; } },
};

const { index, tasks, jobs } = normalize(fs, ROOT, TASKS_DIR);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'jobs'), { recursive: true }); mkdirSync(join(OUT, 'tasks'), { recursive: true });
for (const j of jobs) writeFileSync(join(OUT, 'jobs', `${j.summary.file}.json`), JSON.stringify(j));
for (const t of tasks) writeFileSync(join(OUT, 'tasks', `${t.id}.json`), JSON.stringify(t.detail));
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
// public/pack → the ingested root, public/data → data/: the dev server serves both as static files
const pub = join(import.meta.dirname, '../public');
mkdirSync(pub, { recursive: true });
for (const [name, target] of [['pack', ROOT], ['data', OUT]]) {
  const link = join(pub, name);
  try { lstatSync(link); unlinkSync(link); } catch { /* absent */ }
  symlinkSync(target, link);
}

const pad = (s, n) => String(s ?? '').padEnd(n);
const count = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
console.log(`\n${index.tasks.length} tasks, ${index.quality.jobs} jobs → ${relative(process.cwd(), OUT)}/   (index ${(statSync(join(OUT, 'index.json')).size / 1024).toFixed(0)} KB)\n`);
console.log(pad('task', 30) + pad('jobs', 5) + pad('full/stub/empty', 16) + 'rewards');
for (const t of index.tasks) {
  const f = count(t.jobs, (j) => j.format);
  const rw = t.jobs.map((j) => (j.reward === null ? '·' : j.reward === 1 ? '✓' : j.reward === 0 ? '✗' : j.reward.toFixed(2))).join(' ');
  console.log(pad(t.id, 30) + pad(t.jobs.length, 5) + pad(`${(f.atif ?? 0) + (f.messages ?? 0)} / ${f.stub ?? 0} / ${(f.empty ?? 0) + (f.invalid ?? 0)}`, 16) + (rw.length > 40 ? rw.slice(0, 39) + '…' : rw));
}
console.log('\nquality:', JSON.stringify(index.quality, null, 1));
