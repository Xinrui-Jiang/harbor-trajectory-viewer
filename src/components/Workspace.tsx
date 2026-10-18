import { useEffect, useMemo, useState } from 'react';
import { diffLines } from 'diff';
import { packRel, useText, useUrl, type Job, type Task, type TaskDetail, type Write } from '../lib/data';
import { useT } from '../lib/i18n';
import { Clamp } from './Step';

type Status = 'A' | 'M' | 'D' | '';
export interface Entry { path: string; status: Status; now: boolean; source?: string; ops: { i: number; w: Write }[]; content: string | null; contentStep: number | null; stale: boolean }
const join = (cwd: string, p: string) => (p.startsWith('/') ? p : (cwd.replace(/\/$/, '') + '/' + p.replace(/^\.\//, ''))).replace(/\/+/g, '/');
const BIN = /\.(png|jpg|jpeg|gif|webp|pdf|xlsx|docx|pptx|zip|gz|bin|sqlite|mp4|mp3|wav|woff2?|ttf)$/i;

/**
 * Container filesystem as the agent saw it at step `upto`: Dockerfile-provided files plus the agent's writes
 * (failed tool calls are listed but not applied). Content is tracked when known: full writes set it, `old → new`
 * edits are applied to it; an edit that cannot be applied marks the entry as stale.
 */
export function buildFs(container: TaskDetail['container'], job: Job, upto: number): Entry[] {
  const wd = container.workdir ?? '/';
  const fs = new Map<string, Entry>(container.files.map((f) => [f.container, { path: f.container, status: '' as Status, now: false, source: f.source, ops: [], content: null, contentStep: null, stale: false }]));
  for (const s of job.steps) {
    if (s.i > upto) break;
    for (const w of s.writes) {
      const p = join(s.cwd ?? wd, w.path);
      const e = fs.get(p) ?? fs.set(p, { path: p, status: 'A', now: false, ops: [], content: null, contentStep: null, stale: false }).get(p)!;
      e.ops.push({ i: s.i, w });
      if (w.failed) continue;
      e.status = w.op === 'delete' ? 'D' : e.source || e.status === 'M' ? 'M' : 'A';
      e.now = s.i === upto;
      if (w.op === 'write' && w.content != null) { e.content = w.content; e.contentStep = s.i; e.stale = false; }
      else if (w.op === 'edit' && w.old != null && w.new != null) { if (e.content != null && e.content.includes(w.old)) { e.content = e.content.replace(w.old, w.new); e.contentStep = s.i; } else e.stale = true; }
      else if (w.op === 'delete') { e.content = null; e.contentStep = null; }
      else e.stale = true;
    }
  }
  return [...fs.values()].sort((a, b) => a.path.localeCompare(b.path));
}
export const resolvePath = (container: TaskDetail['container'], job: Job, step: number, p: string) => join(job.steps.find((s) => s.i === step)?.cwd ?? container.workdir ?? '/', p);

interface Node { name: string; path: string; dirs: Map<string, Node>; files: Entry[]; changed: number }
function toTree(entries: Entry[]): Node {
  const root: Node = { name: '', path: '', dirs: new Map(), files: [], changed: 0 };
  for (const e of entries) {
    const segs = e.path.replace(/^\//, '').split('/');
    let n = root;
    for (const d of segs.slice(0, -1)) { n = n.dirs.get(d) ?? n.dirs.set(d, { name: d, path: `${n.path}/${d}`, dirs: new Map(), files: [], changed: 0 }).get(d)!; if (e.status) n.changed++; }
    n.files.push(e);
  }
  return root;
}

/** Explorer for the reconstructed workspace, with a step scrubber so the tree can be replayed. */
export function Explorer({ container, job, upto, setUpto, selected, onSelect, follow, setFollow }: { container: TaskDetail['container']; job: Job; upto: number; setUpto: (n: number) => void; selected: string | null; onSelect: (p: string | null) => void; follow: boolean; setFollow: (v: boolean) => void }) {
  const t = useT();
  const entries = useMemo(() => buildFs(container, job, upto), [container, job, upto]);
  const tree = useMemo(() => toTree(entries), [entries]);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [auto, setAuto] = useState(true);
  useEffect(() => { if (auto) { const c = new Set<string>(); const walk = (n: Node, depth: number) => { for (const d of n.dirs.values()) { if (!d.changed && depth >= 1) c.add(d.path); walk(d, depth + 1); } }; walk(tree, 0); setClosed(c); } }, [tree, auto]);
  const max = job.steps.at(-1)?.i ?? 1;
  const changed = entries.filter((e) => e.status).length;
  const toggle = (p: string) => { setAuto(false); setClosed((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; }); };
  const render = (n: Node, depth: number): React.ReactNode => (
    <>
      {[...n.dirs.values()].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
        <div key={d.path}>
          <a className="xrow dir" style={{ paddingLeft: 8 + depth * 12 }} onClick={() => toggle(d.path)}><span className="caret">{closed.has(d.path) ? '▸' : '▾'}</span><span className="mono">{d.name}</span>{d.changed > 0 && <span className="cnt">{d.changed}</span>}</a>
          {!closed.has(d.path) && render(d, depth + 1)}
        </div>
      ))}
      {n.files.sort((a, b) => a.path.localeCompare(b.path)).map((e) => (
        <a key={e.path} className={`xrow file ${selected === e.path ? 'on' : ''} ${e.status ? 'changed' : ''} ${e.now ? 'now' : ''} ${e.status === 'D' ? 'deleted' : ''}`} style={{ paddingLeft: 20 + depth * 12 }} onClick={() => onSelect(selected === e.path ? null : e.path)} title={e.path}>
          <span className="mono">{e.path.split('/').pop()}</span><span className={`badge ${e.status}`}>{e.status}</span>
        </a>
      ))}
    </>
  );
  return (
    <div className="explorer-inner">
      <div className="xhead"><b>{t('工作区')}</b><span className="faint">{t('{n} 个文件有变化', { n: changed })}</span></div>
      <div className="row" style={{ gap: 6, margin: '6px 0' }}>
        <a className="btn ghost" onClick={() => setUpto(Math.max(1, upto - 1))}>◀</a>
        <input type="range" min={1} max={max} value={upto} onChange={(e) => setUpto(Number(e.target.value))} style={{ flex: 1 }} title={t('拖动回放任意步骤时的文件状态')} />
        <a className="btn ghost" onClick={() => setUpto(Math.min(max, upto + 1))}>▶</a>
      </div>
      <div className="faint" style={{ fontSize: 11, marginBottom: 6 }}>
        <label className="row" style={{ gap: 4, display: 'inline-flex' }} title={t('滚动对话时自动把文件树同步到视野中的那一步')}><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> {t('跟随滚动')}</label> · {t('第 {n} 步时的文件树', { n: upto })}<br /><span className="badge A">A</span> {t('新增')} <span className="badge M">M</span> {t('修改')} <span className="badge D">D</span> {t('删除')} · <span title={t('文件树由 Dockerfile 的 COPY 规则和轨迹中的写入推断，不是容器快照')}>{t('推断')}</span>
      </div>
      <div className="xtree">
        {!entries.length ? <p className="faint" style={{ padding: 8 }}>{t('没有可重建的文件：Dockerfile 无 COPY 规则且轨迹中无写入。')}</p> : render(tree, 0)}
      </div>
    </div>
  );
}

/** Editor-like pane: the selected file's last known content at `upto` (with its step), plus its change history. */
export function FilePane({ task, container, job, upto, selected }: { task: Pick<Task, 'dir' | 'id'>; container: TaskDetail['container']; job: Job; upto: number; selected: string | null }) {
  const t = useT();
  const e = useMemo(() => buildFs(container, job, upto).find((x) => x.path === selected), [container, job, upto, selected]);
  const srcRel = e?.source ? packRel(task, `environment/${e.source}`) : null;
  const wantOrig = !!srcRel && e?.content == null && !BIN.test(e!.path) && e?.status !== 'D';
  const orig = useText(wantOrig ? srcRel : null);
  const bin = useUrl(srcRel && BIN.test(e!.path) ? srcRel : null);
  if (!e) return <div className="panel"><p className="faint">{t('在左侧文件树里选一个文件，或点击对话里的文件芯片。')}</p></div>;
  const OP = { write: t('写入'), edit: t('修改'), delete: t('删除') };
  return (
    <div className="panel fpane">
      <div className="mono" style={{ fontWeight: 600, wordBreak: 'break-all' }}>{e.path}</div>
      <div className="row wrap" style={{ gap: 4, margin: '6px 0' }}>
        {e.source && <span className="tag gray">{t('初始文件')} ← environment/{e.source}</span>}
        {e.ops.map((o, k) => <span key={k} className={`fchip ${o.w.op} ${o.w.failed ? 'failed' : ''}`} title={o.w.failed ? t('该调用失败，未计入') : undefined}>#{o.i} {OP[o.w.op]}</span>)}
      </div>
      {e.ops.filter((o) => o.w.old != null && o.w.new != null).map((o, k) => <div key={k}><div className="faint">#{o.i} {t('替换')}</div><pre className="diff">{diffLines(o.w.old!, o.w.new!).map((p, j) => <span key={j} className={p.added ? 'add' : p.removed ? 'del' : ''}>{p.value}</span>)}</pre></div>)}
      {e.content != null ? <><div className="faint">{t('第 {i} 步后的内容（截至第 {n} 步）', { i: e.contentStep ?? '?', n: upto })}{e.stale && <span className="tag mid" style={{ marginLeft: 6 }}>{t('有后续修改未能应用')}</span>}</div><Clamp className="cmd" text={e.content} n={4000} /></>
        : e.status === 'D' ? <p className="faint">{t('已删除')}</p>
        : orig.data != null ? <><div className="faint">{t('初始内容（agent 开始前）')}{e.stale && <span className="tag mid" style={{ marginLeft: 6 }}>{t('有后续修改未能应用')}</span>}</div><Clamp className="cmd" text={orig.data} n={4000} /></>
        : orig.error ? <p className="tag bad">{orig.error}</p>
        : bin.data ? <a className="btn" href={bin.data} target="_blank">{t('打开二进制文件')}</a>
        : e.ops.length ? <p className="faint">{t('只有 shell 修改记录，没有内容快照。')}</p> : <p className="faint">{t('加载中…')}</p>}
    </div>
  );
}
