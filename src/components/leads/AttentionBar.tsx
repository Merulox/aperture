import { useEffect, useState } from 'react';
import type { Attention, AttentionLevel } from '../../lib/attention';

interface Payload {
  items: Attention[];
  counts: Record<AttentionLevel, number>;
  generatedAt: string;
}

const LABEL: Record<AttentionLevel, string> = {
  urgent: 'Urgent',
  needs_you: 'Needs you',
  waiting_on_them: 'Waiting on them',
  scheduled: 'Scheduled',
};

export default function AttentionBar() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<boolean | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch('/api/leads-attention', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
        .then((payload: Payload) => { setData(payload); setError(''); })
        .catch((err: Error) => setError(err.message));
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (error) return <div className="attn-bar attn-error">Attention view unavailable: {error}</div>;
  if (!data) return <div className="attn-bar attn-loading">Checking which leads need you…</div>;

  const { counts } = data;
  const actionable = counts.urgent + counts.needs_you;
  const expanded = open ?? counts.urgent > 0;
  const items = data.items.filter((item) => showAll || item.level === 'urgent' || item.level === 'needs_you');

  return (
    <section className={`attn-bar ${expanded ? 'attn-open' : ''}`} aria-label="Leads needing attention">
      <button className="attn-summary" onClick={() => setOpen(!expanded)} aria-expanded={expanded}>
        <strong>{actionable === 0 ? 'Nothing needs you right now' : `${actionable} lead${actionable === 1 ? '' : 's'} need you`}</strong>
        {counts.urgent > 0 && <span className="attn-pill attn-urgent">{counts.urgent} urgent</span>}
        {counts.needs_you > 0 && <span className="attn-pill attn-needs_you">{counts.needs_you} needs you</span>}
        <span className="attn-pill attn-muted">{counts.waiting_on_them} waiting on them</span>
        <span className="attn-pill attn-muted">{counts.scheduled} scheduled</span>
        <span className="attn-toggle">{expanded ? 'hide' : 'show'}</span>
      </button>
      {expanded && (
        <>
          <div className="attn-cards">
            {items.length === 0 && <p className="attn-empty">No leads need a decision from you.</p>}
            {items.map((item) => (
              <article className={`attn-card attn-${item.level}`} key={item.phone}>
                <header>
                  <span className={`attn-pill attn-${item.level}`}>{LABEL[item.level]}</span>
                  <strong>{item.name}</strong>
                  <span className="attn-meta">{item.stage} · {item.phone}</span>
                </header>
                <dl>
                  <dt>Where it stands</dt>
                  <dd>{item.state}</dd>
                  <dt>What's expected of you</dt>
                  <dd>{item.awaited}</dd>
                </dl>
              </article>
            ))}
          </div>
          <footer className="attn-foot">
            <button onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Only what needs me' : 'Also show waiting and scheduled'}
            </button>
            <span>Derived from the CRM at {new Date(data.generatedAt).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })} · filter the list below by number to open a thread</span>
          </footer>
        </>
      )}
    </section>
  );
}
