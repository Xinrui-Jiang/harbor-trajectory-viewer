import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useIndex, useJob, useTaskDetail, useSel, mediaRel, fmtNum, fmtCost, fmtDur, fmtReward, FORMAT_LABEL, FAMILY_LABEL, SUS_LABEL, type Kind, type Step, type Job, type Subagent } from '../lib/data';
import { useAnnotations, AUDIT_LABEL, HACK_LABEL, VERIF_LABEL, type Verdict, type VerifierAudit, type Hack, type Tri, type YesNo } from '../lib/annotations';
import { useT } from '../lib/i18n';
import { StepCard, KIND_LABEL } from '../components/Step';
import { ChatView } from '../components/Chat';
import { Explorer, FilePane, resolvePath } from '../components/Workspace';
import { Timeline } from '../components/Timeline';
import { Bars, Sparkline } from '../components/Paged';
import { Loading } from '../components/bits';

const KINDS: Kind[] = ['explore', 'edit', 'shell', 'verify', 'plan', 'tool', 'gui', 'talk', 'finish', 'user', 'system'];
const EMPTY_FS = { workdir: null, files: [] };

function Spark({ steps }: { steps: Step[] }) {
  const t = useT();
  const pts = steps.filter((s) => s.metrics).map((s) => s.metrics!.prompt);
  if (pts.length < 2) return <p className="faint">{t('无逐步 token 数据')}</p>;
  return <Sparkline values={pts} fmt={fmtNum} />;
}
function Bar({ title, parts, fmt }: { title: string; parts: [string, number | null][]; fmt: (n: number) => string }) {
  const total = parts.reduce((a, [, v]) => a + (v ?? 0), 0);
  if (!total) return null;
  const shades = ['var(--line-strong)', 'var(--fg-3)', 'var(--fg-2)', 'var(--fg)'];
  return (
    <div className="bar">
      <div className="row" style={{ fontSize: 12 }}><b>{title}</b><span className="grow" /><span className="faint">{fmt(total)}</span></div>
      <div className="bar-track">{parts.map(([l, v], i) => v ? <i key={l} style={{ width: `${(100 * v) / total}%`, background: shades[i % 4] }} title={`${l}: ${fmt(v)}`} /> : null)}</div>
      <div className="legend" style={{ fontSize: 11 }}>{parts.map(([l, v], i) => v ? <span key={l}><i style={{ background: shades[i % 4] }} />{l} {fmt(v)}</span> : null)}</div>
    </div>
  );
}
const Chips = <V extends string,>({ opts, value, onPick, cls }: { opts: [V, string][]; value: V; onPick: (v: V) => void; cls?: (v: V) => string }) => {
  const t = useT();
  return <div className="row wrap" style={{ gap: 5 }}>{opts.map(([v, l]) => <a key={v} className={`tag ${value === v ? (cls?.(v) ?? '') : 'gray'}`} style={{ cursor: 'pointer' }} onClick={() => onPick(value === v ? ('' as V) : v)}>{t(l)}</a>)}</div>;
};
const Num = ({ v, set, ph, max }: { v: number | null; set: (n: number | null) => void; ph: string; max: number }) => {
  const bad = v != null && (v < 1 || v > max);
  return <input type="number" min={1} max={max || undefined} value={v ?? ''} placeholder={ph} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)} style={{ width: 86, borderColor: bad ? 'var(--bad)' : undefined }} title={bad ? `1–${max}` : undefined} />;
};

