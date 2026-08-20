export type ResidentReferenceKind = 'capability' | 'data' | 'external' | 'repository' | 'service';

export interface ResidentFlowStep {
  id: string;
  label: string;
  summary: string;
  relationship: string;
  reference: {
    kind: ResidentReferenceKind;
    key: string;
    source?: string;
  };
}

export interface ResidentFlow {
  id: string;
  label: string;
  summary: string;
  steps: ResidentFlowStep[];
}

export interface ResidentTopology {
  id: string;
  label: string;
  role: string;
  summary: string;
  mandate: string;
  project: string;
  healthServices: string[];
  source: string;
  flows: ResidentFlow[];
}

const HOME = '/home/merulox';

export const RESIDENT_TOPOLOGIES: ResidentTopology[] = [
  {
    id: 'genesis',
    label: 'Genesis',
    role: 'Ambient continuity and cognitive partner',
    summary: 'Durable operator conversation, bounded execution, typed memory, and delivery receipts.',
    mandate: 'Maintain continuity for the operator while keeping every action inside explicit runtime and capability boundaries.',
    project: 'genesis',
    healthServices: ['genesis-voice', 'genesis-core', 'genesis-listener'],
    source: `${HOME}/projects/genesis + ${HOME}/projects/aperture/src/lib/city-genesis.ts`,
    flows: [
      {
        id: 'durable-conversation',
        label: 'Durable conversation loop',
        summary: 'A trusted operator message becomes a durable event, a bounded decision, and an auditable delivery.',
        steps: [
          { id: 'city-bridge', label: 'Aperture City bridge', summary: 'Accepts trusted City messages and wake requests with idempotency keys.', relationship: 'receives operator intent', reference: { kind: 'capability', key: 'aperture-city-genesis-bridge' } },
          { id: 'runtime', label: 'Genesis runtime v2', summary: 'Persists inbox events, attempts, traces, decisions, and delivery state.', relationship: 'journals durable event', reference: { kind: 'capability', key: 'genesis-runtime-v2' } },
          { id: 'capability-broker', label: 'Capability broker', summary: 'Keeps consequential execution behind allowlists, approvals, leases, and receipts.', relationship: 'gates bounded action', reference: { kind: 'capability', key: 'genesis-capability-v2' } },
          { id: 'runtime-ledger', label: 'Runtime SQLite ledger', summary: 'Stores event, run, trace, delivery, and wake evidence used by Aperture.', relationship: 'records evidence', reference: { kind: 'data', key: 'runtime.sqlite3', source: `${HOME}/.local/share/genesis-runtime-v2/runtime.sqlite3` } },
        ],
      },
      {
        id: 'ambient-voice',
        label: 'Ambient voice loop',
        summary: 'Local wake detection opens a bounded Genesis turn and speaks the resulting response.',
        steps: [
          { id: 'voice-runtime', label: 'Genesis voice', summary: 'Local wake gate and ambient conversation runtime with bounded OMP delegation.', relationship: 'detects and frames turn', reference: { kind: 'capability', key: 'genesis-voice' } },
          { id: 'omp-adapter', label: 'OMP shadow adapter', summary: 'Projects provider-neutral work, run, evidence, cancellation, and ownership without widening authority.', relationship: 'delegates bounded work', reference: { kind: 'capability', key: 'omp-shadow-adapter' } },
          { id: 'speech', label: 'Genesis speak', summary: 'Provides local fallback speech for the resident response.', relationship: 'renders response', reference: { kind: 'capability', key: 'genesis-speak' } },
        ],
      },
      {
        id: 'memory',
        label: 'Memory stack',
        summary: 'Evidence-backed memory is typed, signed, and kept separate from capability authority.',
        steps: [
          { id: 'memory-contract', label: 'Genesis memory v2', summary: 'Signed typed memory with evidence and weakest-sufficient inference provenance.', relationship: 'normalizes memory', reference: { kind: 'capability', key: 'genesis-memory-v2' } },
          { id: 'genesis-project', label: 'Genesis repository', summary: 'Owns the resident runtime, contracts, tests, and research.', relationship: 'implements resident', reference: { kind: 'repository', key: 'genesis' } },
        ],
      },
    ],
  },
  {
    id: 'victorique',
    label: 'Victorique',
    role: 'Vault intelligence and research resident',
    summary: 'Conversational research identity over the operator vault, with a live Telegram surface and an intentionally limited City projection.',
    mandate: 'Reconstruct scattered knowledge into sourced, inspectable research without pretending fixture state is live autonomy.',
    project: 'victorique',
    healthServices: ['victorique-bot'],
    source: `${HOME}/projects/victorique + ${HOME}/projects/aperture/src/components/city/CityPrototype.tsx`,
    flows: [
      {
        id: 'vault-conversation',
        label: 'Vault conversation loop',
        summary: 'A Telegram question reaches Victorique, which reads the knowledge vault and returns a sourced answer.',
        steps: [
          { id: 'telegram', label: 'Victorique bot', summary: 'Live Telegram conversation surface for the resident.', relationship: 'receives question', reference: { kind: 'service', key: 'victorique-bot' } },
          { id: 'resident-core', label: 'Victorique repository', summary: 'Owns resident identity, research behavior, and response construction.', relationship: 'interprets request', reference: { kind: 'repository', key: 'victorique' } },
          { id: 'vault', label: 'Obsidian knowledge vault', summary: 'Canonical operator knowledge and generated retrieval bundles.', relationship: 'reads evidence', reference: { kind: 'data', key: 'obsidian-vault', source: `${HOME}/obsidian` } },
          { id: 'telegram-return', label: 'Telegram operator channel', summary: 'Returns the resident answer to the operator; no autonomous external action is implied.', relationship: 'returns answer', reference: { kind: 'external', key: 'Telegram' } },
        ],
      },
    ],
  },
  {
    id: 'hormozi',
    label: 'Hormozi',
    role: 'Evidence-backed sales operator for Boréal Numérique',
    summary: 'Shared sales brain used by lead-response callers, with CRM memory, operator actions, review-gated learning, and live chat.',
    mandate: 'Create mutually qualified, trust-preserving conversations while never sending, calling, changing lead state, or activating experiments directly.',
    project: 'boreal',
    healthServices: ['missed-call-bot', 'sms-inbox', 'sms-webhook', 'hormozi-cycle'],
    source: `${HOME}/projects/boreal/scripts/hormozi.py + ${HOME}/projects/aperture/src/lib/boreal.ts`,
    flows: [
      {
        id: 'lead-response',
        label: 'Lead response brain',
        summary: 'Caller-owned SMS services invoke Hormozi for context-aware language; the resident does not own delivery.',
        steps: [
          { id: 'sms-surface', label: 'SMS inbox + webhook', summary: 'Observes inbound lead and reply events from the production SMS surface.', relationship: 'supplies lead event', reference: { kind: 'service', key: 'sms-inbox' } },
          { id: 'brain', label: 'Hormozi engine', summary: 'Builds trust-preserving sales language and next-action reasoning from CRM evidence.', relationship: 'reasons over context', reference: { kind: 'capability', key: 'hormozi' } },
          { id: 'crm', label: 'Boréal CRM ledger', summary: 'Stores leads, conversations, message variants, outcomes, and learning actions.', relationship: 'reads and records evidence', reference: { kind: 'data', key: 'crm.db', source: `${HOME}/projects/boreal-leads/crm.db` } },
          { id: 'caller-owned-delivery', label: 'Caller-owned delivery', summary: 'The invoking service or human operator retains authority for any lead-facing send or call.', relationship: 'retains action authority', reference: { kind: 'external', key: 'Human + guarded Twilio callers' } },
        ],
      },
      {
        id: 'learning-cycle',
        label: 'Review-gated learning loop',
        summary: 'CRM evidence becomes an internal operator action or hypothesis; production doctrine remains human-controlled.',
        steps: [
          { id: 'cycle', label: 'Hormozi cycle', summary: 'Builds bounded internal actions from attributable sales evidence.', relationship: 'evaluates evidence', reference: { kind: 'capability', key: 'hormozi-cycle' } },
          { id: 'learning-actions', label: 'learning_actions ledger', summary: 'Persists proposals, review state, and append-only decisions in the existing CRM.', relationship: 'journals proposal', reference: { kind: 'data', key: 'learning_actions', source: `${HOME}/projects/boreal-leads/crm.db` } },
          { id: 'operator-review', label: 'Operator review gate', summary: 'Approval records intent only; it never self-promotes a hypothesis into production.', relationship: 'requires decision', reference: { kind: 'external', key: 'Aperture / Commander operator' } },
        ],
      },
      {
        id: 'resident-chat',
        label: 'Resident chat',
        summary: 'Aperture sends a synchronous resident turn and persists both sides of the conversation.',
        steps: [
          { id: 'chat', label: 'Boréal chat adapter', summary: 'Runs a real Hormozi turn with status context and durable chat history.', relationship: 'opens conversation', reference: { kind: 'capability', key: 'boreal-chat' } },
          { id: 'chat-memory', label: 'resident_chat_messages', summary: 'Stores operator and resident messages in the Boréal CRM.', relationship: 'persists conversation', reference: { kind: 'data', key: 'resident_chat_messages', source: `${HOME}/projects/boreal-leads/crm.db` } },
        ],
      },
    ],
  },
  {
    id: 'ogilvy',
    label: 'Ogilvy',
    role: 'Boréal acquisition content resident',
    summary: 'Proposes attributable acquisition content, records immutable review decisions, and hands approved copy to a separate publishing boundary.',
    mandate: 'Own money-optimized Boréal content generation and attribution learning while never publishing directly.',
    project: 'boreal',
    healthServices: [],
    source: `${HOME}/projects/boreal/scripts/ogilvy.py + ${HOME}/projects/aperture/src/lib/boreal.ts`,
    flows: [
      {
        id: 'content-proposal',
        label: 'Content proposal loop',
        summary: 'Ogilvy turns acquisition context into a durable proposal that must pass human review before entering the content batch.',
        steps: [
          { id: 'resident', label: 'Ogilvy resident', summary: 'Generates Boréal acquisition content proposals under its resident mandate.', relationship: 'proposes content', reference: { kind: 'capability', key: 'ogilvy-resident' } },
          { id: 'proposal-ledger', label: 'learning_actions ledger', summary: 'Stores pending and resolved Ogilvy proposals in the shared Boréal CRM.', relationship: 'journals immutable proposal', reference: { kind: 'data', key: 'learning_actions', source: `${HOME}/projects/boreal-leads/crm.db` } },
          { id: 'review', label: 'Ogilvy review', summary: 'Atomically approves or declines the proposal and appends a separate decision record.', relationship: 'requires human review', reference: { kind: 'capability', key: 'ogilvy-review' } },
          { id: 'batch', label: 'Local content batch', summary: 'Receives approved copy idempotently; publishing remains a separate human-run effect.', relationship: 'hands off approved copy', reference: { kind: 'data', key: 'content-batch', source: `${HOME}/projects/boreal/content` } },
        ],
      },
      {
        id: 'resident-chat',
        label: 'Resident chat',
        summary: 'Aperture opens a real Ogilvy turn using the shared Boréal conversation adapter.',
        steps: [
          { id: 'chat', label: 'Boréal chat adapter', summary: 'Runs the synchronous resident turn with current proposal context.', relationship: 'opens conversation', reference: { kind: 'capability', key: 'boreal-chat' } },
          { id: 'chat-memory', label: 'resident_chat_messages', summary: 'Persists the operator and Ogilvy messages in the CRM.', relationship: 'persists conversation', reference: { kind: 'data', key: 'resident_chat_messages', source: `${HOME}/projects/boreal-leads/crm.db` } },
        ],
      },
    ],
  },
  {
    id: 'signaler',
    label: 'Signaler',
    role: 'Cross-platform evidence content resident',
    summary: 'Own account registry, proposal database, review queue, scheduler boundary, and live conversation separate from Boréal.',
    mandate: 'Turn authoritative evidence and real interests into account-specific content while keeping every external delivery human-gated.',
    project: 'signaler',
    healthServices: ['signaler-cycle'],
    source: `${HOME}/projects/signaler + ${HOME}/projects/aperture/src/lib/signaler.ts`,
    flows: [
      {
        id: 'generation',
        label: 'Research-to-proposal loop',
        summary: 'Account strategy and evidence become immutable platform-specific proposals in Signaler’s own database.',
        steps: [
          { id: 'cycle', label: 'Signaler cycle', summary: 'Scheduled orchestrator for research, account strategy, and proposal generation.', relationship: 'starts bounded cycle', reference: { kind: 'service', key: 'signaler-cycle' } },
          { id: 'growth-contract', label: 'Growth contract', summary: 'Applies account-scoped discovery and engagement constraints to generated content.', relationship: 'constrains generation', reference: { kind: 'capability', key: 'signaler-growth-contract' } },
          { id: 'database', label: 'signaler.db', summary: 'Stores accounts, niches, subscriptions, proposals, reviews, roadmaps, and chat history.', relationship: 'journals state', reference: { kind: 'data', key: 'signaler.db', source: `${HOME}/projects/signaler/signaler.db` } },
        ],
      },
      {
        id: 'review-delivery',
        label: 'Review-to-delivery loop',
        summary: 'Commander review grants a bounded handoff to Typefully; direct autonomous publishing remains forbidden.',
        steps: [
          { id: 'commander', label: 'Commander account review', summary: 'Surfaces account profiles, proposals, review decisions, and delivery actions.', relationship: 'requests operator review', reference: { kind: 'capability', key: 'signaler-commander-accounts' } },
          { id: 'human-gate', label: 'Human approval gate', summary: 'A proposal must be explicitly approved before any scheduler delivery.', relationship: 'grants bounded approval', reference: { kind: 'external', key: 'Commander operator' } },
          { id: 'typefully', label: 'Typefully delivery', summary: 'Approved content is handed to the external scheduler using account-scoped credentials.', relationship: 'delivers approved proposal', reference: { kind: 'external', key: 'Typefully' } },
        ],
      },
    ],
  },
  {
    id: 'vaynerchuk',
    label: 'Vaynerchuk',
    role: 'Scheduled social account resident',
    summary: 'Account-scoped generation, durable proposal review, live chat, and platform-adapter publishing with explicit human approval.',
    mandate: 'Operate scheduled social accounts through durable proposals and human review; never bypass account or platform constraints.',
    project: 'vaynerchuk',
    healthServices: ['vaynerchuk-cycle'],
    source: `${HOME}/projects/vaynerchuk + registered vaynerchuk capabilities`,
    flows: [
      {
        id: 'proposal-cycle',
        label: 'Scheduled proposal loop',
        summary: 'A configured account cycle creates durable proposals in the resident’s own SQLite state.',
        steps: [
          { id: 'cycle', label: 'Vaynerchuk cycle', summary: 'Config-gated scheduler that syncs niches and generates content proposals.', relationship: 'starts account cycle', reference: { kind: 'capability', key: 'vaynerchuk-cycle' } },
          { id: 'library', label: 'Vaynerchuk library', summary: 'Owns resident schema, account state, proposal helpers, and chat history.', relationship: 'applies resident contract', reference: { kind: 'capability', key: 'vaynerchuk-lib' } },
          { id: 'database', label: 'vaynerchuk.db', summary: 'Stores accounts, proposals, reviews, and resident conversation state.', relationship: 'journals state', reference: { kind: 'data', key: 'vaynerchuk.db', source: `${HOME}/projects/vaynerchuk/vaynerchuk.db` } },
        ],
      },
      {
        id: 'review-publish',
        label: 'Review-to-publish loop',
        summary: 'An atomic review decision is required before a platform adapter may publish the exact proposal.',
        steps: [
          { id: 'review', label: 'Vaynerchuk review', summary: 'Approves or declines a proposal through the resident review CLI.', relationship: 'requires operator decision', reference: { kind: 'capability', key: 'vaynerchuk-review' } },
          { id: 'publish', label: 'Vaynerchuk publish', summary: 'Publishes only an approved proposal through its platform adapter.', relationship: 'executes approved effect', reference: { kind: 'capability', key: 'vaynerchuk-publish' } },
          { id: 'platform', label: 'Social platform API', summary: 'External destination governed by account credentials and platform constraints.', relationship: 'receives approved content', reference: { kind: 'external', key: 'Configured social platform' } },
        ],
      },
      {
        id: 'resident-chat',
        label: 'Resident chat',
        summary: 'A real synchronous turn uses current account and proposal context and persists the conversation.',
        steps: [
          { id: 'chat', label: 'Vaynerchuk chat', summary: 'Runs the resident conversation with status context.', relationship: 'opens conversation', reference: { kind: 'capability', key: 'vaynerchuk-chat' } },
          { id: 'chat-memory', label: 'Chat message ledger', summary: 'Persists operator and resident messages in vaynerchuk.db.', relationship: 'persists conversation', reference: { kind: 'data', key: 'chat_messages', source: `${HOME}/projects/vaynerchuk/vaynerchuk.db` } },
        ],
      },
    ],
  },
];
