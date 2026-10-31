import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Server, CheckCircle, XCircle, HelpCircle, RefreshCw, X, Container, Boxes, Terminal, Database, Layers } from 'lucide-react';
import serverApi from '../services/api';
import metricsApi from '../services/metricsApi';
import agentApi from '../services/agentApi';
import Loading from '../components/common/Loading';
import Alert from '../components/common/Alert';

const RANGES = [
  { hours: 1, label: '1h' },
  { hours: 6, label: '6h' },
  { hours: 24, label: '24h' },
  { hours: 168, label: '7d' }
];

const SERIES_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const STATUS_COLOR = {
  online: 'var(--success-500)',
  offline: 'var(--error-500)',
  other: 'var(--text-tertiary)'
};
const STATUS_LABEL = { online: 'Online', offline: 'Offline', other: 'Unknown / disabled' };
const STATUS_ORDER = { offline: 0, other: 1, online: 2 };

/* ------------------------------------------------------------------ */
/*  Détection agent (Docker / Kubernetes / DB) à partir des paquets     */
/* ------------------------------------------------------------------ */
const DETECTION = [
  {
    key: 'docker',
    label: 'Docker',
    icon: Container,
    color: '#3b82f6',
    test: (n) => /^(docker-ce|docker-ce-cli|docker\.io|docker-engine|docker-desktop|docker desktop.*|podman)$/.test(n)
  },
  {
    key: 'k8s_node',
    label: 'Kubernetes node',
    icon: Boxes,
    color: '#8b5cf6',
    test: (n) => /^(kubelet|kubeadm|k3s|microk8s|rke2.*)$/.test(n)
  },
  {
    key: 'k8s_client',
    label: 'Kubernetes client',
    icon: Terminal,
    color: '#06b6d4',
    test: (n) => n === 'kubectl'
  },
  {
    key: 'db',
    label: 'Databases',
    icon: Database,
    color: '#f59e0b',
    test: (n) =>
      /^(postgresql(-\d+(\.\d+)?)?|postgresql-server|mysql-server(-.*)?|mysql-community-server|mariadb-server(-.*)?|mongodb-org(-server)?|mongodb-server|redis-server|mssql-server|percona-server-server.*)$/.test(n)
  }
];
// containerd est une dépendance de Docker : compté "runtime seul" uniquement sans Docker.
const RUNTIME = {
  key: 'runtime',
  label: 'Container runtime (no Docker)',
  icon: Layers,
  color: '#10b981',
  test: (n) => /^(containerd|containerd\.io|cri-o|crio)$/.test(n)
};
const CATEGORIES = [...DETECTION, RUNTIME];

const toPackageList = (d) => (Array.isArray(d) ? d : d?.packages || d?.items || []);

const classifyPackages = (packages) => {
  const matches = {};
  const seen = new Set();
  packages.forEach((p) => {
    const name = String(p?.name || '').toLowerCase();
    if (!name || seen.has(name)) return;
    seen.add(name);
    DETECTION.forEach((rule) => {
      if (rule.test(name)) (matches[rule.key] = matches[rule.key] || []).push(p.name);
    });
    if (RUNTIME.test(name)) (matches.runtime = matches.runtime || []).push(p.name);
  });
  if (matches.docker) delete matches.runtime;
  return matches;
};

const runPool = async (items, limit, worker) => {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await worker(item);
      }
    })
  );
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const statusKey = (s) => (s.enabled && s.status === 'online' ? 'online' : s.enabled && s.status === 'offline' ? 'offline' : 'other');

// L'API renvoie des datetimes UTC naïfs (datetime.utcnow) : on force le 'Z'.
const parseUtc = (v) => {
  if (!v) return null;
  const s = String(v);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtSince = (v) => {
  const d = parseUtc(v);
  if (!d) return '—';
  const m = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

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
/*  Donut online / offline / other                                      */
/* ------------------------------------------------------------------ */
const StatusDonut = ({ counts, onSelect }) => {
  const R = 52;
  const C = 2 * Math.PI * R;
  const total = counts.online + counts.offline + counts.other;
  const segs = ['online', 'offline', 'other'].map((k) => ({ key: k, value: counts[k] }));
  let acc = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 140 140" style={{ width: 150, height: 150, flexShrink: 0 }}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--border-light)" strokeWidth="18" />
        {total > 0 &&
          segs.map((s) => {
            if (s.value === 0) return null;
            const len = (s.value / total) * C;
            const el = (
              <circle
                key={s.key}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={STATUS_COLOR[s.key]}
                strokeWidth="18"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-acc}
                transform="rotate(-90 70 70)"
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(s.key)}
              >
                <title>{`${STATUS_LABEL[s.key]}: ${s.value}`}</title>
              </circle>
            );
            acc += len;
            return el;
          })}
        <text x="70" y="68" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--text-primary)" className="font-mono">
          {total}
        </text>
        <text x="70" y="86" textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">
          servers
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
        {segs.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect(s.key)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: STATUS_COLOR[s.key] }} />
            {STATUS_LABEL[s.key]}
            <strong className="font-mono" style={{ marginLeft: 'auto', paddingLeft: '1rem', color: 'var(--text-primary)' }}>
              {s.value}
            </strong>
          </button>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Drawer latéral : liste de serveurs                                  */
