import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { getGitnexusStatus, type RepoStatus } from './gitnexus';
import {
  RESIDENT_TOPOLOGIES,
  type ResidentFlowStep,
  type ResidentTopology,
} from './resident-topology';

const execFileAsync = promisify(execFile);
const HOME = homedir();
const MANIFEST = join(HOME, 'projects/realm/MANIFEST.md');
const GITNEXUS_BIN = join(HOME, '.npm-global/bin/gitnexus');
const RESIDENT_TOPOLOGY_SOURCE = join(HOME, 'projects/aperture/src/lib/resident-topology.ts');
const SYSTEM_MODEL_DB = join(HOME, '.local/share/realm-system-model/model.sqlite3');

export type WorkflowKind =
  | 'system'
  | 'domain'
  | 'project'
  | 'repository'
  | 'session'
  | 'resident'
  | 'service'
  | 'timer'
  | 'capability'
  | 'process'
  | 'api'
  | 'data_store'
  | 'authority'
  | 'objective'
  | 'task'
  | 'action'
  | 'receipt'
  | 'outcome'
  | 'conflict'
  | 'external'
  | 'verification'
  | 'step';

export type WorkflowStatus = 'active' | 'inactive' | 'warning' | 'indexed' | 'unknown';

export interface WorkflowNode {
  id: string;
  label: string;
  kind: WorkflowKind;
  status: WorkflowStatus;
  summary: string;
  source: string;
  updatedAt: string | null;
  metric?: string;
  parentId?: string;
  expandable?: boolean;
  expandKind?: 'branch' | 'repo' | 'inline';
  expandKey?: string;
  details: Record<string, string | number | boolean | null>;
}

export type WorkflowLinkKind =
  | 'contains'
  | 'owns'
  | 'depends_on'
  | 'calls'
  | 'reads_from'
  | 'writes_to'
  | 'emits'
  | 'consumes'
  | 'triggered_by'
  | 'scheduled_by'
  | 'authorizes'
  | 'denies'
  | 'observes'
  | 'implements'
  | 'produces_receipt'
  | 'verified_by'
  | 'supersedes'
  | 'executes'
  | 'step';

export interface WorkflowLink {
  source: string;
  target: string;
  kind: WorkflowLinkKind;
  label: string;
  status: WorkflowStatus;
  certainty: 'observed' | 'inferred';
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  links: WorkflowLink[];
  generatedAt: string;
  sourceRevision: string;
  counts: Record<string, number>;
}

interface SessionRecord {
  name: string;
  since: string;
  claims: string[];
}

interface ServiceRecord {
  name: string;
  running: boolean;
}

interface ToolRecord {
  name: string;
  path: string;
  description: string;
}

interface ManifestState {
  generatedAt: string;
  sessions: SessionRecord[];
  services: ServiceRecord[];
  tools: ToolRecord[];
}

interface ProcessRow {
  processId: string;
  process: string;
  processType: string;
  stepCount: number;
  stepId: string;
  stepName: string;
  stepKind: string;
  file: string;
  step: number;
}

const PROCESS_QUERY =
  "MATCH (p:Process) WITH p ORDER BY p.stepCount DESC LIMIT 18 " +
  "OPTIONAL MATCH (s)-[r:CodeRelation {type: 'STEP_IN_PROCESS'}]->(p) " +
  'RETURN p.id AS process_id, p.heuristicLabel AS process, p.processType AS process_type, ' +
  'p.stepCount AS step_count, s.id AS step_id, s.name AS step_name, label(s) AS step_kind, ' +
  's.filePath AS file, r.step AS step ORDER BY process_id, step';

function section(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start < 0) return '';
  const bodyStart = start + marker.length;
  const next = markdown.indexOf('\n## ', bodyStart);
  return markdown.slice(bodyStart, next < 0 ? undefined : next);
}

