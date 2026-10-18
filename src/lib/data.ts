import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export type Format = 'atif' | 'stub' | 'empty' | 'messages' | 'invalid' | 'unknown';
export type Kind = 'user' | 'system' | 'explore' | 'edit' | 'shell' | 'verify' | 'plan' | 'tool' | 'gui' | 'talk' | 'finish';

export interface Artifact { path: string; ext: string; bytes: number }
export interface Media { type: string; path: string | null; mediaType: string | null }
export interface Write { path: string; op: 'write' | 'edit' | 'delete'; content?: string; old?: string; new?: string; from?: string; failed?: boolean }
export interface JobSummary {
  id: string; file: string; dir: string; task: string; agent: string; agentRaw: string | null; model: string; modelRaw: string | null; agentConflict: string | null;
  reward: number | null; rewards: Record<string, number> | null; status: string | null; format: Format; parseError: string | null;
  exception: { type: string; message: string } | null;
  nSteps: number; nAgentSteps: number; nToolCalls: number; nErrors: number; nApiErrors: number; nSubagents: number; nCopied: number; nMedia: number; multiStep: number;
  tokens: { prompt: number | null; completion: number | null; cached: number | null };
  costUsd: number | null; startedAt: string | null; durationSec: number | null; phases: (number | null)[];
  tools: Record<string, number>; families: Record<string, number>; kinds: Partial<Record<Kind, number>>; filesWritten: string[];
  nRepeats: number; suspicious: Record<string, number>; hasVerify: boolean; maxErrorStreak: number;
  tests: { total: number; passed: number; failed: number } | null;
  artifacts: Artifact[]; artifactsFailed: string[];
  agentVersion: string | null; provider: string | null; modelsUsed: string[]; toolDefCount: number;
  latency: { n: number; median: number; p95: number } | null; episodes: number | null; summarizations: number | null;
}
export interface Verifier { kinds: string[]; llmJudge: boolean | null; timeoutSec: number | null; rewardShape: 'none' | 'binary' | 'graded'; rewardRange: [number, number] | null; namedRewards: string[] }
export interface Task {
  id: string; name: string; dir: string | null; category: string | null; difficulty: string | null; modality: string | null; tags: string[];
  description: string | null; mcpServers: string[]; verifier: Verifier; agentTimeoutSec: number | null; vendor: string | null; sourceField: string | null;
  families: Record<string, number>; nFiles: Record<string, number>; jobs: JobSummary[];
}
export interface TaskDetail {
  id: string; instruction: string; tomlRaw: string | null; metaFlat: [string, string][];
  files: { environment: Artifact[]; solution: Artifact[]; tests: Artifact[]; other: Artifact[] };
  container: { workdir: string | null; files: { container: string; source: string }[] }; testShHead: string;
}
export interface Quality { jobs: number; formats: Record<Format, number>; rewardMissing: string[]; agentConflicts: string[]; exceptions: string[]; invalid: string[]; zeroSignalTasks: string[]; tasksWithoutDefinition: string[] }
export interface Index { generatedAt: string; root: string; dataset: string; tasks: Task[]; quality: Quality }
export interface Step {
  i: number; source: 'user' | 'agent' | 'system'; ts: number | null; model: string | null; text: string; media: Media[]; reasoning: string | null;
  calls: { id: string; name: string; args: Record<string, unknown> }[];
  obs: { callId: string | null; content: string; media: Media[]; error: boolean; errorFlag: boolean; subagents: string[] }[];
  metrics: { prompt: number; completion: number; cached: number; cost: number | null } | null; llmCalls: number | null; cwd: string | null; extra?: Record<string, unknown> | null;
  flags: string[]; kind: Kind; files: string[]; writes: Write[]; error: boolean; errorHint: 'flag' | 'text' | null; repeat?: boolean; suspicious?: string[];
}
export interface Subagent { id: string; agent: string | null; model: string | null; steps: Step[] }
export interface JobDetail { apiLatencies: number[]; tests: { name: string; status: string; message: string | null }[] | null; toolDefs: { name: string; description: string }[]; trajMeta: Record<string, unknown> | null; result: Record<string, unknown>; subagents: Subagent[] }
export interface Job { summary: JobSummary; steps: Step[]; detail: JobDetail }

