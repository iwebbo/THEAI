import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PackageCheck, RefreshCw, PlayCircle, PlusCircle, Pencil, Trash2, ExternalLink } from 'lucide-react';

import versionCheckerApi, { apiErrorMessage, formatDateTime, isAdminUser } from '../services/versionCheckerApi';
import Loading from '../components/common/Loading';

// Libellés et couleurs par état de comparaison (update_status renvoyé par l'API)
const UPDATE_STATE = {
  up_to_date: { label: 'Up to date', cls: 'badge-success' },
  patch_behind: { label: 'Patch available', cls: 'badge-warning' },
  minor_behind: { label: 'Minor available', cls: 'badge-warning' },
  major_behind: { label: 'MAJOR available', cls: 'badge-error' },
  behind: { label: 'Update available', cls: 'badge-warning' },
  ahead: { label: 'Ahead of release', cls: 'badge-primary' },
  unknown: { label: 'Unknown', cls: 'badge-gray' },
};

const describeState = (t) => {
  if (!t.enabled) return { label: 'Disabled', cls: 'badge-gray' };
  if (!t.configured) return { label: 'Not configured', cls: 'badge-gray' };
  if (!t.last_checked_at) return { label: 'Not checked', cls: 'badge-gray' };
  if (t.last_local_status === 'error') return { label: 'Local error', cls: 'badge-error' };
  return UPDATE_STATE[t.update_status] || UPDATE_STATE.unknown;
};

const buildNotes = (t, check) => {
  const notes = [];
  if (!t.configured) notes.push({ text: 'URL not set', tone: 'muted' });
  else if (t.last_error) notes.push({ text: t.last_error, tone: 'error' });
  if (t.new_major) notes.push({ text: `major ${t.new_major} available (migration)`, tone: 'muted' });
  if (check?.upstream_archived) {
    notes.push({ text: 'upstream repository ARCHIVED: no more official updates', tone: 'warning' });
  }
  return notes;
};

const NOTE_COLORS = {
  error: 'var(--error-600)',
  warning: 'var(--warning-600)',
  muted: 'var(--text-tertiary)',
};

const StatCard = ({ label, value, color }) => (
  <div className="card" style={{ flex: '1 1 140px', textAlign: 'center' }}>
    <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', margin: 0 }}>
      {label}
    </p>
    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0 0', color: color || 'var(--text-primary)' }}>
      {value}
    </p>
  </div>
);

const thStyle = { padding: '0.5rem', whiteSpace: 'nowrap' };
const tdStyle = { padding: '0.5rem', verticalAlign: 'top' };

