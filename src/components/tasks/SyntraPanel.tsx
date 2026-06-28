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
  return task.briefPath && (
    <details className="brief-preview">
      <summary>▶ View brief</summary>
      <pre>{task.briefExists ? task.briefPreview : `Brief not found at ${task.briefPath}`}</pre>
    </details>
  );
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

  return task.prompt && (
    <div className="prompt-block">
      <pre>{task.prompt}</pre>
      <div className="prompt-actions">
        <button type="button" className="copy-prompt" onClick={() => void copy()}>{copied ? 'Copied ✓' : 'Copy prompt'}</button>
        {task.status === 'briefed' && (
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
  );
}

function TaskRow(props: Props & { task: any; attention?: boolean }) {
  const { task, attention = false } = props;
  return (
    <div className={`task-row ${attention && task.uninitiated ? 'task-uninitiated' : ''}`}>
      <span className="task-id">{task.id}</span>
      <span className={`badge badge-${task.statusTone}`}>{task.statusBadge}</span>
      <span className="task-title">{task.title}</span>
      <span className="task-note">{task.notes}</span>
      {attention && <Prompt {...props} />}
      <BriefPreview task={task} />
    </div>
  );
}

export function SyntraPanel(props: Props) {
  const attentionStatuses = ['review', 'backlog', 'briefed'];
  const grouped = Object.groupBy(props.tasks, (task) => task.status);
  const otherStatuses = Object.keys(grouped)
    .filter((status) => !attentionStatuses.includes(status) && status !== 'done')
    .sort();

  return (
    <CollapsiblePanel id="syntra-heading" title="syntra" meta={<span className="badge badge-muted">{props.tasks.length} tasks</span>}>
      <div className="syntra-groups">
        {attentionStatuses.map((status) => (
          <section className="syntra-group attention-group" key={status}>
            <h2>{status} <span className="badge badge-yellow">{grouped[status]?.length || 0}</span></h2>
            {grouped[status]?.length
              ? <div className="task-list">{grouped[status].map((task) => <TaskRow key={task.id} {...props} task={task} attention />)}</div>
              : <p className="state-entry">— none —</p>}
          </section>
        ))}
        {otherStatuses.map((status) => (
          <section className="syntra-group" key={status}>
            <h2>{status} <span className="badge badge-muted">{grouped[status]?.length || 0}</span></h2>
            <div className="task-list">{grouped[status]?.map((task) => <TaskRow key={task.id} {...props} task={task} />)}</div>
          </section>
        ))}
        <details className="syntra-group done-group">
          <summary>[{grouped.done?.length || 0} done — click to expand]</summary>
          {grouped.done?.length
            ? <div className="task-list">{grouped.done.map((task) => <TaskRow key={task.id} {...props} task={task} />)}</div>
            : <p className="state-entry">— none —</p>}
        </details>
      </div>
    </CollapsiblePanel>
  );
}
