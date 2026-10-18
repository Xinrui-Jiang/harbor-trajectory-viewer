import { useParams } from 'react-router-dom';
import { SubNav, NeedSel } from '../components/SubNav';
import TaskPage from './Task';
import { JobView } from './Job';
import { CompareView } from './Compare';
import ArtifactPage from './Artifact';
import { useSel } from '../lib/data';

export default function Explore() {
  const { sub = 'task' } = useParams();
  const sel = useSel();
  return (
    <>
      <SubNav base="/explore" tabs={[['task', '任务'], ['trajectory', '轨迹'], ['compare', '对比'], ['artifact', '产物']]} />
      {!sel.t ? <NeedSel what="任务" />
        : sub === 'task' ? <TaskPage id={sel.t} />
        : !sel.j ? <NeedSel what="运行" />
        : sub === 'trajectory' ? <JobView task={sel.t} job={sel.j} mode="explore" />
        : sub === 'compare' ? (sel.b ? <CompareView task={sel.t} a={sel.j} b={sel.b} mode="explore" /> : <NeedSel what="第二条运行" />)
        : sub === 'artifact' ? <ArtifactPage task={sel.t} job={sel.j} />
        : null}
    </>
  );
}