function parseManifest(markdown: string): ManifestState {
  const generatedAt = markdown.match(/^# SYSTEM MANIFEST\s+[—-]\s+(.+)$/m)?.[1]?.trim() ?? 'unknown';
  const sessions = [...section(markdown, 'ACTIVE SESSIONS').matchAll(
    /^- \*\*(.+?)\*\* \(since ([^)]+)\):\s*(.*)$/gm,
  )].map((match) => ({
    name: match[1],
    since: match[2],
    claims: match[3].split(',').map((claim) => claim.trim()).filter(Boolean),
  }));
  const services = [...section(markdown, 'RUNNING SERVICES').matchAll(
    /^- `([^`]+)`\s+(🟢|⚪)\s+(running|stopped)$/gmu,
  )].map((match) => ({ name: match[1], running: match[3] === 'running' }));
  const tools = [...section(markdown, 'REGISTERED TOOLS').matchAll(
    /^- `([^`]+)` → `([^`]+)` — (.+)$/gm,
  )].map((match) => ({ name: match[1], path: match[2], description: match[3].trim() }));
  return { generatedAt, sessions, services, tools };
}

async function manifestState(): Promise<ManifestState> {
  try {
    return parseManifest(await readFile(MANIFEST, 'utf8'));
  } catch {
    return { generatedAt: 'unavailable', sessions: [], services: [], tools: [] };
  }
}

function repoNodeId(repo: string): string {
  return `repo:${repo}`;
}

function findRepoForPath(path: string, repos: RepoStatus[]): RepoStatus | null {
  return repos
    .filter((repo) => path === repo.path || path.startsWith(`${repo.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0] ?? null;
}

function findRepoForName(name: string, repos: RepoStatus[]): RepoStatus | null {
  const normalized = name.toLowerCase();
  const aliases: Record<string, string[]> = {
    boreal: ['boreal', 'missed-call', 'sms-', 'close-agent', 'outreach'],
    genesis: ['genesis'],
    aperture: ['aperture'],
    commander: ['command-center', 'commander', 'telegram-commander'],
    signaler: ['signaler', 'hormozi', 'ogilvy', 'vaynerchuk'],
    syntra: ['syntra'],
    'the-trader': ['trader'],
    orbit: ['orbit'],
  };
  for (const repo of repos) {
    const tokens = aliases[repo.name] ?? [repo.name];
    if (tokens.some((token) => normalized.includes(token))) return repo;
  }
  return null;
}

function repoStatus(repo: RepoStatus, activePaths: string[]): WorkflowStatus {
  if (repo.sync && ['behind', 'dirty'].includes(repo.sync.health)) return 'warning';
  if (activePaths.some((path) => path === repo.path || path.startsWith(`${repo.path}/`))) return 'active';
  return 'indexed';
}

function rootLink(target: string): WorkflowLink {
  return {
    source: 'system:realm',
    target,
    kind: 'contains',
    label: 'observes',
    status: 'indexed',
    certainty: 'observed',
  };
}

function categoryNode(
  key: string,
  label: string,
  summary: string,
  count: number,
  source: string,
  generatedAt: string,
): WorkflowNode {
  return {
    id: `category:${key}`,
    label,
    kind: 'domain',
    status: count > 0 ? 'active' : 'inactive',
    summary,
    source,
    updatedAt: generatedAt,
    metric: String(count),
    parentId: 'system:realm',
    expandable: key !== 'projects',
    expandKind: key === 'projects' ? undefined : 'branch',
    expandKey: key === 'projects' ? undefined : key,
    details: { count, branch: key },
  };
}

interface SystemModelSnapshotRow {
  id: string;
  generated_at: string;
  node_count: number;
  edge_count: number;
  warnings_json: string;
}

interface SystemModelNodeRow {
  id: string;
  kind: WorkflowKind;
  label: string;
  project: string | null;
  status: string;
  summary: string;
  confidence: number;
  properties_json: string;
  source_uri: string;
  source_observed_at: string;
  evidence_class: string;
}

interface SystemModelEdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  kind: WorkflowLinkKind;
  status: string;
  confidence: number;
  properties_json: string;
  source_uri: string;
  source_observed_at: string;
  evidence_class: string;
}

interface SystemModelSummary {
  available: boolean;
  generatedAt: string | null;
  nodes: number;
  edges: number;
  warnings: number;
}

const SYSTEM_MODEL_VISIBLE_KINDS: Partial<Record<WorkflowKind, true>> = {
  system: true,
  project: true,
  repository: true,
  session: true,
  service: true,
  timer: true,
  capability: true,
  process: true,
  api: true,
  data_store: true,
  authority: true,
  objective: true,
  task: true,
  action: true,
  receipt: true,
  outcome: true,
  conflict: true,
  external: true,
  verification: true,
};

