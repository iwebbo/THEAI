import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Globe,
  Activity,
  Lock,
  AlertTriangle,
  Plus,
  Play,
  Eye,
  Trash2,
  RefreshCw,
  Search,
  X,
  CheckCircle,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import httpsMonitorApi from '../../services/https_monitor';
import Loading from '../common/Loading';
import Alert from '../common/Alert';
import {
  FETCH_LIMIT,
  RANGES,
  SEVERITY_META,
  CERT_WARN_DAYS,
  AlertBadge,
  Badge,
  BucketChart,
  ConfirmModal,
  KpiCard,
  StatusPill,
  alertScore,
  alertsFor,
  availabilityOf,
  bucketAvailability,
  bucketAvg,
  buildTargets,
  certColor,
  certDays,
  checkTs,
  controlStyle,
  errMsg,
  fmtDate,
  fmtMs,
  inWindow,
  makeBuckets,
  readSlaTarget,
  slaColor,
  statusMeta,
  targetPath,
  timeAgo,
  windowBounds
} from './httpsShared';

const REFRESH_MS = 60000;
const BATCH_SIZE = 3;

const COLUMNS = [
  { key: 'url', label: 'Target' },
  { key: 'statusRank', label: 'Status' },
  { key: 'httpCode', label: 'HTTP' },
  { key: 'total', label: 'Response' },
  { key: 'tlsVersion', label: 'TLS' },
  { key: 'certDays', label: 'Certificate' },
  { key: 'availability', label: 'Availability' },
  { key: 'score', label: 'Alerts' },
  { key: 'lastTs', label: 'Last check' },
  { key: 'actions', label: '', sortable: false }
];

const runBatch = async (items, worker) => {
  const results = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    const settled = await Promise.allSettled(items.slice(i, i + BATCH_SIZE).map(worker));
    results.push(...settled);
  }
  return results;
};

const sortVal = (t, key) => {
  const v = t[key];
  if (key === 'certDays') return v === null || v === undefined ? 1e9 : v;
  if (v === null || v === undefined) return typeof t.url === 'string' && key === 'url' ? '' : -1;
  return typeof v === 'string' ? v.toLowerCase() : v;
};

