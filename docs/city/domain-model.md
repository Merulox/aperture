# City Domain Model

## Design rules

1. The model describes operational meaning; visual coordinates and animation are projections.
2. Source systems retain authority over observed runtime state.
3. City-owned commands, conversations, view state, and audit records are durable City data.
4. Every normalized object carries provenance and freshness.
5. Persistent identity, execution, work, and infrastructure are separate concepts.
6. Derived attention never overwrites source state.
7. IDs are stable and namespaced: `<kind>:<source>:<source-id>`.

## Snapshot envelope

```ts
interface CitySnapshot {
  schemaVersion: 1;
  generatedAt: string;
  adapters: AdapterHealth[];
  districts: District[];
  places: Place[];
  residents: Resident[];
  workers: Worker[];
  facilities: Facility[];
  projects: Project[];
  workItems: WorkItem[];
  goals: Goal[];
  resources: Resource[];
  relationships: Relationship[];
  approvals: Approval[];
  conversations: Conversation[];
  recentEvents: CityEvent[];
  attention: AttentionItem[];
}
```

An adapter may omit unsupported collections. Omission is represented by declared adapter capability, not by fabricated empty certainty.

## Common metadata

```ts
interface SourceRef {
  adapterId: string;
  sourceId: string;
  sourceUri?: string;
  sourceVersion?: string;
  observedAt: string;
  trust: 'operator' | 'system' | 'external' | 'model_inference';
}

interface Freshness {
  observedAt: string;
  staleAfterMs: number;
  status: 'fresh' | 'aging' | 'stale' | 'unknown';
}

interface CityEntity {
  id: string;
  kind: string;
  displayName: string;
  summary: string;
  sources: SourceRef[];
  freshness: Freshness;
  sensitivity: 'public' | 'internal' | 'sensitive' | 'secret';
}
```

A `secret` object exposes only a reference and availability/status. Its value never enters the City API.

## Spatial entities

### District

Stable capability geography: Memory, Research, Revenue, Creation, Operations, Infrastructure, or future operator-defined domains.

```ts
interface District extends CityEntity {
  kind: 'district';
  capabilityIds: string[];
  layout: { x: number; y: number; width: number; height: number };
}
```

### Place

A stable home, workplace, City Hall, or infrastructure site.

```ts
interface Place extends CityEntity {
  kind: 'place';
  placeType: 'city_hall' | 'resident_home' | 'project_site' | 'facility_site';
  districtId: string;
  projectId?: string;
  residentId?: string;
  facilityIds: string[];
  layout: { x: number; y: number; width: number; height: number; layer: number };
}
```

## Actors

### Resident

A persistent named agent identity. A resident exists while idle and across runtime replacements.

```ts
interface Resident extends CityEntity {
  kind: 'resident';
  role: string;
  mandate: string;
  autonomyLevel: number;
  homePlaceId: string;
  districtIds: string[];
  presence: ResidentPresence;
  missionGoalIds: string[];
  tacticalGoalIds: string[];
  activeWorkerIds: string[];
  capabilityResourceIds: string[];
  conversationId: string;
  adapterId: string;
}
```

Genesis and Victorique are residents. OMP is not: it is an execution substrate.

### Worker

A bounded execution attempt, session, process, or subagent. Workers never own mission-level authority.

```ts
interface Worker extends CityEntity {
  kind: 'worker';
  residentId?: string;
  parentWorkerId?: string;
  workItemId?: string;
  goalId?: string;
  runRef: string;
  state: WorkerState;
  model?: string;
  workspace?: string;
  startedAt?: string;
  finishedAt?: string;
  lastHeartbeatAt?: string;
  costResourceIds: string[];
  evidenceRefs: string[];
}
```

### Facility

A non-agent system: service, deterministic routine, datastore, tool, model provider, or communication transport.

```ts
interface Facility extends CityEntity {
  kind: 'facility';
  facilityType: 'service' | 'routine' | 'datastore' | 'tool' | 'provider' | 'transport';
  state: 'healthy' | 'degraded' | 'failed' | 'stopped' | 'unknown';
  placeId?: string;
  ownerResidentId?: string;
  resourceIds: string[];
}
```

Orbit loops and systemd services begin as facilities. They become residents only if they acquire persistent identity, mandate, goals, memory, and conversation semantics.

