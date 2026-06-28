import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  id: string;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultCollapsed?: boolean;
}

const STORAGE_KEY = 'aperture-panel-collapsed';

function readCollapsed(id: string, defaultValue: boolean): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultValue;
    const map = JSON.parse(stored) as Record<string, boolean>;
    return id in map ? map[id] : defaultValue;
  } catch {
    return defaultValue;
  }
}

function writeCollapsed(id: string, value: boolean): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const map = stored ? (JSON.parse(stored) as Record<string, boolean>) : {};
    map[id] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function CollapsiblePanel({ id, title, meta, children, defaultCollapsed = false }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    setCollapsed(readCollapsed(id, defaultCollapsed));
  }, [id, defaultCollapsed]);

  const toggle = () => setCollapsed((c) => {
    const next = !c;
    writeCollapsed(id, next);
    return next;
  });

  return (
    <section className="panel" aria-labelledby={id}>
      <div
        className="section-head section-head-collapsible"
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(); }}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
      >
        <div className="label" id={id}>{title}</div>
        <div className="section-head-right">
          {meta}
          <span className="collapse-chevron">{collapsed ? '▶' : '▼'}</span>
        </div>
      </div>
      {!collapsed && children}
    </section>
  );
}
