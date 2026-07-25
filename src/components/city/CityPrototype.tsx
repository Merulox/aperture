import { useEffect, useMemo, useRef, useState } from 'react';

type EntityId = 'city-hall' | 'genesis' | 'victorique' | 'genesis-worker' | 'genesis-site';
type InspectorTab = 'now' | 'work' | 'goals' | 'resources' | 'connections' | 'trail' | 'chat';
type ApprovalState = 'pending' | 'queued' | 'delivering' | 'acknowledged' | 'rejected';
type MessageState = 'idle' | 'queued' | 'delivering' | 'delivered';
type WakeState = 'idle' | 'requested' | 'acknowledged';
type ZoomLevel = 'city' | 'district';

interface CityEntity {
  id: EntityId;
  name: string;
  kind: 'city_hall' | 'resident' | 'worker' | 'project';
  role: string;
  state: string;
  freshness: string;
  summary: string;
  currentGoal: string;
  blocker?: string;
}

interface TrailEvent {
  id: number;
  time: string;
  entityId: EntityId;
  type: string;
  summary: string;
}

interface ChatMessage {
  id: number;
  context: string;
  body: string;
  state: string;
}

const entities: Record<EntityId, CityEntity> = {
  'city-hall': {
    id: 'city-hall',
    name: 'City Hall',
    kind: 'city_hall',
    role: 'operator authority and attention',
    state: '1 approval pending',
    freshness: 'fixture · 12s old',
    summary: 'Federated attention, policy, approvals, and command delivery.',
    currentGoal: 'Resolve the Genesis capability request without expanding its mandate.',
  },
  genesis: {
    id: 'genesis',
    name: 'Genesis',
    kind: 'resident',
    role: 'ambient continuity and cognitive partner',
    state: 'waiting for approval',
    freshness: 'fixture · observed 12s ago',
    summary: 'Persistent resident with heartbeat, memory, goals, and a bounded runtime worker.',
    currentGoal: 'Integrate a capability broker without touching production delivery.',
    blocker: 'Operator approval required before enabling the filesystem-inspection capability.',
  },
  victorique: {
    id: 'victorique',
    name: 'Victorique',
    kind: 'resident',
    role: 'vault intelligence and research',
    state: 'idle — autonomy level 0',
    freshness: 'fixture · observed 3m ago',
    summary: 'Read-only mirror of vault knowledge, open loops, contradictions, and research state.',
    currentGoal: 'Complete the manual Phase 0 insight prototype.',
  },
  'genesis-worker': {
    id: 'genesis-worker',
    name: 'Capability worker',
    kind: 'worker',
    role: 'temporary bounded execution',
    state: 'blocked',
    freshness: 'fixture · heartbeat 8s ago',
    summary: 'Transient OMP worker owned by Genesis and attached to one work item.',
    currentGoal: 'Validate the capability manifest and produce evidence.',
    blocker: 'Waiting on approval APV-1042.',
  },
  'genesis-site': {
    id: 'genesis-site',
    name: 'Genesis runtime v2',
    kind: 'project',
    role: 'project workplace',
    state: 'active — monitor only',
    freshness: 'fixture · observed 18s ago',
    summary: 'Durable event, run, trace, and delivery runtime under parallel validation.',
    currentGoal: 'Reach capability-safe Stage 2 without production cutover.',
  },
};

const initialTrail: TrailEvent[] = [
  { id: 1, time: '12:42:18', entityId: 'genesis-worker', type: 'simulation.worker.blocked', summary: 'Fixture: capability worker reached an operator authority boundary.' },
  { id: 2, time: '12:42:19', entityId: 'genesis', type: 'simulation.approval.requested', summary: 'Fixture: Genesis requested filesystem-inspection capability for one bounded objective.' },
  { id: 3, time: '12:42:20', entityId: 'city-hall', type: 'simulation.attention.created', summary: 'Fixture: City Hall added APV-1042 to the simulated operator inbox.' },
];

const resources = [
  { family: 'compute + cost', state: 'healthy', detail: 'claude-haiku-4-5 · $0.08 today · 1/2 workers' },
  { family: 'capabilities + permissions', state: 'attention', detail: '4 declared · 1 awaiting approval · network denied' },
  { family: 'knowledge + memory', state: 'fresh', detail: 'fixture identity + simulated state · observed 12s ago · 3 source refs' },
  { family: 'attention + workload', state: 'blocked', detail: '1 active objective · 1 blocked worker · operator needed' },
  { family: 'artifacts + dependencies', state: 'healthy', detail: 'runtime.sqlite3 · capability manifest · 16 contract checks' },
];

