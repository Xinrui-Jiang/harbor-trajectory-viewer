import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIndex, useUrl, jobRel, type Artifact } from '../lib/data';
import { useT } from '../lib/i18n';
import { safeHtml } from '../lib/html';
import { Loading } from '../components/bits';

const IMG = /^(png|jpg|jpeg|gif|webp|svg|bmp)$/, VID = /^(mp4|webm|mov)$/, AUD = /^(mp3|wav|m4a|ogg)$/, TXT = /^(txt|csv|json|yaml|yml|vtt|md|html|xml|log|py|sh)$/;
const previewable = (a: Artifact) => IMG.test(a.ext) || VID.test(a.ext) || AUD.test(a.ext) || TXT.test(a.ext) || /^(pdf|html|xlsx|xlsm|docx)$/.test(a.ext);
const ROWS = 300;

function Sheet({ url }: { url: string }) {
  const t = useT();
  const [wb, setWb] = useState<{ name: string; rows: unknown[][] }[] | null>(null);
  const [cur, setCur] = useState(0);
  useEffect(() => { let live = true; setWb(null); import('xlsx').then(async (X) => { const b = await (await fetch(url)).arrayBuffer(); const w = X.read(b); if (live) setWb(w.SheetNames.map((n) => ({ name: n, rows: X.utils.sheet_to_json(w.Sheets[n], { header: 1 }) as unknown[][] }))); }); return () => { live = false; }; }, [url]);
  if (!wb) return <p className="faint">{t('解析中…')}</p>;
  const sh = wb[cur] ?? wb[0];
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 8 }}>{wb.map((s, i) => <a key={s.name} className={`btn ghost ${i === cur ? 'on' : ''}`} onClick={() => setCur(i)}>{s.name} <span className="faint">{s.rows.length}</span></a>)}</div>
      <div style={{ overflow: 'auto', maxHeight: '70vh' }}><table className="sheet"><tbody>{sh.rows.slice(0, ROWS).map((r, i) => <tr key={i}><td className="faint">{i + 1}</td>{(r as unknown[]).map((c, j) => <td key={j}>{c == null ? '' : String(c)}</td>)}</tr>)}</tbody></table></div>
      {sh.rows.length > ROWS && <p className="faint">{t('只显示前 {n} 行', { n: ROWS })}</p>}
    </>
  );
}
function Docx({ url }: { url: string }) {
  const t = useT();
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => { let live = true; setHtml(null); import('mammoth').then(async (m) => { const r = await m.convertToHtml({ arrayBuffer: await (await fetch(url)).arrayBuffer() }); if (live) setHtml(safeHtml(r.value)); }); return () => { live = false; }; }, [url]);
  return html == null ? <p className="faint">{t('解析中…')}</p> : <div className="md docx" dangerouslySetInnerHTML={{ __html: html }} />;
}
function Text({ url }: { url: string }) {
  const t = useT();
  const [s, setS] = useState<string | null>(null);
  useEffect(() => { let live = true; setS(null); fetch(url).then((r) => r.text()).then((x) => live && setS(x)); return () => { live = false; }; }, [url]);
  return s == null ? <p className="faint">{t('加载中…')}</p> : <pre style={{ maxHeight: '70vh' }}>{s}</pre>;
}

/** Renders one artifact by extension. `rel` is data-root-relative (resolved to a static or blob URL by the active source). */
export function ArtifactView({ a, rel }: { a: Artifact; rel: string }) {
  const t = useT();
  const { data: url, error } = useUrl(rel);
  if (error) return <p className="notice bad">{error}</p>;
  if (!url) return <p className="faint">{t('加载中…')}</p>;
  const e = a.ext;
  if (IMG.test(e)) return <img src={url} style={{ maxWidth: '100%', maxHeight: '75vh', border: '1px solid var(--line)', borderRadius: 8 }} />;
  if (VID.test(e)) return <video src={url} controls style={{ maxWidth: '100%', maxHeight: '75vh' }} />;
  if (AUD.test(e)) return <audio src={url} controls />;
  if (e === 'pdf' || e === 'html') return <iframe src={url} sandbox="" style={{ width: '100%', height: '75vh', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }} />;
  if (e === 'xlsx' || e === 'xlsm') return <Sheet url={url} />;
  if (e === 'docx') return <Docx url={url} />;
  if (TXT.test(e)) return <Text url={url} />;
  return <p className="muted">{t('暂不支持预览')} .{e}（{(a.bytes / 1024).toFixed(0)} KB） · <a className="btn" href={url} download={a.path.split('/').pop()}>{t('下载')}</a></p>;
}

export default function ArtifactPage({ task, job }: { task: string; job: string }) {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const { data: idx, error } = useIndex();
  const J = idx?.tasks.find((x) => x.id === task)?.jobs.find((j) => j.id === job);
  if (!idx) return <Loading error={error} />;
  if (!J) return <p className="notice bad">{t('未找到运行')}</p>;
  const p = sp.get('p') ?? (J.artifacts.find(previewable) ?? J.artifacts[0])?.path;
  const a = J.artifacts.find((x) => x.path === p);
  const pick = (path: string) => { const n = new URLSearchParams(sp); n.set('p', path); setSp(n); };
  const failed = J.artifactsFailed;
  if (!J.artifacts.length) return <p className="muted" style={{ padding: 24 }}>{t('这次运行没有产物文件。')}{failed.length > 0 && <> {t('清单中 {n} 项收集失败', { n: failed.length })}: <span className="mono">{failed.join(', ')}</span></>}</p>;
  return (
    <>
      {failed.length > 0 && <p className="notice mid" style={{ marginBottom: 10 }}>{t('清单中 {n} 项收集失败', { n: failed.length })}: <span className="mono">{failed.join(', ')}</span></p>}
      <div className="files" style={{ gridTemplateColumns: '280px 1fr' }}>
        <div className="tree">{J.artifacts.map((x) => <a key={x.path} className={`tree-f ${x.path === p ? 'on' : ''}`} onClick={() => pick(x.path)} title={x.path}><span className="mono">{x.path}</span><span className="faint">{x.ext}</span></a>)}</div>
        <div>{a ? <ArtifactView a={a} rel={jobRel(J, `artifacts/${a.path}`)} /> : <p className="faint">{t('无')}</p>}</div>
      </div>
    </>
  );
}
