import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SubNav } from '../components/SubNav';
import Overview from './Overview';
import Quality from './Quality';
import { useIndex, useSel, scored, passRate, hasFull, fmtCost, rewardRange, VERIFIER_LABEL, VERIFIER_DESC, type JobSummary, type Task, fmtDur } from '../lib/data';
import { useAnnotations, isAnnotated } from '../lib/annotations';
import { useT } from '../lib/i18n';
import { usePaged, Pager } from '../components/Paged';
import { Loading } from '../components/bits';

const std = (xs: number[]) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Reward spread per task + cost-vs-reward scatter, with axes derived from the data. */
function Signal() {
  const t = useT();
  const { data: idx, error } = useIndex();
  const sel = useSel();
  const [q, setQ] = useState('');
  const sp = usePaged(useMemo(() => (idx?.tasks ?? []).filter((T) => T.id.toLowerCase().includes(q.toLowerCase())), [idx, q]), 50);
  if (!idx) return <Loading error={error} />;
  const all = idx.tasks.flatMap((T) => T.jobs), range = rewardRange(all);
  const pts = idx.tasks.flatMap((T) => T.jobs.filter((j) => j.reward != null && j.costUsd != null && j.costUsd > 0).map((j) => ({ t: T.id, j })));
  const costs = pts.map((p) => Math.log10(p.j.costUsd!)), cmin = Math.floor(Math.min(0, ...costs)), cmax = Math.ceil(Math.max(0, ...costs) + 0.01);
  const W = 640, H = 240, L = 44, B = 28;
  const lx = (c: number) => L + ((Math.log10(c) - cmin) / Math.max(1, cmax - cmin)) * (W - L - 10), ly = (r: number) => 10 + (1 - (r - range[0]) / Math.max(1e-9, range[1] - range[0])) * (H - B - 10);
  const sig = (jobs: JobSummary[]) => { const r = scored(jobs).map((j) => j.reward!); return r.length < 2 ? null : std(r); };
  const ticks = Array.from({ length: cmax - cmin + 1 }, (_, i) => 10 ** (cmin + i));
  return (
    <>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="row wrap"><h2 style={{ margin: 0 }}>{t('每个任务的 reward 分布与区分度')}</h2><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('搜索…')} style={{ width: 180 }} /><span className="grow" /><Pager p={sp} /></div>
        <p className="muted">{t('区分度是 reward 的标准差。为 0 的任务无法区分运行。')}</p>
        <table>
          <thead><tr><th>{t('任务')}</th><th className="num">{t('有判分')}</th><th className="num">{t('均值')}</th><th className="num">{t('标准差')}</th><th>{t('区间')}</th><th style={{ minWidth: 220 }}>{t('分布')}</th><th>{t('判断')}</th></tr></thead>
          <tbody>{sp.slice.map((T) => { const r = scored(T.jobs).map((j) => j.reward!); const s = sig(T.jobs); return (
            <tr key={T.id}>
              <td><Link to={sel.href('/explore/task', { t: T.id, j: T.jobs[0]?.id })}>{T.id}</Link></td>
              <td className="num">{r.length}</td>
              <td className="num">{r.length ? (r.reduce((a, b) => a + b, 0) / r.length).toFixed(2) : '–'}</td>
              <td className="num">{s == null ? '–' : s.toFixed(2)}</td>
              <td className="mono muted">{r.length ? `${Math.min(...r).toFixed(2)} – ${Math.max(...r).toFixed(2)}` : '–'}</td>
              <td><div className="dist">{r.map((v, i) => <i key={i} style={{ left: `${(100 * (v - range[0])) / Math.max(1e-9, range[1] - range[0])}%`, background: v >= range[1] ? 'var(--ok)' : v <= range[0] ? 'var(--bad)' : 'var(--mid)' }} />)}</div></td>
              <td>{!r.length ? <span className="tag gray">{t('无判分')}</span> : r.length < 2 ? <span className="tag gray">{t('单次运行')}</span> : s === 0 ? <span className="tag bad">{t('无区分度')}</span> : s! < 0.2 ? <span className="tag mid">{t('弱')}</span> : <span className="tag ok">{t('有信号')}</span>}</td>
            </tr>); })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>{t('成本 vs reward')} <span className="faint" style={{ fontWeight: 400 }}>{t('每点一次运行，横轴对数刻度，颜色为任务')}</span></h2>
        {pts.length ? <svg width={W} height={H} className="scatter">
          {ticks.map((c) => <g key={c}><line x1={lx(c)} x2={lx(c)} y1={10} y2={H - B} /><text x={lx(c)} y={H - 10} textAnchor="middle">{fmtCost(c)}</text></g>)}
          {[range[0], (range[0] + range[1]) / 2, range[1]].map((r) => <g key={r}><line x1={L} x2={W - 10} y1={ly(r)} y2={ly(r)} /><text x={L - 6} y={ly(r) + 4} textAnchor="end">{Number.isInteger(r) ? r : r.toFixed(1)}</text></g>)}
          {pts.map(({ t: T, j }) => <circle key={T + j.id} cx={lx(j.costUsd!)} cy={ly(j.reward!)} r={5} fill={`hsl(${hue(T)} 60% 50%)`} opacity={0.8}><title>{T}{'\n'}{j.agent} × {j.model}{'\n'}reward {j.reward} · {fmtCost(j.costUsd)}</title></circle>)}
        </svg> : <p className="faint">{t('没有运行带有成本数据。')}</p>}
        <p className="muted" style={{ marginBottom: 0 }}>{t('{n} 次运行有成本数据。', { n: pts.length })}</p>
      </div>
    </>
  );
}