const tabs: InspectorTab[] = ['now', 'work', 'goals', 'resources', 'connections', 'trail', 'chat'];


export function CityPrototype() {
  const [selectedId, setSelectedId] = useState<EntityId>('genesis');
  const [tab, setTab] = useState<InspectorTab>('now');
  const [zoom, setZoom] = useState<ZoomLevel>('city');
  const [showLinks, setShowLinks] = useState(true);
  const [approvalState, setApprovalState] = useState<ApprovalState>('pending');
  const [trail, setTrail] = useState<TrailEvent[]>(initialTrail);
  const [chatContext, setChatContext] = useState('approval: APV-1042');
  const [message, setMessage] = useState('');
  const [messageState, setMessageState] = useState<MessageState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wakeState, setWakeState] = useState<WakeState>('idle');
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const selected = entities[selectedId];
  const approvalPending = approvalState === 'pending';
  const approvalGranted = approvalState === 'acknowledged';
  const attentionCount = approvalPending ? 1 : 0;
  const genesisState = approvalPending ? 'waiting for approval' : approvalGranted ? 'active' : approvalState === 'rejected' ? 'approval rejected' : `command ${approvalState}`;
  const workerState = approvalGranted ? 'resuming' : 'blocked';

  const visibleTrail = useMemo(() => {
    if (selectedId === 'city-hall') return trail;
    if (selectedId === 'genesis') {
      return trail.filter((event) => ['genesis', 'genesis-worker', 'city-hall'].includes(event.entityId));
    }
    return trail.filter((event) => event.entityId === selectedId);
  }, [selectedId, trail]);

  const addTrail = (entityId: EntityId, type: string, summary: string) => {
    setTrail((current) => [...current, { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString('en-CA', { hour12: false }), entityId, type, summary }]);
  };

  const schedule = (callback: () => void, delay: number) => {
    timers.current.push(window.setTimeout(callback, delay));
  };

  const selectEntity = (id: EntityId) => {
    setSelectedId(id);
    setTab('now');
  };

  const decideApproval = (decision: 'approve' | 'reject') => {
    if (!approvalPending) return;
    setApprovalState('queued');
    addTrail('city-hall', 'simulation.command.queued', `Simulator queued ${decision === 'approve' ? 'approval' : 'rejection'} with fixture key city:APV-1042:v1.`);
    schedule(() => {
      setApprovalState('delivering');
      addTrail('genesis', 'simulation.command.delivering', 'Simulator advanced the fixture response to delivering.');
    }, 650);
    schedule(() => {
      setApprovalState(decision === 'approve' ? 'acknowledged' : 'rejected');
      addTrail('genesis', 'simulation.approval.acknowledged', decision === 'approve'
        ? 'Simulator marked the bounded capability approval acknowledged; no Genesis process was contacted.'
        : 'Simulator marked rejection acknowledged; no Genesis process was contacted.');
      addTrail('genesis-worker', decision === 'approve' ? 'simulation.worker.resuming' : 'simulation.worker.blocked', decision === 'approve'
        ? 'Fixture worker changed to resuming under the simulated boundary.'
        : 'Fixture worker retained its blocked state.');
    }, 1_500);
  };

  const resetSimulation = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setApprovalState('pending');
    setTrail(initialTrail);
    setMessages([]);
    setMessage('');
    setMessageState('idle');
    setWakeState('idle');
    setSelectedId('genesis');
    setTab('now');
  };

  const sendMessage = () => {
    const body = message.trim();
    if (!body || selected.kind !== 'resident' || selected.id === 'victorique') return;
    const id = Date.now();
    setMessages((current) => [...current, { id, context: chatContext, body, state: 'simulation queued' }]);
    setMessage('');
    setMessageState('queued');
    addTrail('genesis', 'simulation.message.queued', `Simulator queued the message in context “${chatContext}”; nothing left the browser.`);
    schedule(() => {
      setMessageState('delivering');
      setMessages((current) => current.map((item) => item.id === id ? { ...item, state: 'simulation delivering' } : item));
    }, 500);
    schedule(() => {
      setMessageState('delivered');
      setMessages((current) => current.map((item) => item.id === id ? { ...item, state: 'simulated delivery · no response channel' } : item));
      addTrail('genesis', 'simulation.message.delivered', 'Simulator marked the message delivered; no Genesis inbox was contacted.');
    }, 1_150);
  };

  const requestWake = () => {
    setWakeState('requested');
    addTrail('genesis', 'simulation.wake.requested', 'Simulator recorded an immediate wake request; no Genesis process was contacted.');
    schedule(() => {
      setWakeState('acknowledged');
      addTrail('genesis', 'simulation.wake.acknowledged', 'Simulator marked the fixture wake acknowledged; this is not a Genesis response.');
    }, 850);
  };

  const approvalLabel = approvalState === 'pending'
    ? 'fixture pending decision'
    : approvalState === 'queued'
      ? 'simulated command queued'
      : approvalState === 'delivering'
        ? 'simulated delivery'
        : approvalState === 'acknowledged'
          ? 'simulated acknowledgment'
          : 'simulated rejection';

  return (
    <section className="city-prototype" aria-label="Aperture City low fidelity simulation">
      <div className="city-prototype-head">
        <div>
          <span className="city-kicker">operational world / interaction prototype</span>
          <h1>Aperture City</h1>
          <p>Stable geography. Persistent residents. Temporary workers. Federated authority.</p>
        </div>
        <div className="city-head-actions">
          <span className="city-live-note">fixture time 12:42</span>
          <button type="button" onClick={resetSimulation}>reset simulation</button>
        </div>
      </div>
      <div className="city-simulation-warning" role="status">
        <strong>Fixture simulation only.</strong>
        <span>Approvals, messages, wakes, and acknowledgments stay in this browser. Genesis cannot receive or answer them yet.</span>
      </div>

      <div className="city-toolbar" aria-label="Map controls">
        <div className="city-segmented" aria-label="Zoom level">
          <button type="button" className={zoom === 'city' ? 'active' : ''} onClick={() => setZoom('city')}>city</button>
          <button type="button" className={zoom === 'district' ? 'active' : ''} onClick={() => setZoom('district')}>district</button>
        </div>
        <label className="city-toggle">
          <input type="checkbox" checked={showLinks} onChange={(event) => setShowLinks(event.target.checked)} />
          relationship signals
        </label>
        <span className="city-toolbar-stat">2 fixture residents</span>
        <span className="city-toolbar-stat">1 fixture worker</span>
        <span className={attentionCount ? 'city-toolbar-stat attention' : 'city-toolbar-stat'}>{attentionCount} simulated operator decision{attentionCount === 1 ? '' : 's'}</span>
      </div>

      <div className="city-shell">
        <div className={`city-map city-map-${zoom}`}>
          <div className="city-grid" aria-hidden="true" />
          <section className="city-district city-district-operations" aria-label="Operations district"><span>operations district</span></section>
          <section className="city-district city-district-memory" aria-label="Memory and research district"><span>memory / research</span></section>

          {showLinks && (
            <svg className="city-links" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
              <path className="city-road" d="M170 150 C260 250 290 350 315 420" />
              <path className="city-road" d="M355 445 C470 430 535 390 620 405" />
              <path className="city-road subtle" d="M650 385 C760 325 795 260 840 215" />
              {approvalPending && <path className="city-approval-link" d="M195 145 C310 180 300 330 335 400" />}
            </svg>
          )}

          <button type="button" className={`city-entity city-hall ${selectedId === 'city-hall' ? 'selected' : ''} ${approvalPending ? 'needs-attention' : ''}`} onClick={() => selectEntity('city-hall')} aria-label={`City Hall, ${attentionCount} pending approvals`}>
            <span className="city-building city-building-hall"><span>CH</span></span>
            <span className="city-entity-label">City Hall</span><span className="city-entity-state">{attentionCount} pending</span>
          </button>
          <button type="button" className={`city-entity city-genesis ${selectedId === 'genesis' ? 'selected' : ''} ${approvalPending ? 'needs-attention' : ''}`} onClick={() => selectEntity('genesis')} aria-label={`Genesis, ${genesisState}`}>
            <span className="city-building city-building-resident"><span>G</span></span>
            <span className="city-entity-label">Genesis</span><span className="city-entity-state">{genesisState}</span>
          </button>
          <button type="button" className={`city-entity city-site ${selectedId === 'genesis-site' ? 'selected' : ''}`} onClick={() => selectEntity('genesis-site')} aria-label="Genesis runtime v2 project site">
            <span className="city-building city-building-site"><span>R2</span></span>
            <span className="city-entity-label">runtime v2</span><span className="city-entity-state">monitor only</span>
          </button>
          <button type="button" className={`city-entity city-worker ${selectedId === 'genesis-worker' ? 'selected' : ''} ${approvalGranted ? 'active-worker' : 'blocked'}`} onClick={() => selectEntity('genesis-worker')} aria-label={`Capability worker, ${workerState}`}>
            <span className="city-worker-core"><span>W</span></span>
            <span className="city-entity-label">capability worker</span><span className="city-entity-state">{workerState}</span>
          </button>
          <button type="button" className={`city-entity city-victorique ${selectedId === 'victorique' ? 'selected' : ''}`} onClick={() => selectEntity('victorique')} aria-label="Victorique, idle, read only">
            <span className="city-building city-building-resident victorique"><span>V</span></span>
            <span className="city-entity-label">Victorique</span><span className="city-entity-state">idle · level 0</span>
          </button>

          <div className="city-map-legend" aria-label="Status legend">
            <span><i className="legend-active" /> active</span><span><i className="legend-waiting" /> waiting</span><span><i className="legend-approval" /> approval</span><span><i className="legend-idle" /> idle</span>
          </div>
        </div>

        <aside className="city-inspector" aria-label={`${selected.name} inspector`}>
          <div className="city-inspector-head">
            <div><span className="city-entity-kind">{selected.kind.replace('_', ' ')}</span><h2>{selected.name}</h2><p>{selected.role}</p></div>
            <div className="city-inspector-status"><span>{selectedId === 'genesis' ? genesisState : selectedId === 'genesis-worker' ? workerState : selectedId === 'city-hall' ? `${attentionCount} approval${attentionCount === 1 ? '' : 's'} pending` : selected.state}</span><small>{selected.freshness}</small></div>
          </div>
          <nav className="city-inspector-tabs" aria-label="Inspector sections">
            {tabs.map((item) => <button type="button" key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
          </nav>

          <div className="city-inspector-body">
            {tab === 'now' && (
              <>
                <div className="city-summary-card"><span className="city-section-label">fixture state</span><p>{selected.summary}</p></div>
                <dl className="city-facts">
                  <div><dt>current objective</dt><dd>{selected.currentGoal}</dd></div>
                  <div><dt>source freshness</dt><dd>{selected.freshness}</dd></div>
                  {selected.blocker && <div className="is-attention"><dt>primary blocker</dt><dd>{approvalGranted ? 'Resolved in simulation; worker resuming under exact scope.' : approvalState === 'rejected' ? 'Approval rejected; worker remains blocked.' : selected.blocker}</dd></div>}
                </dl>
                {(selectedId === 'genesis' || selectedId === 'city-hall') && (
                  <div className={`city-approval-card state-${approvalState}`}>
                    <div className="city-card-heading"><span className="city-section-label">fixture APV-1042 · tier 2</span><span>{approvalLabel}</span></div>
                    <h3>Allow bounded filesystem inspection?</h3>
                    <p>Genesis requests read-only access to the declared runtime-v2 project root for one capability-validation objective. Network and writes remain denied.</p>
                    <div className="city-approval-meta"><span>fixture source: Genesis capability broker</span><span>simulated expiry: 46m</span><span>fixture hash: 49bf…8ac2</span></div>
                    {approvalPending ? (
                      <div className="city-card-actions">
                        <button type="button" className="city-action-primary" onClick={() => decideApproval('approve')}>simulate approval</button>
                        <button type="button" className="city-action-danger" onClick={() => decideApproval('reject')}>simulate rejection</button>
                        <button type="button" onClick={() => { setTab('chat'); setChatContext('approval: APV-1042'); }}>open simulated chat</button>
                      </div>
                    ) : (
                      <div className="city-command-progress" aria-live="polite">
                        {(['queued', 'delivering', 'acknowledged'] as const).map((state) => <span key={state} className={approvalState === state || approvalState === 'rejected' && state === 'acknowledged' ? 'current' : ''}>simulated {state}</span>)}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {tab === 'work' && <div className="city-stack"><article className="city-data-card"><span>project workplace</span><strong>Genesis runtime v2</strong><p>Parallel monitor-only runtime · no production cutover.</p></article><article className="city-data-card"><span>temporary worker</span><strong>Capability worker</strong><p>{approvalGranted ? 'Resuming under exact approved scope.' : 'Blocked at operator authority boundary.'}</p></article><article className="city-data-card"><span>evidence</span><strong>16 contract checks</strong><p>Run, trace, delivery, retry, and dead-letter evidence available.</p></article></div>}

            {tab === 'goals' && <div className="city-goal-tree"><article><span>mission · operator authority</span><strong>Maintain operational continuity without obscuring human authority.</strong></article><article><span>objective · resident authority</span><strong>Validate a capability broker inside the approved runtime-v2 boundary.</strong></article><article><span>task · worker contract</span><strong>Inspect the declared project root and return schema evidence.</strong></article></div>}

            {tab === 'resources' && <div className="city-resource-list">{resources.map((resource) => <article key={resource.family}><div><span>{resource.family}</span><em className={`resource-${resource.state}`}>{resource.state}</em></div><p>{resource.detail}</p></article>)}<button type="button" className="city-reveal" onClick={() => addTrail(selectedId, 'sensitive.reveal', 'Operator deliberately revealed resource provenance metadata; secret values remained hidden.')}>reveal provenance metadata</button></div>}

            {tab === 'connections' && <div className="city-stack"><article className="city-data-card"><span>works on</span><strong>Genesis runtime v2</strong><p>Active relationship · project workplace.</p></article><article className="city-data-card"><span>spawned</span><strong>Capability worker</strong><p>One bounded OMP worker · {approvalGranted ? 'resuming under APV-1042' : 'blocked on APV-1042'}.</p></article><article className="city-data-card"><span>depends on</span><strong>Claude CLI · runtime SQLite · capability manifest</strong><p>All dependencies currently observed.</p></article></div>}

            {tab === 'trail' && <ol className="city-trail">{[...visibleTrail].reverse().map((event) => <li key={event.id}><time>{event.time}</time><div><span>{event.type}</span><p>{event.summary}</p></div></li>)}</ol>}

            {tab === 'chat' && (selected.kind === 'resident' ? (
              <div className="city-chat">
                <label>
                  conversation context
                  <select value={chatContext} onChange={(event) => setChatContext(event.target.value)}>
                    <option>general</option>
                    <option>project: Genesis runtime v2</option>
                    <option>goal: capability-safe Stage 2</option>
                    <option>worker: capability worker</option>
                    <option>approval: APV-1042</option>
                  </select>
                </label>
                {selected.id === 'victorique' ? (
                  <div className="city-boundary-note">
                    <strong>Read-only resident boundary</strong>
                    <p>Victorique is autonomy Level 0. Its City adapter cannot yet accept messages or commands.</p>
                  </div>
                ) : (
                  <>
                    <div className="city-chat-log">
                      <div className="city-message system">
                        <span>fixture resident state</span>
                        <p>No live Genesis connection. The scheduled wake time is simulated.</p>
                      </div>
                      {messages.map((item) => (
                        <div className="city-message outbound" key={item.id}>
                          <span>{item.context} · {item.state}</span>
                          <p>{item.body}</p>
                        </div>
                      ))}
                    </div>
                    <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Simulate a message to Genesis…" rows={4} />
                    <div className="city-card-actions">
                      <button type="button" className="city-action-primary" onClick={sendMessage} disabled={!message.trim() || messageState === 'queued' || messageState === 'delivering'}>simulate message delivery</button>
                      <button type="button" onClick={requestWake}>simulate immediate wake</button>
                    </div>
                    <div className="city-delivery-status" aria-live="polite">
                      <div><span>message</span><strong>{messageState === 'idle' ? 'not simulated' : `simulation ${messageState}`}</strong></div>
                      <div><span>wake</span><strong>{wakeState === 'idle' ? 'not simulated' : `simulation ${wakeState}`}</strong></div>
                      <div><span>next resident run</span><strong>not connected</strong></div>
                      <div><span>response</span><strong>none possible in fixture mode</strong></div>
                      <p>No request leaves this browser. A real Genesis adapter is required before delivery, wake, or response can be observed.</p>
                    </div>
                  </>
                )}
              </div>
            ) : <p className="city-empty">Chat belongs to persistent residents, not workers, projects, or facilities.</p>)}
          </div>
        </aside>
      </div>
    </section>
  );
}
