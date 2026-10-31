import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Package, Server, ShieldAlert, HelpCircle, RefreshCw, Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import agentApi from '../services/agentApi';
import Loading from '../components/common/Loading';
import Alert from '../components/common/Alert';

const REFRESH_MS = 60000;
const FETCH_PAGE = 100;
const PAGE_SIZE = 25;
const PKG_DISPLAY_MAX = 200;

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

const fmtDate = (v) => {
  const d = v instanceof Date ? v : parseUtc(v);
  return d ? d.toLocaleString() : '-';
};

const VULN_META = {
  ok: { label: 'OK', bg: '#dcfce7', fg: '#166534' },
  pending: { label: 'Pending', bg: '#fef9c3', fg: '#854d0e' },
  unsupported: { label: 'Unsupported', bg: '#e5e7eb', fg: '#374151' },
  error: { label: 'Error', bg: '#fee2e2', fg: '#991b1b' }
};

const vulnMeta = (s) => VULN_META[s] || { label: s || 'unknown', bg: '#e5e7eb', fg: '#374151' };

const normalize = (i) => {
  const id = i.server_id ?? i.id;
  const ports = Array.isArray(i.ports) ? i.ports.length : i.ports_count ?? null;
  return {
    id,
    serverName: i.server_name ?? i.server?.name ?? `Server #${id}`,
    osPretty: i.os_pretty ?? i.os_id ?? '',
    osFamily: i.os_family ?? '',
    osVersion: i.os_version ?? '',
    kernel: i.kernel ?? '',
    arch: i.arch ?? '',
    pkgCount: Number(i.package_count ?? 0),
    collectedAt: parseUtc(i.collected_at),
    ecosystem: i.ecosystem ?? '',
    vulnStatus: i.vuln_status ?? 'pending',
    vulnCount: Number(i.vuln_count ?? 0),
    ports
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
            const active = onSelect && selected === d.label;
            const Wrapper = onSelect ? 'button' : 'div';
            const props = onSelect
              ? {
                  type: 'button',
                  onClick: () => onSelect(active ? '' : d.label),
                  title: active ? 'Clear filter' : `Filter on ${d.label}`,
                  style: { all: 'unset', cursor: 'pointer', display: 'block', opacity: selected && !active ? 0.45 : 1 }
                }
              : {};
            return (
              <Wrapper key={d.label} {...props}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: active ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.label}
                  </span>
                  <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{d.value}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, backgroundColor: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', backgroundColor: color, transition: 'width 300ms ease' }} />
                </div>
              </Wrapper>
            );
          })}
        </div>
      )}
    </div>
  );
};

