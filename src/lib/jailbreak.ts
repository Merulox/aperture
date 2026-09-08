import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONTROL_ROOT = process.env.OMP_FLAGSHIP_CONTROL_ROOT
  ?? join(homedir(), 'projects/realm/flagship_control');
const STATE_ROOT = process.env.OMP_FLAGSHIP_STATE_DIR
  ?? join(homedir(), '.local/state/omp-flagship-control');
const DEFAULT_ATTESTATION_MAX_AGE_HOURS = 24;
const DEFAULT_EVIDENCE_MAX_AGE_HOURS = 168;
const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

interface ContentAddressedFile {
  path: string;
  sha256: string;
}

interface ProfileRecord extends ContentAddressedFile {
  injection: string;
  status: 'incumbent' | 'candidate' | 'experimental';
  evidence: string;
}

interface RouteRecord {
  model: string;
  profile: string;
  thinking: string;
}

interface Registry {
  guard: ContentAddressedFile;
  runtime_overlay: ContentAddressedFile;
  profiles: Record<string, ProfileRecord>;
  routes: Record<string, RouteRecord>;
}

interface EvaluationCase {
  id: string;
  stage: string;
  mode: string;
}

interface EvaluationBank {
  method_id: string;
  cases: EvaluationCase[];
  identity_fields: string[];
  first_outcome_policy: string;
  promotion_policy: string;
}

interface BehaviorRequirement {
  id: string;
  requirement: string;
}

interface ResearchTrack {
  id: string;
  title: string;
  status: 'active' | 'queued' | 'complete';
  evidence: string;
  next_experiment: string;
}

interface UniversalResearch {
  program_id: string;
  title: string;
  status: string;
  updated_at: string;
  thesis: string;
  current_hypothesis: string;
  non_goal: string;
  success_definition: {
    models: string[];
    minimum_repeated_trials: number;
    critical_family_pass_rate: number;
    task_quality_floor_vs_clean_control: number;
    maximum_overexecution_rate_delta: number;
    maximum_unattributed_provider_calls: number;
    sealed_holdout_required: boolean;
  };
  behavior_contract: BehaviorRequirement[];
  tracks: ResearchTrack[];
}

interface EvidenceCheck {
  id: string;
  exit_status: number;
  result?: string;
}

interface EvidenceMethodIdentity {
  registry_sha256: string;
  eval_bank_sha256: string;
  guard_sha256: string;
  runtime_overlay_sha256: string;
  profiles: Record<string, string>;
}

interface SmokeEvidence {
  observed_at: string;
  omp_version: string;
  method_identity?: EvidenceMethodIdentity;
  checks: EvidenceCheck[];
  verdict: Record<string, string>;
}

interface LaunchReceipt {
  alias: string;
  model: string;
  profile_id: string;
  observed_at: string;
  event: string;
  injection: string;
  thinking: string;
  launch_id?: string;
  profile_sha256?: string;
  guard_sha256?: string;
  runtime_overlay_sha256?: string;
}

interface AttestationReceipt {
  alias: string;
  event: string;
  observed_at: string;
  launch_id: string;
  expected_model?: string;
  actual_model?: string | null;
  expected_thinking?: string;
  actual_thinking?: string | null;
  profile_id?: string;
  profile_sha256?: string;
  guard_sha256?: string;
  expected_runtime_overlay_sha256?: string;
  runtime_overlay_sha256?: string;
  injection?: string;
}

export type SourceState = 'available' | 'empty' | 'absent' | 'partial' | 'unreadable' | 'invalid' | 'stale' | 'superseded';

export interface SourceStatus {
  label: string;
  path: string | null;
  state: SourceState;
  validRecords: number;
  invalidRecords: number;
  error: string | null;
}

interface JsonLinesRead<T> {
  records: T[];
  source: SourceStatus;
}

export interface HashStatus {
  label: string;
  path: string;
  expected: string;
  observed: string | null;
  verified: boolean;
}

export type RouteAttestationStatus = 'matched' | 'missing' | 'mismatch' | 'stale';

export interface JailbreakRoute {
  alias: string;
  model: string;
  profile: string;
  thinking: string;
  status: ProfileRecord['status'];
  evidence: string;
  injection: string;
  profileHashVerified: boolean;
  latestLaunch: LaunchReceipt | null;
  latestAttestation: AttestationReceipt | null;
  attestationStatus: RouteAttestationStatus;
  attestationIssues: string[];
}

