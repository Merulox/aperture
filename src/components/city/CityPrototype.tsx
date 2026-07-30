import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GenesisCityEvent,
  GenesisCitySnapshot,
  GenesisMessageReceipt,
  GenesisWakeReceipt,
} from '../../lib/city-types';

type EntityId = 'city-hall' | 'genesis' | 'victorique' | 'genesis-worker' | 'genesis-site' | 'hormozi' | 'ogilvy' | 'signaler';
type InspectorTab = 'now' | 'work' | 'goals' | 'resources' | 'connections' | 'trail' | 'chat';
type ZoomLevel = 'city' | 'district';
type CommandBusy = '' | 'message' | 'wake';

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
  id: string | number;
  occurredAt: string;
  time: string;
  entityId: EntityId;
  type: string;
  summary: string;
}

const entities: Record<EntityId, CityEntity> = {
  'city-hall': {
    id: 'city-hall',
    name: 'City Hall',
    kind: 'city_hall',
    role: 'operator authority and attention',
    state: 'no live capability system yet',
    freshness: 'static — no backing runtime',
    summary: 'Federated attention, policy, approvals, and command delivery.',
    currentGoal: 'Observe the live Genesis control loop without expanding its authority.',
  },
  genesis: {
    id: 'genesis',
    name: 'Genesis',
    kind: 'resident',
    role: 'ambient continuity and cognitive partner',
    state: 'connecting',
    freshness: 'awaiting runtime snapshot',
    summary: 'Persistent resident backed by the durable runtime-v2 inbox.',
    currentGoal: 'Process trusted operator messages through the monitor-only runtime.',
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
    name: 'Runtime worker',
    kind: 'worker',
    role: 'temporary bounded execution',
    state: 'idle',
    freshness: 'live runtime snapshot pending',
    summary: 'Transient worker started only by an explicit operator wake.',
    currentGoal: 'Process at most one durable Genesis event.',
  },
  'genesis-site': {
    id: 'genesis-site',
    name: 'Genesis runtime v2',
    kind: 'project',
    role: 'project workplace',
    state: 'connecting',
    freshness: 'awaiting runtime snapshot',
    summary: 'Durable event, run, trace, and delivery runtime under parallel validation.',
    currentGoal: 'Prove the first real City control loop without production cutover.',
  },
  hormozi: {
    id: 'hormozi',
    name: 'Hormozi',
    kind: 'resident',
    role: 'evidence-backed sales operator for Boréal Numérique',
    state: 'connecting',
    freshness: 'awaiting live status',
    summary: 'Owns trust-preserving sales progression: observes CRM evidence, ranks the human queue, prepares calls and drafts, keeps promises, and proposes review-gated experiments. Never contacts a lead directly.',
    currentGoal: 'Surface the correct human sales action at the correct time without damaging trust.',
  },
  ogilvy: {
    id: 'ogilvy',
    name: 'Ogilvy',
    kind: 'resident',
    role: 'content generation for Bor\u00e9al Num\u00e9rique acquisition',
    state: 'connecting',
    freshness: 'awaiting live status',
    summary: 'Owns money-optimized Facebook/Instagram acquisition content, the top-of-funnel layer feeding leads into the funnel Hormozi closes. Never publishes directly \u2014 approval appends to the content batch a human-run publisher delivers unchanged.',
    currentGoal: 'Own top-of-funnel content generation and attribution learning for Bor\u00e9al Num\u00e9rique.',
  },
  signaler: {
    id: 'signaler',
    name: 'Signaler',
    kind: 'resident',
    role: 'cross-platform content generation for passive income',
    state: 'connecting',
    freshness: 'awaiting live status',
    summary: 'Researches authoritative evidence and live trends, generates account-specific content, and hands approved posts to an external scheduler — a fully separate passive-income pipeline from Boréal’s Hormozi/Ogilvy, with its own database and account registry. Niches are grounded in genuine interest plus live research, never faked authority. Every generated post remains human-gated before external delivery.',
    currentGoal: 'Warm up @signaltomind with one evidence-backed post per day and prove the approve→Typefully loop.',
  },
};

const tabs: InspectorTab[] = ['now', 'work', 'goals', 'resources', 'connections', 'trail', 'chat'];

function eventResponse(event: GenesisCityEvent | undefined): string | null {
  if (!event?.decision) return null;
  const message = event.decision.message;
  if (typeof message === 'string' && message.trim()) return message;
  const decision = event.decision.decision;
  return typeof decision === 'string' ? `Genesis decision: ${decision}.` : 'Genesis persisted a structured decision.';
}

interface BorealResidentStatus {
  health: 'healthy' | 'idle' | 'unavailable';
  activeDoctrineVersions: string[];
  totalGenerated: number;
  generatedToday: number;
  lastGeneratedAt: string | null;
  error: string | null;
}

