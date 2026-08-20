import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ENV_PATH = join(homedir(), '.secrets/mirrorchamber-bot.env');

export interface JobCompletePayload {
  taskId: string;
  taskTitle: string;
  status: 'done' | 'failed' | 'blocked';
  exitCode: number | null;
  blockedReason?: string;
  commit?: string;
  durationMs?: number;
  logPath?: string;
}

function parseEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index < 1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function formatDuration(durationMs?: number): string | undefined {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) return undefined;

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function statusMeta(status: JobCompletePayload['status']): { icon: string; label: string } {
  if (status === 'done') return { icon: '🟢', label: 'DONE' };
  if (status === 'failed') return { icon: '🔴', label: 'FAILED' };
  return { icon: '🟠', label: 'BLOCKED' };
}

function messageFor(p: JobCompletePayload): string {
  const { icon, label } = statusMeta(p.status);
  const duration = formatDuration(p.durationMs);
  const evidence = [
    `<b>Task:</b> <code>${escapeHtml(p.taskId)}</code>`,
    `<b>Exit:</b> ${p.exitCode === null ? 'not reported' : p.exitCode}`,
    duration ? `<b>Duration:</b> ${duration}` : undefined,
    `<b>Commit:</b> <code>${escapeHtml(p.commit || 'none')}</code>`,
  ].filter(Boolean);

  if (p.status === 'blocked' && p.blockedReason) {
    evidence.push(`<b>Reason:</b> ${escapeHtml(p.blockedReason)}`);
  }
  if (p.logPath) {
    evidence.push(`<b>Log:</b> <code>${escapeHtml(p.logPath)}</code>`);
  }

  return [
    `${icon} <b>${label}</b>  ·  <code>aperture/job</code>`,
    '',
    `<b>${escapeHtml(p.taskTitle)}</b>`,
    '',
    evidence.join('\n\n'),
    '',
    '<i>Open Aperture for the full run context</i>',
  ].join('\n');
}

export async function notifyJobComplete(p: JobCompletePayload): Promise<void> {
  try {
    const content = await readFile(ENV_PATH, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (content === undefined) {
      console.warn('[notify] Telegram env file missing; skipped');
      return;
    }

    const env = parseEnv(content);
    const token = env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      console.warn('[notify] Telegram env missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID; skipped');
      return;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageFor(p),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      console.warn(`[notify] Telegram send failed: HTTP ${response.status}`);
      return;
    }

    const result = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
    if (!result?.ok) {
      console.warn(`[notify] Telegram send failed: ${result?.description || 'response not ok'}`);
    }
  } catch (error) {
    console.warn(`[notify] ${error instanceof Error ? error.message : String(error)}`);
  }
}