/* ------------------------------------------------------------------ */
const ServerDrawer = ({ drawer, onClose }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100vw)',
          height: '100%',
          overflowY: 'auto',
          background: 'var(--bg-primary)',
          borderLeft: '1px solid var(--border-light)',
          boxShadow: 'var(--shadow-sm)',
          padding: '1.25rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{drawer.title}</h2>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
              {drawer.items.length} server{drawer.items.length > 1 ? 's' : ''}
              {drawer.subtitle ? ` · ${drawer.subtitle}` : ''}
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {drawer.items.length === 0 && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
            No server in this category.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {drawer.items.map((s) => (
            <div
              key={s.id}
              style={{ border: '1px solid var(--border-light)', borderLeft: `4px solid ${STATUS_COLOR[s.state]}`, borderRadius: '0.5rem', padding: '0.625rem 0.75rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.9375rem' }}>{s.name}</strong>
                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: STATUS_COLOR[s.state], fontWeight: 600 }}>
                  {STATUS_LABEL[s.state]}
                </span>
              </div>
              <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.125rem' }}>
                {s.ip_address || s.hostname || '—'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.375rem' }}>
                <span>Response: <b className="font-mono">{s.response_time != null ? `${Math.round(s.response_time)} ms` : '—'}</b></span>
                <span>In state: <b className="font-mono">{fmtSince(s.last_status_change)}</b></span>
                <span>Last check: <b className="font-mono">{parseUtc(s.last_check)?.toLocaleTimeString() || '—'}</b></span>
                {s.protocols && <span>Proto: <b className="font-mono">{Array.isArray(s.protocols) ? s.protocols.join(', ') : String(s.protocols)}</b></span>}
              </div>
              {s.extra && s.extra.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                  {s.extra.map((e) => (
                    <span key={e} className="font-mono" style={{ fontSize: '0.6875rem', padding: '0.125rem 0.375rem', borderRadius: 4, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                      {e}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
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

  const [inventory, setInventory] = useState({}); // { [serverId]: { agent: bool, matches: {cat: [pkg]} } }
  const [scanning, setScanning] = useState(false);
  const [scanTick, setScanTick] = useState(0);
  const [drawer, setDrawer] = useState(null);

  const closeDrawer = useCallback(() => setDrawer(null), []);

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

  // Inventaire agent : indépendant de la période, rafraîchi toutes les 5 min ou à la demande.
  const serverKey = (data?.servers || []).map((s) => s.id).join(',');
  useEffect(() => {
    if (!serverKey) return undefined;
    let cancelled = false;

    const scan = async () => {
      setScanning(true);
      const result = {};
      await runPool(serverKey.split(','), 4, async (id) => {
        try {
          const res = await agentApi.getPackages(id);
          const list = toPackageList(res.data);
          result[id] = { agent: list.length > 0, matches: classifyPackages(list) };
        } catch (e) {
          result[id] = { agent: false, matches: {} };
        }
      });
      if (!cancelled) {
        setInventory(result);
        setScanning(false);
      }
    };

    scan();
    const id = setInterval(scan, 300000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [serverKey, scanTick]);

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

  const servers = useMemo(() => data?.servers || [], [data]);

  const categoryServers = useMemo(() => {
    const out = {};
    CATEGORIES.forEach((c) => {
      out[c.key] = servers
        .filter((s) => inventory[s.id]?.matches?.[c.key])
        .map((s) => ({ ...s, state: statusKey(s), extra: inventory[s.id].matches[c.key] }));
    });
    return out;
  }, [servers, inventory]);

  const agentCount = useMemo(() => servers.filter((s) => inventory[s.id]?.agent).length, [servers, inventory]);

  const availabilityRows = useMemo(
    () =>
      [...servers].sort((a, b) => {
        if (a.availability == null && b.availability == null) return a.name.localeCompare(b.name);
        if (a.availability == null) return 1;
        if (b.availability == null) return -1;
        return a.availability - b.availability;
      }),
    [servers]
  );

  if (loading) {
    return <Loading message="Loading Dashboard..." />;
  }

  const counts = data?.counts || { total: 0, online: 0, offline: 0, other: 0 };

  const openStatus = (key) => {
    const items = servers
      .map((s) => ({ ...s, state: statusKey(s) }))
      .filter((s) => key === 'all' || s.state === key)
      .sort((a, b) => STATUS_ORDER[a.state] - STATUS_ORDER[b.state] || a.name.localeCompare(b.name));
    setDrawer({ title: key === 'all' ? 'All servers' : STATUS_LABEL[key], items });
  };

  const openCategory = (cat) => {
    setDrawer({
      title: cat.label,
      subtitle: 'detected from agent packages',
      items: categoryServers[cat.key]
    });
  };

  const statsCards = [
    { key: 'all', title: 'Total Servers', value: counts.total, icon: Server, color: 'var(--primary-500)', bgColor: 'var(--primary-50)', borderColor: 'var(--primary-200)' },
    { key: 'online', title: 'Online', value: counts.online, icon: CheckCircle, color: 'var(--success-500)', bgColor: 'var(--success-50)', borderColor: 'var(--success-200)' },
    { key: 'offline', title: 'Offline', value: counts.offline, icon: XCircle, color: 'var(--error-500)', bgColor: 'var(--error-50)', borderColor: 'var(--error-200)' },
    { key: 'other', title: 'Unknown / disabled', value: counts.other, icon: HelpCircle, color: 'var(--text-tertiary)', bgColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)' }
  ];

  const maxCoverage = Math.max(1, servers.length);

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.5rem' }}>Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Monitor and manage your server infrastructure · updated {new Date(updatedAt).toLocaleTimeString()}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            {RANGES.map((r) => (
              <button key={r.hours} onClick={() => setHours(r.hours)} className={hours === r.hours ? 'btn btn-primary' : 'btn btn-secondary'}>
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={handleCheckAllServers} disabled={checking} className="btn btn-success">
            <RefreshCw size={18} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking...' : 'Check All'}
          </button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* KPI cards (cliquables) */}
      <div className="grid grid-cols-4" style={{ marginBottom: '2rem' }}>
        {statsCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              type="button"
              key={stat.key}
              onClick={() => openStatus(stat.key)}
              className="card card-interactive"
              style={{
                borderLeft: `4px solid ${stat.color}`,
                backgroundColor: stat.bgColor,
                borderColor: stat.borderColor,
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{stat.title}</p>
                  <h2 className="font-mono" style={{ fontSize: '2.25rem', fontWeight: 700, color: stat.color, lineHeight: 1 }}>
                    {stat.value}
                  </h2>
                </div>
                <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <Icon size={24} style={{ color: stat.color }} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Fleet status + inventaire agent */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card">
          <div className="card-header">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Fleet status</h2>
          </div>
          <StatusDonut counts={counts} onSelect={openStatus} />
        </div>

        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Detected by agents</h2>
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                {agentCount}/{servers.length} servers with package data
              </p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setScanTick((t) => t + 1)} disabled={scanning} title="Rescan packages">
              <RefreshCw size={16} className={scanning ? 'animate-spin' : ''} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => openCategory(cat)}
                  className="card-interactive"
                  style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border-light)', borderTop: `3px solid ${cat.color}`, borderRadius: '0.5rem', padding: '0.625rem 0.75rem', background: 'var(--bg-secondary)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    <Icon size={14} style={{ color: cat.color }} />
                    {cat.label}
                  </div>
                  <div className="font-mono" style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2, color: 'var(--text-primary)' }}>
                    {categoryServers[cat.key].length}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {CATEGORIES.map((cat) => {
              const n = categoryServers[cat.key].length;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => openCategory(cat)}
                  style={{ display: 'grid', gridTemplateColumns: '150px 1fr 32px', alignItems: 'center', gap: '0.75rem', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text-secondary)', textAlign: 'left' }}
                >
                  <span>{cat.label}</span>
                  <span style={{ height: 10, borderRadius: 5, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${(n / maxCoverage) * 100}%`, background: cat.color, borderRadius: 5 }} />
                  </span>
                  <strong className="font-mono" style={{ textAlign: 'right', color: 'var(--text-primary)' }}>{n}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Temps de réponse */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Response time</h2>
        </div>
        <ResponseChart series={data?.series || []} hours={hours} rangeEnd={updatedAt} bucketSeconds={data?.bucket_seconds || 60} />
      </div>

      {/* Disponibilité par serveur (pire → meilleur) */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Availability</h2>
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>worst first · last {hours >= 24 ? `${hours / 24}d` : `${hours}h`}</p>
        </div>
        {availabilityRows.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', padding: '1rem 0', textAlign: 'center' }}>No server yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 420, overflowY: 'auto' }}>
            {availabilityRows.map((s) => {
              const a = s.availability;
              const color = a == null ? 'var(--text-tertiary)' : a >= 99 ? 'var(--success-500)' : a >= 95 ? '#f59e0b' : 'var(--error-500)';
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 200px) 1fr 64px', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>
                    {s.name}
                  </span>
                  <span style={{ height: 10, borderRadius: 5, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${a ?? 0}%`, background: color, borderRadius: 5 }} />
                  </span>
                  <strong className="font-mono" style={{ textAlign: 'right', color }}>{a == null ? 'n/a' : `${a.toFixed(1)}%`}</strong>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {drawer && <ServerDrawer drawer={drawer} onClose={closeDrawer} />}
    </div>
  );
};

export default Dashboard;