## Work and authority

### Project

A durable outcome context represented by a workplace.

```ts
interface Project extends CityEntity {
  kind: 'project';
  placeId: string;
  state: 'active' | 'paused' | 'blocked' | 'completed' | 'archived';
  ownerIds: string[];
  goalIds: string[];
}
```

### Goal

```ts
interface Goal extends CityEntity {
  kind: 'goal';
  level: 'mission' | 'objective' | 'task';
  authority: 'operator' | 'resident' | 'worker_contract';
  ownerId: string;
  parentGoalId?: string;
  projectId?: string;
  state: GoalState;
  successCriteria: string[];
  constraintRefs: string[];
}
```

Mission goals require operator authority. Residents may create objectives only inside an active mission and their mandate. Worker tasks require a parent objective.

### WorkItem

Normalized work without replacing the source taskboard.

```ts
interface WorkItem extends CityEntity {
  kind: 'work_item';
  projectId?: string;
  goalId?: string;
  ownerId?: string;
  workerIds: string[];
  state: WorkState;
  priority?: number;
  blockerRefs: string[];
  approvalIds: string[];
  evidenceRefs: string[];
  sourceStatus: string;
}
```

## Resources

```ts
interface Resource extends CityEntity {
  kind: 'resource';
  resourceType: 'compute_cost' | 'capability_permission' | 'knowledge_memory' | 'attention_workload' | 'artifact_dependency';
  ownerId: string;
  state: 'available' | 'limited' | 'exhausted' | 'missing' | 'blocked' | 'unknown';
  unit?: string;
  used?: number;
  limit?: number;
  details: Record<string, string | number | boolean | null>;
  revealRef?: string;
}
```

Examples include token spend, model access, filesystem scope, memory freshness, queue depth, files, services, and databases. Credential resources expose existence/scope only.

## Relationships

```ts
interface Relationship extends CityEntity {
  kind: 'relationship';
  relationshipType: 'owns' | 'works_on' | 'spawned' | 'depends_on' | 'blocks' | 'collaborates' | 'messages' | 'uses' | 'located_at';
  fromId: string;
  toId: string;
  strength?: number;
  activeFrom?: string;
  activeUntil?: string;
}
```

Relationship overlays are optional views. They do not determine stable place coordinates.

## Conversation and command entities

### Conversation

```ts
interface Conversation extends CityEntity {
  kind: 'conversation';
  residentId: string;
  context: ConversationContext;
  unreadCount: number;
  lastMessageAt?: string;
  messages: MessageSummary[];
}

interface ConversationContext {
  type: 'general' | 'project' | 'goal' | 'work_item' | 'worker' | 'approval';
  refId?: string;
}
```

A context switch changes what is loaded for the next message; it does not create a new resident identity.

### Approval

```ts
interface Approval extends CityEntity {
  kind: 'approval';
  requesterId: string;
  subjectRefs: string[];
  riskTier: 0 | 1 | 2 | 3;
  question: string;
  options: ApprovalOption[];
  state: ApprovalState;
  dueAt?: string;
  requiredAuthority: 'operator' | 'security' | 'data' | 'deploy' | 'money';
  responseCommandId?: string;
  origin: SourceRef;
}
```

An approval is not resolved merely because City Hall accepted a click. It resolves only after the origin acknowledges the response or reconciliation confirms source state.

## Events and attention

### CityEvent

Immutable observation or command evidence.

```ts
interface CityEvent {
  id: string;
  type: string;
  source: SourceRef;
  occurredAt: string;
  observedAt: string;
  actorId?: string;
  entityRefs: string[];
  correlationId?: string;
  causationId?: string;
  summary: string;
  payloadRef?: string;
  sensitivity: 'public' | 'internal' | 'sensitive' | 'secret';
}
```

### AttentionItem

A derived view over pending approvals, failures, blockers, stale critical data, and exhausted resources.

```ts
interface AttentionItem {
  id: string;
  sourceEntityId: string;
  reason: 'approval' | 'failure' | 'blocker' | 'stale' | 'resource';
  severity: 'info' | 'attention' | 'urgent' | 'critical';
  summary: string;
  createdAt: string;
  dueAt?: string;
  actionRef?: string;
}
```

Attention is recalculable and must not become a second mutable task system.
