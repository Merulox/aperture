import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Nav } from '../Nav';
import type { OrbitLoop, OrbitStatus, LoopTick, PendingAsk } from '../../lib/orbit';

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const s = Date.now() / 1000 - ts;
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function timeUntil(ts: number): string {
  const s = ts - Date.now() / 1000;
  if (s <= 0) return 'now';
  if (s < 60) return `in ${Math.round(s)}s`;
  if (s < 3600) return `in ${Math.round(s / 60)}m`;
  return `in ${Math.round(s / 3600)}h`;
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--green)',
  DRAFT:  'var(--muted)',
  PAUSED: 'var(--yellow)',
  ERROR:  'var(--red)',
};

// ── Orbit command helper ──────────────────────────────────────────────────────

async function orbitCmd(args: string[]): Promise<{ ok: boolean; output: string }> {
  const r = await fetch('/api/orbit-cmd', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args }),
  });
  return r.json() as Promise<{ ok: boolean; output: string }>;
}

// ── Inline result flash ───────────────────────────────────────────────────────

function commandResultSummary(result: { ok: boolean; output: string }): string {
  const output = result.output.trim();
  const loopName = output.match(/\[orbit:([^\]]+)\]/)?.[1];
  const subject = loopName ? `${loopName} tick` : 'Orbit command';

  if (!result.ok) {
    const terminalReason = output.match(/"terminal_reason":"([^"]+)"/)?.[1];
    if (terminalReason === 'api_error') {
      return `${subject} failed — Claude API returned an error before the loop could run. No tokens were used.`;
    }
    if (/timed out|timeout/i.test(output)) {
      return `${subject} failed — the command timed out.`;
    }
    if (/permission_denials":\[(?!\])/i.test(output)) {
      return `${subject} failed — Claude was denied a required permission.`;
    }
    const firstLine = output.split('\n', 1)[0].replace(/\s*—\s*exit \d+:.*$/, '').trim();
    return firstLine.length > 180 ? `${firstLine.slice(0, 177)}…` : firstLine || `${subject} failed.`;
  }

  const firstLine = output.split('\n', 1)[0].trim();
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}…` : firstLine;
}

function CmdFlash({ result, onDismiss }: { result: { ok: boolean; output: string } | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(onDismiss, result.ok ? 6000 : 15_000);
    return () => clearTimeout(t);
  }, [result, onDismiss]);
  if (!result) return null;

  const summary = commandResultSummary(result);
  const showDetails = !result.ok || summary !== result.output.trim();
  return (
    <div style={{
      background: result.ok ? '#0a1a0a' : '#1a0a0a',
      border: `1px solid ${result.ok ? 'var(--green)' : 'var(--red)'}`,
      padding: '8px 10px',
      fontSize: '0.65rem',
      color: result.ok ? 'var(--green)' : 'var(--red)',
      lineHeight: 1.45,
      wordBreak: 'break-word',
    }}>
      <div>{summary}</div>
      {showDetails && (
        <details style={{ marginTop: 6, color: 'var(--muted)' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>technical details</summary>
          <pre style={{
            margin: '6px 0 0',
            maxHeight: 120,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            fontFamily: 'inherit',
            fontSize: '0.58rem',
            color: 'var(--red)',
          }}>
            {result.output}
          </pre>
        </details>
      )}
    </div>
  );
}

// ── Tick history ──────────────────────────────────────────────────────────────

const TICK_BLOCK_LABELS: Record<string, string> = {
  ASK: 'ask',
  EVIDENCE: 'evidence record',
  MEMORY: 'memory update',
  NOTIFY: 'notification',
  PACE: 'pace update',
  SUMMARY: 'summary',
};

function tickFailureReason(err: string | null): string {
  if (!err) return 'unknown error';
  const terminalReason = err.match(/"terminal_reason":"([^"]+)"/)?.[1];
  if (terminalReason) return terminalReason.replaceAll('_', ' ');
  const firstLine = err.split('\n', 1)[0].replace(/^exit \d+:\s*/, '').trim();
  return firstLine.length > 100 ? `${firstLine.slice(0, 97)}…` : firstLine;
}

function tickExplanation(tick: LoopTick): string {
  const when = new Date(tick.ts).toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const seconds = Math.round(tick.dur_s);
  const duration = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  const tokens = (tick.in_tokens || 0) + (tick.cache_new || 0) + (tick.out_tokens || 0);
  const result = tick.ok ? 'completed' : `failed: ${tickFailureReason(tick.err)}`;
  const mode = tick.dry_run ? ' · dry run' : '';

  const outputs = Object.entries(tick.blocks || {})
    .filter(([, count]) => count > 0)
    .map(([block, count]) => {
      const label = TICK_BLOCK_LABELS[block] ?? block.toLowerCase();
      return `${count} ${label}${count === 1 ? '' : 's'}`;
    });
  if ((tick.blocked_ask || 0) > 0) {
    const count = tick.blocked_ask || 0;
    outputs.push(`${count} blocked ask${count === 1 ? '' : 's'}`);
  }

  let explanation = `${when} · ${result}${mode} · ${duration} · ${fmtTokens(tokens)} tokens`;
  if (tick.evidence?.trim()) {
    const evidence = tick.evidence.trim();
    explanation += ` — ${evidence.length > 180 ? `${evidence.slice(0, 177)}…` : evidence}`;
  } else if (outputs.length > 0) {
    explanation += ` — produced ${outputs.join(', ')}`;
  } else {
    explanation += ' — no structured output recorded';
  }
  return explanation;
}

function Sparkline({ ticks }: { ticks: LoopTick[] }) {
  const W = 120, H = 24, BAR = 4, GAP = 1;
  const recent = ticks.slice(-(Math.floor(W / (BAR + GAP))));
  const [activeTickId, setActiveTickId] = useState<string | null>(null);
  const activeTick = recent.find(tick => tick.tick_id === activeTickId) ?? recent.at(-1);
  if (!activeTick) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width={W} height={H} style={{ display: 'block', flexShrink: 0 }} aria-label="Recent tick history">
          {recent.map((tick, i) => {
            const x = i * (BAR + GAP);
            const color = tick.ok ? 'var(--green)' : 'var(--red)';
            const h = tick.ok ? H : Math.max(4, H / 2);
            const explanation = tickExplanation(tick);
            const isActive = tick.tick_id === activeTick.tick_id;
            return (
              <g
                key={`${tick.tick_id}-${i}`}
                role="img"
                tabIndex={0}
                aria-label={explanation}
                onMouseEnter={() => setActiveTickId(tick.tick_id)}
                onMouseLeave={() => setActiveTickId(null)}
                onFocus={() => setActiveTickId(tick.tick_id)}
                onBlur={() => setActiveTickId(null)}
                onClick={() => setActiveTickId(tick.tick_id)}
                style={{ cursor: 'help', outline: 'none' }}
              >
                <title>{explanation}</title>
                <rect
                  x={x}
                  y={H - h}
                  width={BAR}
                  height={h}
                  fill={color}
                  opacity={isActive ? 1 : 0.55}
                  stroke={isActive ? color : 'none'}
                  strokeWidth={1}
                />
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'grid', gap: 3, fontSize: '0.55rem', color: 'var(--muted)' }}>
          <span><span style={{ color: 'var(--green)' }}>■</span> completed</span>
          <span><span style={{ color: 'var(--red)' }}>■</span> failed</span>
        </div>
      </div>
      <div
        aria-live="polite"
        style={{ marginTop: 6, minHeight: '2.4em', fontSize: '0.6rem', lineHeight: 1.35, color: 'var(--muted)' }}
      >
        {tickExplanation(activeTick)}
      </div>
    </div>
  );
}

// ── ASK answer form ───────────────────────────────────────────────────────────

function AskBlock({ ask, loopName, onDone }: { ask: PendingAsk; loopName: string; onDone: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; output: string } | null>(null);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const r = await orbitCmd(['ask-answer', loopName, ask.id, text.trim()]);
    setResult(r);
    setBusy(false);
    if (r.ok) {
      setText('');
      setTimeout(onDone, 1500);
    }
  };

  return (
    <div style={{ background: '#0d1520', border: '1px solid #1a2a40', padding: '8px 10px', fontSize: '0.65rem' }}>
      <div style={{ color: 'var(--blue)', marginBottom: 4 }}>{ask.id}</div>
      <div style={{ color: 'var(--text)', lineHeight: 1.4, marginBottom: 8 }}>
        {ask.question.replace(/\*\*/g, '')}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Réponse…"
        rows={3}
        style={{
          width: '100%',
          background: '#0a0f1a',
          border: '1px solid #1a2a40',
          color: 'var(--text)',
          fontFamily: 'inherit',
          fontSize: '0.7rem',
          padding: '6px 8px',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) void submit(); }}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !text.trim()}
          style={{
            background: 'var(--blue)',
            color: '#000',
            border: 'none',
            padding: '4px 10px',
            fontSize: '0.65rem',
            cursor: busy ? 'wait' : 'pointer',
            opacity: !text.trim() ? 0.4 : 1,
          }}
        >
          {busy ? 'sending…' : 'answer ↵'}
        </button>
        <span style={{ color: 'var(--muted)', fontSize: '0.6rem' }}>⌘↵ to submit</span>
      </div>
      {result && <div style={{ marginTop: 6 }}><CmdFlash result={result} onDismiss={() => setResult(null)} /></div>}
    </div>
  );
}

// ── Loop card ─────────────────────────────────────────────────────────────────

function LoopCard({ loop, onRefresh }: { loop: OrbitLoop; onRefresh: () => void }) {
  const statusColor = STATUS_COLOR[loop.spec.status] ?? 'var(--muted)';
  const lastTs = loop.lastTick ? new Date(loop.lastTick.ts).getTime() / 1000 : null;
  const lastOk = loop.lastTick?.ok;
  const failures = loop.state.consecutive_failures;
  const hasAsks = loop.pendingAsks.length > 0;
  const isPaused = loop.state.paused;

  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; output: string } | null>(null);

  const run = async (args: string[], key: string) => {
    setBusy(key);
    const r = await orbitCmd(args);
    setResult(r);
    setBusy(null);
    if (r.ok) setTimeout(onRefresh, 800);
  };

  return (
    <div style={{
      background: 'var(--surface)',
      padding: '14px 16px',
      borderLeft: `3px solid ${hasAsks ? 'var(--blue)' : statusColor}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.05em' }}>
            {loop.name}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>
            {loop.spec.model.replace('claude-', '')} · {loop.state.pace || loop.spec.pace}
            {loop.spec.active_hours ? ` · ${loop.spec.active_hours}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: '0.65rem', color: statusColor, letterSpacing: '0.08em' }}>
            {loop.spec.status}{isPaused ? ' (PAUSED)' : ''}
          </span>
          {hasAsks && (
            <span style={{ fontSize: '0.65rem', color: 'var(--blue)' }}>
              {loop.pendingAsks.length} ASK{loop.pendingAsks.length > 1 ? 'S' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px', fontSize: '0.65rem', color: 'var(--muted)' }}>
        <div>last tick{' '}
          <span style={{ color: lastOk === true ? 'var(--green)' : lastOk === false ? 'var(--red)' : 'var(--muted)' }}>
            {lastTs ? timeAgo(lastTs) : '—'}
          </span>
        </div>
        <div>next <span style={{ color: 'var(--text)' }}>{loop.nextTickTs ? timeUntil(loop.nextTickTs) : '—'}</span></div>
        <div>failures <span style={{ color: failures > 0 ? 'var(--red)' : 'var(--text)' }}>{failures}</span></div>
        <div>dur <span style={{ color: 'var(--text)' }}>{loop.lastTick ? `${Math.round(loop.lastTick.dur_s)}s` : '—'}</span></div>
        <div>tok/tick <span style={{ color: 'var(--text)' }}>{loop.lastTick ? fmtTokens((loop.lastTick.in_tokens || 0) + (loop.lastTick.cache_new || 0) + (loop.lastTick.out_tokens || 0)) : '—'}</span></div>
        <div>tok/day <span style={{ color: 'var(--text)' }}>{fmtTokens(loop.tokensToday)}</span></div>
      </div>

      {/* Sparkline */}
      {loop.recentTicks.length > 0 && <Sparkline ticks={loop.recentTicks} />}

      {/* Summary */}
      {loop.state.summary && (
        <div style={{ fontSize: '0.65rem', color: 'var(--muted)', lineHeight: 1.5, borderTop: '1px solid #222', paddingTop: 8 }}>
          {loop.state.summary.slice(0, 200)}{loop.state.summary.length > 200 ? '…' : ''}
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6, borderTop: '1px solid #222', paddingTop: 8 }}>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run(['tick', loop.name, '--force'], 'tick')}
          style={btnStyle('var(--muted)', busy === 'tick')}
        >
          {busy === 'tick' ? '…' : 'tick'}
        </button>
        {isPaused ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run(['resume', loop.name], 'resume')}
            style={btnStyle('var(--green)', busy === 'resume')}
          >
            {busy === 'resume' ? '…' : 'resume'}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run(['pause', loop.name], 'pause')}
            style={btnStyle('var(--yellow)', busy === 'pause')}
          >
            {busy === 'pause' ? '…' : 'pause'}
          </button>
        )}
      </div>
      {result && <CmdFlash result={result} onDismiss={() => setResult(null)} />}

      {/* Pending ASKs — with answer forms */}
      {loop.pendingAsks.map(ask => (
        <AskBlock key={ask.id} ask={ask} loopName={loop.name} onDone={onRefresh} />
      ))}
    </div>
  );
}

function btnStyle(color: string, loading: boolean): React.CSSProperties {
  return {
    background: 'transparent',
    border: `1px solid ${color}`,
    color,
    padding: '3px 10px',
    fontSize: '0.65rem',
    cursor: loading ? 'wait' : 'pointer',
    letterSpacing: '0.05em',
    opacity: loading ? 0.5 : 1,
  };
}

// ── Node graph ────────────────────────────────────────────────────────────────

function OrbitGraph({ loops, frozen }: { loops: OrbitLoop[]; frozen: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ForceGraph, setForceGraph] = useState<any>(null);
  const [dims, setDims] = useState({ width: 600, height: 320 });

  useEffect(() => {
    import('react-force-graph-2d').then(m => setForceGraph(() => m.default));
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setDims({ width: e.contentRect.width, height: 320 });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const nodes = [
    { id: 'bus', label: 'events', color: frozen ? '#ef4444' : '#555', size: 10 },
    ...loops.map(l => ({
      id: l.name,
      label: l.name,
      color: STATUS_COLOR[l.spec.status] ?? 'var(--muted)',
      size: 6 + Math.min(l.tokensToday / 20000, 8),
      asks: l.pendingAsks.length,
    })),
  ];

  const links = loops.map(l => ({ source: l.name, target: 'bus' }));

  if (!ForceGraph) {
    return <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '0.75rem' }}>loading graph…</div>;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: 320, background: 'var(--surface)', overflow: 'hidden' }}>
      <ForceGraph
        width={dims.width}
        height={dims.height}
        graphData={{ nodes, links }}
        backgroundColor="#111111"
        nodeLabel={(n: any) => `${n.label}${n.asks ? ` · ${n.asks} ask(s)` : ''}`}
        nodeColor={(n: any) => n.color}
        nodeVal={(n: any) => n.size}
        linkColor={() => '#333'}
        linkWidth={1}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, scale: number) => {
          const r = (node.size ?? 6) / 2 + 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = node.color;
          ctx.fill();
          if (node.asks > 0) {
            ctx.beginPath();
            ctx.arc(node.x + r * 0.7, node.y - r * 0.7, 3, 0, 2 * Math.PI);
            ctx.fillStyle = '#60a5fa';
            ctx.fill();
          }
          ctx.font = `${Math.max(10, 12 / scale)}px monospace`;
          ctx.fillStyle = '#999';
          ctx.textAlign = 'center';
          ctx.fillText(node.label, node.x, node.y + r + 10 / scale);
        }}
        cooldownTicks={80}
        enableZoomInteraction={false}
      />
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function OrbitPanel() {
  const [data, setData] = useState<OrbitStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/orbit');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as OrbitStatus;
      setData(d);
      setRefreshed(new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const totalAsks = data?.totalAsks ?? 0;

  return (
    <main style={{ fontFamily: 'inherit' }}>
      <Nav page="orbit" subtitle={totalAsks > 0 ? `${totalAsks} ask${totalAsks > 1 ? 's' : ''}` : undefined} />

      {data?.frozen && (
        <div style={{ background: '#1a0000', border: '1px solid var(--red)', padding: '8px 14px', marginBottom: 12, fontSize: '0.75rem', color: 'var(--red)' }}>
          ⚠ ORBIT FROZEN — ~/.orbit-frozen present
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginBottom: 12 }}>{error}</div>
      )}

      {data && (
        <>
          {/* Node graph */}
          <div style={{ marginBottom: 12 }}>
            <OrbitGraph loops={data.loops} frozen={data.frozen} />
          </div>

          {/* Loop cards */}
          <div className="grid" style={{ marginBottom: 16 }}>
            {data.loops.map(loop => (
              <LoopCard key={loop.name} loop={loop} onRefresh={load} />
            ))}
            {data.loops.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem', padding: 16 }}>no loops configured</div>
            )}
          </div>

          {/* Recent events bus */}
          {data.recentEvents.length > 0 && (
            <div style={{ background: 'var(--surface)', padding: '12px 14px' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted)', letterSpacing: '0.1em', marginBottom: 8 }}>EVENTS BUS</div>
              {data.recentEvents.slice(-8).reverse().map((ev, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, fontSize: '0.65rem', padding: '3px 0', borderBottom: '1px solid #1a1a1a' }}>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{ev.ts?.slice(11, 19) ?? ''}</span>
                  <span style={{ color: 'var(--blue)', flexShrink: 0 }}>{ev.loop}</span>
                  <span style={{ color: 'var(--text)' }}>{ev.type}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: '0.6rem', color: 'var(--muted)', textAlign: 'right' }}>
            refreshed {refreshed} · auto every 15s
          </div>
        </>
      )}

      {!data && !error && (
        <div style={{ color: 'var(--muted)', fontSize: '0.75rem', padding: 24 }}>loading…</div>
      )}
    </main>
  );
}
