import React, { useEffect, useRef, useState } from 'react';

export const pages = [
  { id: 'command-center', label: 'Command center', icon: 'grid', description: 'Review incidents, evidence and coordinated actions.' },
  { id: 'incident-history', label: 'Incident history', icon: 'document', description: 'Browse saved incidents, evidence and decision reviews.' },
  { id: 'simulation-lab', label: 'Simulation Studio', icon: 'signal', description: 'Compose an incident from selected device signals.' },
  { id: 'alexa-sim', label: 'Alexa+', icon: 'voice', description: 'Explore incident coordination through the Alexa+ web simulator.' },
  { id: 'check-in', label: 'Household', icon: 'people', description: 'Review incident-specific check-ins and requests for help.' },
  { id: 'handoff', label: 'Handoff', icon: 'document', description: 'Prepare a summary of the evidence and recorded response.' },
  { id: 'settings', label: 'Settings', icon: 'grid', description: 'Manage locations, simulation devices and action permissions.' },
  { id: 'guide', label: 'User guide', icon: 'help', description: 'A quick guide to your workspace.' },
];

const paths = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  signal: 'M3 12h4l3-8 4 16 3-8h4',
  voice: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z M5 11v1a7 7 0 0 0 14 0v-1 M12 19v3 M8 22h8',
  people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-2a7 7 0 0 1 14 0v2 M17 4a4 4 0 0 1 0 8 M19 15a5 5 0 0 1 3 5',
  document: 'M14 2H5v20h14V7z M14 2v5h5 M8 12h8 M8 16h8',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17h.01',
};

export function Icon({ name }) {
  return <svg className="app-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.grid}/></svg>;
}

export default function AppShell({ page, navigate, authenticated, config, onAuth, selected, selectedName, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const heading = useRef(null);
  const previousPage = useRef(page);
  const current = pages.find(item => item.id === page);
  useEffect(() => {
    document.title = `${current?.label || 'Page not found'} · Aenea`;
    if (previousPage.current !== page) {
      setMenuOpen(false);
      heading.current?.focus();
      previousPage.current = page;
    }
  }, [page, current]);
  function follow(event, id) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setMenuOpen(false);
    if (page === id) heading.current?.focus();
    navigate(id);
  }
  return <div className="app">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar">
      <div className="brand-row"><a className="brand" href="/command-center" onClick={event => follow(event, 'command-center')}>aenea<span>HOUSEHOLD COORDINATION</span></a>
        <button className="menu-toggle" aria-expanded={menuOpen} aria-controls="workspace-navigation" onClick={() => setMenuOpen(open => !open)}>Menu</button></div>
      <nav id="workspace-navigation" className={menuOpen ? 'navigation is-open' : 'navigation'} aria-label="Workspace" onKeyDown={event => {
        if (event.key === 'Escape') { setMenuOpen(false); document.querySelector('.menu-toggle')?.focus(); }
      }}>
        {pages.map(item => <a key={item.id} href={'/' + item.id} aria-current={page === item.id ? 'page' : undefined} onClick={event => follow(event, item.id)}><Icon name={item.icon}/>{item.label}</a>)}
      </nav>
      <div className="sidebar-footer"><span className="mode-label">Simulation workspace</span><p>A shared picture.<br/>A coordinated response.</p></div>
    </aside>
    <main id="main-content" tabIndex={-1}>
      <header className="page-header"><div><span className="eyebrow">AENEA WORKSPACE</span><h1 ref={heading} tabIndex={-1}>{current?.label || 'Page not found'}</h1><p className="page-description">{current?.description || 'This address does not match a workspace page.'}</p></div>
        <div className="header-actions"><span className="mode-label">Simulated</span><button disabled={!config} onClick={onAuth}>{authenticated ? 'Sign out' : 'Sign in'}</button></div>
      </header>
      {authenticated && !['guide', 'command-center'].includes(page) && current && <div className="context-bar"><span>Incident context</span><strong>{selected ? selectedName : 'No incident selected'}</strong><a href="/incident-history" onClick={event => follow(event, 'incident-history')}>View history</a></div>}
      {current ? children : <section className="card empty-state"><h2>Let’s get you back to the workspace</h2><button className="primary" onClick={() => navigate('command-center')}>Open command center</button></section>}
      <footer className="workspace-footer">Simulated incident coordination. Follow official alarms and emergency guidance.</footer>
    </main>
  </div>;
}
