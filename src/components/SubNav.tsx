import { NavLink } from 'react-router-dom';
import { useSel } from '../lib/data';
import { useT } from '../lib/i18n';

/** Second-level tabs inside a workbench; keeps the global selection in the URL. */
export function SubNav({ base, tabs }: { base: string; tabs: [string, string][] }) {
  const sel = useSel();
  const t = useT();
  return <nav className="subnav">{tabs.map(([k, l]) => <NavLink key={k} to={sel.href(`${base}/${k}`)} className={({ isActive }) => (isActive ? 'on' : '')}>{t(l)}</NavLink>)}</nav>;
}

export const NeedSel = ({ what }: { what: string }) => { const t = useT(); return <p className="muted" style={{ padding: 24 }}>{t('请在顶部选择{what}。', { what: t(what) })}</p>; };