function readSystemModelSummary(): SystemModelSummary {
  if (!existsSync(SYSTEM_MODEL_DB)) {
    return { available: false, generatedAt: null, nodes: 0, edges: 0, warnings: 0 };
  }
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(SYSTEM_MODEL_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');
    const row = database.prepare(
      'SELECT id,generated_at,node_count,edge_count,warnings_json FROM snapshots ORDER BY generated_at DESC LIMIT 1',
    ).get() as unknown as SystemModelSnapshotRow | undefined;
    if (!row) return { available: false, generatedAt: null, nodes: 0, edges: 0, warnings: 0 };
    const warnings = JSON.parse(row.warnings_json) as unknown;
    return {
      available: true,
      generatedAt: row.generated_at,
      nodes: Number(row.node_count),
      edges: Number(row.edge_count),
      warnings: Array.isArray(warnings) ? warnings.length : 0,
    };
  } catch {
    return { available: false, generatedAt: null, nodes: 0, edges: 0, warnings: 0 };
  } finally {
    database?.close();
  }
}

function modelStatus(status: string, kind: WorkflowKind): WorkflowStatus {
  if (kind === 'conflict' || status === 'blocking' || status === 'warning') return 'warning';
  if (['active', 'running', 'allowed', 'known', 'enabled', 'next'].includes(status)) return 'active';
  if (['inactive', 'stopped', 'held', 'denied', 'missing', 'unavailable'].includes(status)) return 'inactive';
  if (['indexed', 'registered', 'present', 'observed', 'current', 'provider', 'consumer'].includes(status)) return 'indexed';
  return 'unknown';
}

function modelDetails(propertiesJson: string, confidence: number, evidenceClass: string): Record<string, string | number | boolean | null> {
  let properties: Record<string, unknown> = {};
  try {
    properties = JSON.parse(propertiesJson) as Record<string, unknown>;
  } catch {
    properties = { parseError: true };
  }
  const details: Record<string, string | number | boolean | null> = {
    confidence,
    evidenceClass,
  };
  for (const [key, value] of Object.entries(properties)) {
    details[key] = value === null || ['string', 'number', 'boolean'].includes(typeof value)
      ? value as string | number | boolean | null
      : JSON.stringify(value);
  }
  return details;
}

function systemModelUnavailable(categoryId: string): WorkflowGraph {
  const generatedAt = new Date().toISOString();
  return {
    nodes: [{
      id: 'conflict:realm-system-model-unavailable',
      label: 'REALM SYSTEM MODEL UNAVAILABLE',
      kind: 'conflict',
      status: 'warning',
      summary: 'No compiled Realm system-model snapshot is readable.',
      source: SYSTEM_MODEL_DB,
      updatedAt: null,
      parentId: categoryId,
      details: { database: SYSTEM_MODEL_DB },
    }],
    links: [{
      source: categoryId,
      target: 'conflict:realm-system-model-unavailable',
      kind: 'contains',
      label: 'reports',
      status: 'warning',
      certainty: 'observed',
    }],
    generatedAt,
    sourceRevision: 'unavailable',
    counts: { warnings: 1 },
  };
}