/** Run-level annotation form. */
export function AnnoForm({ k, job }: { k: string; job: Job }) {
  const t = useT();
  const A = useAnnotations();
  const a = A.job(k);
  const S = job.summary, n = job.steps.length;
  const meta = { task: S.task, job: S.id, agent: S.agent, model: S.model, reward: S.reward };
  const set = (patch: Parameters<typeof A.setJob>[1]) => A.setJob(k, patch, meta);
  const V: [Verdict, string][] = [['correct', '正确'], ['incorrect', '错误'], ['unclear', '存疑']];
  const kv = <T extends string,>(m: Record<T, string>) => (Object.entries(m) as [T, string][]).filter(([v]) => v !== '');
  const yn: [YesNo, string][] = [['yes', '是'], ['no', '否']];
  const state = A.saveState === 'error' ? <span className="tag bad" title={A.saveError}>{t('保存失败')}</span> : A.saveState === 'saving' ? <span className="faint">{t('保存中…')}</span> : a.updatedAt ? <span className="faint" style={{ fontSize: 11 }}>{t('已保存')} {a.updatedAt.slice(11, 19)}</span> : null;
  return (
    <div className="panel anno">
      <h2>{t('运行级标注')} {state}</h2>
      <section><div className="lbl">{t('结论：agent 是否真的完成了任务')}</div><Chips opts={V} value={a.verdict} onPick={(v) => set({ verdict: v })} cls={(v) => (v === 'correct' ? 'ok' : v === 'incorrect' ? 'bad' : 'mid')} /></section>
      <section><div className="lbl">{t('判卷审计：reward 与实际是否一致')}</div><Chips opts={kv<VerifierAudit>(AUDIT_LABEL)} value={a.rewardTrust} onPick={(v) => set({ rewardTrust: v })} cls={(v) => (v === 'agree' ? 'ok' : 'bad')} /></section>
      <section>
        <div className="lbl" title={t('三个步号：决定性错误发生在哪一步；从哪一步起已无法挽回；从哪一步起从输出里能看出不对')}>{t('失败定位')}</div>
        <div className="row wrap" style={{ gap: 6 }}>
          <Num v={a.firstErrorStep} set={(v) => set({ firstErrorStep: v })} ph={t('首个错误')} max={n} />
          <Num v={a.lockStep} set={(v) => set({ lockStep: v })} ph={t('无法挽回')} max={n} />
          <Num v={a.observedStep} set={(v) => set({ observedStep: v })} ph={t('首次可见')} max={n} />
        </div>
      </section>
      <section>
        <div className="lbl">{t('是否钻了判卷的空子')}</div>
        <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}><Chips opts={kv<Hack>(HACK_LABEL)} value={a.hack} onPick={(v) => set({ hack: v })} cls={(v) => (v === 'none' ? 'ok' : 'bad')} />{a.hack && a.hack !== 'none' && <Num v={a.hackStep} set={(v) => set({ hackStep: v })} ph={t('证据步')} max={n} />}</div>
      </section>
      <section><div className="lbl">{t('验证质量')}</div><Chips opts={kv<Tri>(VERIF_LABEL)} value={a.verification} onPick={(v) => set({ verification: v })} cls={(v) => (v === 'adequate' ? 'ok' : v === 'weak' ? 'mid' : 'bad')} /></section>
      <section className="row wrap" style={{ gap: 18 }}>
        <span><div className="lbl">{t('陷入重复循环')}</div><Chips opts={yn} value={a.repetition} onPick={(v) => set({ repetition: v })} cls={(v) => (v === 'yes' ? 'bad' : 'ok')} /></span>
        <span><div className="lbl">{t('多余或有副作用的操作')}</div><Chips opts={yn} value={a.sideEffects} onPick={(v) => set({ sideEffects: v })} cls={(v) => (v === 'yes' ? 'bad' : 'ok')} /></span>
      </section>
      {A.schema.axes.map((ax) => <section key={ax.id}><div className="lbl">{t(ax.name)}</div><Chips opts={ax.options.map((o): [string, string] => [o, o])} value={a.axes?.[ax.id] ?? ''} onPick={(v) => set({ axes: { [ax.id]: v } })} /></section>)}
      <textarea placeholder={t('备注…')} value={a.note} onChange={(e) => set({ note: e.target.value })} rows={3} />
    </div>
  );
}

