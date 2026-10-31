import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  RefreshCw,
  Server as ServerIcon,
  Search,
  X,
  Eye,
  Edit,
  Copy,
  Trash2,
  AlertTriangle,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import Loading from '../common/Loading';
import Alert from '../common/Alert';
import serverApi from '../../services/api';

const BATCH_SIZE = 4;

// Champs acceptés par l'API (ServerCreate / ServerUpdate) : on n'envoie jamais id, status, dates...
const PAYLOAD_FIELDS = [
  'name',
  'hostname',
  'ip_address',
  'description',
  'enabled',
  'protocols',
  'http_port',
  'http_path',
  'use_https',
  'ssh_port',
  'ssh_username',
  'ssh_password',
  'ssh_key_path',
  'tcp_port',
  'tcp_timeout'
];

const PROTOCOL_STYLES = {
  agent: { bg: '#dbeafe', fg: '#1e40af' },
  icmp: { bg: '#e5e7eb', fg: '#374151' },
  http: { bg: '#dcfce7', fg: '#166534' },
  ssh: { bg: '#ede9fe', fg: '#5b21b6' },
  tcp: { bg: '#ffedd5', fg: '#9a3412' }
};

const PROTOCOL_OPTIONS = ['agent', 'icmp', 'http', 'ssh', 'tcp'];
const STATUS_OPTIONS = ['online', 'offline', 'unknown'];

const COLUMNS = [
  { key: 'name', label: 'Server' },
  { key: 'ip_address', label: 'IP' },
  { key: 'protocols', label: 'Protocols', sortable: false },
  { key: 'status', label: 'Status' },
  { key: 'enabled', label: 'Enabled' },
  { key: 'last_check', label: 'Last check' },
  { key: 'actions', label: '', sortable: false }
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const errMsg = (err) => err.response?.data?.detail || err.message;

const pickPayload = (server) => {
  const payload = {};
  PAYLOAD_FIELDS.forEach((f) => {
    if (server[f] !== undefined) payload[f] = server[f];
  });
  return payload;
};

const splitProtocols = (value) =>
  String(value || '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');

// Exécute les appels par lots pour ne pas saturer le backend
const runBatch = async (items, worker) => {
  const results = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const settled = await Promise.allSettled(chunk.map(worker));
    results.push(...settled);
  }
  return results;
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

const sortValue = (server, key) => {
  const v = server[key];
  if (key === 'last_check') return v ? new Date(v).getTime() : 0;
  if (key === 'enabled') return v ? 1 : 0;
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v.toLowerCase() : v;
};

const ProtocolBadges = ({ value }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
    {splitProtocols(value).map((p) => {
      const style = PROTOCOL_STYLES[p] || { bg: '#e5e7eb', fg: '#374151' };
      return (
        <span
          key={p}
          style={{
            padding: '0.0625rem 0.5rem',
            borderRadius: '9999px',
            fontSize: '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            background: style.bg,
            color: style.fg
          }}
        >
          {p}
        </span>
      );
    })}
  </div>
);

const Switch = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onChange}
    style={{
      all: 'unset',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      position: 'relative',
      width: 36,
      height: 20,
      borderRadius: 10,
      backgroundColor: checked ? 'var(--success-500)' : 'var(--gray-400, #9ca3af)',
      transition: 'background-color 150ms',
      flexShrink: 0
    }}
  >
    <span
      style={{
        position: 'absolute',
        top: 2,
        left: checked ? 18 : 2,
        width: 16,
        height: 16,
        borderRadius: '50%',
        backgroundColor: '#fff',
        transition: 'left 150ms'
      }}
    />
  </button>
);