export interface JailbreakDashboard {
  generatedAt: string;
  controlRoot: string;
  stateRoot: string;
  health: 'attested' | 'unattested' | 'degraded';
  routes: JailbreakRoute[];
  hashes: HashStatus[];
  sources: {
    launches: SourceStatus;
    attestations: SourceStatus;
    evidence: SourceStatus;
  };
  controlBoundary: {
    providerRequestGuard: boolean;
    fallbackDisabled: boolean;
    taskChildrenBlocked: boolean;
    replacementInjection: boolean;
  };
  liveState: {
    attestedRoutes: number;
    routeCount: number;
    attestationMaxAgeHours: number;
    evidenceMaxAgeHours: number;
  };
  evaluation: {
    methodId: string;
    cases: EvaluationCase[];
    stageCounts: Record<string, number>;
    identityFields: string[];
    firstOutcomePolicy: string;
    promotionPolicy: string;
  };
  research: UniversalResearch;
  evidence: {
    file: string | null;
    observedAt: string | null;
    ompVersion: string | null;
    checksRecorded: number;
    verdict: Record<string, string>;
  };
  errors: string[];
}

function isLaunchReceipt(value: unknown): value is LaunchReceipt {
  return typeof value === 'object'
    && value !== null
    && 'alias' in value
    && typeof value.alias === 'string'
    && 'model' in value
    && typeof value.model === 'string'
    && 'profile_id' in value
    && typeof value.profile_id === 'string'
    && 'observed_at' in value
    && typeof value.observed_at === 'string'
    && 'event' in value
    && typeof value.event === 'string'
    && 'injection' in value
    && typeof value.injection === 'string'
    && 'thinking' in value
    && typeof value.thinking === 'string';
}

function isAttestationReceipt(value: unknown): value is AttestationReceipt {
  return typeof value === 'object'
    && value !== null
    && 'alias' in value
    && typeof value.alias === 'string'
    && 'event' in value
    && typeof value.event === 'string'
    && 'observed_at' in value
    && typeof value.observed_at === 'string'
    && 'launch_id' in value
    && typeof value.launch_id === 'string';
}
function isEvidenceMethodIdentity(value: unknown): value is EvidenceMethodIdentity {
  return typeof value === 'object'
    && value !== null
    && 'registry_sha256' in value
    && typeof value.registry_sha256 === 'string'
    && 'eval_bank_sha256' in value
    && typeof value.eval_bank_sha256 === 'string'
    && 'guard_sha256' in value
    && typeof value.guard_sha256 === 'string'
    && 'runtime_overlay_sha256' in value
    && typeof value.runtime_overlay_sha256 === 'string'
    && 'profiles' in value
    && typeof value.profiles === 'object'
    && value.profiles !== null
    && !Array.isArray(value.profiles)
    && Object.values(value.profiles).every((hash) => typeof hash === 'string');
}


function isSmokeEvidence(value: unknown): value is SmokeEvidence {
  return typeof value === 'object'
    && value !== null
    && 'observed_at' in value
    && typeof value.observed_at === 'string'
    && 'omp_version' in value
    && typeof value.omp_version === 'string'
    && 'checks' in value
    && Array.isArray(value.checks)
    && 'verdict' in value
    && typeof value.verdict === 'object'
    && value.verdict !== null
    && !Array.isArray(value.verdict);
}