// ---- data sources: pre-ingested server files, or a zip uploaded in the browser ----
export interface Source { kind: 'server' | 'zip'; name: string; index(): Promise<Index>; task(id: string): Promise<TaskDetail>; job(file: string): Promise<Job>; text(rel: string): Promise<string | null>; url(rel: string): Promise<string | null> }
const cache = new Map<string, Promise<unknown>>();
const fetchJson = <T,>(url: string) => {
  const hit = cache.get(url);
  if (hit) return hit as Promise<T>;
  const p = fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); });
  cache.set(url, p); p.catch(() => cache.delete(url));
  return p as Promise<T>;
};
export const serverSource: Source = {
  kind: 'server', name: '',
  index: () => fetchJson<Index>('/data/index.json'),
  task: (id) => fetchJson<TaskDetail>(`/data/tasks/${id}.json`),
  job: (f) => fetchJson<Job>(`/data/jobs/${f}.json`),
  text: async (rel) => { const r = await fetch(`/pack/${rel}`); if (!r.ok) throw new Error(`${r.status} /pack/${rel}`); return r.text(); },
  url: async (rel) => `/pack/${rel}`,
};
let source: Source = serverSource;
const subs = new Set<() => void>();
export const getSource = () => source;
export const setSource = (s: Source) => { source = s; subs.forEach((f) => f()); };
export const onSource = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function useSource() { const [, tick] = useState(0); useEffect(() => onSource(() => tick((n) => n + 1)), []); return source; }

/** Async value with an explicit error, so a missing file shows a message instead of loading forever. */
export function useAsync<T>(key: string | null, run: () => Promise<T | null>) {
  const src = useSource();
  const [st, setSt] = useState<{ data: T | null; error: string | null; key: string | null }>({ data: null, error: null, key: null });
  useEffect(() => { let live = true; setSt({ data: null, error: null, key }); if (key != null) run().then((d) => live && setSt({ data: d, error: null, key })).catch((e) => live && setSt({ data: null, error: e instanceof Error ? e.message : String(e), key })); return () => { live = false; }; }, [key, src]);
  return st;
}
export const useIndex = () => useAsync<Index>('index', () => source.index());
export const useTaskDetail = (id: string | null) => useAsync<TaskDetail>(id || null, () => source.task(id!));
export const jobFile = (task: string, job: string) => `${task}__${job.replace(/\//g, '~')}`;
export const useJob = (task: string, job: string) => useAsync<Job>(task && job ? jobFile(task, job) : null, () => source.job(jobFile(task, job)));
export const useText = (rel: string | null) => useAsync<string>(rel, () => source.text(rel!));
export const useUrl = (rel: string | null) => useAsync<string>(rel, () => (/^(https?:|data:|blob:)/.test(rel!) ? Promise.resolve(rel!) : source.url(rel!)));
/** Root-relative path of a file inside a task directory (null when the task has no definition directory). */
export const packRel = (task: Pick<Task, 'dir' | 'id'>, rel: string) => `${task.dir ?? `tasks/${task.id}`}/${rel}`.replace(/\/{2,}/g, '/').replace(/\/$/, '');
/** Root-relative path of a file inside a run directory; `dir` comes from the normaliser so both layouts work. */
export const jobRel = (job: Pick<JobSummary, 'dir'>, rel: string) => `${job.dir}/${rel}`.replace(/\/{2,}/g, '/');
/** ATIF media paths are relative to the trajectory file, i.e. the run's agent/ directory. */
export const mediaRel = (job: Pick<JobSummary, 'dir'>, p: string) => (/^(https?:|data:|blob:)/.test(p) ? p : p.startsWith('/') ? jobRel(job, p.slice(1)) : jobRel(job, `agent/${p}`));

/** Global selection (task / job / second job) kept in the URL so it survives switching workbenches. */
export function useSel() {
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const merge = (patch: Record<string, string | null | undefined>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); return n; };
  return {
    t: get('t'), j: get('j'), b: get('b'),
    set: (patch: Record<string, string | null | undefined>) => setSp(merge(patch)),
    href: (path: string, patch: Record<string, string | null | undefined> = {}) => { const q = merge(patch).toString(); return q ? `${path}?${q}` : path; },
  };
}

