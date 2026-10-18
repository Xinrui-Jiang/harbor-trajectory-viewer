import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useIndex, useSel, fmtReward, agentLabel } from './lib/data';
import { useT, getLang, setLang } from './lib/i18n';
import Check from './pages/Check';
import Explore from './pages/Explore';
import Annotate from './pages/Annotate';
import { Upload } from './components/Upload';
import './styles.css';

const BENCHES = [
  { path: '/check', label: '数据浏览', hint: '清单 · 完整度 · reward · 判卷 · 来源' },
  { path: '/explore', label: '轨迹探索', hint: '任务 · 逐步过程 · 文件 · 对比' },
  { path: '/annotate', label: '标注台', hint: '队列 · 归因 · 偏好 · 导出' },
];

/** Global task / run selector; shown on the explore and annotate benches. Past 30 tasks it becomes a type-ahead with a local draft. */
function Selector() {
  const { data: idx } = useIndex();
  const sel = useSel();
  const loc = useLocation();
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  if (!idx || loc.pathname.startsWith('/check')) return null;
  const task = idx.tasks.find((x) => x.id === sel.t);
  const pick = (id: string) => { const x = idx.tasks.find((x) => x.id === id); if (x) { sel.set({ t: x.id, j: x.jobs[0]?.id ?? null, b: null }); setDraft(null); } };
  const opt = (j: { id: string; agent: string; model: string; reward: number | null }) => <option key={j.id} value={j.id}>{agentLabel(j)} · r={fmtReward(j.reward)} · …{j.id.slice(-8)}</option>;
  const needB = /compare|prefs/.test(loc.pathname);
  const q = draft ?? sel.t;
  const matches = draft != null ? idx.tasks.filter((x) => x.id.toLowerCase().includes(draft.toLowerCase())).slice(0, 12) : [];
  return (
    <div className="selector">
      <span className="faint">{t('任务')}</span>
      {idx.tasks.length > 30
        ? <span className="typeahead"><input value={q} placeholder={t('输入任务名筛选…')} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) pick(matches[0].id); if (e.key === 'Escape') setDraft(null); }} onBlur={() => setTimeout(() => setDraft(null), 150)} style={{ width: 260 }} />
            {draft != null && matches.length > 0 && <div className="ta-list">{matches.map((x) => <a key={x.id} onMouseDown={() => pick(x.id)}>{x.id} <span className="faint">{x.jobs.length}</span></a>)}</div>}</span>
        : <select value={sel.t} onChange={(e) => pick(e.target.value)}><option value="">{t('选择任务…')}</option>{idx.tasks.map((x) => <option key={x.id} value={x.id}>{x.id} ({x.jobs.length})</option>)}</select>}
      <span className="faint">{t('运行')}</span>
      <select value={sel.j} onChange={(e) => sel.set({ j: e.target.value })} disabled={!task}><option value="">{t('选择运行…')}</option>{task?.jobs.map(opt)}</select>
      {needB && <><span className="faint">vs</span><select value={sel.b} onChange={(e) => sel.set({ b: e.target.value })} disabled={!task}><option value="">{t('选择第二条…')}</option>{task?.jobs.filter((j) => j.id !== sel.j).map(opt)}</select></>}
    </div>
  );
}

function App() {
  const sel = useSel();
  const t = useT();
  const { error } = useIndex();
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Harbor Trajectory Viewer</span>
        <nav className="benches">
          {BENCHES.map((b) => <NavLink key={b.path} to={sel.href(b.path)} className={({ isActive }) => (isActive ? 'on' : '')}><b>{t(b.label)}</b><small>{t(b.hint)}</small></NavLink>)}
        </nav>
        <Selector />
        <Upload />
        <button className="btn ghost lang" onClick={() => setLang(getLang() === 'zh' ? 'en' : 'zh')} title={t('切换界面语言（不改变数据内容）')}>{getLang() === 'zh' ? 'EN' : '中'}</button>
      </header>
      <main>
        {error && <p className="notice bad">{t('数据无法加载')}: {error}. {t('先运行 npm run ingest，或上传一个 zip。')}</p>}
        <Routes>
          <Route path="/" element={<Navigate to="/check/inventory" replace />} />
          <Route path="/check/:sub?" element={<Check />} />
          <Route path="/explore/:sub?" element={<Explore />} />
          <Route path="/annotate/:sub?" element={<Annotate />} />
        </Routes>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><App /></HashRouter></React.StrictMode>);
