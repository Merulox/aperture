import { useState } from 'react';
import type { Job } from '../codex/JobRow';
import type { LaunchTask } from '../Taskboard';

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
          task.blocked ? (
            <div className="dep-gate">
              <button type="button" className="launch-codex btn-disabled" disabled>Send to Codex</button>
              <span className="dep-label">requires {task.dependsOn}</span>
            </div>
          ) : (
            <button
              type="button"
              className="launch-codex"
              disabled={launching || Boolean(running)}
              onClick={() => void onLaunch(task)}
            >
              {launching ? 'Launching...' : running ? `Running (PID ${running.pid})` : 'Send to Codex'}
            </button>
          )
        )}
      </div>
    </div>
  );
}

function ExTaskRow(props: Props & { task: any; active?: boolean }) {
  const { task, active = false } = props;
  return (
    <div className={`ex-task ${active && task.uninitiated ? 'task-uninitiated' : ''}`}>
      <span className="task-id">{task.id}</span>
      <span className={`badge badge-${task.statusTone}`}>{task.statusBadge}</span>
      <span className="task-title">{task.title}</span>
      <span className="task-note">{task.riskGate || '—'}</span>
      {active && <Prompt {...props} />}
      <BriefPreview task={task} />
    </div>
  );
}

export function ExPanel(props: Props) {
  const activeTasks = props.tasks.filter((task) => task.status !== 'done');
  const doneTasks = props.tasks.filter((task) => task.status === 'done');

  return (
    <section className="panel" aria-labelledby="ex-heading">
      <div className="section-head">
        <div className="label" id="ex-heading">ex tasks</div>
        <span className="badge badge-muted">{props.tasks.length} tasks</span>
      </div>
      <div className="ex-grid">
        {activeTasks.length
          ? activeTasks.map((task) => <ExTaskRow key={task.id} {...props} task={task} active />)
          : <p className="state-entry">— no active ex tasks —</p>}
        <details className="done-group ex-done-group">
          <summary>[{doneTasks.length} done — click to expand]</summary>
          <div className="ex-grid">
            {doneTasks.map((task) => <ExTaskRow key={task.id} {...props} task={task} />)}
          </div>
        </details>
      </div>
    </section>
  );
}
