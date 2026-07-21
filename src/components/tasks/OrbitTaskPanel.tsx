import type { Job } from '../codex/JobRow';
import type { LaunchTask } from '../Taskboard';
import { CollapsiblePanel } from './CollapsiblePanel';
import { TaskRow } from './SyntraPanel';

interface Props {
  tasks: any[];
  jobs: Job[];
  launchingTaskId: string;
  onLaunch: (task: LaunchTask) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

export function OrbitTaskPanel(props: Props) {
  const CLOSED = ['done'];
  const attentionStatuses = ['review', 'briefed', 'backlog'];
  const activeTasks = props.tasks.filter((t) => !CLOSED.includes(t.status));
  const doneTasks = props.tasks.filter((t) => CLOSED.includes(t.status));
  const reviewTasks = activeTasks.filter((t) => t.status === 'review');
  const otherTasks = activeTasks.filter((t) => t.status !== 'review');

  const badge = reviewTasks.length > 0
    ? <span className="badge badge-orange">{reviewTasks.length} review</span>
    : <span className="badge badge-muted">{props.tasks.length} tasks</span>;

  const row = (t: any) => (
    <TaskRow key={t.id} {...props} task={t} attention={attentionStatuses.includes(t.status)} />
  );

  return (
    <CollapsiblePanel id="orbit-heading" title="orbit" meta={badge}>
      <div className="ex-grid">
        {reviewTasks.map(row)}
        {otherTasks.map(row)}
        {activeTasks.length === 0 && <p className="state-entry">— no active orbit tasks —</p>}
        <details className="done-group ex-done-group">
          <summary>[{doneTasks.length} done — click to expand]</summary>
          <div className="ex-grid">
            {doneTasks.map((t) => <TaskRow key={t.id} {...props} task={t} />)}
          </div>
        </details>
      </div>
    </CollapsiblePanel>
  );
}
