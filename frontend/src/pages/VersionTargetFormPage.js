import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PackageCheck, Save, PlayCircle } from 'lucide-react';

import versionCheckerApi, { apiErrorMessage, isAdminUser } from '../services/versionCheckerApi';
import Loading from '../components/common/Loading';

const EMPTY = {
  app_type: '',
  name: '',
  url: '',
  username: '',
  password: '',
  token: '',
  verify_tls: true,
  ca_file: '',
  channel: '',
  enabled: true,
};

// Libellés / exemples propres à certaines applications (le reste vient de GET /apps)
const PASSWORD_LABEL = { jenkins: 'API token (used as password)' };
const TOKEN_PLACEHOLDER = {
  proxmox: 'user@realm!tokenid=<secret>',
  wikijs: 'Wiki.js API key',
  minio: 'JWT from "mc admin prometheus generate"',
};

const VersionTargetFormPage = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const admin = isAdminUser();

  const [apps, setApps] = useState([]);
  const [target, setTarget] = useState(null); // cible chargée en édition (has_token, has_password...)
  const [form, setForm] = useState(EMPTY);
  const [clearToken, setClearToken] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const appsRes = await versionCheckerApi.getApps();
        setApps(appsRes.data);
        if (isEdit) {
          const t = (await versionCheckerApi.getTarget(id)).data;
          setTarget(t);
          setForm({
            ...EMPTY,
            app_type: t.app_type,
            name: t.name,
            url: t.url || '',
            username: t.username || '',
            verify_tls: t.verify_tls,
            ca_file: t.ca_file || '',
            channel: t.channel || '',
            enabled: t.enabled,
          });
        }
      } catch (e) {
        setError(apiErrorMessage(e, 'Unable to load the form'));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, isEdit]);

  const app = apps.find((a) => a.key === form.app_type);
  const fields = app ? app.auth_fields : [];
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const secretOk = () => {
    if (!app || !app.auth_required) return true;
    if (fields.includes('token')) return Boolean(form.token) || Boolean(target?.has_token && !clearToken);
    return Boolean(form.password) || Boolean(target?.has_password && !clearPassword);
  };

  const buildPayload = () => {
    const payload = {
      url: form.url.trim() || null,
      verify_tls: form.verify_tls,
      enabled: form.enabled,
      ca_file: form.ca_file.trim() || null,
      channel: form.channel || null,
    };
    if (form.name.trim()) payload.name = form.name.trim();
    if (fields.includes('username')) payload.username = form.username.trim() || null;

    // Secrets : jamais renvoyés par l'API. En édition, on n'envoie que ce qui est saisi ("" = effacer).
    if (fields.includes('password')) {
      if (form.password) payload.password = form.password;
      else if (isEdit && clearPassword) payload.password = '';
    }
    if (fields.includes('token')) {
      if (form.token) payload.token = form.token;
      else if (isEdit && clearToken) payload.token = '';
    }
    if (!isEdit) payload.app_type = form.app_type;
    return payload;
  };

  const save = async (checkAfter) => {
    setError(null);
    if (!isEdit && !form.app_type) {
      setError('Select an application');
      return;
    }
    if (!form.url.trim() && form.enabled && !isEdit) {
      setError('URL is required to add an instance (leave it empty only to keep an entry unconfigured)');
      return;
    }
    if (form.url.trim() && !secretOk()) {
      setError(`${app.label} requires authentication: ${app.auth_hint}`);
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      const saved = isEdit
        ? (await versionCheckerApi.updateTarget(id, payload)).data
        : (await versionCheckerApi.createTarget(payload)).data;
      if (checkAfter && saved.configured) {
        try {
          await versionCheckerApi.checkTarget(saved.id);
        } catch (e) {
          // l'instance est enregistrée ; le contrôle pourra être relancé depuis la liste
        }
      }
      navigate('/version-checker');
    } catch (e) {
      setError(apiErrorMessage(e, 'Unable to save'));
      setSaving(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    save(false);
  };

  if (loading) {
    return <Loading message="Loading..." />;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <PackageCheck size={28} style={{ color: 'var(--primary-600)' }} />
        {isEdit ? 'Edit instance' : 'Add instance'}
      </h1>

      {!admin && (
        <div className="card" style={{ marginBottom: '1rem', color: 'var(--warning-600)' }}>
          Administrator rights are required to add or edit instances.
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: '1rem', color: 'var(--error-600)' }}>
          {error}
        </div>
      )}

      <form className="card" onSubmit={onSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="vc-app">Application</label>
          <select
            id="vc-app"
            className="form-select"
            value={form.app_type}
            onChange={(e) => set({ app_type: e.target.value, channel: '' })}
            disabled={isEdit}
          >
            <option value="">Select an application...</option>
            {apps.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
        </div>

        {app && (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="vc-name">Name (optional)</label>
              <input
                id="vc-name"
                className="form-input"
                value={form.name}
                placeholder={app.label}
                onChange={(e) => set({ name: e.target.value })}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                Must be unique per application. Use a different name to monitor a second instance.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="vc-url">URL</label>
              <input
                id="vc-url"
                className="form-input"
                value={form.url}
                placeholder={app.url_example}
                onChange={(e) => set({ url: e.target.value })}
              />
            </div>

            {app.auth_hint && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                {app.auth_hint}
                {app.auth_required ? ' (required)' : ''}
              </p>
            )}

            {fields.includes('username') && (
              <div className="form-group">
                <label className="form-label" htmlFor="vc-user">Username</label>
                <input
                  id="vc-user"
                  className="form-input"
                  autoComplete="off"
                  value={form.username}
                  onChange={(e) => set({ username: e.target.value })}
                />
              </div>
            )}

            {fields.includes('password') && (
              <div className="form-group">
                <label className="form-label" htmlFor="vc-pass">
                  {PASSWORD_LABEL[app.key] || 'Password'}
                </label>
                <input
                  id="vc-pass"
                  type="password"
                  className="form-input"
                  autoComplete="new-password"
                  value={form.password}
                  placeholder={target?.has_password && !clearPassword ? 'Stored — leave blank to keep' : ''}
                  onChange={(e) => set({ password: e.target.value })}
                />
                {isEdit && target?.has_password && (
                  <label style={{ display: 'flex', gap: '0.4rem', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                    <input
                      type="checkbox"
                      checked={clearPassword}
                      onChange={(e) => setClearPassword(e.target.checked)}
                    />
                    Remove the stored secret
                  </label>
                )}
              </div>
            )}

            {fields.includes('token') && (
              <div className="form-group">
                <label className="form-label" htmlFor="vc-token">API token / key</label>
                <input
                  id="vc-token"
                  type="password"
                  className="form-input"
                  autoComplete="new-password"
                  value={form.token}
                  placeholder={
                    target?.has_token && !clearToken
                      ? 'Stored — leave blank to keep'
                      : TOKEN_PLACEHOLDER[app.key] || ''
                  }
                  onChange={(e) => set({ token: e.target.value })}
                />
                {isEdit && target?.has_token && (
                  <label style={{ display: 'flex', gap: '0.4rem', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                    <input
                      type="checkbox"
                      checked={clearToken}
                      onChange={(e) => setClearToken(e.target.checked)}
                    />
                    Remove the stored secret
                  </label>
                )}
              </div>
            )}

            {app.channels.length > 0 && (
              <div className="form-group">
                <label className="form-label" htmlFor="vc-channel">Release channel</label>
                <select
                  id="vc-channel"
                  className="form-select"
                  value={form.channel}
                  onChange={(e) => set({ channel: e.target.value })}
                >
                  <option value="">Default ({app.channels[0]})</option>
                  {app.channels.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="vc-ca">CA file (optional)</label>
              <input
                id="vc-ca"
                className="form-input"
                value={form.ca_file}
                placeholder="/path/to/internal-ca.pem (server side)"
                onChange={(e) => set({ ca_file: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={form.verify_tls}
                  onChange={(e) => set({ verify_tls: e.target.checked })}
                />
                Verify TLS certificate
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => set({ enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>
          </>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button type="submit" className="btn btn-primary" disabled={!admin || saving || !app}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!admin || saving || !app}
            onClick={() => save(true)}
          >
            <PlayCircle size={16} />
            Save &amp; check
          </button>
          <Link to="/version-checker" className="btn btn-ghost">Cancel</Link>
        </div>
      </form>
    </div>
  );
};

export default VersionTargetFormPage;