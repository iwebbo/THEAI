import React, { useState } from 'react';
import { Activity, ExternalLink } from 'lucide-react';
import useTheme from '../hooks/useTheme';

const DASHBOARDS = [
  { uid: 'theai-monitoring', label: 'Monitoring' },
  { uid: 'theai-cve', label: 'CVE Intelligence' }
];

// Grafana est servi sur /grafana/ par le même nginx que le frontend.
// Le thème Grafana suit le thème de l'application (dark / light).
const DashboardsPage = () => {
  const [current, setCurrent] = useState(DASHBOARDS[0]);
  const { theme } = useTheme();

  return (
    <div className="animate-fadeIn">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem'
        }}
      >
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <Activity size={20} style={{ color: 'var(--primary-600)' }} />
          Dashboards
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {DASHBOARDS.map((d) => (
            <button
              key={d.uid}
              onClick={() => setCurrent(d)}
              className={current.uid === d.uid ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            >
              {d.label}
            </button>
          ))}
          <a
            href={`/grafana/d/${current.uid}?theme=${theme}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem' }}
          >
            Open in Grafana <ExternalLink size={14} />
          </a>
        </div>
      </div>

      <iframe
        key={`${current.uid}-${theme}`}
        title={current.label}
        src={`/grafana/d/${current.uid}?orgId=1&theme=${theme}&kiosk`}
        style={{
          width: '100%',
          height: 'calc(100vh - 170px)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-card)',
          backgroundColor: 'var(--bg-surface)'
        }}
      />
    </div>
  );
};

export default DashboardsPage;