/** How each task's reward is produced; the mechanism is inferred from the files in tests/ and environment/. */
function VerifierView() {
  const t = useT();
  const { data: idx, error } = useIndex();
  const sel = useSel();
  const vp = usePaged(idx?.tasks ?? [], 50);
  if (!idx) return <Loading error={error} />;
  const shape = (T: Task) => T.verifier.rewardShape === 'none' ? t('无') : T.verifier.rewardShape === 'binary' ? t('0/1 二值') : `${t('分数')} ${T.verifier.rewardRange!.map((x) => x.toFixed(2)).join(' – ')}`;
  return (
    <div className="panel">
      <div className="row"><h2 style={{ margin: 0 }}>{t('判卷方式')}</h2><span className="grow" /><Pager p={vp} /></div>
      <p className="muted">{t('reward 由任务的 tests/ 在 agent 结束后产生。下表的机制由文件名推断，可能不全；点任务可看原始判卷脚本。')}</p>
      <table>
        <thead><tr><th>{t('任务')}</th><th>{t('分数形态')}</th><th>{t('判卷机制')}</th><th>{t('LLM 参与')}</th><th className="num">{t('判卷时限')}</th><th>{t('命名分数')}</th></tr></thead>
        <tbody>{vp.slice.map((T) => { const v = T.verifier; const extra = v.namedRewards.filter((k) => k !== 'reward'); return (
          <tr key={T.id}>
            <td><Link to={sel.href('/explore/task', { t: T.id, j: T.jobs[0]?.id })}>{T.id}</Link></td>
            <td><span className={`tag ${v.rewardShape === 'none' ? 'gray' : ''}`}>{shape(T)}</span></td>
            <td>{v.kinds.length ? v.kinds.map((k) => <span key={k} className="tag gray" style={{ marginRight: 4 }} title={t(VERIFIER_DESC[k] ?? '')}>{t(VERIFIER_LABEL[k] ?? k)}</span>) : <span className="faint">{t('未识别')}</span>}</td>
            <td>{v.llmJudge === true ? <span className="tag mid">{t('是')}</span> : v.llmJudge === false ? <span className="faint">{t('否')}</span> : <span className="faint">{t('未知')}</span>}</td>
            <td className="num">{v.timeoutSec ? fmtDur(v.timeoutSec) : '–'}</td>
            <td className="mono muted">{extra.join(', ') || '–'}</td>
          </tr>); })}
        </tbody>
      </table>
      <h2 style={{ marginTop: 16 }}>{t('术语说明')}</h2>
      <table style={{ maxWidth: 900 }}><tbody>
        {Object.entries(VERIFIER_DESC).map(([k, d]) => <tr key={k}><td style={{ whiteSpace: 'nowrap' }}><span className="tag gray">{t(VERIFIER_LABEL[k])}</span></td><td className="muted">{t(d)}</td></tr>)}
        <tr><td style={{ whiteSpace: 'nowrap' }}><span className="tag gray">{t('判卷时限')}</span></td><td className="muted">{t('task.toml 的 verifier.timeout_sec：判卷脚本允许运行的最长时间')}</td></tr>
        <tr><td style={{ whiteSpace: 'nowrap' }}><span className="tag gray">{t('agent 运行时限')}</span></td><td className="muted">{t('task.toml 的 agent.timeout_sec：Harbor 允许 agent 运行的最长时间，超过即终止本次运行')}</td></tr>
      </tbody></table>
    </div>
  );
}

