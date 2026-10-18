import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { serverSource, setSource, useSource } from '../lib/data';
import { loadZip } from '../lib/zipSource';
import { useT } from '../lib/i18n';

/** Top-bar control: load a zip (same layout as the ingest script accepts) and switch the whole app to it. */
export function Upload() {
  const t = useT();
  const nav = useNavigate();
  const src = useSource();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(t('读取 zip…')); setErr(null);
    try { setSource(await loadZip(f, (k, v) => setBusy(t(k, v)))); nav('/check/inventory'); }
    catch (e) { setErr(`${t('解析失败')}: ${t(e instanceof Error ? e.message : String(e))}`); }
    finally { setBusy(null); }
  };
  return (
    <span className="row" style={{ gap: 6 }}>
      {err && <span className="tag bad" title={err} onClick={() => setErr(null)} style={{ cursor: 'pointer', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{err}</span>}
      {src.kind === 'zip' && <span className="tag" title={t('当前数据来自上传的 zip；刷新页面后需重新上传。标注保存在浏览器本地。')}>{src.name} <a style={{ cursor: 'pointer', marginLeft: 4 }} onClick={() => { setSource(serverSource); nav('/check/inventory'); }} title={t('恢复默认数据')}>×</a></span>}
      <label className="btn ghost" style={{ cursor: busy ? 'wait' : 'pointer' }} title={t('上传一个 zip：内容为 tasks/<task>/jobs/<job>/ 或 Harbor 的 jobs/<job>/<trial>/ 布局，浏览器内解析，不上传到任何服务器')}>
        {busy ?? t('上传 zip')}
        <input type="file" accept=".zip" hidden disabled={!!busy} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
    </span>
  );
}
