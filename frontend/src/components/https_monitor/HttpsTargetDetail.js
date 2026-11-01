import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play, RefreshCw, Trash2, Activity, Lock, Globe, CheckCircle } from 'lucide-react';
import httpsMonitorApi from '../../services/https_monitor';
import Loading from '../common/Loading';
import Alert from '../common/Alert';
import HttpsCheckView from './HttpsCheckView';
import {
  FETCH_LIMIT,
  RANGES,
  AlertBadge,
  Badge,
  BucketChart,
  ConfirmModal,
  KpiCard,
  StatusPill,
  StatusStrip,
  alertsFor,
  availabilityOf,
  bucketAvailability,
  bucketAvg,
  certColor,
  certDays,
  checkTs,
  errMsg,
  fmtDate,
  fmtMs,
  inWindow,
  makeBuckets,
  percentile,
  readSlaTarget,
  slaColor,
  windowBounds
} from './httpsShared';

const REFRESH_MS = 60000;
const HISTORY_ROWS = 50;

const hostnameOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return '';
  }
};

const HttpsTargetDetail = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const url = params.get('url') || '';

  const [history, setHistory] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hours, setHours] = useState(168);
  const [selectedId, setSelectedId] = useState(null);
  const [full, setFull] = useState(null);
  const [running, setRunning] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const slaTarget = useMemo(() => readSlaTarget(), []);

  const load = useCallback(async () => {
    if (!url) {
      setLoading(false);
      return;
    }
    try {
      const hostname = hostnameOf(url);
      const res = await httpsMonitorApi.list({ ...(hostname ? { hostname } : {}), limit: FETCH_LIMIT });
      const rows = (Array.isArray(res.data) ? res.data : []).filter((c) => c.url === url);
      rows.sort((a, b) => checkTs(b) - checkTs(a));
      setHistory(rows);
      setNow(Date.now());
      setError(null);
    } catch (err) {
      setError('Error loading target: ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    setLoading(true);
    setSelectedId(null);
    setFull(null);
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const selectedRow = history.find((c) => c.id === selectedId) || history[0] || null;
  const selectedRowId = selectedRow ? selectedRow.id : null;

  // Le détail complet (chaîne de certification...) est relu par id
  useEffect(() => {
    if (selectedRowId === null || selectedRowId === undefined) return undefined;
    let cancelled = false;
    httpsMonitorApi
      .get(selectedRowId)
      .then((res) => {
        if (!cancelled) setFull({ id: selectedRowId, data: res.data });
      })
      .catch(() => {
        if (!cancelled) setFull(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRowId]);

  const shown = selectedRow ? (full && full.id === selectedRowId ? full.data : selectedRow) : null;

  /* ---- Données dérivées ---- */
  const { from, to } = useMemo(() => windowBounds(history, hours, now), [history, hours, now]);
  const win = useMemo(() => inWindow(history, from, to), [history, from, to]);
  const buckets = useMemo(() => makeBuckets(win, from, to, 48), [win, from, to]);

  const latest = history[0] || null;
  const availability = availabilityOf(win);
  const totals = win.map((c) => c.total_ms).filter((v) => typeof v === 'number');
  const avgTotal = totals.length > 0 ? totals.reduce((s, v) => s + v, 0) / totals.length : null;
  const p95Total = percentile(totals, 95);
  const alerts = alertsFor(latest, availability, slaTarget, now);

  /* ---- Actions ---- */
  const runNow = async (verifyTls) => {
    setRunning(true);
    setError(null);
    try {
      const payload = { url, ...(verifyTls === false ? { verify_tls: false } : {}) };
      if (latest && latest.server_id !== null && latest.server_id !== undefined) payload.server_id = latest.server_id;
      let row;
      try {
        row = (await httpsMonitorApi.runCheck(payload)).data;
      } catch (err) {
        if (payload.server_id !== undefined && err.response?.status === 404) {
          delete payload.server_id;
          row = (await httpsMonitorApi.runCheck(payload)).data;
        } else {
          throw err;
        }
      }
      setHistory((prev) => [row, ...prev]);
      setSelectedId(row.id);
      setNow(Date.now());
    } catch (err) {
      setError('Check failed: ' + errMsg(err));
    } finally {
      setRunning(false);
    }
  };

  const deleteOne = async (id) => {
    try {
      await httpsMonitorApi.remove(id);
      setHistory((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      setError('Error deleting check: ' + errMsg(err));
    }
  };

  const deleteAll = async () => {
    setDeleting(true);
    const ids = history.map((c) => c.id).filter((id) => id !== null && id !== undefined);
    let failed = 0;
    for (let i = 0; i < ids.length; i += 3) {
      // eslint-disable-next-line no-await-in-loop
      const settled = await Promise.allSettled(ids.slice(i, i + 3).map((id) => httpsMonitorApi.remove(id)));
      failed += settled.filter((r) => r.status === 'rejected').length;
    }
    setDeleting(false);
    setConfirmAll(false);
    if (failed > 0) {
      setError(`${failed} stored check(s) could not be deleted.`);
      await load();
    } else {
      navigate('/https-monitor');
    }
  };

  const back = (
    <Link
      to="/https-monitor"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '0.75rem' }}
    >
      <ArrowLeft size={14} />
      HTTPS Monitor
    </Link>
  );

  if (loading) {
    return <Loading message="Loading target..." />;
  }

  if (!url) {
    return (
      <div className="animate-fadeIn">
        {back}
        <Alert type="error" message="No target selected." />
      </div>
    );
  }

  const days = latest ? certDays(latest) : null;

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '2rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div style={{ minWidth: 0 }}>
          {back}
          <h1 className="font-mono" style={{ marginBottom: '0.5rem', fontSize: '1.5rem', wordBreak: 'break-all' }}>{url}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {latest && <StatusPill status={latest.status} />}
            {alerts.length === 0 && latest && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--success-500)' }}>
                <CheckCircle size={14} />
                No active alert
              </span>
            )}
            {alerts.map((a) => (
              <AlertBadge key={a.label} alert={a} />
            ))}
          </div>
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
          <button onClick={() => runNow(true)} disabled={running} className="btn btn-success">
            <Play size={18} className={running ? 'animate-pulse' : ''} />
            {running ? 'Running...' : 'Run check'}
          </button>
          <button onClick={() => runNow(false)} disabled={running} className="btn btn-secondary" title="Accept invalid certificates (status becomes warning)">
            <RefreshCw size={18} />
            Run (skip TLS verify)
          </button>
          <button
            onClick={() => setConfirmAll(true)}
            disabled={running || history.length === 0}
            className="btn"
            style={{ background: 'var(--error-500)', color: '#fff' }}
          >
            <Trash2 size={18} />
            Delete history
          </button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {history.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <Globe size={48} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1rem' }} />
          <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '0.5rem' }}>No stored check for this URL</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Use “Run check” to create the first one.</p>
        </div>
      ) : (
        <>
          {/* KPI (sur la période) */}
          <div className="grid grid-cols-4" style={{ marginBottom: '2rem' }}>
            <KpiCard
              title="Availability"
              value={availability !== null ? `${availability.toFixed(2)}%` : '-'}
              sub={`target ${slaTarget}% · ${win.length} checks`}
              icon={Activity}
              color={slaColor(availability, slaTarget)}
            />
            <KpiCard
              title="Avg response"
              value={avgTotal !== null ? `${Math.round(avgTotal)} ms` : '-'}
              sub="total time over the period"
              icon={Globe}
              color="var(--primary-500)"
            />
            <KpiCard
              title="P95 response"
              value={p95Total !== null ? `${Math.round(p95Total)} ms` : '-'}
              sub="95th percentile"
              icon={Globe}
              color="var(--primary-500)"
            />
            <KpiCard
              title="Certificate"
              value={days === null ? '-' : days < 0 ? 'expired' : `${days}d`}
              sub={latest?.certificate?.not_after ? `until ${fmtDate(latest.certificate.not_after)}` : 'no certificate'}
              icon={Lock}
              color={certColor(days)}
            />
          </div>

          {/* Pastilles + graphes */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Recent checks</h2>
            </div>
            <StatusStrip checks={history} />
          </div>

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
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Response time</h2>
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

          {/* Historique */}
          <div className="card" style={{ marginBottom: '2rem' }}>
            <div className="card-header">
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                History{' '}
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.875rem' }}>
                  ({Math.min(win.length, HISTORY_ROWS)}/{win.length}) · click a row to inspect it below
                </span>
              </h2>
            </div>
            {win.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>No check in this period.</p>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.5rem' }}>Time</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                      <th style={{ padding: '0.5rem' }}>HTTP</th>
                      <th style={{ padding: '0.5rem' }}>TTFB</th>
                      <th style={{ padding: '0.5rem' }}>Total</th>
                      <th style={{ padding: '0.5rem' }}>TLS</th>
                      <th style={{ padding: '0.5rem' }}>Cert</th>
                      <th style={{ padding: '0.5rem' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {win.slice(0, HISTORY_ROWS).map((c) => {
                      const d = certDays(c);
                      const active = selectedRow && c.id === selectedRow.id;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedId(c.id)}
                          style={{ borderTop: '1px solid var(--border-light)', cursor: 'pointer', background: active ? 'var(--bg-tertiary)' : undefined }}
                        >
                          <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtDate(c.checked_at)}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <StatusPill status={c.status} />
                            {Array.isArray(c.warnings) && c.warnings.length > 0 && (
                              <span style={{ marginLeft: '0.375rem' }}>
                                <Badge bg="#fef9c3" fg="#854d0e" title={c.warnings.map((w) => (typeof w === 'string' ? w : JSON.stringify(w))).join(' | ')}>
                                  {c.warnings.length}
                                </Badge>
                              </span>
                            )}
                          </td>
                          <td className="font-mono" style={{ padding: '0.5rem' }}>{c.http_status_code ?? '-'}</td>
                          <td className="font-mono" style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{fmtMs(c.ttfb_ms)}</td>
                          <td className="font-mono" style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{fmtMs(c.total_ms)}</td>
                          <td className="font-mono" style={{ padding: '0.5rem' }}>{c.tls_version || '-'}</td>
                          <td className="font-mono" style={{ padding: '0.5rem', color: certColor(d) }}>
                            {d === null ? '-' : d < 0 ? 'expired' : `${d}d`}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                            <button
                              type="button"
                              title="Delete this check"
                              aria-label="Delete this check"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteOne(c.id);
                              }}
                              style={{ all: 'unset', cursor: 'pointer', color: 'var(--error-500)', display: 'inline-flex' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Détail du check sélectionné */}
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
            Check detail{' '}
            <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.875rem' }}>
              {selectedRow && selectedRow === history[0] ? '(latest)' : ''}
            </span>
          </h2>
          <HttpsCheckView check={shown} />
        </>
      )}

      {confirmAll && (
        <ConfirmModal
          title="Delete all history?"
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={deleteAll}
          onCancel={() => setConfirmAll(false)}
        >
          <p>
            This deletes the {history.length} stored check{history.length > 1 ? 's' : ''} of{' '}
            <strong className="font-mono" style={{ wordBreak: 'break-all' }}>{url}</strong>. The target disappears from the list. This cannot be undone.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
};

export default HttpsTargetDetail;