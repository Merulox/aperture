import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

const WORKFLOW_ROOT = process.env.RED_TEAM_WORKFLOW ?? join(homedir(), 'projects/red-team-workflow');
const WORKSPACE_ROOT = process.env.RED_TEAM_WORKSPACES ?? join(homedir(), 'ops/red-team');
const LEARNING_PATH = join(WORKFLOW_ROOT, 'config/learning.json');
const TOOLS_PATH = join(WORKFLOW_ROOT, 'config/tools.json');
const PROGRESS_PATH = process.env.RED_TEAM_STATE ?? join(WORKFLOW_ROOT, '.state/progress.json');

export interface MissionStep {
  title: string;
  command: string | null;
  explanation: string;
  expected: string;
}

export interface MissionTerm {
  term: string;
  meaning: string;
}

export interface MissionProof {
  kind: 'rules_complete' | 'scope_exercised' | 'hypothesis_complete' | 'structured_pair' | 'sealed_evidence' | 'mission_journal';
  label: string;
}

export interface LearningLesson {
  id: string;
  title: string;
  brief: string;
  objective: string;
  lab: string;
  tools: string[];
  terms: MissionTerm[];
  steps: MissionStep[];
  proof: MissionProof;
}

export interface LearningModule {
  id: string;
  order: number;
  title: string;
  why: string;
  prerequisites: string[];
  tags: string[];
  lessons: LearningLesson[];
}

export interface ToolCatalogItem {
  id: string;
  name: string;
  command: string;
  category: string;
  stage: string;
  mode: string;
  risk: 'low' | 'medium' | 'high' | 'advanced';
  purpose: string;
  useWhen: string;
  installed: boolean;
}

export interface RedTeamWorkspace {
  id: string;
  name: string;
  authorization: 'owned_lab' | 'owned_system' | 'written_authorization';
  status: string;
  phase: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  path: string;
  scopeReady: boolean;
  targetCount: number;
  exclusionCount: number;
  counts: {
    raw: number;
    normalized: number;
    evidence: number;
    hypotheses: number;
    findings: number;
    missions: number;
  };
}

export interface LearningProgress {
  version: number;
  activeWorkspace: string | null;
  updatedAt: string;
}

export interface MissionCheck {
  label: string;
  passed: boolean;
  detail: string;
}

export interface MissionStatus {
  key: string;
  state: 'verified' | 'ready' | 'locked';
  checks: MissionCheck[];
  artifact: string | null;
}

export interface NextLearningStep {
  moduleId: string;
  moduleTitle: string;
  lessonId: string;
  lesson: LearningLesson;
  status: MissionStatus;
}

export interface RedTeamDashboard {
  principle: string;
  workflowRoot: string;
  workspaceRoot: string;
  progress: LearningProgress;
  modules: LearningModule[];
  tools: ToolCatalogItem[];
  workspaces: RedTeamWorkspace[];
  missionStatuses: Record<string, MissionStatus>;
  nextStep: NextLearningStep | null;
  completedCount: number;
  lessonCount: number;
}

interface LearningCatalog {
  version: number;
  principle: string;
  modules: LearningModule[];
}

interface ToolCatalog {
  version: number;
  tools: Omit<ToolCatalogItem, 'installed'>[];
}

function freshProgress(): LearningProgress {
  return { version: 2, activeWorkspace: null, updatedAt: new Date().toISOString() };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

async function readProgress(): Promise<LearningProgress> {
  try {
    const progress = await readJson<Partial<LearningProgress>>(PROGRESS_PATH);
    return {
      version: 2,
      activeWorkspace: typeof progress.activeWorkspace === 'string' ? progress.activeWorkspace : null,
      updatedAt: typeof progress.updatedAt === 'string' ? progress.updatedAt : new Date().toISOString(),
    };
  } catch {
    return freshProgress();
  }
}

async function writeProgress(progress: LearningProgress): Promise<void> {
  await mkdir(dirname(PROGRESS_PATH), { recursive: true });
  const temporary = `${PROGRESS_PATH}.${process.pid}.tmp`;
  const next = { version: 2, activeWorkspace: progress.activeWorkspace, updatedAt: new Date().toISOString() };
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
  await rename(temporary, PROGRESS_PATH);
}

async function commandInstalled(command: string): Promise<boolean> {
  for (const path of (process.env.PATH ?? '').split(':').filter(Boolean)) {
    try {
      await access(join(path, command), constants.X_OK);
      return true;
    } catch {
      // Continue through PATH without executing target-controlled output.
    }
  }
  return false;
}

async function countFiles(root: string, predicate: (name: string) => boolean = () => true): Promise<number> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }

  let count = 0;
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) count += await countFiles(path, predicate);
    else if (entry.isFile() && predicate(entry.name)) count += 1;
  }
  return count;
}