function readSystemModelBranch(categoryId: string): WorkflowGraph {
  if (!existsSync(SYSTEM_MODEL_DB)) return systemModelUnavailable(categoryId);
  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(SYSTEM_MODEL_DB, { readOnly: true });
    database.exec('PRAGMA query_only = ON');
    const snapshot = database.prepare(
      'SELECT id,generated_at,node_count,edge_count,warnings_json FROM snapshots ORDER BY generated_at DESC LIMIT 1',
    ).get() as unknown as SystemModelSnapshotRow | undefined;
    if (!snapshot) return systemModelUnavailable(categoryId);
    const nodeRows = database.prepare(
      'SELECT id,kind,label,project,status,summary,confidence,properties_json,source_uri,source_observed_at,evidence_class '
      + 'FROM nodes WHERE snapshot_id=? ORDER BY id',
    ).all(snapshot.id) as unknown as SystemModelNodeRow[];
    const visibleRows = nodeRows.filter((row) => (
      row.kind in SYSTEM_MODEL_VISIBLE_KINDS
      && (row.kind !== 'capability' || !['registered', 'indexed'].includes(row.status))
    ));
    const visibleIds = new Set(visibleRows.map((row) => row.id));
    const edgeRows = (database.prepare(
      'SELECT id,source_id,target_id,kind,status,confidence,properties_json,source_uri,source_observed_at,evidence_class '
      + 'FROM edges WHERE snapshot_id=? ORDER BY id',
    ).all(snapshot.id) as unknown as SystemModelEdgeRow[])
      .filter((row) => visibleIds.has(row.source_id) && visibleIds.has(row.target_id));
    const parentByNode = new Map<string, string>();
    for (const edge of edgeRows) {
      if (['contains', 'owns'].includes(edge.kind) && !parentByNode.has(edge.target_id)) {
        parentByNode.set(edge.target_id, edge.source_id);
      }
    }
    const nodes: WorkflowNode[] = visibleRows.map((row) => ({
      id: row.id,
      label: row.label,
      kind: row.kind,
      status: modelStatus(row.status, row.kind),
      summary: row.summary || `${row.kind} observed by the Realm system model.`,
      source: row.source_uri,
      updatedAt: row.source_observed_at,
      metric: row.status.toUpperCase(),
      parentId: parentByNode.get(row.id) ?? categoryId,
      details: {
        project: row.project,
        rawStatus: row.status,
        ...modelDetails(row.properties_json, Number(row.confidence), row.evidence_class),
      },
    }));
    const links: WorkflowLink[] = edgeRows.map((row) => ({
      source: row.source_id,
      target: row.target_id,
      kind: row.kind,
      label: row.kind.replaceAll('_', ' '),
      status: modelStatus(row.status, visibleRows.find((node) => node.id === row.target_id)?.kind ?? 'process'),
      certainty: row.evidence_class === 'observed' || row.evidence_class === 'declared' ? 'observed' : 'inferred',
    }));
    for (const node of nodes) {
      if (node.parentId !== categoryId) continue;
      links.push({
        source: categoryId,
        target: node.id,
        kind: 'contains',
        label: 'models',
        status: node.status,
        certainty: 'observed',
      });
    }
    const warnings = JSON.parse(snapshot.warnings_json) as unknown;
    const counts = Object.fromEntries(
      [...new Set(nodes.map((node) => node.kind))].map((kind) => [
        kind,
        nodes.filter((node) => node.kind === kind).length,
      ]),
    );
    return {
      nodes,
      links,
      generatedAt: new Date().toISOString(),
      sourceRevision: snapshot.id,
      counts: {
        ...counts,
        sourceNodes: Number(snapshot.node_count),
        sourceEdges: Number(snapshot.edge_count),
        warnings: Array.isArray(warnings) ? warnings.length : 0,
      },
    };
  } catch {
    return systemModelUnavailable(categoryId);
  } finally {
    database?.close();
  }
}

