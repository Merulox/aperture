import React from 'react';
import { NAV } from '../lib/nav';

interface NavProps {
  page: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function Nav({ page, subtitle, children }: NavProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <img src="/aperture-logo.png" alt="" className="brand-logo" />
        <span>aperture{subtitle ? ` / ${subtitle}` : ''}</span>
      </div>
      <div className="meta">
        {NAV.map(({ id, href, label, external }) =>
          page === id
            ? <span key={id} className="nav-current">{label}</span>
            : <a key={id} href={href} className="nav-link" {...(external ? { target: '_blank', rel: 'noopener' } : {})}>{label}</a>
        )}
        {children}
      </div>
    </header>
  );
}
