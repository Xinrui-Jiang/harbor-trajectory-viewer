import { useEffect, useState } from 'react';
import { getSource, onSource, type Index } from './data';

// ---- schema: the run-level axes are configurable; edit `schema.axes` in the annotations file ------------------
export interface Axis { id: string; name: string; options: string[] }
export interface Schema { axes: Axis[] }
export const DEFAULT_SCHEMA: Schema = {
  axes: [
    { id: 'mode', name: '主要失败模式', options: ['违反任务要求', '重复无效步骤', '未察觉应当结束', '上下文丢失', '过早终止', '未做验证或验证无关', '推理与行动不一致', '验证不充分'] },
    { id: 'cause', name: '根因类别', options: ['认知：信息缺失或误判', '能力：知道该做什么但做不好', '环境：工具或环境问题'] },
    { id: 'taskIssue', name: '任务本身的问题', options: ['题面歧义', '环境损坏', '判卷有误', '轨迹不完整'] },
  ],
};

export type Verdict = '' | 'correct' | 'incorrect' | 'unclear';
export type StepFlag = 'notable' | 'error' | 'decision' | 'danger' | 'bad-reasoning';
export type VerifierAudit = '' | 'agree' | 'fp' | 'fn' | 'flaky' | 'contaminated';
export const AUDIT_LABEL: Record<VerifierAudit, string> = { '': '', agree: '判卷正确', fp: '误判为通过', fn: '误判为失败', flaky: '判卷不稳定', contaminated: '疑似泄题' };
export type Hack = '' | 'none' | 'test-edit' | 'special-case' | 'gold-git' | 'eval-tamper' | 'other';
export const HACK_LABEL: Record<Hack, string> = { '': '', none: '无', 'test-edit': '改测试', 'special-case': '硬编码或特判', 'gold-git': '从 git 历史拿答案', 'eval-tamper': '篡改判卷', other: '其他' };
export type Tri = '' | 'none' | 'weak' | 'adequate';
export const VERIF_LABEL: Record<Tri, string> = { '': '', none: '没有验证', weak: '验证不充分', adequate: '验证充分' };
export type YesNo = '' | 'yes' | 'no';
export interface JobAnno {
  task: string; job: string; agent: string; model: string; reward: number | null;
  verdict: Verdict; rewardTrust: VerifierAudit;
  firstErrorStep: number | null; lockStep: number | null; observedStep: number | null;
  hack: Hack; hackStep: number | null; verification: Tri; repetition: YesNo; sideEffects: YesNo;
  axes: Record<string, string>; note: string; updatedAt: string;
}
export interface StepAnno { flag?: StepFlag | null; score?: number | null; note: string }
export interface Pref { winner: '' | 'a' | 'b' | 'tie'; reason: string; divergenceA: number | null; divergenceB: number | null; updatedAt: string }
export interface Annotations { dataset: string; schema: Schema; jobs: Record<string, JobAnno>; steps: Record<string, Record<number, StepAnno>>; prefs: Record<string, Pref> }
export const FLAG_LABEL: Record<StepFlag, string> = { notable: '值得看', error: '出错点', decision: '关键决策', danger: '危险操作', 'bad-reasoning': '推理有误' };
export const EMPTY_JOB: JobAnno = { task: '', job: '', agent: '', model: '', reward: null, verdict: '', rewardTrust: '', firstErrorStep: null, lockStep: null, observedStep: null, hack: '', hackStep: null, verification: '', repetition: '', sideEffects: '', axes: {}, note: '', updatedAt: '' };
const META = new Set(['task', 'job', 'agent', 'model', 'reward', 'updatedAt', 'axes']);
export const isAnnotated = (a?: JobAnno) => !!a && (Object.entries(a).some(([k, v]) => !META.has(k) && v !== '' && v !== null) || Object.values(a.axes ?? {}).some(Boolean));
export const isStepAnnotated = (a?: StepAnno | null) => !!a && (!!a.flag || a.score != null || !!a.note);