// ---- formatting helpers ----
export const fmtNum = (n: number | null | undefined) => n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(n);
export const fmtCost = (n: number | null | undefined) => n == null ? '–' : n < 0.1 ? '$' + n.toFixed(3) : '$' + n.toFixed(2);
export const fmtDur = (s: number | null | undefined) => s == null ? '–' : s < 90 ? s + 's' : s < 5400 ? Math.round(s / 60) + 'm' : (s / 3600).toFixed(1) + 'h';
export const fmtReward = (r: number | null) => r == null ? '·' : Number.isInteger(r) ? String(r) : r.toFixed(2);
export const scored = (jobs: JobSummary[]) => jobs.filter((j) => j.reward != null);
export const passRate = (jobs: JobSummary[]) => { const s = scored(jobs); return s.length ? s.reduce((a, j) => a + (j.reward ?? 0), 0) / s.length : null; };
export const hasFull = (j: JobSummary) => j.format === 'atif' || j.format === 'messages';
/** Reward colour classes relative to the observed range of the whole dataset (not a hard-wired [0,1]). */
export const rewardCls = (r: number | null, range: [number, number] = [0, 1]) => r == null ? 'hollow' : r >= range[1] ? 'ok' : r <= range[0] ? 'bad' : 'mid';
export const rewardRange = (jobs: JobSummary[]): [number, number] => { const r = scored(jobs).map((j) => j.reward!); return r.length ? [Math.min(0, ...r), Math.max(1, ...r)] : [0, 1]; };
export const agentLabel = (j: Pick<JobSummary, 'agent' | 'model'>) => `${j.agent || '–'} × ${j.model || '–'}`;
export const FORMAT_LABEL: Record<Format, string> = { atif: '完整', messages: '完整·转换', stub: '概要', empty: '空', invalid: '无法解析', unknown: '?' };
export const FAMILY_LABEL: Record<string, string> = { shell: '终端', file: '文件工具', gui: 'GUI 操作', browser: '浏览器', other: 'MCP / 自定义工具' };
export const SUS_LABEL: Record<string, string> = { 'test-edit': '改动了测试或判卷文件', 'eval-tamper': '写入了判卷输出', 'git-history': '翻看 git 历史', 'skip-hack': '跳过或屏蔽测试', 'network': '访问外网' };
/** Verifier mechanism ids (from normalize.js) → label and one-line explanation. */
export const VERIFIER_LABEL: Record<string, string> = { 'unit-tests': '单元测试', 'native-tests': '语言原生测试', 'oracle-diff': '与标准答案文件比对', 'fail-to-pass': 'fail_to_pass 测试', checklist: '终态 checklist 加权', threshold: '指标阈值判定', structural: '结构检查脚本', 'llm-judge': 'LLM judge 评审', 'rubric-tree': 'rubric 树评分', 'stage-rubrics': '逐 stage rubric 检查', 'state-check': '模拟系统状态检查' };
export const VERIFIER_DESC: Record<string, string> = {
  'unit-tests': '运行 pytest 等单元测试，按通过情况给分', 'native-tests': '运行仓库自带的测试命令（npm test / vitest / go test 等）', 'oracle-diff': '把 agent 产出的文件与出题人提供的标准答案逐项比对',
  'fail-to-pass': 'SWE-bench 式判定：指定的测试在修改前失败、修改后必须通过', checklist: '用脚本读取最终状态，对照加权清单逐项打分', threshold: '计算一个指标（如成本或完工时间），与阈值比较',
  structural: '检查产出文件的结构是否齐全（工作表、列名、章节等）', 'llm-judge': '由大模型按 rubric 评审产出质量', 'rubric-tree': '重跑复现脚本后按 rubric 树逐项打分', 'stage-rubrics': '多阶段任务，每个阶段一组程序化检查', 'state-check': '检查模拟系统（邮件、数据库等）的最终状态',
};
