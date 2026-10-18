import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useIndex, useTaskDetail, useSel, packRel, useText, useUrl, fmtNum, fmtCost, fmtDur, fmtReward, hasFull, rewardCls, rewardRange, FORMAT_LABEL, VERIFIER_LABEL, VERIFIER_DESC, type JobSummary, type Task, type TaskDetail } from '../lib/data';
import { useT } from '../lib/i18n';
import { md } from '../lib/html';
import { FileBrowser } from '../components/FileViewer';
import { usePaged, Pager } from '../components/Paged';
import { Loading } from '../components/bits';

/** agent × model grid; each cell holds one square per run. */
function Matrix({ T, range }: { T: Task; range: [number, number] }) {
  const t = useT();
  const sel = useSel();
  const agents = [...new Set(T.jobs.map((j) => j.agent))], models = [...new Set(T.jobs.map((j) => j.model))];
  if (agents.length * models.length < 2) return null;
  const cells = new Map<string, JobSummary[]>();
  for (const j of T.jobs) (cells.get(`${j.agent}\u0000${j.model}`) ?? cells.set(`${j.agent}\u0000${j.model}`, []).get(`${j.agent}\u0000${j.model}`)!).push(j);
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <h2>{t('agent × model 矩阵')} <span className="faint" style={{ fontWeight: 400 }}>{t('每个方块一次运行，点击进入轨迹')}</span></h2>
      <table className="matrix">
        <thead><tr><th />{models.map((m) => <th key={m}>{m || '–'}</th>)}</tr></thead>
        <tbody>{agents.map((a) => (
          <tr key={a}><th>{a || '–'}</th>{models.map((m) => {
            const cell = cells.get(`${a}\u0000${m}`) ?? [];
            return <td key={m}>{cell.length ? <div className="dots">{cell.map((j) => <Link key={j.id} to={sel.href('/explore/trajectory', { j: j.id })} className={`dot lg ${rewardCls(j.reward, range)} ${hasFull(j) ? '' : 'thin'}`} title={`${j.id}\nreward ${j.reward ?? 'none'} · ${t(FORMAT_LABEL[j.format])}`} />)}</div> : <span className="faint">–</span>}</td>;
          })}</tr>))}
        </tbody>
      </table>
    </div>
  );
}

function JobsTable({ T, range }: { T: Task; range: [number, number] }) {
  const t = useT();
  const sel = useSel();
  const [sort, setSort] = useState<keyof JobSummary | 'tokens'>('reward');
  const key = (j: JobSummary) => sort === 'tokens' ? j.tokens.prompt ?? -1 : (j[sort] as number | string | null) ?? -1;
  const sorted = [...T.jobs].sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0));
  const p = usePaged(sorted, 50);
  const max = { steps: Math.max(1, ...T.jobs.map((j) => j.nAgentSteps)), calls: Math.max(1, ...T.jobs.map((j) => j.nToolCalls)), tok: Math.max(1, ...T.jobs.map((j) => j.tokens.prompt ?? 0)), cost: Math.max(0.001, ...T.jobs.map((j) => j.costUsd ?? 0)), dur: Math.max(1, ...T.jobs.map((j) => j.durationSec ?? 0)) };
  const Bar = ({ v, m, children }: { v: number | null; m: number; children: React.ReactNode }) => <td className="num databar"><i style={{ width: `${(100 * (v ?? 0)) / m}%` }} /><span>{children}</span></td>;
  const H = ({ k, label, num }: { k: typeof sort; label: string; num?: boolean }) => <th className={`${num ? 'num' : ''} ${sort === k ? 'sorted' : ''}`} onClick={() => setSort(k)} style={{ cursor: 'pointer' }}>{t(label)}</th>;
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="row"><h2>{t('运行列表')} <span className="faint" style={{ fontWeight: 400 }}>{t('点表头排序，点行进入轨迹')}</span></h2><span className="grow" /><Pager p={p} /></div>
      <table>
        <thead><tr><H k="agent" label="agent" /><H k="model" label="model" /><H k="reward" label="reward" num /><H k="format" label="轨迹" /><H k="nAgentSteps" label="步数" num /><H k="nToolCalls" label="工具调用" num /><H k="nErrors" label="报错" num /><H k="tokens" label="输入 token" num /><H k="costUsd" label="花费" num /><H k="durationSec" label="时长" num /><th>{t('产物')}</th></tr></thead>
        <tbody>{p.slice.map((j) => (
          <tr key={j.id}>
            <td><Link to={sel.href('/explore/trajectory', { j: j.id })}>{j.agent || '–'}</Link>{j.agentConflict && <span className="tag mid" title={`config.json: ${j.agentConflict}`} style={{ marginLeft: 6 }}>{t('冲突')}</span>}</td>
            <td className="muted">{j.model || '–'}</td>
            <td className="num"><span className={`dot ${rewardCls(j.reward, range)}`} style={{ display: 'inline-block', marginRight: 6, verticalAlign: -1 }} />{fmtReward(j.reward)}</td>
            <td><span className={`tag ${hasFull(j) ? '' : 'gray'}`}>{t(FORMAT_LABEL[j.format])}</span></td>
            <Bar v={j.nAgentSteps} m={max.steps}>{j.nAgentSteps || '–'}</Bar><Bar v={j.nToolCalls} m={max.calls}>{j.nToolCalls || '–'}</Bar>
            <td className={`num ${j.nErrors ? 'diff-hard' : ''}`}>{j.nErrors || '–'}</td>
            <Bar v={j.tokens.prompt} m={max.tok}>{fmtNum(j.tokens.prompt)}</Bar><Bar v={j.costUsd} m={max.cost}>{fmtCost(j.costUsd)}</Bar><Bar v={j.durationSec} m={max.dur}>{fmtDur(j.durationSec)}</Bar>
            <td className="muted">{j.artifacts.length || '–'}</td>
          </tr>))}
        </tbody>
      </table>
    </div>
  );
}

