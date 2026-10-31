import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle, XCircle, AlertTriangle, Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import metricsApi from '../services/metricsApi';
import StatusBadge from '../components/common/StatusBadge';
import Loading from '../components/common/Loading';
import Alert from '../components/common/Alert';

const REFRESH_MS = 30000;
const LOW_SAMPLES = 10;
const TARGETS = [95, 99, 99.5, 99.9];
const DEFAULT_TARGET = 99;
const TARGET_STORAGE_KEY = 'sla_target';

const RANGES = [
  { hours: 1, label: '1h' },
  { hours: 6, label: '6h' },
  { hours: 24, label: '24h' },
  { hours: 168, label: '7d' }
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const readTarget = () => {
  try {
    const v = parseFloat(localStorage.getItem(TARGET_STORAGE_KEY));
    return TARGETS.includes(v) ? v : DEFAULT_TARGET;
  } catch (e) {
    return DEFAULT_TARGET;
  }
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');

const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined) return '-';
  const m = Math.round(minutes);
  if (m < 1) return '< 1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
};

const splitProtocols = (value) =>
  String(value || '')
    .split(/[\s,;|]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

// OK = objectif atteint, proche = à moins d'1 point de l'objectif, sinon rouge
const slaColor = (availability, target) => {
  if (availability === null || availability === undefined) return 'var(--text-tertiary)';
  if (availability >= target) return 'var(--success-500)';
  if (availability >= target - 1) return '#ca8a04';
  return 'var(--error-500)';
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

const Badge = ({ bg, fg, children, title }) => (
  <span
    title={title}
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

const COMPLIANCE_META = {
  met: { label: 'Target met', bg: '#dcfce7', fg: '#166534' },
  breached: { label: 'Breached', bg: '#fee2e2', fg: '#991b1b' },
  nodata: { label: 'No data', bg: '#e5e7eb', fg: '#374151' }
};

const COLUMNS = [
  { key: 'name', label: 'Server' },
  { key: 'availability', label: 'Availability' },
  { key: 'compliance', label: 'SLA' },
  { key: 'downMin', label: 'Est. downtime' },
  { key: 'checks', label: 'Checks' },
  { key: 'status', label: 'Current status' },
  { key: 'lastChangeTs', label: 'Last change' }
];

const NUMERIC_KEYS = ['availability', 'downMin', 'checks', 'lastChangeTs'];

const sortValue = (row, key) => {
  const v = row[key];
  if (v === null || v === undefined) return NUMERIC_KEYS.includes(key) ? -1 : '';
  return typeof v === 'string' ? v.toLowerCase() : v;
};

/* ------------------------------------------------------------------ */
/*  Barre de disponibilité avec repère d'objectif                      */
/* ------------------------------------------------------------------ */
const AvailabilityBar = ({ value, target }) => {
  if (value === null || value === undefined) {
    return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
  }
  const color = slaColor(value, target);
  return (
    <div style={{ minWidth: 180 }}>
      <div className="font-mono" style={{ fontSize: '0.813rem', color, marginBottom: '0.25rem' }}>
        {value.toFixed(2)}%
      </div>
      <div style={{ position: 'relative', height: 8, borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: '100%', backgroundColor: color, transition: 'width 300ms ease' }} />
        <div
          title={`Target ${target}%`}
          style={{ position: 'absolute', top: 0, bottom: 0, left: `${target}%`, width: 2, backgroundColor: 'var(--text-primary)', opacity: 0.6 }}
        />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const SLA = () => {
  const [hours, setHours] = useState(24);
  const [target, setTarget] = useState(readTarget);
  const [servers, setServers] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [fProto, setFProto] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fCompliance, setFCompliance] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);
  const [sortKey, setSortKey] = useState('availability');
  const [sortDir, setSortDir] = useState('asc');

  const load = useCallback(async () => {
    try {
      const response = await metricsApi.getOverview(hours);
      setServers(response.data?.servers || []);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      setError('Error loading SLA: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const changeTarget = (value) => {
    setTarget(value);
    try {
      localStorage.setItem(TARGET_STORAGE_KEY, String(value));
    } catch (e) {
      /* stockage indisponible : l'objectif reste valable pour la session */
    }
  };

  const rows = useMemo(
    () =>
      servers.map((s) => {
        const availability = s.availability ?? null;
        const checks = Number(s.checks ?? 0);
        const hasData = availability !== null && checks > 0;
        return {
          id: s.id,
          name: s.name || `Server #${s.id}`,
          hostname: s.hostname || '',
          protocols: s.protocols || '',
          protoList: splitProtocols(s.protocols),
          enabled: s.enabled !== false,
          status: s.status || 'unknown',
          availability: hasData ? availability : null,
          checks,
          downMin: hasData ? ((100 - availability) / 100) * hours * 60 : null,
          compliance: !hasData ? 'nodata' : availability >= target ? 'met' : 'breached',
          lastChange: s.last_status_change,
          lastChangeTs: s.last_status_change ? new Date(s.last_status_change).getTime() : null
        };
      }),
    [servers, hours, target]
  );

  // Périmètre (recherche, protocole, statut, désactivés) : sert aux KPI
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showDisabled && !r.enabled) return false;
      if (fProto && !r.protoList.includes(fProto)) return false;
      if (fStatus && r.status !== fStatus) return false;
      if (q && !`${r.name} ${r.hostname}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, fProto, fStatus, showDisabled]);

  // Tableau : périmètre + filtre de conformité + tri
  const visible = useMemo(() => {
    const out = fCompliance ? scoped.filter((r) => r.compliance === fCompliance) : scoped.slice();
    const dir = sortDir === 'asc' ? 1 : -1;
    return out.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [scoped, fCompliance, sortKey, sortDir]);

  if (loading) {
    return <Loading message="Loading SLA..." />;
  }

  /* ---- KPI (sur le périmètre filtré) ---- */
  const withData = scoped.filter((r) => r.compliance !== 'nodata');
  const met = withData.filter((r) => r.compliance === 'met').length;
  const breached = withData.filter((r) => r.compliance === 'breached');
  const noData = scoped.length - withData.length;

  const totalChecks = withData.reduce((sum, r) => sum + r.checks, 0);
  const globalAvailability =
    totalChecks > 0 ? withData.reduce((sum, r) => sum + r.availability * r.checks, 0) / totalChecks : null;

  const worst = withData.reduce((min, r) => (min === null || r.availability < min.availability ? r : min), null);

  const kpis = [
    {
      title: 'Global availability',
      value: globalAvailability !== null ? `${globalAvailability.toFixed(2)}%` : '-',
      sub: `weighted by checks · target ${target}%`,
      icon: Activity,
      color: slaColor(globalAvailability, target)
    },
    {
      title: 'Meeting target',
      value: `${met}/${withData.length}`,
      sub: noData > 0 ? `${noData} without data` : `servers ≥ ${target}%`,
      icon: CheckCircle,
      color: withData.length > 0 && met === withData.length ? 'var(--success-500)' : 'var(--text-secondary)'
    },
    {
      title: 'Breaching target',
      value: breached.length,
      sub: breached.length > 0 ? `below ${target}% over ${RANGES.find((r) => r.hours === hours)?.label}` : 'none',
      icon: XCircle,
      color: breached.length > 0 ? 'var(--error-500)' : 'var(--success-500)'
    },
    {
      title: 'Lowest availability',
      value: worst ? `${worst.availability.toFixed(2)}%` : '-',
      sub: worst ? worst.name : 'no data',
      icon: AlertTriangle,
      color: worst ? slaColor(worst.availability, target) : 'var(--text-tertiary)'
    }
  ];

  const protocolOptions = Array.from(new Set(rows.flatMap((r) => r.protoList))).sort();
  const statusOptions = Array.from(new Set(rows.map((r) => r.status))).sort();

  const hasFilters = search || fProto || fStatus || fCompliance || showDisabled;
  const clearFilters = () => {
    setSearch('');
    setFProto('');
    setFStatus('');
    setFCompliance('');
    setShowDisabled(false);
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
          <h1 style={{ marginBottom: '0.5rem' }}>SLA</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Availability against your target, per server · updated {new Date(updatedAt).toLocaleTimeString()}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Target
            <select value={target} onChange={(e) => changeTarget(parseFloat(e.target.value))} style={controlStyle}>
              {TARGETS.map((t) => (
                <option key={t} value={t}>{t}%</option>
              ))}
            </select>
          </label>
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
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* KPI */}
      <div className="grid grid-cols-4" style={{ marginBottom: '2rem' }}>
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.title} className="card" style={{ borderLeft: `4px solid ${k.color}` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    {k.title}
                  </p>
                  <h2 className="font-mono" style={{ fontSize: '2.25rem', fontWeight: 700, color: k.color, lineHeight: 1 }}>
                    {k.value}
                  </h2>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {k.sub}
                  </p>
                </div>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    flexShrink: 0,
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <Icon size={24} style={{ color: k.color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tableau */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            Availability{' '}
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.875rem' }}>
              ({visible.length}/{rows.length})
            </span>
          </h2>
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search server or hostname..."
              style={{ ...controlStyle, width: '100%', paddingLeft: '2rem', boxSizing: 'border-box' }}
            />
          </div>
          <select value={fProto} onChange={(e) => setFProto(e.target.value)} style={controlStyle}>
            <option value="">All protocols</option>
            {protocolOptions.map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
          </select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={controlStyle}>
            <option value="">All status</option>
            {statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={fCompliance} onChange={(e) => setFCompliance(e.target.value)} style={controlStyle}>
            <option value="">All SLA states</option>
            {Object.entries(COMPLIANCE_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} />
            Show disabled
          </label>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="btn btn-secondary">
              <X size={14} />
              Clear
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', padding: '1.5rem 0', textAlign: 'center' }}>
            {rows.length === 0 ? 'No check history for this period yet.' : 'No server matches the filters.'}
          </p>
        ) : (
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
                  const cm = COMPLIANCE_META[r.compliance];
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border-light)', opacity: r.enabled ? 1 : 0.6 }}>
                      <td style={{ padding: '0.625rem' }}>
                        <Link to={`/servers/${r.id}`} style={{ textDecoration: 'none' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {r.name}
                            {!r.enabled && (
                              <span style={{ marginLeft: '0.5rem' }}>
                                <Badge bg="#e5e7eb" fg="#374151">disabled</Badge>
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            {r.hostname}
                            {r.protocols ? ` · ${r.protocols}` : ''}
                          </div>
                        </Link>
                      </td>
                      <td style={{ padding: '0.625rem' }}>
                        <AvailabilityBar value={r.availability} target={target} />
                      </td>
                      <td style={{ padding: '0.625rem' }}>
                        <Badge bg={cm.bg} fg={cm.fg}>{cm.label}</Badge>
                      </td>
                      <td className="font-mono" style={{ padding: '0.625rem', whiteSpace: 'nowrap' }}>
                        {formatDuration(r.downMin)}
                      </td>
                      <td className="font-mono" style={{ padding: '0.625rem', whiteSpace: 'nowrap' }}>
                        {r.checks}
                        {r.checks > 0 && r.checks < LOW_SAMPLES && (
                          <span style={{ marginLeft: '0.5rem' }}>
                            <Badge bg="#fef9c3" fg="#854d0e" title="Too few checks for a reliable figure">low data</Badge>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.625rem' }}>
                        <StatusBadge status={r.status} />
                      </td>
                      <td style={{ padding: '0.625rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {formatDateTime(r.lastChange)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '1rem' }}>
          Downtime is estimated from the share of failed checks over the selected period. The vertical mark on each bar is the target.
        </p>
      </div>
    </div>
  );
};

export default SLA;