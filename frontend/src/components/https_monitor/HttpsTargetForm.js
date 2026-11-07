import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Play, ChevronDown, ChevronUp } from 'lucide-react';
import httpsMonitorApi from '../../services/https_monitor';
import serverApi from '../../services/api';
import Alert from '../common/Alert';
import HttpsCheckView from './HttpsCheckView';
import { controlStyle, errMsg, targetPath } from './httpsShared';

const withScheme = (value) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);

// Même règle que le backend (_url_from_server) : sert uniquement à l'aperçu
const serverUrl = (s) => {
  const https = !!s.use_https;
  const def = https ? 443 : 80;
  const port = s.http_port;
  const netloc = port === null || port === undefined || port === def ? s.hostname : `${s.hostname}:${port}`;
  return `${https ? 'https' : 'http'}://${netloc}${s.http_path || '/'}`;
};

const EMPTY_OVERRIDES = { verify_tls: '', follow_redirects: '', probe_protocols: '', method: '', timeout: '', interval_seconds: '' };

const Field = ({ label, hint, children }) => (
  <div style={{ marginBottom: '1rem' }}>
    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.375rem' }}>{label}</label>
    {children}
    {hint && <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>{hint}</p>}
  </div>
);

const TriState = ({ value, onChange }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...controlStyle, width: '100%' }}>
    <option value="">Backend default</option>
    <option value="true">Yes</option>
    <option value="false">No</option>
  </select>
);

