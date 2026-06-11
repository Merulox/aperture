export function BrainBus({ summary }: { summary: any }) {
  const data = summary ?? { pending: 0, claimed: 0, failed: 0, failedTasks: [] };

  return (
    <section className="panel" aria-labelledby="brain-heading">
      <div className="section-head">
        <div className="label" id="brain-heading">brain bus</div>
        <span className="badge badge-muted">queue</span>
      </div>
      <div className="queue-counts">
        <div><span className="queue-number">{data.pending}</span><span>pending</span></div>
        <div><span className="queue-number">{data.claimed}</span><span>claimed</span></div>
        <div><span className="queue-number">{data.failed}</span><span>failed</span></div>
      </div>
      {data.failedTasks.length > 0 && (
        <div className="failed-list">
          <div className="label">failed tasks</div>
          {data.failedTasks.map((task: any) => (
            <div className="failed-task" key={task.filename}>
              <span className="badge badge-red">{task.priority}</span>
              <span>{task.action}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