export async function getWorkflowRoot(): Promise<WorkflowGraph> {
  const [manifest, gitnexus] = await Promise.all([manifestState(), getGitnexusStatus()]);
  const generatedAt = new Date().toISOString();
  const activePaths = manifest.sessions.flatMap((session) => session.claims);
  const systemModel = readSystemModelSummary();
  const nodes: WorkflowNode[] = [
    {
      id: 'system:realm',
      label: 'REALM',
      kind: 'system',
      status: 'active',
      summary: 'Live map of projects, execution flows, operators, services, and registered capabilities.',
      source: `${MANIFEST} + GitNexus registry + local git`,
      updatedAt: manifest.generatedAt,
      metric: `${gitnexus.repos.length} worlds`,
      details: {
        manifestGeneratedAt: manifest.generatedAt,
        gitnexusServe: gitnexus.serve,
        nextReindex: gitnexus.nextReindex,
      },
    },
    categoryNode('projects', 'PROJECT WORLDS', 'Indexed repositories. Select one to reveal its execution flows.', gitnexus.repos.length, 'GitNexus registry', gitnexus.generatedAt),
    categoryNode('residents', 'SYSTEM RESIDENTS', 'Persistent named agents. Open a resident, then one of its flows, to reveal that agent’s stack and system touchpoints.', RESIDENT_TOPOLOGIES.length, RESIDENT_TOPOLOGY_SOURCE, manifest.generatedAt),
    categoryNode('sessions', 'ACTIVE OPERATORS', 'Current OMP sessions and the components they claim.', manifest.sessions.length, MANIFEST, manifest.generatedAt),
    categoryNode('services', 'LIVE MACHINERY', 'Known services, including stopped machinery that can be inspected.', manifest.services.length, MANIFEST, manifest.generatedAt),
    categoryNode('capabilities', 'CAPABILITY VAULT', 'Registered scripts, pipelines, services, data, and canonical artifacts.', manifest.tools.length, MANIFEST, manifest.generatedAt),
    categoryNode('model', 'AGENT SYSTEM MODEL', 'Evidence-backed authority, dependency, runtime, receipt, and outcome graph used by OMP.', systemModel.nodes, SYSTEM_MODEL_DB, systemModel.generatedAt ?? generatedAt),
  ];
  const links: WorkflowLink[] = [
    rootLink('category:projects'),
    rootLink('category:residents'),
    rootLink('category:sessions'),
    rootLink('category:services'),
    rootLink('category:capabilities'),
    rootLink('category:model'),
  ];

  for (const repo of gitnexus.repos) {
    const status = repoStatus(repo, activePaths);
    nodes.push({
      id: repoNodeId(repo.name),
      label: repo.name.toUpperCase(),
      kind: 'repository',
      status,
      summary: `${repo.stats.processes} indexed execution flows across ${repo.stats.files} files.`,
      source: 'GitNexus registry + local git',
      updatedAt: repo.indexedAt,
      metric: `${repo.stats.processes} flows`,
      parentId: 'category:projects',
      expandable: repo.stats.processes > 0,
      expandKind: repo.stats.processes > 0 ? 'repo' : undefined,
      expandKey: repo.stats.processes > 0 ? repo.name : undefined,
      details: {
        path: repo.path,
        branch: repo.sync?.branch ?? 'unknown',
        gitHealth: repo.sync?.health ?? 'unknown',
        dirtyFiles: repo.sync?.dirtyCount ?? 0,
        ahead: repo.sync?.ahead ?? 0,
        behind: repo.sync?.behind ?? 0,
        commitsSinceIndex: repo.commitsBehind,
        files: repo.stats.files,
        symbols: repo.stats.nodes,
        processes: repo.stats.processes,
        communities: repo.stats.communities,
        lastIndexedCommit: repo.lastCommit,
      },
    });
    links.push({
      source: 'category:projects',
      target: repoNodeId(repo.name),
      kind: 'contains',
      label: 'indexes',
      status,
      certainty: 'observed',
    });
  }

  return {
    nodes,
    links,
    generatedAt,
    sourceRevision: `${manifest.generatedAt}|${gitnexus.generatedAt}|${systemModel.generatedAt ?? 'model-unavailable'}`,
    counts: {
      repositories: gitnexus.repos.length,
      residents: RESIDENT_TOPOLOGIES.length,
      sessions: manifest.sessions.length,
      services: manifest.services.length,
      runningServices: manifest.services.filter((service) => service.running).length,
      capabilities: manifest.tools.length,
      systemModelNodes: systemModel.nodes,
      systemModelEdges: systemModel.edges,
      systemModelWarnings: systemModel.warnings,
    },
  };
}

function branchBase(generatedAt: string): WorkflowGraph {
  return { nodes: [], links: [], generatedAt: new Date().toISOString(), sourceRevision: generatedAt, counts: {} };
}

interface ResolvedResidentStep {
  status: WorkflowStatus;
  source: string;
  updatedAt: string | null;
  certainty: 'observed' | 'inferred';
  details: Record<string, string | number | boolean | null>;
}

