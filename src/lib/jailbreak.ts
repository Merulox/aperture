import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONTROL_ROOT = process.env.OMP_FLAGSHIP_CONTROL_ROOT
  ?? join(homedir(), 'projects/realm/flagship_control');
const STATE_ROOT = process.env.OMP_FLAGSHIP_STATE_DIR
  ?? join(homedir(), '.local/state/omp-flagship-control');

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

interface SmokeEvidence {
  observed_at: string;
  omp_version: string;
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
}

interface AttestationReceipt {
  alias: string;
  event: string;
  observed_at: string;
  launch_id: string;
  actual_model: string | null;
  actual_thinking: string | null;
  profile_id: string;
}

export interface HashStatus {
  label: string;
  path: string;
  expected: string;
  observed: string | null;
  verified: boolean;
}

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
}

export interface JailbreakDashboard {
  generatedAt: string;
  controlRoot: string;
  stateRoot: string;
  health: 'verified' | 'unattested' | 'degraded';
  routes: JailbreakRoute[];
  hashes: HashStatus[];
  controlBoundary: {
    providerRequestGuard: boolean;
    fallbackDisabled: boolean;
    taskChildrenBlocked: boolean;
    replacementInjection: boolean;
  };
  liveState: {
    attestedRoutes: number;
    routeCount: number;
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
    passedChecks: number;
    totalChecks: number;
    verdict: Record<string, string>;
  };
  errors: string[];
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  try {
    return (await readText(path))
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
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

export async function getJailbreakDashboard(): Promise<JailbreakDashboard> {
  const errors: string[] = [];
  const registry = await readJson<Registry>(join(CONTROL_ROOT, 'registry.json'));
  const [evaluation, research, guardSource, overlaySource, launches, attestations, evidencePath] = await Promise.all([
    readJson<EvaluationBank>(join(CONTROL_ROOT, 'eval_bank.json')),
    readJson<UniversalResearch>(join(CONTROL_ROOT, 'universal_research.json')),
    readText(join(CONTROL_ROOT, registry.guard.path)),
    readText(join(CONTROL_ROOT, registry.runtime_overlay.path)),
    readJsonLines<LaunchReceipt>(join(STATE_ROOT, 'launches.jsonl')),
    readJsonLines<AttestationReceipt>(join(STATE_ROOT, 'attestations.jsonl')),
    latestEvidencePath(),
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
  for (const receipt of launches) latestLaunches.set(receipt.alias, receipt);

  const successfulAttestations = new Map<string, AttestationReceipt>();
  for (const attestation of attestations) {
    if (attestation.event === 'session_attested') {
      successfulAttestations.set(attestation.launch_id, attestation);
    }
  }

  const routes = Object.entries(registry.routes).map(([alias, route]): JailbreakRoute => {
    const profile = registry.profiles[route.profile];
    if (!profile) throw new Error(`Route ${alias} references missing profile ${route.profile}`);
    const latestLaunch = latestLaunches.get(alias) ?? null;
    const latestAttestation = latestLaunch?.launch_id
      ? successfulAttestations.get(latestLaunch.launch_id) ?? null
      : null;
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
      latestAttestation,
    };
  });

  let evidence: SmokeEvidence | null = null;
  if (evidencePath) {
    try {
      evidence = await readJson<SmokeEvidence>(evidencePath);
    } catch (error) {
      errors.push(`Evidence could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    errors.push('No smoke evidence artifact was found.');
  }

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
  const attestedRoutes = routes.filter((route) => route.latestAttestation !== null).length;

  if (!allHashesVerified) errors.push('One or more content-addressed control files failed verification.');
  if (!fallbackDisabled) errors.push('The runtime overlay does not disable both client and provider fallback.');
  if (!providerRequestGuard) errors.push('The provider-boundary model guard was not detected.');
  if (attestedRoutes < routes.length) {
    errors.push(`Only ${attestedRoutes}/${routes.length} latest route attempts have linked session attestations.`);
  }

  const health = !allHashesVerified || !fallbackDisabled || !providerRequestGuard
    ? 'degraded'
    : attestedRoutes < routes.length
      ? 'unattested'
      : 'verified';

  return {
    generatedAt: new Date().toISOString(),
    controlRoot: CONTROL_ROOT,
    stateRoot: STATE_ROOT,
    health,
    routes,
    hashes,
    controlBoundary: {
      providerRequestGuard,
      fallbackDisabled,
      taskChildrenBlocked,
      replacementInjection,
    },
    liveState: {
      attestedRoutes,
      routeCount: routes.length,
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
      file: evidencePath,
      observedAt: evidence?.observed_at ?? null,
      ompVersion: evidence?.omp_version ?? null,
      passedChecks: evidence?.checks.filter((check) => check.exit_status === 0).length ?? 0,
      totalChecks: evidence?.checks.length ?? 0,
      verdict: evidence?.verdict ?? {},
    },
    errors,
  };
}
