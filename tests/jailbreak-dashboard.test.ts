import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const adapterUrl = new URL('../src/lib/jailbreak.ts', import.meta.url);
let importSequence = 0;

interface FixtureOptions {
  attestation?: 'matched' | 'missing' | 'malformed' | 'stale' | 'mismatch';
  evidence?: 'fresh' | 'missing' | 'invalid' | 'future' | 'stale';
  injection?: 'replace' | 'append';
  taskGuard?: boolean;
}

interface Fixture {
  root: string;
  controlRoot: string;
  stateRoot: string;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture(options: FixtureOptions = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'aperture-jailbreak-'));
  const controlRoot = join(root, 'control');
  const stateRoot = join(root, 'state');
  const evidenceRoot = join(controlRoot, 'evidence');
  mkdirSync(controlRoot, { recursive: true });
  mkdirSync(stateRoot, { recursive: true });

  const injection = options.injection ?? 'replace';
  const profile = 'fixture behavior profile\n';
  const guard = options.taskGuard === false
    ? 'before_provider_request\n'
    : 'before_provider_request\nevent.toolName === "task"\n';
  const overlay = 'retry:\n  modelFallback: false\nproviders:\n  anthropic:\n    serverSideFallback: false\n';
  const profileSha256 = sha256(profile);
  const guardSha256 = sha256(guard);
  const overlaySha256 = sha256(overlay);
  writeFileSync(join(controlRoot, 'profile.txt'), profile);
  writeFileSync(join(controlRoot, 'guard.ts'), guard);
  writeFileSync(join(controlRoot, 'overlay.yml'), overlay);

  writeJson(join(controlRoot, 'registry.json'), {
    guard: { path: 'guard.ts', sha256: guardSha256 },
    runtime_overlay: { path: 'overlay.yml', sha256: overlaySha256 },
    profiles: {
      fixture: {
        path: 'profile.txt',
        sha256: profileSha256,
        injection,
        status: 'incumbent',
        evidence: 'fixture evidence',
      },
    },
    routes: {
      sol: {
        model: 'openai-codex/gpt-5.6-sol',
        profile: 'fixture',
        thinking: 'medium',
      },
    },
  });
  writeJson(join(controlRoot, 'eval_bank.json'), {
    method_id: 'fixture-bank',
    cases: [{ id: 'fixture.case', stage: 'A', mode: 'no-tools' }],
    identity_fields: ['runtime_overlay_sha256'],
    first_outcome_policy: 'first outcome',
    promotion_policy: 'sealed holdout',
  });
  writeJson(join(controlRoot, 'universal_research.json'), {
    program_id: 'fixture-research',
    title: 'Fixture research',
    status: 'research',
    updated_at: new Date().toISOString(),
    thesis: 'Fixture thesis',
    current_hypothesis: 'Fixture hypothesis',
    non_goal: 'Fixture non-goal',
    success_definition: {
      models: ['openai-codex/gpt-5.6-sol'],
      minimum_repeated_trials: 5,
      critical_family_pass_rate: 1,
      task_quality_floor_vs_clean_control: 0.95,
      maximum_overexecution_rate_delta: 0.02,
      maximum_unattributed_provider_calls: 0,
      sealed_holdout_required: true,
    },
    behavior_contract: [{ id: 'execute', requirement: 'Complete the task' }],
    tracks: [{
      id: 'contract',
      title: 'Contract',
      status: 'active',
      evidence: 'fixture',
      next_experiment: 'fixture',
    }],
  });

  const observedAt = new Date().toISOString();
  const launch = {
    schema_version: 1,
    event: 'launch_attempt',
    launch_id: 'launch-fixture',
    observed_at: observedAt,
    alias: 'sol',
    model: 'openai-codex/gpt-5.6-sol',
    profile_id: 'fixture',
    profile_sha256: profileSha256,
    guard_sha256: guardSha256,
    runtime_overlay_sha256: overlaySha256,
    injection,
    thinking: 'medium',
  };
  writeFileSync(join(stateRoot, 'launches.jsonl'), `${JSON.stringify(launch)}\n`);

  if (options.attestation !== 'missing') {
    const attestation = {
      schema_version: 1,
      event: 'session_attested',
      observed_at: options.attestation === 'stale'
        ? new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
        : observedAt,
      launch_id: 'launch-fixture',
      alias: options.attestation === 'mismatch' ? 'astra' : 'sol',
      expected_model: 'openai-codex/gpt-5.6-sol',
      actual_model: 'openai-codex/gpt-5.6-sol',
      expected_thinking: 'medium',
      actual_thinking: 'medium',
      profile_id: 'fixture',
      profile_sha256: profileSha256,
      guard_sha256: guardSha256,
      expected_runtime_overlay_sha256: overlaySha256,
      runtime_overlay_sha256: overlaySha256,
      injection,
    };
    const suffix = options.attestation === 'malformed' ? '{broken-json\n' : '';
    writeFileSync(
      join(stateRoot, 'attestations.jsonl'),
      `${JSON.stringify(attestation)}\n${suffix}`,
    );
  }

  if (options.evidence !== 'missing') {
    mkdirSync(evidenceRoot, { recursive: true });
    const evidenceObservedAt = options.evidence === 'invalid'
      ? 'not-a-timestamp'
      : options.evidence === 'future'
        ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        : options.evidence === 'stale'
          ? new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
          : observedAt;
    writeJson(join(evidenceRoot, 'fixture.json'), {
      observed_at: evidenceObservedAt,
      omp_version: 'fixture',
      checks: [
        { id: 'expected-zero', exit_status: 0 },
        { id: 'expected-rejection', exit_status: 2 },
      ],
      verdict: { fixture: 'recorded' },
    });
  }

  return { root, controlRoot, stateRoot };
}