function resolveResidentStep(
  step: ResidentFlowStep,
  manifest: ManifestState,
  repos: RepoStatus[],
  activePaths: string[],
): ResolvedResidentStep {
  const reference = step.reference;

  if (reference.kind === 'service') {
    const service = manifest.services.find((candidate) => candidate.name === reference.key);
    return {
      status: service ? (service.running ? 'active' : 'inactive') : 'unknown',
      source: MANIFEST,
      updatedAt: manifest.generatedAt,
      certainty: service ? 'observed' : 'inferred',
      details: {
        referenceKind: reference.kind,
        referenceKey: reference.key,
        observedInManifest: Boolean(service),
        serviceState: service ? (service.running ? 'running' : 'stopped') : 'not registered',
      },
    };
  }

  if (reference.kind === 'capability') {
    const capability = manifest.tools.find((candidate) => candidate.name === reference.key);
    return {
      status: capability ? 'indexed' : 'unknown',
      source: capability?.path ?? MANIFEST,
      updatedAt: manifest.generatedAt,
      certainty: capability ? 'observed' : 'inferred',
      details: {
        referenceKind: reference.kind,
        referenceKey: reference.key,
        observedInRegistry: Boolean(capability),
        path: capability?.path ?? null,
        registryDescription: capability?.description ?? null,
      },
    };
  }

  if (reference.kind === 'repository') {
    const repository = repos.find((candidate) => candidate.name === reference.key)
      ?? findRepoForName(reference.key, repos);
    return {
      status: repository ? repoStatus(repository, activePaths) : 'unknown',
      source: 'GitNexus registry + local git',
      updatedAt: repository?.indexedAt ?? null,
      certainty: repository ? 'observed' : 'inferred',
      details: {
        referenceKind: reference.kind,
        referenceKey: reference.key,
        observedInGitNexus: Boolean(repository),
        path: repository?.path ?? null,
        processes: repository?.stats.processes ?? null,
        gitHealth: repository?.sync?.health ?? null,
      },
    };
  }

  if (reference.kind === 'data') {
    const source = reference.source ?? reference.key;
    const observed = source.startsWith('/') && existsSync(source);
    return {
      status: observed ? 'indexed' : 'warning',
      source,
      updatedAt: manifest.generatedAt,
      certainty: observed ? 'observed' : 'inferred',
      details: {
        referenceKind: reference.kind,
        referenceKey: reference.key,
        path: source,
        pathObserved: observed,
      },
    };
  }

  return {
    status: 'unknown',
    source: reference.source ?? `Declared external boundary: ${reference.key}`,
    updatedAt: manifest.generatedAt,
    certainty: 'inferred',
    details: {
      referenceKind: reference.kind,
      referenceKey: reference.key,
      liveStateObserved: false,
    },
  };
}

function combinedStatus(statuses: WorkflowStatus[]): WorkflowStatus {
  if (statuses.includes('warning')) return 'warning';
  if (statuses.includes('active')) return 'active';
  if (statuses.includes('indexed')) return 'indexed';
  if (statuses.length > 0 && statuses.every((status) => status === 'inactive')) return 'inactive';
  return 'unknown';
}

function residentStatus(topology: ResidentTopology, manifest: ManifestState): WorkflowStatus {
  if (topology.healthServices.length === 0) return 'indexed';
  const services = topology.healthServices
    .map((name) => manifest.services.find((service) => service.name === name))
    .filter((service): service is ServiceRecord => Boolean(service));
  if (services.some((service) => service.running)) return 'active';
  return services.length > 0 ? 'inactive' : 'unknown';
}

