import { useCallback, useEffect, useRef, useState } from 'react';

interface Lead {
  name: string;
  phone: string;
  stage: string;
  lastMessage: { body: string; direction: 'in' | 'out'; ts: string } | null;
  unanswered: boolean;
}

interface Message {
  id: number;
  direction: 'in' | 'out';
  body: string;
  classification: string;
  source: string;
  ts: string;
  pending?: boolean;
}

const GSM = /^[\r\n @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-.\/0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\\[~\]|€]*$/;

function segmentInfo(body: string): string {
  const gsm = GSM.test(body);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  const segments = body.length <= single ? 1 : Math.ceil(body.length / multi);
  return `${body.length} chars · ${segments} SMS`;
}

function when(ts: string): string {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? ts : date.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LeadConsole() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [gatewayInstalled, setGatewayInstalled] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const loadLeads = useCallback(async () => {
    const response = await fetch('/api/leads');
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    setLeads(data.leads);
    setGatewayInstalled(data.gatewayInstalled);
  }, []);

  const loadThread = useCallback(async (phone: string) => {
    const response = await fetch(`/api/lead-thread?phone=${encodeURIComponent(phone)}`);
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    setMessages(data.messages);
  }, []);

  useEffect(() => {
    void loadLeads().catch((error) => setStatus(error.message));
  }, [loadLeads]);

  useEffect(() => {
    if (!selected) return;
    void loadThread(selected.phone).catch((error) => setStatus(error.message));
    const timer = window.setInterval(() => {
      void loadThread(selected.phone).catch((error) => setStatus(error.message));
      void loadLeads().catch(console.error);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [loadLeads, loadThread, selected]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const chooseLead = (lead: Lead) => {
    setSelected(lead);
    setMessages([]);
    setStatus('');
    setBody('');
  };

  const send = async () => {
    if (!selected || !body.trim() || sending || !gatewayInstalled) return;
    const outgoing = body.trim();
    setSending(true);
    setStatus('');
    try {
      const response = await fetch('/api/lead-send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: selected.phone, body: outgoing }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'Send failed');
      setMessages((current) => [...current, {
        id: Date.now(),
        direction: 'out',
        body: outgoing,
        classification: '',
        source: 'aperture-console',
        ts: new Date().toISOString(),
        pending: true,
      }]);
      setBody('');
      setStatus(result.result === 'noop' ? 'Already sent today; gateway returned no-op.' : 'Sent.');
      void loadLeads();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSending(false);
    }
  };

  const visible = leads.filter((lead) => {
    const query = filter.toLowerCase();
    return lead.name.toLowerCase().includes(query)
      || lead.phone.includes(query)
      || lead.stage.toLowerCase().includes(query);
  });

  return (
    <main className={`leads-main ${selected ? 'thread-open' : ''}`}>
      <header className="topbar leads-topbar">
        <div className="brand">aperture / leads</div>
        <div className="meta">
          <span>{leads.filter((lead) => lead.unanswered).length} unanswered</span>
          <a href="/" className="nav-link">dashboard</a>
          <a href="/tasks" className="nav-link">tasks</a>
        </div>
      </header>

      <div className="leads-console">
        <aside className="lead-list-panel">
          <input
            className="lead-filter"
            type="search"
            placeholder="Filter leads"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <div className="lead-list">
            {visible.map((lead) => (
              <button
                className={`lead-row ${selected?.phone === lead.phone ? 'selected' : ''}`}
                key={lead.phone}
                onClick={() => chooseLead(lead)}
              >
                <span className="lead-row-head">
                  <strong>{lead.name}</strong>
                  {lead.unanswered && <span className="unanswered-dot" title="Unanswered inbound" />}
                </span>
                <span className="lead-row-meta">
                  <span className="badge badge-muted">{lead.stage}</span>
                  <span>{lead.phone}</span>
                </span>
                <span className="lead-snippet">
                  {lead.lastMessage && `${lead.lastMessage.direction === 'in' ? '←' : '→'} ${lead.lastMessage.body}`}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="thread-panel">
          {selected ? (
            <>
              <header className="thread-head">
                <button className="thread-back" onClick={() => setSelected(null)}>← leads</button>
                <div>
                  <h1>{selected.name}</h1>
                  <span>{selected.phone} · {selected.stage}</span>
                </div>
              </header>
              <div className="thread-messages" ref={threadRef}>
                {messages.map((message) => (
                  <article className={`message-bubble message-${message.direction}`} key={message.id}>
                    <p>{message.body}</p>
                    <footer>
                      <span>{when(message.ts)}{message.pending ? ' · sending recorded' : ''}</span>
                      {message.classification && <span className="badge badge-muted">{message.classification}</span>}
                    </footer>
                  </article>
                ))}
              </div>
              <div className="compose">
                <textarea
                  value={body}
                  maxLength={1000}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Type a reply…"
                  aria-label="Reply body"
                />
                <div className="compose-footer">
                  <span className={status.startsWith('⛔') ? 'send-error' : ''}>{status || segmentInfo(body)}</span>
                  <button
                    className="send-button"
                    disabled={!body.trim() || sending || !gatewayInstalled}
                    title={gatewayInstalled ? 'Send reply' : 'BX-01 gateway not installed'}
                    onClick={() => void send()}
                  >
                    {sending ? 'sending…' : 'send'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="thread-empty">Select a lead to open the SMS thread.</div>
          )}
        </section>
      </div>
    </main>
  );
}
