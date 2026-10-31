import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Server,
  Cpu,
  XCircle,
  ShieldAlert,
  Clock,
  CheckCircle,
  RefreshCw,
  Search,
  X,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import metricsApi from '../services/metricsApi';
import agentApi from '../services/agentApi';
import StatusBadge from '../components/common/StatusBadge';
import Loading from '../components/common/Loading';
import Alert from '../components/common/Alert';

const REFRESH_MS = 60000;
const VULNS_CACHE_MS = 300000;
const FETCH_PAGE = 100;
const PAGE_SIZE = 25;
const AVAILABILITY_HOURS = 24;
// collected_at ne bouge que lorsque la liste de paquets change : seuil volontairement large
const STALE_INVENTORY_DAYS = 7;

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

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');

const availabilityColor = (value) => {
  if (value >= 99) return 'var(--success-500)';
  if (value >= 95) return '#ca8a04';
  return 'var(--error-500)';
};

const computeAgentState = (a, now) => {
  if (!a) return 'none';
  const enrolled = a.enrolled !== undefined ? !!a.enrolled : Boolean(a.enrolled_at || a.last_seen);
  if (!enrolled) return 'pending';
  if (a.online !== undefined) return a.online ? 'online' : 'stale';
  const lastSeen = parseUtc(a.last_seen);
  if (!lastSeen) return 'stale';
  const interval = a.interval_seconds ?? 30;
  return now - lastSeen.getTime() <= Math.max(interval * 3, 90) * 1000 ? 'online' : 'stale';
};

const AGENT_META = {
  online: { label: 'Online', bg: '#dcfce7', fg: '#166534', rank: 3 },
  stale: { label: 'No heartbeat', bg: '#fee2e2', fg: '#991b1b', rank: 2 },
  pending: { label: 'Not enrolled', bg: '#fef9c3', fg: '#854d0e', rank: 1 },
  none: { label: 'No agent', bg: '#e5e7eb', fg: '#374151', rank: 0 }
};

