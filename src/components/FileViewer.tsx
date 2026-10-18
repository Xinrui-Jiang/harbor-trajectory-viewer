import { useState } from 'react';
import { useText, useUrl, type Artifact } from '../lib/data';
import { useT } from '../lib/i18n';

const TEXT = /^(md|txt|toml|json|yaml|yml|sh|py|go|ts|tsx|js|mjs|cbl|cpy|java|sql|csv|vtt|html|xml|cfg|ini|env|mod|sum|dockerfile|)$/;
export const isText = (a: Artifact) => TEXT.test(a.ext) || /dockerfile|makefile|readme/i.test(a.path);
const LIMIT = 400_000;
const fmtBytes = (b: number) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

/** A file list grouped by top-level dir + text preview. `base` is the data-root-relative prefix the paths resolve against. */
export function FileBrowser({ groups, base }: { groups: { label: string; files: Artifact[] }[]; base: string }) {
  const t = useT();
  const [sel, setSel] = useState<{ g: string; f: Artifact } | null>(null);
  const rel = sel ? `${base}/${sel.g}/${sel.f.path}` : null;
  const small = !!sel && isText(sel.f) && sel.f.bytes < LIMIT;
  const text = useText(small ? rel : null);
  const url = useUrl(sel && !small ? rel : null);
  return (
    <div className="files">
      <div className="tree">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="tree-h">{g.label} <span className="faint">{g.files.length}</span></div>
            {g.files.length ? g.files.map((f) => (
              <a key={f.path} className={`tree-f ${sel?.f === f ? 'on' : ''}`} onClick={() => setSel({ g: g.label, f })} title={f.path}><span className="mono">{f.path}</span><span className="faint">{fmtBytes(f.bytes)}</span></a>
            )) : <div className="faint" style={{ padding: '2px 8px' }}>{t('无')}</div>}
          </div>
        ))}
      </div>
      <div className="preview">
        {!sel ? <p className="faint">{t('选择左侧文件查看内容')}</p>
          : !small ? <p className="muted">{isText(sel.f) ? t('文件超过 {n}，不在页面内显示', { n: fmtBytes(LIMIT) }) : t('二进制文件')} {fmtBytes(sel.f.bytes)} · {url.data && <a href={url.data} target="_blank" className="btn">{t('打开')}</a>}{url.error && <span className="tag bad">{url.error}</span>}</p>
          : text.error ? <p className="tag bad">{text.error}</p>
          : text.data == null ? <p className="faint">{t('加载中…')}</p>
          : <pre>{text.data}</pre>}
      </div>
    </div>
  );
}
