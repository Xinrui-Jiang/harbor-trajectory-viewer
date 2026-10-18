import { memo, useState } from 'react';
import { diffLines } from 'diff';
import type { Step, Kind, Media } from '../lib/data';
import { fmtNum, useUrl, SUS_LABEL } from '../lib/data';
import { useT } from '../lib/i18n';
import type { StepAnno } from '../lib/annotations';
import { StepTools } from './StepTools';

const FLAG_TEXT: Record<string, string> = { 'api-error': 'API 错误', redacted: '思考内容已脱敏', truncated: '输出被截断', sidechain: '子线程', copied: '复制的上下文' };
export const KIND_LABEL: Record<Kind, string> = { user: '用户', system: '系统', explore: '探索', edit: '编辑', shell: '命令', verify: '验证', plan: '规划', tool: '其他工具', gui: 'GUI', talk: '对话', finish: '收尾' };

/** Text that is clipped to `n` chars until expanded. */
export function Clamp({ text, n = 600, className = '' }: { text: string; n?: number; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (text.length <= n) return <pre className={className}>{text}</pre>;
  return (
    <div>
      <pre className={className}>{open ? text : text.slice(0, n) + '…'}</pre>
      <a className="more" onClick={() => setOpen(!open)}>{open ? t('收起') : t('展开全部 {n} 字符', { n: fmtNum(text.length) })}</a>
    </div>
  );
}

function MediaItem({ m, rel }: { m: Media; rel: string }) {
  const { data: url, error } = useUrl(rel);
  if (error) return <span className="tag bad" title={error}>{m.type}: {m.path}</span>;
  if (!url) return <span className="tag gray">{m.type}…</span>;
  return m.type === 'image' ? <img src={url} className="media" alt={m.path ?? ''} /> : m.type === 'audio' ? <audio src={url} controls /> : <a className="tag gray" href={url} target="_blank">{m.type}: {m.path}</a>;
}
/** Multimodal content parts (ATIF v1.6+). `resolve` maps a part path to a data-root-relative path or an absolute URL. */
export function MediaList({ media, resolve }: { media: Media[]; resolve: (p: string) => string }) {
  return <>{media.map((m, i) => (m.path ? <MediaItem key={i} m={m} rel={resolve(m.path)} /> : <span key={i} className="tag gray">{m.type}</span>))}</>;
}

function Diff({ a, b }: { a: string; b: string }) {
  return <pre className="diff">{diffLines(a, b).map((p, i) => <span key={i} className={p.added ? 'add' : p.removed ? 'del' : ''}>{p.value}</span>)}</pre>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 1));
/** Renders tool arguments in the most readable shape for the tool. */
function Args({ name, args }: { name: string; args: Record<string, unknown> }) {
  const raw = args.command ?? args.keystrokes ?? args.cmd ?? args.script;
  const cmd = Array.isArray(raw) ? raw.map(String).join(' ') : raw;
  if (typeof cmd === 'string' && /bash|exec|shell|terminal/i.test(name)) return <Clamp className="cmd" text={cmd.trimEnd()} n={1200} />;
  const old = args.old_string ?? args.old_str, nu = args.new_string ?? args.new_str;
  if (typeof old === 'string' && typeof nu === 'string') return <><div className="faint mono">{str(args.file_path ?? args.path)}</div><Diff a={old} b={nu} /></>;
  if (typeof args.content === 'string' && (args.file_path || args.path)) return <><div className="faint mono">{str(args.file_path ?? args.path)}</div><Clamp className="cmd" text={args.content} /></>;
  const keys = Object.keys(args).filter((k) => k !== 'summary' && k !== 'description');
  if (!keys.length) return null;
  return <Clamp className="cmd" text={keys.length === 1 && typeof args[keys[0]] === 'string' ? (args[keys[0]] as string) : JSON.stringify(Object.fromEntries(keys.map((k) => [k, args[k]])), null, 1)} />;
}