/** The container filesystem the agent starts in, reconstructed from Dockerfile COPY/ADD/WORKDIR rules. */
function AgentFs({ T, D }: { T: Task; D: TaskDetail }) {
  const t = useT();
  const [sel, setSel] = useState<{ container: string; source: string } | null>(null);
  const c = D.container;
  const bin = sel ? /\.(png|jpg|jpeg|gif|webp|pdf|xlsx|docx|pptx|zip|gz|sqlite)$/i.test(sel.source) : false;
  const rel = sel ? packRel(T, `environment/${sel.source}`) : null;
  const text = useText(sel && !bin ? rel : null);
  const url = useUrl(sel && bin ? rel : null);
  if (!c.files.length) return <p className="muted">{t('Dockerfile 里没有 COPY / ADD 规则，起始文件系统无法从任务定义推断。')}{c.workdir ? ` (${t('工作目录')} ${c.workdir})` : ''}</p>;
  return (
    <div className="files">
      <div className="tree">
        <div className="tree-h">{t('容器内路径')} <span className="faint">{c.files.length}</span>{c.workdir && <span className="faint" style={{ fontWeight: 400 }}> · {t('工作目录')} {c.workdir}</span>}</div>
        {c.files.map((f) => <a key={f.container} className={`tree-f ${sel?.container === f.container ? 'on' : ''}`} onClick={() => setSel(f)} title={`environment/${f.source}`}><span className="mono">{f.container}</span></a>)}
        <p className="faint" style={{ fontSize: 11, padding: '6px 8px' }}>{t('solution/ 与 tests/ 对 agent 不可见。')}</p>
      </div>
      <div className="preview">{!sel ? <p className="faint">{t('选择左侧文件查看 agent 开始时看到的内容')}</p> : bin ? <p className="muted">{t('二进制文件')} · {url.data && <a className="btn" href={url.data} target="_blank">{t('打开')}</a>}</p> : text.error ? <p className="tag bad">{text.error}</p> : text.data == null ? <p className="faint">{t('加载中…')}</p> : <pre>{text.data}</pre>}</div>
    </div>
  );
}

