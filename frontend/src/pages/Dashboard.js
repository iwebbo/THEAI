import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Server, CheckCircle, XCircle, HelpCircle, RefreshCw, Plus } from 'lucide-react';
import serverApi from '../services/api';
import metricsApi from '../services/metricsApi';
import StatusBadge from '../components/common/StatusBadge';
import Loading from '../components/common/Loading';
import Alert from '../components/common/Alert';

const RANGES = [
  { hours: 1, label: '1h' },
  { hours: 6, label: '6h' },
  { hours: 24, label: '24h' },
  { hours: 168, label: '7d' }
];

const SERIES_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');

const formatTick = (ms, hours) => {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return hours > 24 ? `${d.getDate()}/${d.getMonth() + 1} ${time}` : time;
};

const niceMax = (v) => {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

const availabilityColor = (value) => {
  if (value >= 99) return 'var(--success-500)';
  if (value >= 95) return '#ca8a04';
  return 'var(--error-500)';
};

/* ------------------------------------------------------------------ */
/*  Graphe temps de réponse (SVG, sans dépendance)                      */
/* ------------------------------------------------------------------ */
const ResponseChart = ({ series, hours, rangeEnd, bucketSeconds }) => {
  const [hover, setHover] = useState(null);

  const W = 900;
  const H = 280;
  const PL = 52;
  const PR = 16;
  const PT = 12;
  const PB = 28;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;

  const tMax = rangeEnd;
  const tMin = tMax - hours * 3600 * 1000;

  const allValues = series.flatMap((s) => s.points.map((p) => p[1]));
  if (allValues.length === 0) {
    return (
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
        No response time data for this period yet.
      </p>
    );
  }

  const yMax = niceMax(Math.max(...allValues));
  const x = (t) => PL + ((t - tMin) / (tMax - tMin)) * plotW;
  const y = (v) => PT + plotH - (v / yMax) * plotH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => r * yMax);
  const xTicks = [0, 1, 2, 3, 4, 5].map((i) => tMin + (i / 5) * (tMax - tMin));

  const onMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xv = ((e.clientX - rect.left) / rect.width) * W;
    if (xv < PL || xv > W - PR) {
      setHover(null);
      return;
    }
    const t = tMin + ((xv - PL) / plotW) * (tMax - tMin);
    const tolerance = bucketSeconds * 1000;
    const rows = [];
    series.forEach((s, i) => {
      let best = null;
      s.points.forEach((p) => {
        if (best === null || Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
      });
      if (best && Math.abs(best[0] - t) <= tolerance) {
        rows.push({ name: s.name, value: best[1], color: SERIES_COLORS[i % SERIES_COLORS.length] });
      }
    });
    setHover({ xv, t, rows });
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="var(--border-light)" strokeWidth="1" />
              <text x={PL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-tertiary)">
                {Math.round(v)} ms
              </text>
            </g>
          ))}

          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-tertiary)">
              {formatTick(t, hours)}
            </text>
          ))}

          {series.map((s, i) => (
            <polyline
              key={s.server_id}
              fill="none"
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth="1.75"
              strokeLinejoin="round"
              points={s.points.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')}
            />
          ))}

          {hover && (
            <line x1={hover.xv} x2={hover.xv} y1={PT} y2={PT + plotH} stroke="var(--text-tertiary)" strokeDasharray="4 3" />
          )}
        </svg>

        {hover && hover.rows.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: `${(hover.xv / W) * 100}%`,
              transform: hover.xv > W * 0.7 ? 'translateX(-105%)' : 'translateX(8px)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-light)',
              borderRadius: '0.5rem',
              boxShadow: 'var(--shadow-sm)',
              padding: '0.5rem 0.75rem',
              fontSize: '0.75rem',
              pointerEvents: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            <div style={{ color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
              {new Date(hover.t).toLocaleString()}
            </div>
            {hover.rows.map((r) => (
              <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: r.color }} />
                <span>{r.name}</span>
                <strong className="font-mono" style={{ marginLeft: 'auto' }}>{r.value} ms</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.75rem', fontSize: '0.75rem' }}>
        {series.map((s, i) => (
          <span key={s.server_id} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-secondary)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Disponibilité par serveur (barres horizontales)                    */
/* ------------------------------------------------------------------ */
const AvailabilityPanel = ({ servers }) => {
  const rows = servers.filter((s) => s.availability !== null);

  if (rows.length === 0) {
    return (
      <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
        No check history for this period yet.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {rows.map((s) => (
        <div key={s.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.813rem', marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{s.name}</span>
            <span className="font-mono" style={{ color: availabilityColor(s.availability) }}>
              {s.availability.toFixed(2)}%
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${s.availability}%`,
                height: '100%',
                backgroundColor: availabilityColor(s.availability),
                transition: 'width 300ms ease'
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const Dashboard = () => {
  const [hours, setHours] = useState(6);
  const [data, setData] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await metricsApi.getOverview(hours);
      setData(response.data);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      setError('Error loading dashboard: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const handleCheckAllServers = async () => {
    try {
      setChecking(true);
      await serverApi.checkAllServers();
      await load();
    } catch (err) {
      setError('Error during checking servers: ' + (err.response?.data?.detail || err.message));
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <Loading message="Loading Dashboard..." />;
  }

  const counts = data?.counts || { total: 0, online: 0, offline: 0, other: 0 };
  const servers = data?.servers || [];

  const statsCards = [
    {
      title: 'Total Servers',
      value: counts.total,
      icon: Server,
      color: 'var(--primary-500)',
      bgColor: 'var(--primary-50)',
      borderColor: 'var(--primary-200)'
    },
    {
      title: 'Online',
      value: counts.online,
      icon: CheckCircle,
      color: 'var(--success-500)',
      bgColor: 'var(--success-50)',
      borderColor: 'var(--success-200)'
    },
    {
      title: 'Offline',
      value: counts.offline,
      icon: XCircle,
      color: 'var(--error-500)',
      bgColor: 'var(--error-50)',
      borderColor: 'var(--error-200)'
    },
    {
      title: 'Unknown / disabled',
      value: counts.other,
      icon: HelpCircle,
      color: 'var(--text-tertiary)',
      bgColor: 'var(--bg-tertiary)',
      borderColor: 'var(--border-light)'
    }
  ];

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <h1 style={{ marginBottom: '0.5rem' }}>Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Monitor and manage your server infrastructure · updated {new Date(updatedAt).toLocaleTimeString()}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            {RANGES.map((r) => (
              <button
                key={r.hours}
                onClick={() => setHours(r.hours)}
                className={hours === r.hours ? 'btn btn-primary' : 'btn btn-secondary'}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Link to="/servers/new" className="btn btn-primary">
            <Plus size={18} />
            Add Server
          </Link>
          <button onClick={handleCheckAllServers} disabled={checking} className="btn btn-success">
            <RefreshCw size={18} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking...' : 'Check All'}
          </button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* Stat cards */}
      <div className="grid grid-cols-4" style={{ marginBottom: '2rem' }}>
        {statsCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="card card-interactive"
              style={{
                borderLeft: `4px solid ${stat.color}`,
                backgroundColor: stat.bgColor,
                borderColor: stat.borderColor
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    {stat.title}
                  </p>
                  <h2
                    className="font-mono"
                    style={{ fontSize: '2.25rem', fontWeight: 700, color: stat.color, lineHeight: 1 }}
                  >
                    {stat.value}
                  </h2>
                </div>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <Icon size={24} style={{ color: stat.color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Disponibilité + temps de réponse */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 2fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card">
          <div className="card-header">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Availability</h2>
          </div>
          <AvailabilityPanel servers={servers} />
        </div>

        <div className="card">
          <div className="card-header">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Response time</h2>
          </div>
          <ResponseChart
            series={data?.series || []}
            hours={hours}
            rangeEnd={updatedAt}
            bucketSeconds={data?.bucket_seconds || 60}
          />
        </div>
      </div>

      {/* Tableau serveurs */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Servers</h2>
        </div>

        {servers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
            <Server size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
            <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '0.5rem' }}>No servers yet</p>
            <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Get started by adding your first server to monitor
            </p>
            <Link to="/servers/new" className="btn btn-primary">
              <Plus size={18} />
              Add Your First Server
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.625rem' }}>Server</th>
                  <th style={{ padding: '0.625rem' }}>IP</th>
                  <th style={{ padding: '0.625rem' }}>Protocols</th>
                  <th style={{ padding: '0.625rem' }}>Status</th>
                  <th style={{ padding: '0.625rem' }}>Response</th>
                  <th style={{ padding: '0.625rem' }}>Last check</th>
                  <th style={{ padding: '0.625rem' }}>Last change</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => (
                  <tr key={server.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.625rem' }}>
                      <Link to={`/servers/${server.id}`} style={{ textDecoration: 'none' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{server.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{server.hostname}</div>
                      </Link>
                    </td>
                    <td className="font-mono" style={{ padding: '0.625rem' }}>{server.ip_address}</td>
                    <td style={{ padding: '0.625rem', color: 'var(--text-secondary)' }}>{server.protocols}</td>
                    <td style={{ padding: '0.625rem' }}>
                      <StatusBadge status={server.status} />
                    </td>
                    <td className="font-mono" style={{ padding: '0.625rem' }}>
                      {server.response_time != null ? `${server.response_time} ms` : '-'}
                    </td>
                    <td style={{ padding: '0.625rem', color: 'var(--text-secondary)' }}>
                      {formatDateTime(server.last_check)}
                    </td>
                    <td style={{ padding: '0.625rem', color: 'var(--text-secondary)' }}>
                      {formatDateTime(server.last_status_change)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
