import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useIndex, useSel, passRate, scored, hasFull, fmtNum, fmtCost, rewardRange, FAMILY_LABEL, type Task, type JobSummary } from '../lib/data';
import { useT } from '../lib/i18n';
import { Stat, RewardDots, Loading } from '../components/bits';
import { usePaged, Pager } from '../components/Paged';

/** Reward summary that respects the task's own scoring shape: pass count for binary tasks, mean for graded ones. */
function Score({ T }: { T: Task }) {
  const t = useT();
  const s = scored(T.jobs);
  if (!s.length) return <span className="faint">{t('无判分')}</span>;
  const r = passRate(T.jobs)!;
  return <span className={`tag ${r >= 0.67 ? 'ok' : r > 0 ? 'mid' : 'bad'}`}>{T.verifier.rewardShape === 'binary' ? `${t('通过')} ${s.filter((j) => j.reward === 1).length}/${s.length}` : `${t('均值')} ${r.toFixed(2)}`}</span>;
}
/** How many of a task's runs have a real trajectory file (full), a summary stub, or nothing. */
export const FormatCounts = ({ jobs }: { jobs: JobSummary[] }) => {
  const t = useT();
  const n = (f: string) => jobs.filter((j) => (f === 'full' ? hasFull(j) : f === 'empty' ? j.format === 'empty' || j.format === 'invalid' : j.format === f)).length;
  const tip = t('每次运行的轨迹文件：完整 = 逐步轨迹；概要 = 只有几步概要；空 = 没有轨迹只有分数');
  if (n('full') === jobs.length) return <span className="fcounts" title={tip}><i className="f-atif" />{t('轨迹完整')}</span>;
  return <span className="fcounts" title={tip}>{t('轨迹')} <i className="f-atif" />{t('完整')} {n('full')} <i className="f-stub" />{t('概要')} {n('stub')} <i className="f-empty" />{t('空')} {n('empty')}</span>;
};
const RewardBar = ({ jobs }: { jobs: JobSummary[] }) => {
  const n = jobs.length || 1, c = (f: (j: JobSummary) => boolean) => (100 * jobs.filter(f).length) / n;
  return <span className="fbar" style={{ width: 90, height: 6, display: 'inline-flex' }}><i style={{ width: `${c((j) => j.reward === 1)}%`, background: 'var(--ok)' }} /><i style={{ width: `${c((j) => j.reward != null && j.reward > 0 && j.reward < 1)}%`, background: 'var(--mid)' }} /><i style={{ width: `${c((j) => j.reward === 0)}%`, background: 'var(--bad)' }} /></span>;
};

function TaskCard({ T, range }: { T: Task; range: [number, number] }) {
  const t = useT();
  const sel = useSel();
  const fams = Object.entries(T.families).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const arts = T.jobs.reduce((n, j) => n + j.artifacts.length, 0);
  return (
    <Link to={sel.href('/explore/task', { t: T.id, j: T.jobs[0]?.id })} className="card" title={T.description ?? ''}>
      <div className="row wrap" style={{ marginBottom: 6, gap: 5 }}>
        {T.difficulty && <span className={`tag gray diff-${T.difficulty.toLowerCase()}`}>{T.difficulty.toLowerCase()}</span>}
        {fams.map(([f]) => <span key={f} className="tag gray">{t(FAMILY_LABEL[f] ?? f)}</span>)}
        <span className="grow" />
        {T.vendor && <span className="faint" style={{ fontSize: 11 }} title={t('来源：数据包清单中的提供方，或 task.toml 的作者')}>{T.vendor}</span>}
      </div>
      <div className="title">{T.id}</div>
      <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
        <span className="row" style={{ gap: 6 }}><span className="faint" style={{ fontSize: 11 }}>{t('{n} 次运行', { n: T.jobs.length })}</span><RewardDots jobs={T.jobs.slice(0, 40)} range={range} />{T.jobs.length > 40 && <span className="faint" style={{ fontSize: 11 }}>+{T.jobs.length - 40}</span>}</span>
        <Score T={T} />
      </div>
      <div className="foot"><FormatCounts jobs={T.jobs} /><span>{arts ? t('{n} 个产物', { n: arts }) : ''}</span></div>
    </Link>
  );
}

