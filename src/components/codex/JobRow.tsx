import { useEffect, useRef } from 'react';

export interface Job {
  jobId: string;
  taskId: string;
  taskTitle: string;
  startedAt: string;
  finishedAt: string | null;
  pid: number;
  status: 'running' | 'done' | 'failed';
  logTail: string;
}

function elapsed(startedAt: string, finishedAt: string | null): string {
  const end = finishedAt ? new Date(finishedAt) : new Date();
  const seconds = Math.max(0, Math.floor((end.getTime() - new Date(startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function JobRow({ job }: { job: Job }) {
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (job.status === 'running' && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job.logTail, job.status]);

  const tone = job.status === 'running' ? 'blue' : job.status === 'done' ? 'muted' : 'red';
  return (
    <div className={`codex-job status-${job.status}`}>
      <span className="task-id">{job.taskId}</span>
      <span className={`badge badge-${tone}`}>{job.status.toUpperCase()}</span>
      <span className="task-title">{job.taskTitle}</span>
      <span className="elapsed">{elapsed(job.startedAt, job.finishedAt)}</span>
      <pre className="job-log" ref={logRef}>{job.logTail || '(no output yet)'}</pre>
    </div>
  );
}