interface BorealProposal {
  id: number;
  actionKey: string;
  actionType: string;
  summary: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

interface BorealActivity {
  id: number;
  actionType: string;
  summary: string;
  createdAt: string;
  reviewedAt: string | null;
}

interface BorealProposals {
  pending: BorealProposal[];
  recent: BorealActivity[];
  error: string | null;
}

interface BorealSnapshot {
  hormozi: BorealResidentStatus;
  ogilvy: BorealResidentStatus;
  hormoziProposals: BorealProposals;
  ogilvyProposals: BorealProposals;
}

interface HormoziCycleConfig {
  enabled: boolean;
  intervalHours: number;
  maxActionsPerRun: number;
  lastRunAt: string | null;
  lastRunSummary: string;
}

interface HormoziOperatorAction {
  id: number;
  leadPhone: string | null;
  leadName: string;
  sourceKind: string;
  actionType: string;
  priority: number;
  summary: string;
  rationale: string;
  evidence: Record<string, unknown>;
  brief: Record<string, unknown>;
  decisionSource: string;
  dueAt: string | null;
  createdAt: string;
}

interface HormoziCycleState {
  config: HormoziCycleConfig | null;
  actions: HormoziOperatorAction[];
  error: string | null;
}

interface CredentialGap {
  platform: string;
  missingSecrets: string[];
}

interface SignalerRoadmapItem {
  id: number;
  accountId: number;
  accountHandle: string;
  itemKey: string;
  kind: 'milestone' | 'po_task';
  title: string;
  detail: string;
  owner: 'signaler' | 'merulox';
  status: 'planned' | 'in_progress' | 'blocked' | 'done';
  blocker: string;
  sortOrder: number;
  completedAt: string | null;
}

interface SignalerStatus {
  health: 'healthy' | 'idle' | 'unavailable';
  nicheCount: number;
  accountCount: number;
  totalGenerated: number;
  generatedToday: number;
  pendingCount: number;
  lastGeneratedAt: string | null;
  credentialGaps: CredentialGap[];
  roadmap: SignalerRoadmapItem[];
  error: string | null;
}

interface SignalerProposal {
  id: number;
  actionKey: string;
  platform: string;
  format: string;
  angle: string;
  copyText: string;
  niche: string | null;
  createdAt: string;
}

interface SignalerActivity {
  id: number;
  decision: string;
  note: string;
  platform: string;
  angle: string;
  decidedAt: string;
}

interface SignalerProposals {
  pending: SignalerProposal[];
  recent: SignalerActivity[];
  error: string | null;
}
interface ChatMessage {
  id: number;
  role: 'operator' | 'resident';
  body: string;
  createdAt: string;
}
interface PipelineConfig {
  enabled: boolean;
  intervalHours: number;
  maxProposalsPerRun: number;
  lastRunAt: string | null;
  lastRunSummary: string;
}
interface SignalerNicheLite {
  id: number;
  name: string;
  status: string;
}
interface AccountIdea {
  id: number;
  nicheId: number | null;
  nicheName: string | null;
  platform: string;
  candidateHandles: string[];
  draftBio: string;
  notes: string;
  status: 'idea' | 'decided' | 'created';
  decidedHandle: string | null;
  accountId: number | null;
  createdAt: string;
}


export function CityPrototype() {
  const [selectedId, setSelectedId] = useState<EntityId>('genesis');
  const [tab, setTab] = useState<InspectorTab>('now');
  const [zoom, setZoom] = useState<ZoomLevel>('city');
  const [showLinks, setShowLinks] = useState(true);
  const [chatContext, setChatContext] = useState('general');
  const [message, setMessage] = useState('');
  const [snapshot, setSnapshot] = useState<GenesisCitySnapshot | null>(null);
  const [lastEventId, setLastEventId] = useState('');
  const [commandBusy, setCommandBusy] = useState<CommandBusy>('');
  const [commandError, setCommandError] = useState('');
  const [boreal, setBoreal] = useState<BorealSnapshot | null>(null);
  const [borealObservedAt, setBorealObservedAt] = useState('connecting');
  const [borealError, setBorealError] = useState('');
  const [borealReviewBusy, setBorealReviewBusy] = useState<number | null>(null);
  const [borealReviewError, setBorealReviewError] = useState('');
  const [signaler, setSignaler] = useState<{ status: SignalerStatus; proposals: SignalerProposals; chat: ChatMessage[] } | null>(null);
  const [signalerObservedAt, setSignalerObservedAt] = useState('connecting');
  const [signalerError, setSignalerError] = useState('');
  const [signalerReviewBusy, setSignalerReviewBusy] = useState<number | null>(null);
  const [signalerReviewError, setSignalerReviewError] = useState('');
  const [signalerChatDraft, setSignalerChatDraft] = useState('');
  const [signalerChatBusy, setSignalerChatBusy] = useState(false);
  const [signalerChatError, setSignalerChatError] = useState('');
  const [borealChat, setBorealChat] = useState<{ hormozi: ChatMessage[]; ogilvy: ChatMessage[] }>({ hormozi: [], ogilvy: [] });
  const [borealChatDraft, setBorealChatDraft] = useState<{ hormozi: string; ogilvy: string }>({ hormozi: '', ogilvy: '' });
  const [borealChatBusy, setBorealChatBusy] = useState<'hormozi' | 'ogilvy' | ''>('');
  const [borealChatError, setBorealChatError] = useState('');
  const [hormoziCycle, setHormoziCycle] = useState<HormoziCycleState>({ config: null, actions: [], error: null });
  const [hormoziCycleBusy, setHormoziCycleBusy] = useState<'config' | 'run' | number>('');
  const [hormoziCycleError, setHormoziCycleError] = useState('');
  const [hormoziIntervalDraft, setHormoziIntervalDraft] = useState('4');
  const [hormoziMaxDraft, setHormoziMaxDraft] = useState('3');
  const [signalerPipeline, setSignalerPipeline] = useState<PipelineConfig | null>(null);
  const [signalerPipelineBusy, setSignalerPipelineBusy] = useState(false);
  const [signalerPipelineError, setSignalerPipelineError] = useState('');
  const [signalerIntervalDraft, setSignalerIntervalDraft] = useState('24');
  const [signalerMaxDraft, setSignalerMaxDraft] = useState('3');
  const [signalerIdeas, setSignalerIdeas] = useState<AccountIdea[]>([]);
  const [signalerNiches, setSignalerNiches] = useState<SignalerNicheLite[]>([]);
  const [signalerIdeasBusy, setSignalerIdeasBusy] = useState<number | ''>('');
  const [signalerIdeasError, setSignalerIdeasError] = useState('');
  const [newIdeaNicheId, setNewIdeaNicheId] = useState('');
  const [newIdeaPlatform, setNewIdeaPlatform] = useState('');
  const [newIdeaHandles, setNewIdeaHandles] = useState('');
  const [newIdeaBio, setNewIdeaBio] = useState('');
  const [newIdeaNotes, setNewIdeaNotes] = useState('');
  const [newIdeaBusy, setNewIdeaBusy] = useState(false);
  const signalerDraftInitialized = useRef(false);
  const hormoziDraftInitialized = useRef(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const messageKey = useRef<string | null>(null);
  const wakeKey = useRef<string | null>(null);
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean; pointerId: number; target: HTMLDivElement } | null>(null);
  const justDraggedRef = useRef(false);

  const refreshSnapshot = useCallback(async () => {
    const response = await fetch('/api/city-genesis', { cache: 'no-store' });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Genesis snapshot failed with HTTP ${response.status}.`;
      throw new Error(detail);
    }
    setSnapshot(body as GenesisCitySnapshot);
  }, []);

  const refreshBoreal = useCallback(async () => {
    const [statusRes, hormoziRes, ogilvyRes, hormoziChatRes, ogilvyChatRes, cycleRes] = await Promise.all([
      fetch('/api/boreal-clients', { cache: 'no-store' }),
      fetch('/api/hormozi', { cache: 'no-store' }),
      fetch('/api/ogilvy', { cache: 'no-store' }),
      fetch('/api/boreal-chat?resident=hormozi', { cache: 'no-store' }),
      fetch('/api/boreal-chat?resident=ogilvy', { cache: 'no-store' }),
      fetch('/api/hormozi-cycle', { cache: 'no-store' }),
    ]);
    if (!statusRes.ok || !hormoziRes.ok || !ogilvyRes.ok) {
      throw new Error('Bor\u00e9al resident status fetch failed.');
    }
    const [statusBody, hormoziBody, ogilvyBody, hormoziChatBody, ogilvyChatBody, cycleBody] = await Promise.all([
      statusRes.json() as Promise<{ hormozi: BorealResidentStatus; ogilvy: BorealResidentStatus }>,
      hormoziRes.json() as Promise<BorealProposals>,
      ogilvyRes.json() as Promise<BorealProposals>,
      hormoziChatRes.ok ? (hormoziChatRes.json() as Promise<{ history: ChatMessage[] }>) : Promise.resolve({ history: [] }),
      ogilvyChatRes.ok ? (ogilvyChatRes.json() as Promise<{ history: ChatMessage[] }>) : Promise.resolve({ history: [] }),
      cycleRes.ok ? (cycleRes.json() as Promise<HormoziCycleState>) : Promise.resolve({ config: null, actions: [], error: `HTTP ${cycleRes.status}` }),
    ]);
    setBoreal({
      hormozi: statusBody.hormozi,
      ogilvy: statusBody.ogilvy,
      hormoziProposals: hormoziBody,
      ogilvyProposals: ogilvyBody,
    });
    setBorealChat({ hormozi: hormoziChatBody.history, ogilvy: ogilvyChatBody.history });
    setHormoziCycle(cycleBody);
    setBorealObservedAt(new Date().toLocaleTimeString('en-CA', { hour12: false }));
  }, []);

  const refreshSignaler = useCallback(async () => {
    const [statusRes, proposalsRes, chatRes, pipelineRes, ideasRes] = await Promise.all([
      fetch('/api/signaler-status', { cache: 'no-store' }),
      fetch('/api/signaler', { cache: 'no-store' }),
      fetch('/api/signaler-chat', { cache: 'no-store' }),
      fetch('/api/signaler-pipeline-config', { cache: 'no-store' }),
      fetch('/api/signaler-account-ideas', { cache: 'no-store' }),
    ]);
    if (!statusRes.ok || !proposalsRes.ok) {
      throw new Error('Signaler resident status fetch failed.');
    }
    const [statusBody, proposalsBody, chatBody, pipelineBody, ideasBody] = await Promise.all([
      statusRes.json() as Promise<SignalerStatus>,
      proposalsRes.json() as Promise<SignalerProposals>,
      chatRes.ok ? (chatRes.json() as Promise<{ history: ChatMessage[] }>) : Promise.resolve({ history: [] }),
      pipelineRes.ok ? (pipelineRes.json() as Promise<{ config: PipelineConfig | null }>) : Promise.resolve({ config: null }),
      ideasRes.ok ? (ideasRes.json() as Promise<{ ideas: AccountIdea[]; niches: SignalerNicheLite[] }>) : Promise.resolve({ ideas: [], niches: [] }),
    ]);
    setSignaler({ status: statusBody, proposals: proposalsBody, chat: chatBody.history });
    setSignalerPipeline(pipelineBody.config);
    setSignalerIdeas(ideasBody.ideas);
    setSignalerNiches(ideasBody.niches);
    setSignalerObservedAt(new Date().toLocaleTimeString('en-CA', { hour12: false }));
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        await refreshSignaler();
        if (active) setSignalerError('');
      } catch (cause) {
        if (active) setSignalerError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    void refresh();
    const poller = window.setInterval(() => void refresh(), 5_000);
    return () => {
      active = false;
      window.clearInterval(poller);
    };
  }, [refreshSignaler]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        await refreshBoreal();
        if (active) setBorealError('');
      } catch (cause) {
        if (active) setBorealError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    void refresh();
    const poller = window.setInterval(() => void refresh(), 5_000);
    return () => {
      active = false;
      window.clearInterval(poller);
    };
  }, [refreshBoreal]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        await refreshSnapshot();
        if (active) setCommandError('');
      } catch (cause) {
        if (active) setCommandError(cause instanceof Error ? cause.message : String(cause));
      }
    };
    void refresh();
    const poller = window.setInterval(() => void refresh(), 2_000);
    return () => {
      active = false;
      window.clearInterval(poller);
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    if (signalerPipeline && !signalerDraftInitialized.current) {
      setSignalerIntervalDraft(String(signalerPipeline.intervalHours));
      setSignalerMaxDraft(String(signalerPipeline.maxProposalsPerRun));
      signalerDraftInitialized.current = true;
    }
  }, [signalerPipeline]);

  useEffect(() => {
    if (hormoziCycle.config && !hormoziDraftInitialized.current) {
      setHormoziIntervalDraft(String(hormoziCycle.config.intervalHours));
      setHormoziMaxDraft(String(hormoziCycle.config.maxActionsPerRun));
      hormoziDraftInitialized.current = true;
    }
  }, [hormoziCycle.config]);

  const cityEvents = useMemo(
    () => snapshot?.events.filter((event) => event.source === 'aperture-city') ?? [],
    [snapshot],
  );
  const currentEvent = cityEvents.find((event) => event.id === lastEventId) ?? cityEvents[0];
  const currentWake = snapshot?.wakes.find((wake) => wake.requestedEventId === currentEvent?.id) ?? null;
  const currentRun = currentEvent?.runs.at(-1) ?? null;
  const responseText = eventResponse(currentEvent);
  const observedAt = snapshot?.observedAt
    ? new Date(snapshot.observedAt).toLocaleTimeString('en-CA', { hour12: false })
    : 'connecting';
  const bridgeLive = snapshot?.adapter.health === 'healthy' || snapshot?.adapter.health === 'degraded';
  const genesisState = snapshot?.resident.state ?? 'connecting';
  const workerState = currentRun?.status === 'running' ? 'working' : currentWake?.status === 'started' ? 'starting' : 'idle';
  const signalerCredentialGaps = signaler?.status.credentialGaps ?? [];
  // Safe-default while still loading (signaler === null): no gap shown
  // until we actually know the real state — never falsely alarm before
  // the fetch resolves.
  const signalerAccountGap = signaler !== null && signaler.status.accountCount === 0;
  const signalerNeedsAttention = signalerCredentialGaps.length > 0 || signalerAccountGap;

  const liveEntities = useMemo<Record<EntityId, CityEntity>>(() => ({
    ...entities,
    genesis: {
      ...entities.genesis,
      state: genesisState,
      freshness: snapshot ? `live · observed ${observedAt}` : 'connecting',
      summary: snapshot?.resident.summary ?? entities.genesis.summary,
      blocker: snapshot?.resident.blocker ?? undefined,
    },
    'genesis-worker': {
      ...entities['genesis-worker'],
      state: workerState,
      freshness: snapshot ? `live · observed ${observedAt}` : 'connecting',
      summary: currentRun
        ? `Run ${currentRun.id.slice(0, 8)} is ${currentRun.status} on attempt ${currentRun.attempt}.`
        : entities['genesis-worker'].summary,
      blocker: currentRun?.errorDetail ?? undefined,
    },
    'genesis-site': {
      ...entities['genesis-site'],
      state: snapshot?.adapter.health ?? 'connecting',
      freshness: snapshot ? `live · schema ${snapshot.runtime.schemaVersion ?? 'unknown'} · observed ${observedAt}` : 'connecting',
      summary: snapshot?.adapter.limitation ?? entities['genesis-site'].summary,
    },
    hormozi: {
      ...entities.hormozi,
      state: boreal?.hormozi.health ?? 'connecting',
      freshness: boreal ? `live · observed ${borealObservedAt}` : 'connecting',
      summary: hormoziCycle.actions[0]
        ? `Next human action: ${hormoziCycle.actions[0].summary}`
        : entities.hormozi.summary,
      blocker: boreal?.hormozi.error ?? hormoziCycle.error ?? undefined,
    },
    ogilvy: {
      ...entities.ogilvy,
      state: boreal?.ogilvy.health ?? 'connecting',
      freshness: boreal ? `live · observed ${borealObservedAt}` : 'connecting',
      blocker: boreal?.ogilvy.error ?? undefined,
    },
    signaler: {
      ...entities.signaler,
      state: signaler?.status.health ?? 'connecting',
      freshness: signaler ? `live · observed ${signalerObservedAt}` : 'connecting',
      blocker: signaler?.status.error ?? undefined,
    },
  }), [boreal, borealObservedAt, currentRun, genesisState, hormoziCycle, observedAt, snapshot, signaler, signalerObservedAt, workerState]);
  const selected = liveEntities[selectedId];

  const runtimeTrail = useMemo<TrailEvent[]>(() => {
    if (!snapshot) return [];
    const events: TrailEvent[] = [];
    for (const event of [...snapshot.events].reverse()) {
      events.push({
        id: `event:${event.id}`,
        occurredAt: event.createdAt,
        time: new Date(event.createdAt).toLocaleTimeString('en-CA', { hour12: false }),
        entityId: event.source === 'aperture-city' ? 'genesis' : 'genesis-site',
        type: `runtime.event.${event.status}`,
        summary: `${event.source} event ${event.id.slice(0, 8)} · ${event.context}.`,
      });
      for (const run of event.runs) {
        events.push({
          id: `run:${run.id}:${run.status}`,
          occurredAt: run.finishedAt ?? run.startedAt,
          time: new Date(run.finishedAt ?? run.startedAt).toLocaleTimeString('en-CA', { hour12: false }),
          entityId: 'genesis-worker',
          type: `runtime.run.${run.status}`,
          summary: run.errorDetail ?? `Attempt ${run.attempt} · ${run.model ?? 'model pending'} · ${run.latencyMs ?? '—'}ms.`,
        });
      }
      for (const trace of event.traces) {
        events.push({
          id: `trace:${trace.id}`,
          occurredAt: trace.createdAt,
          time: new Date(trace.createdAt).toLocaleTimeString('en-CA', { hour12: false }),
          entityId: 'genesis-worker',
          type: `runtime.trace.${trace.kind}`,
          summary: `Persisted trace ${trace.sequence} for run ${trace.runId.slice(0, 8)}.`,
        });
      }
    }
    return events.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)).slice(-80);
  }, [snapshot]);
  const borealTrail = useMemo<TrailEvent[]>(() => {
    if (!boreal) return [];
    const events: TrailEvent[] = [];
    const pushProposal = (entityId: 'hormozi' | 'ogilvy', proposal: BorealProposal) => {
      events.push({
        id: `${entityId}:proposal:${proposal.id}`,
        occurredAt: proposal.createdAt,
        time: new Date(proposal.createdAt).toLocaleTimeString('en-CA', { hour12: false }),
        entityId,
        type: proposal.actionType,
        summary: proposal.summary,
      });
    };
    const pushActivity = (entityId: 'hormozi' | 'ogilvy', activity: BorealActivity) => {
      const occurredAt = activity.reviewedAt ?? activity.createdAt;
      events.push({
        id: `${entityId}:activity:${activity.id}`,
        occurredAt,
        time: new Date(occurredAt).toLocaleTimeString('en-CA', { hour12: false }),
        entityId,
        type: activity.actionType,
        summary: activity.summary,
      });
    };
    boreal.hormoziProposals.pending.forEach((proposal) => pushProposal('hormozi', proposal));
    boreal.hormoziProposals.recent.forEach((activity) => pushActivity('hormozi', activity));
    boreal.ogilvyProposals.pending.forEach((proposal) => pushProposal('ogilvy', proposal));
    boreal.ogilvyProposals.recent.forEach((activity) => pushActivity('ogilvy', activity));
    return events.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  }, [boreal]);
  const signalerTrail = useMemo<TrailEvent[]>(() => {
    if (!signaler) return [];
    const events: TrailEvent[] = [];
    signaler.proposals.pending.forEach((proposal) => {
      events.push({
        id: `signaler:proposal:${proposal.id}`,
        occurredAt: proposal.createdAt,
        time: new Date(proposal.createdAt).toLocaleTimeString('en-CA', { hour12: false }),
        entityId: 'signaler',
        type: `content_proposed:${proposal.platform}`,
        summary: `${proposal.niche ?? 'unassigned niche'} · ${proposal.angle}`,
      });
    });
    signaler.proposals.recent.forEach((activity) => {
      events.push({
        id: `signaler:activity:${activity.id}`,
        occurredAt: activity.decidedAt,
        time: new Date(activity.decidedAt).toLocaleTimeString('en-CA', { hour12: false }),
        entityId: 'signaler',
        type: `${activity.decision}:${activity.platform}`,
        summary: activity.angle,
      });
    });
    return events.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  }, [signaler]);
  const trail = useMemo(() => [...runtimeTrail, ...borealTrail, ...signalerTrail], [runtimeTrail, borealTrail, signalerTrail]);
  const visibleTrail = useMemo(() => {
    if (selectedId === 'city-hall') return trail;
    if (selectedId === 'genesis') return trail.filter((event) => ['genesis', 'genesis-worker', 'city-hall'].includes(event.entityId));
    return trail.filter((event) => event.entityId === selectedId);
  }, [selectedId, trail]);

  const liveResources = [
    { family: 'compute + cost', state: currentRun?.status === 'running' ? 'attention' : 'healthy', detail: currentRun ? `${currentRun.model ?? 'model pending'} · ${currentRun.costUsd == null ? 'cost pending' : `$${currentRun.costUsd.toFixed(4)}`} · ${currentRun.status}` : 'no active runtime worker' },
    { family: 'capabilities + permissions', state: 'healthy', detail: 'message.send + explicit resident.wake · no capability grants · no external delivery' },
    { family: 'knowledge + memory', state: bridgeLive ? 'fresh' : 'blocked', detail: `runtime schema ${snapshot?.runtime.schemaVersion ?? 'unavailable'} · ${snapshot?.events.length ?? 0} recent events observed` },
    { family: 'attention + workload', state: genesisState === 'attention' ? 'attention' : 'healthy', detail: `${snapshot?.runtime.events.queued ?? 0} queued · ${snapshot?.runtime.events.running ?? 0} running · ${snapshot?.runtime.events.dead_letter ?? 0} dead letter` },
    { family: 'artifacts + dependencies', state: bridgeLive ? 'healthy' : 'blocked', detail: 'runtime.sqlite3 · immutable events · persisted runs, traces, deliveries, and wake receipts' },
  ];

  const selectEntity = (id: EntityId) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    setSelectedId(id);
    setTab('now');
  };

  const PAN_LIMIT = 320;
  const clampPan = (value: number) => Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, value));

  const onMapPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragState.current = {
      startX: event.clientX, startY: event.clientY, originX: pan.x, originY: pan.y,
      moved: false, pointerId: event.pointerId, target: event.currentTarget,
    };
  };
  const onMapPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      // Only now — once this is provably a drag, not a click — capture the
      // pointer. Capturing eagerly on every pointerdown (including plain
      // clicks with zero movement) breaks click dispatch to the city-entity
      // buttons nested inside .city-map: once the container captures the
      // pointer, the browser stops routing the click to the original
      // hit-tested target underneath the cursor.
      drag.moved = true;
      drag.target.setPointerCapture(drag.pointerId);
      setIsPanning(true);
    }
    if (drag.moved) {
      setPan({ x: clampPan(drag.originX + dx), y: clampPan(drag.originY + dy) });
    }
  };
  const onMapPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (drag?.moved) {
      justDraggedRef.current = true;
      // The synthetic click (if the pointer released over a button) fires
      // synchronously right after this handler, before any setTimeout — so
      // this reset only ever clears a flag a same-sequence click already
      // consumed. Without it, releasing a drag over EMPTY map space (no
      // click ever fires to consume the flag) would leave it stuck true
      // and silently swallow the next unrelated, deliberate entity click.
      window.setTimeout(() => { justDraggedRef.current = false; }, 0);
    }
    dragState.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const resetPan = () => setPan({ x: 0, y: 0 });

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || !bridgeLive) return;
    const idempotencyKey = messageKey.current ?? `city:message:${crypto.randomUUID()}`;
    messageKey.current = idempotencyKey;
    setCommandBusy('message');
    setCommandError('');
    try {
      const response = await fetch('/api/city-genesis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'message.send', text, context: chatContext, idempotencyKey }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        messageKey.current = null;
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Message dispatch failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
      const receipt = body as GenesisMessageReceipt;
      setLastEventId(receipt.eventId);
      setMessage('');
      messageKey.current = null;
      wakeKey.current = null;
      await refreshSnapshot();
    } catch (cause) {
      setCommandError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCommandBusy('');
    }
  };

  const requestWake = async () => {
    if (!currentEvent || currentEvent.status !== 'queued' || !bridgeLive) return;
    const idempotencyKey = wakeKey.current ?? `city:wake:${crypto.randomUUID()}`;
    wakeKey.current = idempotencyKey;
    setCommandBusy('wake');
    setCommandError('');
    try {
      const response = await fetch('/api/city-genesis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'resident.wake', eventId: currentEvent.id, idempotencyKey }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        wakeKey.current = null;
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Wake dispatch failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
      const receipt = body as GenesisWakeReceipt;
      if (receipt.status === 'failed') wakeKey.current = null;
      await refreshSnapshot();
    } catch (cause) {
      setCommandError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCommandBusy('');
    }
  };

  const reviewBoreal = async (resident: 'hormozi' | 'ogilvy', actionId: number, decision: 'approved' | 'declined') => {
    setBorealReviewBusy(actionId);
    setBorealReviewError('');
    try {
      const response = await fetch(`/api/${resident}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId, decision }),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Review failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
      await refreshBoreal();
    } catch (cause) {
      setBorealReviewError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBorealReviewBusy(null);
    }
  };

  const reviewSignaler = async (actionId: number, decision: 'approved' | 'declined') => {
    setSignalerReviewBusy(actionId);
    setSignalerReviewError('');
    try {
      const response = await fetch('/api/signaler', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId, decision }),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Review failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
      await refreshSignaler();
    } catch (cause) {
      setSignalerReviewError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSignalerReviewBusy(null);
    }
  };

  const updateHormoziCycle = async (update: { enabled?: boolean; intervalHours?: number; maxActionsPerRun?: number }) => {
    setHormoziCycleBusy('config');
    setHormoziCycleError('');
    try {
      const response = await fetch('/api/hormozi-cycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(update),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Hormozi config update failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
    } catch (cause) {
      setHormoziCycleError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setHormoziCycleBusy('');
      await refreshBoreal();
    }
  };

  const runHormoziCycleNow = async () => {
    setHormoziCycleBusy('run');
    setHormoziCycleError('');
    try {
      const response = await fetch('/api/hormozi-cycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'run_now' }),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Hormozi cycle failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
    } catch (cause) {
      setHormoziCycleError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setHormoziCycleBusy('');
      await refreshBoreal();
    }
  };

  const resolveHormoziAction = async (actionId: number, status: 'done' | 'dismissed') => {
    setHormoziCycleBusy(actionId);
    setHormoziCycleError('');
    try {
      const response = await fetch('/api/hormozi-cycle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', actionId, status }),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Hormozi action update failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
    } catch (cause) {
      setHormoziCycleError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setHormoziCycleBusy('');
      await refreshBoreal();
    }
  };

  const commitHormoziInterval = () => {
    const value = Number(hormoziIntervalDraft);
    if (Number.isInteger(value) && value >= 1 && value <= 168) {
      setHormoziIntervalDraft(String(value));
      void updateHormoziCycle({ intervalHours: value });
    } else {
      setHormoziIntervalDraft(String(hormoziCycle.config?.intervalHours ?? 4));
    }
  };

  const commitHormoziMax = () => {
    const value = Number(hormoziMaxDraft);
    if (Number.isInteger(value) && value >= 1 && value <= 10) {
      setHormoziMaxDraft(String(value));
      void updateHormoziCycle({ maxActionsPerRun: value });
    } else {
      setHormoziMaxDraft(String(hormoziCycle.config?.maxActionsPerRun ?? 3));
    }
  };
  const updateSignalerPipeline = async (update: { enabled?: boolean; intervalHours?: number; maxProposalsPerRun?: number }) => {
    setSignalerPipelineBusy(true);
    setSignalerPipelineError('');
    try {
      const response = await fetch('/api/signaler-pipeline-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(update),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Pipeline config update failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
    } catch (cause) {
      setSignalerPipelineError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSignalerPipelineBusy(false);
      await refreshSignaler();
    }
  };

  const runSignalerPipelineNow = async () => {
    setSignalerPipelineBusy(true);
    setSignalerPipelineError('');
    try {
      const response = await fetch('/api/signaler-pipeline-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'run_now' }),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Pipeline run failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
    } catch (cause) {
      setSignalerPipelineError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSignalerPipelineBusy(false);
      await refreshSignaler();
    }
  };

  const commitSignalerInterval = () => {
    const value = Number(signalerIntervalDraft);
    if (Number.isFinite(value) && value >= 1) {
      const next = Math.trunc(value);
      setSignalerIntervalDraft(String(next));
      void updateSignalerPipeline({ intervalHours: next });
    } else {
      setSignalerIntervalDraft(String(signalerPipeline?.intervalHours ?? 24));
    }
  };

  const commitSignalerMax = () => {
    const value = Number(signalerMaxDraft);
    if (Number.isFinite(value) && value >= 1 && value <= 20) {
      const next = Math.trunc(value);
      setSignalerMaxDraft(String(next));
      void updateSignalerPipeline({ maxProposalsPerRun: next });
    } else {
      setSignalerMaxDraft(String(signalerPipeline?.maxProposalsPerRun ?? 3));
    }
  };

  const decideSignalerIdea = async (ideaId: number, handle: string) => {
    setSignalerIdeasBusy(ideaId);
    setSignalerIdeasError('');
    try {
      const response = await fetch('/api/signaler-account-ideas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'decide', ideaId, handle }),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Decide failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
    } catch (cause) {
      setSignalerIdeasError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSignalerIdeasBusy('');
      await refreshSignaler();
    }
  };

  const markSignalerIdeaCreated = async (ideaId: number) => {
    setSignalerIdeasBusy(ideaId);
    setSignalerIdeasError('');
    try {
      const response = await fetch('/api/signaler-account-ideas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', ideaId }),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Mark-created failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
    } catch (cause) {
      setSignalerIdeasError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSignalerIdeasBusy('');
      await refreshSignaler();
    }
  };

  const submitNewSignalerIdea = async (event: React.FormEvent) => {
    event.preventDefault();
    const nicheId = Number(newIdeaNicheId);
    const handles = newIdeaHandles.split(',').map((h) => h.trim()).filter(Boolean);
    if (!Number.isInteger(nicheId) || nicheId <= 0 || !newIdeaPlatform.trim() || handles.length === 0) return;
    setNewIdeaBusy(true);
    setSignalerIdeasError('');
    try {
      const response = await fetch('/api/signaler-account-ideas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'propose', nicheId, platform: newIdeaPlatform.trim(),
          handles, bio: newIdeaBio, notes: newIdeaNotes,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Add idea failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
      setNewIdeaNicheId('');
      setNewIdeaPlatform('');
      setNewIdeaHandles('');
      setNewIdeaBio('');
      setNewIdeaNotes('');
    } catch (cause) {
      setSignalerIdeasError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setNewIdeaBusy(false);
      await refreshSignaler();
    }
  };

  const sendSignalerChat = async () => {
    const text = signalerChatDraft.trim();
    if (!text) return;
    setSignalerChatBusy(true);
    setSignalerChatError('');
    try {
      const response = await fetch('/api/signaler-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const body: unknown = await response.json().catch(() => null);
      // The operator's message persists the moment this request lands
      // (before the model call runs) — clear the draft as soon as we have
      // a parsed response, regardless of whether the reply itself
      // succeeded, so a model-side failure never invites an accidental
      // duplicate resend of the same already-recorded message.
      if (body !== null) setSignalerChatDraft('');
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Chat failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
    } catch (cause) {
      setSignalerChatError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSignalerChatBusy(false);
      // Refresh regardless of outcome — the operator's message persists
      // before the model call runs, so a failed reply must still surface
      // the real outbound turn rather than looking like it vanished.
      await refreshSignaler();
    }
  };

  const sendBorealChat = async (resident: 'hormozi' | 'ogilvy') => {
    const text = borealChatDraft[resident].trim();
    if (!text) return;
    setBorealChatBusy(resident);
    setBorealChatError('');
    try {
      const response = await fetch('/api/boreal-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resident, text }),
      });
      const body: unknown = await response.json().catch(() => null);
      // Same reasoning as sendSignalerChat: the operator's message
      // persists before the model call runs, so clear the draft as soon
      // as the request lands, regardless of reply outcome.
      if (body !== null) setBorealChatDraft((current) => ({ ...current, [resident]: '' }));
      const ok = body !== null && typeof body === 'object' && 'ok' in body && body.ok === true;
      if (!response.ok || !ok) {
        const detail = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : `Chat failed with HTTP ${response.status}.`;
        throw new Error(detail);
      }
    } catch (cause) {
      setBorealChatError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBorealChatBusy('');
      await refreshBoreal();
    }
  };

  return (
    <section className="city-prototype" aria-label="Aperture City live Genesis bridge">
      <div className="city-prototype-head">
        <div>
          <span className="city-kicker">operational world / live vertical slice</span>
          <h1>Aperture City</h1>
          <p>Stable geography. Persistent residents. Temporary workers. Federated authority.</p>
        </div>
        <div className="city-head-actions">
          <span className="city-live-note">Genesis observed {observedAt}</span>
          <button type="button" onClick={() => void refreshSnapshot()}>refresh live state</button>
        </div>
      </div>
      <div className={`city-simulation-warning ${bridgeLive ? 'is-live' : ''}`} role="status">
        <strong>{bridgeLive ? 'Genesis bridge live.' : 'Genesis bridge unavailable.'}</strong>
        <span>Runtime snapshots, durable messages, and explicit wakes are real.</span>
      </div>
      {commandError && <div className="city-command-error" role="alert">{commandError}</div>}

      <div className="city-toolbar" aria-label="Map controls">
        <div className="city-segmented" aria-label="Zoom level">
          <button type="button" className={zoom === 'city' ? 'active' : ''} onClick={() => setZoom('city')}>city</button>
          <button type="button" className={zoom === 'district' ? 'active' : ''} onClick={() => setZoom('district')}>district</button>
        </div>
        <button type="button" onClick={resetPan} disabled={pan.x === 0 && pan.y === 0}>recenter map</button>
        <label className="city-toggle">
          <input type="checkbox" checked={showLinks} onChange={(event) => setShowLinks(event.target.checked)} />
          relationship signals
        </label>
        <span className="city-toolbar-stat">Genesis: {genesisState}</span>
        <span className="city-toolbar-stat">{snapshot?.runtime.events.queued ?? 0} queued · {snapshot?.runtime.events.running ?? 0} running</span>
        <span className="city-toolbar-stat">Hormozi: {liveEntities.hormozi.state} · {hormoziCycle.actions.length} action(s) · {boreal?.hormoziProposals.pending.length ?? 0} review</span>
        <span className="city-toolbar-stat">Ogilvy: {liveEntities.ogilvy.state} · {boreal?.ogilvyProposals.pending.length ?? 0} pending</span>
        <span className={`city-toolbar-stat${signalerNeedsAttention ? ' attention' : ''}`}>Signaler: {liveEntities.signaler.state} · {signaler?.proposals.pending.length ?? 0} pending{signalerNeedsAttention ? ' · setup needed' : ''}</span>
      </div>

      <div className="city-shell">
        <div
          className={`city-map city-map-${zoom} ${isPanning ? 'is-panning' : ''}`}
          onPointerDown={onMapPointerDown}
          onPointerMove={onMapPointerMove}
          onPointerUp={onMapPointerUp}
          onPointerCancel={onMapPointerUp}
        >
          <div
            className="city-map-viewport"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
          >
          <div className="city-grid" aria-hidden="true" />
          <section className="city-district city-district-operations" aria-label="Operations district"><span>operations district</span></section>
          <section className="city-district city-district-memory" aria-label="Memory and research district"><span>memory / research</span></section>
          <section className="city-district city-district-boreal" aria-label="Boréal district"><span>boréal</span></section>
          <section className="city-district city-district-signaler" aria-label="Signaler district"><span>signaler</span></section>

          {showLinks && (
            <svg className="city-links" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
              <path className="city-road" d="M170 150 C260 250 290 350 315 420" />
              <path className="city-road" d="M355 445 C470 430 535 390 620 405" />
              <path className="city-road subtle" d="M650 385 C760 325 795 260 840 215" />

            </svg>
          )}

          <button type="button" className={`city-entity city-hall ${selectedId === 'city-hall' ? 'selected' : ''}`} onClick={() => selectEntity('city-hall')} aria-label="City Hall, operator authority">
            <span className="city-building city-building-hall"><span>CH</span></span>
            <span className="city-entity-label">City Hall</span><span className="city-entity-state">{entities['city-hall'].state}</span>
          </button>
          <button type="button" className={`city-entity city-genesis ${selectedId === 'genesis' ? 'selected' : ''} ${genesisState === 'attention' ? 'needs-attention' : ''}`} onClick={() => selectEntity('genesis')} aria-label={`Genesis, ${genesisState}`}>
            <span className="city-building city-building-resident"><span>G</span></span>
            <span className="city-entity-label">Genesis</span><span className="city-entity-state">{genesisState}</span>
          </button>
          <button type="button" className={`city-entity city-site ${selectedId === 'genesis-site' ? 'selected' : ''}`} onClick={() => selectEntity('genesis-site')} aria-label={`Genesis runtime v2, ${snapshot?.adapter.health ?? 'connecting'}`}>
            <span className="city-building city-building-site"><span>R2</span></span>
            <span className="city-entity-label">runtime v2</span><span className="city-entity-state">{snapshot?.adapter.health ?? 'connecting'}</span>
          </button>
          <button type="button" className={`city-entity city-worker ${selectedId === 'genesis-worker' ? 'selected' : ''} ${workerState === 'working' ? 'active-worker' : 'blocked'}`} onClick={() => selectEntity('genesis-worker')} aria-label={`Runtime worker, ${workerState}`}>
            <span className="city-worker-core"><span>W</span></span>
            <span className="city-entity-label">runtime worker</span><span className="city-entity-state">{workerState}</span>
          </button>
          <button type="button" className={`city-entity city-victorique ${selectedId === 'victorique' ? 'selected' : ''}`} onClick={() => selectEntity('victorique')} aria-label="Victorique, idle, read only">
            <span className="city-building city-building-resident victorique"><span>V</span></span>
            <span className="city-entity-label">Victorique</span><span className="city-entity-state">idle · level 0</span>
          </button>
          <button type="button" className={`city-entity city-hormozi ${selectedId === 'hormozi' ? 'selected' : ''}`} onClick={() => selectEntity('hormozi')} aria-label={`Hormozi, ${liveEntities.hormozi.state}`}>
            <span className="city-building city-building-resident boreal"><span>H</span></span>
            <span className="city-entity-label">Hormozi</span><span className="city-entity-state">{liveEntities.hormozi.state}</span>
          </button>
          <button type="button" className={`city-entity city-ogilvy ${selectedId === 'ogilvy' ? 'selected' : ''}`} onClick={() => selectEntity('ogilvy')} aria-label={`Ogilvy, ${liveEntities.ogilvy.state}`}>
            <span className="city-building city-building-resident boreal"><span>O</span></span>
            <span className="city-entity-label">Ogilvy</span><span className="city-entity-state">{liveEntities.ogilvy.state}</span>
          </button>
          <button type="button" className={`city-entity city-signaler ${selectedId === 'signaler' ? 'selected' : ''} ${signalerNeedsAttention ? 'needs-attention' : ''}`} onClick={() => selectEntity('signaler')} aria-label={`Signaler, ${liveEntities.signaler.state}${signalerNeedsAttention ? ', setup needed' : ''}`}>
            <span className="city-building city-building-resident signaler"><span>VC</span></span>
            <span className="city-entity-label">Signaler</span><span className="city-entity-state">{signalerNeedsAttention ? 'needs setup' : liveEntities.signaler.state}</span>
          </button>
          </div>

          <div className="city-map-legend" aria-label="Status legend">
            <span><i className="legend-active" /> active</span><span><i className="legend-waiting" /> waiting</span><span><i className="legend-approval" /> approval</span><span><i className="legend-idle" /> idle</span>
          </div>
        </div>

        <aside className="city-inspector" aria-label={`${selected.name} inspector`}>
          <div className="city-inspector-head">
            <div><span className="city-entity-kind">{selected.kind.replace('_', ' ')}</span><h2>{selected.name}</h2><p>{selected.role}</p></div>
            <div className="city-inspector-status"><span>{selected.state}</span><small>{selected.freshness}</small></div>
          </div>
          <nav className="city-inspector-tabs" aria-label="Inspector sections">
            {tabs.map((item) => <button type="button" key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}
          </nav>

          <div className="city-inspector-body">
            {tab === 'now' && (
              <>
                <div className="city-summary-card"><span className="city-section-label">{['genesis', 'genesis-worker', 'genesis-site', 'hormozi', 'ogilvy', 'signaler'].includes(selectedId) ? 'live state' : 'fixture state'}</span><p>{selected.summary}</p></div>
                <dl className="city-facts">
                  <div><dt>current objective</dt><dd>{selected.currentGoal}</dd></div>
                  <div><dt>source freshness</dt><dd>{selected.freshness}</dd></div>
                  {selected.blocker && <div className="is-attention"><dt>primary blocker</dt><dd>{selected.blocker}</dd></div>}
                </dl>
                {(selectedId === 'hormozi' || selectedId === 'ogilvy') && (
                  <div className="city-approval-card">
                    <div className="city-card-heading"><span className="city-section-label">pending review</span><span>{(selectedId === 'hormozi' ? boreal?.hormoziProposals.pending.length : boreal?.ogilvyProposals.pending.length) ?? 0} proposal(s)</span></div>
                    <h3>{selectedId === 'hormozi' ? 'Sales hypotheses awaiting approval' : 'Content angles awaiting approval'}</h3>
                    <p>Real proposals from crm.db learning_actions, decided via approve/decline below — separate from the live chat tab's conversation. Full activity also lives in the Boréal panel.</p>
                    <div className="city-card-actions">
                      <button type="button" onClick={() => setTab('chat')}>open review queue</button>
                    </div>
                  </div>
                )}
                {selectedId === 'signaler' && signalerNeedsAttention && (
                  <div className="city-approval-card state-pending">
                    <div className="city-card-heading"><span className="city-section-label">setup incomplete</span><span>{signalerCredentialGaps.length} platform{signalerCredentialGaps.length === 1 ? '' : 's'} missing credentials{signalerAccountGap ? ' · 0 accounts' : ''}</span></div>
                    <h3>Signaler cannot post yet</h3>
                    <p>Real, filesystem-checked gaps — not a simulation. Fix via <code>~/projects/signaler/SETUP.md</code>.</p>
                    <div className="city-approval-meta">
                      {signalerAccountGap && <span>0 accounts registered — every platform needs at least one, then a warm-up phase before posting reliably.</span>}
                      {signalerCredentialGaps.map((gap) => (
                        <span key={gap.platform}>{gap.platform}: missing {gap.missingSecrets.join(', ')}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedId === 'signaler' && (
                  <div className="city-approval-card">
                    <div className="city-card-heading"><span className="city-section-label">pending review</span><span>{signaler?.proposals.pending.length ?? 0} proposal(s)</span></div>
                    <h3>Content proposals awaiting approval</h3>
                    <p>Real proposals from signaler.db content_proposals, decided via approve/decline below — separate from the live chat tab's conversation.</p>
                    <div className="city-card-actions">
                      <button type="button" onClick={() => setTab('chat')}>open review queue</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'work' && (
              selectedId === 'signaler' ? (
                <div className="city-stack">
                  <article className="city-data-card"><span>niches + accounts</span><strong>{signaler?.status.nicheCount ?? 0} niche(s) · {signaler?.status.accountCount ?? 0} account(s)</strong><p>Niches grounded in real vault/interest cross-referencing; account configuration and warm-up state are read from signaler.db.</p></article>
                  <article className="city-data-card"><span>generated total</span><strong>{signaler?.status.totalGenerated ?? 0} all-time</strong><p>{signaler?.status.generatedToday ?? 0} generated today, across all niches/platforms.</p></article>
                  <article className="city-data-card"><span>pending review</span><strong>{signaler?.proposals.pending.length ?? 0} proposal(s)</strong><p>Cross-platform content angles awaiting human approve/decline before publish.</p></article>
                  <article className="city-data-card city-pipeline-config">
                    <span>scheduled pipeline</span>
                    <strong>{signalerPipeline?.enabled ? 'enabled' : 'disabled'} · every {signalerPipeline?.intervalHours ?? 24}h · max {signalerPipeline?.maxProposalsPerRun ?? 3}/run</strong>
                    <p>{signalerPipeline?.lastRunAt ? `Last run ${new Date(signalerPipeline.lastRunAt).toLocaleString('en-CA')}: ${signalerPipeline.lastRunSummary}` : 'Never run yet — signaler-cycle.timer polls every 15 min, this schedule decides when it actually generates.'}</p>
                    {signalerPipelineError && <div className="city-command-error" role="alert">{signalerPipelineError}</div>}
                    <div className="city-card-actions">
                      <label className="city-toggle">
                        <input
                          type="checkbox"
                          checked={signalerPipeline?.enabled ?? false}
                          disabled={signalerPipelineBusy}
                          onChange={(event) => void updateSignalerPipeline({ enabled: event.target.checked })}
                        />
                        enabled
                      </label>
                      <label>
                        every
                        <input
                          type="number"
                          min={1}
                          value={signalerIntervalDraft}
                          disabled={signalerPipelineBusy}
                          onChange={(event) => setSignalerIntervalDraft(event.target.value)}
                          onBlur={commitSignalerInterval}
                          onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                        />
                        h
                      </label>
                      <label>
                        max
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={signalerMaxDraft}
                          disabled={signalerPipelineBusy}
                          onChange={(event) => setSignalerMaxDraft(event.target.value)}
                          onBlur={commitSignalerMax}
                          onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                        />
                        /run
                      </label>
                      <button
                        type="button"
                        onClick={() => void runSignalerPipelineNow()}
                        disabled={signalerPipelineBusy || !signalerPipeline?.enabled}
                        title={signalerPipeline?.enabled ? undefined : 'Enable the pipeline first'}
                      >
                        {signalerPipelineBusy ? 'running…' : 'run now'}
                      </button>
                    </div>
                  </article>
                  <article className="city-data-card city-account-ideas">
                    <span>account ideas</span>
                    <strong>{signalerIdeas.filter((i) => i.status === 'idea').length} need a decision · {signalerIdeas.filter((i) => i.status === 'decided').length} ready to create</strong>
                    {signalerIdeasError && <div className="city-command-error" role="alert">{signalerIdeasError}</div>}
                    {signalerNiches.filter((n) => !signalerIdeas.some((i) => i.nicheId === n.id)).length > 0 && (
                      <p className="city-idea-gap">Not planned yet: {signalerNiches.filter((n) => !signalerIdeas.some((i) => i.nicheId === n.id)).map((n) => n.name).join(', ')}</p>
                    )}
                    <div className="city-idea-list">
                      {signalerIdeas.filter((i) => i.status !== 'created').length === 0 && <p className="city-empty">— nothing needs a decision —</p>}
                      {signalerIdeas.filter((i) => i.status !== 'created').map((idea) => (
                        <div className={`city-idea-row status-${idea.status}`} key={idea.id}>
                          <div className="city-card-heading">
                            <span>{idea.nicheName ?? 'unassigned'} · {idea.platform}</span>
                            <span>{idea.status === 'idea' ? 'pick a handle' : 'ready'}</span>
                          </div>
                          <p>{idea.status === 'decided' ? idea.decidedHandle : idea.draftBio}</p>
                          {idea.notes && <p className="city-idea-note">{idea.notes}</p>}
                          <div className="city-card-actions">
                            {idea.status === 'idea' && idea.candidateHandles.map((h) => (
                              <button key={h} type="button" disabled={signalerIdeasBusy === idea.id} onClick={() => void decideSignalerIdea(idea.id, h)}>{h}</button>
                            ))}
                            {idea.status === 'decided' && (
                              <button type="button" className="city-action-primary" disabled={signalerIdeasBusy === idea.id} onClick={() => void markSignalerIdeaCreated(idea.id)}>{signalerIdeasBusy === idea.id ? 'working…' : 'mark created'}</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {signalerIdeas.filter((i) => i.status === 'created').length > 0 && (
                      <details className="city-idea-done">
                        <summary>{signalerIdeas.filter((i) => i.status === 'created').length} created</summary>
                        <ul>
                          {signalerIdeas.filter((i) => i.status === 'created').map((idea) => (
                            <li key={idea.id}>{idea.nicheName ?? 'unassigned'} · {idea.platform} · {idea.decidedHandle}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <details className="city-idea-add">
                      <summary>add idea</summary>
                      <form onSubmit={(event) => void submitNewSignalerIdea(event)}>
                        <label>
                          niche
                          <select value={newIdeaNicheId} onChange={(event) => setNewIdeaNicheId(event.target.value)} required>
                            <option value="">select…</option>
                            {signalerNiches.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                          </select>
                        </label>
                        <label>
                          platform
                          <input value={newIdeaPlatform} onChange={(event) => setNewIdeaPlatform(event.target.value)} placeholder="x, reddit, instagram…" required />
                        </label>
                        <label>
                          candidate handles (comma-separated)
                          <input value={newIdeaHandles} onChange={(event) => setNewIdeaHandles(event.target.value)} placeholder="@a, @b, @c" required />
                        </label>
                        <label>
                          draft bio
                          <textarea value={newIdeaBio} onChange={(event) => setNewIdeaBio(event.target.value)} rows={2} />
                        </label>
                        <label>
                          notes
                          <textarea value={newIdeaNotes} onChange={(event) => setNewIdeaNotes(event.target.value)} rows={2} />
                        </label>
                        <div className="city-card-actions">
                          <button type="submit" className="city-action-primary" disabled={newIdeaBusy}>{newIdeaBusy ? 'adding…' : 'add'}</button>
                        </div>
                      </form>
                    </details>
                  </article>
                </div>
              ) : selectedId === 'hormozi' || selectedId === 'ogilvy' ? (
                <div className="city-stack">
                  {selectedId === 'hormozi' && (
                    <>
                      <article className="city-data-card city-pipeline-config">
                        <span>operator cycle</span>
                        <strong>{hormoziCycle.config?.enabled ? 'enabled' : 'disabled'} · every {hormoziCycle.config?.intervalHours ?? 4}h · max {hormoziCycle.config?.maxActionsPerRun ?? 3}/run</strong>
                        <p>{hormoziCycle.config?.lastRunAt ? `Last run ${new Date(`${hormoziCycle.config.lastRunAt}Z`).toLocaleString('en-CA')}: ${hormoziCycle.config.lastRunSummary}` : 'Never run yet — hormozi-cycle.timer polls every 15 min; this DB schedule decides when planning actually runs.'}</p>
                        <p>Internal authority only: reads CRM evidence, ranks work, prepares briefs/drafts, and creates reminders. It never contacts a lead.</p>
                        {(hormoziCycleError || hormoziCycle.error) && <div className="city-command-error" role="alert">{hormoziCycleError || hormoziCycle.error}</div>}
                        <div className="city-card-actions">
                          <label className="city-toggle">
                            <input
                              type="checkbox"
                              checked={hormoziCycle.config?.enabled ?? false}
                              disabled={Boolean(hormoziCycleBusy)}
                              onChange={(event) => void updateHormoziCycle({ enabled: event.target.checked })}
                            />
                            scheduled
                          </label>
                          <label>
                            every
                            <input
                              type="number"
                              min={1}
                              max={168}
                              value={hormoziIntervalDraft}
                              disabled={Boolean(hormoziCycleBusy)}
                              onChange={(event) => setHormoziIntervalDraft(event.target.value)}
                              onBlur={commitHormoziInterval}
                              onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                            />
                            h
                          </label>
                          <label>
                            max
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={hormoziMaxDraft}
                              disabled={Boolean(hormoziCycleBusy)}
                              onChange={(event) => setHormoziMaxDraft(event.target.value)}
                              onBlur={commitHormoziMax}
                              onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                            />
                            /run
                          </label>
                          <button type="button" onClick={() => void runHormoziCycleNow()} disabled={Boolean(hormoziCycleBusy)}>
                            {hormoziCycleBusy === 'run' ? 'planning…' : 'run now'}
                          </button>
                        </div>
                      </article>
                      <article className="city-data-card">
                        <span>operator queue</span>
                        <strong>{hormoziCycle.actions.length} evidence-backed action(s)</strong>
                        <p>Ordered by urgency. Completing or dismissing an action also closes its linked reminder.</p>
                      </article>
                      {hormoziCycle.actions.length === 0 && <article className="city-data-card"><span>next action</span><strong>Nothing requires action.</strong><p>The cycle will re-evaluate when new CRM evidence arrives.</p></article>}
                      {hormoziCycle.actions.map((action, index) => (
                        <article className="city-data-card" key={action.id}>
                          <span>{index === 0 ? 'next action' : 'queued'} · priority {action.priority} · {action.actionType}</span>
                          <strong>{action.summary}</strong>
                          <p>{action.rationale}</p>
                          {typeof action.brief.objective === 'string' && <p><b>Objective:</b> {action.brief.objective}</p>}
                          {typeof action.brief.opening === 'string' && <p><b>Opening:</b> {action.brief.opening}</p>}
                          {typeof action.brief.draft_reply === 'string' && <p><b>Draft:</b> {action.brief.draft_reply}</p>}
                          <div className="city-approval-meta">
                            <span>{action.leadName || action.leadPhone || 'funnel pattern'} · {action.sourceKind} · {action.decisionSource}</span>
                            <span>{action.dueAt ? `due ${new Date(action.dueAt).toLocaleString('en-CA')}` : 'no execution deadline'}</span>
                            {typeof action.evidence.classification === 'string' && <span>evidence: {action.evidence.classification}</span>}
                          </div>
                          <div className="city-card-actions">
                            <button type="button" className="city-action-primary" disabled={Boolean(hormoziCycleBusy)} onClick={() => void resolveHormoziAction(action.id, 'done')}>{hormoziCycleBusy === action.id ? 'saving…' : 'done'}</button>
                            <button type="button" disabled={Boolean(hormoziCycleBusy)} onClick={() => void resolveHormoziAction(action.id, 'dismissed')}>dismiss</button>
                          </div>
                        </article>
                      ))}
                    </>
                  )}
                  <article className="city-data-card"><span>generated today</span><strong>{(selectedId === 'hormozi' ? boreal?.hormozi.generatedToday : boreal?.ogilvy.generatedToday) ?? 0} message variant(s)</strong><p>Reactive-tier sends pass prompt_version/model_version into the shared crm.db experiment ledger.</p></article>
                  <article className="city-data-card"><span>generated total</span><strong>{(selectedId === 'hormozi' ? boreal?.hormozi.totalGenerated : boreal?.ogilvy.totalGenerated) ?? 0} all-time</strong><p>Counted from message_variants where prompt_version LIKE '{selectedId}-%'.</p></article>
                  <article className="city-data-card"><span>pending review</span><strong>{(selectedId === 'hormozi' ? boreal?.hormoziProposals.pending.length : boreal?.ogilvyProposals.pending.length) ?? 0} proposal(s)</strong><p>{selectedId === 'hormozi' ? 'Falsifiable sales hypotheses awaiting human approve/decline.' : 'Facebook/Instagram content angles awaiting human approve/decline before publish.'}</p></article>
                </div>
              ) : <div className="city-stack"><article className="city-data-card"><span>project workplace</span><strong>Genesis runtime v2 · {snapshot?.adapter.health ?? 'connecting'}</strong><p>Monitor-only runtime. City reads durable state and cannot cut over production.</p></article><article className="city-data-card"><span>temporary worker</span><strong>{currentRun ? `${currentRun.id.slice(0, 8)} · ${currentRun.status}` : 'No active run'}</strong><p>{currentRun?.errorDetail ?? 'An explicit wake starts at most one event.'}</p></article><article className="city-data-card"><span>evidence</span><strong>{snapshot?.events.length ?? 0} events · {Object.values(snapshot?.runtime.runs ?? {}).reduce((sum, count) => sum + count, 0)} runs</strong><p>Event, run, trace, delivery, retry, and dead-letter state is read directly from runtime SQLite.</p></article></div>
            )}

            {tab === 'goals' && (
              selectedId === 'signaler' ? (
                <div className="city-goal-tree">
                  <article><span>mandate</span><strong>{selected.role}.</strong></article>
                  <article><span>current objective</span><strong>{selected.currentGoal}</strong></article>
                  <article><span>guardrail</span><strong>Every generated post is immutable and human-reviewed before a separate Typefully delivery step. Evidence URLs come from canonical research records; monetization never overrides account trust.</strong></article>
                  {(signaler?.status.roadmap ?? []).map((item) => (
                    <article key={item.id}>
                      <span>{item.kind === 'po_task' ? 'PO task' : 'milestone'} · {item.accountHandle} · {item.status.replace('_', ' ')}</span>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                      <p>Owner: {item.owner}{item.blocker ? ` · Blocker: ${item.blocker}` : ''}</p>
                    </article>
                  ))}
                </div>
              ) : selectedId === 'hormozi' || selectedId === 'ogilvy' ? (
              <div className="city-goal-tree">
                <article><span>mandate</span><strong>{selected.role}.</strong></article>
                <article><span>current objective</span><strong>{selected.currentGoal}</strong></article>
                <article><span>guardrail</span><strong>{selectedId === 'hormozi' ? 'May inspect, rank, brief, draft, remind, and propose; never sends, calls, changes lead state, changes doctrine, or activates experiments.' : 'Never publishes directly — approval appends to the content batch a human-run publisher delivers unchanged.'}</strong></article>
              </div>
            ) : <div className="city-goal-tree"><article><span>mission · operator authority</span><strong>Maintain operational continuity without obscuring human authority.</strong></article><article><span>objective · resident authority</span><strong>Process trusted operator messages through the bounded monitor-only runtime.</strong></article><article><span>task · worker contract</span><strong>Claim at most one durable event, persist the decision and evidence, then stop.</strong></article></div>
            )}

            {tab === 'resources' && (
              selectedId === 'signaler' ? (
                <div className="city-resource-list">
                  <article><div><span>niches</span><em className="resource-healthy">{signaler?.status.nicheCount ?? 0}</em></div><p>Candidate niches persisted via signaler_lib.propose_niche, grounded in vault interest + trend research.</p></article>
                  <article><div><span>accounts</span><em className={(signaler?.status.accountCount ?? 0) > 0 ? 'resource-fresh' : 'resource-blocked'}>{signaler?.status.accountCount ?? 0}</em></div><p>Real account rows carry warm-up cadence, research opt-in, and publishing-provider state.</p></article>
                  <article><div><span>attention + workload</span><em className={(signaler?.proposals.pending.length ?? 0) > 0 ? 'resource-attention' : 'resource-healthy'}>{signaler?.proposals.pending.length ?? 0} pending</em></div><p>Requires a human approve/decline; publishing is a separate, also human-triggered step.</p></article>
                </div>
              ) : selectedId === 'hormozi' || selectedId === 'ogilvy' ? (
              <div className="city-resource-list">
                <article><div><span>doctrine</span><em className="resource-healthy">{((selectedId === 'hormozi' ? boreal?.hormozi.activeDoctrineVersions : boreal?.ogilvy.activeDoctrineVersions) ?? []).length} version(s)</em></div><p>{((selectedId === 'hormozi' ? boreal?.hormozi.activeDoctrineVersions : boreal?.ogilvy.activeDoctrineVersions) ?? []).join(', ') || 'none observed yet'}</p></article>
                <article><div><span>knowledge + memory</span><em className={boreal ? 'resource-fresh' : 'resource-blocked'}>{boreal ? 'fresh' : 'blocked'}</em></div><p>learning_actions rows (actor='{selectedId}') — same review mechanism the Forge learning dashboard uses.</p></article>
                <article><div><span>attention + workload</span><em className={((selectedId === 'hormozi' ? boreal?.hormoziProposals.pending.length : boreal?.ogilvyProposals.pending.length) ?? 0) > 0 ? 'resource-attention' : 'resource-healthy'}>{(selectedId === 'hormozi' ? boreal?.hormoziProposals.pending.length : boreal?.ogilvyProposals.pending.length) ?? 0} pending</em></div><p>Requires a human approve/decline; never auto-activates.</p></article>
              </div>
            ) : <div className="city-resource-list">{liveResources.map((resource) => <article key={resource.family}><div><span>{resource.family}</span><em className={`resource-${resource.state}`}>{resource.state}</em></div><p>{resource.detail}</p></article>)}</div>
            )}

            {tab === 'connections' && (
              selectedId === 'signaler' ? (
                <div className="city-stack">
                  <article className="city-data-card"><span>observes</span><strong>signaler.db (accounts, research_items, proposals, reviews, deliveries, roadmap)</strong><p>Fully separate from crm.db; no Boréal data crosses this boundary.</p></article>
                  <article className="city-data-card"><span>may propose</span><strong>Evidence-backed content_proposals row (requires_review=1)</strong><p>A source-aware, account-specific post for a human to approve or decline.</p></article>
                  <article className="city-data-card"><span>external delivery</span><strong>Typefully draft or future schedule, only after approval and an explicit publish action</strong><p>Typefully credentials remain server-side; generated content never bypasses the review gate.</p></article>
                </div>
              ) : selectedId === 'hormozi' || selectedId === 'ogilvy' ? (
              <div className="city-stack">
                <article className="city-data-card"><span>observes</span><strong>crm.db message_variants + learning_actions</strong><p>Read-write via crm_lib; every send/proposal is logged.</p></article>
                <article className="city-data-card"><span>may propose</span><strong>learning_actions row (requires_review=1)</strong><p>{selectedId === 'hormozi' ? 'A sales hypothesis for a human to approve or decline.' : 'A Facebook/Instagram content angle for a human to approve or decline.'}</p></article>
                <article className="city-data-card"><span>cannot dispatch</span><strong>{selectedId === 'hormozi' ? 'Auto-promote to SALES_DOCTRINE or an active experiment' : 'Publish a post directly to Facebook/Instagram'}</strong><p>That authority remains a separate, deliberate human step.</p></article>
              </div>
            ) : <div className="city-stack"><article className="city-data-card"><span>observes</span><strong>Genesis runtime v2</strong><p>Read-only SQLite snapshot · schema {snapshot?.runtime.schemaVersion ?? 'unavailable'}.</p></article><article className="city-data-card"><span>may dispatch</span><strong>Durable message · explicit transient wake</strong><p>Every dispatch carries a client-owned idempotency key.</p></article><article className="city-data-card"><span>cannot dispatch</span><strong>Capability grants · external delivery · arbitrary tools</strong><p>Those authorities remain source-owned and unavailable to City.</p></article></div>
            )}

            {tab === 'trail' && <ol className="city-trail">{[...visibleTrail].reverse().map((event) => <li key={event.id}><time>{event.time}</time><div><span>{event.type}</span><p>{event.summary}</p></div></li>)}</ol>}

            {tab === 'chat' && (
              selectedId === 'signaler' ? (
                <div className="city-chat">
                  <div className="city-chat-log">
                    {signaler?.chat.length ? (
                      signaler.chat.map((msg) => (
                        <div className={`city-message ${msg.role === 'operator' ? 'outbound' : 'inbound'}`} key={msg.id}>
                          <span>{msg.role === 'operator' ? 'operator' : 'Signaler'} · {new Date(msg.createdAt).toLocaleTimeString('en-CA', { hour12: false })}</span>
                          <p>{msg.body}</p>
                        </div>
                      ))
                    ) : (
                      <div className="city-message system">
                        <span>live chat</span>
                        <p>No messages yet. Signaler replies live here — never a publishable post, that stays the separate review queue below.</p>
                      </div>
                    )}
                  </div>
                  {signalerChatError && <div className="city-command-error" role="alert">{signalerChatError}</div>}
                  <textarea
                    value={signalerChatDraft}
                    onChange={(event) => setSignalerChatDraft(event.target.value)}
                    placeholder="Chat with Signaler…"
                    rows={3}
                    maxLength={4_000}
                  />
                  <div className="city-card-actions">
                    <button type="button" className="city-action-primary" onClick={() => void sendSignalerChat()} disabled={!signalerChatDraft.trim() || signalerChatBusy}>{signalerChatBusy ? 'replying…' : 'send'}</button>
                  </div>
                  <div className="city-boundary-note">
                    <strong>Live chat + proposal review</strong>
                    <p>Signaler proposes cross-platform content angles as durable, reviewable records — a human approves or declines below.</p>
                  </div>
                  {signalerReviewError && <div className="city-command-error" role="alert">{signalerReviewError}</div>}
                  <div className="city-stack">
                    {signaler?.proposals.pending.length ? (
                      signaler.proposals.pending.map((proposal) => (
                        <article className="city-data-card" key={proposal.id}>
                          <span>{proposal.platform} · {proposal.format}{proposal.niche ? ` · ${proposal.niche}` : ''}</span>
                          <strong>{proposal.angle} — {proposal.copyText}</strong>
                          <div className="city-card-actions">
                            <button type="button" className="city-action-primary" disabled={signalerReviewBusy === proposal.id} onClick={() => void reviewSignaler(proposal.id, 'approved')}>{signalerReviewBusy === proposal.id ? 'working…' : 'approve'}</button>
                            <button type="button" className="city-action-danger" disabled={signalerReviewBusy === proposal.id} onClick={() => void reviewSignaler(proposal.id, 'declined')}>{signalerReviewBusy === proposal.id ? 'working…' : 'decline'}</button>
                          </div>
                        </article>
                      ))
                    ) : <p className="city-empty">— no proposals pending review —</p>}
                  </div>
                </div>
              ) : selectedId === 'hormozi' || selectedId === 'ogilvy' ? (
                <div className="city-chat">
                  <div className="city-chat-log">
                    {borealChat[selectedId as 'hormozi' | 'ogilvy'].length ? (
                      borealChat[selectedId as 'hormozi' | 'ogilvy'].map((msg) => (
                        <div className={`city-message ${msg.role === 'operator' ? 'outbound' : 'inbound'}`} key={msg.id}>
                          <span>{msg.role === 'operator' ? 'operator' : selected.name} · {new Date(msg.createdAt).toLocaleTimeString('en-CA', { hour12: false })}</span>
                          <p>{msg.body}</p>
                        </div>
                      ))
                    ) : (
                      <div className="city-message system">
                        <span>live chat</span>
                        <p>No messages yet. {selected.name} replies live here — never a lead-facing message, that stays the separate review queue below.</p>
                      </div>
                    )}
                  </div>
                  {borealChatError && <div className="city-command-error" role="alert">{borealChatError}</div>}
                  <textarea
                    value={borealChatDraft[selectedId as 'hormozi' | 'ogilvy']}
                    onChange={(event) => { const value = event.target.value; setBorealChatDraft((current) => ({ ...current, [selectedId as 'hormozi' | 'ogilvy']: value })); }}
                    placeholder={`Chat with ${selected.name}…`}
                    rows={3}
                    maxLength={4_000}
                  />
                  <div className="city-card-actions">
                    <button type="button" className="city-action-primary" onClick={() => void sendBorealChat(selectedId as 'hormozi' | 'ogilvy')} disabled={!borealChatDraft[selectedId as 'hormozi' | 'ogilvy'].trim() || borealChatBusy === selectedId}>{borealChatBusy === selectedId ? 'replying…' : 'send'}</button>
                  </div>
                  <div className="city-boundary-note">
                    <strong>Live chat + proposal review</strong>
                    <p>{selected.name} proposes {selectedId === 'hormozi' ? 'sales hypotheses' : 'content angles'} as durable, reviewable records — a human approves or declines below. Full activity history also lives in the Boréal panel.</p>
                  </div>
                  {borealReviewError && <div className="city-command-error" role="alert">{borealReviewError}</div>}
                  <div className="city-stack">
                    {(selectedId === 'hormozi' ? boreal?.hormoziProposals.pending : boreal?.ogilvyProposals.pending)?.length ? (
                      (selectedId === 'hormozi' ? boreal!.hormoziProposals.pending : boreal!.ogilvyProposals.pending).map((proposal) => (
                        <article className="city-data-card" key={proposal.id}>
                          <span>{proposal.actionType}</span>
                          <strong>{proposal.summary}</strong>
                          <div className="city-card-actions">
                            <button type="button" className="city-action-primary" disabled={borealReviewBusy === proposal.id} onClick={() => void reviewBoreal(selectedId as 'hormozi' | 'ogilvy', proposal.id, 'approved')}>{borealReviewBusy === proposal.id ? 'working…' : 'approve'}</button>
                            <button type="button" className="city-action-danger" disabled={borealReviewBusy === proposal.id} onClick={() => void reviewBoreal(selectedId as 'hormozi' | 'ogilvy', proposal.id, 'declined')}>{borealReviewBusy === proposal.id ? 'working…' : 'decline'}</button>
                          </div>
                        </article>
                      ))
                    ) : <p className="city-empty">— no proposals pending review —</p>}
                  </div>
                </div>
              ) : selected.kind === 'resident' ? (
              <div className="city-chat">
                <label>
                  conversation context
                  <select value={chatContext} onChange={(event) => setChatContext(event.target.value)}>
                    <option>general</option>
                    <option>project: Genesis runtime v2</option>
                    <option>goal: first live City control loop</option>
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
                        <span>live adapter boundary</span>
                        <p>Messages persist first. Genesis runs only after a separate explicit wake. The browser polls durable runtime evidence instead of waiting on the model process.</p>
                      </div>
                      {[...cityEvents].reverse().map((event) => (
                        <div className="city-message outbound" key={event.id}>
                          <span>{event.context} · event {event.id.slice(0, 8)} · {event.status}</span>
                          <p>{event.text}</p>
                        </div>
                      ))}
                      {responseText && currentEvent && (
                        <div className="city-message inbound">
                          <span>Genesis · event {currentEvent.id.slice(0, 8)} · persisted decision</span>
                          <p>{responseText}</p>
                        </div>
                      )}
                    </div>
                    <textarea
                      value={message}
                      onChange={(event) => {
                        setMessage(event.target.value);
                        messageKey.current = null;
                      }}
                      placeholder="Queue a durable message to Genesis…"
                      rows={4}
                      maxLength={8_000}
                    />
                    <div className="city-card-actions">
                      <button type="button" className="city-action-primary" onClick={() => void sendMessage()} disabled={!message.trim() || !bridgeLive || commandBusy !== ''}>{commandBusy === 'message' ? 'queueing…' : 'queue durable message'}</button>
                      <button type="button" onClick={() => void requestWake()} disabled={!currentEvent || currentEvent.status !== 'queued' || !bridgeLive || commandBusy !== ''}>{commandBusy === 'wake' ? 'starting wake…' : 'wake Genesis for queued event'}</button>
                    </div>
                    <div className={`city-delivery-status ${bridgeLive ? 'is-live' : ''}`} aria-live="polite">
                      <div><span>message event</span><strong>{currentEvent ? `${currentEvent.id.slice(0, 8)} · ${currentEvent.status}` : 'none queued from City'}</strong></div>
                      <div><span>transient wake</span><strong>{currentWake ? `${currentWake.wakeId.slice(-8)} · ${currentWake.status}` : 'not requested'}</strong></div>
                      <div><span>resident run</span><strong>{currentRun ? `${currentRun.id.slice(0, 8)} · ${currentRun.status}` : 'not started'}</strong></div>
                      <div><span>response</span><strong>{responseText ? 'persisted' : currentEvent?.status === 'succeeded' ? 'silent decision' : 'pending'}</strong></div>
                      <p>All displayed state is reconciled from Genesis runtime SQLite and Aperture’s durable wake receipt. No browser request remains open around the model subprocess.</p>
                    </div>
                  </>
                )}
              </div>
              ) : <p className="city-empty">Chat belongs to persistent residents, not workers, projects, or facilities.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
