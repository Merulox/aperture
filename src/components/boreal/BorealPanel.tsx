import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Client {
  name: string;
  owner: string;
  trade: string;
  city: string;
  business_type: string;
  notes: string;
}

interface ServiceStatus {
  name: string;
  active: boolean;
}

interface BorealData {
  clients: Record<string, Client>;
  services: ServiceStatus[];
}

interface LeadGrouped {
  phone: string;
  name: string;
  stage: string;
  notes: string;
  close_touch: number;
  responded_at: string;
  close_last_ts: string;
  sent_date: string;
  postpone_until: string;
  postpone_note: string;
  tags: string[];
  template: string;
  last_ts: string;
  last_body: string;
  last_classification: string;
  _variant: string;
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

interface FqRow {
  name: string;
  phone: string;
  days: number;
  stage: string;
  message: string;
  classification: string;
  will_fire: boolean;
  skip_reason?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const QUICK_TAGS = [
  { tag: '📞 MESSAGERIE LAISSÉE', desc: 'Voicemail laissé' },
  { tag: '⏳ ATTEND MON RETOUR', desc: 'Balle dans mon camp' },
  { tag: '🔔 RAPPELLE MOI', desc: 'Ils vont rappeler' },
  { tag: '📋 DEVIS À ENVOYER', desc: 'Attend le devis' },
  { tag: '📨 DEVIS ENVOYÉ', desc: 'Devis parti — balle dans leur camp' },
  { tag: '📅 RDV CONFIRMÉ', desc: 'Meeting booké et confirmé' },
  { tag: '🔥 TRÈS INTÉRESSÉ', desc: 'Lead chaud, priorité' },
  { tag: '❓ MAUVAIS TIMING', desc: 'Occupé — recontacter plus tard' },
  { tag: '🚫 PAS DE MESSAGERIE', desc: 'Tombe sur boite pleine' },
  { tag: '💬 SMS SEULEMENT', desc: 'Prefere le SMS' },
];

const TIPS = [
  "Ouvre avec une raison claire: \"Je vous appelle parce que j'aide les entrepreneurs en [métier] à automatiser leurs suivis clients.\"",
  "Pause de 2 secondes après l'intro — laisse-les répondre avant de continuer.",
  "Mirror technique: répète les 2-3 derniers mots qu'ils ont dits pour les faire développer.",
  "Si objection \"pas intéressé\": \"Je comprends, c'est normal. C'est quoi le plus gros défi côté suivi client en ce moment?\"",
  "Si objection \"trop occupé\": \"Parfait, ça prend 8 minutes. Quand êtes-vous libre cette semaine?\"",
  "Ne justifie pas ton prix — ancre d'abord la valeur (\"combien ça vous coûte de perdre un lead?\").",
  "Objectif de l'appel: pas vendre, juste booker un appel découverte de 30 min.",
  "Termine toujours avec une question fermée: \"Mardi 10h ou jeudi 14h, lequel vous convient?\"",
  "Si ça décroche en messagerie: ne laisse pas de message long — rappelle dans 4h.",
  "Ton ≠ script. Sois curieux, pas vendeur.",
];

const GSM = /^[\r\n @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-.\/0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\\[~\]|€]*$/;

function segmentInfo(body: string): string {
  const gsm = GSM.test(body);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  const segs = body.length <= single ? 1 : Math.ceil(body.length / multi);
  return `${body.length} chars · ${segs} SMS`;
}

function shortTs(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts.slice(5, 16) : d.toLocaleString('fr-CA', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Client registry ──────────────────────────────────────────────────────────

function AddClientForm({ onAdded }: { onAdded: () => void }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [trade, setTrade] = useState('');
  const [city, setCity] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch('/api/boreal-clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone, name, owner, trade, city, business_type: businessType, notes }),
    });
    const json = await res.json() as { error?: string };
    if (!res.ok) {
      setError(json.error ?? 'error');
    } else {
      setPhone(''); setName(''); setOwner(''); setTrade(''); setCity(''); setBusinessType(''); setNotes('');
      onAdded();
    }
    setSaving(false);
  };

  return (
    <form className="add-client-form" onSubmit={(e) => void submit(e)}>
      <div className="form-row">
        <input className="input-field" placeholder="+15141234567" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <input className="input-field" placeholder="Plomberie Tremblay" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="input-field" placeholder="Marc (owner first name)" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <input className="input-field" placeholder="plomberie" value={trade} onChange={(e) => setTrade(e.target.value)} />
        <input className="input-field" placeholder="Montréal" value={city} onChange={(e) => setCity(e.target.value)} />
        <input className="input-field" placeholder="type (indépendant / Inc. / SENC)" value={businessType} onChange={(e) => setBusinessType(e.target.value)} />
        <input className="input-field" placeholder="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="btn btn-add" type="submit" disabled={saving}>{saving ? '...' : '+ add'}</button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

function ClientRow({ phone, client, onRemoved }: { phone: string; client: Client; onRemoved: () => void }) {
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    if (!confirm(`Remove ${client.name} (${phone})?`)) return;
    setRemoving(true);
    await fetch('/api/boreal-clients', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    onRemoved();
  };

  return (
    <div className="client-row">
      <span className="client-phone">{phone}</span>
      <span className="client-name">{client.name}</span>
      {client.owner && <span className="client-owner tag">owner: {client.owner}</span>}
      {client.trade && <span className="client-trade tag">{client.trade}</span>}
      {client.city && <span className="client-city tag">{client.city}</span>}
      {client.business_type && <span className="client-btype tag">{client.business_type}</span>}
      {client.notes && <span className="client-notes">{client.notes}</span>}
      <button className="btn btn-remove" onClick={() => void remove()} disabled={removing}>×</button>
    </div>
  );
}

// ── Followup queue banner ─────────────────────────────────────────────────────

function FollowupQueueBanner() {
  const [rows, setRows] = useState<FqRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/followup-preview');
        if (r.ok) setRows(await r.json() as FqRow[]);
      } catch { /* noop */ }
      setLoading(false);
    })();
  }, []);

  const firing = rows.filter((r) => r.will_fire);
  const skipped = rows.filter((r) => !r.will_fire);

  return (
    <div className="fq-panel">
      <button className="fq-toggle" onClick={() => setOpen((o) => !o)}>
        📨 FOLLOWUP QUEUE — prochaine vague automatique {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="fq-body" style={{ marginTop: 10 }}>
          {loading ? (
            <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Chargement...</span>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.72rem' }}>
                  <strong style={{ color: 'var(--green)' }}>{firing.length} va partir</strong>
                  <span style={{ color: 'var(--muted)', marginLeft: 10 }}>{skipped.length} ignoré</span>
                </span>
              </div>
              {firing.length === 0
                ? <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--muted)' }}>Aucun SMS prévu à la prochaine vague.</p>
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                    <thead>
                      <tr style={{ color: 'var(--muted)', fontSize: '0.62rem', textTransform: 'uppercase', borderBottom: '1px solid #222' }}>
                        <td style={{ padding: '3px 6px' }}>LEAD</td>
                        <td style={{ padding: '3px 6px' }}>J+</td>
                        <td style={{ padding: '3px 6px' }}>STAGE</td>
                        <td style={{ padding: '3px 6px' }}>MESSAGE</td>
                      </tr>
                    </thead>
                    <tbody>
                      {firing.map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #1a1a1a', background: 'rgba(52,211,153,.04)' }}>
                          <td style={{ padding: '4px 6px', fontWeight: 600 }}>{row.name}</td>
                          <td style={{ padding: '4px 6px', color: 'var(--muted)' }}>J+{row.days}</td>
                          <td style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--blue)' }}>{row.stage}</td>
                          <td style={{ padding: '4px 6px', color: 'var(--muted)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={row.message}>{row.message?.slice(0, 80)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
              {skipped.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: '0.65rem', color: 'var(--muted)', cursor: 'pointer' }}>▸ {skipped.length} IGNORÉS</summary>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 4 }}>
                    {skipped.map((r, i) => <div key={i}>{r.name} — {r.skip_reason ?? '—'}</div>)}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function OwnerNameField({ phone, value, onSaved }: { phone: string; value: string; onSaved: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const save = async () => {
    await fetch('/api/lead-owner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, owner_name: draft }) });
    onSaved(draft);
    setEditing(false);
  };
  if (editing) return (
    <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false); }} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '1px 4px', fontSize: '0.75rem', borderRadius: '2px', width: '120px' }} />
      <button type="button" onClick={() => void save()} style={{ fontSize: '0.65rem', color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer' }}>✓</button>
    </span>
  );
  return (
    <span className="incall-contact-val" onClick={() => { setDraft(value); setEditing(true); }} style={{ cursor: 'pointer', color: value ? 'var(--text)' : 'var(--muted)', borderBottom: '1px dashed var(--border)' }} title="Cliquer pour modifier">
      {value || '—'}
    </span>
  );
}

// ── Incall leads console ──────────────────────────────────────────────────────

function LeadsSection() {
  // Data
  const [groups, setGroups] = useState<Record<string, LeadGrouped[]>>({});
  const [gatewayInstalled, setGatewayInstalled] = useState(false);
  const [calendlyLink, setCalendlyLink] = useState('');

  // List panel state
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'recent' | 'name' | 'stage'>('recent');
  const [variants, setVariants] = useState<Set<string>>(new Set(['booked', 'responded', 'postponed', 'froid']));

  // Detail panel state
  const [selected, setSelected] = useState<LeadGrouped | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesStatus, setNotesStatus] = useState('');
  const [brief, setBrief] = useState('');
  const [briefLoading, setBriefLoading] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);

  const loadGroups = useCallback(async () => {
    const r = await fetch('/api/leads-grouped');
    if (r.ok) setGroups(await r.json() as Record<string, LeadGrouped[]>);
  }, []);

  const loadThread = useCallback(async (phone: string) => {
    const r = await fetch(`/api/lead-thread?phone=${encodeURIComponent(phone)}`);
    if (r.ok) {
      const d = await r.json() as { messages: Message[] };
      setMessages(d.messages);
    }
  }, []);

  useEffect(() => {
    void loadGroups().catch(console.error);
    fetch('/api/leads').then((r) => r.json()).then((d: unknown) => {
      if (d && typeof d === 'object' && 'gatewayInstalled' in d) {
        setGatewayInstalled((d as { gatewayInstalled: boolean }).gatewayInstalled);
      }
    }).catch(console.error);
    fetch('/api/calendly-link').then((r) => r.json()).then((d: unknown) => {
      if (d && typeof d === 'object' && 'link' in d) setCalendlyLink((d as { link: string }).link);
    }).catch(console.error);
  }, [loadGroups]);

  useEffect(() => {
    if (!selected) return;
    void loadThread(selected.phone).catch(console.error);
    void (async () => {
      const r = await fetch(`/api/lead-notes?phone=${encodeURIComponent(selected.phone)}`);
      if (r.ok) {
        const d = await r.json() as { notes: string };
        setNotes(d.notes ?? '');
      }
    })().catch(console.error);
    const timer = window.setInterval(() => {
      void loadThread(selected.phone).catch(console.error);
      void loadGroups().catch(console.error);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [selected, loadThread, loadGroups]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  // ── Lead list helpers ──────────────────────────────────────────────────────

  const allLeads: LeadGrouped[] = [];
  const VARIANT_ORDER = ['booked', 'responded', 'postponed', 'froid', 'stop', 'banned'];
  for (const v of VARIANT_ORDER) {
    for (const l of groups[v] ?? []) {
      allLeads.push({ ...l, _variant: v });
    }
  }

  let filtered = allLeads.filter((l) => {
    if (!variants.has(l._variant)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.name.toLowerCase().includes(q) && !l.phone.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'stage') {
    const order: Record<string, number> = { booked: 0, responded: 1, postponed: 2, froid: 3, stop: 4, banned: 5 };
    filtered.sort((a, b) => (order[a._variant] ?? 9) - (order[b._variant] ?? 9));
  }

  const stageColor = (v: string) =>
    v === 'booked' ? 'var(--yellow)' : v === 'froid' ? '#f97316' : v === 'stop' || v === 'banned' ? 'var(--muted)' : 'var(--blue)';
  const stageLabel = (v: string) =>
    v === 'booked' ? 'BOOKÉ' : v === 'postponed' ? 'POSTPONÉ' : v === 'froid' ? 'FROID' : v === 'stop' ? 'STOP' : v === 'banned' ? 'BANNED' : 'RESPONDED';

  const toggleVariant = (v: string) => setVariants((cur) => {
    const next = new Set(cur);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  });

  // ── Detail panel actions ───────────────────────────────────────────────────

  const selectLead = (lead: LeadGrouped) => {
    setSelected(lead);
    setMessages([]);
    setReplyBody('');
    setSendStatus('');
    setBrief('');
    setBriefLoading(false);
    setNotes('');
    setNotesStatus('');
  };

  const sendReply = async () => {
    if (!selected || !replyBody.trim() || sending || !gatewayInstalled) return;
    const text = replyBody.trim();
    setSending(true);
    setSendStatus('');
    try {
      const r = await fetch('/api/lead-send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: selected.phone, body: text }),
      });
      const d = await r.json() as { ok: boolean; message?: string };
      if (!r.ok || !d.ok) throw new Error(d.message ?? 'Send failed');
      setMessages((cur) => [...cur, {
        id: Date.now(), direction: 'out', body: text,
        classification: '', source: 'aperture', ts: new Date().toISOString(), pending: true,
      }]);
      setReplyBody('');
      setSendStatus('Envoyé.');
      void loadGroups();
    } catch (e) {
      setSendStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const toggleTag = async (tag: string) => {
    if (!selected) return;
    const cur = selected.tags ?? [];
    const next = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
    setSelected({ ...selected, tags: next });
    await fetch('/api/lead-tag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: selected.phone, tags: next }),
    }).catch(console.error);
  };

  const changeStage = async (stage: string) => {
    if (!selected) return;
    await fetch('/api/lead-stage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: selected.phone, stage }),
    });
    setSelected({ ...selected, stage, _variant: stage.toLowerCase() });
    void loadGroups();
  };

  const saveNotes = async () => {
    if (!selected) return;
    setNotesSaving(true);
    await fetch('/api/lead-notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: selected.phone, notes }),
    }).catch(console.error);
    setNotesSaving(false);
    setNotesStatus('Sauvegardé.');
    setTimeout(() => setNotesStatus(''), 2000);
  };

  const generateBrief = async () => {
    if (!selected || briefLoading) return;
    setBriefLoading(true);
    setBrief('');
    try {
      const r = await fetch('/api/incall-brief', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phone: selected.phone,
          name: selected.name,
          template: selected.template,
          notes: selected.notes,
          messages: messages.slice(-4).map((m) => ({ direction: m.direction, body: m.body })),
        }),
      });
      const d = await r.json() as { ok: boolean; brief?: string; error?: string };
      if (!d.ok) throw new Error(d.error ?? 'Brief failed');
      setBrief(d.brief ?? '');
    } catch (e) {
      setBrief(`Erreur: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBriefLoading(false);
    }
  };

  const copyPhone = () => selected && void navigator.clipboard.writeText(selected.phone);

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalActive =
    (groups.booked?.length ?? 0) + (groups.responded?.length ?? 0) + (groups.postponed?.length ?? 0);

  return (
    <section className="panel panel-wide leads-section" aria-labelledby="leads-heading">
      <div className="section-head">
        <div className="label" id="leads-heading">leads</div>
        <span className="badge badge-muted">{totalActive} actifs · {filtered.length} affichés</span>
      </div>

      <FollowupQueueBanner />

      <div className="incall-wrap">
        {/* LEFT — lead list */}
        <div className="incall-list">
          <input
            className="lead-filter"
            type="search"
            placeholder="Chercher un lead..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="incall-sort-bar">
            {(['recent', 'name', 'stage'] as const).map((s) => (
              <button key={s} className={`incall-sort-btn ${sort === s ? 'active' : ''}`} onClick={() => setSort(s)}>
                {s === 'recent' ? 'RÉCENT' : s === 'name' ? 'NOM' : 'STAGE'}
              </button>
            ))}
          </div>

          <div className="incall-variant-row">
            {['booked', 'responded', 'postponed', 'froid'].map((v) => (
              <button
                key={v}
                className={`incall-variant-pill ${variants.has(v) ? 'active' : ''}`}
                onClick={() => toggleVariant(v)}
              >
                {stageLabel(v)}
              </button>
            ))}
          </div>

          <div className="incall-lead-count">{filtered.length} / {allLeads.length} LEADS</div>

          <div className="incall-list-scroll">
            {filtered.map((lead, i) => (
              <button
                key={`${lead.phone}-${i}`}
                className={`incall-item ${selected?.phone === lead.phone ? 'selected' : ''}`}
                onClick={() => selectLead(lead)}
              >
                <div className="incall-item-name">{lead.name}</div>
                {lead.owner_name && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--accent)', marginBottom: '1px' }}>{lead.owner_name}</div>
                )}
                {lead.template && (
                  <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: '2px' }}>{lead.template.replace(/-/g, ' ')}</div>
                )}
                <div className="incall-item-meta">
                  <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{lead.phone.slice(-10)}</span>
                  <span className="incall-stage-badge" style={{ color: stageColor(lead._variant) }}>
                    {stageLabel(lead._variant)}
                  </span>
                </div>
                {lead.last_body && (
                  <div className="lead-snippet">{lead.last_body.slice(0, 60)}</div>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '20px 12px', color: 'var(--muted)', fontSize: '0.72rem' }}>
                Aucun lead.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — detail */}
        <div className="incall-detail">
          {selected ? (
            <>
              {/* Phone number */}
              <div className="incall-phone-big" onClick={copyPhone} title="Cliquer pour copier">
                📞 {selected.phone}
              </div>

              {/* CONTACT + LIENS RAPIDES side by side */}
              <div className="incall-grid-top">
                {/* CONTACT */}
                <div className="incall-panel">
                  <div className="incall-panel-header">CONTACT</div>
                  <div className="incall-panel-body">
                    <div className="incall-contact-row">
                      <span className="incall-contact-lbl">ENTREPRISE</span>
                      <span className="incall-contact-val">{selected.name}</span>
                    </div>
                    <div className="incall-contact-row">
                      <span className="incall-contact-lbl">PROPRIÉTAIRE</span>
                      <OwnerNameField phone={selected.phone} value={selected.owner_name ?? ''} onSaved={(v) => setSelected((s) => s ? { ...s, owner_name: v } : s)} />
                    </div>
                    <div className="incall-contact-row">
                      <span className="incall-contact-lbl">TÉLÉPHONE</span>
                      <span className="incall-contact-val">{selected.phone}</span>
                    </div>
                    {selected.template && (
                      <div className="incall-contact-row">
                        <span className="incall-contact-lbl">TEMPLATE</span>
                        <span className="incall-contact-val">{selected.template}</span>
                      </div>
                    )}
                    {selected.notes && (
                      <div className="incall-contact-row">
                        <span className="incall-contact-lbl">NOTES CRM</span>
                        <span className="incall-contact-val" style={{ color: 'var(--yellow)' }}>{selected.notes}</span>
                      </div>
                    )}
                    <div className="incall-contact-row">
                      <span className="incall-contact-lbl">STAGE</span>
                      <span className="incall-contact-val" style={{ color: stageColor(selected._variant), fontWeight: 700 }}>
                        {stageLabel(selected._variant)}
                      </span>
                    </div>
                    {selected.close_touch > 0 && (
                      <div className="incall-contact-row">
                        <span className="incall-contact-lbl">TOUCH</span>
                        <span className="incall-contact-val">T{selected.close_touch}</span>
                      </div>
                    )}
                    {selected.tags.length > 0 && (
                      <div className="incall-contact-row" style={{ alignItems: 'flex-start' }}>
                        <span className="incall-contact-lbl" style={{ paddingTop: 2 }}>TAGS</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {selected.tags.map((t) => (
                            <span key={t} style={{ background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.3)', color: '#f97316', padding: '1px 6px', borderRadius: 10, fontSize: '0.62rem' }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '.08em', marginBottom: 5, textTransform: 'uppercase' }}>STATUT RAPIDE</div>
                      <div className="quick-tags">
                        {QUICK_TAGS.map(({ tag, desc }) => (
                          <button
                            key={tag}
                            className={`quick-tag-btn ${selected.tags.includes(tag) ? 'active' : ''}`}
                            title={desc}
                            onClick={() => void toggleTag(tag)}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* LIENS RAPIDES */}
                <div className="incall-panel">
                  <div className="incall-panel-header">LIENS RAPIDES</div>
                  <div className="incall-panel-body">
                    <a
                      className="quick-link-btn"
                      href={`https://www.google.com/search?q=${encodeURIComponent(selected.name)}`}
                      target="_blank" rel="noreferrer"
                    >
                      🔍 Google — {selected.name}
                    </a>
                    <a
                      className="quick-link-btn"
                      href={`https://www.facebook.com/search/top?q=${encodeURIComponent(selected.name)}`}
                      target="_blank" rel="noreferrer"
                    >
                      📘 Facebook — {selected.name}
                    </a>
                    <a
                      className="quick-link-btn"
                      href={`https://www.google.com/maps/search/${encodeURIComponent(selected.name)}`}
                      target="_blank" rel="noreferrer"
                    >
                      📍 Google Maps
                    </a>
                    <button className="quick-link-btn" onClick={copyPhone}>
                      📋 Copier numéro
                    </button>
                  </div>
                </div>
              </div>

              {/* CONVERSATION SMS */}
              <div className="incall-panel">
                <div className="incall-panel-header">
                  CONVERSATION SMS
                  <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--muted)' }}>{messages.length} msgs</span>
                </div>
                <div className="incall-panel-body">
                  {messages.length > 0 ? (
                    <div className="incall-sms-thread" ref={threadRef}>
                      {messages.map((msg) => (
                        <div key={msg.id} className={`incall-msg ${msg.direction === 'out' ? 'incall-msg-out' : 'incall-msg-in'}`}>
                          <div>{msg.body}</div>
                          <div className="incall-msg-ts">
                            {shortTs(msg.ts)}
                            {msg.pending ? ' · en attente' : ''}
                            {msg.classification ? ` [${msg.classification}]` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--muted)', fontSize: '0.72rem', marginBottom: 10 }}>Aucun message SMS.</div>
                  )}

                  <div className="incall-reply-row">
                    <textarea
                      className="incall-reply-input"
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder="Répondre par SMS..."
                      maxLength={1000}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void sendReply();
                      }}
                    />
                    <button
                      className="btn-sm btn-sm-primary"
                      disabled={!replyBody.trim() || sending || !gatewayInstalled}
                      onClick={() => void sendReply()}
                    >
                      {sending ? '...' : 'Envoyer'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: '0.65rem', color: sendStatus.startsWith('⛔') || sendStatus.startsWith('Erreur') ? 'var(--red)' : 'var(--muted)' }}>
                    <span>{sendStatus || segmentInfo(replyBody)}</span>
                  </div>

                  <div className="incall-stage-row">
                    <button className="stage-btn stage-btn-booked" onClick={() => void changeStage('BOOKED')}>✓ Booké</button>
                    <button className="stage-btn stage-btn-won" onClick={() => void changeStage('WON')}>💰 Gagné</button>
                    <button className="stage-btn stage-btn-froid" onClick={() => void changeStage('FROID')}>🧊 Froid</button>
                    <button className="stage-btn stage-btn-lost" onClick={() => void changeStage('LOST')}>✗ Perdu</button>
                    <button className="stage-btn stage-btn-stop" onClick={() => void changeStage('STOP')}>STOP</button>
                  </div>
                </div>
              </div>

              {/* NOTES D'APPEL */}
              <div className="incall-panel">
                <div className="incall-panel-header">📝 NOTES D'APPEL</div>
                <div className="incall-panel-body">
                  <textarea
                    className="incall-notes-input"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes pendant l'appel..."
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                    <button className="btn-sm btn-sm-primary" onClick={() => void saveNotes()} disabled={notesSaving}>
                      {notesSaving ? '...' : '💾 Sauvegarder notes'}
                    </button>
                    {notesStatus && <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{notesStatus}</span>}
                  </div>
                </div>
              </div>

              {/* CALENDLY */}
              {calendlyLink ? (
                <div className="incall-panel">
                  <div className="incall-panel-header">📅 CALENDLY — Booker un appel</div>
                  <div className="incall-panel-body" style={{ padding: 0 }}>
                    <div className="incall-calendly-wrap">
                      <iframe
                        src={`${calendlyLink}?embed_type=Inline&hide_gdpr_banner=1&primary_color=a8d8f0&background_color=080a0c&text_color=dde4ed`}
                        width="100%"
                        height="560"
                        frameBorder="0"
                        style={{ display: 'block', background: '#fff' }}
                        title="Calendly"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="incall-panel">
                  <div className="incall-panel-header">📅 CALENDLY</div>
                  <div className="incall-panel-body">
                    <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>
                      Lien Calendly non configuré. Ajoute-le dans <code>~/.secrets/calendly-link.txt</code>.
                    </span>
                  </div>
                </div>
              )}

              {/* BRIEF IA + SCRIPT */}
              <div className="incall-panel">
                <div className="incall-panel-header">⚡ BRIEF IA + SCRIPT D'APPEL</div>
                <div className="incall-panel-body">
                  {brief ? (
                    <pre className="incall-brief-output">{brief}</pre>
                  ) : (
                    <div className="incall-brief-placeholder">
                      {briefLoading ? 'Génération en cours...' : 'Appuie sur Générer pour obtenir un brief + script.'}
                    </div>
                  )}
                  {!brief && !briefLoading && (
                    <button className="btn-sm btn-sm-primary" style={{ marginTop: 8 }} onClick={() => void generateBrief()}>
                      ⚡ Générer brief IA + script
                    </button>
                  )}
                  {briefLoading && (
                    <div style={{ width: '100%', height: 3, background: '#1a2a3a', marginTop: 8, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', height: '100%', width: '40%', background: 'var(--blue)', animation: 'briefPulse 1.2s ease-in-out infinite' }} />
                    </div>
                  )}
                </div>
              </div>

              {/* TECHNIQUES DE VENTE */}
              <div className="incall-panel">
                <div className="incall-panel-header">📖 TECHNIQUES DE VENTE</div>
                <div className="incall-panel-body">
                  <ul className="incall-tips">
                    {TIPS.map((tip, i) => <li key={i}>{tip}</li>)}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <div className="thread-empty">← Sélectionne un lead</div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function BorealPanel() {
  const [data, setData] = useState<BorealData | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await fetch('/api/boreal-clients');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as BorealData);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => { void load(); }, []);

  const clients = data ? Object.entries(data.clients) : [];
  const services = data?.services ?? [];

  return (
    <div className="boreal-page">
      <header className="topbar">
        <div className="brand">aperture</div>
        <div className="meta">
          <a href="/" className="nav-link">home</a>
          <a href="/tasks" className="nav-link">tasks</a>
          <span className="badge badge-green">boréal</span>
        </div>
      </header>

      <div className="grid">
        <section className="panel panel-wide" aria-labelledby="clients-heading">
          <div className="section-head">
            <div className="label" id="clients-heading">client registry</div>
            <span className="badge badge-muted">{clients.length} clients</span>
          </div>
          <AddClientForm onAdded={() => void load()} />
          <div className="client-list">
            {clients.length === 0
              ? <p className="state-entry">— no clients registered —</p>
              : clients.map(([phone, client]) => (
                  <ClientRow key={phone} phone={phone} client={client} onRemoved={() => void load()} />
                ))
            }
          </div>
        </section>

        <section className="panel" aria-labelledby="services-heading">
          <div className="section-head">
            <div className="label" id="services-heading">boréal services</div>
          </div>
          {error && <p className="state-entry" style={{ color: 'var(--red)' }}>{error}</p>}
          <div className="service-list">
            {services.map((svc) => (
              <div key={svc.name} className="service-row">
                <span className={`badge badge-${svc.active ? 'green' : 'muted'}`}>{svc.active ? 'on' : 'off'}</span>
                <span className="service-name">{svc.name}</span>
              </div>
            ))}
          </div>
        </section>

        <LeadsSection />
      </div>
    </div>
  );
}
