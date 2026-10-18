import { Link } from 'react-router-dom';
import { useJob, useTaskDetail, useSel, fmtNum, fmtCost, fmtDur, fmtReward, type Job } from '../lib/data';
import { useAnnotations } from '../lib/annotations';
import { useT } from '../lib/i18n';
import { KIND_LABEL } from '../components/Step';
import { Timeline } from '../components/Timeline';
import { buildFs } from '../components/Workspace';
import { Loading } from '../components/bits';

const sig = (s: Job['steps'][number]) => JSON.stringify(s.calls.map((c) => [c.name, c.args]));
/** First agent step at which two runs take different tool actions (text and observations are not compared). */
export function divergence(A: Job, B: Job) { const a = A.steps.filter((s) => s.source === 'agent'), b = B.steps.filter((s) => s.source === 'agent'); let k = 0; while (k < a.length && k < b.length && sig(a[k]) === sig(b[k])) k++; return { a: a[k]?.i ?? null, b: b[k]?.i ?? null, shared: k, same: k === a.length && k === b.length }; }
const line = (s: Job['steps'][number]) => { const a = s.calls[0]?.args ?? {}; const c = a.command ?? a.keystrokes ?? a.cmd ?? a.file_path ?? a.path ?? s.text ?? ''; return (Array.isArray(c) ? c.join(' ') : String(c)).split('\n')[0].slice(0, 110); };

