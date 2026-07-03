import { useState } from 'react';
import type { Job } from '../codex/JobRow';
import type { LaunchTask } from '../Taskboard';
import { CollapsiblePanel } from './CollapsiblePanel';

interface Props {
  tasks: any[];
  jobs: Job[];
  launchingTaskId: string;
  onLaunch: (task: LaunchTask) => Promise<void>;
}

function BriefPreview({ task }: { task: any }) {
  return task.briefPath ? (
    <details className="brief-preview">
      <summary>▶ View brief</summary>
      <pre>{task.briefExists ? task.briefPreview : `Brief not found at ${task.briefPath}`}</pre>
    </details>
  ) : null;
}

function Prompt({ task, jobs, launchingTaskId, onLaunch }: Props & { task: any }) {
  const [copied, setCopied] = useState(false);
  const running = jobs.find((job) => job.taskId === task.id && job.status === 'running');
  const launching = launchingTaskId === task.id;

  const copy = async () => {
    await navigator.clipboard.writeText(task.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return task.prompt ? (
    <div className="prompt-block">
      <pre>{task.prompt}</pre>
      <div className="prompt-actions">
        <button type="button" className="copy-prompt" onClick={() => void copy()}>{copied ? 'Copied ✓' : 'Copy prompt'}</button>
        {task.status === 'ready' && (
          <button
            type="button"
            className="launch-codex"
            disabled={launching || Boolean(running)}
            onClick={() => void onLaunch(task)}
          >
            {launching ? 'Launching...' : running ? `Running (PID ${running.pid})` : 'Send to Codex'}
          </button>
        )}
      </div>
    </div>
  ) : null;
}

function NaviTaskRow({ task, attention = false, ...props }: Props & { task: any; attention?: boolean }) {
  return (
    <div className={`task-row ${attention && task.uninitiated ? 'task-uninitiated' : ''}`}>
      <span className="task-id">{task.id}</span>
      <span className={`badge badge-${task.statusTone}`}>{task.statusBadge}</span>
      <span className="task-title">{task.title}</span>
      <span className="task-note">{task.notes || '—'}</span>
      {attention && <Prompt {...props} task={task} />}
      <BriefPreview task={task} />
    </div>
  );
}

export function NaviPanel(props: Props) {
  const CLOSED = ['done', 'superseded', 'cancelled', 'split'];
  const attentionStatuses = ['ready', 'needs_fix'];
  const activeTasks = props.tasks.filter((task) => !CLOSED.includes(task.status));
  const doneTasks = props.tasks.filter((task) => CLOSED.includes(task.status));
  const attentionTasks = activeTasks.filter((task) => attentionStatuses.includes(task.status));
  const otherTasks = activeTasks.filter((task) => !attentionStatuses.includes(task.status));

  return (
    <CollapsiblePanel id="navi-heading" title="navi" meta={<span className="badge badge-muted">{props.tasks.length} tasks</span>}>
      <div className="ex-grid">
        {attentionTasks.map((task) => <NaviTaskRow key={task.id} {...props} task={task} attention />)}
        {otherTasks.map((task) => <NaviTaskRow key={task.id} {...props} task={task} />)}
        {activeTasks.length === 0 && <p className="state-entry">— no active navi tasks —</p>}
        <details className="done-group ex-done-group">
          <summary>[{doneTasks.length} closed — click to expand]</summary>
          <div className="ex-grid">
            {doneTasks.map((task) => <NaviTaskRow key={task.id} {...props} task={task} />)}
          </div>
        </details>
      </div>
    </CollapsiblePanel>
  );
}