export async function getWorkflowBranch(branch: string): Promise<WorkflowGraph> {
  const [manifest, gitnexus] = await Promise.all([manifestState(), getGitnexusStatus()]);
  const graph = branchBase(manifest.generatedAt);
  const categoryId = `category:${branch}`;
  if (branch === 'model') return readSystemModelBranch(categoryId);


  if (branch === 'residents') {
    const activePaths = manifest.sessions.flatMap((session) => session.claims);
    let flowCount = 0;
    let stepCount = 0;
    graph.sourceRevision = `${manifest.generatedAt}|${gitnexus.generatedAt}`;

    for (const resident of RESIDENT_TOPOLOGIES) {
      const residentId = `resident:${resident.id}`;
      const status = residentStatus(resident, manifest);
      graph.nodes.push({
        id: residentId,
        label: resident.label,
        kind: 'resident',
        status,
        summary: resident.summary,
        source: resident.source,
        updatedAt: manifest.generatedAt,
        metric: `${resident.flows.length} FLOW${resident.flows.length === 1 ? '' : 'S'}`,
        parentId: categoryId,
        expandable: true,
        expandKind: 'inline',
        details: {
          role: resident.role,
          mandate: resident.mandate,
          project: resident.project,
          flows: resident.flows.length,
          healthServices: resident.healthServices.join('\n') || 'inline resident; no dedicated service',
        },
      });
      graph.links.push({
        source: categoryId,
        target: residentId,
        kind: 'contains',
        label: 'hosts resident',
        status,
        certainty: 'observed',
      });

      for (const flow of resident.flows) {
        flowCount += 1;
        const flowId = `${residentId}:flow:${flow.id}`;
        const resolvedSteps = flow.steps.map((step) => resolveResidentStep(step, manifest, gitnexus.repos, activePaths));
        const flowStatus = combinedStatus(resolvedSteps.map((step) => step.status));
        graph.nodes.push({
          id: flowId,
          label: flow.label,
          kind: 'process',
          status: flowStatus,
          summary: flow.summary,
          source: resident.source,
          updatedAt: manifest.generatedAt,
          metric: `${flow.steps.length} STEPS`,
          parentId: residentId,
          expandable: true,
          expandKind: 'inline',
          details: {
            resident: resident.label,
            project: resident.project,
            steps: flow.steps.length,
            statusBasis: 'live registry, service, repository, and path observations',
          },
        });
        graph.links.push({
          source: residentId,
          target: flowId,
          kind: 'executes',
          label: 'owns flow',
          status: flowStatus,
          certainty: 'observed',
        });

        flow.steps.forEach((step, index) => {
          stepCount += 1;
          const stepId = `${flowId}:step:${step.id}`;
          const resolved = resolvedSteps[index];
          graph.nodes.push({
            id: stepId,
            label: step.label,
            kind: 'step',
            status: resolved.status,
            summary: step.summary,
            source: resolved.source,
            updatedAt: resolved.updatedAt,
            metric: step.reference.kind.toUpperCase(),
            parentId: flowId,
            details: {
              resident: resident.label,
              flow: flow.label,
              flowStage: index,
              relationship: step.relationship,
              ...resolved.details,
            },
          });
          graph.links.push({
            source: index === 0 ? flowId : `${flowId}:step:${flow.steps[index - 1].id}`,
            target: stepId,
            kind: 'step',
            label: step.relationship,
            status: resolved.status,
            certainty: resolved.certainty,
          });
        });
      }
    }

    graph.counts.residents = RESIDENT_TOPOLOGIES.length;
    graph.counts.flows = flowCount;
    graph.counts.steps = stepCount;
    return graph;
  }

  if (branch === 'sessions') {
    for (const session of manifest.sessions) {
      const id = `session:${session.name}`;
      graph.nodes.push({
        id,
        label: session.name.replace(/^cc-omp-/, '').toUpperCase(),
        kind: 'session',
        status: 'active',
        summary: `${session.claims.length} claimed component${session.claims.length === 1 ? '' : 's'}.`,
        source: MANIFEST,
        updatedAt: session.since,
        metric: 'ONLINE',
        parentId: categoryId,
        details: { since: session.since, claims: session.claims.join('\n') },
      });
      graph.links.push({ source: categoryId, target: id, kind: 'contains', label: 'coordinates', status: 'active', certainty: 'observed' });
      const repo = session.claims.map((claim) => findRepoForPath(claim, gitnexus.repos)).find(Boolean);
      if (repo) graph.links.push({ source: repoNodeId(repo.name), target: id, kind: 'owns', label: 'claimed by', status: 'active', certainty: 'observed' });
    }
    graph.counts.sessions = graph.nodes.length;
    return graph;
  }

  if (branch === 'services') {
    for (const service of manifest.services) {
      const id = `service:${service.name}`;
      const repo = findRepoForName(service.name, gitnexus.repos);
      graph.nodes.push({
        id,
        label: service.name,
        kind: 'service',
        status: service.running ? 'active' : 'inactive',
        summary: service.running ? 'Service observed running.' : 'Known service currently stopped.',
        source: MANIFEST,
        updatedAt: manifest.generatedAt,
        metric: service.running ? 'RUNNING' : 'STOPPED',
        parentId: categoryId,
        details: { service: service.name, state: service.running ? 'running' : 'stopped' },
      });
      graph.links.push({ source: categoryId, target: id, kind: 'contains', label: 'tracks', status: service.running ? 'active' : 'inactive', certainty: 'observed' });
      if (repo) graph.links.push({ source: repoNodeId(repo.name), target: id, kind: 'owns', label: 'likely operates', status: service.running ? 'active' : 'inactive', certainty: 'inferred' });
    }
    graph.counts.services = graph.nodes.length;
    graph.counts.running = manifest.services.filter((service) => service.running).length;
    return graph;
  }

  if (branch === 'capabilities') {
    for (const tool of manifest.tools) {
      const id = `capability:${tool.name}`;
      const repo = findRepoForPath(tool.path, gitnexus.repos) ?? findRepoForName(tool.name, gitnexus.repos);
      const pathObserved = repo ? Boolean(findRepoForPath(tool.path, [repo])) : false;
      graph.nodes.push({
        id,
        label: tool.name,
        kind: 'capability',
        status: 'indexed',
        summary: tool.description,
        source: MANIFEST,
        updatedAt: manifest.generatedAt,
        parentId: categoryId,
        details: { path: tool.path, description: tool.description },
      });
      graph.links.push({ source: categoryId, target: id, kind: 'contains', label: 'registers', status: 'indexed', certainty: 'observed' });
      if (repo) graph.links.push({
        source: repoNodeId(repo.name),
        target: id,
        kind: 'owns',
        label: pathObserved ? 'provides' : 'likely provides',
        status: 'indexed',
        certainty: pathObserved ? 'observed' : 'inferred',
      });
    }
    graph.counts.capabilities = graph.nodes.length;
    return graph;
  }

  throw new Error(`Unknown workflow branch: ${branch}`);
}

