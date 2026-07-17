import type { Job } from '../codex/JobRow';
import type { LaunchTask } from '../Taskboard';
import { CollapsiblePanel } from './CollapsiblePanel';

interface Props {
  tasks: any[];
  jobs: Job[];
  launchingTaskId: string;
  onLaunch: (task: LaunchTask) => Promise<void>;
}

function OrbitTaskRow({ task }: { task: any }) {
  return (
    <div className="task-row">
      <span className="task-id">{task.id}</span>
      <span className={`badge badge-${task.statusTone}`}>{task.statusBadge}</span>
      <span className="task-title">{task.title}</span>
      <span className="task-note">{task.notes || '—'}</span>
    </div>
  );
}

export function OrbitTaskPanel(props: Props) {
  const CLOSED = ['done'];
  const activeTasks = props.tasks.filter((t) => !CLOSED.includes(t.status));
  const doneTasks = props.tasks.filter((t) => CLOSED.includes(t.status));
  const reviewTasks = activeTasks.filter((t) => t.status === 'review');
  const otherTasks = activeTasks.filter((t) => t.status !== 'review');

  const badge = reviewTasks.length > 0
    ? <span className="badge badge-orange">{reviewTasks.length} review</span>
    : <span className="badge badge-muted">{props.tasks.length} tasks</span>;

  return (
    <CollapsiblePanel id="orbit-heading" title="orbit" meta={badge}>
      <div className="ex-grid">
        {reviewTasks.map((t) => <OrbitTaskRow key={t.id} task={t} />)}
        {otherTasks.map((t) => <OrbitTaskRow key={t.id} task={t} />)}
        {activeTasks.length === 0 && <p className="state-entry">— no active orbit tasks —</p>}
        <details className="done-group ex-done-group">
          <summary>[{doneTasks.length} done — click to expand]</summary>
          <div className="ex-grid">
            {doneTasks.map((t) => <OrbitTaskRow key={t.id} task={t} />)}
          </div>
        </details>
      </div>
    </CollapsiblePanel>
  );
}