async function countMeaningfulLines(path: string): Promise<number> {
  return (await readText(path))
    .split('\n')
    .filter((line) => line.trim() && !line.trimStart().startsWith('#')).length;
}

async function readWorkspace(path: string): Promise<RedTeamWorkspace | null> {
  try {
    const metadata = await readJson<Omit<RedTeamWorkspace, 'path' | 'scopeReady' | 'targetCount' | 'exclusionCount' | 'counts'>>(join(path, 'workspace.json'));
    const [targetCount, exclusionCount, raw, normalized, evidence, hypotheses, findings, missions, authorization, rules] = await Promise.all([
      countMeaningfulLines(join(path, 'scope/targets.txt')),
      countMeaningfulLines(join(path, 'scope/exclusions.txt')),
      countFiles(join(path, 'recon/raw')),
      countFiles(join(path, 'recon/normalized')),
      countMeaningfulLines(join(path, 'evidence/manifest.jsonl')),
      countFiles(join(path, 'notes/hypotheses'), (name) => /^H-\d+.*\.md$/.test(name)),
      countFiles(join(path, 'reports/findings'), (name) => /^F-\d+.*\.md$/.test(name)),
      countFiles(join(path, 'notes/missions'), (name) => /^[a-z0-9-]+\.md$/.test(name)),
      stat(join(path, 'scope/authorization.md')).then(() => true).catch(() => false),
      stat(join(path, 'scope/rules.md')).then(() => true).catch(() => false),
    ]);

    return {
      ...metadata,
      path,
      scopeReady: authorization && rules && targetCount > 0,
      targetCount,
      exclusionCount,
      counts: { raw, normalized, evidence, hypotheses, findings, missions },
    };
  } catch {
    return null;
  }
}

async function readWorkspaces(): Promise<RedTeamWorkspace[]> {
  let entries;
  try {
    entries = await readdir(WORKSPACE_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }

  const workspaces = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => readWorkspace(join(WORKSPACE_ROOT, entry.name))),
  );
  return workspaces
    .filter((workspace): workspace is RedTeamWorkspace => workspace !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function markdownSection(markdown: string, heading: string): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start < 0) return '';
  const nextHeading = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const end = nextHeading > start ? nextHeading : lines.length;
  return lines.slice(start + 1, end).join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
}

async function firstCompletedHypothesis(workspace: RedTeamWorkspace): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(join(workspace.path, 'notes/hypotheses'), { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries.filter((item) => item.isFile() && /^H-\d+.*\.md$/.test(item.name))) {
    const markdown = await readText(join(workspace.path, 'notes/hypotheses', entry.name));
    if (markdownSection(markdown, 'Minimal validation').length >= 20 && markdownSection(markdown, 'Stop conditions').length >= 20) {
      return join('notes/hypotheses', entry.name);
    }
  }
  return null;
}

async function existingEvidenceReference(workspace: RedTeamWorkspace, evidenceText: string): Promise<string | null> {
  const candidates = evidenceText.match(/(?:recon|evidence)\/[A-Za-z0-9._/-]+/g) ?? [];
  const root = resolve(workspace.path);
  for (const candidate of candidates) {
    const artifact = resolve(root, candidate.replace(/[),.;:]+$/, ''));
    if (artifact !== root && artifact.startsWith(`${root}${sep}`)) {
      try {
        if ((await stat(artifact)).isFile()) return candidate;
      } catch {
        // Keep looking for a real artifact reference.
      }
    }
  }
  return null;
}

