import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Search } from 'lucide-react';

import cveApi from '../services/cveApi';
import Loading from '../components/common/Loading';

const SEVERITY_COLORS = {
  critical: 'var(--error-600)',
  high: '#ea580c',
  medium: '#ca8a04',
  low: 'var(--success-600)'
};

const inputStyle = {
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--border-light)',
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)'
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '-');

const StatCard = ({ label, value, color }) => (
  <div className="card" style={{ flex: '1 1 160px', textAlign: 'center' }}>
    <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', margin: 0 }}>
      {label}
    </p>
    <p style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.5rem 0 0', color: color || 'var(--text-primary)' }}>
      {value}
    </p>
  </div>
);

const INITIAL_FILTERS = { q: '', severity: '', kev: false, sort: 'published' };

const CvePage = () => {
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(INITIAL_FILTERS);

  const runSearch = useCallback(async (f) => {
    const params = { sort: f.sort, size: 25 };
    if (f.q.trim()) params.q = f.q.trim();
    if (f.severity) params.severity = f.severity;
    if (f.kev) params.kev = true;

    const response = await cveApi.search(params);
    setResults(response.data);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsResponse] = await Promise.all([cveApi.getStats(), runSearch(INITIAL_FILTERS)]);
        setStats(statsResponse.data);
      } catch (e) {
        setError(e.response?.data?.detail || 'Unable to load CVE data');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [runSearch]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await runSearch(filters);
    } catch (err) {
      setError(err.response?.data?.detail || 'Search failed');
    }
  };

  if (loading) {
    return <Loading message="Loading vulnerabilities..." />;
  }

  const sev = stats?.by_severity || {};

  return (
    <div>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <ShieldAlert size={28} style={{ color: 'var(--primary-600)' }} />
        Vulnerabilities (CVE)
      </h1>

      {error && (
        <div className="card" style={{ marginBottom: '1rem', color: 'var(--error-600)' }}>
          {error}
        </div>
      )}

      {stats && !stats.ready && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          The CVE database is still empty: the initial ingestion is probably still running.
        </div>
      )}

      {stats && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <StatCard label="Total CVE" value={stats.total.toLocaleString()} />
          <StatCard label="Exploited (KEV)" value={stats.kev} color="var(--error-600)" />
          <StatCard label="EPSS ≥ 0.10" value={stats.epss_high} color="#ca8a04" />
          <StatCard label="Critical < 30d" value={stats.critical_recent} color="#ea580c" />
          <StatCard label="Critical / High" value={`${sev.critical || 0} / ${sev.high || 0}`} />
          <StatCard label="Last ingestion" value={formatDate(stats.last_ingest?.run_at)} />
        </div>
      )}

      <div className="card">
        <form onSubmit={onSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <input
            style={{ ...inputStyle, flex: '1 1 240px' }}
            placeholder="CVE-ID, product, vendor or text"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
          <select
            style={inputStyle}
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
          >
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            style={inputStyle}
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
          >
            <option value="published">Sort: newest</option>
            <option value="cvss_base">Sort: CVSS</option>
            <option value="epss_score">Sort: EPSS</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
            <input
              type="checkbox"
              checked={filters.kev}
              onChange={(e) => setFilters({ ...filters, kev: e.target.checked })}
            />
            KEV only
          </label>
          <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Search size={16} /> Search
          </button>
        </form>

        <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '0.75rem' }}>
          {results.total.toLocaleString()} result(s), showing {results.items.length}
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                <th style={{ padding: '0.5rem' }}>CVE</th>
                <th style={{ padding: '0.5rem' }}>Severity</th>
                <th style={{ padding: '0.5rem' }}>CVSS</th>
                <th style={{ padding: '0.5rem' }}>EPSS</th>
                <th style={{ padding: '0.5rem' }}>KEV</th>
                <th style={{ padding: '0.5rem' }}>Published</th>
                <th style={{ padding: '0.5rem' }}>Products</th>
                <th style={{ padding: '0.5rem' }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {results.items.map((cve) => (
                <tr key={cve.cve_id} style={{ borderTop: '1px solid var(--border-light)', verticalAlign: 'top' }}>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    <a
                      href={`https://nvd.nist.gov/vuln/detail/${cve.cve_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {cve.cve_id}
                    </a>
                  </td>
                  <td style={{ padding: '0.5rem', color: SEVERITY_COLORS[cve.severity] || 'inherit', fontWeight: 600 }}>
                    {cve.severity || '-'}
                  </td>
                  <td style={{ padding: '0.5rem' }}>{cve.cvss_base ?? '-'}</td>
                  <td style={{ padding: '0.5rem' }}>
                    {cve.epss_score != null ? cve.epss_score.toFixed(3) : '-'}
                  </td>
                  <td style={{ padding: '0.5rem', color: 'var(--error-600)', fontWeight: 700 }}>
                    {cve.kev ? 'YES' : ''}
                  </td>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{formatDate(cve.published)}</td>
                  <td style={{ padding: '0.5rem' }}>{(cve.products || []).slice(0, 3).join(', ')}</td>
                  <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
                    {(cve.description || '').slice(0, 160)}
                    {(cve.description || '').length > 160 ? '…' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CvePage;