const VersionCheckerPage = () => {
  const admin = isAdminUser();

  const [targets, setTargets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [checks, setChecks] = useState({}); // dernier contrôle par cible : {id: check}
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const load = useCallback(async () => {
    const [targetsRes, summaryRes] = await Promise.all([
      versionCheckerApi.getTargets(),
      versionCheckerApi.getSummary(),
    ]);
    const list = targetsRes.data;
    setTargets(list);
    setSummary(summaryRes.data);

    // Dernier contrôle de chaque cible (dépôt archivé, lien officiel...) : une petite requête par cible contrôlée
    const checked = list.filter((t) => t.last_checked_at);
    const histories = await Promise.allSettled(checked.map((t) => versionCheckerApi.getHistory(t.id, 1)));
    const map = {};
    histories.forEach((res, i) => {
      if (res.status === 'fulfilled' && res.value.data[0]) map[checked[i].id] = res.value.data[0];
    });
    setChecks(map);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await load();
      } catch (e) {
        setError(apiErrorMessage(e, 'Unable to load version data'));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    setError(null);
    setInfo(null);
    try {
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, 'Unable to refresh'));
    } finally {
      setRefreshing(false);
    }
  };

  const onCheckAll = async () => {
    setCheckingAll(true);
    setError(null);
    setInfo(null);
    try {
      const res = await versionCheckerApi.checkAll();
      setInfo(`Check complete: ${res.data.checked} instance(s) checked, ${res.data.skipped} skipped.`);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, 'Check failed'));
    } finally {
      setCheckingAll(false);
    }
  };

  const onCheckOne = async (t) => {
    setBusyId(t.id);
    setError(null);
    setInfo(null);
    try {
      await versionCheckerApi.checkTarget(t.id);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, `Check failed for ${t.name}`));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (t) => {
    if (!window.confirm(`Delete "${t.name}" and its check history?`)) return;
    setBusyId(t.id);
    setError(null);
    setInfo(null);
    try {
      await versionCheckerApi.deleteTarget(t.id);
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, `Unable to delete ${t.name}`));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <Loading message="Loading versions..." />;
  }

  const busy = refreshing || checkingAll;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PackageCheck size={28} style={{ color: 'var(--primary-600)' }} />
          Version Checker
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={busy}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : undefined} />
            Refresh
          </button>
          {admin && (
            <button type="button" className="btn btn-primary" onClick={onCheckAll} disabled={busy}>
              <PlayCircle size={16} />
              {checkingAll ? 'Checking...' : 'Check now'}
            </button>
          )}
          {admin && (
            <Link to="/version-checker/new" className="btn btn-secondary">
              <PlusCircle size={16} />
              Add instance
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: '1rem', color: 'var(--error-600)' }}>
          {error}
        </div>
      )}
      {info && (
        <div className="card" style={{ marginBottom: '1rem', color: 'var(--success-600)' }}>
          {info}
        </div>
      )}

      {summary && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatCard label="Instances" value={summary.total} />
          <StatCard label="Up to date" value={summary.up_to_date} color="var(--success-600)" />
          <StatCard label="Updates available" value={summary.behind} color="var(--warning-600)" />
          <StatCard label="Errors" value={summary.errors} color={summary.errors ? 'var(--error-600)' : undefined} />
          <StatCard label="Not configured" value={summary.not_configured} />
          <StatCard label="Last check" value={summary.last_checked_at ? formatDateTime(summary.last_checked_at) : '-'} />
        </div>
      )}

      <div className="card">
        {targets.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>
            No instance yet.{' '}
            {admin ? <Link to="/version-checker/new">Add the first one</Link> : 'Ask an administrator to add one.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                  <th style={thStyle}>App</th>
                  <th style={thStyle}>Installed</th>
                  <th style={thStyle}>Target</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Note</th>
                  <th style={thStyle}>Last check</th>
                  {admin && <th style={thStyle} />}
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => {
                  const state = describeState(t);
                  const check = checks[t.id];
                  const notes = buildNotes(t, check);
                  const docs = check?.upstream_docs_url;
                  const rowBusy = busyId === t.id;
                  return (
                    <tr
                      key={t.id}
                      style={{ borderTop: '1px solid var(--border-light)', opacity: t.enabled ? 1 : 0.55 }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {t.app_label || t.app_type}
                        {t.name !== t.app_label && (
                          <div style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                            {t.name}
                          </div>
                        )}
                      </td>
                      <td className="font-mono" style={tdStyle}>
                        {t.installed_version || '-'}
                      </td>
                      <td className="font-mono" style={tdStyle}>
                        {t.latest_version || '-'}
                        {docs && (
                          <a
                            href={docs}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Official release page"
                            style={{ marginLeft: '0.4rem', verticalAlign: 'middle' }}
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        <span className={`badge ${state.cls}`}>{state.label}</span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: '0.8rem' }}>
                        {notes.map((n) => (
                          <div key={n.text} style={{ color: NOTE_COLORS[n.tone] }}>
                            {n.text}
                          </div>
                        ))}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {formatDateTime(t.last_checked_at)}
                      </td>
                      {admin && (
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Check this instance"
                            onClick={() => onCheckOne(t)}
                            disabled={busy || rowBusy}
                          >
                            <RefreshCw size={14} className={rowBusy ? 'animate-spin' : undefined} />
                          </button>
                          <Link
                            to={`/version-checker/edit/${t.id}`}
                            className="btn btn-ghost btn-sm"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </Link>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            title="Delete"
                            onClick={() => onDelete(t)}
                            disabled={busy || rowBusy}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default VersionCheckerPage;