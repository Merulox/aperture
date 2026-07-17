import React, { useCallback, useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

interface GraphNode {
  id: string;
  name: string;
  kind: string;
  file: string;
  community: string;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
}

interface GraphData {
  repo: string;
  nodes: GraphNode[];
  links: GraphLink[];
}

const PALETTE = [
  '#5aa7e8', '#e8a05a', '#6fd08c', '#d06f9c', '#a58ae8',
  '#e8d05a', '#5ad0c8', '#e86f6f', '#8ab4a5', '#c8925a',
];

function communityColor(community: string): string {
  if (community === 'none') return '#666';
  let hash = 0;
  for (let index = 0; index < community.length; index++) {
    hash = (hash * 31 + community.charCodeAt(index)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const KIND_SIZE: Record<string, number> = { File: 5, Class: 5, Function: 3, Method: 2.5 };

export default function CodeGraph() {
  const [repos, setRepos] = useState<string[]>([]);
  const [repo, setRepo] = useState<string>('');
  const [data, setData] = useState<GraphData | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [width, setWidth] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/gitnexus', { cache: 'no-store' })
      .then((response) => response.json())
      .then((status) => {
        const names = status.repos.map((entry: { name: string }) => entry.name);
        setRepos(names);
        if (names.length > 0) setRepo((current) => current || names[0]);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.floor(entries[0].contentRect.width));
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!repo) return;
    setState('loading');
    fetch(`/api/gitnexus-graph?repo=${encodeURIComponent(repo)}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((graph) => {
        setData(graph);
        setState('idle');
      })
      .catch((error) => {
        console.error(error);
        setState('error');
      });
  }, [repo]);

  const nodeLabel = useCallback(
    (node: GraphNode) => `${node.name} · ${node.kind}<br/>${node.file}`,
    [],
  );

  return (
    <section className="panel panel-wide code-graph-panel">
      <div className="section-head">
        <span className="label">graph</span>
        <span className="section-head-right">
          {state === 'loading' && <span className="badge badge-yellow">loading</span>}
          {state === 'error' && <span className="badge badge-red">error</span>}
          {data && state === 'idle' && (
            <span className="badge badge-muted">{data.nodes.length} nodes · {data.links.length} edges</span>
          )}
          <select className="code-graph-select" value={repo} onChange={(event) => setRepo(event.target.value)}>
            {repos.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </span>
      </div>
      <div className="code-graph-canvas" ref={containerRef}>
        {data && (
          <ForceGraph2D
            graphData={data as any}
            width={width}
            height={620}
            backgroundColor="rgba(0,0,0,0)"
            nodeLabel={nodeLabel as any}
            nodeVal={(node: any) => KIND_SIZE[node.kind] ?? 3}
            nodeColor={(node: any) => communityColor(node.community)}
            linkColor={(link: any) => (link.type === 'CALLS' ? 'rgba(120,170,220,0.35)' : 'rgba(255,255,255,0.08)')}
            linkWidth={(link: any) => (link.type === 'CALLS' ? 1 : 0.5)}
            cooldownTicks={200}
            warmupTicks={50}
          />
        )}
        {!data && state !== 'error' && <p className="state-entry">— loading graph —</p>}
        {state === 'error' && <p className="state-entry">— graph unavailable —</p>}
      </div>
    </section>
  );
}
