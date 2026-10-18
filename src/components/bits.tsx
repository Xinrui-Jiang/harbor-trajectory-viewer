import type { JobSummary } from '../lib/data';
import { rewardCls, agentLabel } from '../lib/data';

export const Stat = ({ v, l, title }: { v: React.ReactNode; l: string; title?: string }) => (
  <div className="stat" title={title}><div className="v">{v}</div><div className="l">{l}</div></div>
);

/** One square per run, colored by reward relative to the dataset's observed range. */
export const RewardDots = ({ jobs, range }: { jobs: JobSummary[]; range: [number, number] }) => (
  <div className="dots">{jobs.map((j) => <span key={j.id} className={`dot ${rewardCls(j.reward, range)}`} title={`${agentLabel(j)} · reward ${j.reward ?? 'none'}`} />)}</div>
);

export const Loading = ({ error }: { error?: string | null }) => error ? <p className="notice bad">{error}</p> : <p className="muted">…</p>;