export default function Overview() {
  const t = useT();
  const { data: idx, error } = useIndex();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'jobs' | 'name' | 'reward'>('jobs');
  const filtered = useMemo(() => {
    if (!idx) return [];
    const f = idx.tasks.filter((T) => (T.id + (T.category ?? '') + (T.vendor ?? '') + T.tags.join()).toLowerCase().includes(q.toLowerCase()));
    return f.sort((a, b) => sort === 'name' ? a.id.localeCompare(b.id) : sort === 'reward' ? (passRate(b.jobs) ?? -1) - (passRate(a.jobs) ?? -1) : b.jobs.length - a.jobs.length);
  }, [idx, q, sort]);
  const p = usePaged(filtered, 60);
  const groups = useMemo(() => { const g = new Map<string, Task[]>(); for (const T of p.slice) { const k = T.category ?? '—'; (g.get(k) ?? g.set(k, []).get(k)!).push(T); } return [...g.entries()]; }, [p.slice]);
  if (!idx) return <Loading error={error} />;
  const jobs = idx.tasks.flatMap((T) => T.jobs), full = jobs.filter(hasFull), range = rewardRange(jobs);
  const dist = { pass: jobs.filter((j) => j.reward === 1).length, partial: jobs.filter((j) => j.reward != null && j.reward > 0 && j.reward < 1).length, fail: jobs.filter((j) => j.reward === 0).length, none: jobs.filter((j) => j.reward == null).length };
  const taskMeans = idx.tasks.map((T) => passRate(T.jobs)).filter((x): x is number => x != null);
  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <h1>{idx.dataset}</h1>
        <span className="muted">{t('{a} 个任务 · {b} 次运行 · 生成于 {c}', { a: idx.tasks.length, b: jobs.length, c: idx.generatedAt.slice(0, 16).replace('T', ' ') })}</span>
      </div>
      <div className="stats">
        <Stat v={idx.tasks.length} l={t('任务')} />
        <Stat v={jobs.length} l={t('运行')} />
        <Stat v={<>{full.length}<span className="faint" style={{ fontSize: 13 }}> / {jobs.length}</span></>} l={t('有完整轨迹的运行')} />
        <div className="stat">
          <div className="fbar" style={{ height: 8, margin: '6px 0' }}><i style={{ width: `${(100 * dist.pass) / (jobs.length || 1)}%`, background: 'var(--ok)' }} /><i style={{ width: `${(100 * dist.partial) / (jobs.length || 1)}%`, background: 'var(--mid)' }} /><i style={{ width: `${(100 * dist.fail) / (jobs.length || 1)}%`, background: 'var(--bad)' }} /></div>
          <div className="l">{t('reward：满分 {a} · 部分 {b} · 零分 {c} · 无判分 {d}', { a: dist.pass, b: dist.partial, c: dist.fail, d: dist.none })}</div>
        </div>
        <Stat v={taskMeans.length ? (taskMeans.reduce((a, b) => a + b, 0) / taskMeans.length).toFixed(2) : '–'} l={t('平均 reward，先按任务平均（{n} 个有判分任务）', { n: taskMeans.length })} title={t('二值任务和分数任务一起平均，只作粗略参考')} />
        <Stat v={fmtNum(full.reduce((n, j) => n + (j.tokens.prompt ?? 0), 0))} l={t('输入 token（仅完整轨迹）')} />
        <Stat v={fmtCost(full.reduce((n, j) => n + (j.costUsd ?? 0), 0))} l={t('花费（仅有记录的运行）')} />
      </div>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('筛选任务…')} style={{ width: 240 }} />
        <span className="faint">{t('排序')}</span>{(['jobs', 'reward', 'name'] as const).map((s) => <a key={s} className={`btn ghost ${sort === s ? 'on' : ''}`} onClick={() => setSort(s)}>{t({ jobs: '运行数', reward: 'reward', name: '名称' }[s])}</a>)}
        <Pager p={p} />
        <span className="grow" />
        <span className="legend">
          <span>{t('每个方块一次运行：')}</span><span><i style={{ background: 'var(--ok)' }} />{t('最高')}</span><span><i style={{ background: 'var(--mid)' }} />{t('中间')}</span><span><i style={{ background: 'var(--bad)' }} />{t('最低')}</span><span><i style={{ boxShadow: 'inset 0 0 0 1.5px var(--none)' }} />{t('无判分')}</span>
        </span>
      </div>
      {groups.map(([cat, ts]) => (
        <section key={cat} style={{ marginBottom: 22 }}>
          <div className="row" style={{ marginBottom: 8 }}><h2 style={{ margin: 0 }}>{cat === '—' ? t('未分类') : cat}</h2><span className="faint">{t('{a} 个任务 · {b} 次运行', { a: ts.length, b: ts.reduce((n, T) => n + T.jobs.length, 0) })}</span><RewardBar jobs={ts.flatMap((T) => T.jobs)} /></div>
          <div className="grid">{ts.map((T) => <TaskCard key={T.id} T={T} range={range} />)}</div>
        </section>
      ))}
      {!idx.tasks.length && <p className="muted">{t('没有任务。')}</p>}
    </>
  );
}
