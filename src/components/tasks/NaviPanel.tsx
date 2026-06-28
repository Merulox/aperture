import { CollapsiblePanel } from './CollapsiblePanel';

function BriefPreview({ task }: { task: any }) {
  return task.briefPath ? (
    <details className="brief-preview">
      <summary>▶ View brief</summary>
      <pre>{task.briefExists ? task.briefPreview : `Brief not found at ${task.briefPath}`}</pre>
    </details>
  ) : null;
}

function NaviTaskRow({ task }: { task: any }) {
  return (
    <div className="ex-task">
      <span className="task-id">{task.id}</span>
      <span className={`badge badge-${task.statusTone}`}>{task.statusBadge}</span>
      <span className="task-title">{task.title}</span>
      <span className="task-note">{task.notes || '—'}</span>
      <BriefPreview task={task} />
    </div>
  );
}

export function NaviPanel({ tasks }: { tasks: any[] }) {
  const CLOSED = ['done', 'superseded', 'cancelled', 'split'];
  const activeTasks = tasks.filter((task) => !CLOSED.includes(task.status));
  const doneTasks = tasks.filter((task) => CLOSED.includes(task.status));

  return (
    <CollapsiblePanel id="navi-heading" title="navi" meta={<span className="badge badge-muted">{tasks.length} tasks</span>}>
      <div className="ex-grid">
        {activeTasks.length
          ? activeTasks.map((task) => <NaviTaskRow key={task.id} task={task} />)
          : <p className="state-entry">— no active navi tasks —</p>}
        <details className="done-group ex-done-group">
          <summary>[{doneTasks.length} closed — click to expand]</summary>
          <div className="ex-grid">
            {doneTasks.map((task) => <NaviTaskRow key={task.id} task={task} />)}
          </div>
        </details>
      </div>
    </CollapsiblePanel>
  );
}
