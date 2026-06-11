import { JobRow, type Job } from './JobRow';

export function CodexPanel({ jobs }: { jobs: Job[] }) {
  const runningJobs = jobs.filter((job) => job.status === 'running');
  const finishedJobs = jobs.filter((job) => job.status !== 'running');

  return (
    <section className="panel" id="codex-instances-panel" aria-labelledby="codex-heading">
      <div className="section-head">
        <div className="label" id="codex-heading">codex instances</div>
        <span className="badge badge-muted">{runningJobs.length} running</span>
      </div>
      <div id="codex-jobs-list">
        {runningJobs.length
          ? runningJobs.map((job) => <JobRow key={job.jobId} job={job} />)
          : <p className="state-entry">— no running instances —</p>}
        {finishedJobs.length > 0 && (
          <details className="done-group">
            <summary>[{finishedJobs.length} completed — click to expand]</summary>
            {finishedJobs.map((job) => <JobRow key={job.jobId} job={job} />)}
          </details>
        )}
      </div>
    </section>
  );
}