export default function TaskPage({ id }: { id: string }) {
  const t = useT();
  const { data: idx, error } = useIndex();
  const detail = useTaskDetail(id);
  const [tab, setTab] = useState<'instruction' | 'toml' | 'files'>('instruction');
  const [fsView, setFsView] = useState<'human' | 'agent'>('human');
  const T = idx?.tasks.find((x) => x.id === id);
  if (!idx) return <Loading error={error} />;
  if (!T) return <p className="notice bad">{t('未找到任务')} {id}</p>;
  const D = detail.data;
  const range = rewardRange(idx.tasks.flatMap((x) => x.jobs));
  const meta = ([['类别', T.category], ['难度', T.difficulty], ['模态', T.modality], ['来源', T.vendor, T.sourceField ? `${t('取自')} ${T.sourceField}` : undefined], ['MCP', T.mcpServers.join(', ') || null],
    ['判卷', T.verifier.kinds.length ? T.verifier.kinds.map((k) => <span key={k} className="tag gray" title={t(VERIFIER_DESC[k] ?? '')} style={{ marginRight: 3 }}>{t(VERIFIER_LABEL[k] ?? k)}</span>) : null, t('由 tests/ 目录的文件名推断')],
    ['agent 运行时限', T.agentTimeoutSec && `${Math.round(T.agentTimeoutSec / 60)} min`, t('task.toml 的 agent.timeout_sec：Harbor 允许 agent 运行的最长时间，超过即终止本次运行')],
    ['判卷时限', T.verifier.timeoutSec && `${Math.round(T.verifier.timeoutSec / 60)} min`, t('task.toml 的 verifier.timeout_sec：判卷脚本允许运行的最长时间')]] as [string, React.ReactNode, string?][]).filter(([, v]) => v);
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 6 }}><h1>{T.id}</h1>{T.name !== T.id && <span className="muted mono">{T.name}</span>}{T.tags.map((g) => <span key={g} className="tag gray">{g}</span>)}</div>
      {T.description && <p className="muted" style={{ marginTop: 0 }}>{T.description}</p>}
      <div className="row wrap" style={{ gap: 18, marginBottom: 16, fontSize: 13 }}>{meta.map(([k, v, tip]) => <span key={k} title={tip}><span className="faint" style={tip ? { borderBottom: '1px dotted var(--fg-3)', cursor: 'help' } : undefined}>{t(k)} </span>{v}</span>)}</div>
      <Matrix T={T} range={range} />
      <JobsTable T={T} range={range} />
      <div className="panel">
        <div className="row" style={{ marginBottom: 12 }}>
          {(['instruction', 'toml', 'files'] as const).map((k) => <a key={k} className={`btn ghost ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{{ instruction: t('题面 instruction.md'), toml: t('元信息 task.toml'), files: t('文件') }[k]}</a>)}
        </div>
        {!T.dir ? <p className="muted">{t('没有任务目录。')}</p> : !D ? <Loading error={detail.error} /> : (
          <>
            {tab === 'instruction' && (D.instruction ? <div className="md" dangerouslySetInnerHTML={{ __html: md(D.instruction) }} /> : <p className="faint">{t('无 instruction.md')}</p>)}
            {tab === 'toml' && (
              <>
                {D.metaFlat.length > 0 && <table style={{ maxWidth: 900, marginBottom: 12 }}><tbody>{D.metaFlat.map(([k, v]) => <tr key={k}><td className="mono muted" style={{ whiteSpace: 'nowrap' }}>{k}</td><td style={{ wordBreak: 'break-word' }}>{v}</td></tr>)}</tbody></table>}
                <details><summary className="more">{t('原始 task.toml')}</summary><pre>{D.tomlRaw ?? t('（无 task.toml）')}</pre></details>
                {D.testShHead && <details><summary className="more">tests/test.sh</summary><pre>{D.testShHead}</pre></details>}
              </>
            )}
            {tab === 'files' && (
              <>
                <div className="row" style={{ marginBottom: 10 }}>
                  <span className="seg">{(['human', 'agent'] as const).map((v) => <a key={v} className={fsView === v ? 'on' : ''} onClick={() => setFsView(v)}>{v === 'human' ? t('任务目录') : t('agent 看到的容器文件')}</a>)}</span>
                  <span className="faint" style={{ fontSize: 12 }}>{fsView === 'human' ? t('原始目录，含参考解与判卷程序') : t('按 Dockerfile 的 COPY / ADD / WORKDIR 推断的起始文件布局')}</span>
                </div>
                {fsView === 'human' ? <FileBrowser base={packRel(T, '')} groups={[{ label: 'environment', files: D.files.environment }, { label: 'solution', files: D.files.solution }, { label: 'tests', files: D.files.tests }, { label: '.', files: D.files.other }]} /> : <AgentFs T={T} D={D} />}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
