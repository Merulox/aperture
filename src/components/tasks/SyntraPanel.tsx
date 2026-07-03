import { useState } from 'react';
import type { Job } from '../codex/JobRow';
import type { LaunchTask } from '../Taskboard';
import { CollapsiblePanel } from './CollapsiblePanel';

interface Props {
  tasks: any[];
  jobs: Job[];
  launchingTaskId: string;
  onLaunch: (task: LaunchTask) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

function BriefPreview({ task }: { task: any }) {
  return task.briefPath && (
    <details className="brief-preview">
      <summary>▶ View brief</summary>
      <pre>{task.briefExists ? task.briefPreview : `Brief not found at ${task.briefPath}`}</pre>
    </details>
  );
}

function Prompt({ task, jobs, launchingTaskId, onLaunch, onRefresh }: Props & { task: any }) {
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
          task.missingGates?.length > 0 ? (
            <div className="dep-gate">
              <button type="button" className="launch-codex btn-disabled" disabled>Send to Codex</button>
              <span className="dep-label">{task.missingGates.join(', ')}</span>
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
      <InputsForm task={task} onRefresh={onRefresh} />
    </div>
  );
}

function InputsForm({ task, onRefresh }: { task: any; onRefresh?: () => Promise<void> }) {
  const requiredInputs = task.requiredInputs || [];
  const requiredConfirms = task.requiredConfirms || [];
  const providedInputs = task.providedInputs || {};
  const providedConfirms = new Set(task.providedConfirms || []);
  const unmetInputs = requiredInputs.filter((input: string) => !providedInputs[input]);
  const unmetConfirms = requiredConfirms.filter((confirm: string) => !providedConfirms.has(confirm));
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [confirms, setConfirms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!requiredInputs.length && !requiredConfirms.length) return null;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payloadInputs = Object.fromEntries(unmetInputs.map((input: string) => [input, inputs[input] || '']));
      const payloadConfirms = unmetConfirms.filter((confirm: string) => confirms[confirm]);
      const response = await fetch('/api/brief-inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefPath: task.briefPath, inputs: payloadInputs, confirms: payloadConfirms }),
      });
      if (!response.ok) throw new Error(await response.text());
      await onRefresh?.();
      setInputs({});
      setConfirms({});
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="brief-inputs">
      {requiredInputs.map((input: string) => providedInputs[input] ? (
        <label className="brief-input-field" key={input}>
          <span>{input}</span>
          <input type="text" value={providedInputs[input]} readOnly />
        </label>
      ) : (
        <label className="brief-input-field" key={input}>
          <span>{input}</span>
          <input
            type="text"
            value={inputs[input] || ''}
            onChange={(event) => setInputs((current) => ({ ...current, [input]: event.target.value }))}
          />
        </label>
      ))}
      {requiredConfirms.map((confirm: string) => (
        <label className="brief-confirm-field" key={confirm}>
          <input
            type="checkbox"
            checked={providedConfirms.has(confirm) || Boolean(confirms[confirm])}
            disabled={providedConfirms.has(confirm)}
            onChange={(event) => setConfirms((current) => ({ ...current, [confirm]: event.target.checked }))}
          />
          <span>{confirm}</span>
        </label>
      ))}
      {(unmetInputs.length > 0 || unmetConfirms.length > 0) && (
        <button type="button" className="save-inputs" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving...' : 'Save inputs'}
        </button>
      )}
      {error && <p className="brief-input-error">{error}</p>}
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