const IconButton = ({ title, onClick, disabled, children, danger, to }) => {
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    padding: 0,
    background: 'transparent',
    border: '1px solid var(--border-light)',
    borderRadius: '0.375rem',
    color: danger ? 'var(--error-500)' : 'var(--text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1
  };
  if (to) {
    return (
      <Link to={to} title={title} aria-label={title} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const ServerList = () => {
  const navigate = useNavigate();

  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [working, setWorking] = useState(false);
  const [busyIds, setBusyIds] = useState(() => new Set());

  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fProto, setFProto] = useState('');
  const [fEnabled, setFEnabled] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [selected, setSelected] = useState(() => new Set());
  const [toDelete, setToDelete] = useState(null);

  const fetchServers = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await serverApi.getServers();
      setServers(response.data || []);
      setError(null);
    } catch (err) {
      setError('Error loading servers: ' + errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  /* ---- Filtrage / tri ---- */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = servers.filter((s) => {
      if (fStatus && s.status !== fStatus) return false;
      if (fProto && !splitProtocols(s.protocols).includes(fProto)) return false;
      if (fEnabled === 'enabled' && !s.enabled) return false;
      if (fEnabled === 'disabled' && s.enabled) return false;
      if (q && !`${s.name} ${s.hostname} ${s.ip_address} ${s.description || ''}`.toLowerCase().includes(q)) return false;
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
  }, [servers, search, fStatus, fProto, fEnabled, sortKey, sortDir]);

  // Les actions de masse ne portent que sur les lignes sélectionnées ET visibles
  const selectedRows = useMemo(() => filtered.filter((s) => selected.has(s.id)), [filtered, selected]);
  const allVisibleSelected = filtered.length > 0 && selectedRows.length === filtered.length;

  /* ---- Échap ferme la modale ---- */
  useEffect(() => {
    if (!toDelete) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !working) setToDelete(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toDelete, working]);

  /* ---- Helpers d'état ---- */
  const setBusy = (id, on) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const patchServers = (patches) =>
    setServers((prev) => prev.map((s) => (patches.has(s.id) ? { ...s, ...patches.get(s.id) } : s)));

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((s) => next.delete(s.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((s) => next.add(s.id));
        return next;
      });
    }
  };

  const toggleSort = (key) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFStatus('');
    setFProto('');
    setFEnabled('');
  };

  const reportFailures = (verb, results, items) => {
    const failed = results
      .map((r, i) => (r.status === 'rejected' ? `${items[i].name} (${errMsg(r.reason)})` : null))
      .filter(Boolean);
    if (failed.length > 0) {
      setError(`${verb} failed for ${failed.length} server${failed.length > 1 ? 's' : ''}: ${failed.join(', ')}`);
    }
    return items.length - failed.length;
  };

  /* ---- Actions unitaires ---- */
  const checkOne = async (server) => {
    const res = await serverApi.checkServer(server.id);
    return {
      id: server.id,
      patch: {
        status: res.data.status,
        last_check: res.data.last_check,
        response_time: res.data.response_time
      }
    };
  };

  const setEnabled = async (server, enabled) => {
    // On repart de la version à jour du serveur : la mise à jour envoie tous les champs
    const fresh = await serverApi.getServer(server.id);
    await serverApi.updateServer(server.id, { ...pickPayload(fresh.data), enabled });
    return { id: server.id, patch: { enabled } };
  };

  const handleCheck = async (server) => {
    setBusy(server.id, true);
    try {
      const { id, patch } = await checkOne(server);
      patchServers(new Map([[id, patch]]));
      setError(null);
    } catch (err) {
      setError(`Error checking ${server.name}: ${errMsg(err)}`);
    } finally {
      setBusy(server.id, false);
    }
  };

  const handleToggleEnabled = async (server) => {
    setBusy(server.id, true);
    try {
      const { id, patch } = await setEnabled(server, !server.enabled);
      patchServers(new Map([[id, patch]]));
      setError(null);
    } catch (err) {
      setError(`Error updating ${server.name}: ${errMsg(err)}`);
    } finally {
      setBusy(server.id, false);
    }
  };

  // Crée immédiatement une copie puis ouvre son formulaire d'édition
  const handleDuplicate = async (server) => {
    setBusy(server.id, true);
    try {
      const fresh = await serverApi.getServer(server.id);
      const payload = pickPayload(fresh.data);
      payload.name = `${payload.name} (copy)`;
      const created = await serverApi.createServer(payload);
      navigate(`/servers/edit/${created.data.id}`);
    } catch (err) {
      setError(`Error duplicating ${server.name}: ${errMsg(err)}`);
      setBusy(server.id, false);
    }
  };

  /* ---- Actions globales ---- */
  const handleCheckAllServers = async () => {
    try {
      setCheckingAll(true);
      const response = await serverApi.checkAllServers();
      const patches = new Map(
        response.data.map((r) => [
          r.id,
          { status: r.status, last_check: r.last_check, response_time: r.response_time }
        ])
      );
      patchServers(patches);
      setError(null);
    } catch (err) {
      setError('Error checking servers: ' + errMsg(err));
    } finally {
      setCheckingAll(false);
    }
  };

  /* ---- Actions de masse ---- */
  const bulkCheck = async () => {
    const items = selectedRows;
    setWorking(true);
    setNotice(null);
    setError(null);
    const results = await runBatch(items, checkOne);
    patchServers(new Map(results.filter((r) => r.status === 'fulfilled').map((r) => [r.value.id, r.value.patch])));
    const ok = reportFailures('Check', results, items);
    if (ok > 0) setNotice(`${ok} server${ok > 1 ? 's' : ''} checked.`);
    setWorking(false);
  };

  const bulkSetEnabled = async (enabled) => {
    const items = selectedRows.filter((s) => !!s.enabled !== enabled);
    if (items.length === 0) {
      setNotice(`Selected servers are already ${enabled ? 'enabled' : 'disabled'}.`);
      return;
    }
    setWorking(true);
    setNotice(null);
    setError(null);
    const results = await runBatch(items, (s) => setEnabled(s, enabled));
    patchServers(new Map(results.filter((r) => r.status === 'fulfilled').map((r) => [r.value.id, r.value.patch])));
    const ok = reportFailures(enabled ? 'Enable' : 'Disable', results, items);
    if (ok > 0) setNotice(`${ok} server${ok > 1 ? 's' : ''} ${enabled ? 'enabled' : 'disabled'}.`);
    setWorking(false);
  };

  const confirmDelete = async () => {
    const items = toDelete;
    setWorking(true);
    setNotice(null);
    setError(null);
    const results = await runBatch(items, async (s) => {
      await serverApi.deleteServer(s.id);
      return s.id;
    });
    const deletedIds = new Set(results.filter((r) => r.status === 'fulfilled').map((r) => r.value));
    setServers((prev) => prev.filter((s) => !deletedIds.has(s.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      deletedIds.forEach((id) => next.delete(id));
      return next;
    });
    const ok = reportFailures('Delete', results, items);
    if (ok > 0) setNotice(`${ok} server${ok > 1 ? 's' : ''} deleted.`);
    setToDelete(null);
    setWorking(false);
  };

  if (loading) {
    return <Loading message="Loading servers..." />;
  }

  const hasFilters = search || fStatus || fProto || fEnabled;
  const counts = {
    total: servers.length,
    online: servers.filter((s) => s.status === 'online').length,
    offline: servers.filter((s) => s.status === 'offline').length,
    unknown: servers.filter((s) => s.status === 'unknown').length
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
          <h1 style={{ marginBottom: '0.5rem' }}>Server Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Add, edit, enable and remove monitored servers
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={() => fetchServers(true)} className="btn btn-secondary">
            <RefreshCw size={18} />
            Refresh
          </button>
          <button onClick={handleCheckAllServers} disabled={checkingAll} className="btn btn-success">
            <RefreshCw size={18} className={checkingAll ? 'animate-spin' : ''} />
            {checkingAll ? 'Checking...' : 'Check All Servers'}
          </button>
          <Link to="/servers/new" className="btn btn-primary">
            <Plus size={18} />
            Add Server
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

      {servers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <ServerIcon size={64} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1.5rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>No servers added yet</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.875rem' }}>
            Start monitoring your infrastructure by adding your first server
          </p>
          <Link to="/servers/new" className="btn btn-primary btn-lg">
            <Plus size={20} />
            Add Your First Server
          </Link>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              Servers{' '}
              <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: '0.875rem' }}>
                ({filtered.length}/{servers.length})
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
                placeholder="Search name, hostname, IP, description..."
                style={{ ...controlStyle, width: '100%', paddingLeft: '2rem', boxSizing: 'border-box' }}
              />
            </div>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={controlStyle}>
              <option value="">All status</option>
              {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={fProto} onChange={(e) => setFProto(e.target.value)} style={controlStyle}>
              <option value="">All protocols</option>
              {PROTOCOL_OPTIONS.map((o) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
            </select>
            <select value={fEnabled} onChange={(e) => setFEnabled(e.target.value)} style={controlStyle}>
              <option value="">Enabled + disabled</option>
              <option value="enabled">Enabled only</option>
              <option value="disabled">Disabled only</option>
            </select>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="btn btn-secondary">
                <X size={14} />
                Clear
              </button>
            )}
          </div>

          {/* Barre d'actions de masse */}
          {selectedRows.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                padding: '0.625rem 0.75rem',
                marginBottom: '1rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-light)',
                borderRadius: '0.5rem'
              }}
            >
              <strong style={{ fontSize: '0.8125rem', marginRight: '0.5rem' }}>
                {selectedRows.length} selected
              </strong>
              <button type="button" className="btn btn-secondary" disabled={working} onClick={bulkCheck}>
                <RefreshCw size={14} className={working ? 'animate-spin' : ''} />
                Check
              </button>
              <button type="button" className="btn btn-secondary" disabled={working} onClick={() => bulkSetEnabled(true)}>
                Enable
              </button>
              <button type="button" className="btn btn-secondary" disabled={working} onClick={() => bulkSetEnabled(false)}>
                Disable
              </button>
              <button
                type="button"
                className="btn"
                disabled={working}
                onClick={() => setToDelete(selectedRows)}
                style={{ background: 'var(--error-500)', color: '#fff' }}
              >
                <Trash2 size={14} />
                Delete
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={working}
                onClick={() => setSelected(new Set())}
                style={{ marginLeft: 'auto' }}
              >
                Clear selection
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', padding: '1.5rem 0', textAlign: 'center' }}>
              No server matches the filters.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.625rem', width: 32 }}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </th>
                    {COLUMNS.map((c) => {
                      const sortable = c.sortable !== false;
                      return (
                        <th
                          key={c.key}
                          onClick={sortable ? () => toggleSort(c.key) : undefined}
                          style={{
                            padding: '0.625rem',
                            cursor: sortable ? 'pointer' : 'default',
                            userSelect: 'none',
                            whiteSpace: 'nowrap'
                          }}
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
                  {filtered.map((server) => {
                    const busy = busyIds.has(server.id);
                    const isSelected = selected.has(server.id);
                    return (
                      <tr
                        key={server.id}
                        style={{
                          borderTop: '1px solid var(--border-light)',
                          opacity: server.enabled ? 1 : 0.65,
                          background: isSelected ? 'var(--bg-tertiary)' : undefined
                        }}
                      >
                        <td style={{ padding: '0.625rem' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(server.id)}
                            aria-label={`Select ${server.name}`}
                          />
                        </td>
                        <td style={{ padding: '0.625rem' }}>
                          <Link to={`/servers/${server.id}`} style={{ textDecoration: 'none' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{server.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{server.hostname}</div>
                          </Link>
                        </td>
                        <td className="font-mono" style={{ padding: '0.625rem' }}>{server.ip_address}</td>
                        <td style={{ padding: '0.625rem' }}>
                          <ProtocolBadges value={server.protocols} />
                        </td>
                        <td style={{ padding: '0.625rem' }}>
                          <StatusBadge status={server.status} />
                          {server.response_time != null && (
                            <span className="font-mono" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                              {server.response_time} ms
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.625rem' }}>
                          <Switch
                            checked={!!server.enabled}
                            disabled={busy || working}
                            onChange={() => handleToggleEnabled(server)}
                            label={server.enabled ? `Disable ${server.name}` : `Enable ${server.name}`}
                          />
                        </td>
                        <td style={{ padding: '0.625rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {formatDateTime(server.last_check)}
                        </td>
                        <td style={{ padding: '0.625rem' }}>
                          <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'flex-end' }}>
                            <IconButton title="Check now" onClick={() => handleCheck(server)} disabled={busy || working}>
                              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                            </IconButton>
                            <IconButton title="Details" to={`/servers/${server.id}`}>
                              <Eye size={14} />
                            </IconButton>
                            <IconButton title="Edit" to={`/servers/edit/${server.id}`}>
                              <Edit size={14} />
                            </IconButton>
                            <IconButton title="Duplicate" onClick={() => handleDuplicate(server)} disabled={busy || working}>
                              <Copy size={14} />
                            </IconButton>
                            <IconButton title="Delete" danger onClick={() => setToDelete([server])} disabled={busy || working}>
                              <Trash2 size={14} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Compteurs */}
      {servers.length > 0 && (
        <div className="card" style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'var(--gray-50)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Total</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.total}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Online</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success-600)' }}>{counts.online}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Offline</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--error-600)' }}>{counts.offline}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Unknown</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-600)' }}>{counts.unknown}</p>
            </div>
          </div>
        </div>
      )}

      {/* Modale de suppression */}
      {toDelete && (
        <div
          onClick={() => !working && setToDelete(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: 'rgba(0, 0, 0, 0.5)'
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: '100%', maxWidth: 460, background: 'var(--bg-primary)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
              <AlertTriangle size={22} style={{ color: 'var(--error-500)' }} />
              <h2 id="delete-title" style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                Delete {toDelete.length} server{toDelete.length > 1 ? 's' : ''}?
              </h2>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              This also removes their check history, agent and inventory data. This cannot be undone.
            </p>
            <ul
              style={{
                maxHeight: 180,
                overflowY: 'auto',
                margin: '0 0 1.25rem',
                paddingLeft: '1.25rem',
                fontSize: '0.875rem',
                color: 'var(--text-primary)'
              }}
            >
              {toDelete.map((s) => (
                <li key={s.id}>
                  <strong>{s.name}</strong>{' '}
                  <span className="font-mono" style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                    {s.ip_address}
                  </span>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" disabled={working} onClick={() => setToDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={working}
                onClick={confirmDelete}
                style={{ background: 'var(--error-500)', color: '#fff' }}
              >
                <Trash2 size={14} />
                {working ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServerList;