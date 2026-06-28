import { useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  id: string;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  defaultCollapsed?: boolean;
}

export function CollapsiblePanel({ id, title, meta, children, defaultCollapsed = false }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = () => setCollapsed((c) => !c);

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