async function missionJournalChecks(workspace: RedTeamWorkspace, moduleId: string, lessonId: string): Promise<{ checks: MissionCheck[]; artifact: string }> {
  const relativePath = join('notes/missions', `${moduleId}-${lessonId}.md`);
  const markdown = await readText(join(workspace.path, relativePath));
  const sections = ['Environment', 'Commands run', 'Observation', 'Explanation', 'Evidence', 'Safety / scope check'];
  const checks: MissionCheck[] = [{
    label: 'Mission journal exists',
    passed: markdown.length > 0,
    detail: markdown.length > 0 ? relativePath : `Run: rt mission ${workspace.id} ${moduleId} ${lessonId}`,
  }];

  for (const section of sections) {
    const content = markdownSection(markdown, section);
    const minimum = section === 'Commands run' ? 8 : 20;
    checks.push({
      label: `${section} is substantive`,
      passed: content.length >= minimum,
      detail: content.length >= minimum ? `${content.length} characters recorded` : `Fill ## ${section} with your own observation`,
    });
  }
  const evidence = await existingEvidenceReference(workspace, markdownSection(markdown, 'Evidence'));
  checks.push({
    label: 'Evidence path exists inside workspace',
    passed: evidence !== null,
    detail: evidence ?? 'Reference an existing file under recon/ or evidence/',
  });
  return { checks, artifact: relativePath };
}

async function evaluateProof(workspace: RedTeamWorkspace | null, moduleId: string, lesson: LearningLesson): Promise<{ checks: MissionCheck[]; artifact: string | null }> {
  if (!workspace) {
    return { checks: [{ label: 'Active owned workspace exists', passed: false, detail: 'Create training-lab from the workflow repository' }], artifact: null };
  }

  if (lesson.proof.kind === 'rules_complete') {
    const markdown = await readText(join(workspace.path, 'scope/rules.md'));
    const fields = [
      'Authorized operator',
      'Valid from / until',
      'Permitted test accounts',
      'Permitted hours',
      'Permitted intensity / rate limits',
      'Data handling and retention',
      'Stop conditions',
      'Emergency contact',
    ];
    const checks = fields.map((field) => {
      const match = markdown.match(new RegExp(`^- ${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[ \\t]*([^\\r\\n]+)$`, 'mi'));
      const passed = Boolean(match?.[1]?.trim());
      return { label: field, passed, detail: passed ? match![1].trim() : 'Required field is blank' };
    });
    return { checks, artifact: 'scope/rules.md' };
  }

  if (lesson.proof.kind === 'scope_exercised') {
    const lines = (await readText(join(workspace.path, '.workflow/scope-events.jsonl'))).split('\n').filter(Boolean);
    const events = lines.flatMap((line) => {
      try {
        return [JSON.parse(line) as { allowed?: boolean }];
      } catch {
        return [];
      }
    });
    return {
      checks: [
        { label: 'Authorized target rule exists', passed: workspace.targetCount > 0, detail: `${workspace.targetCount} target rule(s)` },
        { label: 'Allowed decision recorded', passed: events.some((event) => event.allowed === true), detail: `${events.filter((event) => event.allowed === true).length} allowed event(s)` },
        { label: 'Refused decision recorded', passed: events.some((event) => event.allowed === false), detail: `${events.filter((event) => event.allowed === false).length} refused event(s)` },
      ],
      artifact: '.workflow/scope-events.jsonl',
    };
  }

  if (lesson.proof.kind === 'hypothesis_complete') {
    const hypothesis = await firstCompletedHypothesis(workspace);
    return {
      checks: [{
        label: 'Hypothesis contains minimal validation and stop conditions',
        passed: hypothesis !== null,
        detail: hypothesis ?? 'Create and fill a notes/hypotheses/H-*.md file',
      }],
      artifact: hypothesis,
    };
  }

  if (lesson.proof.kind === 'structured_pair') {
    return {
      checks: [
        { label: 'Raw observation exists', passed: workspace.counts.raw > 0, detail: `${workspace.counts.raw} raw file(s)` },
        { label: 'Normalized derivative exists', passed: workspace.counts.normalized > 0, detail: `${workspace.counts.normalized} normalized file(s)` },
      ],
      artifact: workspace.counts.normalized > 0 ? 'recon/normalized/' : null,
    };
  }

  if (lesson.proof.kind === 'sealed_evidence') {
    const sealed = await countMeaningfulLines(join(workspace.path, 'recon/raw/.manifest.jsonl'));
    return {
      checks: [
        { label: 'Raw integrity ledger contains a hash', passed: sealed > 0, detail: `${sealed} sealed raw file(s)` },
        { label: 'Evidence manifest contains a curated item', passed: workspace.counts.evidence > 0, detail: `${workspace.counts.evidence} evidence item(s)` },
      ],
      artifact: sealed > 0 && workspace.counts.evidence > 0 ? 'evidence/manifest.jsonl' : null,
    };
  }

  return missionJournalChecks(workspace, moduleId, lesson.id);
}