const HttpsTargetForm = () => {
  const [mode, setMode] = useState('url');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [serverId, setServerId] = useState('');
  const [servers, setServers] = useState([]);
  const [save, setSave] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [overrides, setOverrides] = useState(EMPTY_OVERRIDES);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    serverApi
      .getServers()
      .then((res) => setServers(res.data || []))
      .catch(() => setServers([]));
  }, []);

  const setOverride = (key, value) => setOverrides((prev) => ({ ...prev, [key]: value }));
  const selectedServer = servers.find((s) => String(s.id) === String(serverId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    // Cible : URL (schéma ajouté si absent) ou serveur existant (URL déduite par le backend)
    const target = {};
    if (mode === 'url') {
      const v = url.trim();
      if (!v) {
        setError('URL is required.');
        return;
      }
      target.url = withScheme(v);
    } else {
      if (!serverId) {
        setError('Select a server.');
        return;
      }
      target.server_id = Number(serverId);
    }

    // Seuls les réglages explicitement modifiés sont envoyés : le reste garde les défauts du backend
    const options = {};
    ['verify_tls', 'follow_redirects', 'probe_protocols'].forEach((k) => {
      if (overrides[k] !== '') options[k] = overrides[k] === 'true';
    });
    if (overrides.method) options.method = overrides.method;
    if (overrides.timeout !== '') {
      const n = Number(overrides.timeout);
      if (!Number.isNaN(n) && n > 0) options.timeout = n;
    }

    // Test seul : check ponctuel, rien n'est stocké
    if (!save) {
      try {
        setRunning(true);
        const res = await httpsMonitorApi.runCheck({ ...target, ...options, save: false });
        setResult({ check: res.data, saved: false });
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setRunning(false);
      }
      return;
    }

    // Stockage : 1) création de la cible (table http_synthetic_targets), 2) premier check immédiat
    const targetPayload = { ...target, ...options };
    if (name.trim()) targetPayload.name = name.trim();
    if (overrides.interval_seconds !== '') {
      const n = Number(overrides.interval_seconds);
      if (!Number.isNaN(n)) targetPayload.interval_seconds = n;
    }

    let created;
    try {
      setRunning(true);
      created = (await httpsMonitorApi.createTarget(targetPayload)).data;
    } catch (err) {
      setError(err?.response?.status === 409 ? 'This target is already monitored.' : errMsg(err));
      setRunning(false);
      return;
    }

    try {
      const res = await httpsMonitorApi.checkTarget(created.id);
      setResult({ check: res.data, saved: true, targetId: created.id });
    } catch (err) {
      // La cible existe (le processor la checkera au prochain cycle) mais le premier check a échoué
      setError(`Target saved (#${created.id}), but the first check failed: ${errMsg(err)}`);
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setUrl('');
    setName('');
    setServerId('');
  };

  return (
    <div className="animate-fadeIn">
      <div style={{ marginBottom: '2rem' }}>
        <Link
          to="/https-monitor"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '0.75rem' }}
        >
          <ArrowLeft size={14} />
          HTTPS Monitor
        </Link>
        <h1 style={{ marginBottom: '0.5rem' }}>Add HTTPS target</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Runs a full check (HTTP, TLS and certificate). When stored, the URL becomes a monitored target.
        </p>
      </div>

      {error && <Alert type="error" message={error} />}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: '1.5rem', maxWidth: 720 }}>
          <h2 className="card-header" style={{ fontSize: '1.125rem', fontWeight: 600 }}>Target</h2>

          <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem' }}>
            <button type="button" className={mode === 'url' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setMode('url')}>
              URL
            </button>
            <button
              type="button"
              className={mode === 'server' ? 'btn btn-primary' : 'btn btn-secondary'}
              onClick={() => setMode('server')}
              disabled={servers.length === 0}
              title={servers.length === 0 ? 'No server available' : undefined}
            >
              Existing server
            </button>
          </div>

          {mode === 'url' ? (
            <Field label="URL" hint="https:// is added when no scheme is given.">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.example.com"
                className="form-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </Field>
          ) : (
            <Field
              label="Server"
              hint={selectedServer ? `Checked URL: ${serverUrl(selectedServer)}` : 'The URL is built from the server hostname, HTTP port, HTTPS flag and path.'}
            >
              <select value={serverId} onChange={(e) => setServerId(e.target.value)} style={{ ...controlStyle, width: '100%' }}>
                <option value="">Select a server...</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.hostname})
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Name (optional)" hint="Label of the stored target. Ignored for a test only.">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              placeholder="My website"
              className="form-input"
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </Field>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', marginBottom: '1rem' }}>
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
            Store the result (creates the target and feeds history, SLA and alerts)
          </label>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}
          >
            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Advanced options
          </button>

          {showAdvanced && (
            <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 1rem' }}>
              <Field label="Verify TLS" hint="No = accept invalid certificates (status becomes warning).">
                <TriState value={overrides.verify_tls} onChange={(v) => setOverride('verify_tls', v)} />
              </Field>
              <Field label="Follow redirects">
                <TriState value={overrides.follow_redirects} onChange={(v) => setOverride('follow_redirects', v)} />
              </Field>
              <Field label="Probe TLS protocols">
                <TriState value={overrides.probe_protocols} onChange={(v) => setOverride('probe_protocols', v)} />
              </Field>
              <Field label="HTTP method">
                <select value={overrides.method} onChange={(e) => setOverride('method', e.target.value)} style={{ ...controlStyle, width: '100%' }}>
                  <option value="">Backend default</option>
                  <option value="GET">GET</option>
                  <option value="HEAD">HEAD</option>
                </select>
              </Field>
              <Field label="Timeout (seconds)">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={overrides.timeout}
                  onChange={(e) => setOverride('timeout', e.target.value)}
                  placeholder="Backend default"
                  className="form-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </Field>
              <Field label="Check interval (seconds)" hint="How often the processor checks a stored target (30 to 86400).">
                <input
                  type="number"
                  min="30"
                  max="86400"
                  value={overrides.interval_seconds}
                  onChange={(e) => setOverride('interval_seconds', e.target.value)}
                  placeholder="Backend default (300)"
                  className="form-input"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </Field>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
          <button type="submit" className="btn btn-primary" disabled={running}>
            <Play size={16} />
            {running ? 'Running check...' : save ? 'Run check and save' : 'Run test only'}
          </button>
          <Link to="/https-monitor" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>

      {result && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Result</h2>
            {result.saved && result.check.url ? (
              <Link to={targetPath(result.check.url)} className="btn btn-primary">
                Open target
              </Link>
            ) : (
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>Test only: nothing was stored.</span>
            )}
            <button type="button" className="btn btn-secondary" onClick={reset}>
              Add another
            </button>
          </div>
          <HttpsCheckView check={result.check} />
        </div>
      )}
    </div>
  );
};

export default HttpsTargetForm;