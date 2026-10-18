import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useIndex, useSel, passRate, hasFull, type Task } from '../lib/data';
import { useT } from '../lib/i18n';
import { Stat, Loading } from '../components/bits';
import { usePaged, Pager, Capped, Bars } from '../components/Paged';
import { FormatCounts } from './Overview';

const FORMAT_LABEL = { atif: '完整轨迹', messages: '对话格式（已转换）', stub: '只有概要', empty: '空文件', invalid: '无法解析', unknown: '未知' } as const;
const byTask = (items: string[]) => { const m = new Map<string, number>(); for (const s of items) { const k = s.split('/')[0]; m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };

/** One finding: a count, the tasks that contribute most, and a capped raw list with a download. */
function Finding({ title, items, note }: { title: string; items: string[]; note: string }) {
  const t = useT();
  const top = byTask(items);
  return (
    <div className="panel">
      <h2>{t(title)} <span className="tag bad">{items.length}</span></h2>
      <p className="muted" style={{ marginTop: 0 }}>{t(note)}</p>
      {top.length > 1 && <><div className="lbl faint" style={{ fontSize: 11, marginBottom: 4 }}>{t('按任务计数（前 8）')}</div><Bars rows={top.slice(0, 8)} /></>}
      <details style={{ marginTop: 8 }}><summary className="more">{t('明细')}</summary><Capped items={items} cap={15} name={title} /></details>
    </div>
  );
}

export default function Quality() {
  const t = useT();
  const { data: idx, error } = useIndex();
  const sel = useSel();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'issues' | 'name' | 'jobs' | 'full' | 'reward'>('issues');
  const rows = useMemo(() => {
    if (!idx) return [];
    const Q = idx.quality;
    const issues = (T: Task) => T.jobs.filter((j) => !hasFull(j) || j.reward == null || j.agentConflict || j.exception).length + (Q.zeroSignalTasks.includes(T.id) ? 1 : 0);
    return idx.tasks.filter((T) => (T.id + (T.vendor ?? '')).toLowerCase().includes(q.toLowerCase()))
      .map((T) => ({ T, issues: issues(T), full: T.jobs.filter(hasFull).length / Math.max(1, T.jobs.length), mean: passRate(T.jobs) }))
      .sort((a, b) => sort === 'name' ? a.T.id.localeCompare(b.T.id) : sort === 'jobs' ? b.T.jobs.length - a.T.jobs.length : sort === 'full' ? a.full - b.full : sort === 'reward' ? (b.mean ?? -1) - (a.mean ?? -1) : b.issues - a.issues);
  }, [idx, q, sort]);
  const p = usePaged(rows, 50);
  if (!idx) return <Loading error={error} />;
  const { quality: Q } = idx;
  const F: [string, string[], string][] = [
    ['无法解析的轨迹', Q.invalid, '轨迹文件不是合法 JSON。'],
    ['agent 字段冲突', Q.agentConflicts, 'config.json 里写的 agent 与轨迹文件实际记录的 agent 不一致。以轨迹为准。'],
    ['无 reward 的运行', Q.rewardMissing, '没有判分结果。'],
    ['零区分度任务', Q.zeroSignalTasks, '所有有判分的运行得分相同。'],
    ['运行时异常', Q.exceptions, 'result.json 里有 exception_info。'],
    ['缺少任务定义', Q.tasksWithoutDefinition, '只有运行记录，没有任务目录（Harbor 原生布局下用 --tasks 指定）。'],
  ];
  const found = F.filter(([, items]) => items.length), clean = F.filter(([, items]) => !items.length);
  return (
    <>
      <h1 style={{ marginBottom: 4 }}>{t('完整度')}</h1>
      <p className="muted" style={{ marginTop: 0 }}>{t('导入时发现的问题。')}</p>
      <div className="stats">
        {(Object.keys(FORMAT_LABEL) as (keyof typeof FORMAT_LABEL)[]).filter((f) => Q.formats[f]).map((f) => <Stat key={f} v={Q.formats[f]} l={t(FORMAT_LABEL[f])} />)}
        <Stat v={Q.rewardMissing.length} l={t('无 reward 的运行')} /><Stat v={Q.agentConflicts.length} l={t('agent 字段冲突')} /><Stat v={Q.exceptions.length} l={t('运行时异常')} /><Stat v={Q.zeroSignalTasks.length} l={t('零区分度任务')} />
      </div>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="row wrap" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>{t('逐任务')}</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('搜索…')} style={{ width: 180 }} />
          <span className="faint">{t('排序')}</span>{(['issues', 'full', 'reward', 'jobs', 'name'] as const).map((s) => <a key={s} className={`btn ghost ${sort === s ? 'on' : ''}`} onClick={() => setSort(s)}>{t({ issues: '问题数', full: '完整比例', reward: 'reward', jobs: '运行数', name: '名称' }[s])}</a>)}
          <span className="grow" /><Pager p={p} />
        </div>
        <table>
          <thead><tr><th>{t('任务')}</th><th>{t('来源')}</th><th className="num">{t('运行')}</th><th>{t('轨迹文件')}</th><th className="num">{t('平均 reward')}</th><th className="num">{t('问题数')}</th></tr></thead>
          <tbody>{p.slice.map(({ T, issues }) => (
            <tr key={T.id}>
              <td><Link to={sel.href('/explore/task', { t: T.id, j: T.jobs[0]?.id })}>{T.id}</Link></td>
              <td className="muted">{T.vendor ?? '–'}</td>
              <td className="num">{T.jobs.length}</td>
              <td><FormatCounts jobs={T.jobs} /></td>
              <td className="num">{passRate(T.jobs) == null ? <span className="faint">–</span> : passRate(T.jobs)!.toFixed(2)}</td>
              <td className={`num ${issues ? 'diff-hard' : ''}`}>{issues || '–'}</td>
            </tr>))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>{found.map(([title, items, note]) => <Finding key={title} title={title} items={items} note={note} />)}</div>
      {clean.length > 0 && <p className="faint" style={{ marginTop: 12 }}>{t('未发现')}：{clean.map(([title]) => t(title)).join(' · ')}</p>}
    </>
  );
}