async function evaluateMissions(modules: LearningModule[], workspace: RedTeamWorkspace | null): Promise<Record<string, MissionStatus>> {
  const rawResults: Record<string, { checks: MissionCheck[]; artifact: string | null }> = {};
  for (const module of modules) {
    for (const lesson of module.lessons) {
      rawResults[`${module.id}/${lesson.id}`] = await evaluateProof(workspace, module.id, lesson);
    }
  }

  const statuses: Record<string, MissionStatus> = {};
  const completedModules: Record<string, true> = {};
  for (const module of modules.slice().sort((left, right) => left.order - right.order)) {
    const unlocked = module.prerequisites.every((id) => completedModules[id]);
    for (const lesson of module.lessons) {
      const key = `${module.id}/${lesson.id}`;
      const result = rawResults[key];
      const passed = result.checks.length > 0 && result.checks.every((check) => check.passed);
      statuses[key] = {
        key,
        state: unlocked ? (passed ? 'verified' : 'ready') : 'locked',
        checks: result.checks,
        artifact: result.artifact,
      };
    }
    if (unlocked && module.lessons.every((lesson) => statuses[`${module.id}/${lesson.id}`].state === 'verified')) {
      completedModules[module.id] = true;
    }
  }
  return statuses;
}

export async function getRedTeamDashboard(): Promise<RedTeamDashboard> {
  const [learning, toolCatalog, progress, workspaces] = await Promise.all([
    readJson<LearningCatalog>(LEARNING_PATH),
    readJson<ToolCatalog>(TOOLS_PATH),
    readProgress(),
    readWorkspaces(),
  ]);
  const tools = await Promise.all(toolCatalog.tools.map(async (tool) => ({ ...tool, installed: await commandInstalled(tool.command) })));
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const activeWorkspaceId = progress.activeWorkspace && workspaceIds.has(progress.activeWorkspace)
    ? progress.activeWorkspace
    : workspaces[0]?.id ?? null;
  const normalizedProgress = { ...progress, activeWorkspace: activeWorkspaceId };
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const modules = learning.modules.slice().sort((left, right) => left.order - right.order);
  const missionStatuses = await evaluateMissions(modules, activeWorkspace);
  const completedCount = Object.values(missionStatuses).filter((status) => status.state === 'verified').length;
  let nextStep: NextLearningStep | null = null;
  for (const module of modules) {
    const lesson = module.lessons.find((item) => missionStatuses[`${module.id}/${item.id}`].state === 'ready');
    if (lesson) {
      nextStep = {
        moduleId: module.id,
        moduleTitle: module.title,
        lessonId: lesson.id,
        lesson,
        status: missionStatuses[`${module.id}/${lesson.id}`],
      };
      break;
    }
  }

  return {
    principle: learning.principle,
    workflowRoot: WORKFLOW_ROOT,
    workspaceRoot: WORKSPACE_ROOT,
    progress: normalizedProgress,
    modules,
    tools,
    workspaces,
    missionStatuses,
    nextStep,
    completedCount,
    lessonCount: modules.reduce((total, module) => total + module.lessons.length, 0),
  };
}

export async function setActiveWorkspace(workspaceId: string): Promise<void> {
  const workspaces = await readWorkspaces();
  if (!workspaces.some((workspace) => workspace.id === workspaceId)) throw new Error('unknown workspace');
  await writeProgress({ ...(await readProgress()), activeWorkspace: workspaceId });
}