/** Per-source roll-up: data quality on the left, human verdicts on the right. */
function BySource() {
  const t = useT();
  const { data: idx, error } = useIndex();
  const A = useAnnotations();
  const sel = useSel();
  if (!idx || !A.data) return <Loading error={error} />;
  const groups = new Map<string, Task[]>();
  for (const T of idx.tasks) { const k = T.vendor ?? t('未知来源'); (groups.get(k) ?? groups.set(k, []).get(k)!).push(T); }
  const rows = [...groups.entries()].map(([src, tasks]) => {
    const jobs = tasks.flatMap((T) => T.jobs);
    const annos = tasks.flatMap((T) => T.jobs.map((j) => A.data!.jobs[`${T.id}__${j.id}`])).filter(isAnnotated);
    const means = tasks.map((T) => passRate(T.jobs)).filter((x): x is number => x != null);
    return { src, tasks, jobs, full: jobs.filter(hasFull).length, missing: jobs.filter((j) => j.reward == null).length, conflicts: jobs.filter((j) => j.agentConflict).length,
      zero: tasks.filter((T) => idx.quality.zeroSignalTasks.includes(T.id)).length, mean: means.length ? means.reduce((a, b) => a + b, 0) / means.length : null,
      annos, correct: annos.filter((a) => a.verdict === 'correct').length, incorrect: annos.filter((a) => a.verdict === 'incorrect').length, suspect: annos.filter((a) => a.rewardTrust && a.rewardTrust !== 'agree').length, issues: annos.filter((a) => !!a.axes?.taskIssue).length };
  }).sort((a, b) => b.jobs.length - a.jobs.length);
  return (
    <div className="panel">
      <h2>{t('按来源')}</h2>
      <p className="muted" style={{ marginTop: 0 }}>{t('每个来源的数据质量与人审结果。')}</p>
      <table>
        <thead><tr><th>{t('来源')}</th><th>{t('任务')}</th><th className="num">{t('运行')}</th><th className="num">{t('完整轨迹')}</th><th className="num">{t('平均 reward')}</th><th className="num">{t('无 reward')}</th><th className="num">{t('agent 冲突')}</th><th className="num">{t('零区分度任务')}</th><th className="num">{t('已标注')}</th><th>{t('人审结论')}</th><th className="num">{t('判卷有问题')}</th><th className="num">{t('任务本身的问题')}</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.src}>
            <td style={{ whiteSpace: 'nowrap' }}><b>{r.src}</b></td>
            <td style={{ maxWidth: 260 }}>{r.tasks.map((T) => <Link key={T.id} to={sel.href('/explore/task', { t: T.id, j: T.jobs[0]?.id })} className="tag gray" style={{ margin: '1px 3px 1px 0' }}>{T.id}</Link>)}</td>
            <td className="num">{r.jobs.length}</td>
            <td className={`num ${r.full < r.jobs.length ? 'diff-medium' : ''}`}>{r.full} / {r.jobs.length}</td>
            <td className="num">{r.mean == null ? '–' : r.mean.toFixed(2)}</td>
            <td className={`num ${r.missing ? 'diff-hard' : ''}`}>{r.missing || '–'}</td>
            <td className={`num ${r.conflicts ? 'diff-medium' : ''}`}>{r.conflicts || '–'}</td>
            <td className={`num ${r.zero ? 'diff-hard' : ''}`}>{r.zero || '–'}</td>
            <td className="num">{r.annos.length} / {r.jobs.length}</td>
            <td>{r.annos.length ? <><span className="tag ok">{t('正确')} {r.correct}</span> <span className="tag bad">{t('错误')} {r.incorrect}</span></> : <span className="faint">–</span>}</td>
            <td className={`num ${r.suspect ? 'diff-hard' : ''}`}>{r.suspect || '–'}</td>
            <td className={`num ${r.issues ? 'diff-hard' : ''}`}>{r.issues || '–'}</td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

export default function Check() {
  const { sub = 'inventory' } = useParams();
  return (
    <>
      <SubNav base="/check" tabs={[['inventory', '清单'], ['completeness', '完整度'], ['signal', '信号'], ['verifier', '判卷'], ['source', '来源']]} />
      {sub === 'inventory' && <Overview />}
      {sub === 'completeness' && <Quality />}
      {sub === 'signal' && <Signal />}
      {sub === 'verifier' && <VerifierView />}
      {sub === 'source' && <BySource />}
    </>
  );
}
