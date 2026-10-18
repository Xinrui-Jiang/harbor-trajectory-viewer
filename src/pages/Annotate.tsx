import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SubNav, NeedSel } from '../components/SubNav';
import { JobView } from './Job';
import { CompareView } from './Compare';
import { useIndex, useSel, fmtReward, rewardCls, rewardRange, agentLabel, FORMAT_LABEL, hasFull } from '../lib/data';
import { useAnnotations, exportJsonl, isAnnotated, isStepAnnotated, FLAG_LABEL, AUDIT_LABEL, HACK_LABEL, VERIF_LABEL } from '../lib/annotations';
import { useT } from '../lib/i18n';
import { usePaged, Pager, Bars } from '../components/Paged';
import { Loading } from '../components/bits';

const VERDICT = { correct: ['正确', 'ok'], incorrect: ['错误', 'bad'], unclear: ['存疑', 'mid'], '': ['', 'gray'] } as const;

/** Work queue: runs with their annotation status and the automatic signals that help triage; empty runs hidden by default. */
function Queue() {
  const t = useT();
  const { data: idx, error } = useIndex();
  const A = useAnnotations();
  const sel = useSel();
  const nav = useNavigate();
  const [f, setF] = useState({ task: '', reward: '', format: 'full', done: '', sort: 'signals' });
  const rows = useMemo(() => !idx || !A.data ? [] : idx.tasks.flatMap((T) => T.jobs.map((j) => ({ t: T.id, j, key: `${T.id}__${j.id}`, done: isAnnotated(A.data!.jobs[`${T.id}__${j.id}`]) || Object.keys(A.data!.steps[`${T.id}__${j.id}`] ?? {}).length > 0, signals: (j.hasVerify || j.format !== 'atif' ? 0 : 1) + j.nRepeats + Object.values(j.suspicious).reduce((a, b) => a + b, 0) })))
    .filter((r) => (!f.task || r.t.includes(f.task)) && (!f.format || (f.format === 'full' ? hasFull(r.j) : r.j.format === f.format)) && (!f.done || (f.done === 'done') === r.done)
      && (!f.reward || (f.reward === 'pass' ? r.j.reward === 1 : f.reward === 'fail' ? r.j.reward === 0 : f.reward === 'partial' ? r.j.reward != null && r.j.reward > 0 && r.j.reward < 1 : r.j.reward == null)))
    .sort((a, b) => f.sort === 'signals' ? b.signals - a.signals : f.sort === 'reward' ? (a.j.reward ?? -1) - (b.j.reward ?? -1) : a.t.localeCompare(b.t)), [idx, A.data, f]);
  const p = usePaged(rows, 100);
  if (!idx || !A.data) return <Loading error={error} />;
  const range = rewardRange(idx.tasks.flatMap((T) => T.jobs));
  const open = (r: typeof rows[number]) => nav(sel.href('/annotate/run', { t: r.t, j: r.j.id }));
  const next = rows.find((r) => !r.done);
  const done = rows.filter((r) => r.done).length;
  const S = ({ k, opts }: { k: keyof typeof f; opts: [string, string][] }) => <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{opts.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>;
  const axisSummary = (key: string) => { const a = A.data!.jobs[key]; return a ? A.schema.axes.map((ax) => a.axes?.[ax.id]).filter(Boolean).map((x) => t(x!)).join(' · ') : ''; };
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <input value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })} placeholder={t('输入任务名筛选…')} style={{ width: 180 }} />
        <S k="reward" opts={[['', '全部 reward'], ['pass', '= 1'], ['partial', '0 到 1 之间'], ['fail', '= 0'], ['none', '无判分']]} />
        <S k="format" opts={[['full', '有轨迹'], ['', '全部轨迹'], ['stub', '概要'], ['empty', '空']]} />
        <S k="done" opts={[['', '全部状态'], ['todo', '未标注'], ['done', '已标注']]} />
        <S k="sort" opts={[['signals', '按信号排序'], ['reward', '按 reward 排序'], ['task', '按任务排序']]} />
        <span className="muted">{done} / {rows.length} {t('已标注')}</span>
        <div className="progress"><i style={{ width: `${rows.length ? (100 * done) / rows.length : 0}%` }} /></div>
        <Pager p={p} />
        <span className="grow" />
        {next && <a className="btn" onClick={() => open(next)}>{t('下一条未标注')} →</a>}
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>{t('任务')}</th><th>agent × model</th><th className="num">reward</th><th>{t('轨迹')}</th><th className="num">{t('步数')}</th><th>{t('信号')}</th><th className="num">{t('步骤标注')}</th><th>{t('状态')}</th><th>{t('结论')}</th><th>{t('归因')}</th></tr></thead>
          <tbody>{p.slice.map((r) => { const a = A.data!.jobs[r.key]; const [vl, vc] = VERDICT[a?.verdict ?? '']; const ns = Object.keys(A.data!.steps[r.key] ?? {}).length; const j = r.j; return (
            <tr key={r.key} className="clickable" onClick={() => open(r)}>
              <td>{r.t}</td><td>{agentLabel(j)}</td>
              <td className="num"><span className={`dot ${rewardCls(j.reward, range)}`} style={{ display: 'inline-block', marginRight: 6, verticalAlign: -1 }} />{fmtReward(j.reward)}</td>
              <td><span className={`tag ${hasFull(j) ? '' : 'gray'}`}>{t(FORMAT_LABEL[j.format])}</span></td>
              <td className="num">{j.nAgentSteps || '–'}</td>
              <td className="row wrap" style={{ gap: 3 }}>{j.format === 'atif' && !j.hasVerify && <span className="tag bad">{t('未检测到测试运行')}</span>}{j.nRepeats > 0 && <span className="tag mid">{t('重复')} {j.nRepeats}</span>}{Object.keys(j.suspicious).length > 0 && <span className="tag bad">{t('可疑')} {Object.values(j.suspicious).reduce((x, y) => x + y, 0)}</span>}{j.exception && <span className="tag bad">{t('异常')}</span>}</td>
              <td className="num">{ns || '–'}</td>
              <td>{r.done ? <span className="tag ok">{t('已标注')}</span> : <span className="faint">{t('未标注')}</span>}</td>
              <td>{vl && <span className={`tag ${vc}`}>{t(vl)}</span>}</td>
              <td className="muted" style={{ fontSize: 12 }}>{axisSummary(r.key)}</td>
            </tr>); })}
          </tbody>
        </table>
        {!rows.length && <p className="faint">{t('没有符合条件的运行。')}</p>}
      </div>
    </>
  );
}

