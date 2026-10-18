import { memo, useMemo, useState } from 'react';
import type { Step } from '../lib/data';
import { fmtNum } from '../lib/data';
import { useT } from '../lib/i18n';
import { md } from '../lib/html';
import { Clamp, MediaList, StepBadges } from './Step';
import { StepTools } from './StepTools';
import type { StepAnno } from '../lib/annotations';

const brief = (a: Record<string, unknown>) => { const c = a.command ?? a.keystrokes ?? a.cmd ?? a.file_path ?? a.path ?? a.query ?? a.message ?? Object.values(a)[0] ?? ''; return (Array.isArray(c) ? c.join(' ') : String(c)).split('\n')[0].slice(0, 90); };

function ToolRow({ s, k, resolve, matched }: { s: Step; k: number; resolve: (p: string) => string; matched: Set<number> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const c = s.calls[k];
  const obs = s.obs.filter((o, j) => { const hit = o.callId === c.id || (s.calls.length === 1 && !o.callId); if (hit) matched.add(j); return hit; });
  const err = obs.some((o) => o.error);
  return (
    <div className={`chat-tool ${err ? 'err' : ''}`}>
      <a onClick={(e) => { e.stopPropagation(); setOpen(!open); }}><span className="mono tool">{c.name}</span> <span className="mono muted">{brief(c.args ?? {})}</span>{obs.some((o) => o.subagents.length) && <span className="tag gray">{t('子 agent')}</span>}<span className="faint"> {open ? '▾' : '▸'}</span></a>
      {open && <div className="chat-tool-body" onClick={(e) => e.stopPropagation()}><Clamp className="cmd" text={JSON.stringify(c.args, null, 1)} n={800} />{obs.map((o, i) => <div key={i}><Clamp className={`obs ${o.error ? 'bad' : ''}`} text={o.content} n={600} /><MediaList media={o.media} resolve={resolve} /></div>)}</div>}
    </div>
  );
}

type Annot = { get: (i: number) => StepAnno | undefined; set: (i: number, v: StepAnno | null) => void };
const AgentStep = memo(function AgentStep({ s, cur, resolve, onFile, onStep, annot }: { s: Step; cur: boolean; resolve: (p: string) => string; onFile?: (path: string, step: number) => void; onStep?: (i: number) => void; annot?: Annot }) {
  const t = useT();
  const OP = { write: t('写入'), edit: t('修改'), delete: t('删除') };
  const html = useMemo(() => (s.text && s.text.length <= 2500 ? md(s.text) : null), [s.text]);
  const matched = new Set<number>();
  const a = annot?.get(s.i);
  return (
    <div id={`s-${s.i}`} className={`chat-step ${cur ? 'cur' : ''} ${s.error ? 'err' : ''} ${a?.score != null ? 'scored' : ''} ${annot ? 'with-tools' : ''}`} onClick={() => onStep?.(s.i)}>
      <span className="stepno faint">#{s.i}</span>
      {annot && <div className="chat-tools"><StepTools anno={a} onChange={(v) => annot.set(s.i, v)} /></div>}
      {s.reasoning && <details className="think" onClick={(e) => e.stopPropagation()}><summary>{t('思考')} {fmtNum(s.reasoning.length)} {t('字符')}</summary><pre>{s.reasoning}</pre></details>}
      {s.text && (html ? <div className="md agent-md" dangerouslySetInnerHTML={{ __html: html }} /> : <Clamp className="msg" text={s.text} n={2500} />)}
      <MediaList media={s.media} resolve={resolve} />
      {s.calls.map((_, k) => <ToolRow key={k} s={s} k={k} resolve={resolve} matched={matched} />)}
      {s.obs.filter((_, j) => !matched.has(j)).map((o, j) => <Clamp key={'u' + j} className={`obs ${o.error ? 'bad' : ''}`} text={o.content} n={400} />)}
      {(s.writes.length > 0 || s.repeat || s.suspicious?.length || s.error || s.flags.some((f) => f !== 'converted' && f !== 'stub')) ? <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
        {s.writes.map((w, k) => <a key={k} className={`fchip ${w.op} ${w.failed ? 'failed' : ''}`} onClick={(e) => { e.stopPropagation(); onFile?.(w.path, s.i); }} title={w.failed ? `${w.path} · ${t('该调用失败，未计入')}` : t('在右侧查看 {p}', { p: w.path })}>{OP[w.op]} <span className="mono">{w.path.split('/').pop()}</span></a>)}
        <StepBadges s={s} />
      </div> : null}
    </div>
  );
});

/**
 * Chat-style rendering: user / system messages as right-aligned bubbles, consecutive agent steps merged into one
 * assistant turn. File changes become clickable chips (`onFile`); clicking a step syncs the workspace (`onStep`).
 */
export function ChatView({ steps, t0, resolve, onFile, onStep, cur, annot }: { steps: Step[]; t0: number | null; resolve: (p: string) => string; onFile?: (path: string, step: number) => void; onStep?: (i: number) => void; cur: number | null; annot?: Annot }) {
  const t = useT();
  const turns: Step[][] = [];
  for (const s of steps) { const last = turns.at(-1); if (s.source === 'agent' && last?.[0].source === 'agent') last.push(s); else turns.push([s]); }
  const rel = (s: Step) => (s.ts != null && t0 != null ? `+${Math.round((s.ts - t0) / 60000)}m` : null);
  return (
    <div className="chat">
      {turns.map((turn, i) => {
        const s0 = turn[0];
        if (s0.source !== 'agent') return (
          <div key={i} id={`s-${s0.i}`} className={`bubble ${s0.source} ${cur === s0.i ? 'cur' : ''}`} onClick={() => onStep?.(s0.i)}>
            <div className="who">{s0.source === 'user' ? t('用户') : t('系统')} <span>#{s0.i}{rel(s0) ? ` · ${rel(s0)}` : ''}</span></div>
            <Clamp className="msg" text={s0.text} n={700} /><MediaList media={s0.media} resolve={resolve} />
          </div>
        );
        return (
          <div key={i} className="turn">
            <div className="who">{t('助手')} <span>{t('{a} 次模型调用 · {b} 次工具调用', { a: turn.length, b: turn.reduce((n, s) => n + s.calls.length, 0) })}{rel(s0) ? ` · ${rel(s0)}` : ''}</span></div>
            {turn.map((s) => <AgentStep key={s.i} s={s} cur={cur === s.i} resolve={resolve} onFile={onFile} onStep={onStep} annot={annot} />)}
          </div>
        );
      })}
    </div>
  );
}
