import { useCallback, useEffect, useMemo, useState } from 'react';
import { Nav } from '../Nav';

type RunStatus = 'queued' | 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled';

interface Intent {
  workId: string;
  title: string;
  contractPath: string;
  status: string;
  mode: string;
  riskTier: number;
  repository: string;
  model: string;
  valid: boolean;
  issues: string[];
  runnable: boolean;
  latestRunStatus: RunStatus | null;
  latestRunId: string | null;
}

interface Run {
  runId: string;
  workId: string;
  title: string;
  repository: string;
  model: string;
  runtimeIdentity: string;
  networkPolicy: string;
  status: RunStatus;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
  sessionId: string | null;
  changedPaths: string[];
  disallowedPaths: string[];
  failureClass: string | null;
  failureDetail: string | null;
  finalMessage: string | null;
  diffPath: string;
  logPath: string;
}

const TONE_BY_STATUS: Record<RunStatus, string> = {
  queued: 'badge-yellow',
  running: 'badge-blue',
  cancelling: 'badge-yellow',
  succeeded: 'badge-green',
  failed: 'badge-red',
  cancelled: 'badge-muted',
};

async function errorFrom(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return `${response.status} ${response.statusText}`;
}

export default function OmpPanel() {
  const [intents, setIntents] = useState<Intent[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  const refresh = useCallback(async () => {
    const [intentResponse, runResponse] = await Promise.all([
      fetch('/api/omp-intents'),
      fetch('/api/omp-runs'),
    ]);
    if (!intentResponse.ok) throw new Error(await errorFrom(intentResponse));
    if (!runResponse.ok) throw new Error(await errorFrom(runResponse));
    const intentBody = await intentResponse.json() as { intents?: Intent[] };
    const runBody = await runResponse.json() as { runs?: Run[] };
    setIntents(intentBody.intents ?? []);
    setRuns(runBody.runs ?? []);
    setLastUpdated(new Date().toLocaleTimeString('en-CA', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }));
    setError('');
  }, []);

  useEffect(() => {
    void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    const timer = window.setInterval(() => {
      void refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const launch = async (intent: Intent) => {
    setBusyId(intent.workId);
    setError('');
    try {
      const response = await fetch('/api/launch-omp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contractPath: intent.contractPath }),
      });
      if (!response.ok) throw new Error(await errorFrom(response));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId('');
    }
  };

  const cancel = async (run: Run) => {
    setBusyId(run.runId);
    setError('');
    try {
      const response = await fetch('/api/omp-runs', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId: run.runId }),
      });
      if (!response.ok) throw new Error(await errorFrom(response));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId('');
    }
  };

  const activeRuns = useMemo(() => runs.filter((run) => ['queued', 'running', 'cancelling'].includes(run.status)), [runs]);
  const completedRuns = useMemo(() => runs.filter((run) => !['queued', 'running', 'cancelling'].includes(run.status)), [runs]);

  return (
    <main>
      <Nav page="omp" subtitle="omp shadow">
        <span>Last updated: {lastUpdated || 'loading'}</span>
      </Nav>

      <div className="omp-layout">
        <section className="panel panel-wide omp-boundary" aria-labelledby="omp-boundary-heading">
          <div className="section-head">
            <div className="label" id="omp-boundary-heading">shadow boundary</div>
            <span className="badge badge-yellow">opt-in only</span>
          </div>
          <p className="state-line">Runs execute in disposable clones. No automatic merge, commit, restart, deploy, or Codex cutover.</p>
          <p className="state-entry">Worker filesystem: clone + public contract + read-only toolchain. Model access: internal network → credential gateway. Existing `/api/launch-codex` remains the default.</p>
          {error && <p className="omp-error" role="alert">{error}</p>}
        </section>

        <section className="panel" aria-labelledby="omp-contracts-heading">
          <div className="section-head">
            <div className="label" id="omp-contracts-heading">kernel v2 contracts</div>
            <span className="badge badge-muted">{intents.length} found</span>
          </div>
          <div className="omp-stack">
            {intents.length === 0 && <p className="state-entry">— no contracts —</p>}
            {intents.map((intent) => (
              <article className="omp-card" key={intent.contractPath}>
                <div className="omp-card-head">
                  <strong>{intent.workId}</strong>
                  <span className={`badge ${intent.valid ? 'badge-blue' : 'badge-red'}`}>{intent.valid ? intent.status : 'invalid'}</span>
                </div>
                <p className="omp-title">{intent.title}</p>
                <dl className="omp-meta">
                  <div><dt>mode</dt><dd>{intent.mode || '—'}</dd></div>
                  <div><dt>risk</dt><dd>tier {intent.riskTier}</dd></div>
                  <div><dt>model</dt><dd>{intent.model}</dd></div>
                  <div><dt>latest</dt><dd>{intent.latestRunStatus ?? 'never'}</dd></div>
                </dl>
                {intent.issues.length > 0 && <p className="omp-issue">{intent.issues.join(' · ')}</p>}
                <button
                  className="btn-sm btn-sm-primary"
                  type="button"
                  disabled={!intent.runnable || Boolean(busyId)}
                  onClick={() => void launch(intent)}
                >
                  {busyId === intent.workId ? 'launching…' : 'run isolated shadow'}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel" aria-labelledby="omp-runs-heading">
          <div className="section-head">
            <div className="label" id="omp-runs-heading">shadow runs</div>
            <span className="badge badge-muted">{activeRuns.length} active</span>
          </div>
          <div className="omp-stack">
            {runs.length === 0 && <p className="state-entry">— no runs yet —</p>}
            {[...activeRuns, ...completedRuns].map((run) => (
              <article className="omp-card" key={run.runId}>
                <div className="omp-card-head">
                  <strong>{run.workId}</strong>
                  <span className={`badge ${TONE_BY_STATUS[run.status]}`}>{run.status}</span>
                </div>
                <p className="omp-title">{run.title}</p>
                <dl className="omp-meta">
                  <div><dt>run</dt><dd>{run.runId.slice(0, 12)}</dd></div>
                  <div><dt>session</dt><dd>{run.sessionId?.slice(0, 12) ?? 'pending'}</dd></div>
                  <div><dt>changes</dt><dd>{run.changedPaths.length}</dd></div>
                  <div><dt>started</dt><dd>{new Date(run.startedAt).toLocaleString('en-CA')}</dd></div>
                </dl>
                {run.failureDetail && <p className="omp-issue">{run.failureClass}: {run.failureDetail}</p>}
                {run.finalMessage && <pre className="omp-output">{run.finalMessage}</pre>}
                {['queued', 'running'].includes(run.status) && (
                  <button className="btn-sm" type="button" disabled={Boolean(busyId)} onClick={() => void cancel(run)}>
                    {busyId === run.runId ? 'cancelling…' : 'cancel run'}
                  </button>
                )}
                {!['queued', 'running', 'cancelling'].includes(run.status) && (
                  <p className="omp-evidence">evidence: {run.logPath}<br />diff: {run.diffPath}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