/** Distributions of every label across annotated runs, plus export. */
function Stats() {
  const t = useT();
  const { data: idx, error } = useIndex();
  const A = useAnnotations();
  const sel = useSel();
  const jobs = useMemo(() => Object.entries(A.data?.jobs ?? {}).filter(([, a]) => isAnnotated(a)), [A.data]);
  const p = usePaged(jobs, 100);
  if (!idx || !A.data) return <Loading error={error} />;
  const stepAnnos = Object.values(A.data.steps).flatMap((s) => Object.values(s)).filter(isStepAnnotated);
  const scored = stepAnnos.map((s) => s.score).filter((x): x is number => x != null);
  const distinct = [...new Set(scored)].sort((a, b) => a - b);
  const scoreRows: [string, number][] = distinct.length <= 10 ? distinct.map((v): [string, number] => [String(v), scored.filter((x) => x === v).length])
    : (() => { const lo = distinct[0], hi = distinct.at(-1)!, bins = 6, w = (hi - lo) / bins; return [...Array(bins)].map((_, b): [string, number] => [`${(lo + b * w).toFixed(2)}–${(lo + (b + 1) * w).toFixed(2)}`, scored.filter((v) => v >= lo + b * w && (b === bins - 1 ? v <= hi : v < lo + (b + 1) * w)).length]).filter(([, n]) => n); })();
  const flags = (Object.keys(FLAG_LABEL) as (keyof typeof FLAG_LABEL)[]).map((k): [string, number] => [t(FLAG_LABEL[k]), stepAnnos.filter((s) => s.flag === k).length]).filter(([, n]) => n);
  const enumRows = <T extends string,>(m: Record<T, string>, pick: (a: (typeof jobs)[number][1]) => string) => (Object.entries(m) as [T, string][]).filter(([v]) => v).map(([v, l]): [string, number] => [t(l), jobs.filter(([, a]) => pick(a) === v).length]).filter(([, n]) => n);
  const Panel = ({ title, rows }: { title: string; rows: [string, number][] }) => <div className="panel"><h2>{title}</h2>{rows.length ? <Bars rows={rows} /> : <p className="faint">{t('尚无数据')}</p>}</div>;
  return (
    <>
      <div className="row" style={{ marginBottom: 14 }}>
        <span className="muted">{t('{a} 条运行标注 · {b} 个步骤标注 · {c} 组偏好', { a: jobs.length, b: stepAnnos.length, c: Object.keys(A.data.prefs).length })}</span>
        {A.saveState === 'error' && <span className="tag bad" title={A.saveError}>{t('保存失败')}</span>}<span className="grow" />
        <a className="btn" onClick={() => exportJsonl(A.data!, idx)}>{t('导出 JSONL')}</a>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 14 }}>
        <Panel title={t('stepwise reward 分布')} rows={scoreRows} />
        <Panel title={t('结论')} rows={enumRows({ correct: '正确', incorrect: '错误', unclear: '存疑' }, (a) => a.verdict)} />
        <Panel title={t('判卷审计')} rows={enumRows(AUDIT_LABEL, (a) => a.rewardTrust)} />
        <Panel title={t('是否钻了判卷的空子')} rows={enumRows(HACK_LABEL, (a) => a.hack)} />
        <Panel title={t('验证质量')} rows={enumRows(VERIF_LABEL, (a) => a.verification)} />
        {A.schema.axes.map((ax) => <Panel key={ax.id} title={t(ax.name)} rows={ax.options.map((v): [string, number] => [t(v), jobs.filter(([, a]) => a.axes?.[ax.id] === v).length]).filter(([, n]) => n)} />)}
        <Panel title={t('步骤旗标')} rows={flags} />
      </div>
      <div className="panel">
        <div className="row"><h2>{t('已标注运行')}</h2><span className="grow" /><Pager p={p} /></div>
        <table>
          <thead><tr><th>{t('运行')}</th><th>reward</th><th>{t('结论')}</th><th>{t('判卷审计')}</th><th className="num" title={t('首个错误 / 无法挽回 / 首次可见')}>{t('失败定位')}</th><th>{t('钻空子')}</th><th>{t('验证')}</th>{A.schema.axes.map((ax) => <th key={ax.id}>{t(ax.name)}</th>)}<th>{t('备注')}</th></tr></thead>
          <tbody>{p.slice.map(([k, a]) => { const [vl, vc] = VERDICT[a.verdict]; return (
            <tr key={k}>
              <td><Link to={sel.href('/annotate/run', { t: a.task, j: a.job })}>{a.task} / {agentLabel(a)}</Link></td>
              <td>{fmtReward(a.reward)}</td>
              <td>{vl && <span className={`tag ${vc}`}>{t(vl)}</span>}</td>
              <td>{a.rewardTrust && <span className={`tag ${a.rewardTrust === 'agree' ? 'ok' : 'bad'}`}>{t(AUDIT_LABEL[a.rewardTrust])}</span>}</td>
              <td className="num mono">{[a.firstErrorStep, a.lockStep, a.observedStep].map((x) => x ?? '·').join(' / ')}</td>
              <td>{a.hack && a.hack !== 'none' && <span className="tag bad">{t(HACK_LABEL[a.hack])}{a.hackStep ? ` #${a.hackStep}` : ''}</span>}</td>
              <td>{a.verification && <span className={`tag ${a.verification === 'adequate' ? 'ok' : 'bad'}`}>{t(VERIF_LABEL[a.verification])}</span>}</td>
              {A.schema.axes.map((ax) => <td key={ax.id} className="muted" style={{ fontSize: 12 }}>{a.axes?.[ax.id] ? t(a.axes[ax.id]) : ''}</td>)}
              <td className="muted" style={{ maxWidth: 260 }}>{a.note}</td>
            </tr>); })}
          </tbody>
        </table>
        {!jobs.length && <p className="faint">{t('还没有标注。')}</p>}
      </div>
    </>
  );
}

export default function Annotate() {
  const { sub = 'queue' } = useParams();
  const sel = useSel();
  return (
    <>
      <SubNav base="/annotate" tabs={[['queue', '队列'], ['run', '运行标注'], ['prefs', '偏好标注'], ['stats', '统计与导出']]} />
      {sub === 'queue' ? <Queue />
        : sub === 'stats' ? <Stats />
        : !sel.t || !sel.j ? <NeedSel what="任务与运行" />
        : sub === 'run' ? <JobView task={sel.t} job={sel.j} mode="annotate" />
        : sel.b ? <CompareView task={sel.t} a={sel.j} b={sel.b} mode="annotate" /> : <NeedSel what="第二条运行" />}
    </>
  );
}