function parseTable(markdown: string): string[][] {
  const rows = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));
  return rows.slice(2).filter((row) => row.some(Boolean));
}

async function processRows(repo: string): Promise<ProcessRow[]> {
  const { stdout } = await execFileAsync(GITNEXUS_BIN, ['cypher', '-r', repo, PROCESS_QUERY], {
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const payload = JSON.parse(stdout) as { markdown?: string };
  return parseTable(payload.markdown ?? '').map((row) => ({
    processId: row[0],
    process: row[1],
    processType: row[2],
    stepCount: Number.parseInt(row[3], 10) || 0,
    stepId: row[4],
    stepName: row[5],
    stepKind: row[6],
    file: row[7],
    step: Number.parseInt(row[8], 10) || 0,
  }));
}

function humanize(label: string): string {
  return label.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export async function getRepositoryWorkflows(repoName: string): Promise<WorkflowGraph> {
  const gitnexus = await getGitnexusStatus();
  const repo = gitnexus.repos.find((entry) => entry.name === repoName);
  if (!repo) throw new Error(`Unknown indexed repository: ${repoName}`);
  const rows = await processRows(repoName);
  const byProcess = new Map<string, ProcessRow[]>();
  for (const row of rows) {
    const current = byProcess.get(row.processId) ?? [];
    current.push(row);
    byProcess.set(row.processId, current);
  }

  const graph = branchBase(repo.indexedAt);
  for (const [rawProcessId, processRowsForId] of byProcess) {
    const first = processRowsForId[0];
    const processId = `process:${repoName}:${rawProcessId}`;
    const ordered = processRowsForId.filter((row) => row.stepId).sort((a, b) => a.step - b.step);
    graph.nodes.push({
      id: processId,
      label: humanize(first.process),
      kind: 'process',
      status: 'indexed',
      summary: `${humanize(first.processType)} execution flow with ${ordered.length} indexed steps.`,
      source: `GitNexus:${repoName}:Process`,
      updatedAt: repo.indexedAt,
      metric: `${ordered.length} STEPS`,
      parentId: repoNodeId(repoName),
      expandable: ordered.length > 0,
      expandKind: ordered.length > 0 ? 'inline' : undefined,
      expandKey: ordered.length > 0 ? processId : undefined,
      details: {
        repository: repoName,
        processId: rawProcessId,
        processType: first.processType,
        declaredStepCount: first.stepCount,
        entryPoint: ordered[0]?.stepName ?? null,
        terminal: ordered.at(-1)?.stepName ?? null,
      },
    });
    graph.links.push({ source: repoNodeId(repoName), target: processId, kind: 'executes', label: 'contains flow', status: 'indexed', certainty: 'observed' });

    let previousId = processId;
    for (const row of ordered) {
      const stepId = `step:${repoName}:${rawProcessId}:${row.step}`;
      graph.nodes.push({
        id: stepId,
        label: humanize(row.stepName),
        kind: 'step',
        status: 'indexed',
        summary: `${row.stepKind} in ${row.file}`,
        source: `GitNexus:${repoName}:STEP_IN_PROCESS`,
        updatedAt: repo.indexedAt,
        metric: `#${row.step}`,
        parentId: processId,
        details: {
          repository: repoName,
          process: first.process,
          order: row.step,
          symbol: row.stepName,
          symbolId: row.stepId,
          symbolKind: row.stepKind,
          file: row.file,
        },
      });
      graph.links.push({ source: previousId, target: stepId, kind: 'step', label: row.step === 1 ? 'starts at' : `step ${row.step}`, status: 'indexed', certainty: 'observed' });
      previousId = stepId;
    }
  }
  graph.counts.processes = byProcess.size;
  graph.counts.steps = graph.nodes.filter((node) => node.kind === 'step').length;
  return graph;
}
