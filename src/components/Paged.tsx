import { useEffect, useMemo, useState } from 'react';
import { useT } from '../lib/i18n';

/** Client-side pagination for lists that may hold tens of thousands of rows. Resets to page 1 when the input changes. */
export function usePaged<T>(rows: T[], size = 50) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  useEffect(() => { setPage(0); }, [rows.length]);
  const slice = useMemo(() => rows.slice(page * size, page * size + size), [rows, page, size]);
  return { page: Math.min(page, pages - 1), pages, slice, setPage, total: rows.length, size };
}

export function Pager({ p }: { p: ReturnType<typeof usePaged<unknown>> }) {
  const t = useT();
  if (p.pages <= 1) return <span className="faint" style={{ fontSize: 12 }}>{t('共 {n} 条', { n: p.total })}</span>;
  return (
    <span className="pager">
      <a className={p.page === 0 ? 'off' : ''} onClick={() => p.setPage(Math.max(0, p.page - 1))}>‹</a>
      <span className="faint">{p.page * p.size + 1}–{Math.min(p.total, (p.page + 1) * p.size)} / {p.total}</span>
      <a className={p.page >= p.pages - 1 ? 'off' : ''} onClick={() => p.setPage(Math.min(p.pages - 1, p.page + 1))}>›</a>
    </span>
  );
}

/** A long list shown capped, with the full list downloadable. For audit findings at scale: counts and top offenders go first, raw rows last. */
export function Capped({ items, cap = 20, name }: { items: string[]; cap?: number; name: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const download = () => Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([items.join('\n') + '\n'], { type: 'text/plain' })), download: `${name}.txt` }).click();
  if (!items.length) return <p className="faint">{t('无')}</p>;
  const shown = open ? items : items.slice(0, cap);
  return (
    <>
      <ul className="list mono" style={{ fontSize: 12 }}>{shown.map((s) => <li key={s}>{s}</li>)}</ul>
      {items.length > cap && <p className="row" style={{ gap: 10, fontSize: 12 }}><a className="more" onClick={() => setOpen(!open)}>{open ? t('收起') : t('还有 {n} 条', { n: items.length - cap })}</a><a className="more" onClick={download}>{t('下载完整清单')}</a></p>}
    </>
  );
}

/** Horizontal bar list: label · bar · count. */
export function Bars({ rows, max }: { rows: [string, number][]; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map(([, n]) => n));
  return <div>{rows.map(([l, n]) => <div key={l} className="hbar"><span title={l}>{l}</span><i style={{ width: `${(100 * n) / m}%` }} /><b>{n}</b></div>)}</div>;
}

/** Tiny line chart for a numeric series. */
export function Sparkline({ values, fmt, w = 300, h = 48 }: { values: number[]; fmt?: (v: number) => string; w?: number; h?: number }) {
  const max = Math.max(...values), min = Math.min(...values);
  const d = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - ((v - min) / Math.max(1e-9, max - min)) * (h - 4) - 2}`).join(' ');
  return <svg width={w} height={h + 14} className="spark"><polyline points={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" /><text x="0" y={h + 11}>{fmt ? fmt(min) : min}</text><text x={w} y={h + 11} textAnchor="end">{fmt ? fmt(max) : max}</text></svg>;
}
