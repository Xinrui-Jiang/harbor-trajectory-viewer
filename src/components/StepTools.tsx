import { useState } from 'react';
import { useT } from '../lib/i18n';
import { FLAG_LABEL, isStepAnnotated, type StepAnno, type StepFlag } from '../lib/annotations';

/** Per-step annotation controls: a free numeric stepwise reward, an explicit flag choice, an optional note. */
export function StepTools({ anno, onChange }: { anno?: StepAnno; onChange: (v: StepAnno | null) => void }) {
  const t = useT();
  const [noteOpen, setNoteOpen] = useState(false);
  const set = (patch: Partial<StepAnno>) => { const next = { note: '', ...(anno ?? {}), ...patch }; onChange(isStepAnnotated(next) ? next : null); };
  return (
    <span className="steptools" onClick={(e) => e.stopPropagation()}>
      <label className="st-label" title={t('给这一步打分；量表自定，导出时原样保留')}>{t('stepwise reward')}:
        <input type="number" className="st-num" step="any" value={anno?.score ?? ''} onChange={(e) => set({ score: e.target.value === '' ? null : Number(e.target.value) })} />
      </label>
      <select className="st-flag" value={anno?.flag ?? ''} onChange={(e) => set({ flag: (e.target.value || null) as StepFlag | null })} title={t('旗标')}>
        <option value="">⚑</option>{(Object.keys(FLAG_LABEL) as StepFlag[]).map((f) => <option key={f} value={f}>{t(FLAG_LABEL[f])}</option>)}
      </select>
      {noteOpen || anno?.note ? <input className="flag-note" placeholder={t('备注…')} value={anno?.note ?? ''} onChange={(e) => set({ note: e.target.value })} /> : <a className="more" onClick={() => setNoteOpen(true)}>{t('备注')}</a>}
    </span>
  );
}
