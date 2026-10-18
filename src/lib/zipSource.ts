import JSZip from 'jszip';
import { normalize } from './normalize.js';
import type { Index, Job, Source, TaskDetail } from './data';

const TEXT = /\.(json|toml|md|txt|sh|py|go|ts|tsx|js|mjs|yaml|yml|sql|cfg|ini|csv|vtt|html|xml|java|cbl|cpy|mod|sum|lock|env)$|(^|\/)(Dockerfile|Makefile|README)$/i;
const TEXT_LIMIT = 40 * 1024 * 1024;

/**
 * Builds a data source from an uploaded zip with the same layout the ingest script accepts.
 * Text files are pre-read so the normaliser can run synchronously; binaries are served as blob URLs on demand.
 */
export async function loadZip(file: File, progress: (key: string, vars?: Record<string, number>) => void): Promise<Source> {
  progress('读取 zip…');
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((f) => !f.dir && !f.name.includes('__MACOSX/') && !f.name.split('/').pop()!.startsWith('.'));
  if (!entries.length) throw new Error('zip 里没有文件');
  const tops = new Set(entries.map((f) => f.name.split('/')[0]));
  const root = tops.size === 1 && entries.every((f) => f.name.includes('/')) ? [...tops][0] : '';

  const sizes = new Map<string, number>(), texts = new Map<string, string>(), dirs = new Set<string>(), children = new Map<string, Set<string>>();
  const addChild = (dir: string, name: string) => (children.get(dir) ?? children.set(dir, new Set()).get(dir)!).add(name);
  for (const f of entries) {
    sizes.set(f.name, (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0);
    const segs = f.name.split('/');
    for (let i = 1; i < segs.length; i++) { dirs.add(segs.slice(0, i).join('/')); addChild(segs.slice(0, i - 1).join('/'), segs[i - 1]); }
    addChild(segs.slice(0, -1).join('/'), segs.at(-1)!);
  }
  let n = 0, skipped = 0;
  for (const f of entries) {
    if (!TEXT.test(f.name)) continue;
    if ((sizes.get(f.name) ?? 0) >= TEXT_LIMIT) { skipped++; continue; }
    texts.set(f.name, await f.async('string')); if (++n % 50 === 0) progress('已解析 {n} 个文本文件…', { n });
  }
  if (skipped) console.warn(`zip: ${skipped} text files over ${TEXT_LIMIT / 1048576} MB were not parsed`);
  progress('归一化…');
  const fs = {
    exists: (p: string) => dirs.has(p) || sizes.has(p),
    isDir: (p: string) => p === root || p === '' || dirs.has(p),
    ls: (p: string) => [...(children.get(p) ?? [])].sort(),
    read: (p: string) => texts.get(p) ?? null,
    size: (p: string) => sizes.get(p) ?? 0,
  };
  const { index, tasks, jobs } = normalize(fs, root, null) as { index: Index; tasks: { id: string; detail: TaskDetail }[]; jobs: Job[] };
  index.dataset = file.name.replace(/\.zip$/i, '');
  const jobMap = new Map(jobs.map((j) => [j.summary.file, j])), taskMap = new Map(tasks.map((t) => [t.id, t.detail]));
  const urls = new Map<string, Promise<string | null>>();
  const full = (rel: string) => (root ? `${root}/${rel}` : rel).replace(/\/{2,}/g, '/');
  return {
    kind: 'zip', name: file.name,
    index: async () => index,
    task: async (id) => taskMap.get(id) ?? Promise.reject(new Error(`no task ${id}`)),
    job: async (f) => jobMap.get(f) ?? Promise.reject(new Error(`no job ${f}`)),
    text: async (rel) => { const p = full(rel); const t = texts.get(p) ?? (await zip.file(p)?.async('string')); if (t == null) throw new Error(`not in zip: ${p}`); return t; },
    url: (rel) => { const p = full(rel); return urls.get(p) ?? urls.set(p, (async () => { const b = await zip.file(p)?.async('blob'); return b ? URL.createObjectURL(b) : null; })()).get(p)!; },
  };
}
