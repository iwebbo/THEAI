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
      const scanData = response.data;
      setCurrentScan(scanData);
      
      // Parser les vulnérabilités si c'est une chaîne JSON
      let vulns = [];
      if (scanData.vulnerabilities) {
        if (typeof scanData.vulnerabilities === 'string') {
          try {
            vulns = JSON.parse(scanData.vulnerabilities);
          } catch {
            vulns = [];
          }
        } else {
          vulns = scanData.vulnerabilities;
        }
      }
      setVulnerabilities(vulns);
      
      // Parser les recommandations
      if (scanData.recommendations) {
        if (typeof scanData.recommendations === 'string') {
          try {
            scanData.recommendations = JSON.parse(scanData.recommendations);
          } catch {
            scanData.recommendations = [];
          }
        }
      }
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
      setSuccessMessage(null);
      
      const response = await securityApi.startSecurityScan(serverId);
      const scanId = response.data.scan_id;
      
      setSuccessMessage('Security scan started! Checking status...');
      
      // Polling pour vérifier le statut du scan
      let pollCount = 0;
      const maxPolls = 30;
      
      const checkScanStatus = async () => {
        try {
          pollCount++;
          const statusResponse = await securityApi.getScanDetails(scanId);
          const scan = statusResponse.data;
          
          if (scan.status === 'completed') {
            setScanning(false);
            setSuccessMessage('Scan completed successfully!');
            await fetchSecurityScans();
            await fetchScanDetails(scanId);
            setTimeout(() => setSuccessMessage(null), 3000);
          } else if (scan.status === 'failed') {
            setScanning(false);
            setError('Scan failed: ' + (scan.error_message || 'Unknown error'));
          } else if (pollCount >= maxPolls) {
            setScanning(false);
            setError('Scan is taking too long. Please refresh the page.');
          } else {
            setTimeout(checkScanStatus, 3000);
          }
        } catch (err) {
          setScanning(false);
          setError('Error checking scan status: ' + err.message);
        }
      };
      
      setTimeout(checkScanStatus, 2000);
      
    } catch (err) {
      setError('Error starting scan: ' + (err.response?.data?.detail || err.message));
      setScanning(false);
    }
  };

  const handleQuickScan = async () => {
    try {
      setQuickScanning(true);
      setError(null);
      
      const response = await securityApi.quickSecurityCheck(serverId);
      
      // Debug: afficher la réponse
      console.log('Quick scan response:', response.data);
      
      setQuickScanResult(response.data);
      setSuccessMessage('Quick security check completed!');
      
      // Si un scan_id est retourné, rafraîchir la liste
      if (response.data.scan_id) {
        await fetchSecurityScans();
        if (response.data.status === 'completed') {
          await fetchScanDetails(response.data.scan_id);
        }
      }
      
      setTimeout(() => setSuccessMessage(null), 3000);
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

  const getRiskLevelColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c';
      case 'medium': return '#d97706';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Invalid Date';
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
        <>
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

          {/* SCAN DETAILS SECTION */}
          {currentScan.scan_details && (
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h3 className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Search size={20} style={{ color: 'var(--primary-600)' }} />
                Scan Details
              </h3>
              
              <div style={{ padding: '1.5rem' }}>
                {(() => {
                  // Parser les scan_details (peut être JSON string ou objet)
                  let scanDetails = currentScan.scan_details;
                  if (typeof scanDetails === 'string') {
                    try {
                      scanDetails = JSON.parse(scanDetails);
                    } catch (e) {
                      // Si ce n'est pas du JSON valide, afficher comme texte
                      return (
                        <div style={{ 
                          fontSize: '0.875rem', 
                          color: 'var(--text-secondary)',
                          fontFamily: 'monospace',
                          backgroundColor: 'var(--gray-50)',
                          padding: '1rem',
                          borderRadius: 'var(--radius-md)',
                          whiteSpace: 'pre-wrap',
                          border: '1px solid var(--border-light)'
                        }}>
                          {scanDetails}
                        </div>
                      );
                    }
                  }

                  // Si c'est un objet JSON, l'afficher de manière structurée
                  if (typeof scanDetails === 'object' && scanDetails !== null) {
                    return (
                      <div style={{ fontSize: '0.875rem' }}>
                        {/* Ports ouverts */}
                        {scanDetails.open_ports && Array.isArray(scanDetails.open_ports) && scanDetails.open_ports.length > 0 && (
                          <div style={{ marginBottom: '1.5rem' }}>
                            <h5 style={{ 
                              margin: '0 0 0.75rem 0', 
                              color: 'var(--text-primary)',
                              fontSize: '1rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              <CheckCircle size={16} style={{ color: 'var(--primary-600)' }} />
                              Open Ports ({scanDetails.open_ports.length})
                            </h5>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                              {scanDetails.open_ports.slice(0, 15).map((port, index) => (
                                <span key={index} style={{
                                  display: 'inline-block',
                                  backgroundColor: 'var(--primary-50)',
                                  color: 'var(--primary-700)',
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: 'var(--radius-full)',
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  border: '1px solid var(--primary-200)'
                                }}>
                                  {typeof port === 'object' ? `${port.port}/${port.protocol}` : port}
                                </span>
                              ))}
                              {scanDetails.open_ports.length > 15 && (
                                <span style={{ 
                                  color: 'var(--text-tertiary)', 
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.5rem'
                                }}>
                                  +{scanDetails.open_ports.length - 15} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Services détectés */}
                        {scanDetails.services && Array.isArray(scanDetails.services) && scanDetails.services.length > 0 && (
                          <div style={{ marginBottom: '1.5rem' }}>
                            <h5 style={{ 
                              margin: '0 0 0.75rem 0', 
                              color: 'var(--text-primary)',
                              fontSize: '1rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              <Shield size={16} style={{ color: 'var(--success-600)' }} />
                              Detected Services ({scanDetails.services.length})
                            </h5>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                              {scanDetails.services.slice(0, 12).map((service, index) => (
                                <span key={index} style={{
                                  display: 'inline-block',
                                  backgroundColor: 'var(--success-50)',
                                  color: 'var(--success-700)',
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: 'var(--radius-full)',
                                  fontSize: '0.75rem',
                                  fontWeight: '500',
                                  border: '1px solid var(--success-200)'
                                }}>
                                  {typeof service === 'object' 
                                    ? `${service.name || service.service}${service.port ? `:${service.port}` : ''}`
                                    : service
                                  }
                                </span>
                              ))}
                              {scanDetails.services.length > 12 && (
                                <span style={{ 
                                  color: 'var(--text-tertiary)', 
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.5rem'
                                }}>
                                  +{scanDetails.services.length - 12} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Vulnérabilités critiques */}
                        {scanDetails.critical_vulnerabilities && Array.isArray(scanDetails.critical_vulnerabilities) && scanDetails.critical_vulnerabilities.length > 0 && (
                          <div style={{ marginBottom: '1.5rem' }}>
                            <h5 style={{ 
                              margin: '0 0 0.75rem 0', 
                              color: 'var(--error-600)',
                              fontSize: '1rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              <AlertOctagon size={16} style={{ color: 'var(--error-600)' }} />
                              Critical Vulnerabilities ({scanDetails.critical_vulnerabilities.length})
                            </h5>
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                              {scanDetails.critical_vulnerabilities.slice(0, 3).map((vuln, index) => (
                                <div key={index} style={{
                                  backgroundColor: 'var(--error-50)',
                                  border: '1px solid var(--error-200)',
                                  borderLeft: '4px solid var(--error-500)',
                                  padding: '1rem',
                                  borderRadius: 'var(--radius-md)'
                                }}>
                                  <div style={{ 
                                    fontWeight: '600', 
                                    color: 'var(--error-700)', 
                                    marginBottom: '0.5rem',
                                    fontSize: '0.875rem'
                                  }}>
                                    {vuln.name || vuln.title || `Critical vulnerability ${index + 1}`}
                                  </div>
                                  {vuln.description && (
                                    <div style={{ 
                                      color: 'var(--text-secondary)', 
                                      fontSize: '0.813rem',
                                      lineHeight: '1.5'
                                    }}>
                                      {vuln.description.length > 150 
                                        ? vuln.description.substring(0, 150) + '...'
                                        : vuln.description
                                      }
                                    </div>
                                  )}
                                  {vuln.port && (
                                    <div style={{ 
                                      marginTop: '0.5rem',
                                      fontSize: '0.75rem',
                                      color: 'var(--text-tertiary)'
                                    }}>
                                      Port: {vuln.port}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {scanDetails.critical_vulnerabilities.length > 3 && (
                                <div style={{ 
                                  color: 'var(--error-600)', 
                                  fontSize: '0.875rem', 
                                  fontStyle: 'italic',
                                  textAlign: 'center',
                                  padding: '0.5rem'
                                }}>
                                  ... and {scanDetails.critical_vulnerabilities.length - 3} more critical vulnerabilities
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Informations générales du scan */}
                        {(scanDetails.scan_duration || scanDetails.total_hosts || scanDetails.scan_type) && (
                          <div style={{ marginBottom: '1.5rem' }}>
                            <h5 style={{ 
                              margin: '0 0 0.75rem 0', 
                              color: 'var(--text-primary)',
                              fontSize: '1rem',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              <Info size={16} style={{ color: 'var(--primary-600)' }} />
                              Scan Information
                            </h5>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                              {scanDetails.scan_duration && (
                                <div style={{ 
                                  textAlign: 'center',
                                  padding: '1rem',
                                  backgroundColor: 'var(--gray-50)',
                                  borderRadius: 'var(--radius-md)',
                                  border: '1px solid var(--border-light)'
                                }}>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                                    Duration
                                  </div>
                                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '1.125rem' }}>
                                    {scanDetails.scan_duration}s
                                  </div>
                                </div>
                              )}
                              {scanDetails.total_hosts && (
                                <div style={{ 
                                  textAlign: 'center',
                                  padding: '1rem',
                                  backgroundColor: 'var(--gray-50)',
                                  borderRadius: 'var(--radius-md)',
                                  border: '1px solid var(--border-light)'
                                }}>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                                    Hosts
                                  </div>
                                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '1.125rem' }}>
                                    {scanDetails.total_hosts}
                                  </div>
                                </div>
                              )}
                              {scanDetails.scan_type && (
                                <div style={{ 
                                  textAlign: 'center',
                                  padding: '1rem',
                                  backgroundColor: 'var(--gray-50)',
                                  borderRadius: 'var(--radius-md)',
                                  border: '1px solid var(--border-light)'
                                }}>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                                    Type
                                  </div>
                                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '1.125rem' }}>
                                    {scanDetails.scan_type}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Données brutes en mode replié */}
                        <details style={{ cursor: 'pointer' }}>
                          <summary style={{ 
                            color: 'var(--text-primary)', 
                            fontSize: '0.875rem', 
                            fontWeight: '500',
                            padding: '0.75rem',
                            backgroundColor: 'var(--gray-50)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border-light)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <FileText size={16} />
                            View raw scan data
                          </summary>
                          <pre style={{
                            marginTop: '0.75rem',
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                            backgroundColor: 'var(--gray-50)',
                            padding: '1rem',
                            borderRadius: 'var(--radius-md)',
                            overflow: 'auto',
                            maxHeight: '300px',
                            border: '1px solid var(--border-light)'
                          }}>
                            {JSON.stringify(scanDetails, null, 2)}
                          </pre>
                        </details>
                      </div>
                    );
                  }

                  return null;
                })()}
              </div>
            </div>
          )}
        </>
      )}

      {/* Quick Scan Result - VERSION CORRIGÉE avec la bonne structure de données */}
      {quickScanResult && (
        <div
          className="card animate-fadeIn"
          style={{
            marginBottom: '2rem',
            borderLeft: `4px solid ${
              quickScanResult.overall_risk === 'critical' || quickScanResult.overall_risk === 'high'
                ? 'var(--error-500)'
                : quickScanResult.overall_risk === 'medium'
                ? 'var(--warning-500)'
                : 'var(--success-500)'
            }`
          }}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Zap size={20} style={{ color: 'var(--primary-600)' }} />
            Quick Security Check Results
          </h3>

          <div className="grid grid-cols-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
            {/* Overall Risk */}
            <InfoItem 
              label="Overall Risk" 
              value={quickScanResult.overall_risk?.toUpperCase() || 'UNKNOWN'}
              valueColor={getRiskLevelColor(quickScanResult.overall_risk)}
            />
            
            {/* Timestamp */}
            <InfoItem 
              label="Scan Date" 
              value={formatDate(quickScanResult.timestamp)}
            />
          </div>

          {/* Checks détaillés */}
          {quickScanResult.checks && (
            <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
              
              {/* Critical Ports */}
              {quickScanResult.checks.critical_ports && (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'var(--gray-50)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)'
                  }}
                >
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Critical Ports Open
                  </p>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {quickScanResult.checks.critical_ports.open?.length > 0 
                      ? quickScanResult.checks.critical_ports.open.join(', ')
                      : 'None'}
                  </p>
                  {quickScanResult.checks.critical_ports.open?.length > 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--error-600)', marginTop: '0.25rem' }}>
                      ⚠️ {quickScanResult.checks.critical_ports.open.length} critical port(s) detected
                    </p>
                  )}
                </div>
              )}

              {/* SSL/TLS */}
              {quickScanResult.checks.ssl && (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'var(--gray-50)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)'
                  }}
                >
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    SSL/TLS Status
                  </p>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: 600, 
                    color: quickScanResult.checks.ssl.secure ? 'var(--success-600)' : 'var(--error-600)' 
                  }}>
                    {quickScanResult.checks.ssl.secure ? '✅ Secure' : '⚠️ Vulnerable'}
                  </p>
                  {quickScanResult.checks.ssl.protocol && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Protocol: {quickScanResult.checks.ssl.protocol}
                    </p>
                  )}
                </div>
              )}

              {/* Open Ports */}
              {quickScanResult.checks.open_ports && (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'var(--gray-50)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)'
                  }}
                >
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Open Ports
                  </p>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {Array.isArray(quickScanResult.checks.open_ports) 
                      ? quickScanResult.checks.open_ports.length 
                      : 0}
                  </p>
                </div>
              )}

              {/* Services */}
              {quickScanResult.checks.services && (
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'var(--gray-50)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)'
                  }}
                >
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Services Detected
                  </p>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {Array.isArray(quickScanResult.checks.services) 
                      ? quickScanResult.checks.services.length 
                      : 0}
                  </p>
                </div>
              )}
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
                    style={{ cursor: 'pointer' }}
                    onClick={() => setExpandedVuln(isExpanded ? null : index)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', flex: 1 }}>
                        <Icon size={20} style={{ color: config.color, marginTop: '0.125rem', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0 }}>
                              {vuln.type || 'Unknown Vulnerability'}
                            </h4>
                            {vuln.cve && (
                              <span
                                className="badge"
                                style={{
                                  backgroundColor: 'white',
                                  color: config.color,
                                  border: `1px solid ${config.borderColor}`,
                                  fontSize: '0.688rem'
                                }}
                              >
                                {vuln.cve}
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '0.813rem', color: 'var(--text-secondary)', margin: 0 }}>
                            {vuln.description}
                          </p>
                          {(vuln.port || vuln.service) && (
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                              {vuln.port && <span>Port: {vuln.port}</span>}
                              {vuln.service && <span>Service: {vuln.service}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && vuln.remediation && (
                    <div
                      style={{
                        marginTop: '0.75rem',
                        paddingTop: '0.75rem',
                        borderTop: '1px solid var(--border-light)'
                      }}
                    >
                      <p style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-tertiary)' }}>
                        REMEDIATION
                      </p>
                      <p style={{ fontSize: '0.813rem', color: 'var(--text-secondary)', margin: 0 }}>
                        {vuln.remediation}
                      </p>
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
            Security Recommendations
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {recommendations.map((rec, index) => {
              const config = getSeverityConfig(rec.priority);
              const Icon = config.icon;

              return (
                <div
                  key={index}
                  style={{
                    padding: '0.875rem',
                    backgroundColor: config.bgColor,
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${config.borderColor}`,
                    borderLeft: `4px solid ${config.color}`
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <Icon size={20} style={{ color: config.color, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                          {rec.title || rec.action}
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
                        {rec.description || rec.details}
                      </p>
                      {rec.action && rec.title && (
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
                        {formatDate(scan.started_at || scan.created_at)}
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

                  {(scan.vulnerabilities_found > 0 || scan.vulnerability_count > 0) && (
                    <p
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--error-600)',
                        marginTop: '0.5rem',
                        fontWeight: 500
                      }}
                    >
                      {scan.vulnerabilities_found || scan.vulnerability_count} vulnerabilities found
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!currentScan && vulnerabilities.length === 0 && !quickScanResult && (
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