function Column({ j, div }: { j: Job; div: number | null }) {
  const S = j.summary;
  const sel = useSel();
  const t = useT();
  return (
    <div className="col">
      <div className="panel" style={{ marginBottom: 10 }}>
        <div className="row"><b>{S.agent || '–'}</b><span className="faint">×</span>{S.model || '–'}<span className="grow" /><Link className="btn ghost" to={sel.href('/explore/trajectory', { j: S.id })}>{t('打开')}</Link></div>
        <div className="tlwrap" style={{ marginTop: 8 }}><Timeline steps={j.steps} cur={null} compact /></div>
      </div>
      <div className="clist">
        {j.steps.filter((s) => s.source === 'agent').map((s) => (
          <Link key={s.i} to={sel.href('/explore/trajectory', { j: S.id }) + `#s-${s.i}`} className={`crow ${s.error ? 'err' : ''} ${div === s.i ? 'div' : ''}`} title={div === s.i ? t('自动分歧点：两条运行从这里开始动作不同') : undefined}>
            <span className="faint mono" style={{ width: 28, textAlign: 'right' }}>{s.i}</span>
            <span className="kind" style={{ background: `var(--k-${s.kind})` }}>{t(KIND_LABEL[s.kind])}</span>
            <span className="mono clip">{line(s)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Pairwise preference: which run did the task better, and why; winner may be left unset while writing. */
function PrefPanel({ k, A, B, auto }: { k: string; A: Job; B: Job; auto: { a: number | null; b: number | null } }) {
  const t = useT();
  const An = useAnnotations();
  const p = An.pref(k);
  const opts: ['a' | 'tie' | 'b', string][] = [['a', `${t('左更好')}：${A.summary.agent} × ${A.summary.model}`], ['tie', t('相当')], ['b', `${t('右更好')}：${B.summary.agent} × ${B.summary.model}`]];
  return (
    <div className="panel anno" style={{ marginBottom: 14 }}>
      <h2>{t('偏好标注')} {An.saveState === 'error' ? <span className="tag bad">{t('保存失败')}</span> : p?.updatedAt && <span className="faint" style={{ fontWeight: 400, fontSize: 11 }}>{t('已保存')} {p.updatedAt.slice(11, 19)}</span>}</h2>
      <div className="row wrap" style={{ marginBottom: 8 }}>{opts.map(([v, l]) => <a key={v} className={`btn ghost ${p?.winner === v ? 'on' : ''}`} onClick={() => An.setPref(k, { winner: p?.winner === v ? '' : v })}>{l}</a>)}</div>
      <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
        <span className="lbl" style={{ fontSize: 11 }} title={t('两条运行从哪一步起走向不同结局；自动分歧点是第一个动作不同的步，决定性分歧可能更晚')}>{t('决定性分歧步')}</span>
        <input type="number" min={1} max={A.steps.length} value={p?.divergenceA ?? ''} placeholder={t('左')} onChange={(e) => An.setPref(k, { divergenceA: e.target.value ? Number(e.target.value) : null })} style={{ width: 70 }} />
        <input type="number" min={1} max={B.steps.length} value={p?.divergenceB ?? ''} placeholder={t('右')} onChange={(e) => An.setPref(k, { divergenceB: e.target.value ? Number(e.target.value) : null })} style={{ width: 70 }} />
        {auto.a != null && <a className="btn ghost" onClick={() => An.setPref(k, { divergenceA: auto.a, divergenceB: auto.b })}>{t('填入自动分歧点')} #{auto.a} / #{auto.b}</a>}
      </div>
      <textarea rows={2} placeholder={t('为什么这一条更好？')} value={p?.reason ?? ''} onChange={(e) => An.setPref(k, { reason: e.target.value })} />
      {p && !p.winner && (p.reason || p.divergenceA != null) && <p className="faint" style={{ fontSize: 11, margin: '4px 0 0' }}>{t('还没有选择哪条更好。')}</p>}
    </div>
  );
}

export function CompareView({ task, a, b, mode }: { task: string; a: string; b: string; mode: 'explore' | 'annotate' }) {
  const t = useT();
  const A = useJob(task, a), B = useJob(task, b);
  const detail = useTaskDetail(task);
  if (!A.data || !B.data) return <Loading error={A.error ?? B.error} />;
  const JA = A.data, JB = B.data;
  const sameHarness = JA.summary.agent === JB.summary.agent && JA.summary.model === JB.summary.model;
  const dv = divergence(JA, JB);
  const container = detail.data?.container ?? { workdir: null, files: [] };
  const written = (j: Job) => buildFs(container, j, j.steps.at(-1)?.i ?? 0).filter((e) => e.status).map((e) => e.path);
  const fa = written(JA), fb = written(JB), files = [...new Set([...fa, ...fb])].sort();
  const rows: [string, (j: Job) => React.ReactNode][] = [
    ['自动分歧点', (j) => { const i = j === JA ? dv.a : dv.b; return dv.same ? <span className="faint">{t('动作完全相同')}</span> : i == null ? <span className="faint">–</span> : <>#{i} <span className="faint">({t('共同前缀 {n} 步', { n: dv.shared })})</span></>; }],
    ['reward', (j) => fmtReward(j.summary.reward)], ['agent 步数', (j) => j.summary.nAgentSteps], ['工具调用', (j) => j.summary.nToolCalls], ['报错', (j) => j.summary.nErrors],
    ['输入 token', (j) => fmtNum(j.summary.tokens.prompt)], ['花费', (j) => fmtCost(j.summary.costUsd)], ['时长', (j) => fmtDur(j.summary.durationSec)], ['写入文件', (j) => (j === JA ? fa : fb).length],
  ];
  return (
    <>
      {mode === 'annotate' && <PrefPanel k={`${task}__${a}__${b}`} A={JA} B={JB} auto={sameHarness ? dv : { a: null, b: null }} />}
      {!sameHarness && <p className="faint" style={{ fontSize: 12 }}>{t('两条运行的 agent 或模型不同，自动分歧点只比较工具动作，参考意义有限。')}</p>}
      <div className="row wrap" style={{ gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
        <div className="panel grow">
          <table className="cmp"><thead><tr><th /><th>{JA.summary.agent} × {JA.summary.model}</th><th>{JB.summary.agent} × {JB.summary.model}</th></tr></thead>
            <tbody>{rows.map(([l, f]) => <tr key={l}><td className="muted">{t(l)}</td><td>{f(JA)}</td><td>{f(JB)}</td></tr>)}</tbody></table>
        </div>
        <div className="panel" style={{ minWidth: 320 }}>
          <h2>{t('写入文件对照')} <span className="faint" style={{ fontWeight: 400 }}>{files.length}</span></h2>
          {files.length ? <table><thead><tr><th>{t('文件')}</th><th>{t('左')}</th><th>{t('右')}</th></tr></thead><tbody>{files.map((f) => <tr key={f}><td className="mono" style={{ fontSize: 12 }}>{f}</td><td>{fa.includes(f) ? '●' : <span className="faint">–</span>}</td><td>{fb.includes(f) ? '●' : <span className="faint">–</span>}</td></tr>)}</tbody></table> : <p className="faint">{t('两条都没有可识别的写入')}</p>}
        </div>
      </div>
      <div className="cols"><Column j={JA} div={dv.same ? null : dv.a} /><Column j={JB} div={dv.same ? null : dv.b} /></div>
    </>
  );
}
