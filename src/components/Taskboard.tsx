import { useCallback, useEffect, useState } from 'react';
import { CodexPanel } from './codex/CodexPanel';
import type { Job } from './codex/JobRow';
import { ExPanel } from './tasks/ExPanel';
import { SyntraPanel } from './tasks/SyntraPanel';
import { PermissionRequests } from './tasks/PermissionRequests';
import { BrainBus } from './tasks/BrainBus';
import { EscalationPanel } from './tasks/EscalationPanel';

export interface LaunchTask {
  id: string;
  title: string;
  briefPath: string;
  prompt: string;
}

export default function Taskboard() {
  const [data, setData] = useState<any>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [launchingTaskId, setLaunchingTaskId] = useState('');

  const refreshData = useCallback(async () => {
    const response = await fetch('/api/tasks-data');
    if (!response.ok) throw new Error(await response.text());
    setData(await response.json());
    setLastUpdated(new Date().toLocaleTimeString('en-CA', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }));
  }, []);

  const refreshJobs = useCallback(async () => {
    const response = await fetch('/api/codex-jobs');
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    setJobs(result.jobs || []);
  }, []);

  useEffect(() => {
    void refreshData().catch(console.error);
    const timer = window.setInterval(() => void refreshData().catch(console.error), 30_000);
    return () => window.clearInterval(timer);
  }, [refreshData]);

  useEffect(() => {
    void refreshJobs().catch(console.error);
    const timer = window.setInterval(() => void refreshJobs().catch(console.error), 5_000);
    return () => window.clearInterval(timer);
  }, [refreshJobs]);

  const launchTask = async (task: LaunchTask) => {
    setLaunchingTaskId(task.id);
    try {
      const response = await fetch('/api/launch-codex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          taskTitle: task.title,
          briefPath: task.briefPath,
          prompt: task.prompt,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      await refreshJobs();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setLaunchingTaskId('');
    }
  };

  const overlayJobs = (tasks: any[]) => tasks.map((task) => {
    if (task.status !== 'briefed') return task;
    const job = jobs.filter((item) => item.taskId === task.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (!job) return task;
    if (job.status === 'running') return { ...task, status: 'in_progress', statusBadge: 'RUNNING', statusTone: 'blue', prompt: '' };
    if (job.status === 'done') {
      const finished = job.finishedAt ? `finished ${new Date(job.finishedAt).toLocaleString('en-CA')}` : 'finished';
      return { ...task, status: 'awaiting_verify', statusBadge: 'AWAITING VERIFY', statusTone: 'orange', prompt: '', jobFinishedAt: job.finishedAt, riskGate: finished, notes: finished };
    }
    if (job.status === 'failed') return { ...task, statusBadge: 'FAILED — RELAUNCH', statusTone: 'red' };
    return { ...task, statusBadge: 'BLOCKED — see reason', statusTone: 'red', blockedReason: job.blockedReason, riskGate: job.blockedReason, notes: job.blockedReason };
  });

  return (
    <main>
      <header className="topbar">
        <div className="brand">aperture / tasks</div>
        <div className="taskboard-meta">
          <span>Last updated: {lastUpdated}</span>
          <a href="/" className="nav-link">dashboard</a>
        </div>
      </header>
      <div className="taskboard">
        <PermissionRequests items={data?.permissionRequests ?? []} onResponded={refreshData} />
        <EscalationPanel />
        <ExPanel tasks={overlayJobs(data?.exTasks ?? [])} jobs={jobs} launchingTaskId={launchingTaskId} onLaunch={launchTask} />
        <SyntraPanel tasks={overlayJobs(data?.syntraTasks ?? [])} jobs={jobs} launchingTaskId={launchingTaskId} onLaunch={launchTask} />
        <CodexPanel jobs={jobs} />
        <BrainBus summary={data?.brainBus} />
      </div>
    </main>
  );
}