async function loadDashboard(fixture: Fixture) {
  process.env.OMP_FLAGSHIP_CONTROL_ROOT = fixture.controlRoot;
  process.env.OMP_FLAGSHIP_STATE_DIR = fixture.stateRoot;
  process.env.OMP_FLAGSHIP_ATTESTATION_MAX_AGE_HOURS = '24';
  process.env.OMP_FLAGSHIP_EVIDENCE_MAX_AGE_HOURS = '168';
  importSequence += 1;
  // Dynamic import is intentional: each fixture needs fresh module-level environment roots.
  const adapter = await import(`${adapterUrl.href}?fixture=${importSequence}`);
  return adapter.getJailbreakDashboard();
}

const fixtures: Fixture[] = [];
try {
  const matched = createFixture();
  fixtures.push(matched);
  const matchedDashboard = await loadDashboard(matched);
  assert.equal(matchedDashboard.health, 'attested');
  assert.equal(matchedDashboard.routes[0]?.attestationStatus, 'matched');
  assert.equal(matchedDashboard.liveState.attestedRoutes, 1);
  assert.equal(matchedDashboard.evidence.checksRecorded, 2);

  const malformed = createFixture({ attestation: 'malformed' });
  fixtures.push(malformed);
  const malformedDashboard = await loadDashboard(malformed);
  assert.equal(malformedDashboard.health, 'degraded');
  assert.equal(malformedDashboard.sources.attestations.state, 'partial');
  assert.equal(malformedDashboard.sources.attestations.validRecords, 1);
  assert.equal(malformedDashboard.sources.attestations.invalidRecords, 1);
  assert.equal(malformedDashboard.routes[0]?.attestationStatus, 'matched');

  const absent = createFixture({ attestation: 'missing', evidence: 'missing' });
  fixtures.push(absent);
  const absentDashboard = await loadDashboard(absent);
  assert.equal(absentDashboard.health, 'degraded');
  assert.equal(absentDashboard.sources.attestations.state, 'absent');
  assert.equal(absentDashboard.sources.evidence.state, 'absent');
  assert.equal(absentDashboard.routes[0]?.attestationStatus, 'missing');

  for (const evidenceState of ['invalid', 'future', 'stale'] as const) {
    const evidenceFixture = createFixture({ evidence: evidenceState });
    fixtures.push(evidenceFixture);
    const evidenceDashboard = await loadDashboard(evidenceFixture);
    assert.equal(evidenceDashboard.health, 'degraded');
    assert.equal(
      evidenceDashboard.sources.evidence.state,
      evidenceState === 'stale' ? 'stale' : 'invalid',
    );
    assert.match(
      evidenceDashboard.sources.evidence.error ?? '',
      evidenceState === 'invalid'
        ? /timestamp is invalid/
        : evidenceState === 'future'
          ? /future/
          : /older than 168 hours/,
    );
  }

  const stale = createFixture({ attestation: 'stale' });
  fixtures.push(stale);
  const staleDashboard = await loadDashboard(stale);
  assert.equal(staleDashboard.health, 'unattested');
  assert.equal(staleDashboard.routes[0]?.attestationStatus, 'stale');

  const mismatch = createFixture({ attestation: 'mismatch' });
  fixtures.push(mismatch);
  const mismatchDashboard = await loadDashboard(mismatch);
  assert.equal(mismatchDashboard.health, 'degraded');
  assert.equal(mismatchDashboard.routes[0]?.attestationStatus, 'mismatch');
  assert.match(mismatchDashboard.routes[0]?.attestationIssues.join('\n') ?? '', /attestation alias/);

  const brokenBoundary = createFixture({ injection: 'append', taskGuard: false });
  fixtures.push(brokenBoundary);
  const brokenBoundaryDashboard = await loadDashboard(brokenBoundary);
  assert.equal(brokenBoundaryDashboard.health, 'degraded');
  assert.equal(brokenBoundaryDashboard.controlBoundary.replacementInjection, false);
  assert.equal(brokenBoundaryDashboard.controlBoundary.taskChildrenBlocked, false);
  assert.match(brokenBoundaryDashboard.errors.join('\n'), /replacement prompt injection/);
  assert.match(brokenBoundaryDashboard.errors.join('\n'), /unprofiled task children/);
} finally {
  for (const fixture of fixtures) rmSync(fixture.root, { recursive: true, force: true });
}

console.log('JAILBREAK_DASHBOARD_TESTS_OK');
