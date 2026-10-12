import React, { useState, useEffect, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Cpu, Shield, RefreshCw, Network, Trash2, Activity } from 'lucide-react';
import moment from 'moment';
import agentApi from '../../services/agentApi';
import Alert from '../common/Alert';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const REFRESH_MS = 20000;

const formatBytes = (n) => {
  if (n === null || n === undefined) return 'n/a';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Number(n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatUptime = (s) => {
  if (!s) return 'n/a';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
};

const pct = (v) => (v === null || v === undefined ? 'n/a' : `${Number(v).toFixed(1)} %`);

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
};

const Tile = ({ label, value, color }) => (
  <div style={{ padding: '0.75rem', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
    <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
      {label}
    </p>
    <p style={{ fontSize: '1.25rem', fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</p>
  </div>
);

const Badge = ({ children, bg, fg }) => (
  <span style={{ display: 'inline-block', padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, background: bg, color: fg }}>
    {children}
  </span>
);

const CommandBox = ({ title, command }) => (
  <div style={{ marginBottom: '1rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
      <strong style={{ fontSize: '0.875rem' }}>{title}</strong>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyText(command)}>
        Copy
      </button>
    </div>
    <pre style={{ margin: 0, padding: '0.75rem', background: 'var(--gray-100, #f3f4f6)', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
      {command}
    </pre>
  </div>
);

const severityColor = (sev) => {
  switch ((sev || '').toLowerCase()) {
    case 'critical': return ['#fee2e2', '#991b1b'];
    case 'high': return ['#ffedd5', '#9a3412'];
    case 'medium': return ['#fef9c3', '#854d0e'];
    case 'low': return ['#dcfce7', '#166534'];
    default: return ['#e5e7eb', '#374151'];
  }
};

const AgentPanel = ({ serverId }) => {
  const [status, setStatus] = useState(null);
  const [series, setSeries] = useState([]);
  const [vulns, setVulns] = useState({ total: 0, kev: 0, items: [] });
  const [vulnLimit, setVulnLimit] = useState(50);
  const [hours, setHours] = useState(6);
  const [enrollment, setEnrollment] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const origin = window.location.origin;

  const refresh = useCallback(async () => {
    try {
      const st = await agentApi.getStatus(serverId);
      setStatus(st.data);
      if (st.data.enrolled) {
        const [m, v] = await Promise.all([
          agentApi.getMetrics(serverId, hours),
          agentApi.getVulns(serverId, vulnLimit, 0),
        ]);
        setSeries(m.data.points || []);
        setVulns(v.data);
      }
      setError(null);
    } catch (err) {
      setError('Agent: ' + (err.response?.data?.detail || err.message));
    }
  }, [serverId, hours, vulnLimit]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const generateToken = async () => {
    try {
      setBusy(true);
      const res = await agentApi.createEnrollment(serverId);
      setEnrollment(res.data);
      await refresh();
    } catch (err) {
      setError('Error generating token: ' + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!window.confirm('Revoke this agent? It will stop being able to report until re-enrolled.')) return;
    try {
      setBusy(true);
      await agentApi.revoke(serverId);
      setEnrollment(null);
      setSeries([]);
      setVulns({ total: 0, kev: 0, items: [] });
      await refresh();
    } catch (err) {
      setError('Error revoking agent: ' + (err.response?.data?.detail || err.message));
    } finally {
      setBusy(false);
    }
  };

  const rescan = async () => {
    try {
      await agentApi.refreshVulns(serverId);
      await refresh();
    } catch (err) {
      setError('Error: ' + (err.response?.data?.detail || err.message));
    }
  };

  if (!status) {
    return null;
  }

  const m = status.metrics;
  const inv = status.inventory;
  const enrolled = status.enrolled;

  let badge = <Badge bg="#e5e7eb" fg="#374151">Not enrolled</Badge>;
  if (enrolled && status.online) badge = <Badge bg="#dcfce7" fg="#166534">Online</Badge>;
  else if (enrolled) badge = <Badge bg="#fee2e2" fg="#991b1b">No heartbeat</Badge>;

  const labels = series.map((p) => moment(p.t).format(hours > 24 ? 'DD/MM HH:mm' : 'HH:mm'));
  const chartData = {
    labels,
    datasets: [
      { label: 'CPU %', data: series.map((p) => p.cpu), borderColor: '#2563eb', backgroundColor: '#2563eb', pointRadius: 0, tension: 0.2 },
      { label: 'RAM %', data: series.map((p) => p.mem), borderColor: '#16a34a', backgroundColor: '#16a34a', pointRadius: 0, tension: 0.2 },
      { label: 'Disk %', data: series.map((p) => p.disk), borderColor: '#d97706', backgroundColor: '#d97706', pointRadius: 0, tension: 0.2 },
    ],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: { y: { min: 0, max: 100 } },
    plugins: { legend: { position: 'bottom' } },
  };

  const token = enrollment?.token;
  const linuxCmd = token
    ? `curl -fsSL ${origin}/downloads/agent/install.sh | sudo THEAI_URL=${origin} THEAI_TOKEN=${token} sh`
    : '';
  const windowsCmd = token
    ? `$env:THEAI_URL='${origin}'; $env:THEAI_TOKEN='${token}'; iwr "$env:THEAI_URL/downloads/agent/install.ps1" -UseBasicParsing | iex`
    : '';
  const otherCmd = token
    ? `theai-agent enroll -url ${origin} -token ${token}\ntheai-agent run`
    : '';

  return (
    <div className="card" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <Cpu size={20} style={{ color: 'var(--primary-600)' }} />
          THEAI Agent {badge}
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={generateToken} disabled={busy}>
            {enrolled ? 'Re-enroll (new token)' : 'Generate install token'}
          </button>
          {(enrolled || status.pending_token) && (
            <button type="button" className="btn btn-danger btn-sm" onClick={revoke} disabled={busy}>
              <Trash2 size={14} /> Revoke
            </button>
          )}
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {token && (
        <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--warning-200, #fde68a)', background: 'var(--warning-50, #fffbeb)', borderRadius: 'var(--radius-md)' }}>
          <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
            One-time token, valid until {moment(enrollment.expires_at).format('YYYY-MM-DD HH:mm')}. It is shown only once:
            copy the command for the target OS and run it on the server.
          </p>
          <CommandBox title="Linux (root)" command={linuxCmd} />
          <CommandBox title="Windows (PowerShell, administrator)" command={windowsCmd} />
          <CommandBox title={`AIX / FreeBSD / Solaris / macOS (binary from ${origin}/downloads/agent/)`} command={otherCmd} />
        </div>
      )}

      {!enrolled && !token && (
        <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {status.pending_token
            ? 'A token is pending (valid until ' + moment(status.token_expires_at).format('YYYY-MM-DD HH:mm') + '). Generate a new one to display the install commands again.'
            : 'No agent enrolled. Generate an install token to deploy the agent on this server. The agent only makes outbound HTTPS connections to THEAI.'}
        </p>
      )}

      {enrolled && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
            <Tile label="CPU" value={pct(m?.cpu_percent)} />
            <Tile label="RAM" value={pct(m?.mem_percent)} />
            <Tile label="Disk (max)" value={pct(m?.disk_used_pct)} color={m?.disk_used_pct > 90 ? 'var(--error-600, #dc2626)' : undefined} />
            <Tile label="Load 1/5/15" value={m && m.load1 !== null ? `${m.load1} / ${m.load5} / ${m.load15}` : 'n/a'} />
            <Tile label="Uptime" value={formatUptime(m?.uptime_seconds)} />
            <Tile label="Network total" value={m ? `↓ ${formatBytes(m.net_rx_bytes)} ↑ ${formatBytes(m.net_tx_bytes)}` : 'n/a'} />
            <Tile label="Last heartbeat" value={status.last_seen ? moment(status.last_seen).fromNow() : 'never'} />
            <Tile label="Agent" value={`${status.agent_version || '?'} (${status.os_family || '?'}/${status.arch || '?'})`} />
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}>
                <Activity size={16} /> Usage history
              </strong>
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="form-input" style={{ width: 'auto' }}>
                <option value={1}>1 h</option>
                <option value={6}>6 h</option>
                <option value={24}>24 h</option>
                <option value={168}>7 days</option>
              </select>
            </div>
            <div style={{ height: '240px' }}>
              {series.length > 0 ? <Line data={chartData} options={chartOptions} /> : <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>No data for this period.</p>}
            </div>
          </div>

          {m?.disks?.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <strong style={{ fontSize: '0.875rem' }}>Disks</strong>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                    <th>Mount</th><th>Device</th><th>FS</th><th>Used</th><th>Total</th><th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {m.disks.map((d) => (
                    <tr key={`${d.mount}-${d.device}`} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td>{d.mount}</td><td>{d.device}</td><td>{d.fs}</td>
                      <td>{formatBytes(d.used)}</td><td>{formatBytes(d.total)}</td>
                      <td>{d.total ? ((100 * d.used) / d.total).toFixed(1) : 'n/a'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {inv && (
            <div style={{ marginTop: '1.5rem' }}>
              <strong style={{ fontSize: '0.875rem' }}>Inventory</strong>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {inv.os_pretty || 'Unknown OS'} · kernel {inv.kernel || 'n/a'} · {inv.package_count} packages
                {inv.collected_at ? ` · collected ${moment(inv.collected_at).fromNow()}` : ''}
              </p>
            </div>
          )}

          {status.ports?.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}>
                <Network size={16} /> Listening ports ({status.ports.length})
              </strong>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                    <th>Port</th><th>Proto</th><th>Address</th><th>Process</th>
                  </tr>
                </thead>
                <tbody>
                  {status.ports.slice(0, 100).map((p) => (
                    <tr key={`${p.proto}-${p.address}-${p.port}`} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td>{p.port}</td><td>{p.proto}</td><td>{p.address}</td><td>{p.process || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem' }}>
                <Shield size={16} /> Vulnerabilities ({vulns.total}
                {vulns.kev > 0 ? `, ${vulns.kev} actively exploited` : ''})
              </strong>
              {inv && inv.ecosystem && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={rescan}>
                  <RefreshCw size={14} /> Re-scan
                </button>
              )}
            </div>

            {inv && inv.vuln_status === 'unsupported' && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{inv.vuln_error}</p>
            )}
            {inv && inv.vuln_status === 'pending' && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Analysis queued (runs within a few minutes).</p>
            )}
            {inv && inv.vuln_status === 'error' && (
              <p style={{ fontSize: '0.8125rem', color: 'var(--error-600, #dc2626)', marginTop: '0.5rem' }}>
                Last analysis failed: {inv.vuln_error}. Retrying automatically.
              </p>
            )}
            {inv && inv.vuln_status === 'ok' && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
                Source: OSV ({inv.ecosystem}, patched versions taken into account) · checked {inv.vuln_checked_at ? moment(inv.vuln_checked_at).fromNow() : 'never'} · sorted by KEV, then EPSS, then CVSS
              </p>
            )}

            {vulns.items.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                    <th>CVE</th><th>Package</th><th>Installed</th><th>KEV</th><th>EPSS</th><th>CVSS</th><th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {vulns.items.map((v) => {
                    const [bg, fg] = severityColor(v.severity);
                    return (
                      <tr key={`${v.vuln_id}-${v.package}`} style={{ borderTop: '1px solid var(--border-light)' }} title={v.description || ''}>
                        <td>
                          <a href={`https://nvd.nist.gov/vuln/detail/${v.vuln_id}`} target="_blank" rel="noopener noreferrer">{v.vuln_id}</a>
                        </td>
                        <td>{v.package}</td>
                        <td>{v.installed_version}</td>
                        <td>{v.kev ? <Badge bg="#fee2e2" fg="#991b1b">KEV{v.kev_due_date ? ` · due ${v.kev_due_date}` : ''}</Badge> : '-'}</td>
                        <td>{v.epss_score !== null ? `${(v.epss_score * 100).toFixed(1)} %` : '-'}</td>
                        <td>{v.cvss_base !== null ? v.cvss_base : '-'}</td>
                        <td>{v.severity ? <Badge bg={bg} fg={fg}>{v.severity}</Badge> : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {vulns.total > vulns.items.length && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => setVulnLimit(vulnLimit + 50)}>
                Show more ({vulns.total - vulns.items.length} remaining)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AgentPanel;