/** Raw details: result.json, trajectory metadata, tool definitions, test cases, subagents. */
function Raw({ job, onOpenSub }: { job: Job; onOpenSub: (s: Subagent) => void }) {
  const t = useT();
  const D = job.detail;
  const J = (v: unknown) => <pre style={{ maxHeight: 360 }}>{JSON.stringify(v, null, 1)}</pre>;
  return (
    <div className="panel">
      <h2>{t('原始数据')}</h2>
      {D.subagents.length > 0 && <details open><summary className="more">{t('子 agent 轨迹')} ({D.subagents.length})</summary><ul className="list" style={{ fontSize: 12 }}>{D.subagents.map((s) => <li key={s.id}><a className="more" onClick={() => onOpenSub(s)}>{s.id}</a> <span className="faint">{s.agent ?? ''} {s.model ?? ''} · {s.steps.length} {t('步')}</span></li>)}</ul></details>}
      {D.tests && <details><summary className="more">{t('判卷用例')} ({D.tests.length})</summary><ul className="list mono" style={{ fontSize: 12 }}>{D.tests.map((c) => <li key={c.name} className={c.status === 'passed' ? 'diff-easy' : 'diff-hard'} title={c.message ?? ''}>{c.status} {c.name}</li>)}</ul></details>}
      {D.toolDefs.length > 0 && <details><summary className="more">{t('可用工具')} ({D.toolDefs.length})</summary><ul className="list" style={{ fontSize: 12 }}>{D.toolDefs.map((d) => <li key={d.name}><span className="mono">{d.name}</span> <span className="faint">{d.description}</span></li>)}</ul></details>}
      {D.trajMeta && <details><summary className="more">trajectory.json {t('元信息')}</summary>{J(D.trajMeta)}</details>}
      {job.summary.exception && <details open><summary className="more">exception_info</summary>{J((D.result as Record<string, unknown>).exception_info)}</details>}
      <details><summary className="more">result.json</summary>{J(D.result)}</details>
    </div>
  );
}