// ---- persistence: one file per dataset through the dev-server endpoint; localStorage for uploaded zips -------------
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
let store: Annotations | null = null, storeKey = '', saveState: SaveState = 'idle', saveError = '';
const EMPTY = (dataset: string): Annotations => ({ dataset, schema: DEFAULT_SCHEMA, jobs: {}, steps: {}, prefs: {} });
const LEGACY = ['stage', 'cause', 'behavior', 'impact', 'taskIssue'];
const migrate = (raw: Partial<Annotations>, dataset: string): Annotations => {
  const a: Annotations = { ...EMPTY(dataset), ...raw, dataset, schema: { axes: raw.schema?.axes ?? DEFAULT_SCHEMA.axes } };
  for (const j of Object.values(a.jobs) as (JobAnno & Record<string, unknown>)[]) {
    j.axes ??= {}; for (const k of LEGACY) { const v = j[k]; if (typeof v === 'string') { if (v) j.axes[k] = v; delete j[k]; } }
    if ((j.rewardTrust as string) === 'trusted') j.rewardTrust = 'agree'; if ((j.rewardTrust as string) === 'suspect') j.rewardTrust = 'flaky';
    for (const [k, v] of Object.entries(EMPTY_JOB)) if (j[k] === undefined) (j as Record<string, unknown>)[k] = v;
  }
  return a;
};
const datasetOf = async () => { const s = getSource(); if (s.kind === 'zip') return s.name.replace(/\.zip$/i, ''); try { return (await s.index()).dataset; } catch { return 'default'; } };
const slug = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'default';
async function load(): Promise<Annotations> {
  const ds = await datasetOf(); const k = `${getSource().kind}:${slug(ds)}`;
  if (store && storeKey === k) return store;
  storeKey = k;
  let data = {};
  try { data = getSource().kind === 'zip' ? JSON.parse(localStorage.getItem(`harbor-viz.anno.${slug(ds)}`) ?? '{}') : await fetch(`/api/annotations?dataset=${encodeURIComponent(slug(ds))}`).then((r) => r.json()); } catch { /* start empty */ }
  return (store = migrate(data, ds));
}
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
let timer: ReturnType<typeof setTimeout>;
const persist = () => {
  clearTimeout(timer); saveState = 'saving'; notify();
  timer = setTimeout(async () => {
    const snapshot = JSON.stringify(store), key = storeKey;
    try {
      if (getSource().kind === 'zip') localStorage.setItem(`harbor-viz.anno.${slug(store!.dataset)}`, snapshot);
      else { const r = await fetch(`/api/annotations?dataset=${encodeURIComponent(slug(store!.dataset))}`, { method: 'POST', body: snapshot }); if (!r.ok) throw new Error(`${r.status}`); }
      if (key === storeKey) { saveState = 'saved'; saveError = ''; }
    } catch (e) { saveState = 'error'; saveError = e instanceof Error ? e.message : String(e); }
    notify();
  }, 400);
};

/** Shared annotation store with debounced, acknowledged persistence; reloads when the data source changes. */
export function useAnnotations() {
  const [, tick] = useState(0);
  useEffect(() => { const l = () => tick((n) => n + 1); listeners.add(l); load().then(l); const off = onSource(() => load().then(l)); return () => { listeners.delete(l); off(); }; }, []);
  const commit = () => { notify(); persist(); };
  const now = () => new Date().toISOString();
  return {
    data: store, saveState, saveError,
    schema: store?.schema ?? DEFAULT_SCHEMA,
    job: (key: string): JobAnno => store?.jobs[key] ?? EMPTY_JOB,
    setJob: (key: string, patch: Partial<JobAnno>, meta?: Pick<JobAnno, 'task' | 'job' | 'agent' | 'model' | 'reward'>) => { if (!store) return; const prev = store.jobs[key] ?? EMPTY_JOB; store.jobs[key] = { ...prev, ...(meta ?? {}), ...patch, axes: { ...prev.axes, ...(patch.axes ?? {}) }, updatedAt: now() }; commit(); },
    step: (key: string, i: number): StepAnno | undefined => store?.steps[key]?.[i],
    setStep: (key: string, i: number, v: StepAnno | null) => { if (!store) return; const s = (store.steps[key] ??= {}); if (v) s[i] = v; else delete s[i]; if (!Object.keys(s).length) delete store.steps[key]; commit(); },
    pref: (key: string): Pref | undefined => store?.prefs[key],
    setPref: (key: string, patch: Partial<Pref> | null) => { if (!store) return; if (patch) { const prev = store.prefs[key] ?? { winner: '' as const, reason: '', divergenceA: null, divergenceB: null, updatedAt: '' }; store.prefs[key] = { ...prev, ...patch, updatedAt: now() }; } else delete store.prefs[key]; commit(); },
  };
}

/** JSONL: a header line, one line per run with any run- or step-level label, one line per preference. */
export const exportJsonl = (a: Annotations, idx: Index | null) => {
  const keys = new Set([...Object.keys(a.jobs), ...Object.keys(a.steps)]);
  const lookup = (key: string) => idx?.tasks.flatMap((t) => t.jobs.map((j) => ({ key: `${t.id}__${j.id}`, task: t.id, job: j.id, agent: j.agent, model: j.model, reward: j.reward }))).find((x) => x.key === key);
  const lines = [
    JSON.stringify({ type: 'header', dataset: a.dataset, exportedAt: new Date().toISOString(), app: 'harbor-trajectory-viewer', schema: a.schema }),
    ...[...keys].map((k) => JSON.stringify({ type: 'run', key: k, ...(lookup(k) ?? {}), ...(a.jobs[k] ?? {}), steps: a.steps[k] ?? {} })),
    ...Object.entries(a.prefs).map(([k, v]) => JSON.stringify({ type: 'pref', pair: k, ...v })),
  ];
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/x-ndjson' });
  Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `annotations-${slug(a.dataset)}.jsonl` }).click();
};
