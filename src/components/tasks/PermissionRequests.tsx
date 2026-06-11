import { useState, type FormEvent } from 'react';

interface Props {
  items: any[];
  onResponded: () => Promise<void>;
}

export function PermissionRequests({ items, onResponded }: Props) {
  const [submittingId, setSubmittingId] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    setSubmittingId(id);
    const form = event.currentTarget;

    try {
      const response = await fetch('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!response.ok) throw new Error(await response.text());
      form.reset();
      await onResponded();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmittingId('');
    }
  };

  return (
    <section className="panel" aria-labelledby="requests-heading">
      <div className="section-head">
        <div className="label" id="requests-heading">permission requests</div>
        <span className={`badge ${items.length ? 'badge-red' : 'badge-muted'}`}>{items.length} pending</span>
      </div>
      <div className="request-list">
        {items.length ? items.map((request) => (
          <div className={`request-card urgency-${request.urgency}`} key={request.id}>
            <div className="request-meta">{request.requestor} · {request.task} · {request.created}</div>
            <div className="request-question">{request.question}</div>
            {request.context && <div className="request-context">{request.context}</div>}
            <form className="request-form" onSubmit={(event) => void submit(event, request.id)}>
              <input type="hidden" name="id" value={request.id} />
              <textarea name="answer" placeholder="Your answer..." required />
              <button type="submit" disabled={submittingId === request.id}>
                {submittingId === request.id ? 'Responding...' : 'Respond'}
              </button>
            </form>
          </div>
        )) : <p className="state-entry">— no pending permission requests —</p>}
      </div>
    </section>
  );
}
