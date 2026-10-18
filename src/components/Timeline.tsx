import type { Step, Kind } from '../lib/data';
import { useT } from '../lib/i18n';
import { KIND_LABEL } from './Step';

/** A run compressed into phases: consecutive agent steps of the same kind become one segment; user / system turns are milestones. */
export interface Seg { kind: Kind; from: number; to: number; n: number; err: boolean; writes: number; sus: number; rep: number; ts: number | null; tools: string[]; text: string }
export function segments(steps: Step[]): Seg[] {
  const out: Seg[] = [];
  for (const s of steps) {
    const last = out.at(-1);
    const milestone = s.source !== 'agent';
    if (!milestone && last && last.kind === s.kind) {
      last.to = s.i; last.n++; last.err ||= s.error; last.writes += s.writes.length; last.sus += s.suspicious?.length ?? 0; last.rep += s.repeat ? 1 : 0;
      for (const c of s.calls) if (!last.tools.includes(c.name)) last.tools.push(c.name);
    } else out.push({ kind: milestone ? (s.source === 'system' ? 'system' : 'user') : s.kind, from: s.i, to: s.i, n: 1, err: s.error, writes: s.writes.length, sus: s.suspicious?.length ?? 0, rep: s.repeat ? 1 : 0, ts: s.ts, tools: s.calls.map((c) => c.name), text: s.text.replace(/\s+/g, ' ').slice(0, 140) });
  }
  return out;
}

/**
 * One thin track, no text: agent phases are colored bars whose length grows with the log of their step count
 * (so the axis is not linear in steps; only the first and last step numbers are printed); user / system turns are
 * small diamonds; errors are red ticks. Everything else is in the tooltip. The kind chips under the track are the legend.
 */
export function Timeline({ steps, cur, onJump, compact, marks }: { steps: Step[]; cur: number | null; onJump?: (i: number) => void; compact?: boolean; marks?: Map<number, string> }) {
  const t = useT();
  const segs = segments(steps);
  const t0 = steps.find((s) => s.ts)?.ts ?? null;
  const rel = (ts: number | null) => (ts != null && t0 != null ? ` · +${Math.round((ts - t0) / 60000)}m` : '');
  return (
    <div className={`tl ${compact ? 'compact' : ''}`}>
      <div className="tl-track">
        {segs.map((g, k) => {
          const on = cur != null && cur >= g.from && cur <= g.to;
          const marked = marks ? [...marks.entries()].filter(([i]) => i >= g.from && i <= g.to) : [];
          const title = `#${g.from}${g.n > 1 ? `–${g.to}` : ''} · ${t(KIND_LABEL[g.kind])}${g.n > 1 ? ` ×${g.n}` : ''}${rel(g.ts)}${g.tools.length ? `\n${g.tools.slice(0, 6).join(', ')}` : ''}${g.writes ? `\n${t('写入文件')} ${g.writes}` : ''}${g.err ? `\n${t('含报错')}` : ''}${g.rep ? `\n${t('重复动作')} ${g.rep}` : ''}${g.sus ? `\n${t('可疑操作')} ${g.sus}` : ''}${marked.map(([i, l]) => `\n▲ ${l} #${i}`).join('')}${g.text ? `\n${g.text}` : ''}`;
          if (g.kind === 'user' || g.kind === 'system') return <a key={k} className={`tl-ms ${g.kind} ${on ? 'on' : ''}`} onClick={() => onJump?.(g.from)} title={title}><i /></a>;
          return <a key={k} className={`tl-bar ${on ? 'on' : ''} ${g.err ? 'err' : ''} ${g.sus ? 'sus' : ''} ${g.rep ? 'rep' : ''} ${marked.length ? 'mark' : ''}`} style={{ flexGrow: Math.log2(g.n + 1), background: `var(--k-${g.kind})` }} onClick={() => onJump?.(g.from)} title={title} />;
        })}
      </div>
      {!compact && steps.length > 0 && <div className="tl-axis"><span>#{steps[0].i}</span><span>#{steps.at(-1)!.i}</span></div>}
    </div>
  );
}
