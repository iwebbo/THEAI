import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Clock,
  Search, Zap, ArrowLeft, FileText, Download,
  AlertOctagon, Info, ChevronDown, ChevronUp
} from 'lucide-react';
import axios from 'axios';
import Alert from '../common/Alert';
import Loading from '../common/Loading';

const API_URL = process.env.REACT_APP_API_URL || '/api/v1';

const securityApi = {
  startSecurityScan: (serverId) => axios.post(`${API_URL}/security/${serverId}/scan`),
  getSecurityScans: (serverId) => axios.get(`${API_URL}/security/${serverId}/scans`),
  getScanDetails: (scanId) => axios.get(`${API_URL}/security/scan/${scanId}`),
  getRecommendations: (serverId) => axios.get(`${API_URL}/security/recommendations/${serverId}`),
  quickSecurityCheck: (serverId) => axios.post(`${API_URL}/security/scan/quick/${serverId}`)
};

const SecurityDashboard = ({ serverId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [quickScanning, setQuickScanning] = useState(false);
  const [scans, setScans] = useState([]);
  const [currentScan, setCurrentScan] = useState(null);
  const [vulnerabilities, setVulnerabilities] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [quickScanResult, setQuickScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [expandedVuln, setExpandedVuln] = useState(null);

  useEffect(() => {
    if (serverId) {
      fetchSecurityScans();
      fetchRecommendations();
    }
  }, [serverId]);

  const fetchSecurityScans = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await securityApi.getSecurityScans(serverId);
      setScans(response.data || []);

      const completedScan = response.data?.find((scan) => scan.status === 'completed');
      if (completedScan) {
        await fetchScanDetails(completedScan.id);
      }
    } catch (err) {
      if (err.response?.status !== 404) {
        setError('Error loading scans: ' + (err.response?.data?.detail || err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchScanDetails = async (scanId) => {
    try {
      const response = await securityApi.getScanDetails(scanId);
      setCurrentScan(response.data);
      setVulnerabilities(response.data.vulnerabilities || []);
    } catch (err) {
      console.error('Error loading scan details:', err);
    }
  };

  const fetchRecommendations = async () => {
    try {
      const response = await securityApi.getRecommendations(serverId);
      setRecommendations(response.data || []);
    } catch (err) {
      console.error('Error loading recommendations:', err);
    }
  };

  const handleStartFullScan = async () => {
    try {
      setScanning(true);
      setError(null);
      const response = await securityApi.startSecurityScan(serverId);
      setSuccessMessage('Full security scan started successfully!');
      await fetchSecurityScans();
    } catch (err) {
      setError('Error starting scan: ' + (err.response?.data?.detail || err.message));
    } finally {
      setScanning(false);
    }
  };

  const handleQuickScan = async () => {
    try {
      setQuickScanning(true);
      setError(null);
      const response = await securityApi.quickSecurityCheck(serverId);
      setQuickScanResult(response.data);
      setSuccessMessage('Quick security check completed!');
    } catch (err) {
      setError('Error during quick scan: ' + (err.response?.data?.detail || err.message));
    } finally {
      setQuickScanning(false);
    }
  };

  const getSeverityConfig = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return {
          color: '#dc2626',
          bgColor: '#fef2f2',
          borderColor: '#fecaca',
          icon: AlertOctagon,
          label: 'Critical'
        };
      case 'high':
        return {
          color: '#ea580c',
          bgColor: '#fff7ed',
          borderColor: '#fed7aa',
          icon: AlertTriangle,
          label: 'High'
        };
      case 'medium':
        return {
          color: '#d97706',
          bgColor: '#fffbeb',
          borderColor: '#fde68a',
          icon: Info,
          label: 'Medium'
        };
      case 'low':
        return {
          color: '#10b981',
          bgColor: '#ecfdf5',
          borderColor: '#a7f3d0',
          icon: CheckCircle,
          label: 'Low'
        };
      default:
        return {
          color: '#6b7280',
          bgColor: '#f9fafb',
          borderColor: '#e5e7eb',
          icon: Info,
          label: 'Unknown'
        };
    }
  };

  if (loading) {
    return <Loading message="Loading security dashboard..." />;
  }

  const criticalCount = vulnerabilities.filter((v) => v.severity === 'critical').length;
  const highCount = vulnerabilities.filter((v) => v.severity === 'high').length;
  const mediumCount = vulnerabilities.filter((v) => v.severity === 'medium').length;
  const lowCount = vulnerabilities.filter((v) => v.severity === 'low').length;

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => navigate(`/servers/${serverId}`)}
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: '1rem' }}
        >
          <ArrowLeft size={16} />
          Back to Server Details
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Shield size={32} style={{ color: 'var(--warning-600)' }} />
              Security Dashboard
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Scan for vulnerabilities and security issues
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleQuickScan}
              disabled={quickScanning}
              className="btn btn-secondary"
            >
              {quickScanning ? (
                <>
                  <div className="animate-spin" style={{ width: '18px', height: '18px', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%' }} />
                  Scanning...
                </>
              ) : (
                <>
                  <Zap size={18} />
                  Quick Check
                </>
              )}
            </button>

            <button
              onClick={handleStartFullScan}
              disabled={scanning}
              className="btn btn-warning"
            >
              {scanning ? (
                <>
                  <div className="animate-spin" style={{ width: '18px', height: '18px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%' }} />
                  Scanning...
                </>
              ) : (
                <>
                  <Search size={18} />
                  Full Security Scan
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && <Alert type="error" message={error} />}
      {successMessage && <Alert type="success" message={successMessage} duration={5000} />}

      {/* Security Score Overview */}
      {currentScan && (
        <div className="grid grid-cols-4" style={{ gap: '1rem', marginBottom: '2rem' }}>
          <StatCard
            title="Critical"
            value={criticalCount}
            icon={AlertOctagon}
            color="#dc2626"
            bgColor="#fef2f2"
            borderColor="#fecaca"
          />
          <StatCard
            title="High"
            value={highCount}
            icon={AlertTriangle}
            color="#ea580c"
            bgColor="#fff7ed"
            borderColor="#fed7aa"
          />
          <StatCard
            title="Medium"
            value={mediumCount}
            icon={Info}
            color="#d97706"
            bgColor="#fffbeb"
            borderColor="#fde68a"
          />
          <StatCard
            title="Low"
            value={lowCount}
            icon={CheckCircle}
            color="#10b981"
            bgColor="#ecfdf5"
            borderColor="#a7f3d0"
          />
        </div>
      )}

      {/* Quick Scan Result */}
      {quickScanResult && (
        <div
          className="card animate-fadeIn"
          style={{
            marginBottom: '2rem',
            borderLeft: `4px solid ${quickScanResult.has_issues ? 'var(--warning-500)' : 'var(--success-500)'}`
          }}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Zap size={20} style={{ color: 'var(--primary-600)' }} />
            Quick Security Check Results
          </h3>

          <div className="grid grid-cols-2" style={{ gap: '1rem' }}>
            <InfoItem label="Open Ports" value={quickScanResult.open_ports?.length || 0} />
            <InfoItem label="Services Detected" value={quickScanResult.services?.length || 0} />
            <InfoItem
              label="Status"
              value={quickScanResult.has_issues ? 'Issues Found' : 'No Issues'}
              valueColor={quickScanResult.has_issues ? 'var(--warning-600)' : 'var(--success-600)'}
            />
            <InfoItem label="Scan Date" value={new Date(quickScanResult.timestamp).toLocaleString()} />
          </div>

          {quickScanResult.recommendations && quickScanResult.recommendations.length > 0 && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Recommendations:
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.813rem', color: 'var(--text-secondary)' }}>
                {quickScanResult.recommendations.map((rec, index) => (
                  <li key={index}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Vulnerabilities List */}
      {vulnerabilities.length > 0 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={20} style={{ color: 'var(--error-600)' }} />
              Detected Vulnerabilities ({vulnerabilities.length})
            </h2>
            <button className="btn btn-secondary btn-sm">
              <Download size={16} />
              Export Report
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {vulnerabilities.map((vuln, index) => {
              const config = getSeverityConfig(vuln.severity);
              const Icon = config.icon;
              const isExpanded = expandedVuln === index;

              return (
                <div
                  key={index}
                  className="card"
                  style={{
                    borderLeft: `4px solid ${config.color}`,
                    backgroundColor: config.bgColor,
                    borderColor: config.borderColor
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                    onClick={() => setExpandedVuln(isExpanded ? null : index)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                      <Icon size={20} style={{ color: config.color }} />
                      <div>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                          {vuln.title || vuln.name || 'Vulnerability'}
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                          {vuln.description?.substring(0, 100)}
                          {vuln.description?.length > 100 && '...'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span
                        className="badge"
                        style={{
                          backgroundColor: config.bgColor,
                          color: config.color,
                          border: `1px solid ${config.borderColor}`,
                          textTransform: 'uppercase',
                          fontSize: '0.688rem'
                        }}
                      >
                        {config.label}
                      </span>
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      className="animate-fadeIn"
                      style={{
                        marginTop: '1rem',
                        paddingTop: '1rem',
                        borderTop: '1px solid var(--border-light)'
                      }}
                    >
                      <div className="grid grid-cols-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                        {vuln.cvss_score && (
                          <InfoItem label="CVSS Score" value={vuln.cvss_score} />
                        )}
                        {vuln.cve_id && <InfoItem label="CVE ID" value={vuln.cve_id} />}
                        {vuln.affected_component && (
                          <InfoItem label="Affected Component" value={vuln.affected_component} />
                        )}
                        {vuln.discovered_date && (
                          <InfoItem
                            label="Discovered"
                            value={new Date(vuln.discovered_date).toLocaleDateString()}
                          />
                        )}
                      </div>

                      {vuln.solution && (
                        <div
                          style={{
                            padding: '1rem',
                            backgroundColor: 'var(--success-50)',
                            border: '1px solid var(--success-200)',
                            borderRadius: 'var(--radius-md)',
                            marginTop: '1rem'
                          }}
                        >
                          <p
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: 'var(--success-800)',
                              marginBottom: '0.5rem'
                            }}
                          >
                            Solution:
                          </p>
                          <p style={{ fontSize: '0.813rem', color: 'var(--success-700)', margin: 0 }}>
                            {vuln.solution}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h2 className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} style={{ color: 'var(--primary-600)' }} />
            Security Recommendations ({recommendations.length})
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {recommendations.map((rec, index) => {
              const config = getSeverityConfig(rec.priority);
              const Icon = config.icon;

              return (
                <div
                  key={index}
                  className="card"
                  style={{
                    borderLeft: `4px solid ${config.color}`,
                    backgroundColor: config.bgColor,
                    borderColor: config.borderColor
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <Icon size={20} style={{ color: config.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {rec.title}
                        </h4>
                        <span
                          className="badge"
                          style={{
                            backgroundColor: config.bgColor,
                            color: config.color,
                            border: `1px solid ${config.borderColor}`,
                            textTransform: 'uppercase',
                            fontSize: '0.688rem'
                          }}
                        >
                          {config.label}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.813rem', color: 'var(--text-secondary)', margin: 0 }}>
                        {rec.description}
                      </p>
                      {rec.action && (
                        <p
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-tertiary)',
                            marginTop: '0.5rem',
                            fontStyle: 'italic'
                          }}
                        >
                          Action: {rec.action}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scan History Timeline */}
      {scans.length > 0 && (
        <div className="card">
          <h2 className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={20} style={{ color: 'var(--primary-600)' }} />
            Scan History
          </h2>

          <div style={{ position: 'relative', paddingLeft: '2rem' }}>
            {/* Timeline line */}
            <div
              style={{
                position: 'absolute',
                left: '0.5rem',
                top: '1rem',
                bottom: '1rem',
                width: '2px',
                backgroundColor: 'var(--border-light)'
              }}
            />

            {scans.slice(0, 10).map((scan, index) => (
              <div
                key={scan.id}
                style={{
                  position: 'relative',
                  marginBottom: index < scans.length - 1 ? '1.5rem' : 0,
                  paddingLeft: '1rem'
                }}
              >
                {/* Timeline dot */}
                <div
                  style={{
                    position: 'absolute',
                    left: '-1.625rem',
                    top: '0.25rem',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor:
                      scan.status === 'completed'
                        ? 'var(--success-500)'
                        : scan.status === 'failed'
                        ? 'var(--error-500)'
                        : 'var(--primary-500)',
                    border: '2px solid white',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                />

                <div
                  style={{
                    padding: '0.75rem',
                    backgroundColor: 'var(--gray-50)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '0.813rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        {scan.scan_type === 'full' ? 'Full Security Scan' : 'Quick Check'}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        {new Date(scan.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`badge ${
                        scan.status === 'completed'
                          ? 'badge-success'
                          : scan.status === 'failed'
                          ? 'badge-error'
                          : 'badge-primary'
                      }`}
                      style={{ fontSize: '0.688rem' }}
                    >
                      {scan.status}
                    </span>
                  </div>

                  {scan.vulnerabilities_found > 0 && (
                    <p
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--error-600)',
                        marginTop: '0.5rem',
                        fontWeight: 500
                      }}
                    >
                      {scan.vulnerabilities_found} vulnerabilities found
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!currentScan && vulnerabilities.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <Shield size={64} style={{ color: 'var(--text-tertiary)', margin: '0 auto 1.5rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            No Security Scans Yet
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.875rem' }}>
            Start your first security scan to detect vulnerabilities and security issues
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button onClick={handleQuickScan} className="btn btn-secondary btn-lg">
              <Zap size={20} />
              Quick Check
            </button>
            <button onClick={handleStartFullScan} className="btn btn-warning btn-lg">
              <Search size={20} />
              Full Security Scan
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Components
const StatCard = ({ title, value, icon: Icon, color, bgColor, borderColor }) => (
  <div
    className="card"
    style={{
      borderLeft: `4px solid ${color}`,
      backgroundColor: bgColor,
      borderColor: borderColor
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
          {title}
        </p>
        <p style={{ fontSize: '2rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
      </div>
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <Icon size={24} style={{ color }} />
      </div>
    </div>
  </div>
);

const InfoItem = ({ label, value, valueColor }) => (
  <div>
    <p
      style={{
        fontSize: '0.75rem',
        color: 'var(--text-tertiary)',
        marginBottom: '0.25rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}
    >
      {label}
    </p>
    <p style={{ fontSize: '0.875rem', fontWeight: 500, color: valueColor || 'var(--text-primary)' }}>
      {value}
    </p>
  </div>
);

export default SecurityDashboard;