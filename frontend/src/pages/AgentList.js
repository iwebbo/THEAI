import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, CheckCircle, AlertTriangle, Clock, RefreshCw, Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import agentApi from '../services/agentApi';
import Loading from '../components/common/Loading';
import Alert from '../components/common/Alert';

const REFRESH_MS = 30000;
const FETCH_PAGE = 100;
const PAGE_SIZE = 25;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const fetchAll = async (fn) => {
  let all = [];
  let offset = 0;
  for (let i = 0; i < 100; i += 1) {
    const res = await fn(FETCH_PAGE, offset);
    const d = res.data;
    const items = Array.isArray(d) ? d : d?.items || [];
    all = all.concat(items);
    const total = Array.isArray(d) ? null : d?.total;
    offset += FETCH_PAGE;
    if (items.length < FETCH_PAGE || (total != null && all.length >= total)) break;
  }
  return all;
};

// Les dates backend sont en UTC, parfois sans suffixe de fuseau
const parseUtc = (v) => {
  if (!v) return null;
  const s = String(v);
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const d = new Date(hasTz ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const timeAgo = (d, now) => {
  if (!d) return '-';
  const s = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const computeStatus = (a, lastSeen, interval, now) => {
  const enrolled = a.enrolled !== undefined ? !!a.enrolled : Boolean(a.enrolled_at || a.last_seen);
  if (!enrolled) return 'pending';
  if (a.online !== undefined) return a.online ? 'online' : 'stale';
  if (!lastSeen) return 'stale';
  const maxAge = Math.max(interval * 3, 90) * 1000;
  return now - lastSeen.getTime() <= maxAge ? 'online' : 'stale';
};

const STATUS_META = {
  online: { label: 'Online', bg: '#dcfce7', fg: '#166534' },
  stale: { label: 'No heartbeat', bg: '#fee2e2', fg: '#991b1b' },
  pending: { label: 'Not enrolled', bg: '#e5e7eb', fg: '#374151' }
};

const normalize = (a, now) => {
  const id = a.server_id ?? a.id;
  const interval = a.interval_seconds ?? 30;
  const lastSeen = parseUtc(a.last_seen);
  return {
    id,
    serverName: a.server_name ?? a.server?.name ?? `Server #${id}`,
    hostname: a.agent_hostname ?? a.hostname ?? '',
    osFamily: a.os_family ?? '',
    arch: a.arch ?? '',
    version: a.agent_version ?? a.version ?? '',
    ip: a.remote_ip ?? '',
    interval,
    lastSeen,
    enrolledAt: parseUtc(a.enrolled_at),
    status: computeStatus(a, lastSeen, interval, now)
  };
};

const countBy = (rows, key) => {
  const m = new Map();
  rows.forEach((r) => {
    const k = r[key] || 'unknown';
    m.set(k, (m.get(k) || 0) + 1);
  });
  return Array.from(m, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

const controlStyle = {
  padding: '0.4rem 0.625rem',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  color: 'var(--text-primary)',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-light)',
  borderRadius: '0.375rem',
  minWidth: 0
};

const Badge = ({ bg, fg, children }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '0.125rem 0.5rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: 600,
      background: bg,
      color: fg,
      whiteSpace: 'nowrap'
    }}
  >
    {children}
  </span>
);

/* ------------------------------------------------------------------ */
/*  Graphe : barres horizontales (cliquables = filtre)                 */
/* ------------------------------------------------------------------ */
const BarList = ({ title, data, color, selected, onSelect }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="card">
      <div className="card-header">
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{title}</h2>
      </div>
      {data.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No data.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {data.slice(0, 8).map((d) => {
            const active = selected === d.label;
            return (
              <button
                key={d.label}
                type="button"
                onClick={() => onSelect(active ? '' : d.label)}
                title={active ? 'Clear filter' : `Filter on ${d.label}`}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'block',
                  opacity: selected && !active ? 0.45 : 1
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: active ? 700 : 500 }}>{d.label}</span>
                  <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{d.value}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(d.value / max) * 100}%`,
                      height: '100%',
                      backgroundColor: color,
                      transition: 'width 300ms ease'
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const COLUMNS = [
  { key: 'serverName', label: 'Server' },
  { key: 'hostname', label: 'Hostname' },
  { key: 'osFamily', label: 'OS family' },
  { key: 'arch', label: 'Arch' },
  { key: 'version', label: 'Agent version' },
  { key: 'status', label: 'Status' },
  { key: 'lastSeen', label: 'Last seen' },
  { key: 'enrolledAt', label: 'Enrolled' },
  { key: 'ip', label: 'Remote IP' }
];

const DATE_KEYS = ['lastSeen', 'enrolledAt'];

const sortValue = (row, key) => {
  const v = row[key];
  if (DATE_KEYS.includes(key)) return v ? v.getTime() : 0;
  if (typeof v === 'string') return v.toLowerCase();
  return v ?? '';
};

const AgentList = () => {
  const [agents, setAgents] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [fOs, setFOs] = useState('');
  const [fArch, setFArch] = useState('');
  const [fVersion, setFVersion] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [sortKey, setSortKey] = useState('serverName');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    try {
      const items = await fetchAll((limit, offset) => agentApi.listAgents(limit, offset));
      setAgents(items);
      setNow(Date.now());
      setError(null);
    } catch (err) {
      setError('Error loading agents: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const rows = useMemo(() => agents.map((a) => normalize(a, now)), [agents, now]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (fOs && (r.osFamily || 'unknown') !== fOs) return false;
      if (fArch && (r.arch || 'unknown') !== fArch) return false;
      if (fVersion && (r.version || 'unknown') !== fVersion) return false;
      if (fStatus && r.status !== fStatus) return false;
      if (q && !`${r.serverName} ${r.hostname} ${r.ip}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return out.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [rows, search, fOs, fArch, fVersion, fStatus, sortKey, sortDir]);

  if (loading) {
    return <Loading message="Loading Agents..." />;
  }

  const total = rows.length;
  const online = rows.filter((r) => r.status === 'online').length;
  const stale = rows.filter((r) => r.status === 'stale').length;
  const pending = rows.filter((r) => r.status === 'pending').length;

  const statsCards = [
    { title: 'Agents', value: total, icon: Cpu, color: 'var(--primary-500)', bgColor: 'var(--primary-50)', borderColor: 'var(--primary-200)' },
    { title: 'Online', value: online, icon: CheckCircle, color: 'var(--success-500)', bgColor: 'var(--success-50)', borderColor: 'var(--success-200)' },
    { title: 'No heartbeat', value: stale, icon: AlertTriangle, color: 'var(--error-500)', bgColor: 'var(--error-50)', borderColor: 'var(--error-200)' },
    { title: 'Not enrolled', value: pending, icon: Clock, color: 'var(--text-tertiary)', bgColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)' }
  ];

  const versionData = countBy(rows, 'version');
  const osData = countBy(rows, 'osFamily');
  const archData = countBy(rows, 'arch');

  const osOptions = osData.map((d) => d.label);
  const archOptions = archData.map((d) => d.label);
  const versionOptions = versionData.map((d) => d.label);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const withReset = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const hasFilters = search || fOs || fArch || fVersion || fStatus;
  const clearFilters = () => {
    setSearch('');
    setFOs('');
    setFArch('');
    setFVersion('');
    setFStatus('');
    setPage(0);
  };

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

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
          <h1 style={{ marginBottom: '0.5rem' }}>Agents</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Installed agents, versions and platforms · updated {new Date(now).toLocaleTimeString()}
          </p>
        </div>
        <button onClick={load} className="btn btn-secondary">
          <RefreshCw size={18} />
          Refresh
        </button>
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
                  <h2 className="font-mono" style={{ fontSize: '2.25rem', fontWeight: 700, color: stat.color, lineHeight: 1 }}>
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

      {/* Graphes (cliquables = filtre) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}
      >
        <BarList title="Agent versions" data={versionData} color="#3b82f6" selected={fVersion} onSelect={withReset(setFVersion)} />
        <BarList title="OS family" data={osData} color="#10b981" selected={fOs} onSelect={withReset(setFOs)} />
        <BarList title="Architecture" data={archData} color="#8b5cf6" selected={fArch} onSelect={withReset(setFArch)} />
      </div>

      {/* Tableau */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            Agents <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.875rem' }}>({filtered.length}/{total})</span>
          </h2>
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => withReset(setSearch)(e.target.value)}
              placeholder="Search server, hostname, IP..."
              style={{ ...controlStyle, width: '100%', paddingLeft: '2rem', boxSizing: 'border-box' }}
            />
          </div>
          <select value={fOs} onChange={(e) => withReset(setFOs)(e.target.value)} style={controlStyle}>
            <option value="">All OS</option>
            {osOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={fArch} onChange={(e) => withReset(setFArch)(e.target.value)} style={controlStyle}>
            <option value="">All arch</option>
            {archOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={fVersion} onChange={(e) => withReset(setFVersion)(e.target.value)} style={controlStyle}>
            <option value="">All versions</option>
            {versionOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={fStatus} onChange={(e) => withReset(setFStatus)(e.target.value)} style={controlStyle}>
            <option value="">All status</option>
            {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="btn btn-secondary">
              <X size={14} />
              Clear
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
            <Cpu size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
            <p style={{ fontSize: '1rem', fontWeight: 500 }}>
              {total === 0 ? 'No agents yet' : 'No agent matches the filters'}
            </p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        onClick={() => toggleSort(c.key)}
                        style={{ padding: '0.625rem', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                      >
                        {c.label}
                        {sortKey === c.key && (
                          sortDir === 'asc'
                            ? <ChevronUp size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                            : <ChevronDown size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const meta = STATUS_META[r.status];
                    return (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.625rem' }}>
                          <Link to={`/servers/${r.id}`} style={{ textDecoration: 'none', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {r.serverName}
                          </Link>
                        </td>
                        <td className="font-mono" style={{ padding: '0.625rem' }}>{r.hostname || '-'}</td>
                        <td style={{ padding: '0.625rem', color: 'var(--text-secondary)' }}>{r.osFamily || '-'}</td>
                        <td className="font-mono" style={{ padding: '0.625rem' }}>{r.arch || '-'}</td>
                        <td className="font-mono" style={{ padding: '0.625rem' }}>{r.version || '-'}</td>
                        <td style={{ padding: '0.625rem' }}>
                          <Badge bg={meta.bg} fg={meta.fg}>{meta.label}</Badge>
                        </td>
                        <td
                          style={{ padding: '0.625rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                          title={r.lastSeen ? r.lastSeen.toLocaleString() : ''}
                        >
                          {timeAgo(r.lastSeen, now)}
                        </td>
                        <td style={{ padding: '0.625rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {r.enrolledAt ? r.enrolledAt.toLocaleString() : '-'}
                        </td>
                        <td className="font-mono" style={{ padding: '0.625rem' }}>{r.ip || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <span>
                Page {currentPage + 1} / {pages}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                  Previous
                </button>
                <button className="btn btn-secondary" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AgentList;