export function JobView({ task, job, mode }: { task: string; job: string; mode: 'explore' | 'annotate' }) {
  const t = useT();
  const { data: idx, error } = useIndex();
  const jobQ = useJob(task, job);
  const detail = useTaskDetail(task);
  const A = useAnnotations();
  const sel = useSel();
  const [q, setQ] = useState('');
  const [hide, setHide] = useState<Set<Kind>>(new Set());
  const [onlyErr, setOnlyErr] = useState(false);
  const [view, setView] = useState<'chat' | 'steps'>('chat');
  const [cur, setCur] = useState<number | null>(null);
  const [upto, setUpto] = useState<number>(0);
  const [file, setFile] = useState<string | null>(null);
  const [side, setSide] = useState<'file' | 'anno' | 'stats' | 'raw'>(mode === 'annotate' ? 'anno' : 'stats');
  const [follow, setFollow] = useState(true);
  const [sub, setSub] = useState<Subagent | null>(null);
  const data = jobQ.data;
  const key = `${task}__${job}`;
  const T = idx?.tasks.find((x) => x.id === task);
  const siblings = T?.jobs ?? [];
  const at = siblings.findIndex((j) => j.id === job);
  const allSteps = sub ? sub.steps : data?.steps ?? [];
  const steps = useMemo(() => allSteps.filter((s) => !hide.has(s.kind) && (!onlyErr || s.error) && (!q || JSON.stringify(s).toLowerCase().includes(q.toLowerCase()))), [allSteps, hide, onlyErr, q]);
  useEffect(() => { setCur(null); setFile(null); setSub(null); setUpto(data?.steps.at(-1)?.i ?? 0); window.scrollTo({ top: 0 }); }, [data]);
  const goto = (i: number) => { setCur(i); setUpto(i); document.getElementById(`s-${i}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input, textarea, select') || !steps.length || (e.key !== 'j' && e.key !== 'k')) return;
      const k = steps.findIndex((s) => s.i === cur), n = Math.max(0, Math.min(steps.length - 1, k + (e.key === 'j' ? 1 : -1)));
      goto(steps[n].i);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [steps, cur]);
  useEffect(() => {
    if (!follow || !data) return;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const line = window.innerHeight * 0.35; let best: Element | null = null, bestD = Infinity;
      for (const el of document.querySelectorAll('.stream [id^="s-"]')) { const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > window.innerHeight) continue; const d = Math.abs(r.top - line); if (d < bestD) { bestD = d; best = el; } }
      if (best) { const i = Number(best.id.slice(2)); setUpto((u) => (u === i ? u : i)); }
    }); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [follow, data, view, steps]);
  if (!idx) return <Loading error={error} />;
  if (!T) return <p className="notice bad">{t('未找到任务')} {task}</p>;
  if (!data) return <Loading error={jobQ.error} />;
  const { summary: S } = data;
  const container = detail.data?.container ?? EMPTY_FS;
  const t0 = allSteps.find((s) => s.ts)?.ts ?? null;
  const toggle = (k: Kind) => setHide((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const resolve = (p: string) => mediaRel(S, p);
  const onFile = (p: string, i: number) => { setUpto(i); setCur(i); setFile(resolvePath(container, data, i, p)); setSide('file'); };
  const onStep = (i: number) => { setCur(i); setUpto(i); };
  const cached = S.tokens.cached ?? 0, uncached = Math.max(0, (S.tokens.prompt ?? 0) - cached);
  const tabs: [typeof side, string][] = mode === 'annotate' ? [['anno', '标注'], ['file', '文件'], ['stats', '统计'], ['raw', '原始']] : [['stats', '统计'], ['file', '文件'], ['raw', '原始']];
  const NOTICE: Record<string, string> = { stub: '没有逐步轨迹，只有几步概要。', empty: '没有轨迹文件，只有分数。', invalid: '轨迹文件无法解析。', messages: '轨迹是原始对话格式，已转换；没有时间戳和逐步 token。', unknown: '未知格式。' };
  const scores = allSteps.map((s) => A.step(key, s.i)?.score ?? null), vals = scores.filter((x): x is number => x != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const marks = (() => { const a = A.job(key); const m = new Map<number, string>(); if (a.firstErrorStep) m.set(a.firstErrorStep, t('首个错误')); if (a.lockStep) m.set(a.lockStep, t('无法挽回')); if (a.observedStep) m.set(a.observedStep, t('首次可见')); if (a.hackStep) m.set(a.hackStep, t('证据步')); return m; })();
  return (
    <div className="jobpage">
      <div className="jobhead">
        <div className="row wrap">
          <h1>{S.agent || '–'} <span className="faint">×</span> {S.model || '–'}</h1>
          <span className={`tag ${S.reward === 1 ? 'ok' : S.reward === 0 ? 'bad' : S.reward == null ? 'gray' : 'mid'}`}>reward {fmtReward(S.reward)}</span>
          {S.rewards && Object.entries(S.rewards).filter(([k]) => k !== 'reward').map(([k, v]) => <span key={k} className="tag gray">{k} {fmtReward(v)}</span>)}
          <span className="tag gray">{t(FORMAT_LABEL[S.format])}</span>
          {S.exception && <span className="tag bad" title={S.exception.message}>{t('异常')} {S.exception.type}</span>}
          {S.agentConflict && <span className="tag mid" title={t('config.json 与轨迹的 agent 不一致')}>{t('config 写的是')} {S.agentConflict}</span>}
          {S.format === 'atif' && !S.hasVerify && <span className="tag bad" title={t('整条轨迹没有识别到运行测试或检查的步骤；按工具名和命令推断')}>{t('未检测到测试运行')}</span>}
          {S.nRepeats > 0 && <span className="tag mid" title={t('与上一步完全相同的动作（同工具同参数）')}>{t('重复动作')} {S.nRepeats}</span>}
          {Object.keys(S.suspicious).length > 0 && <span className="tag bad" title={Object.entries(S.suspicious).map(([k, n]) => `${t(SUS_LABEL[k] ?? k)} ×${n}`).join('\n')}>{t('可疑操作')} {Object.values(S.suspicious).reduce((a, b) => a + b, 0)}</span>}
          {S.maxErrorStreak >= 3 && <span className="tag mid" title={t('最长连续报错步数')}>{t('连续报错')} {S.maxErrorStreak}</span>}
          {S.nApiErrors > 0 && <span className="tag mid">{t('API 错误')} {S.nApiErrors}</span>}
          <span className="grow" />
          {at > 0 && <a className="btn ghost" onClick={() => sel.set({ j: siblings[at - 1].id })}>← {t('上一条')}</a>}
          {at < siblings.length - 1 && <a className="btn ghost" onClick={() => sel.set({ j: siblings[at + 1].id })}>{t('下一条')} →</a>}
          {mode === 'explore' ? <Link className="btn" to={sel.href('/annotate/run')}>{t('去标注')}</Link> : <Link className="btn" to={sel.href('/explore/trajectory')}>{t('去探索')}</Link>}
        </div>
        <div className="row wrap" style={{ gap: 16, fontSize: 13 }}>
          <span><span className="faint">{t('步数')} </span>{S.nAgentSteps}</span><span><span className="faint">{t('工具调用')} </span>{S.nToolCalls}</span>
          <span><span className="faint">{t('报错')} </span><b className={S.nErrors ? 'diff-hard' : ''}>{S.nErrors}</b></span>
          <span><span className="faint">{t('写入文件')} </span>{S.filesWritten.length}</span>
          {S.nSubagents > 0 && <span><span className="faint">{t('子 agent')} </span>{S.nSubagents}</span>}{S.nMedia > 0 && <span><span className="faint">{t('多模态内容')} </span>{S.nMedia}</span>}
          <span><span className="faint">{t('花费')} </span>{fmtCost(S.costUsd)}</span><span><span className="faint">{t('时长')} </span>{fmtDur(S.durationSec)}</span>
          <span className="faint">{t('j 下一步，k 上一步')}</span>
        </div>
        <div className="row wrap" style={{ gap: 24, alignItems: 'flex-start' }}>
          <Bar title="Token" parts={[[t('缓存输入'), cached], [t('未缓存输入'), uncached], [t('输出'), S.tokens.completion]]} fmt={fmtNum} />
          <Bar title={t('阶段耗时')} parts={[[t('环境搭建'), S.phases[0]], [t('agent 启动'), S.phases[1]], [t('agent 执行'), S.phases[2]], [t('判卷'), S.phases[3]]]} fmt={fmtDur} />
          {S.agentRaw && S.model && <code className="repro" title={t('在 Harbor 里复现这次运行的命令')}>harbor run -t {task} -a {S.agentRaw} -m {S.modelRaw ?? S.model}</code>}
        </div>
        {S.format !== 'atif' && <p className={`notice ${S.format === 'empty' || S.format === 'invalid' ? 'bad' : 'mid'}`}>{t(NOTICE[S.format] ?? '')}{S.parseError ? ` ${S.parseError}` : ''}</p>}
        {sub && <p className="notice mid">{t('正在查看子 agent 轨迹')} {sub.id} · <a className="more" onClick={() => setSub(null)}>{t('返回主轨迹')}</a></p>}
      </div>

      <div className="jobbody">
        <aside className="explorer">{allSteps.length > 0 && <Explorer container={container} job={sub ? { ...data, steps: sub.steps } : data} upto={upto} setUpto={(n) => { setUpto(n); setCur(n); }} selected={file} onSelect={(p) => { setFile(p); if (p) setSide('file'); }} follow={follow} setFollow={setFollow} />}</aside>
        <section className="stream">
          {allSteps.length > 0 && (
            <>
              <div className="tlwrap" title={t('时间轴：同类动作合并为一段，宽度随步数增长；菱形是用户或系统消息；点击跳转')}><Timeline steps={allSteps} cur={cur} onJump={goto} marks={marks} /></div>
              {(mode === 'annotate' || vals.length > 0) && <div className="sig score" title={t('stepwise reward：按本条轨迹内的取值范围从红到绿着色，空白未标')}>{allSteps.map((s, k) => <i key={s.i} onClick={() => goto(s.i)} style={scores[k] != null ? { background: hi === lo ? 'var(--accent)' : `hsl(${Math.round(120 * (scores[k]! - lo) / (hi - lo))} 60% 45%)` } : undefined} className={scores[k] == null ? 'none' : ''} title={`#${s.i}${scores[k] != null ? ` · ${scores[k]}` : ''}`} />)}</div>}
              <div className="row wrap toolbar">
                {KINDS.filter((k) => allSteps.some((s) => s.kind === k)).map((k) => <a key={k} className="kchip" style={{ background: hide.has(k) ? 'var(--none)' : `var(--k-${k})` }} onClick={() => toggle(k)} title={t('步骤类型由工具名和命令文本启发式推断，不是原始数据字段；点击可隐藏该类步骤')}>{t(KIND_LABEL[k])} {allSteps.filter((s) => s.kind === k).length}</a>)}
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('搜索步骤…')} style={{ width: 150 }} />
                <label className="row faint" style={{ fontSize: 12 }}><input type="checkbox" checked={onlyErr} onChange={(e) => setOnlyErr(e.target.checked)} /> {t('只看报错')}</label>
                <span className="faint" style={{ fontSize: 11 }}>{steps.length} / {allSteps.length}</span>
                <span className="grow" />
                <span className="seg">{(['chat', 'steps'] as const).map((v) => <a key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v === 'chat' ? t('对话视图') : t('步骤视图')}</a>)}</span>
              </div>
            </>
          )}
          {!allSteps.length ? <p className="faint">{t('无过程可看。')}</p> : view === 'chat' ? <ChatView steps={steps} t0={t0} resolve={resolve} onFile={onFile} onStep={onStep} cur={cur} annot={mode === 'annotate' ? { get: (i) => A.step(key, i), set: (i, v) => A.setStep(key, i, v) } : undefined} /> : steps.map((s) => <StepCard key={s.i} s={s} t0={t0} active={cur === s.i} resolve={resolve} anno={A.step(key, s.i)} onFlag={mode === 'annotate' ? (v) => A.setStep(key, s.i, v) : undefined} onFile={(p) => onFile(p, s.i)} />)}
        </section>
        <aside className="side">
          <div className="seg" style={{ alignSelf: 'flex-start' }}>{tabs.map(([k, l]) => <a key={k} className={side === k ? 'on' : ''} onClick={() => setSide(k)}>{t(l)}</a>)}</div>
          {side === 'anno' && <AnnoForm k={key} job={data} />}
          {side === 'file' && <FilePane task={T} container={container} job={sub ? { ...data, steps: sub.steps } : data} upto={upto} selected={file} />}
          {side === 'raw' && <Raw job={data} onOpenSub={(s) => { setSub(s); setCur(null); setUpto(s.steps.at(-1)?.i ?? 0); }} />}
          {side === 'stats' && (
            <>
              <div className="panel"><h2>{t('模型与 harness')}</h2>
                <table><tbody>
                  <tr><td className="muted">agent</td><td className="mono">{S.agentRaw ?? '–'}{S.agentVersion ? ` ${S.agentVersion}` : ''}</td></tr>
                  <tr><td className="muted">model</td><td className="mono">{S.modelRaw ?? S.model ?? '–'}{S.provider ? <span className="faint"> · {S.provider}</span> : null}</td></tr>
                  {S.modelsUsed.length > 1 && <tr><td className="muted">{t('运行中用到的模型')}</td><td className="mono diff-medium">{S.modelsUsed.join(', ')}</td></tr>}
                  {S.episodes != null && <tr><td className="muted">{t('LLM 调用轮次')}</td><td>{S.episodes}{S.summarizations ? ` · ${t('上下文压缩')} ${S.summarizations}` : ''}</td></tr>}
                  {S.toolDefCount > 0 && <tr><td className="muted">{t('可用工具')}</td><td>{S.toolDefCount} <a className="more" onClick={() => setSide('raw')}>{t('查看')}</a></td></tr>}
                  {S.tests && <tr><td className="muted">{t('判卷用例')}</td><td>{S.tests.passed}/{S.tests.total}</td></tr>}
                </tbody></table>
              </div>
              {data.detail.apiLatencies.length > 1 && <div className="panel"><h2>{t('每次 API 调用耗时')}</h2><Sparkline values={data.detail.apiLatencies} fmt={(v) => `${(v / 1000).toFixed(1)}s`} />{S.latency && <div className="faint" style={{ fontSize: 11 }}>{t('中位 {a} · p95 {b}', { a: `${(S.latency.median / 1000).toFixed(1)}s`, b: `${(S.latency.p95 / 1000).toFixed(1)}s` })}</div>}</div>}
              <div className="panel"><h2>{t('上下文增长')}</h2><Spark steps={data.steps} /></div>
              <div className="panel"><h2>{t('工具使用')}</h2><div className="row wrap" style={{ gap: 4, marginBottom: 6 }}>{Object.entries(S.families).map(([f, n]) => <span key={f} className="tag gray">{t(FAMILY_LABEL[f] ?? f)} {n}</span>)}</div><Bars rows={Object.entries(S.tools).sort((a, b) => b[1] - a[1]).slice(0, 12)} /></div>
              {S.artifacts.length > 0 && <div className="panel"><h2>{t('产物')} <span className="faint">{S.artifacts.length}</span></h2><ul className="list" style={{ fontSize: 12 }}>{S.artifacts.slice(0, 20).map((a) => <li key={a.path}><Link to={sel.href('/explore/artifact', { p: a.path })} className="mono">{a.path}</Link></li>)}</ul></div>}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