export const StepBadges = ({ s }: { s: Step }) => {
  const t = useT();
  return <>
    {s.flags.filter((f) => f !== 'converted' && f !== 'stub').map((f) => <span key={f} className={`tag ${f === 'redacted' || f === 'copied' ? 'gray' : 'mid'}`}>{t(FLAG_TEXT[f] ?? f)}</span>)}
    {s.repeat && <span className="tag mid" title={t('与上一步完全相同的动作（同工具同参数）')}>{t('重复动作')}</span>}
    {s.suspicious?.map((k) => <span key={k} className="tag bad">{t(SUS_LABEL[k] ?? k)}</span>)}
    {s.error && <span className="tag bad" title={s.errorHint === 'text' ? t('从输出文本推断的报错') : t('工具返回标记为错误')}>{s.errorHint === 'text' ? t('疑似报错') : 'error'}</span>}
  </>;
};

export const StepCard = memo(function StepCard({ s, t0, anno, onFlag, active, resolve, onFile }: { s: Step; t0: number | null; anno?: StepAnno; onFlag?: (v: StepAnno | null) => void; active?: boolean; resolve?: (p: string) => string; onFile?: (p: string) => void }) {
  const t = useT();
  const [showReason, setShowReason] = useState(false);
  const rel = s.ts != null && t0 != null ? Math.round((s.ts - t0) / 1000) : null;
  const OP = { write: t('写'), edit: t('改'), delete: t('删') };
  const res = resolve ?? ((p: string) => p);
  const matched = new Set<number>();
  return (
    <article id={`s-${s.i}`} className={`step k-${s.kind} ${s.error ? 'err' : ''} ${anno?.flag ? 'flag-' + anno.flag : ''} ${anno?.score != null ? 'scored' : ''} ${active ? 'cur' : ''}`}>
      <header>
        <span className="idx">{s.i}</span>
        <span className="kind" style={{ background: `var(--k-${s.kind})` }}>{t(KIND_LABEL[s.kind])}</span>
        {s.calls.map((c, k) => <span key={k} className="tool mono">{c.name}</span>)}
        {(s.writes ?? []).map((w, k) => <a key={k} className={`fchip ${w.op} ${w.failed ? 'failed' : ''}`} title={w.failed ? `${w.path} · ${t('该调用失败，未计入')}` : w.path} onClick={() => onFile?.(w.path)}>{OP[w.op]} <span className="mono">{w.path.split('/').pop()}</span></a>)}
        <StepBadges s={s} />
        {s.llmCalls != null && s.llmCalls !== 1 && <span className="tag gray">{t('{n} 次 LLM 调用', { n: s.llmCalls })}</span>}
        <span className="grow" />
        {s.metrics && <span className="faint mono" title={t('输入 / 输出 token')}>{fmtNum(s.metrics.prompt)} / {fmtNum(s.metrics.completion)}</span>}
        {rel != null && <span className="faint mono">+{rel >= 60 ? `${Math.floor(rel / 60)}m${rel % 60}s` : rel + 's'}</span>}
        {onFlag && <StepTools anno={anno} onChange={onFlag} />}
      </header>
      {s.reasoning && (
        <div className="reason">
          <a className="more" onClick={() => setShowReason(!showReason)}>{showReason ? t('隐藏推理') : t('推理 {n} 字符', { n: fmtNum(s.reasoning.length) })}</a>
          {showReason && <pre className="muted">{s.reasoning}</pre>}
        </div>
      )}
      {s.text && <Clamp className="msg" text={s.text} n={900} />}
      <MediaList media={s.media ?? []} resolve={res} />
      {s.calls.map((c, k) => (
        <div key={c.id ?? k} className="call">
          <Args name={c.name} args={c.args ?? {}} />
          {s.obs.filter((o, j) => { const hit = o.callId === c.id || (s.calls.length === 1 && !o.callId); if (hit) matched.add(j); return hit; }).map((o, j) => <div key={j}>{o.subagents.length > 0 && <span className="tag gray">{t('委托子 agent')}：{o.subagents.join(', ')}</span>}<Clamp className={`obs ${o.error ? 'bad' : ''}`} text={o.content} n={500} /><MediaList media={o.media ?? []} resolve={res} /></div>)}
        </div>
      ))}
      {s.obs.filter((_, j) => !matched.has(j)).map((o, j) => <Clamp key={'u' + j} className={`obs ${o.error ? 'bad' : ''}`} text={o.content} n={500} />)}
    </article>
  );
});
