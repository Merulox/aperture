import { useEffect, useRef, useState } from 'react';

export interface Job {
  jobId: string;
  taskId: string;
  taskTitle: string;
  startedAt: string;
  finishedAt: string | null;
  pid: number;
  status: 'running' | 'done' | 'failed' | 'blocked';
  logTail: string;
  blockedReason?: string;
}

function elapsed(startedAt: string, finishedAt: string | null): string {
  const end = finishedAt ? new Date(finishedAt) : new Date();
  const seconds = Math.max(0, Math.floor((end.getTime() - new Date(startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function JobRow({ job }: { job: Job }) {
  const logRef = useRef<HTMLPreElement>(null);
  const [lines, setLines] = useState<string[]>(job.logTail ? job.logTail.split('\n') : []);
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (job.status !== 'running') return;

    const es = new EventSource(`/api/log-stream?jobId=${job.jobId}`);
    es.onmessage = (event) => {
      setLines((previous) => [...previous, event.data]);
      setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 0);
    };
    es.addEventListener('done', () => es.close());
    return () => es.close();
  }, [job.jobId, job.status]);

  useEffect(() => {
    if (job.status !== 'running') return;
    const refresh = () =>
      fetch(`/api/summarize-job?jobId=${job.jobId}`)
        .then(r => r.json())
        .then(d => setSummary(d.summary || ''));
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [job.jobId, job.status]);

  const tone = job.status === 'running' ? 'blue' : job.status === 'done' ? 'muted' : 'red';
  const log = job.status === 'running' ? lines.join('\n') : job.logTail;
  return (
    <div className={`codex-job status-${job.status}`}>
      <span className="task-id">{job.taskId}</span>
      <span className={`badge badge-${tone}`}>{job.status.toUpperCase()}</span>
      <span className="task-title">{job.taskTitle}</span>
      <span className="elapsed">{elapsed(job.startedAt, job.finishedAt)}</span>
      {job.status === 'blocked' && job.blockedReason && (
        <details className="blocked-reason">
          <summary>Blocked reason</summary>
          <p>{job.blockedReason}</p>
        </details>
      )}
      {summary && <span className="job-summary">{summary}</span>}
      <pre className="job-log" ref={logRef}>{log || '(no output yet)'}</pre>
    </div>
  );
}