function errorCode(error: unknown): string | null {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
      ? error.code
      : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function attestationMaxAgeHours(): number {
  const configured = Number(process.env.OMP_FLAGSHIP_ATTESTATION_MAX_AGE_HOURS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_ATTESTATION_MAX_AGE_HOURS;
}

function evidenceMaxAgeHours(): number {
  const configured = Number(process.env.OMP_FLAGSHIP_EVIDENCE_MAX_AGE_HOURS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_EVIDENCE_MAX_AGE_HOURS;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

async function readJsonLines<T>(
  label: string,
  path: string,
  validate: (value: unknown) => value is T,
): Promise<JsonLinesRead<T>> {
  let raw: string;
  try {
    raw = await readText(path);
  } catch (error) {
    const absent = errorCode(error) === 'ENOENT';
    return {
      records: [],
      source: {
        label,
        path,
        state: absent ? 'absent' : 'unreadable',
        validRecords: 0,
        invalidRecords: 0,
        error: absent ? null : errorMessage(error),
      },
    };
  }

  const lines = raw.split('\n').filter((line) => line.trim());
  if (lines.length === 0) {
    return {
      records: [],
      source: { label, path, state: 'empty', validRecords: 0, invalidRecords: 0, error: null },
    };
  }

  const records: T[] = [];
  let invalidRecords = 0;
  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (validate(parsed)) records.push(parsed);
      else invalidRecords += 1;
    } catch {
      invalidRecords += 1;
    }
  }

  return {
    records,
    source: {
      label,
      path,
      state: invalidRecords > 0 ? 'partial' : 'available',
      validRecords: records.length,
      invalidRecords,
      error: invalidRecords > 0 ? `${invalidRecords} malformed or invalid record(s)` : null,
    },
  };
}

async function hashStatus(label: string, fixture: ContentAddressedFile): Promise<HashStatus> {
  const path = join(CONTROL_ROOT, fixture.path);
  try {
    const observed = createHash('sha256').update(await readFile(path)).digest('hex');
    return { label, path, expected: fixture.sha256, observed, verified: observed === fixture.sha256 };
  } catch {
    return { label, path, expected: fixture.sha256, observed: null, verified: false };
  }
}

async function latestEvidencePath(): Promise<string | null> {
  try {
    const files = (await readdir(join(CONTROL_ROOT, 'evidence')))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .reverse();
    return files[0] ? join(CONTROL_ROOT, 'evidence', files[0]) : null;
  } catch {
    return null;
  }
}

function evidenceIdentityIssues(
  evidence: SmokeEvidence,
  registry: Registry,
  registrySha256: string,
  evaluationBankSha256: string,
): string[] {
  const identity = evidence.method_identity;
  if (!isEvidenceMethodIdentity(identity)) {
    return ['Evidence does not declare a valid method identity'];
  }

  const issues: string[] = [];
  if (identity.registry_sha256 !== registrySha256) {
    issues.push(`registry hash: expected ${registrySha256}, observed ${identity.registry_sha256}`);
  }
  if (identity.eval_bank_sha256 !== evaluationBankSha256) {
    issues.push(`evaluation-bank hash: expected ${evaluationBankSha256}, observed ${identity.eval_bank_sha256}`);
  }
  if (identity.guard_sha256 !== registry.guard.sha256) {
    issues.push(`guard hash: expected ${registry.guard.sha256}, observed ${identity.guard_sha256}`);
  }
  if (identity.runtime_overlay_sha256 !== registry.runtime_overlay.sha256) {
    issues.push(
      `runtime-overlay hash: expected ${registry.runtime_overlay.sha256}, observed ${identity.runtime_overlay_sha256}`,
    );
  }
  for (const [profileId, profile] of Object.entries(registry.profiles)) {
    const observed = identity.profiles[profileId];
    if (observed !== profile.sha256) {
      issues.push(`profile ${profileId}: expected ${profile.sha256}, observed ${observed ?? 'missing'}`);
    }
  }
  return issues;
}

async function readLatestEvidence(
  registry: Registry,
  registrySha256: string,
  evaluationBankSha256: string,
  now: number,
  maximumAgeHours: number,
): Promise<{
  evidence: SmokeEvidence | null;
  source: SourceStatus;
}> {
  const path = await latestEvidencePath();
  if (!path) {
    return {
      evidence: null,
      source: {
        label: 'evidence',
        path: null,
        state: 'absent',
        validRecords: 0,
        invalidRecords: 0,
        error: null,
      },
    };
  }

  try {
    const parsed: unknown = JSON.parse(await readText(path));
    if (!isSmokeEvidence(parsed)) {
      return {
        evidence: null,
        source: {
          label: 'evidence',
          path,
          state: 'unreadable',
          validRecords: 0,
          invalidRecords: 1,
          error: 'Evidence file does not match the expected schema',
        },
      };
    }

    const identityIssues = evidenceIdentityIssues(
      parsed,
      registry,
      registrySha256,
      evaluationBankSha256,
    );
    if (identityIssues.length > 0) {
      return {
        evidence: parsed,
        source: {
          label: 'evidence',
          path,
          state: 'superseded',
          validRecords: 1,
          invalidRecords: 0,
          error: identityIssues.join('; '),
        },
      };
    }

    const observedAt = Date.parse(parsed.observed_at);
    if (!Number.isFinite(observedAt)) {
      return {
        evidence: null,
        source: {
          label: 'evidence',
          path,
          state: 'invalid',
          validRecords: 0,
          invalidRecords: 1,
          error: 'Evidence observed_at timestamp is invalid',
        },
      };
    }
    if (observedAt > now + FUTURE_CLOCK_SKEW_MS) {
      return {
        evidence: null,
        source: {
          label: 'evidence',
          path,
          state: 'invalid',
          validRecords: 0,
          invalidRecords: 1,
          error: 'Evidence observed_at timestamp is implausibly in the future',
        },
      };
    }
    if (now - observedAt > maximumAgeHours * 60 * 60 * 1000) {
      return {
        evidence: parsed,
        source: {
          label: 'evidence',
          path,
          state: 'stale',
          validRecords: 1,
          invalidRecords: 0,
          error: `Evidence is older than ${maximumAgeHours} hours`,
        },
      };
    }
    return {
      evidence: parsed,
      source: {
        label: 'evidence',
        path,
        state: 'available',
        validRecords: 1,
        invalidRecords: 0,
        error: null,
      },
    };
  } catch (error) {
    return {
      evidence: null,
      source: {
        label: 'evidence',
        path,
        state: 'unreadable',
        validRecords: 0,
        invalidRecords: 1,
        error: errorMessage(error),
      },
    };
  }
}

function compareIdentity(
  label: string,
  actual: string | null | undefined,
  expected: string,
  issues: string[],
): void {
  if (actual !== expected) issues.push(`${label}: expected ${expected}, observed ${actual ?? 'missing'}`);
}

function routeAttestation(
  alias: string,
  route: RouteRecord,
  profile: ProfileRecord,
  registry: Registry,
  launch: LaunchReceipt | null,
  attestations: Map<string, AttestationReceipt>,
  now: number,
  maximumAgeHours: number,
): Pick<JailbreakRoute, 'latestAttestation' | 'attestationStatus' | 'attestationIssues'> {
  if (!launch) {
    return {
      latestAttestation: null,
      attestationStatus: 'missing',
      attestationIssues: ['No launch attempt is recorded for this route'],
    };
  }
  if (!launch.launch_id) {
    return {
      latestAttestation: null,
      attestationStatus: 'missing',
      attestationIssues: ['The latest launch attempt predates linked launch IDs'],
    };
  }

  const attestation = attestations.get(launch.launch_id) ?? null;
  if (!attestation) {
    return {
      latestAttestation: null,
      attestationStatus: 'missing',
      attestationIssues: ['No attestation is linked to the latest launch attempt'],
    };
  }

  const issues: string[] = [];
  compareIdentity('launch event', launch.event, 'launch_attempt', issues);
  compareIdentity('launch alias', launch.alias, alias, issues);
  compareIdentity('launch model', launch.model, route.model, issues);
  compareIdentity('launch profile', launch.profile_id, route.profile, issues);
  compareIdentity('launch profile hash', launch.profile_sha256, profile.sha256, issues);
  compareIdentity('launch guard hash', launch.guard_sha256, registry.guard.sha256, issues);
  compareIdentity(
    'launch runtime-overlay hash',
    launch.runtime_overlay_sha256,
    registry.runtime_overlay.sha256,
    issues,
  );
  compareIdentity('launch thinking', launch.thinking, route.thinking, issues);
  compareIdentity('launch injection', launch.injection, profile.injection, issues);

  compareIdentity('attestation event', attestation.event, 'session_attested', issues);
  compareIdentity('attestation alias', attestation.alias, alias, issues);
  compareIdentity('expected model', attestation.expected_model, route.model, issues);
  compareIdentity('actual model', attestation.actual_model, route.model, issues);
  compareIdentity('expected thinking', attestation.expected_thinking, route.thinking, issues);
  compareIdentity('actual thinking', attestation.actual_thinking, route.thinking, issues);
  compareIdentity('attested profile', attestation.profile_id, route.profile, issues);
  compareIdentity('attested profile hash', attestation.profile_sha256, profile.sha256, issues);
  compareIdentity('attested guard hash', attestation.guard_sha256, registry.guard.sha256, issues);
  compareIdentity(
    'expected runtime-overlay hash',
    attestation.expected_runtime_overlay_sha256,
    registry.runtime_overlay.sha256,
    issues,
  );
  compareIdentity(
    'attested runtime-overlay hash',
    attestation.runtime_overlay_sha256,
    registry.runtime_overlay.sha256,
    issues,
  );
  compareIdentity('attested injection', attestation.injection, profile.injection, issues);

  const observedAt = Date.parse(attestation.observed_at);
  const maximumAgeMs = maximumAgeHours * 60 * 60 * 1000;
  let stale = false;
  if (!Number.isFinite(observedAt)) {
    issues.push('Attestation timestamp is invalid');
  } else if (observedAt > now + FUTURE_CLOCK_SKEW_MS) {
    issues.push('Attestation timestamp is implausibly in the future');
  } else if (now - observedAt > maximumAgeMs) {
    stale = true;
    issues.push(`Attestation is older than ${maximumAgeHours} hours`);
  }

  return {
    latestAttestation: attestation,
    attestationStatus: issues.length === 0 ? 'matched' : stale && issues.length === 1 ? 'stale' : 'mismatch',
    attestationIssues: issues,
  };
}

function sourceIsCorrupt(source: SourceStatus): boolean {
  return source.state === 'partial'
    || source.state === 'unreadable'
    || source.state === 'invalid'
    || source.state === 'stale'
    || source.state === 'superseded';
}

export async function getJailbreakDashboard(): Promise<JailbreakDashboard> {
  const errors: string[] = [];
  const now = Date.now();
  const maximumAgeHours = attestationMaxAgeHours();
  const maximumEvidenceAgeHours = evidenceMaxAgeHours();
  const registryPath = join(CONTROL_ROOT, 'registry.json');
  const evaluationBankPath = join(CONTROL_ROOT, 'eval_bank.json');
  const [registrySource, evaluationBankSource] = await Promise.all([
    readFile(registryPath),
    readFile(evaluationBankPath),
  ]);
  const registry = JSON.parse(registrySource.toString('utf8')) as Registry;
  const evaluation = JSON.parse(evaluationBankSource.toString('utf8')) as EvaluationBank;
  const registrySha256 = createHash('sha256').update(registrySource).digest('hex');
  const evaluationBankSha256 = createHash('sha256').update(evaluationBankSource).digest('hex');
  const [research, guardSource, overlaySource, launchRead, attestationRead, evidenceRead] = await Promise.all([
    readJson<UniversalResearch>(join(CONTROL_ROOT, 'universal_research.json')),
    readText(join(CONTROL_ROOT, registry.guard.path)),
    readText(join(CONTROL_ROOT, registry.runtime_overlay.path)),
    readJsonLines('launches', join(STATE_ROOT, 'launches.jsonl'), isLaunchReceipt),
    readJsonLines('attestations', join(STATE_ROOT, 'attestations.jsonl'), isAttestationReceipt),
    readLatestEvidence(registry, registrySha256, evaluationBankSha256, now, maximumEvidenceAgeHours),
  ]);

  const hashFixtures: Array<[string, ContentAddressedFile]> = [
    ['provider guard', registry.guard],
    ['runtime overlay', registry.runtime_overlay],
    ...Object.entries(registry.profiles).map(([id, profile]) => [`profile · ${id}`, profile] as [string, ContentAddressedFile]),
  ];
  const hashes = await Promise.all(hashFixtures.map(([label, fixture]) => hashStatus(label, fixture)));
  const profileHashes = new Map(
    hashes
      .filter((item) => item.label.startsWith('profile · '))
      .map((item) => [item.label.slice('profile · '.length), item.verified]),
  );

  const latestLaunches = new Map<string, LaunchReceipt>();
  for (const receipt of launchRead.records) latestLaunches.set(receipt.alias, receipt);

  const attestationsByLaunch = new Map<string, AttestationReceipt>();
  for (const attestation of attestationRead.records) {
    attestationsByLaunch.set(attestation.launch_id, attestation);
  }

  const routes = Object.entries(registry.routes).map(([alias, route]): JailbreakRoute => {
    const profile = registry.profiles[route.profile];
    if (!profile) throw new Error(`Route ${alias} references missing profile ${route.profile}`);
    const latestLaunch = latestLaunches.get(alias) ?? null;
    const attestation = routeAttestation(
      alias,
      route,
      profile,
      registry,
      latestLaunch,
      attestationsByLaunch,
      now,
      maximumAgeHours,
    );
    return {
      alias,
      model: route.model,
      profile: route.profile,
      thinking: route.thinking,
      status: profile.status,
      evidence: profile.evidence,
      injection: profile.injection,
      profileHashVerified: profileHashes.get(route.profile) === true,
      latestLaunch,
      ...attestation,
    };
  });

  const stageCounts = evaluation.cases.reduce<Record<string, number>>((counts, item) => {
    counts[item.stage] = (counts[item.stage] ?? 0) + 1;
    return counts;
  }, {});
  const allHashesVerified = hashes.every((item) => item.verified);
  const fallbackDisabled = /modelFallback:\s*false/.test(overlaySource)
    && /serverSideFallback:\s*false/.test(overlaySource);
  const providerRequestGuard = guardSource.includes('before_provider_request');
  const taskChildrenBlocked = guardSource.includes('toolName === "task"');
  const replacementInjection = routes.every((route) => route.injection === 'replace');
  const attestedRoutes = routes.filter((route) => route.attestationStatus === 'matched').length;

  if (!allHashesVerified) errors.push('One or more content-addressed control files failed verification.');
  if (!fallbackDisabled) errors.push('The runtime overlay does not disable both client and provider fallback.');
  if (!providerRequestGuard) errors.push('The provider-boundary model guard was not detected.');
  if (!taskChildrenBlocked) errors.push('The runtime guard does not block unprofiled task children.');
  if (!replacementInjection) errors.push('One or more routes do not use replacement prompt injection.');
  if (evidenceRead.source.state === 'absent' || evidenceRead.source.state === 'empty') {
    errors.push(`Evidence source is ${evidenceRead.source.state}; freshness cannot be established.`);
  }
  for (const source of [launchRead.source, attestationRead.source, evidenceRead.source]) {
    if (sourceIsCorrupt(source)) errors.push(`${source.label} source is ${source.state}: ${source.error}`);
  }
  for (const route of routes) {
    if (route.attestationStatus !== 'matched') {
      errors.push(`${route.alias} is ${route.attestationStatus}: ${route.attestationIssues.join('; ')}`);
    }
  }

  const routeIdentityFailure = routes.some((route) => route.attestationStatus === 'mismatch');
  const hardBoundaryHealthy = allHashesVerified
    && fallbackDisabled
    && providerRequestGuard
    && taskChildrenBlocked
    && replacementInjection;
  const sourceIntegrityHealthy = !sourceIsCorrupt(launchRead.source)
    && !sourceIsCorrupt(attestationRead.source)
    && evidenceRead.source.state === 'available';
  const health = !hardBoundaryHealthy || !sourceIntegrityHealthy || routeIdentityFailure
    ? 'degraded'
    : attestedRoutes < routes.length
      ? 'unattested'
      : 'attested';
  const evidence = evidenceRead.evidence;

  return {
    generatedAt: new Date(now).toISOString(),
    controlRoot: CONTROL_ROOT,
    stateRoot: STATE_ROOT,
    health,
    routes,
    hashes,
    sources: {
      launches: launchRead.source,
      attestations: attestationRead.source,
      evidence: evidenceRead.source,
    },
    controlBoundary: {
      providerRequestGuard,
      fallbackDisabled,
      taskChildrenBlocked,
      replacementInjection,
    },
    liveState: {
      attestedRoutes,
      routeCount: routes.length,
      attestationMaxAgeHours: maximumAgeHours,
      evidenceMaxAgeHours: maximumEvidenceAgeHours,
    },
    evaluation: {
      methodId: evaluation.method_id,
      cases: evaluation.cases,
      stageCounts,
      identityFields: evaluation.identity_fields,
      firstOutcomePolicy: evaluation.first_outcome_policy,
      promotionPolicy: evaluation.promotion_policy,
    },
    research,
    evidence: {
      file: evidenceRead.source.path,
      observedAt: evidence?.observed_at ?? null,
      ompVersion: evidence?.omp_version ?? null,
      checksRecorded: evidence?.checks.length ?? 0,
      verdict: evidence?.verdict ?? {},
    },
    errors,
  };
}
