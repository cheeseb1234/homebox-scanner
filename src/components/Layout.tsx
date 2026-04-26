import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSession } from '../state/session';

interface LayoutProps {
  title: string;
  children: ReactNode;
  rightAction?: ReactNode;
}

const navItems = [
  { to: '/scan', label: 'Scan', icon: '▣' },
  { to: '/create', label: 'Create', icon: '+' },
  { to: '/locations', label: 'Locations', icon: '⌂' },
  { to: '/tags', label: 'Tags', icon: '#' },
  { to: '/setup', label: 'Setup', icon: '⚙' }
];

export function Layout({ title, children, rightAction }: LayoutProps): JSX.Element {
  const { session } = useSession();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <Link to="/scan" className="brand-link">
            {import.meta.env.VITE_APP_TITLE || 'homebox-scanner'}
          </Link>
          <div className="subtle-text">{session.connection?.baseUrl || 'Not connected'}</div>
        </div>
        <div>{rightAction}</div>
      </header>

      <main className="page-content">
        <div className="page-title-row">
          <h1>{title}</h1>
        </div>
        {children}
      </main>

      <nav className="bottom-nav">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className="nav-pill nav-pill-labeled">
            <span className="nav-pill-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-pill-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