const KV = ({ items }) => (
  <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.375rem 1rem', margin: 0, fontSize: '0.8125rem' }}>
    {items.map(([k, v]) => (
      <React.Fragment key={k}>
        <dt style={{ color: 'var(--text-tertiary)' }}>{k}</dt>
        <dd className="font-mono" style={{ margin: 0, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
          {v === null || v === undefined || v === '' ? '-' : String(v)}
        </dd>
      </React.Fragment>
    ))}
  </dl>
);

/* ------------------------------------------------------------------ */
/*  Détail d'un serveur : agents + agent_inventory (+ paquets)         */
/* ------------------------------------------------------------------ */
const RecordPanel = ({ serverId, serverName, onClose }) => {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [withPackages, setWithPackages] = useState(false);
  const [loadingPkgs, setLoadingPkgs] = useState(false);
  const [pkgSearch, setPkgSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRecord(null);
    setWithPackages(false);
    setPkgSearch('');
    agentApi
      .getRecord(serverId, false)
      .then((res) => {
        if (!cancelled) {
          setRecord(res.data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError('Error loading record: ' + (err.response?.data?.detail || err.message));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const loadPackages = async () => {
    try {
      setLoadingPkgs(true);
      const res = await agentApi.getRecord(serverId, true);
      setRecord(res.data);
      setWithPackages(true);
      setError(null);
    } catch (err) {
      setError('Error loading packages: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoadingPkgs(false);
    }
  };

  const agent = record?.agent || null;
  const inv = record?.inventory || record?.agent_inventory || null;
  const ports = inv?.ports || record?.ports || [];
  const packages = inv?.packages || record?.packages || [];

  const filteredPkgs = useMemo(() => {
    const q = pkgSearch.trim().toLowerCase();
    return q ? packages.filter((p) => (p.name || '').toLowerCase().includes(q)) : packages;
  }, [packages, pkgSearch]);

  return (
    <div className="card" style={{ marginBottom: '2rem' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{serverName}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link to={`/servers/${serverId}`} className="btn btn-secondary">Server page</Link>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            <X size={14} />
            Close
          </button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {loading ? (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>Loading...</p>
      ) : !record ? null : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>Agent</h3>
              {agent ? (
                <KV
                  items={[
                    ['Hostname', agent.agent_hostname ?? agent.hostname],
                    ['Version', agent.agent_version ?? agent.version],
                    ['OS family', agent.os_family],
                    ['Arch', agent.arch],
                    ['Remote IP', agent.remote_ip],
                    ['Interval', agent.interval_seconds != null ? `${agent.interval_seconds}s` : null],
                    ['Enrolled', fmtDate(agent.enrolled_at)],
                    ['Last seen', fmtDate(agent.last_seen)]
                  ]}
                />
              ) : (
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No agent data.</p>
              )}
            </div>

            <div>
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>Inventory</h3>
              {inv ? (
                <KV
                  items={[
                    ['OS', inv.os_pretty],
                    ['OS id / version', [inv.os_id, inv.os_version].filter(Boolean).join(' ')],
                    ['Kernel', inv.kernel],
                    ['Arch', inv.arch],
                    ['Packages', inv.package_count],
                    ['Ecosystem', inv.ecosystem],
                    ['Vuln status', inv.vuln_status],
                    ['Vulnerabilities', inv.vuln_count],
                    ['Collected', fmtDate(inv.collected_at)],
                    ['Vuln checked', fmtDate(inv.vuln_checked_at)]
                  ]}
                />
              ) : (
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No inventory reported yet.</p>
              )}
              {inv?.vuln_error && (
                <p style={{ color: 'var(--error-500)', fontSize: '0.75rem', marginTop: '0.5rem' }}>{inv.vuln_error}</p>
              )}
            </div>

            <div>
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>Listening ports ({ports.length})</h3>
              {ports.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No ports reported.</p>
              ) : (
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '0.25rem' }}>Proto</th>
                        <th style={{ padding: '0.25rem' }}>Address</th>
                        <th style={{ padding: '0.25rem' }}>Port</th>
                        <th style={{ padding: '0.25rem' }}>Process</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ports.map((p, idx) => (
                        <tr key={`${p.proto}-${p.address}-${p.port}-${idx}`} style={{ borderTop: '1px solid var(--border-light)' }}>
                          <td className="font-mono" style={{ padding: '0.25rem' }}>{p.proto}</td>
                          <td className="font-mono" style={{ padding: '0.25rem' }}>{p.address || '-'}</td>
                          <td className="font-mono" style={{ padding: '0.25rem' }}>{p.port}</td>
                          <td style={{ padding: '0.25rem' }}>{p.process || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Paquets */}
          <div style={{ marginTop: '1.5rem' }}>
            {!withPackages ? (
              <button type="button" className="btn btn-primary" onClick={loadPackages} disabled={loadingPkgs}>
                <Package size={16} />
                {loadingPkgs ? 'Loading packages...' : 'Load installed packages'}
              </button>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.875rem' }}>
                    Packages ({filteredPkgs.length}/{packages.length})
                  </h3>
                  <input
                    type="text"
                    value={pkgSearch}
                    onChange={(e) => setPkgSearch(e.target.value)}
                    placeholder="Filter by package name..."
                    style={{ ...controlStyle, minWidth: 240 }}
                  />
                </div>
                <div style={{ maxHeight: 360, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '0.375rem' }}>Name</th>
                        <th style={{ padding: '0.375rem' }}>Version</th>
                        <th style={{ padding: '0.375rem' }}>Source</th>
                        <th style={{ padding: '0.375rem' }}>Arch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPkgs.slice(0, PKG_DISPLAY_MAX).map((p, idx) => (
                        <tr key={`${p.name}-${p.version}-${idx}`} style={{ borderTop: '1px solid var(--border-light)' }}>
                          <td className="font-mono" style={{ padding: '0.375rem' }}>{p.name}</td>
                          <td className="font-mono" style={{ padding: '0.375rem' }}>{p.version}</td>
                          <td className="font-mono" style={{ padding: '0.375rem' }}>{p.source || '-'}</td>
                          <td className="font-mono" style={{ padding: '0.375rem' }}>{p.arch || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredPkgs.length > PKG_DISPLAY_MAX && (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                    Showing the first {PKG_DISPLAY_MAX} results — refine the filter to narrow down.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const COLUMNS = [
  { key: 'serverName', label: 'Server' },
  { key: 'osPretty', label: 'OS' },
  { key: 'kernel', label: 'Kernel' },
  { key: 'arch', label: 'Arch' },
  { key: 'pkgCount', label: 'Packages' },
  { key: 'vulnStatus', label: 'Vuln status' },
  { key: 'vulnCount', label: 'Vulns' },
  { key: 'ports', label: 'Ports' },
  { key: 'collectedAt', label: 'Collected' }
];

const sortValue = (row, key) => {
  const v = row[key];
  if (key === 'collectedAt') return v ? v.getTime() : 0;
  if (typeof v === 'string') return v.toLowerCase();
  return v ?? -1;
};

const AgentInventory = () => {
  const [items, setItems] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [fOs, setFOs] = useState('');
  const [fArch, setFArch] = useState('');
  const [fVuln, setFVuln] = useState('');
  const [sortKey, setSortKey] = useState('serverName');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAll((limit, offset) => agentApi.listInventories(limit, offset));
      setItems(data);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      setError('Error loading inventories: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const rows = useMemo(() => items.map(normalize), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (fOs && (r.osPretty || 'unknown') !== fOs) return false;
      if (fArch && (r.arch || 'unknown') !== fArch) return false;
      if (fVuln && r.vulnStatus !== fVuln) return false;
      if (q && !`${r.serverName} ${r.osPretty} ${r.kernel}`.toLowerCase().includes(q)) return false;
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
  }, [rows, search, fOs, fArch, fVuln, sortKey, sortDir]);

  if (loading) {
    return <Loading message="Loading Inventory..." />;
  }

  const total = rows.length;
  const totalPackages = rows.reduce((sum, r) => sum + r.pkgCount, 0);
  const withVulns = rows.filter((r) => r.vulnCount > 0).length;
  const notAnalysed = rows.filter((r) => r.vulnStatus === 'unsupported' || r.vulnStatus === 'error').length;

  const statsCards = [
    { title: 'Inventories', value: total, icon: Server, color: 'var(--primary-500)', bgColor: 'var(--primary-50)', borderColor: 'var(--primary-200)' },
    { title: 'Packages', value: totalPackages.toLocaleString(), icon: Package, color: 'var(--success-500)', bgColor: 'var(--success-50)', borderColor: 'var(--success-200)' },
    { title: 'Servers with vulns', value: withVulns, icon: ShieldAlert, color: 'var(--error-500)', bgColor: 'var(--error-50)', borderColor: 'var(--error-200)' },
    { title: 'Unsupported / error', value: notAnalysed, icon: HelpCircle, color: 'var(--text-tertiary)', bgColor: 'var(--bg-tertiary)', borderColor: 'var(--border-light)' }
  ];

  const osData = countBy(rows, 'osPretty');
  const archData = countBy(rows, 'arch');
  const vulnData = countBy(rows, 'vulnStatus').map((d) => ({ ...d, label: d.label }));
  const topPackages = [...rows]
    .sort((a, b) => b.pkgCount - a.pkgCount)
    .slice(0, 8)
    .map((r) => ({ label: r.serverName, value: r.pkgCount }));

  const osOptions = osData.map((d) => d.label);
  const archOptions = archData.map((d) => d.label);
  const vulnOptions = vulnData.map((d) => d.label);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const withReset = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const hasFilters = search || fOs || fArch || fVuln;
  const clearFilters = () => {
    setSearch('');
    setFOs('');
    setFArch('');
    setFVuln('');
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
          <h1 style={{ marginBottom: '0.5rem' }}>Agent inventory</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            What agents report, per server · updated {new Date(updatedAt).toLocaleTimeString()}
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

      {/* Graphes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}
      >
        <BarList title="Operating systems" data={osData} color="#10b981" selected={fOs} onSelect={withReset(setFOs)} />
        <BarList title="Vulnerability analysis" data={vulnData} color="#f59e0b" selected={fVuln} onSelect={withReset(setFVuln)} />
        <BarList title="Top servers by packages" data={topPackages} color="#3b82f6" />
      </div>

      {/* Détail serveur sélectionné */}
      {selected && (
        <RecordPanel
          key={selected.id}
          serverId={selected.id}
          serverName={selected.name}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Tableau */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
            Inventory <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.875rem' }}>({filtered.length}/{total})</span>
          </h2>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => withReset(setSearch)(e.target.value)}
              placeholder="Search server, OS, kernel..."
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
          <select value={fVuln} onChange={(e) => withReset(setFVuln)(e.target.value)} style={controlStyle}>
            <option value="">All vuln status</option>
            {vulnOptions.map((o) => <option key={o} value={o}>{vulnMeta(o).label}</option>)}
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
            <Package size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
            <p style={{ fontSize: '1rem', fontWeight: 500 }}>
              {total === 0 ? 'No inventory reported yet' : 'No inventory matches the filters'}
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
                    const vm = vulnMeta(r.vulnStatus);
                    const isSelected = selected?.id === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelected({ id: r.id, name: r.serverName })}
                        style={{
                          borderTop: '1px solid var(--border-light)',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--bg-tertiary)' : undefined
                        }}
                      >
                        <td style={{ padding: '0.625rem', fontWeight: 600, color: 'var(--text-primary)' }}>{r.serverName}</td>
                        <td style={{ padding: '0.625rem', color: 'var(--text-secondary)' }}>{r.osPretty || '-'}</td>
                        <td className="font-mono" style={{ padding: '0.625rem' }}>{r.kernel || '-'}</td>
                        <td className="font-mono" style={{ padding: '0.625rem' }}>{r.arch || '-'}</td>
                        <td className="font-mono" style={{ padding: '0.625rem' }}>{r.pkgCount}</td>
                        <td style={{ padding: '0.625rem' }}>
                          <Badge bg={vm.bg} fg={vm.fg}>{vm.label}</Badge>
                        </td>
                        <td
                          className="font-mono"
                          style={{ padding: '0.625rem', color: r.vulnCount > 0 ? 'var(--error-500)' : undefined, fontWeight: r.vulnCount > 0 ? 700 : 400 }}
                        >
                          {r.vulnCount}
                        </td>
                        <td className="font-mono" style={{ padding: '0.625rem' }}>{r.ports ?? '-'}</td>
                        <td style={{ padding: '0.625rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {fmtDate(r.collectedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <span>
                Page {currentPage + 1} / {pages} · click a row for details
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

export default AgentInventory;