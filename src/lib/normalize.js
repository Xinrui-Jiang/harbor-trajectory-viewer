// Core normaliser: Harbor tasks + ATIF trajectories → one canonical JSON schema.
// Pure and synchronous over an abstract file system, so the same code runs in the Node ingest script
// (`scripts/ingest.mjs`) and in the browser on an uploaded zip (`src/lib/zipSource.ts`).
//
// Accepted layouts (auto-detected):
//   A. pack layout      root/tasks/<task>/{task.toml,instruction.md,environment,solution,tests,jobs/<job>/...}
//   B. Harbor jobs dir  root/<job>/<trial>/{config.json,result.json,agent/trajectory.json,verifier/,artifacts/}
//      task definitions resolved from `tasksDir` or result.json task_id.path when present.
// Trajectory dialects: ATIF v1.0–1.8 (spec), plus two non-standard dialects seen in the wild (a flat step list with
// index/role/toolCalls, and raw chat `messages`), converted on a best-effort basis and flagged.
//
// Output: { index, tasks: [{id, detail}], jobs: [{summary, steps, detail}] }. `index` holds only what list pages need.
import { parse as parseToml } from 'smol-toml';

/** @typedef {{ exists(p: string): boolean, isDir(p: string): boolean, ls(p: string): string[], read(p: string): string | null, size(p: string): number }} Fs */