const VULN_META = {
  ok: { label: 'Analysed', bg: '#dcfce7', fg: '#166534' },
  pending: { label: 'Pending', bg: '#fef9c3', fg: '#854d0e' },
  unsupported: { label: 'Unsupported', bg: '#e5e7eb', fg: '#374151' },
  error: { label: 'Error', bg: '#fee2e2', fg: '#991b1b' },
  none: { label: 'No inventory', bg: '#f3f4f6', fg: '#6b7280' }
};

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const SEVERITY_COLORS = {
  critical: ['#fee2e2', '#991b1b'],
  high: ['#ffedd5', '#9a3412'],
  medium: ['#fef9c3', '#854d0e'],
  low: ['#dcfce7', '#166534']
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

const BarList = ({ title, data, color, selected, onSelect }) => {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="card">
      <div className="card-header">
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{title}</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {data.map((d) => {
          const active = selected === d.key;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => onSelect(active ? '' : d.key)}
              title={active ? 'Clear filter' : `Filter on ${d.label}`}
              style={{ all: 'unset', cursor: 'pointer', display: 'block', opacity: selected && !active ? 0.45 : 1 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: active ? 700 : 500 }}>{d.label}</span>
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{d.value}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', backgroundColor: color, transition: 'width 300ms ease' }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Filtres rapides (cartes KPI) + colonnes                            */
/* ------------------------------------------------------------------ */
const QUICK_LABELS = {
  agentok: 'Servers with online agent',
  noagent: 'Servers without agent',
  vulns: 'Servers with vulnerabilities',
  stale: `Inventory older than ${STALE_INVENTORY_DAYS} days`,
  attention: 'Needs attention'
};

const QUICK_FILTERS = {
  agentok: (r) => r.agentState === 'online',
  noagent: (r) => r.agentState === 'none' || r.agentState === 'pending',
  vulns: (r) => r.vulnCount > 0,
  stale: (r) => r.inventoryStale,
  attention: (r) => r.reasons.length > 0
};

const COLUMNS = [
  { key: 'name', label: 'Server' },
  { key: 'ip', label: 'IP' },
  { key: 'status', label: 'Status' },
  { key: 'responseTime', label: 'Response' },
  { key: 'availability', label: `Avail. ${AVAILABILITY_HOURS}h` },
  { key: 'agentRank', label: 'Agent' },
  { key: 'os', label: 'OS' },
  { key: 'pkgCount', label: 'Packages' },
  { key: 'vulnCount', label: 'Vulns' },
  { key: 'collectedTs', label: 'Inventory' },
  { key: 'lastCheckTs', label: 'Last check' }
];

const NUMERIC_KEYS = ['responseTime', 'availability', 'agentRank', 'pkgCount', 'vulnCount', 'collectedTs', 'lastCheckTs'];

const sortValue = (row, key) => {
  const v = row[key];
  if (v === null || v === undefined) return NUMERIC_KEYS.includes(key) ? -1 : '';
  return typeof v === 'string' ? v.toLowerCase() : v;
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const Overview = () => {
  const [overview, setOverview] = useState(null);
  const [agents, setAgents] = useState([]);
  const [inventories, setInventories] = useState([]);
  const [vulns, setVulns] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);

  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fAgent, setFAgent] = useState('');
  const [fVuln, setFVuln] = useState('');
  const [fOs, setFOs] = useState('');
  const [quick, setQuick] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);

  const vulnsCache = useRef({ at: 0, data: [] });

  const load = useCallback(async (force = false) => {
    const needVulns = force || Date.now() - vulnsCache.current.at > VULNS_CACHE_MS;
    const [ovR, agR, invR, vuR] = await Promise.allSettled([
      metricsApi.getOverview(AVAILABILITY_HOURS),
      fetchAll((limit, offset) => agentApi.listAgents(limit, offset)),
      fetchAll((limit, offset) => agentApi.listInventories(limit, offset)),
      needVulns
        ? fetchAll((limit, offset) => agentApi.getAllVulns(limit, offset))
        : Promise.resolve(vulnsCache.current.data)
    ]);

    const warn = [];

    if (ovR.status === 'fulfilled') {
      setOverview(ovR.value.data);
      setError(null);
    } else {
      const err = ovR.reason;
      setError('Error loading servers: ' + (err.response?.data?.detail || err.message));
    }

    if (agR.status === 'fulfilled') setAgents(agR.value);
    else warn.push('agents');

    if (invR.status === 'fulfilled') setInventories(invR.value);
    else warn.push('inventory');

    if (vuR.status === 'fulfilled') {
      if (needVulns) vulnsCache.current = { at: Date.now(), data: vuR.value };
      setVulns(vuR.value);
    } else {
      warn.push('vulnerabilities');
    }

    setWarnings(warn);
    setNow(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  /* ---- Jointure par server_id ---- */
  const rows = useMemo(() => {
    const servers = overview?.servers || [];

    const agentById = new Map();
    agents.forEach((a) => agentById.set(a.server_id ?? a.id, a));

    const invById = new Map();
    inventories.forEach((i) => invById.set(i.server_id ?? i.id, i));

    const vulnById = new Map();
    vulns.forEach((v) => {
      const cur = vulnById.get(v.server_id) || { count: 0, kev: 0, maxSev: '' };
      cur.count += 1;
      if (v.kev) cur.kev += 1;
      const sev = (v.severity || '').toLowerCase();
      if ((SEVERITY_RANK[sev] || 0) > (SEVERITY_RANK[cur.maxSev] || 0)) cur.maxSev = sev;
      vulnById.set(v.server_id, cur);
    });

    const staleMs = STALE_INVENTORY_DAYS * 86400 * 1000;

    return servers.map((s) => {
      const agent = agentById.get(s.id) || null;
      const inv = invById.get(s.id) || null;
      const vu = vulnById.get(s.id) || { count: 0, kev: 0, maxSev: '' };

      const agentState = computeAgentState(agent, now);
      const collectedAt = inv ? parseUtc(inv.collected_at) : null;
      const inventoryStale = !!collectedAt && now - collectedAt.getTime() > staleMs;
      const vulnStatus = inv ? inv.vuln_status || 'pending' : 'none';
      const vulnCount = inv ? Number(inv.vuln_count ?? 0) : vu.count;
      const osPretty = inv ? inv.os_pretty || inv.os_id || '' : '';

      const reasons = [];
      if (s.status === 'offline') reasons.push({ label: 'Offline', bg: '#fee2e2', fg: '#991b1b', weight: 100 });
      if (vu.kev > 0) reasons.push({ label: `KEV ${vu.kev}`, bg: '#fee2e2', fg: '#991b1b', weight: 90 });
      if (agentState === 'stale') reasons.push({ label: 'Agent no heartbeat', bg: '#ffedd5', fg: '#9a3412', weight: 70 });
      if (vulnCount > 0) reasons.push({ label: `${vulnCount} vulns`, bg: '#ffedd5', fg: '#9a3412', weight: 50 });
      if (vulnStatus === 'error') reasons.push({ label: 'CVE analysis error', bg: '#fef9c3', fg: '#854d0e', weight: 40 });
      if (inventoryStale) reasons.push({ label: 'Stale inventory', bg: '#fef9c3', fg: '#854d0e', weight: 20 });

      return {
        id: s.id,
        name: s.name || `Server #${s.id}`,
        hostname: s.hostname || '',
        ip: s.ip_address || '',
        protocols: s.protocols || '',
        status: s.status || 'unknown',
        responseTime: s.response_time ?? null,
        availability: s.availability ?? null,
        lastCheckTs: s.last_check ? new Date(s.last_check).getTime() : null,
        lastCheck: s.last_check,
        agentState,
        agentRank: AGENT_META[agentState].rank,
        agentVersion: agent ? agent.agent_version ?? agent.version ?? '' : '',
        hasInventory: !!inv,
        os: osPretty,
        arch: inv ? inv.arch || '' : '',
        pkgCount: inv ? Number(inv.package_count ?? 0) : null,
        collectedAt,
        collectedTs: collectedAt ? collectedAt.getTime() : null,
        inventoryStale,
        vulnStatus,
        vulnCount,
        kevCount: vu.kev,
        maxSeverity: vu.maxSev,
        reasons,
        score: reasons.reduce((sum, r) => sum + r.weight, 0)
      };
    });
  }, [overview, agents, inventories, vulns, now]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const quickFn = quick ? QUICK_FILTERS[quick] : null;
    const out = rows.filter((r) => {
      if (fStatus && r.status !== fStatus) return false;
      if (fAgent && r.agentState !== fAgent) return false;
      if (fVuln && r.vulnStatus !== fVuln) return false;
      if (fOs && (r.os || 'unknown') !== fOs) return false;
      if (quickFn && !quickFn(r)) return false;
      if (q && !`${r.name} ${r.hostname} ${r.ip} ${r.os}`.toLowerCase().includes(q)) return false;
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
  }, [rows, search, fStatus, fAgent, fVuln, fOs, quick, sortKey, sortDir]);

  if (loading) {
    return <Loading message="Loading Overview..." />;
  }

  /* ---- KPI ---- */
  const total = rows.length;
  const agentOnline = rows.filter((r) => r.agentState === 'online').length;
  const withoutAgent = rows.filter((r) => r.agentState === 'none' || r.agentState === 'pending').length;
  const withVulns = rows.filter((r) => r.vulnCount > 0).length;
  const kevTotal = rows.reduce((sum, r) => sum + r.kevCount, 0);
  const kevServers = rows.filter((r) => r.kevCount > 0).length;
  const staleCount = rows.filter((r) => r.inventoryStale).length;
  const coveragePct = total > 0 ? Math.round((agentOnline / total) * 100) : 0;
  const vulnsAvailable = !warnings.includes('vulnerabilities');

  const coverageColor =
    coveragePct >= 90 ? 'var(--success-500)' : coveragePct >= 60 ? '#ca8a04' : 'var(--error-500)';

  const kpis = [
    {
      key: 'agentok',
      title: 'Agent coverage',
      value: `${coveragePct}%`,
      sub: `${agentOnline}/${total} servers with online agent`,
      icon: Cpu,
      color: coverageColor,
      bgColor: 'var(--bg-tertiary)',
      borderColor: 'var(--border-light)'
    },
    {
      key: 'noagent',
      title: 'Without agent',
      value: withoutAgent,
      sub: 'no agent or not enrolled',
      icon: XCircle,
      color: withoutAgent > 0 ? '#ca8a04' : 'var(--success-500)',
      bgColor: 'var(--bg-tertiary)',
      borderColor: 'var(--border-light)'
    },
    {
      key: 'vulns',
      title: 'With vulnerabilities',
      value: withVulns,
      sub: vulnsAvailable
        ? `${kevTotal} KEV${kevServers > 0 ? ` on ${kevServers} server${kevServers > 1 ? 's' : ''}` : ''}`
        : 'KEV data unavailable',
      icon: ShieldAlert,
      color: withVulns > 0 ? 'var(--error-500)' : 'var(--success-500)',
      bgColor: 'var(--error-50)',
      borderColor: 'var(--error-200)'
    },
    {
      key: 'stale',
      title: 'Stale inventories',
      value: staleCount,
      sub: `older than ${STALE_INVENTORY_DAYS} days`,
      icon: Clock,
      color: staleCount > 0 ? '#ca8a04' : 'var(--success-500)',
      bgColor: 'var(--bg-tertiary)',
      borderColor: 'var(--border-light)'
    }
  ];

  /* ---- Graphes ---- */
  const agentData = Object.keys(AGENT_META).map((k) => ({
    key: k,
    label: AGENT_META[k].label,
    value: rows.filter((r) => r.agentState === k).length
  }));
  const vulnData = Object.keys(VULN_META).map((k) => ({
    key: k,
    label: VULN_META[k].label,
    value: rows.filter((r) => r.vulnStatus === k).length
  }));

  /* ---- Needs attention ---- */
  const attention = rows
    .filter((r) => r.reasons.length > 0)
    .sort((a, b) => b.score - a.score);

  /* ---- Options de filtres ---- */
  const statusOptions = Array.from(new Set(rows.map((r) => r.status))).sort();
  const osOptions = Array.from(new Set(rows.map((r) => r.os || 'unknown'))).sort();

  /* ---- Pagination ---- */
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const withReset = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const hasFilters = search || fStatus || fAgent || fVuln || fOs || quick;
  const clearFilters = () => {
    setSearch('');
    setFStatus('');
    setFAgent('');
    setFVuln('');
    setFOs('');
    setQuick('');
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

  const toggleQuick = (key) => {
    setQuick(quick === key ? '' : key);
    setPage(0);
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
          <h1 style={{ marginBottom: '0.5rem' }}>Overview</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Monitoring, agents, inventory and vulnerabilities per server · updated {new Date(now).toLocaleTimeString()}
          </p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} className="btn btn-secondary">
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && <Alert type="error" message={error} />}
      {warnings.length > 0 && (
        <p style={{ color: '#9a3412', fontSize: '0.8125rem', marginBottom: '1rem' }}>
          Partial data: could not load {warnings.join(', ')}.
        </p>
      )}

      {/* KPI orientés action (cliquables = filtre) */}
      <div className="grid grid-cols-4" style={{ marginBottom: '2rem' }}>
        {kpis.map((k) => {
          const Icon = k.icon;
          const active = quick === k.key;
          return (
            <div
              key={k.key}
              role="button"
              tabIndex={0}
              onClick={() => toggleQuick(k.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleQuick(k.key);
                }
              }}
              className="card card-interactive"
              style={{
                cursor: 'pointer',
                borderLeft: `4px solid ${k.color}`,
                backgroundColor: k.bgColor,
                borderColor: k.borderColor,
                boxShadow: active ? `0 0 0 2px ${k.color}` : undefined
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                    {k.title}
                  </p>
                  <h2 className="font-mono" style={{ fontSize: '2.25rem', fontWeight: 700, color: k.color, lineHeight: 1 }}>
                    {k.value}
                  </h2>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.5rem' }}>{k.sub}</p>
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
                  <Icon size={24} style={{ color: k.color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Needs attention + graphes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}
      >
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
              Needs attention{' '}
              <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.875rem' }}>({attention.length})</span>
            </h2>
            {attention.length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => toggleQuick('attention')}>
                {quick === 'attention' ? 'Show all' : 'Filter table'}
              </button>
            )}
          </div>
          {attention.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success-500)', fontSize: '0.875rem' }}>
              <CheckCircle size={18} />
              Nothing needs attention.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 260, overflowY: 'auto' }}>
              {attention.slice(0, 8).map((r) => (
                <div key={r.id}>
                  <Link to={`/servers/${r.id}`} style={{ textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                    {r.name}
                  </Link>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.25rem' }}>
                    {r.reasons.map((reason) => (
                      <Badge key={reason.label} bg={reason.bg} fg={reason.fg}>{reason.label}</Badge>
                    ))}
                  </div>
                </div>
              ))}
              {attention.length > 8 && (
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                  + {attention.length - 8} more — use the filter to see them all.
                </p>
              )}
            </div>
          )}
        </div>

        <BarList title="Agent coverage" data={agentData} color="#3b82f6" selected={fAgent} onSelect={withReset(setFAgent)} />
        <BarList title="CVE analysis" data={vulnData} color="#f59e0b" selected={fVuln} onSelect={withReset(setFVuln)} />
      </div>

      {/* Tableau */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            Servers{' '}
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.875rem' }}>
              ({filtered.length}/{total})
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
              onChange={(e) => withReset(setSearch)(e.target.value)}
              placeholder="Search server, hostname, IP, OS..."
              style={{ ...controlStyle, width: '100%', paddingLeft: '2rem', boxSizing: 'border-box' }}
            />
          </div>
          <select value={fStatus} onChange={(e) => withReset(setFStatus)(e.target.value)} style={controlStyle}>
            <option value="">All status</option>
            {statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={fAgent} onChange={(e) => withReset(setFAgent)(e.target.value)} style={controlStyle}>
            <option value="">All agents</option>
            {Object.entries(AGENT_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          <select value={fVuln} onChange={(e) => withReset(setFVuln)(e.target.value)} style={controlStyle}>
            <option value="">All CVE status</option>
            {Object.entries(VULN_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
          <select value={fOs} onChange={(e) => withReset(setFOs)(e.target.value)} style={controlStyle}>
            <option value="">All OS</option>
            {osOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {quick && (
            <Badge bg="#dbeafe" fg="#1e40af">{QUICK_LABELS[quick]}</Badge>
          )}
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="btn btn-secondary">
              <X size={14} />
              Clear
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
            <Server size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
            <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '0.5rem' }}>
              {total === 0 ? 'No servers yet' : 'No server matches the filters'}
            </p>
            {total === 0 && (
              <>
                <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                  Get started by adding your first server to monitor
                </p>
                <Link to="/servers/new" className="btn btn-primary">
                  Add Your First Server
                </Link>
              </>
            )}
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
                    const am = AGENT_META[r.agentState];
                    const sev = SEVERITY_COLORS[r.maxSeverity];
                    return (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.625rem' }}>
                          <Link to={`/servers/${r.id}`} style={{ textDecoration: 'none' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{r.hostname}</div>
                          </Link>
                        </td>
                        <td className="font-mono" style={{ padding: '0.625rem' }}>{r.ip || '-'}</td>
                        <td style={{ padding: '0.625rem' }}>
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="font-mono" style={{ padding: '0.625rem', whiteSpace: 'nowrap' }}>
                          {r.responseTime != null ? `${r.responseTime} ms` : '-'}
                        </td>
                        <td className="font-mono" style={{ padding: '0.625rem', color: r.availability != null ? availabilityColor(r.availability) : undefined }}>
                          {r.availability != null ? `${Number(r.availability).toFixed(2)}%` : '-'}
                        </td>
                        <td style={{ padding: '0.625rem', whiteSpace: 'nowrap' }}>
                          <Badge bg={am.bg} fg={am.fg}>{am.label}</Badge>
                          {r.agentVersion && (
                            <span className="font-mono" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                              {r.agentVersion}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.625rem' }}>
                          <div style={{ color: 'var(--text-secondary)' }}>{r.os || '-'}</div>
                          {r.arch && (
                            <div className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{r.arch}</div>
                          )}
                        </td>
                        <td className="font-mono" style={{ padding: '0.625rem' }}>{r.pkgCount ?? '-'}</td>
                        <td style={{ padding: '0.625rem', whiteSpace: 'nowrap' }}>
                          {r.hasInventory || r.vulnCount > 0 ? (
                            <>
                              <strong
                                className="font-mono"
                                style={{ color: r.vulnCount > 0 ? 'var(--error-500)' : 'var(--text-primary)' }}
                                title={VULN_META[r.vulnStatus]?.label}
                              >
                                {r.vulnCount}
                              </strong>
                              {r.kevCount > 0 && (
                                <span style={{ marginLeft: '0.375rem' }}>
                                  <Badge bg="#fee2e2" fg="#991b1b">KEV {r.kevCount}</Badge>
                                </span>
                              )}
                              {sev && (
                                <span style={{ marginLeft: '0.375rem' }}>
                                  <Badge bg={sev[0]} fg={sev[1]}>{r.maxSeverity}</Badge>
                                </span>
                              )}
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td
                          style={{
                            padding: '0.625rem',
                            whiteSpace: 'nowrap',
                            color: r.inventoryStale ? '#9a3412' : 'var(--text-secondary)',
                            fontWeight: r.inventoryStale ? 600 : 400
                          }}
                          title={r.collectedAt ? r.collectedAt.toLocaleString() : ''}
                        >
                          {timeAgo(r.collectedAt, now)}
                        </td>
                        <td style={{ padding: '0.625rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {formatDateTime(r.lastCheck)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

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

export default Overview;