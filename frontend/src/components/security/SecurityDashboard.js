import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Alert from '../common/Alert';
import Loading from '../common/Loading';

// Configuration API
const API_URL = process.env.REACT_APP_API_URL || '/api/v1';

// API de sécurité
const securityApi = {
  startSecurityScan: (serverId) => 
    axios.post(`${API_URL}/security/${serverId}/scan`),
  
  getSecurityScans: (serverId) => 
    axios.get(`${API_URL}/security/${serverId}/scans`),
  
  getScanDetails: (scanId) => 
    axios.get(`${API_URL}/security/scan/${scanId}`),
  
  getRecommendations: (serverId) => 
    axios.get(`${API_URL}/security/recommendations/${serverId}`),
  
  quickSecurityCheck: (serverId) =>
    axios.post(`${API_URL}/security/scan/quick/${serverId}`)
};

const SecurityDashboard = ({ serverId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [quickScanning, setQuickScanning] = useState(false);
  const [scans, setScans] = useState([]);
  const [currentScan, setCurrentScan] = useState(null);
  const [vulnerabilities, setVulnerabilities] = useState([]);
  const [quickScanResult, setQuickScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    if (serverId) {
      fetchSecurityScans();
    }
  }, [serverId]);

  // Récupérer l'historique des scans
  const fetchSecurityScans = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await securityApi.getSecurityScans(serverId);
      setScans(response.data || []);
      
      // Si un scan est terminé, charger ses détails
      const completedScan = response.data?.find(scan => scan.status === 'completed');
      if (completedScan) {
        await fetchScanDetails(completedScan.id);
      }
    } catch (err) {
      console.error('Error loading scans:', err);
      // Ne pas afficher d'erreur si c'est juste qu'il n'y a pas de scans
      if (err.response?.status !== 404) {
        setError('Error loading scans: ' + (err.response?.data?.detail || err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  // Récupérer les détails d'un scan
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

  // Lancer un scan rapide
  const startQuickScan = async () => {
    try {
      setQuickScanning(true);
      setError(null);
      
      const response = await securityApi.quickSecurityCheck(serverId);
      setQuickScanResult(response.data);
      setSuccessMessage('Quick scan completed!');
      
      // Si un scan_id est retourné, rafraîchir la liste des scans
      if (response.data.scan_id) {
        await fetchSecurityScans();
        // Optionnellement, charger les détails du scan rapide
        if (response.data.status === 'completed') {
          await fetchScanDetails(response.data.scan_id);
        }
      }
      
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError('Quick scan error: ' + (err.response?.data?.detail || err.message));
    } finally {
      setQuickScanning(false);
    }
  };

  // Lancer un nouveau scan de sécurité complet
  const startSecurityScan = async () => {
    try {
      setScanning(true);
      setError(null);
      setSuccessMessage(null);
      
      const response = await securityApi.startSecurityScan(serverId);
      const scanId = response.data.scan_id;
      
      setSuccessMessage('Security scan started! Checking status...');
      
      // Polling pour vérifier le statut du scan
      let pollCount = 0;
      const maxPolls = 30; // Max 30 tentatives (90 secondes)
      
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
            // Continuer le polling
            setTimeout(checkScanStatus, 3000);
          }
        } catch (err) {
          setScanning(false);
          setError('Error checking scan status: ' + err.message);
        }
      };
      
      // Démarrer le polling après 2 secondes
      setTimeout(checkScanStatus, 2000);
      
    } catch (err) {
      setError('Error starting scan: ' + (err.response?.data?.detail || err.message));
      setScanning(false);
    }
  };

  // Déterminer la couleur en fonction de la sévérité
  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c';
      case 'medium': return '#d97706';
      case 'low': return '#65a30d';
      case 'info': return '#2563eb';
      default: return '#6b7280';
    }
  };

  // Déterminer la couleur du niveau de risque
  const getRiskLevelColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c';
      case 'medium': return '#d97706';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  // Formater la date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US');
  };

  if (loading) {
    return <Loading message="Loading security data..." />;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      {/* En-tête moderne */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
{/*           <div style={{
            width: '48px',
            height: '48px',
            backgroundColor: '#dc2626',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px'
          }}>
            🔒
          </div> */}
          <div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '2rem', 
              fontWeight: '700',
              color: '#1f2937'
            }}>
              Security Analysis
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '1rem' }}>
              Vulnerability monitoring and security recommendations
            </p>
          </div>
        </div>
        
        {error && <Alert type="error" message={error} />}
        {successMessage && <Alert type="success" message={successMessage} duration={3000} />}
        
        {/* Boutons d'action modernes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={startSecurityScan}
            disabled={scanning}
            className="btn btn-primary"
            style={{
              opacity: scanning ? 0.7 : 1,
              cursor: scanning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            {scanning ? (
              <>
                <div className="loading-spinner" style={{ width: '16px', height: '16px' }}></div>
                Scanning...
              </>
            ) : (
              <>🔍 Full Scan</>
            )}
          </button>
          
          <button
            onClick={startQuickScan}
            disabled={quickScanning}
            className="btn btn-success"
            style={{
              opacity: quickScanning ? 0.7 : 1,
              cursor: quickScanning ? 'not-allowed' : 'pointer'
            }}
          >
            {quickScanning ? 'Checking...' : '⚡ Quick Scan'}
          </button>
          
          <button
            onClick={fetchSecurityScans}
            className="btn btn-secondary"
          >
            🔄 Refresh
          </button>
          
          <button
            onClick={() => navigate(`/servers/${serverId}`)}
            className="btn btn-secondary"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Résultat du scan rapide */}
      {quickScanResult && (
        <div className="card mb-6" style={{
          borderLeft: '4px solid #2563eb',
          backgroundColor: '#eff6ff'
        }}>
          <div className="card-body">
            <h3 style={{ 
              margin: '0 0 1rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#1e40af'
            }}>
              ⚡ Quick Scan Results
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Overall Risk
                </div>
                <div style={{
                  display: 'inline-block',
                  padding: '0.5rem 1rem',
                  borderRadius: '12px',
                  backgroundColor: getRiskLevelColor(quickScanResult.overall_risk),
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.875rem'
                }}>
                  {quickScanResult.overall_risk?.toUpperCase() || 'UNKNOWN'}
                </div>
              </div>
              
              {quickScanResult.checks?.critical_ports && (
                <div className="card" style={{ padding: '1rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Critical Ports Open
                  </div>
                  <div style={{ fontWeight: '600', color: '#1f2937' }}>
                    {quickScanResult.checks.critical_ports.open.length > 0 
                      ? quickScanResult.checks.critical_ports.open.join(', ')
                      : '✅ None'}
                  </div>
                </div>
              )}
              
              {quickScanResult.checks?.ssl && (
                <div className="card" style={{ padding: '1rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    SSL/TLS
                  </div>
                  <div style={{ fontWeight: '600', color: quickScanResult.checks.ssl.secure ? '#10b981' : '#dc2626' }}>
                    {quickScanResult.checks.ssl.secure ? '✅ Secure' : '⚠️ Vulnerable'}
                    {quickScanResult.checks.ssl.protocol && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal' }}>
                        {quickScanResult.checks.ssl.protocol}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Résumé du dernier scan complet */}
      {currentScan && (
        <div className="card mb-6">
          <div className="card-body">
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ 
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: '#1f2937'
              }}>
                📊 Latest Full Scan
              </h3>
              <div style={{
                padding: '0.5rem 1rem',
                borderRadius: '12px',
                backgroundColor: getRiskLevelColor(currentScan.risk_level) + '20',
                color: getRiskLevelColor(currentScan.risk_level),
                fontWeight: '600',
                fontSize: '0.875rem'
              }}>
                Risk: {currentScan.risk_level?.toUpperCase() || 'UNKNOWN'}
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Scan Date
                </div>
                <div style={{ fontWeight: '600', color: '#1f2937', fontSize: '0.875rem' }}>
                  {formatDate(currentScan.completed_at || currentScan.started_at)}
                </div>
              </div>
              
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Total Vulnerabilities
                </div>
                <div style={{ 
                  fontSize: '1.5rem', 
                  fontWeight: 'bold',
                  color: currentScan.vulnerability_count > 0 ? '#dc2626' : '#10b981'
                }}>
                  {currentScan.vulnerability_count || 0}
                </div>
              </div>
              
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  Critical
                </div>
                <div style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: 'bold',
                  color: '#dc2626'
                }}>
                  {currentScan.critical_count || 0}
                </div>
              </div>
              
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  High
                </div>
                <div style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: 'bold',
                  color: '#ea580c'
                }}>
                  {currentScan.high_count || 0}
                </div>
              </div>
            </div>

            {/* SECTION SCAN DETAILS */}
            {currentScan.scan_details && (
              <div style={{ 
                padding: '1.5rem', 
                backgroundColor: '#f9fafb', 
                borderRadius: '0.75rem',
                border: '1px solid #e5e7eb'
              }}>
                <h4 style={{ 
                  margin: '0 0 1rem 0', 
                  color: '#374151', 
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  🔍 Scan Details
                </h4>
                
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
                          color: '#6b7280',
                          fontFamily: 'monospace',
                          backgroundColor: '#ffffff',
                          padding: '1rem',
                          borderRadius: '0.5rem',
                          whiteSpace: 'pre-wrap',
                          border: '1px solid #e5e7eb'
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
                              color: '#374151',
                              fontSize: '1rem',
                              fontWeight: '600'
                            }}>
                              🔌 Open Ports ({scanDetails.open_ports.length})
                            </h5>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                              {scanDetails.open_ports.slice(0, 15).map((port, index) => (
                                <span key={index} style={{
                                  display: 'inline-block',
                                  backgroundColor: '#dbeafe',
                                  color: '#1e40af',
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: '500'
                                }}>
                                  {typeof port === 'object' ? `${port.port}/${port.protocol}` : port}
                                </span>
                              ))}
                              {scanDetails.open_ports.length > 15 && (
                                <span style={{ 
                                  color: '#6b7280', 
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.5rem'
                                }}>
                                  +{scanDetails.open_ports.length - 15} others
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
                              color: '#374151',
                              fontSize: '1rem',
                              fontWeight: '600'
                            }}>
                              🛠️ Detected Services ({scanDetails.services.length})
                            </h5>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                              {scanDetails.services.slice(0, 12).map((service, index) => (
                                <span key={index} style={{
                                  display: 'inline-block',
                                  backgroundColor: '#dcfce7',
                                  color: '#166534',
                                  padding: '0.25rem 0.75rem',
                                  borderRadius: '12px',
                                  fontSize: '0.75rem',
                                  fontWeight: '500'
                                }}>
                                  {typeof service === 'object' 
                                    ? `${service.name || service.service}${service.port ? `:${service.port}` : ''}`
                                    : service
                                  }
                                </span>
                              ))}
                              {scanDetails.services.length > 12 && (
                                <span style={{ 
                                  color: '#6b7280', 
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.5rem'
                                }}>
                                  +{scanDetails.services.length - 12} others
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
                              color: '#dc2626',
                              fontSize: '1rem',
                              fontWeight: '600'
                            }}>
                              🚨 Critical Vulnerabilities ({scanDetails.critical_vulnerabilities.length})
                            </h5>
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                              {scanDetails.critical_vulnerabilities.slice(0, 3).map((vuln, index) => (
                                <div key={index} className="card" style={{
                                  backgroundColor: '#fef2f2',
                                  border: '1px solid #fecaca',
                                  padding: '1rem'
                                }}>
                                  <div style={{ 
                                    fontWeight: '600', 
                                    color: '#dc2626', 
                                    marginBottom: '0.5rem'
                                  }}>
                                    {vuln.name || vuln.title || `Critical vulnerability ${index + 1}`}
                                  </div>
                                  {vuln.description && (
                                    <div style={{ 
                                      color: '#6b7280', 
                                      fontSize: '0.8rem',
                                      lineHeight: '1.4'
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
                                      color: '#9ca3af'
                                    }}>
                                      Port: {vuln.port}
                                    </div>
                                  )}
                                </div>
                              ))}
                              {scanDetails.critical_vulnerabilities.length > 3 && (
                                <div style={{ 
                                  color: '#dc2626', 
                                  fontSize: '0.875rem', 
                                  fontStyle: 'italic',
                                  textAlign: 'center',
                                  padding: '0.5rem'
                                }}>
                                  ... and {scanDetails.critical_vulnerabilities.length - 3} other critical vulnerabilities
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
                              color: '#374151',
                              fontSize: '1rem',
                              fontWeight: '600'
                            }}>
                              ℹ️ Scan Information
                            </h5>
                            <div className="grid grid-cols-3 gap-4">
                              {scanDetails.scan_duration && (
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Duration</div>
                                  <div style={{ fontWeight: '600', color: '#374151' }}>
                                    {scanDetails.scan_duration}s
                                  </div>
                                </div>
                              )}
                              {scanDetails.total_hosts && (
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Hosts</div>
                                  <div style={{ fontWeight: '600', color: '#374151' }}>
                                    {scanDetails.total_hosts}
                                  </div>
                                </div>
                              )}
                              {scanDetails.scan_type && (
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Type</div>
                                  <div style={{ fontWeight: '600', color: '#374151' }}>
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
                            color: '#374151', 
                            fontSize: '0.875rem', 
                            fontWeight: '500',
                            padding: '0.5rem',
                            backgroundColor: '#ffffff',
                            borderRadius: '0.5rem',
                            border: '1px solid #e5e7eb'
                          }}>
                            📄 View all raw scan data
                          </summary>
                          <pre style={{
                            marginTop: '0.75rem',
                            fontSize: '0.75rem',
                            color: '#6b7280',
                            backgroundColor: '#ffffff',
                            padding: '1rem',
                            borderRadius: '0.5rem',
                            overflow: 'auto',
                            maxHeight: '300px',
                            border: '1px solid #e5e7eb'
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
            )}
          </div>
        </div>
      )}

      {/* Liste des vulnérabilités */}
      {vulnerabilities && vulnerabilities.length > 0 && (
        <div className="card mb-6">
          <div className="card-body">
            <h3 style={{ 
              margin: '0 0 1.5rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#1f2937'
            }}>
              🚨 Detected Vulnerabilities ({vulnerabilities.length})
            </h3>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              {vulnerabilities.map((vuln, index) => (
                <div key={index} className="card" style={{
                  borderLeft: `4px solid ${getSeverityColor(vuln.severity)}`,
                  backgroundColor: '#fafafa'
                }}>
                  <div className="card-body">
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'flex-start',
                      marginBottom: '1rem'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.75rem', 
                          marginBottom: '0.5rem',
                          flexWrap: 'wrap'
                        }}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '12px',
                            backgroundColor: getSeverityColor(vuln.severity),
                            color: 'white',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            {vuln.severity?.toUpperCase()}
                          </span>
                          <span style={{ fontWeight: '600', color: '#1f2937' }}>
                            {vuln.type?.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          {vuln.port && (
                            <span style={{ 
                              color: '#6b7280', 
                              fontSize: '0.875rem',
                              backgroundColor: '#f3f4f6',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '6px'
                            }}>
                              Port {vuln.port}
                            </span>
                          )}
                          {vuln.service && (
                            <span style={{ 
                              color: '#6b7280', 
                              fontSize: '0.875rem',
                              backgroundColor: '#f3f4f6',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '6px'
                            }}>
                              {vuln.service}
                            </span>
                          )}
                          {vuln.cve && (
                            <span style={{
                              backgroundColor: '#eff6ff',
                              color: '#2563eb',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: '500'
                            }}>
                              {vuln.cve}
                            </span>
                          )}
                        </div>
                        
                        <p style={{ 
                          margin: '0.5rem 0', 
                          color: '#374151',
                          lineHeight: '1.5'
                        }}>
                          {vuln.description}
                        </p>
                        
                        {vuln.remediation && (
                          <div style={{
                            marginTop: '1rem',
                            padding: '1rem',
                            backgroundColor: '#f0fdf4',
                            borderRadius: '0.5rem',
                            border: '1px solid #bbf7d0'
                          }}>
                            <div style={{ 
                              fontWeight: '600', 
                              color: '#166534',
                              marginBottom: '0.5rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>
                              💡 Remediation
                            </div>
                            <p style={{ 
                              margin: 0, 
                              color: '#166534',
                              fontSize: '0.875rem',
                              lineHeight: '1.4'
                            }}>
                              {vuln.remediation}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recommandations */}
      {currentScan?.recommendations && Array.isArray(currentScan.recommendations) && currentScan.recommendations.length > 0 && (
        <div className="card mb-6">
          <div className="card-body">
            <h3 style={{ 
              margin: '0 0 1.5rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#1f2937'
            }}>
              📋 Security Recommendations
            </h3>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              {currentScan.recommendations.map((rec, index) => (
                <div key={index} className="card" style={{
                  borderLeft: `4px solid ${
                    rec.priority === 'critical' ? '#dc2626' :
                    rec.priority === 'high' ? '#ea580c' :
                    rec.priority === 'medium' ? '#d97706' : '#10b981'
                  }`,
                  backgroundColor: '#fafafa'
                }}>
                  <div className="card-body">
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.75rem', 
                      marginBottom: '0.75rem'
                    }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        borderRadius: '12px',
                        backgroundColor: rec.priority === 'critical' ? '#dc2626' :
                                       rec.priority === 'high' ? '#ea580c' :
                                       rec.priority === 'medium' ? '#d97706' : '#10b981',
                        color: 'white',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}>
                        {rec.priority?.toUpperCase()}
                      </span>
                      <span style={{ 
                        fontWeight: '600',
                        color: '#1f2937',
                        textTransform: 'capitalize'
                      }}>
                        {rec.category}
                      </span>
                    </div>
                    
                    <h4 style={{ 
                      margin: '0 0 0.5rem 0', 
                      color: '#374151',
                      fontSize: '1.125rem'
                    }}>
                      {rec.action}
                    </h4>
                    <p style={{ 
                      margin: 0, 
                      color: '#6b7280',
                      lineHeight: '1.5'
                    }}>
                      {rec.details}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Historique des scans */}
      {scans.length > 0 && (
        <div className="card">
          <div className="card-body">
            <h3 style={{ 
              margin: '0 0 1.5rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#1f2937'
            }}>
              📜 Scan History
            </h3>
            
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Risk</th>
                    <th>Vulnerabilities</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => (
                    <tr key={scan.id}>
                      <td style={{ fontSize: '0.875rem' }}>
                        {formatDate(scan.started_at)}
                      </td>
                      <td>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '12px',
                          backgroundColor: scan.vulnerability_count === 0 ? '#dcfce7' : 
                                         scan.vulnerability_count < 5 ? '#fef3c7' : '#fef2f2',
                          color: scan.vulnerability_count === 0 ? '#166534' : 
                                 scan.vulnerability_count < 5 ? '#92400e' : '#991b1b',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}>
                          {scan.vulnerability_count > 10 ? 'Full' : 'Quick'}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '12px',
                          backgroundColor: scan.status === 'completed' ? '#dcfce7' :
                                         scan.status === 'failed' ? '#fef2f2' :
                                         scan.status === 'in_progress' ? '#dbeafe' : '#f3f4f6',
                          color: scan.status === 'completed' ? '#166534' :
                                 scan.status === 'failed' ? '#991b1b' :
                                 scan.status === 'in_progress' ? '#1e40af' : '#374151',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}>
                          {scan.status}
                        </span>
                      </td>
                      <td>
                        {scan.risk_level && (
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '12px',
                            backgroundColor: getRiskLevelColor(scan.risk_level) + '20',
                            color: getRiskLevelColor(scan.risk_level),
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            {scan.risk_level.toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: '600' }}>
                        {scan.vulnerability_count || 0}
                      </td>
                      <td>
                        {scan.status === 'completed' && (
                          <button
                            onClick={() => fetchScanDetails(scan.id)}
                            className="btn btn-primary"
                            style={{ 
                              fontSize: '0.75rem',
                              padding: '0.375rem 0.75rem'
                            }}
                          >
                            View Details
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Message si aucun scan */}
      {scans.length === 0 && !scanning && !currentScan && (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔍</div>
            <h3 style={{ margin: '0 0 1rem 0', color: '#1f2937' }}>
              No security scans performed
            </h3>
            <p style={{ 
              color: '#6b7280', 
              margin: '0 0 2rem 0',
              fontSize: '1.125rem'
            }}>
              Run your first scan to detect potential vulnerabilities on this server
            </p>
            <div style={{ 
              display: 'flex', 
              gap: '1rem', 
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={startSecurityScan}
                className="btn btn-primary"
                style={{ fontSize: '1rem', padding: '0.75rem 2rem' }}
              >
                🔍 Run Full Scan
              </button>
              <button
                onClick={startQuickScan}
                className="btn btn-success"
                style={{ fontSize: '1rem', padding: '0.75rem 2rem' }}
              >
                ⚡ Quick Scan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecurityDashboard;