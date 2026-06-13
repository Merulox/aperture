import { useCallback, useEffect, useState } from 'react';

interface Escalation {
  jobId: string;
  taskId: string;
  category: string;
  message: string;
}

export function EscalationPanel() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/escalations');
    if (!response.ok) throw new Error(await response.text());
    setEscalations(await response.json());
  }, []);

  useEffect(() => {
    void refresh().catch(console.error);
    const timer = window.setInterval(() => void refresh().catch(console.error), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const dismiss = async (jobId: string) => {
    const response = await fetch(`/api/escalations?jobId=${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error(await response.text());
    await refresh();
  };

  if (!escalations.length) return null;

  return (
    <section className="escalation-panel" aria-label="Pending escalations">
      {escalations.map((escalation) => (
        <div className="escalation-item" key={escalation.jobId}>
          <span className="badge badge-red">{escalation.taskId || escalation.jobId}</span>
          <span className="escalation-category">{escalation.category}</span>
          <span className="escalation-message">{escalation.message}</span>
          <button
            type="button"
            className="dismiss-btn"
            onClick={() => void dismiss(escalation.jobId).catch(console.error)}
          >
            Dismiss
          </button>
        </div>
      ))}
    </section>
  );
}
