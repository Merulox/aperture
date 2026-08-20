import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type NodeKind = 'system' | 'domain' | 'repository' | 'session' | 'resident' | 'service' | 'capability' | 'process' | 'step';
type NodeStatus = 'active' | 'inactive' | 'warning' | 'indexed' | 'unknown';

interface AtlasNode {
  id: string;
  label: string;
  kind: NodeKind;
  status: NodeStatus;
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

interface AtlasLink {
  source: string;
  target: string;
  kind: 'contains' | 'owns' | 'executes' | 'step';
  label: string;
  status: NodeStatus;
  certainty: 'observed' | 'inferred';
}


interface AtlasGraph {
  nodes: AtlasNode[];
  links: AtlasLink[];
  generatedAt: string;
  sourceRevision: string;
  counts: Record<string, number>;
}

interface BranchCache {
  url: string;
  graph: AtlasGraph;
}

interface PositionedNode {
  node: AtlasNode;
  x: number;
  y: number;
}

interface AtlasLayout {
  nodes: PositionedNode[];
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

type NodeStyle = React.CSSProperties & { '--node-color': string };

const EMPTY_GRAPH: AtlasGraph = { nodes: [], links: [], generatedAt: '', sourceRevision: '', counts: {} };
const COLOR_BY_KIND: Record<NodeKind, string> = {
  system: '#f5c542',
  domain: '#8a7dff',
  repository: '#55b7ff',
  session: '#6ee7a8',
  resident: '#f5c96a',
  service: '#ff9f5a',
  capability: '#d78cff',
  process: '#63d7df',
  step: '#bac7d5',
};

async function fetchGraph(url: string): Promise<AtlasGraph> {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json() as AtlasGraph | { error?: string };
  if (!response.ok || !('nodes' in payload)) {
    throw new Error('error' in payload && payload.error ? payload.error : `${response.status} ${response.statusText}`);
  }
  return payload;
}

function createAtlasLayout(nodes: AtlasNode[]): AtlasLayout {
  const depthByKind: Record<NodeKind, number> = {
    system: 0,
    domain: 1,
    repository: 2,
    session: 2,
    resident: 2,
    service: 2,
    capability: 2,
    process: 3,
    step: 4,
  };
  const groups = new Map<number, AtlasNode[]>();
  for (const node of nodes) {
    const flowStage = node.kind === 'step' && typeof node.details.flowStage === 'number'
      ? node.details.flowStage
      : 0;
    const depth = depthByKind[node.kind] + flowStage;
    const group = groups.get(depth) ?? [];
    group.push(node);
    groups.set(depth, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => (
      (left.parentId ?? '').localeCompare(right.parentId ?? '')
      || left.label.localeCompare(right.label)
    ));
  }
  const maxRows = Math.max(1, ...[...groups.values()].map((group) => group.length));
  const maxDepth = Math.max(0, ...groups.keys());
  const rowGap = 62;
  const columnGap = 250;
  const height = Math.max(720, maxRows * rowGap + 140);
  const width = Math.max(1100, (maxDepth + 1) * columnGap + 220);
  const positioned: PositionedNode[] = [];
  const positions = new Map<string, { x: number; y: number }>();
  for (const [depth, group] of groups) {
    const startY = (height - (group.length - 1) * rowGap) / 2;
    group.forEach((node, index) => {
      const position = { x: 120 + depth * columnGap, y: startY + index * rowGap };
      positions.set(node.id, position);
      positioned.push({ node, ...position });
    });
  }
  return { nodes: positioned, positions, width, height };
}

export default function WorkflowAtlas() {
  const [root, setRoot] = useState<AtlasGraph>(EMPTY_GRAPH);
  const [branches, setBranches] = useState<Record<string, BranchCache>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedId, setSelectedId] = useState('system:realm');
  const [loadingIds, setLoadingIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState('');
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const nodeElements = useRef<Record<string, HTMLButtonElement | null>>({});

  const refreshRoot = useCallback(async () => {
    const next = await fetchGraph('/api/workflows');
    setRoot(next);
    setLastRefresh(new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setError('');
  }, []);

  const refreshAll = useCallback(async () => {
    await refreshRoot();
    const entries = Object.entries(branches);
    const refreshed = await Promise.all(entries.map(async ([id, cache]) => [id, cache.url, await fetchGraph(cache.url)] as const));
    if (refreshed.length > 0) {
      setBranches((current) => {
        const next = { ...current };
        for (const [id, url, graph] of refreshed) next[id] = { url, graph };
        return next;
      });
    }
  }, [branches, refreshRoot]);

  useEffect(() => {
    void refreshRoot().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [refreshRoot]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshAll().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [refreshAll]);


  const allData = useMemo(() => {
    const nodeById = new Map<string, AtlasNode>();
    const links: AtlasLink[] = [];
    for (const graph of [root, ...Object.values(branches).map((cache) => cache.graph)]) {
      for (const node of graph.nodes) nodeById.set(node.id, node);
      links.push(...graph.links);
    }
    return { nodes: [...nodeById.values()], links };
  }, [branches, root]);

  const visibleData = useMemo(() => {
    const rootIds = new Set(root.nodes.map((node) => node.id));
    const visibleIds = new Set(rootIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of allData.nodes) {
        if (visibleIds.has(node.id) || !node.parentId) continue;
        if (visibleIds.has(node.parentId) && expanded.has(node.parentId)) {
          visibleIds.add(node.id);
          changed = true;
        }
      }
    }
    return {
      nodes: allData.nodes.filter((node) => visibleIds.has(node.id)),
      links: allData.links.filter((link) => visibleIds.has(link.source) && visibleIds.has(link.target)),
    };
  }, [allData, expanded, root.nodes]);

  const layout = useMemo(() => createAtlasLayout(visibleData.nodes), [visibleData.nodes]);

  const centerNode = useCallback((nodeId: string) => {
    window.requestAnimationFrame(() => {
      const viewport = mapViewportRef.current;
      const element = nodeElements.current[nodeId];
      if (!viewport || !element) return;
      viewport.scrollTo({
        left: Math.max(0, element.offsetLeft - viewport.clientWidth / 2),
        top: Math.max(0, element.offsetTop - viewport.clientHeight / 2),
        behavior: 'smooth',
      });
    });
  }, []);

  useEffect(() => {
    if (visibleData.nodes.length === 0) return;
    centerNode(selectedId);
  }, [centerNode, selectedId, visibleData.nodes.length]);

  const selected = allData.nodes.find((node) => node.id === selectedId) ?? root.nodes[0];
  const selectedLinks = selected
    ? allData.links.filter((link) => link.source === selected.id || link.target === selected.id)
    : [];
  const matches = query.trim()
    ? visibleData.nodes.filter((node) => `${node.label} ${node.summary}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  const branchUrl = (node: AtlasNode): string | null => {
    if (node.expandKind === 'branch' && node.expandKey) return `/api/workflows?branch=${encodeURIComponent(node.expandKey)}`;
    if (node.expandKind === 'repo' && node.expandKey) return `/api/workflows?repo=${encodeURIComponent(node.expandKey)}`;
    return null;
  };

  const expandNode = useCallback(async (node: AtlasNode) => {
    if (!node.expandable) return;
    if (node.expandKind === 'inline') {
      setExpanded((current) => new Set(current).add(node.id));
      return;
    }
    const url = branchUrl(node);
    if (!url) return;
    if (!branches[node.id]) {
      setLoadingIds((current) => new Set(current).add(node.id));
      try {
        const graph = await fetchGraph(url);
        setBranches((current) => ({ ...current, [node.id]: { url, graph } }));
        setError('');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      } finally {
        setLoadingIds((current) => {
          const next = new Set(current);
          next.delete(node.id);
          return next;
        });
      }
    }
    setExpanded((current) => new Set(current).add(node.id));
  }, [branches]);

  const collapseNode = useCallback((nodeId: string) => {
    setExpanded((current) => {
      const childrenByParent = new Map<string, string[]>();
      for (const node of allData.nodes) {
        if (!node.parentId) continue;
        const children = childrenByParent.get(node.parentId) ?? [];
        children.push(node.id);
        childrenByParent.set(node.parentId, children);
      }

      const next = new Set(current);
      const pending = [nodeId];
      while (pending.length > 0) {
        const currentId = pending.pop();
        if (!currentId) continue;
        next.delete(currentId);
        pending.push(...(childrenByParent.get(currentId) ?? []));
      }
      return next;
    });
  }, [allData.nodes]);

  const toggleNode = (node: AtlasNode) => {
    if (!node.expandable) return;
    if (expanded.has(node.id)) {
      collapseNode(node.id);
    } else {
      void expandNode(node);
    }
  };

  const focusNode = (node: AtlasNode) => {
    setSelectedId(node.id);
    setQuery('');
    centerNode(node.id);
  };

  const onNodeClick = (node: AtlasNode) => {
    focusNode(node);
    toggleNode(node);
  };


  const activeCount = visibleData.nodes.filter((node) => node.status === 'active').length;
  const warningCount = visibleData.nodes.filter((node) => node.status === 'warning').length;

  return (
    <div className="workflow-atlas">
      <section className="workflow-hud">
        <div>
          <div className="workflow-kicker">SYSTEM CARTOGRAPHY / LIVE EVIDENCE</div>
          <h1>WORKFLOW ATLAS</h1>
          <p>Recursive map of projects, resident agents, live machinery, and the flows connecting their stacks.</p>
        </div>
        <div className="workflow-stats">
          <div><strong>{visibleData.nodes.length}</strong><span>VISIBLE NODES</span></div>
          <div><strong>{activeCount}</strong><span>ACTIVE</span></div>
          <div><strong>{warningCount}</strong><span>DRIFT</span></div>
          <div><strong>{lastRefresh || '—'}</strong><span>LAST SCAN</span></div>
        </div>
      </section>

      <div className="workflow-main">
        <section className="workflow-map">
          <div className="workflow-toolbar">
            <div className="workflow-search-wrap">
              <input
                className="workflow-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search visible worlds, residents, flows, symbols…"
                aria-label="Search workflow atlas"
              />
              {matches.length > 0 && (
                <div className="workflow-search-results">
                  {matches.map((node) => (
                    <button key={node.id} type="button" onClick={() => focusNode(node)}>
                      <span>{node.label}</span><small>{node.kind}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="workflow-control"
              onClick={() => {
                const realm = root.nodes.find((node) => node.id === 'system:realm');
                if (realm) focusNode(realm);
              }}
            >
              CENTER ROOT
            </button>
            <button type="button" className="workflow-control" onClick={() => void refreshAll().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))}>RESCAN</button>
          </div>
          <div className="workflow-legend">
            {Object.entries(COLOR_BY_KIND).map(([kind, color]) => (
              <span key={kind}><i style={{ background: color }} />{kind}</span>
            ))}
          </div>
          {root.nodes.length > 0 ? (
            <div className="workflow-dom-viewport" ref={mapViewportRef}>
              <div
                className="workflow-dom-world"
                style={{ width: layout.width, height: layout.height }}
              >
                <svg
                  className="workflow-dom-edges"
                  width={layout.width}
                  height={layout.height}
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  aria-hidden="true"
                >
                  <defs>
                    <marker id="workflow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
                      <path d="M 0 0 L 8 4 L 0 8 z" fill="#76879a" />
                    </marker>
                  </defs>
                  {visibleData.links.map((link, index) => {
                    const source = layout.positions.get(link.source);
                    const target = layout.positions.get(link.target);
                    if (!source || !target) return null;
                    const midpoint = (source.x + target.x) / 2;
                    return (
                      <path
                        key={`${link.source}-${link.target}-${index}`}
                        className={`workflow-dom-edge workflow-dom-edge-${link.status} ${link.certainty === 'inferred' ? 'workflow-dom-edge-inferred' : ''}`}
                        d={`M ${source.x} ${source.y} C ${midpoint} ${source.y}, ${midpoint} ${target.y}, ${target.x} ${target.y}`}
                        markerEnd="url(#workflow-arrow)"
                      />
                    );
                  })}
                </svg>
                {layout.nodes.map(({ node, x, y }) => {
                  const style: NodeStyle = {
                    left: x,
                    top: y,
                    '--node-color': COLOR_BY_KIND[node.kind],
                  };
                  const state = loadingIds.has(node.id)
                    ? 'LOADING'
                    : expanded.has(node.id)
                      ? 'OPEN'
                      : node.status;
                  return (
                    <button
                      key={node.id}
                      ref={(element) => {
                        nodeElements.current[node.id] = element;
                      }}
                      type="button"
                      className={[
                        'workflow-map-node',
                        `workflow-map-node-${node.kind}`,
                        `workflow-map-node-${node.status}`,
                        selectedId === node.id ? 'workflow-map-node-selected' : '',
                      ].filter(Boolean).join(' ')}
                      style={style}
                      onClick={() => onNodeClick(node)}
                      aria-pressed={selectedId === node.id}
                      aria-label={`${node.label}, ${node.kind}, ${state}`}
                      title={`${node.label} · ${node.summary}`}
                    >
                      <span className="workflow-map-node-status" aria-hidden="true" />
                      <span className="workflow-map-node-title">{node.label}</span>
                      <span className="workflow-map-node-meta">{node.kind} · {state}</span>
                      {node.expandable && (
                        <span className="workflow-map-node-expand" aria-hidden="true">
                          {loadingIds.has(node.id) ? '…' : expanded.has(node.id) ? '−' : '+'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="workflow-loading">SCANNING SYSTEM WORLD…</div>
          )}
          <div className="workflow-map-hint">REAL BUTTONS · CLICK TO INSPECT + TOGGLE · SCROLL TO NAVIGATE</div>
        </section>

        <aside className="workflow-inspector">
          {selected ? (
            <>
              <div className="workflow-inspector-head">
                <span className={`workflow-status workflow-status-${selected.status}`}>{selected.status}</span>
                <span>{selected.kind}</span>
              </div>
              <h2>{selected.label}</h2>
              {selected.metric && <div className="workflow-metric">{loadingIds.has(selected.id) ? 'LOADING…' : selected.metric}</div>}
              <p className="workflow-summary">{selected.summary}</p>

              {selected.expandable && (
                <button
                  type="button"
                  className="workflow-branch-action"
                  disabled={loadingIds.has(selected.id)}
                  onClick={() => toggleNode(selected)}
                >
                  {loadingIds.has(selected.id) ? 'OPENING BRANCH…' : expanded.has(selected.id) ? 'COLLAPSE BRANCH' : 'ENTER BRANCH'}
                </button>
              )}

              <section className="workflow-inspector-section">
                <h3>INTELLIGENCE</h3>
                <dl>
                  {Object.entries(selected.details).map(([key, value]) => (
                    <React.Fragment key={key}>
                      <dt>{key.replaceAll(/([A-Z])/g, ' $1')}</dt>
                      <dd>{value === null ? 'unknown' : String(value)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </section>

              <section className="workflow-inspector-section">
                <h3>RELATIONSHIPS <span>{selectedLinks.length}</span></h3>
                <div className="workflow-relations">
                  {selectedLinks.slice(0, 24).map((link, index) => {
                    const sourceId = link.source;
                    const otherId = sourceId === selected.id ? link.target : sourceId;
                    const other = allData.nodes.find((node) => node.id === otherId);
                    return (
                      <button key={`${sourceId}-${otherId}-${index}`} type="button" onClick={() => other && focusNode(other)}>
                        <span>{sourceId === selected.id ? '→' : '←'} {link.label}</span>
                        <strong>{other?.label ?? otherId}</strong>
                        {link.certainty === 'inferred' && <small>INFERRED</small>}
                      </button>
                    );
                  })}
                  {selectedLinks.length === 0 && <p className="workflow-empty">No loaded relationships.</p>}
                </div>
              </section>

              <section className="workflow-provenance">
                <h3>PROVENANCE</h3>
                <p>{selected.source}</p>
                <small>{selected.updatedAt ? `observed ${selected.updatedAt}` : 'observation time unavailable'}</small>
              </section>
            </>
          ) : (
            <div className="workflow-empty">Select a node to inspect it.</div>
          )}
          {error && <div className="workflow-error">{error}</div>}
        </aside>
      </div>
    </div>
  );
}