const pj = (...a) => a.filter((x) => x != null && x !== '').join('/').replace(/\/{2,}/g, '/');
const base = (p) => p.split('/').pop() ?? p;
const extOf = (p) => { const b = base(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; };
const ts = (s) => (s ? new Date(/Z|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z').getTime() : null);
const num = (v) => (v === null || v === undefined || v === 'None' || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const uniq = (a) => [...new Set(a)];
const agentId = (s) => String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '') || null;

// ---- step classification ---------------------------------------------------
const FAMILY = [
  ['shell', /^(bash_command|bash|execute_bash|exec|shell|run_command|terminal|run_shell|container\.exec)$/i],
  ['gui', /^(computer[._]|screenshot|click|type_text|key|mouse|xdotool)/i],
  ['browser', /^(navigate|browser[._]|goto|web_search|fetch|WebFetch|WebSearch)/i],
  ['file', /^(Read|Write|Edit|MultiEdit|Grep|Glob|LS|str_replace_editor|str_replace_based_edit_tool|read_file|write_file|edit_file|list_files|read|write|edit|apply_patch|filesystem_|view_file|create_file)/i],
];
const familyOf = (name) => FAMILY.find(([, rx]) => rx.test(name))?.[0] ?? 'other';
const KIND = [
  [/^(finish|mark_task_complete|attempt_completion|submit|done|complete_task)$/i, 'finish'],
  [/^(task_tracker|TaskCreate|TaskUpdate|think|TodoWrite|plan|update_plan)$/i, 'plan'],
  [/^(Edit|Write|MultiEdit|str_replace_editor|str_replace_based_edit_tool|edit_file|write_file|edit|write|apply_patch|create_file)$/, 'edit'],
  [/^(Read|Grep|Glob|LS|read_file|list_files|read|get_project_info|read_asset|filesystem_|view_file|cat|ls)/, 'explore'],
  [/^(run_tests|compile_project|run_solver|test)$/i, 'verify'],
];
const SHELL_RX = { verify: /\b(pytest|go test|npm test|yarn test|vitest|jest|cargo test|make test|test\.sh|verify|unittest|phpunit|rspec)\b/, explore: /^\s*(ls|cat|head|tail|grep|rg|find|wc|tree|sed -n|pwd|which|git (log|status|diff|show)|stat|file)\b/ };
const cmdText = (a) => { const c = a?.command ?? a?.keystrokes ?? a?.cmd ?? a?.script; return Array.isArray(c) ? c.map(String).join(' ') : typeof c === 'string' ? c : ''; };
const kindOf = (name, args) => {
  if (/^(str_replace_editor|str_replace_based_edit_tool)$/.test(name) && args?.command === 'view') return 'explore';
  const k = KIND.find(([rx]) => rx.test(name))?.[1];
  if (k) return k;
  const fam = familyOf(name);
  if (fam === 'gui') return 'gui';
  if (fam !== 'shell') return 'tool';
  const cmd = cmdText(args);
  return Object.entries(SHELL_RX).find(([, rx]) => rx.test(cmd))?.[0] ?? 'shell';
};
const KIND_RANK = ['finish', 'edit', 'verify', 'plan', 'gui', 'tool', 'explore', 'shell', 'talk'];
const stepKind = (calls) => calls.map((c) => kindOf(c.name, c.args)).sort((a, b) => KIND_RANK.indexOf(a) - KIND_RANK.indexOf(b))[0] ?? 'talk';
const fileOf = (args) => args?.file_path ?? args?.path ?? args?.filename ?? args?.file ?? null;
// Observations are flagged as errors by the producer (extra.tool_result_is_error / is_error) or, failing that, by text.
const ERR_RX = /Traceback \(most recent call last\)|command not found|No such file or directory|Permission denied|\bexit(?:ed)? (?:with )?(?:code|status) [1-9]\d*\b|\[Errno \d+\]|^\s*(error|fatal|FAILED)\b|\bERROR\b/m;

// ---- file writes: from tool args and from shell commands ---------------------
const SHELL_WRITES = [
  [/cat\s*>{1,2}\s*(\S+)\s*<<-?\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\2/g, (m) => ({ path: m[1], op: 'write', content: m[3] })],
  [/cat\s*<<-?\s*['"]?(\w+)['"]?\s*>{1,2}\s*(\S+)\n([\s\S]*?)\n\1/g, (m) => ({ path: m[2], op: 'write', content: m[3] })],
  [/(?:^|[;&|]\s*|\n)\s*(?:echo|printf)\b[^\n|;]*?>{1,2}\s*(\S+)/g, (m) => ({ path: m[1], op: 'edit' })],
  [/\|\s*tee\s+(?:-a\s+)?(\S+)/g, (m) => ({ path: m[1], op: 'edit' })],
  [/\bsed\s+-i(?:\s+'')?\s+(?:-e\s+)?(?:'[^']*'|"[^"]*"|\S+)\s+(\S+)/g, (m) => ({ path: m[1], op: 'edit' })],
  [/open\(\s*['"]([^'"]+)['"]\s*,\s*['"][wa]/g, (m) => ({ path: m[1], op: 'edit' })],
  [/\b(?:cp|mv)\s+(?:-\w+\s+)*(\S+)\s+(\S+)/g, (m) => ({ path: m[2], op: 'write', from: m[1] })],
  [/\brm\s+(?:-\w+\s+)*([^\n;&|]+)/g, (m) => m[1].trim().split(/\s+/).filter((p) => !p.startsWith('-')).map((path) => ({ path, op: 'delete' }))],
  [/\b(?:go build|gcc|cc|rustc|tsc|npm run build)\b[^\n]*-o\s+(\S+)/g, (m) => ({ path: m[1], op: 'write' })],
];
const PATHY = /^(?=.*[A-Za-z])[\w.~][\w.\/~@+-]*$|^\/[\w.\/~@+-]+$/;
const shellWrites = (cmd) => SHELL_WRITES.flatMap(([rx, f]) => [...cmd.matchAll(rx)].flatMap((m) => f(m))).map((w) => ({ ...w, path: w.path.replace(/^['"]|['"]$/g, '') })).filter((w) => PATHY.test(w.path) && !w.path.startsWith('/dev/') && w.path !== '.');
const toolWrites = (name, a = {}) => {
  const p = fileOf(a);
  if (/^(Write|write_file|write|create_file)$/.test(name) && p) return [{ path: p, op: 'write', content: typeof a.content === 'string' ? a.content : typeof a.text === 'string' ? a.text : undefined }];
  if (/^(Edit|MultiEdit|edit|edit_file)$/.test(name) && p) return [{ path: p, op: 'edit', old: a.old_string, new: a.new_string }];
  if (/^(str_replace_editor|str_replace_based_edit_tool)$/.test(name) && p && a.command !== 'view') return [{ path: p, op: a.command === 'create' ? 'write' : 'edit', content: a.file_text, old: a.old_str, new: a.new_str }];
  if (name === 'apply_patch' && typeof a.patch === 'string') return [...a.patch.matchAll(/\*\*\* (Add|Update|Delete) File: (\S+)/g)].map((m) => ({ path: m[2], op: m[1] === 'Delete' ? 'delete' : m[1] === 'Add' ? 'write' : 'edit' }));
  return familyOf(name) === 'shell' ? shellWrites(cmdText(a)) : [];
};

// ---- automatic per-step signals (no human labels) -----------------------------
const SUS = [
  ['test-edit', (s) => s.writes.some((w) => /(^|\/)(tests?|__tests__|spec|verifier|rubrics?|grader)(\/|$)|test_[^/]*\.py$|\.(test|spec)\.[jt]sx?$|_test\.go$/i.test(w.path))],
  ['eval-tamper', (s) => s.writes.some((w) => /reward\.(txt|json)|\/logs\/verifier/.test(w.path))],
  ['git-history', (s, cmd) => /\bgit\s+(log\s+--all|show\b|reflog|stash\s+list|branch\s+-a|cat-file|checkout\s+\S*(gold|solution|answer))/.test(cmd)],
  ['skip-hack', (s, cmd) => /pytest\.skip|@pytest\.mark\.skip|unittest\.skip|sys\.exit\(0\)|--ignore=|\s-k\s+["']not\b/.test(cmd)],
  // only dotted public hostnames count: in-cluster services (kafka:9092) and localhost are normal
  ['network', (s, cmd) => /\b(curl|wget|pip3? install|npm install|git clone)\b[^\n]*https?:\/\/(?!localhost|127\.|0\.0\.0\.0|\[::1\])[\w-]+(\.[\w-]+)+/.test(cmd)],
];

// ---- ATIF content parts (v1.6+ multimodal) -----------------------------------
const parts = (m) => {
  if (typeof m === 'string') return { text: m, media: [] };
  if (!Array.isArray(m)) return { text: m == null ? '' : JSON.stringify(m), media: [] };
  return { text: m.filter((p) => p?.type === 'text').map((p) => p.text).join('\n'), media: m.filter((p) => p && p.type !== 'text').map((p) => ({ type: p.type, path: p.source?.path ?? p.path ?? null, mediaType: p.source?.media_type ?? p.media_type ?? null })) };
};
const blank = (i, source, text) => ({ i, source, ts: null, model: null, text, media: [], reasoning: null, calls: [], obs: [], metrics: null, llmCalls: null, cwd: null, flags: [] });

// ---- the three dialects → raw canonical steps --------------------------------
const fromATIF = (t) =>
  t.steps.map((s) => {
    const m = parts(s.message);
    const redacted = /^\s*\{\s*"type"\s*:\s*"redacted_thinking"/.test(m.text);
    return {
      i: s.step_id, source: s.source, ts: ts(s.timestamp), model: s.model_name ?? null, text: redacted ? '' : m.text, media: m.media,
      reasoning: s.reasoning_content ?? s.thinking_blocks?.map((b) => b.thinking).join('\n') ?? null,
      calls: (s.tool_calls ?? []).map((c) => ({ id: c.tool_call_id, name: c.function_name, args: c.arguments ?? {} })),
      obs: (s.observation?.results ?? []).map((r) => { const o = parts(r.content); return { callId: r.source_call_id ?? null, content: o.text, media: o.media, errorFlag: !!(r.extra?.tool_result_is_error ?? r.extra?.is_error), subagents: (r.subagent_trajectory_ref ?? []).map((x) => x.trajectory_id ?? x.session_id ?? '?') }; }),
      metrics: s.metrics ? { prompt: s.metrics.prompt_tokens ?? 0, completion: s.metrics.completion_tokens ?? 0, cached: s.metrics.cached_tokens ?? 0, cost: s.metrics.cost_usd ?? null } : null,
      llmCalls: s.llm_call_count ?? null, cwd: s.extra?.cwd ?? null, extra: s.extra ?? null,
      flags: [s.model_name === '<synthetic>' && 'api-error', redacted && 'redacted', s.extra?.is_sidechain && 'sidechain', s.extra?.stop_reason === 'max_tokens' && 'truncated', s.is_copied_context && 'copied'].filter(Boolean),
    };
  });
const parseArgs = (a) => { if (a == null) return {}; if (typeof a !== 'string') return a; try { return JSON.parse(a); } catch { return { raw: a }; } };
const fromStub = (list) =>
  list.map((s, k) => ({
    ...blank((s.index ?? k) + 1, s.role === 'user' ? 'user' : s.role === 'system' ? 'system' : 'agent', s.text ?? ''), reasoning: s.reasoning ?? null,
    calls: (s.toolCalls ?? []).map((c, j) => ({ id: `stub-${k}-${j}`, name: c.name ?? 'tool', args: parseArgs(c.args) })),
    obs: s.observation ? [{ callId: null, content: String(s.observation), media: [], errorFlag: false, subagents: [] }] : [],
    flags: ['stub'], files: (s.mutations ?? []).map((m) => m.target).filter(Boolean),
  }));
const fromMessages = ({ messages }) => {
  const steps = [];
  for (const m of messages) {
    const blocks = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content ?? '') }];
    if (m.role === 'assistant') {
      const t = parts(blocks.filter((b) => b.type === 'text' || b.type === 'image'));
      steps.push({ ...blank(steps.length + 1, 'agent', t.text), media: t.media, reasoning: blocks.filter((b) => b.type === 'thinking').map((b) => b.thinking).join('\n') || null,
        calls: blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} })), llmCalls: 1, flags: ['converted'] });
    } else {
      const results = blocks.filter((b) => b.type === 'tool_result');
      if (results.length && steps.at(-1)?.source === 'agent') steps.at(-1).obs.push(...results.map((b) => { const o = parts(Array.isArray(b.content) ? b.content : [{ type: 'text', text: String(b.content ?? '') }]); return { callId: b.tool_use_id, content: o.text, media: o.media, errorFlag: !!b.is_error, subagents: [] }; }));
      const t = parts(blocks.filter((b) => b.type === 'text' || b.type === 'image'));
      if (t.text || t.media.length) steps.push({ ...blank(steps.length + 1, m.role === 'system' ? 'system' : 'user', t.text), media: t.media, flags: ['converted'] });
    }
  }
  return steps;
};

/** Derived per-step fields: kind, writes (with failure from the matching observation), error, repetition, suspicious actions. */
function enrich(steps) {
  let prevSig = null;
  for (const s of steps) {
    s.kind = s.source !== 'agent' ? s.source : stepKind(s.calls);
    const errById = new Map(s.obs.filter((o) => o.callId).map((o) => [o.callId, o.errorFlag]));
    s.writes = s.calls.flatMap((c) => toolWrites(c.name, c.args).map((w) => ({ ...w, failed: errById.get(c.id) === true || (s.calls.length === 1 && s.obs.some((o) => o.errorFlag)) })));
    if (s.writes.length && s.kind === 'shell') s.kind = 'edit';
    s.files = uniq([...(s.files ?? []), ...s.calls.filter((c) => ['edit', 'explore'].includes(kindOf(c.name, c.args))).map((c) => fileOf(c.args)).filter((p) => typeof p === 'string')]);
    for (const o of s.obs) o.error = o.errorFlag || ERR_RX.test(String(o.content ?? '').slice(0, 4000));
    s.errorHint = s.obs.some((o) => o.errorFlag) ? 'flag' : s.obs.some((o) => o.error) ? 'text' : null;
    s.error = s.errorHint != null;
    if (s.source === 'agent') {
      const sig = s.calls.length ? JSON.stringify(s.calls.map((c) => [c.name, c.args])) : null;
      s.repeat = !!sig && sig === prevSig; prevSig = sig;
      const cmd = s.calls.map((c) => cmdText(c.args)).join('\n');
      s.suspicious = SUS.filter(([, f]) => f(s, cmd)).map(([k]) => k);
    }
  }
  return steps;
}

/** @param {Fs} fs @param {string} root @param {string | null} tasksDir */
export function normalize(fs, root, tasksDir = null) {
  const readJson = (p) => { const s = fs.read(p); if (s == null || !s.trim()) return { value: null, error: s == null ? null : 'empty' }; try { return { value: JSON.parse(s), error: null }; } catch (e) { return { value: null, error: String(e.message ?? e).slice(0, 120) }; } };
  const json = (p) => readJson(p).value;
  const walk = (dir, b = dir) => fs.ls(dir).flatMap((n) => { const p = pj(dir, n); return fs.isDir(p) ? walk(p, b) : [{ path: p.slice(b.length + 1), ext: extOf(n), bytes: fs.size(p) }]; });
  const relRoot = (p) => (root && p.startsWith(root + '/') ? p.slice(root.length + 1) : root === p ? '' : p);

  function discover() {
    if (fs.isDir(pj(root, 'tasks'))) return fs.ls(pj(root, 'tasks')).filter((t) => fs.isDir(pj(root, 'tasks', t))).map((t) => ({ id: t, name: t, dir: pj(root, 'tasks', t), jobs: fs.ls(pj(root, 'tasks', t, 'jobs')).filter((j) => fs.isDir(pj(root, 'tasks', t, 'jobs', j))).map((j) => ({ id: j, dir: pj(root, 'tasks', t, 'jobs', j) })) }));
    const byTask = new Map();
    for (const job of fs.ls(root)) for (const trial of fs.ls(pj(root, job))) {
      const d = pj(root, job, trial);
      if (!fs.isDir(d)) continue;
      const res = json(pj(d, 'result.json'));
      if (!res && !fs.isDir(pj(d, 'agent'))) continue;
      const name = res?.task_name ?? trial.replace(/__[^_]+$/, '');
      const id = name.replace(/[\/:]/g, '__');
      const dir = [tasksDir && pj(tasksDir, name.split('/').pop()), res?.task_id?.path].find((p) => p && fs.isDir(p)) ?? null;
      (byTask.get(id) ?? byTask.set(id, { id, name, dir, jobs: [] }).get(id)).jobs.push({ id: `${job}/${trial}`, dir: d });
    }
    return [...byTask.values()];
  }

  function loadJob(taskId, jobId, jobDir) {
    const cfg = json(pj(jobDir, 'config.json')) ?? {};
    const res = json(pj(jobDir, 'result.json')) ?? {};
    const tr = readJson(pj(jobDir, 'agent/trajectory.json'));
    const traj = tr.value;
    const format = tr.error && tr.error !== 'empty' ? 'invalid' : !traj ? 'empty' : Array.isArray(traj) ? (traj.length ? 'stub' : 'empty') : traj.steps ? (traj.steps.length ? 'atif' : 'empty') : traj.messages ? 'messages' : 'unknown';
    const steps = enrich({ atif: fromATIF, stub: fromStub, messages: fromMessages }[format]?.(traj) ?? []);
    const subagents = format === 'atif' ? (traj.subagent_trajectories ?? []).map((t, k) => ({ id: t.trajectory_id ?? t.session_id ?? `sub-${k + 1}`, agent: t.agent?.name ?? null, model: t.agent?.model_name ?? null, steps: enrich(fromATIF(t)) })) : [];
    const cfgAgent = cfg.agent?.name ?? res.config?.agent?.name ?? null;
    const agentRaw = traj?.agent?.name ?? res.agent_info?.name ?? cfgAgent ?? null;
    const fm = traj?.final_metrics, ar = res.agent_result ?? traj?.metrics;
    const tools = {}, families = {};
    for (const c of steps.flatMap((s) => s.calls)) { tools[c.name] = (tools[c.name] ?? 0) + 1; const f = familyOf(c.name); families[f] = (families[f] ?? 0) + 1; }
    const times = steps.map((s) => s.ts).filter(Boolean);
    const rewardTxt = num((fs.read(pj(jobDir, 'verifier/reward.txt')) ?? '').trim() || null);
    const rewardJson = json(pj(jobDir, 'verifier/reward.json'));
    const numeric = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([, v]) => num(v) != null).map(([k, v]) => [k, Number(v)])) : null);
    const rewards = numeric(res.verifier_result?.rewards) ?? (rewardTxt != null ? { reward: rewardTxt } : null) ?? numeric(rewardJson);
    const reward = num(rewards?.reward ?? rewardTxt ?? (rewards ? Object.values(rewards)[0] : null));
    const ctrf = json(pj(jobDir, 'verifier/ctrf.json'))?.results;
    const phase = (k) => (res[k]?.started_at && res[k]?.finished_at ? Math.round((ts(res[k].finished_at) - ts(res[k].started_at)) / 1000) : null);
    const latencies = (res.agent_result?.metadata?.api_request_times_msec ?? []).map((x) => Math.round(x));
    const sorted = [...latencies].sort((a, b) => a - b), pct = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);
    const summary = {
      id: jobId, file: `${taskId}__${jobId.replace(/\//g, '~')}`, dir: relRoot(jobDir), task: taskId,
      agent: agentId(agentRaw) ?? '', agentRaw, model: cfg.agent?.model_name ?? res.agent_info?.model_info?.name ?? traj?.agent?.model_name ?? '',
      modelRaw: traj?.agent?.model_name ?? res.agent_info?.model_info?.name ?? null,
      agentConflict: cfgAgent && agentId(cfgAgent) !== agentId(agentRaw) ? cfgAgent : null,
      reward, rewards, status: res.status ?? null, format, parseError: tr.error && tr.error !== 'empty' ? tr.error : null,
      exception: res.exception_info ? { type: res.exception_info.exception_type, message: String(res.exception_info.exception_message ?? '').slice(0, 400) } : null,
      nSteps: steps.length, nAgentSteps: steps.filter((s) => s.source === 'agent').length,
      nToolCalls: steps.reduce((n, s) => n + s.calls.length, 0), nErrors: steps.filter((s) => s.error).length, nApiErrors: steps.filter((s) => s.flags.includes('api-error')).length,
      nSubagents: subagents.length, nCopied: steps.filter((s) => s.flags.includes('copied')).length, nMedia: steps.reduce((n, s) => n + s.media.length + s.obs.reduce((m, o) => m + o.media.length, 0), 0),
      multiStep: res.step_results?.length ?? 0,
      tokens: { prompt: fm?.total_prompt_tokens ?? ar?.n_input_tokens ?? ar?.total_input_tokens ?? null, completion: fm?.total_completion_tokens ?? ar?.n_output_tokens ?? ar?.total_output_tokens ?? null, cached: fm?.total_cached_tokens ?? ar?.n_cache_tokens ?? null },
      costUsd: fm?.total_cost_usd ?? ar?.cost_usd ?? null,
      startedAt: res.started_at ?? (times[0] ? new Date(Math.min(...times)).toISOString() : null),
      durationSec: phase('agent_execution') ?? (times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 1000) : null),
      phases: ['environment_setup', 'agent_setup', 'agent_execution', 'verifier'].map(phase),
      tools, families, kinds: Object.fromEntries(['explore', 'edit', 'shell', 'verify', 'plan', 'tool', 'gui', 'talk', 'finish'].map((k) => [k, steps.filter((s) => s.kind === k).length]).filter(([, n]) => n)),
      filesWritten: uniq(steps.flatMap((s) => s.writes.filter((w) => !w.failed).map((w) => w.path))),
      nRepeats: steps.filter((s) => s.repeat).length, suspicious: steps.flatMap((s) => s.suspicious ?? []).reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {}),
      hasVerify: steps.some((s) => s.kind === 'verify'), maxErrorStreak: steps.reduce((acc, s) => { acc.cur = s.error ? acc.cur + 1 : 0; acc.max = Math.max(acc.max, acc.cur); return acc; }, { cur: 0, max: 0 }).max,
      tests: ctrf ? { total: ctrf.summary?.tests ?? ctrf.tests?.length ?? 0, passed: ctrf.summary?.passed ?? 0, failed: ctrf.summary?.failed ?? 0 } : null,
      artifacts: fs.isDir(pj(jobDir, 'artifacts')) ? walk(pj(jobDir, 'artifacts')).filter((a) => a.path !== 'manifest.json') : [],
      artifactsFailed: (json(pj(jobDir, 'artifacts/manifest.json')) ?? []).filter((m) => m.status && m.status !== 'ok' && m.destination !== 'artifacts').map((m) => m.destination),
      agentVersion: traj?.agent?.version ?? res.agent_info?.version ?? null, provider: res.agent_info?.model_info?.provider ?? null,
      modelsUsed: uniq(steps.map((s) => s.model).filter((m) => m && m !== '<synthetic>')), toolDefCount: (traj?.agent?.tool_definitions ?? []).length,
      latency: latencies.length ? { n: latencies.length, median: pct(0.5), p95: pct(0.95) } : null,
      episodes: res.agent_result?.metadata?.n_episodes ?? null, summarizations: res.agent_result?.metadata?.summarization_count ?? null,
    };
    const detail = {
      apiLatencies: latencies.slice(0, 2000), tests: ctrf ? (ctrf.tests ?? []).map((t) => ({ name: t.name, status: t.status, message: t.message ?? null })) : null,
      toolDefs: (traj?.agent?.tool_definitions ?? []).map((d) => ({ name: d.function?.name ?? d.name, description: (d.function?.description ?? d.description ?? '').slice(0, 300) })).filter((d) => d.name),
      trajMeta: traj && !Array.isArray(traj) ? { schema_version: traj.schema_version, session_id: traj.session_id, trajectory_id: traj.trajectory_id, notes: traj.notes, final_metrics: traj.final_metrics, continued_trajectory_ref: traj.continued_trajectory_ref, extra: traj.extra, agent: traj.agent && { ...traj.agent, tool_definitions: undefined } } : null,
      result: res, subagents,
    };
    return { summary, steps, detail };
  }

  function containerFs(dir, envFiles) {
    const df = dir && fs.read(pj(dir, 'environment/Dockerfile'));
    if (!df) return { workdir: null, files: [] };
    const names = envFiles.map((f) => f.path);
    const glob = (p) => (p === '' ? names : names.filter((n) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '(/|$)').test(n)));
    let wd = '/'; const out = [];
    for (const raw of df.replace(/\\\n/g, ' ').split('\n')) {
      const m = raw.trim().match(/^(WORKDIR|COPY|ADD)\s+(.*)$/i);
      if (!m) continue;
      if (m[1].toUpperCase() === 'WORKDIR') { wd = m[2].trim().startsWith('/') ? m[2].trim() : pj(wd, m[2].trim()); continue; }
      if (/--from=/.test(m[2])) continue;
      const toks = m[2].split(/\s+/).filter((t) => t && !t.startsWith('--'));
      if (toks.length < 2) continue;
      const dest = toks.pop(), absDest = dest.startsWith('/') ? dest : pj(wd, dest);
      for (const src of toks) {
        const clean = src.replace(/^\.\/?/, '').replace(/\/$/, '');
        const matched = glob(clean);
        const dirLike = clean === '' || dest.endsWith('/') || toks.length > 1 || /\*/.test(src) || matched.some((n) => n.startsWith(clean + '/'));
        for (const n of matched) {
          const rel = clean === '' ? n : n.startsWith(clean + '/') ? n.slice(clean.length + 1) : base(n);
          out.push({ container: dirLike ? pj(absDest, rel) : absDest, source: n });
        }
      }
    }
    return { workdir: wd, files: [...new Map(out.map((f) => [f.container, f])).values()] };
  }

  // Verifier mechanism: ids, inferred from the files that are present (the UI labels them and says they are inferred).
  function verifierOf(dir, toml, tests, env, jobs) {
    const has = (rx) => tests.some((f) => rx.test(f.path));
    const sh = fs.read(pj(dir, 'tests/test.sh')) ?? '';
    const cfg = fs.read(pj(dir, 'tests/verifier_config.json')) ?? '';
    const kinds = [
      /pytest|junit|ctrf|unittest/.test(sh) && 'unit-tests', /npm test|yarn test|vitest|jest|go test|cargo test/.test(sh) && 'native-tests',
      /oracle|expected/.test(cfg) && 'oracle-diff', has(/metadata\.json$/) && /fail_to_pass/.test(fs.read(pj(dir, 'tests/metadata.json')) ?? '') && 'fail-to-pass',
      env.some((f) => f.path === 'task.json') && /extract_state_script|checklist/.test(fs.read(pj(dir, 'environment/task.json')) ?? '') && 'checklist',
      has(/harbor_task_meta\.json$/) && 'threshold', has(/^checks\.py$|structural/) && 'structural', has(/^judge\//) && 'llm-judge', has(/grader|rubric\.ya?ml/) && 'rubric-tree',
      fs.isDir(pj(dir, 'rubrics')) && 'stage-rubrics', /State-based|state-check/i.test(cfg) && 'state-check',
    ].filter(Boolean);
    const rs = jobs.map((j) => j.summary.reward).filter((x) => x != null);
    const llm = kinds.includes('llm-judge') || /JUDGE_MODEL|OPENAI_API_KEY|ANTHROPIC_API_KEY/.test(fs.read(pj(dir, 'task.toml')) ?? '') ? true : kinds.length ? false : null;
    return { kinds, llmJudge: llm, timeoutSec: toml.verifier?.timeout_sec ?? null,
      rewardShape: !rs.length ? 'none' : rs.every((x) => x === 0 || x === 1) ? 'binary' : 'graded', rewardRange: rs.length ? [Math.min(...rs), Math.max(...rs)] : null,
      namedRewards: uniq(jobs.flatMap((j) => Object.keys(j.summary.rewards ?? {}))), testShHead: sh.split('\n').slice(0, 20).join('\n') };
  }

  const flatten = (obj, skip = [], prefix = '') => Object.entries(obj ?? {}).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (skip.includes(key)) return [];
    if (Array.isArray(v)) return v.every((x) => typeof x !== 'object') ? [[key, v.join(', ')]] : v.flatMap((x, i) => flatten(x, skip, `${key}[${i}]`));
    if (v && typeof v === 'object') return flatten(v, skip, key);
    return [[key, String(v)]];
  });

  const manifestFile = fs.ls(root).find((n) => /manifest.*\.json$/i.test(n));
  const manifestRows = manifestFile ? json(pj(root, manifestFile)) : null;
  const manifest = Object.fromEntries((Array.isArray(manifestRows) ? manifestRows : []).map((m) => [m.task ?? m.name ?? m.id, m.vendor_group ?? m.vendor ?? m.provider ?? m.source ?? m.author ?? null]));

  function loadTask({ id, name, dir, jobs: jobDirs }) {
    const jobs = jobDirs.map((j) => loadJob(id, j.id, j.dir));
    let toml = {};
    try { toml = dir && fs.read(pj(dir, 'task.toml')) ? parseToml(fs.read(pj(dir, 'task.toml'))) : {}; } catch { toml = {}; }
    const meta = { ...(toml.metadata ?? {}), ...(toml.task ?? {}) };
    const groups = ['environment', 'solution', 'tests'];
    const files = dir ? Object.fromEntries([...groups.map((g) => [g, fs.isDir(pj(dir, g)) ? walk(pj(dir, g)) : []]), ['other', fs.ls(dir).filter((n) => ![...groups, 'jobs', 'task.toml', 'instruction.md'].includes(n)).flatMap((n) => (fs.isDir(pj(dir, n)) ? walk(pj(dir, n), dir) : [{ path: n, ext: extOf(n), bytes: fs.size(pj(dir, n)) }]))]]) : { environment: [], solution: [], tests: [], other: [] };
    const fam = {}; for (const j of jobs) for (const [k, v] of Object.entries(j.summary.families)) fam[k] = (fam[k] ?? 0) + v;
    const verifier = dir ? verifierOf(dir, toml, files.tests, files.environment, jobs) : { kinds: [], llmJudge: null, timeoutSec: null, rewardShape: 'none', rewardRange: null, namedRewards: [], testShHead: '' };
    const source = manifest[id] ?? manifest[name] ?? null;
    const difficulty = typeof meta.difficulty === 'string' && meta.difficulty.length <= 24 ? meta.difficulty : null;
    const { testShHead, ...verifierSummary } = verifier;
    const task = {
      id, name: meta.name ?? name ?? id, dir: dir ? relRoot(dir) : null, category: meta.category ?? null, difficulty, modality: meta.modality ?? null,
      tags: (meta.tags ?? meta.keywords ?? []).filter((x) => typeof x === 'string'), description: typeof meta.description === 'string' && meta.description !== id && meta.description !== meta.name ? meta.description : null,
      mcpServers: (toml.environment?.mcp_servers ?? []).map((m) => m.name), verifier: verifierSummary, agentTimeoutSec: toml.agent?.timeout_sec ?? null,
      vendor: source ?? toml.task?.authors?.[0]?.name ?? toml.metadata?.author_name ?? toml.metadata?.authors?.[0] ?? null, sourceField: source ? 'manifest' : toml.task?.authors?.[0]?.name ? 'task.authors' : toml.metadata?.author_name ? 'metadata.author_name' : toml.metadata?.authors?.[0] ? 'metadata.authors' : null,
      families: fam, nFiles: { environment: files.environment.length, solution: files.solution.length, tests: files.tests.length, other: files.other.length }, jobs: jobs.map((j) => j.summary),
    };
    const detail = { id, instruction: (dir && fs.read(pj(dir, 'instruction.md'))) ?? '', tomlRaw: dir ? fs.read(pj(dir, 'task.toml')) : null, metaFlat: flatten(toml, ['task.name', 'task.description', 'metadata.description', 'metadata.tags', 'task.keywords', 'metadata.category', 'metadata.difficulty', 'task.category', 'task.difficulty']), files, container: containerFs(dir, files.environment), testShHead };
    return { task, detail, jobs };
  }

  const loaded = discover().map(loadTask);
  const all = loaded.flatMap((t) => t.task.jobs);
  const count = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
  const quality = {
    jobs: all.length, formats: count(all, (j) => j.format),
    rewardMissing: all.filter((j) => j.reward === null).map((j) => `${j.task}/${j.id}`),
    agentConflicts: all.filter((j) => j.agentConflict).map((j) => `${j.task}/${j.id}: config=${j.agentConflict} trajectory=${j.agentRaw}`),
    exceptions: all.filter((j) => j.exception).map((j) => `${j.task}/${j.id}: ${j.exception.type}`),
    invalid: all.filter((j) => j.format === 'invalid').map((j) => `${j.task}/${j.id}: ${j.parseError}`),
    zeroSignalTasks: loaded.filter((t) => { const r = t.task.jobs.map((j) => j.reward).filter((x) => x != null); return r.length > 1 && new Set(r).size === 1; }).map((t) => t.task.id),
    tasksWithoutDefinition: loaded.filter((t) => !t.task.dir).map((t) => t.task.id),
  };
  return { index: { generatedAt: new Date().toISOString(), root, dataset: base(root) || 'root', tasks: loaded.map((t) => t.task), quality }, tasks: loaded.map((t) => ({ id: t.task.id, detail: t.detail })), jobs: loaded.flatMap((t) => t.jobs) };
}