const HttpsMonitor = () => {
  const [checks, setChecks] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [hours, setHours] = useState(168);

  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [sortKey, setSortKey] = useState('score');
  const [sortDir, setSortDir] = useState('desc');

  const [busyKeys, setBusyKeys] = useState(() => new Set());
  const [runningAll, setRunningAll] = useState(false);
  const [toRemove, setToRemove] = useState(null);
  const [removing, setRemoving] = useState(false);

  const slaTarget = useMemo(() => readSlaTarget(), []);

  const load = useCallback(async () => {
    try {
      const res = await httpsMonitorApi.list({ limit: FETCH_LIMIT });
      setChecks(Array.isArray(res.data) ? res.data : []);
      setNow(Date.now());
      setError(null);
    } catch (err) {
      setError('Error loading HTTPS checks: ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  /* ---- Données dérivées ---- */
  const { from, to } = useMemo(() => windowBounds(checks, hours, now), [checks, hours, now]);
  const windowChecks = useMemo(() => inWindow(checks, from, to), [checks, from, to]);

  const targets = useMemo(
    () =>
      buildTargets(checks).map((t) => {
        const win = inWindow(t.checks, from, to);
        const latest = t.latest;
        const availability = availabilityOf(win);
        const alerts = alertsFor(latest, availability, slaTarget, now);
        return {
          ...t,
          win,
          availability,
          alerts,
          score: alertScore(alerts),
          status: latest?.status || 'unknown',
          statusRank: statusMeta(latest?.status).rank,
          httpCode: latest?.http_status_code ?? null,
          total: latest?.total_ms ?? null,
          tlsVersion: latest?.tls_version || '',
          certDays: latest ? certDays(latest) : null,
          certUntil: latest?.certificate?.not_after || null,
          lastTs: latest ? checkTs(latest) : 0,
          count: win.length
        };
      }),
    [checks, from, to, slaTarget, now]
  );

  const buckets = useMemo(() => makeBuckets(windowChecks, from, to, 48), [windowChecks, from, to]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = targets.filter((t) => {
      if (fStatus && t.status !== fStatus) return false;
      if (onlyAlerts && t.alerts.length === 0) return false;
      if (q && !`${t.url} ${t.hostname}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return out.sort((a, b) => {
      const va = sortVal(a, sortKey);
      const vb = sortVal(b, sortKey);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [targets, search, fStatus, onlyAlerts, sortKey, sortDir]);

  /* ---- Actions ---- */
  const setBusy = (key, on) =>
    setBusyKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const runCheck = async (t) => {
    // On conserve le lien avec le serveur ; si le serveur n'existe plus on relance sur l'URL seule
    if (t.serverId !== null && t.serverId !== undefined) {
      try {
        return (await httpsMonitorApi.runCheck({ url: t.url, server_id: t.serverId })).data;
      } catch (err) {
        if (err.response?.status !== 404) throw err;
      }
    }
    return (await httpsMonitorApi.runCheck({ url: t.url })).data;
  };

  const handleRun = async (t) => {
    setBusy(t.key, true);
    try {
      const row = await runCheck(t);
      setChecks((prev) => [row, ...prev]);
      setNow(Date.now());
      setError(null);
    } catch (err) {
      setError(`Check failed for ${t.url}: ${errMsg(err)}`);
    } finally {
      setBusy(t.key, false);
    }
  };

  const handleRunAll = async () => {
    const items = filtered;
    if (items.length === 0) return;
    setRunningAll(true);
    setNotice(null);
    setError(null);
    const results = await runBatch(items, runCheck);
    const rows = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (rows.length > 0) setChecks((prev) => [...rows, ...prev]);
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? `${items[i].url} (${errMsg(r.reason)})` : null))
      .filter(Boolean);
    if (failed.length > 0) setError(`${failed.length} check(s) failed: ${failed.join(', ')}`);
    if (rows.length > 0) setNotice(`${rows.length} check${rows.length > 1 ? 's' : ''} completed.`);
    setNow(Date.now());
    setRunningAll(false);
  };

  const confirmRemove = async () => {
    const t = toRemove;
    const ids = t.checks.map((c) => c.id).filter((id) => id !== null && id !== undefined);
    setRemoving(true);
    setNotice(null);
    setError(null);
    const results = await runBatch(ids, (id) => httpsMonitorApi.remove(id));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) setError(`${failed} stored check(s) could not be deleted.`);
    else setNotice(`History of ${t.url} deleted.`);
    setToRemove(null);
    setRemoving(false);
    await load();
  };

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'score' || key === 'lastTs' ? 'desc' : 'asc');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFStatus('');
    setOnlyAlerts(false);
  };

  if (loading) {
    return <Loading message="Loading HTTPS monitor..." />;
  }

  /* ---- KPI ---- */
  const online = targets.filter((t) => t.status === 'online').length;
  const warning = targets.filter((t) => t.status === 'warning').length;
  const offline = targets.filter((t) => t.status === 'offline').length;
  const globalAvailability = availabilityOf(windowChecks);

  const certTargets = targets.filter((t) => t.certDays !== null);
  const expiring = certTargets.filter((t) => t.certDays <= CERT_WARN_DAYS);
  const expired = certTargets.filter((t) => t.certDays < 0).length;
  const nextExpiry = certTargets.length > 0 ? Math.min(...certTargets.map((t) => t.certDays)) : null;

  const allAlerts = targets
    .flatMap((t) => t.alerts.map((a) => ({ target: t, alert: a })))
    .sort((a, b) => SEVERITY_META[b.alert.severity].rank - SEVERITY_META[a.alert.severity].rank);
  const critical = allAlerts.filter((a) => a.alert.severity === 'critical').length;
  const warnings = allAlerts.filter((a) => a.alert.severity === 'warning').length;

  const soonest = [...certTargets].sort((a, b) => a.certDays - b.certDays).slice(0, 6);

  const hasFilters = search || fStatus || onlyAlerts;
  const truncated = checks.length >= FETCH_LIMIT;

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
          <h1 style={{ marginBottom: '0.5rem' }}>HTTPS Monitor</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            HTTP, TLS and certificate checks per target · updated {new Date(now).toLocaleTimeString()}
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
          <button onClick={load} className="btn btn-secondary">
            <RefreshCw size={18} />
            Refresh
          </button>
          <button onClick={handleRunAll} disabled={runningAll || filtered.length === 0} className="btn btn-success">
            <Play size={18} className={runningAll ? 'animate-pulse' : ''} />
            {runningAll ? 'Running...' : 'Run all checks'}
          </button>
          <Link to="/https-monitor/new" className="btn btn-primary">
            <Plus size={18} />
            Add Target
          </Link>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}
      {notice && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.625rem 1rem',
            marginBottom: '1rem',
            fontSize: '0.8125rem',
            color: '#166534',
            background: '#dcfce7',
            borderRadius: '0.5rem'
          }}
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" style={{ all: 'unset', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {targets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <Globe size={64} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1.5rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>No HTTPS target yet</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.875rem' }}>
            Add a URL to check its availability, TLS configuration and certificate expiry.
          </p>
          <Link to="/https-monitor/new" className="btn btn-primary btn-lg">
            <Plus size={20} />
            Add Your First Target
          </Link>
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-4" style={{ marginBottom: '2rem' }}>
            <KpiCard
              title="Targets"
              value={targets.length}
              sub={`${online} online · ${warning} warning · ${offline} offline`}
              icon={Globe}
              color={offline > 0 ? 'var(--error-500)' : warning > 0 ? '#ca8a04' : 'var(--success-500)'}
            />
            <KpiCard
              title="Availability"
              value={globalAvailability !== null ? `${globalAvailability.toFixed(2)}%` : '-'}
              sub={`target ${slaTarget}% · ${windowChecks.length} checks`}
              icon={Activity}
              color={slaColor(globalAvailability, slaTarget)}
            />
            <KpiCard
              title="Certificates"
              value={expiring.length}
              sub={
                certTargets.length === 0
                  ? 'no HTTPS certificate'
                  : `${expired} expired · next in ${nextExpiry}d`
              }
              icon={Lock}
              color={expired > 0 || (nextExpiry !== null && nextExpiry <= 7) ? 'var(--error-500)' : expiring.length > 0 ? '#ca8a04' : 'var(--success-500)'}
            />
            <KpiCard
              title="Alerts"
              value={allAlerts.length}
              sub={`${critical} critical · ${warnings} warning`}
              icon={AlertTriangle}
              color={critical > 0 ? 'var(--error-500)' : warnings > 0 ? '#ca8a04' : 'var(--success-500)'}
            />
          </div>

          {/* Alertes + certificats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div className="card">
              <div className="card-header">
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                  Alerts{' '}
                  <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.875rem' }}>({allAlerts.length})</span>
                </h2>
              </div>
              {allAlerts.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success-500)', fontSize: '0.875rem' }}>
                  <CheckCircle size={18} />
                  No active alert.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', maxHeight: 260, overflowY: 'auto' }}>
                  {allAlerts.slice(0, 12).map(({ target, alert }, i) => (
                    <div key={`${target.key}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <AlertBadge alert={alert} />
                      <Link to={targetPath(target.url)} className="font-mono" style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', textDecoration: 'none', wordBreak: 'break-all' }}>
                        {target.url}
                      </Link>
                    </div>
                  ))}
                  {allAlerts.length > 12 && (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>+ {allAlerts.length - 12} more in the table below.</p>
                  )}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Certificate expiry</h2>
              </div>
              {soonest.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No certificate data yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {soonest.map((t) => (
                    <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                      <Link to={targetPath(t.url)} className="font-mono" style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', textDecoration: 'none', wordBreak: 'break-all' }}>
                        {t.url}
                      </Link>
                      <span className="font-mono" style={{ color: certColor(t.certDays), fontWeight: 700, whiteSpace: 'nowrap' }} title={t.certUntil ? fmtDate(t.certUntil) : ''}>
                        {t.certDays < 0 ? 'expired' : `${t.certDays}d`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Graphes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div className="card">
              <div className="card-header">
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Availability</h2>
              </div>
              <BucketChart
                series={[{ name: 'Availability', color: '#10b981', points: bucketAvailability(buckets) }]}
                from={from}
                to={to}
                fixedMax={100}
                unit="%"
              />
            </div>
            <div className="card">
              <div className="card-header">
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Response time (average)</h2>
              </div>
              <BucketChart
                series={[
                  { name: 'Total', color: '#3b82f6', points: bucketAvg(buckets, 'total_ms') },
                  { name: 'TTFB', color: '#f59e0b', points: bucketAvg(buckets, 'ttfb_ms') }
                ]}
                from={from}
                to={to}
                unit=" ms"
              />
            </div>
          </div>

          {/* Tableau */}
          <div className="card">
            <div className="card-header">
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                Targets{' '}
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.875rem' }}>
                  ({filtered.length}/{targets.length})
                </span>
              </h2>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 220px' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search URL or hostname..."
                  style={{ ...controlStyle, width: '100%', paddingLeft: '2rem', boxSizing: 'border-box' }}
                />
              </div>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={controlStyle}>
                <option value="">All status</option>
                <option value="online">Online</option>
                <option value="warning">Warning</option>
                <option value="offline">Offline</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} />
                With alerts only
              </label>
              {hasFilters && (
                <button type="button" onClick={clearFilters} className="btn btn-secondary">
                  <X size={14} />
                  Clear
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', padding: '1.5rem 0', textAlign: 'center' }}>
                No target matches the filters.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      {COLUMNS.map((c) => {
                        const sortable = c.sortable !== false;
                        return (
                          <th
                            key={c.key}
                            onClick={sortable ? () => toggleSort(c.key) : undefined}
                            style={{ padding: '0.625rem', cursor: sortable ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}
                          >
                            {c.label}
                            {sortable && sortKey === c.key && (
                              sortDir === 'asc'
                                ? <ChevronUp size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                                : <ChevronDown size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => {
                      const busy = busyKeys.has(t.key);
                      return (
                        <tr key={t.key} style={{ borderTop: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.625rem', maxWidth: 320 }}>
                            <Link to={targetPath(t.url)} style={{ textDecoration: 'none' }}>
                              <div className="font-mono" style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>{t.url}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                {t.count} check{t.count > 1 ? 's' : ''} in period
                              </div>
                            </Link>
                          </td>
                          <td style={{ padding: '0.625rem' }}>
                            <StatusPill status={t.status} />
                          </td>
                          <td className="font-mono" style={{ padding: '0.625rem' }}>{t.httpCode ?? '-'}</td>
                          <td className="font-mono" style={{ padding: '0.625rem', whiteSpace: 'nowrap' }}>{fmtMs(t.total)}</td>
                          <td className="font-mono" style={{ padding: '0.625rem', whiteSpace: 'nowrap' }}>{t.tlsVersion || '-'}</td>
                          <td className="font-mono" style={{ padding: '0.625rem', whiteSpace: 'nowrap', color: certColor(t.certDays), fontWeight: 600 }}>
                            {t.certDays === null ? '-' : t.certDays < 0 ? 'expired' : `${t.certDays}d`}
                          </td>
                          <td className="font-mono" style={{ padding: '0.625rem', whiteSpace: 'nowrap', color: slaColor(t.availability, slaTarget) }}>
                            {t.availability !== null ? `${t.availability.toFixed(2)}%` : '-'}
                          </td>
                          <td style={{ padding: '0.625rem' }}>
                            {t.alerts.length === 0 ? (
                              <span style={{ color: 'var(--text-tertiary)' }}>-</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                {t.alerts.slice(0, 2).map((a) => (
                                  <AlertBadge key={a.label} alert={a} />
                                ))}
                                {t.alerts.length > 2 && <Badge bg="#e5e7eb" fg="#374151">+{t.alerts.length - 2}</Badge>}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.625rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }} title={fmtDate(t.latest?.checked_at)}>
                            {timeAgo(t.lastTs, now)}
                          </td>
                          <td style={{ padding: '0.625rem' }}>
                            <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                title="Run check now"
                                aria-label="Run check now"
                                onClick={() => handleRun(t)}
                                disabled={busy || runningAll}
                                style={iconBtn(busy || runningAll)}
                              >
                                <Play size={14} className={busy ? 'animate-pulse' : ''} />
                              </button>
                              <Link to={targetPath(t.url)} title="Details" aria-label="Details" style={iconBtn(false)}>
                                <Eye size={14} />
                              </Link>
                              <button
                                type="button"
                                title="Delete history"
                                aria-label="Delete history"
                                onClick={() => setToRemove(t)}
                                disabled={busy || runningAll}
                                style={{ ...iconBtn(busy || runningAll), color: 'var(--error-500)' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '1rem' }}>
              A target is a distinct URL in the stored history. Checks only run when triggered (Run check / Run all).
              {truncated && ` Showing the latest ${FETCH_LIMIT} checks only: older history and some targets may be missing.`}
            </p>
          </div>
        </>
      )}

      {toRemove && (
        <ConfirmModal
          title="Delete target history?"
          confirmLabel="Delete"
          busy={removing}
          onConfirm={confirmRemove}
          onCancel={() => setToRemove(null)}
        >
          <p style={{ marginBottom: '0.5rem' }}>
            This deletes the {toRemove.checks.length} stored check{toRemove.checks.length > 1 ? 's' : ''} of{' '}
            <strong className="font-mono" style={{ wordBreak: 'break-all' }}>{toRemove.url}</strong>, so the target disappears from this list. This cannot be undone.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
};

const iconBtn = (disabled) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  background: 'transparent',
  border: '1px solid var(--border-light)',
  borderRadius: '0.375rem',
  color: 'var(--text-secondary)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1
});

export default HttpsMonitor;