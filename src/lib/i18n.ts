import { useEffect, useState } from 'react';

/**
 * Minimal UI-string i18n. Source strings are Chinese (the keys); `t()` returns the English entry when the
 * interface language is "en" and falls back to the key otherwise. Data content (instructions, trajectories,
 * annotations) is never translated. `{x}` placeholders are substituted from `vars`.
 */
export type Lang = 'zh' | 'en';
const KEY = 'harbor-viz.lang';
let lang: Lang = 'zh';
try { lang = (localStorage.getItem(KEY) as Lang) || (navigator.language.startsWith('zh') ? 'zh' : 'en'); } catch { /* ignore */ }
const subs = new Set<() => void>();
export const getLang = () => lang;
export const setLang = (l: Lang) => { lang = l; try { localStorage.setItem(KEY, l); } catch { /* ignore */ } document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'; subs.forEach((f) => f()); };
export function t(key: string, vars?: Record<string, string | number>) {
  let s = lang === 'en' ? (EN[key] ?? key) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
export function useT() { const [, tick] = useState(0); useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []); return t; }

const EN: Record<string, string> = {
  // main.tsx
  '数据浏览': 'Data', '清单 · 完整度 · reward · 判卷 · 来源': 'inventory · completeness · reward · verifiers · sources', '轨迹探索': 'Trajectories', '任务 · 逐步过程 · 文件 · 对比': 'task · steps · files · compare',
  '标注台': 'Annotation', '队列 · 归因 · 偏好 · 导出': 'queue · attribution · preference · export', '任务': 'Task', '输入任务名筛选…': 'Filter tasks by name…', '选择任务…': 'Select task…', '运行': 'Run', '选择运行…': 'Select run…',
  '选择第二条…': 'Select second run…', '切换界面语言（不改变数据内容）': 'Switch interface language (data is not translated)', '中': 'medium', '数据无法加载': 'Data could not be loaded',
  '先运行 npm run ingest，或上传一个 zip。': 'Run npm run ingest first, or upload a zip.',
  // components/SubNav.tsx
  '请在顶部选择{what}。': 'Select {what} in the top bar.',
  // components/Upload.tsx
  '读取 zip…': 'Reading zip…', '解析失败': 'Failed to parse', '当前数据来自上传的 zip；刷新页面后需重新上传。标注保存在浏览器本地。': 'Data comes from an uploaded zip; re-upload after a page refresh. Annotations are kept in this browser.',
  '恢复默认数据': 'back to the default data',
  '上传一个 zip：内容为 tasks/<task>/jobs/<job>/ 或 Harbor 的 jobs/<job>/<trial>/ 布局，浏览器内解析，不上传到任何服务器': 'Upload a zip laid out as tasks/<task>/jobs/<job>/ or Harbor jobs/<job>/<trial>/; parsed in the browser, never sent to a server',
  '上传 zip': 'Upload zip',
  // components/Paged.tsx
  '共 {n} 条': '{n} rows', '无': 'none', '收起': 'collapse', '还有 {n} 条': '{n} more', '下载完整清单': 'download full list',
  // components/FileViewer.tsx
  '选择左侧文件查看内容': 'select a file on the left', '文件超过 {n}，不在页面内显示': 'File is larger than {n}; not shown inline', '二进制文件': 'binary file', '打开': 'open', '加载中…': 'Loading…',
  // components/Step.tsx
  '用户': 'User', '系统': 'System', '探索': 'explore', '编辑': 'edit', '命令': 'shell', '验证': 'verify', '规划': 'plan', '其他工具': 'other tool', '对话': 'talk', '收尾': 'finish', '展开全部 {n} 字符': 'expand all {n} chars',
  'API 错误': 'API errors', '与上一步完全相同的动作（同工具同参数）': 'identical to the previous action (same tool, same arguments)', '重复动作': 'repeated action', '从输出文本推断的报错': 'error inferred from the output text',
  '工具返回标记为错误': 'tool result flagged as an error', '疑似报错': 'possible error', '写': 'W', '改': 'M', '删': 'D', '该调用失败，未计入': 'this call failed; not applied', '{n} 次 LLM 调用': '{n} LLM calls',
  '输入 / 输出 token': 'input / output tokens', '隐藏推理': 'hide reasoning', '推理 {n} 字符': 'reasoning, {n} chars', '委托子 agent': 'delegated to subagent',
  // components/StepTools.tsx
  '给这一步打分；量表自定，导出时原样保留': 'score this step on any scale you choose; exported as-is', '旗标': 'flag', '备注…': 'Notes…', '备注': 'notes',
  // components/Chat.tsx
  '子 agent': 'subagents', '写入': 'write', '修改': 'edit', '删除': 'delete', '思考': 'thinking', '字符': 'chars', '在右侧查看 {p}': 'open {p} on the right', '助手': 'Assistant',
  '{a} 次模型调用 · {b} 次工具调用': '{a} model calls · {b} tool calls',
  // components/Timeline.tsx
  '写入文件': 'files written', '含报错': 'has errors', '可疑操作': 'suspicious actions',
  // components/Workspace.tsx
  '工作区': 'Workspace', '{n} 个文件有变化': '{n} files changed', '拖动回放任意步骤时的文件状态': 'drag to replay the file state at any step',
  '滚动对话时自动把文件树同步到视野中的那一步': 'while scrolling, sync the file tree to the step in view', '跟随滚动': 'follow scroll', '第 {n} 步时的文件树': 'file tree at step {n}', '新增': 'added',
  '文件树由 Dockerfile 的 COPY 规则和轨迹中的写入推断，不是容器快照': 'The file tree is inferred from the Dockerfile COPY rules and the writes in the trajectory; it is not a container snapshot', '推断': 'inferred',
  '没有可重建的文件：Dockerfile 无 COPY 规则且轨迹中无写入。': 'Nothing to rebuild: no COPY rules in the Dockerfile and no writes in the trajectory.',
  '在左侧文件树里选一个文件，或点击对话里的文件芯片。': 'Pick a file in the tree on the left, or click a file chip in the chat.', '初始文件': 'initial file', '替换': 'replace',
  '第 {i} 步后的内容（截至第 {n} 步）': 'content after step {i} (as of step {n})', '有后续修改未能应用': 'later edits could not be applied', '已删除': 'deleted',
  '初始内容（agent 开始前）': 'initial content (before the agent started)', '打开二进制文件': 'open binary file', '只有 shell 修改记录，没有内容快照。': 'Only shell edits recorded; no content snapshot.',
  // lib/data.ts
  '完整': 'full', '完整·转换': 'full (converted)', '概要': 'summary', '空': 'empty', '无法解析': 'unparsable', '终端': 'terminal', '文件工具': 'file tools', 'GUI 操作': 'GUI', '浏览器': 'browser',
  'MCP / 自定义工具': 'MCP / custom tools', '改动了测试或判卷文件': 'edited test or verifier files', '写入了判卷输出': 'wrote verifier output', '翻看 git 历史': 'dug through git history', '跳过或屏蔽测试': 'skipped or masked tests',
  '访问外网': 'reached the network', '单元测试': 'unit tests', '语言原生测试': 'language-native tests', '与标准答案文件比对': 'diff against oracle file', 'fail_to_pass 测试': 'fail-to-pass tests',
  '终态 checklist 加权': 'weighted end-state checklist', '指标阈值判定': 'metric threshold', '结构检查脚本': 'structural checks', 'LLM judge 评审': 'LLM judge (rubric)', 'rubric 树评分': 'rubric tree (re-run)',
  '逐 stage rubric 检查': 'per-stage rubrics', '模拟系统状态检查': 'mock-system state check', '运行 pytest 等单元测试，按通过情况给分': 'runs unit tests (pytest etc.) and scores by passes',
  '运行仓库自带的测试命令（npm test / vitest / go test 等）': 'runs the repository\'s own test command (npm test / vitest / go test …)',
  '把 agent 产出的文件与出题人提供的标准答案逐项比对': 'compares the produced file with the author\'s oracle, item by item',
  'SWE-bench 式判定：指定的测试在修改前失败、修改后必须通过': 'SWE-bench style: named tests must fail before the change and pass after',
  '用脚本读取最终状态，对照加权清单逐项打分': 'a script reads the end state and scores it against a weighted checklist', '计算一个指标（如成本或完工时间），与阈值比较': 'computes a metric (cost, makespan …) and compares it to a threshold',
  '检查产出文件的结构是否齐全（工作表、列名、章节等）': 'checks the structure of the output (sheets, columns, sections …)', '由大模型按 rubric 评审产出质量': 'an LLM grades the output against a rubric',
  '重跑复现脚本后按 rubric 树逐项打分': 're-runs the reproduction script, then scores a rubric tree', '多阶段任务，每个阶段一组程序化检查': 'multi-stage task with programmatic checks per stage',
  '检查模拟系统（邮件、数据库等）的最终状态': 'checks the final state of mock systems (mail, databases …)',
  // lib/annotations.ts
  '主要失败模式': 'primary failure mode', '违反任务要求': 'violated the spec', '重复无效步骤': 'repeated futile steps', '未察觉应当结束': 'unaware it should stop', '上下文丢失': 'lost context', '过早终止': 'stopped too early',
  '未做验证或验证无关': 'no or irrelevant verification', '推理与行动不一致': 'reasoning–action mismatch', '验证不充分': 'weak', '根因类别': 'root-cause class', '认知：信息缺失或误判': 'epistemic: missing or wrong information',
  '能力：知道该做什么但做不好': 'competence: knew what to do, could not do it', '环境：工具或环境问题': 'environment: tool or environment problem', '任务本身的问题': 'problem with the task itself', '题面歧义': 'ambiguous instruction',
  '环境损坏': 'broken environment', '判卷有误': 'wrong verifier', '轨迹不完整': 'incomplete trajectory', '判卷正确': 'verifier correct', '误判为通过': 'false pass', '误判为失败': 'false fail', '判卷不稳定': 'flaky verifier',
  '疑似泄题': 'suspected leakage', '改测试': 'edited tests', '硬编码或特判': 'hard-coded / special-cased', '从 git 历史拿答案': 'took the answer from git history', '篡改判卷': 'tampered with the verifier', '其他': 'other',
  '没有验证': 'none', '验证充分': 'adequate', '值得看': 'notable', '出错点': 'error', '关键决策': 'decision', '危险操作': 'danger', '推理有误': 'bad reasoning',
  // lib/zipSource.ts
  'zip 里没有文件': 'the zip contains no files', '已解析 {n} 个文本文件…': '{n} text files parsed…', '归一化…': 'Normalising…',
  // pages/Overview.tsx
  '无判分': 'unscored', '通过': 'pass', '均值': 'mean',
  '每次运行的轨迹文件：完整 = 逐步轨迹；概要 = 只有几步概要；空 = 没有轨迹只有分数': 'trajectory file per run: full = step-by-step; summary = a few summarised steps; empty = no trajectory, only a score', '轨迹完整': 'full trajectories',
  '轨迹': 'Trajectory', '来源：数据包清单中的提供方，或 task.toml 的作者': 'source: the provider named in the pack manifest, or the task.toml authors', '{n} 次运行': '{n} runs', '{n} 个产物': '{n} artifacts',
  '{a} 个任务 · {b} 次运行 · 生成于 {c}': '{a} tasks · {b} runs · generated {c}', '有完整轨迹的运行': 'runs with a full trajectory',
  'reward：满分 {a} · 部分 {b} · 零分 {c} · 无判分 {d}': 'reward: full {a} · partial {b} · zero {c} · unscored {d}', '平均 reward，先按任务平均（{n} 个有判分任务）': 'mean reward, averaged per task first ({n} scored tasks)',
  '二值任务和分数任务一起平均，只作粗略参考': 'binary and graded tasks averaged together; a rough figure only', '输入 token（仅完整轨迹）': 'input tokens (full trajectories only)', '花费（仅有记录的运行）': 'cost (runs with a record only)',
  '筛选任务…': 'Filter tasks…', '排序': 'sort', '运行数': 'runs', '名称': 'name', '每个方块一次运行：': 'one square per run:', '最高': 'highest', '中间': 'middle', '最低': 'lowest', '未分类': 'uncategorized',
  '{a} 个任务 · {b} 次运行': '{a} tasks · {b} runs', '没有任务。': 'No tasks.',
  // pages/Quality.tsx
  '完整轨迹': 'full trajectories', '对话格式（已转换）': 'conversation format (converted)', '只有概要': 'summary only', '空文件': 'empty files', '未知': 'unknown', '按任务计数（前 8）': 'count by task (top 8)', '明细': 'details',
  '无法解析的轨迹': 'unparsable trajectories', '轨迹文件不是合法 JSON。': 'The trajectory file is not valid JSON.', 'agent 字段冲突': 'agent field conflicts',
  'config.json 里写的 agent 与轨迹文件实际记录的 agent 不一致。以轨迹为准。': 'The agent in config.json differs from the one recorded in the trajectory. The trajectory wins.', '无 reward 的运行': 'runs without reward',
  '没有判分结果。': 'No verifier result.', '零区分度任务': 'zero-spread tasks', '所有有判分的运行得分相同。': 'Every scored run has the same reward.', '运行时异常': 'runtime exceptions',
  'result.json 里有 exception_info。': 'result.json carries exception_info.', '缺少任务定义': 'missing task definitions',
  '只有运行记录，没有任务目录（Harbor 原生布局下用 --tasks 指定）。': 'Runs without a task directory (pass --tasks for native Harbor layouts).', '完整度': 'Completeness', '导入时发现的问题。': 'Issues found during import.',
  '逐任务': 'Per task', '搜索…': 'Search…', '问题数': 'issues', '完整比例': 'full ratio', '来源': 'source', '轨迹文件': 'trajectory files', '平均 reward': 'mean reward', '未发现': 'not found',
  // pages/Check.tsx
  '每个任务的 reward 分布与区分度': 'Reward distribution and spread per task', '区分度是 reward 的标准差。为 0 的任务无法区分运行。': 'Spread is the standard deviation of reward. A task at 0 cannot tell its runs apart.',
  '有判分': 'scored', '标准差': 'std', '区间': 'range', '分布': 'distribution', '判断': 'verdict', '单次运行': 'single run', '无区分度': 'no spread', '弱': 'weak', '有信号': 'signal', '成本 vs reward': 'Cost vs reward',
  '每点一次运行，横轴对数刻度，颜色为任务': 'one point per run, log-scale x, color = task', '没有运行带有成本数据。': 'No run has cost data.', '{n} 次运行有成本数据。': '{n} runs have cost data.', '0/1 二值': 'binary 0/1', '分数': 'score',
  '判卷方式': 'How rewards are produced',
  'reward 由任务的 tests/ 在 agent 结束后产生。下表的机制由文件名推断，可能不全；点任务可看原始判卷脚本。': 'Rewards are produced by the task\'s tests/ after the agent finishes. The mechanisms below are inferred from file names and may be incomplete; open a task to see the verifier script.',
  '分数形态': 'score shape', '判卷机制': 'mechanism', 'LLM 参与': 'LLM judge', '判卷时限': 'verifier time limit', '命名分数': 'named rewards', '未识别': 'unrecognized', '是': 'yes', '否': 'no', '术语说明': 'Glossary',
  'task.toml 的 verifier.timeout_sec：判卷脚本允许运行的最长时间': 'verifier.timeout_sec in task.toml: how long the verifier script may run', 'agent 运行时限': 'agent time limit',
  'task.toml 的 agent.timeout_sec：Harbor 允许 agent 运行的最长时间，超过即终止本次运行': 'agent.timeout_sec in task.toml: how long Harbor lets the agent run before the run is killed', '未知来源': 'unknown source',
  '按来源': 'By source', '每个来源的数据质量与人审结果。': 'Data quality and human verdicts per source.', '无 reward': 'no reward', 'agent 冲突': 'agent conflicts', '已标注': 'annotated', '人审结论': 'human verdicts',
  '判卷有问题': 'verifier issues', '正确': 'correct', '错误': 'incorrect', '清单': 'Inventory', '信号': 'signals', '判卷': 'verifier',
  // pages/Task.tsx
  'agent × model 矩阵': 'agent × model matrix', '每个方块一次运行，点击进入轨迹': 'one square per run; click to open the trajectory', '运行列表': 'Runs', '点表头排序，点行进入轨迹': 'click a header to sort, a row to open',
  '步数': 'steps', '工具调用': 'tool calls', '报错': 'errors', '输入 token': 'input tokens', '花费': 'cost', '时长': 'duration', '产物': 'Artifacts', '冲突': 'conflict',
  'Dockerfile 里没有 COPY / ADD 规则，起始文件系统无法从任务定义推断。': 'The Dockerfile has no COPY / ADD rules; the initial file system cannot be inferred from the task definition.', '工作目录': 'working directory',
  '容器内路径': 'container paths', 'solution/ 与 tests/ 对 agent 不可见。': 'solution/ and tests/ are invisible to the agent.', '选择左侧文件查看 agent 开始时看到的内容': 'select a file to see what the agent saw at the start',
  '未找到任务': 'task not found', '类别': 'category', '难度': 'difficulty', '模态': 'modality', '取自': 'from', '由 tests/ 目录的文件名推断': 'inferred from the file names in tests/', '题面 instruction.md': 'instruction.md',
  '元信息 task.toml': 'metadata (task.toml)', '文件': 'Files', '没有任务目录。': 'No task directory.', '无 instruction.md': 'no instruction.md', '原始 task.toml': 'raw task.toml', '（无 task.toml）': '(no task.toml)',
  '任务目录': 'Task directory', 'agent 看到的容器文件': 'Container files as the agent saw them', '原始目录，含参考解与判卷程序': 'the original directory, with the reference solution and the verifier',
  '按 Dockerfile 的 COPY / ADD / WORKDIR 推断的起始文件布局': 'initial file layout inferred from the Dockerfile COPY / ADD / WORKDIR',
  // pages/Artifact.tsx
  '解析中…': 'Parsing…', '只显示前 {n} 行': 'first {n} rows only', '暂不支持预览': 'no preview for', '下载': 'download', '未找到运行': 'run not found', '这次运行没有产物文件。': 'This run has no artifacts.',
  '清单中 {n} 项收集失败': '{n} manifest entries failed to collect',
  // pages/Explore.tsx
  '对比': 'Compare', '第二条运行': 'a second run',
  // pages/Job.tsx
  '无逐步 token 数据': 'no per-step token data', '存疑': 'unclear', '保存失败': 'save failed', '保存中…': 'saving…', '已保存': 'saved', '运行级标注': 'Run annotation',
  '结论：agent 是否真的完成了任务': 'verdict: did the agent actually complete the task', '判卷审计：reward 与实际是否一致': 'verifier audit: does the reward match what actually happened',
  '三个步号：决定性错误发生在哪一步；从哪一步起已无法挽回；从哪一步起从输出里能看出不对': 'three step numbers: where the decisive error happened; from which step it became unrecoverable; from which step the output made it visible',
  '失败定位': 'failure localisation', '首个错误': 'first error', '无法挽回': 'lock-in', '首次可见': 'first visible', '是否钻了判卷的空子': 'did the run game the verifier', '证据步': 'evidence step',
  '验证质量': 'verification quality', '陷入重复循环': 'stuck in a loop', '多余或有副作用的操作': 'unnecessary or side-effect actions', '原始数据': 'Raw data', '子 agent 轨迹': 'subagent trajectories', '步': 'steps',
  '判卷用例': 'Test cases', '可用工具': 'tools available', '元信息': 'metadata', '标注': 'Annotate', '统计': 'Stats', '原始': 'Raw', '没有逐步轨迹，只有几步概要。': 'No step-by-step trajectory, only a short summary.',
  '没有轨迹文件，只有分数。': 'No trajectory file, only a score.', '轨迹文件无法解析。': 'The trajectory file could not be parsed.',
  '轨迹是原始对话格式，已转换；没有时间戳和逐步 token。': 'Raw conversation format, converted; no timestamps or per-step tokens.', '未知格式。': 'Unknown format.', '异常': 'exception',
  'config.json 与轨迹的 agent 不一致': 'config.json and trajectory disagree on the agent', 'config 写的是': 'config says',
  '整条轨迹没有识别到运行测试或检查的步骤；按工具名和命令推断': 'No step looks like running tests or checks; inferred from tool names and commands', '未检测到测试运行': 'no test run detected',
  '最长连续报错步数': 'longest run of consecutive errors', '连续报错': 'error streak', '上一条': 'prev', '下一条': 'next', '去标注': 'annotate', '去探索': 'explore', '多模态内容': 'media parts',
  'j 下一步，k 上一步': 'j next, k previous', '缓存输入': 'cached input', '未缓存输入': 'uncached input', '输出': 'output', '阶段耗时': 'Phases', '环境搭建': 'env setup', 'agent 启动': 'agent setup', 'agent 执行': 'agent run',
  '在 Harbor 里复现这次运行的命令': 'command to reproduce this run in Harbor', '正在查看子 agent 轨迹': 'Viewing subagent trajectory', '返回主轨迹': 'back to the main trajectory',
  '时间轴：同类动作合并为一段，宽度随步数增长；菱形是用户或系统消息；点击跳转': 'timeline: consecutive steps of one kind merge into a segment whose width grows with its length; diamonds are user / system messages; click to jump',
  'stepwise reward：按本条轨迹内的取值范围从红到绿着色，空白未标': 'stepwise reward: colored red→green over this run\'s value range; blank = unlabeled',
  '步骤类型由工具名和命令文本启发式推断，不是原始数据字段；点击可隐藏该类步骤': 'step kind is inferred from tool names and command text, not a field in the data; click to hide this kind', '搜索步骤…': 'Search steps…', '只看报错': 'errors only',
  '对话视图': 'Chat', '步骤视图': 'Steps', '无过程可看。': 'Nothing to show.', '模型与 harness': 'Model & harness', '运行中用到的模型': 'models used during the run', 'LLM 调用轮次': 'LLM calls', '上下文压缩': 'context summarizations',
  '查看': 'view', '每次 API 调用耗时': 'Latency per API call', '中位 {a} · p95 {b}': 'median {a} · p95 {b}', '上下文增长': 'Context growth', '工具使用': 'Tool usage',
  // pages/Compare.tsx
  '自动分歧点：两条运行从这里开始动作不同': 'auto divergence: the two runs act differently from here on', '左更好': 'left is better', '相当': 'tie', '右更好': 'right is better', '偏好标注': 'Preference',
  '两条运行从哪一步起走向不同结局；自动分歧点是第一个动作不同的步，决定性分歧可能更晚': 'where the two runs head for different outcomes; the auto point is the first differing action, the decisive one may be later',
  '决定性分歧步': 'decisive divergence step', '左': 'left', '右': 'right', '填入自动分歧点': 'use the automatic divergence', '为什么这一条更好？': 'Why is this one better?', '还没有选择哪条更好。': 'No winner chosen yet.',
  '自动分歧点': 'auto divergence', '动作完全相同': 'identical actions', '共同前缀 {n} 步': 'shared prefix of {n} steps', 'agent 步数': 'agent steps',
  '两条运行的 agent 或模型不同，自动分歧点只比较工具动作，参考意义有限。': 'The two runs use a different agent or model; the automatic divergence only compares tool actions and means little here.', '写入文件对照': 'Files written',
  '两条都没有可识别的写入': 'no recognizable writes in either run',
  // pages/Annotate.tsx
  '全部 reward': 'all rewards', '0 到 1 之间': 'between 0 and 1', '有轨迹': 'with trajectory', '全部轨迹': 'all trajectories', '全部状态': 'all states', '未标注': 'unannotated', '按信号排序': 'sort by signals',
  '按 reward 排序': 'sort by reward', '按任务排序': 'sort by task', '下一条未标注': 'next unannotated', '步骤标注': 'step labels', '状态': 'state', '结论': 'verdict', '归因': 'attribution', '重复': 'repeats',
  '可疑': 'suspicious', '没有符合条件的运行。': 'No runs match.', '尚无数据': 'no data yet', '{a} 条运行标注 · {b} 个步骤标注 · {c} 组偏好': '{a} run annotations · {b} step labels · {c} preferences', '导出 JSONL': 'Export JSONL',
  'stepwise reward 分布': 'stepwise reward distribution', '判卷审计': 'verifier audit', '步骤旗标': 'Step flags', '已标注运行': 'Annotated runs', '首个错误 / 无法挽回 / 首次可见': 'first error / lock-in / first visible',
  '钻空子': 'gaming', '还没有标注。': 'No annotations yet.', '队列': 'Queue', '运行标注': 'Annotate run', '统计与导出': 'Stats & export', '任务与运行': 'a task and a run',
};
