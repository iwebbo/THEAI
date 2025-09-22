import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import serverApi from '../../services/api';
import Alert from '../common/Alert';

const ServerForm = ({ serverId }) => {
  const navigate = useNavigate();
  const isEditMode = !!serverId;
  
  const [formData, setFormData] = useState({
    name: '',
    hostname: '',
    ip_address: '',
    description: '',
    enabled: true,
    protocols: 'icmp',
    
    // HTTP settings
    http_port: 80,
    http_path: '/',
    use_https: false,
    
    // SSH settings
    ssh_port: 22,
    ssh_username: '',
    ssh_password: '',
    ssh_key_path: '',
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [protocolOptions, setProtocolOptions] = useState({
    icmp: true,
    http: false,
    ssh: false
  });

  // Charger les données du serveur en mode édition
  useEffect(() => {
    if (isEditMode) {
      fetchServerData();
    }
  }, [serverId]);

  // Récupérer les données du serveur à éditer
  const fetchServerData = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getServer(serverId);
      const serverData = response.data;
      
      // Mettre à jour le formulaire avec les données du serveur
      setFormData({
        name: serverData.name || '',
        hostname: serverData.hostname || '',
        ip_address: serverData.ip_address || '',
        description: serverData.description || '',
        enabled: serverData.enabled ?? true,
        protocols: serverData.protocols || 'icmp',
        
        http_port: serverData.http_port || 80,
        http_path: serverData.http_path || '/',
        use_https: serverData.use_https || false,
        
        ssh_port: serverData.ssh_port || 22,
        ssh_username: serverData.ssh_username || '',
        ssh_password: serverData.ssh_password || '',
        ssh_key_path: serverData.ssh_key_path || '',
      });
      
      // Mettre à jour les options de protocole
      const protocols = serverData.protocols.split(',');
      setProtocolOptions({
        icmp: protocols.includes('icmp'),
        http: protocols.includes('http'),
        ssh: protocols.includes('ssh')
      });
      
    } catch (err) {
      setError('Erreur lors du chargement des données du serveur: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Mettre à jour les valeurs du formulaire
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  // Gérer les changements de protocoles (checkboxes)
  const handleProtocolChange = (e) => {
    const { name, checked } = e.target;
    
    // Mettre à jour les options de protocole sélectionnées
    const updatedProtocolOptions = {
      ...protocolOptions,
      [name]: checked
    };
    
    setProtocolOptions(updatedProtocolOptions);
    
    // Convertir les options en chaîne de caractères séparée par des virgules pour l'API
    const selectedProtocols = Object.entries(updatedProtocolOptions)
      .filter(([_, isSelected]) => isSelected)
      .map(([protocol]) => protocol)
      .join(',');
    
    // Mettre à jour le champ protocols dans formData
    setFormData({
      ...formData,
      protocols: selectedProtocols || 'icmp' // Default to ICMP if nothing selected
    });
  };

  // Soumettre le formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      if (isEditMode) {
        // Mise à jour d'un serveur existant
        await serverApi.updateServer(serverId, formData);
      } else {
        // Création d'un nouveau serveur
        await serverApi.createServer(formData);
      }
      
      // Rediriger vers la liste des serveurs
      navigate('/servers');
      
    } catch (err) {
      setError('Erreur lors de l\'enregistrement du serveur: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Styles pour le formulaire
  const styles = {
    form: {
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    },
    formGroup: {
      marginBottom: '20px'
    },
    label: {
      display: 'block',
      marginBottom: '8px',
      fontWeight: 'bold'
    },
    input: {
      width: '100%',
      padding: '10px',
      borderRadius: '4px',
      border: '1px solid #ddd',
      fontSize: '16px'
    },
    checkbox: {
      marginRight: '8px'
    },
    checkboxLabel: {
      display: 'flex',
      alignItems: 'center',
      marginRight: '20px'
    },
    checkboxGroup: {
      display: 'flex',
      marginTop: '10px'
    },
    buttonGroup: {
      display: 'flex',
      justifyContent: 'space-between',
      marginTop: '30px'
    },
    submitButton: {
      backgroundColor: '#2196f3',
      color: 'white',
      border: 'none',
      padding: '12px 24px',
      borderRadius: '4px',
      fontSize: '16px',
      cursor: 'pointer'
    },
    cancelButton: {
      backgroundColor: '#f5f5f5',
      color: '#333',
      border: '1px solid #ddd',
      padding: '12px 24px',
      borderRadius: '4px',
      fontSize: '16px',
      cursor: 'pointer'
    },
    sectionTitle: {
      borderBottom: '1px solid #eee',
      paddingBottom: '10px',
      marginTop: '30px',
      marginBottom: '20px',
      color: '#555'
    }
  };

  return (
    <div style={styles.form}>
      <h1>{isEditMode ? 'Modify server' : 'Add new server'}</h1>
      
      {error && <Alert type="error" message={error} />}
      
      <form onSubmit={handleSubmit}>
        {/* Informations de base */}
        <h2 style={styles.sectionTitle}>Informations</h2>
        
        <div style={styles.formGroup}>
          <label style={styles.label} htmlFor="name">Name</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            style={styles.input}
          />
        </div>
        
        <div style={styles.formGroup}>
          <label style={styles.label} htmlFor="hostname">Hostname</label>
          <input
            type="text"
            id="hostname"
            name="hostname"
            value={formData.hostname}
            onChange={handleInputChange}
            required
            style={styles.input}
          />
        </div>
        
        <div style={styles.formGroup}>
          <label style={styles.label} htmlFor="ip_address">IP</label>
          <input
            type="text"
            id="ip_address"
            name="ip_address"
            value={formData.ip_address}
            onChange={handleInputChange}
            required
            style={styles.input}
          />
        </div>
        
        <div style={styles.formGroup}>
          <label style={styles.label} htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            style={{...styles.input, height: '100px'}}
          />
        </div>
        
        <div style={styles.formGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              name="enabled"
              checked={formData.enabled}
              onChange={handleInputChange}
              style={styles.checkbox}
            />
            Enable monitoring
          </label>
        </div>
        
        {/* Protocoles de monitoring */}
        <h2 style={styles.sectionTitle}>Protocols</h2>
        
        <div style={styles.formGroup}>
          <label style={styles.label}>Protocols to be use</label>
          <div style={styles.checkboxGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                name="icmp"
                checked={protocolOptions.icmp}
                onChange={handleProtocolChange}
                style={styles.checkbox}
              />
              ICMP (Ping)
            </label>
            
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                name="http"
                checked={protocolOptions.http}
                onChange={handleProtocolChange}
                style={styles.checkbox}
              />
              HTTP/HTTPS
            </label>
            
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                name="ssh"
                checked={protocolOptions.ssh}
                onChange={handleProtocolChange}
                style={styles.checkbox}
              />
              SSH
            </label>
          </div>
        </div>
        
        {/* Paramètres HTTP */}
        {protocolOptions.http && (
          <>
            <h2 style={styles.sectionTitle}>Paramètres HTTP</h2>
            
            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  name="use_https"
                  checked={formData.use_https}
                  onChange={handleInputChange}
                  style={styles.checkbox}
                />
                Utiliser HTTPS
              </label>
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="http_port">Port HTTP</label>
              <input
                type="number"
                id="http_port"
                name="http_port"
                value={formData.http_port}
                onChange={handleInputChange}
                style={styles.input}
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="http_path">Path</label>
              <input
                type="text"
                id="http_path"
                name="http_path"
                value={formData.http_path}
                onChange={handleInputChange}
                style={styles.input}
              />
            </div>
          </>
        )}
        
        {/* Paramètres SSH */}
        {protocolOptions.ssh && (
          <>
            <h2 style={styles.sectionTitle}>Parameters SSH</h2>
            
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="ssh_port">Port SSH</label>
              <input
                type="number"
                id="ssh_port"
                name="ssh_port"
                value={formData.ssh_port}
                onChange={handleInputChange}
                style={styles.input}
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="ssh_username">Username SSH</label>
              <input
                type="text"
                id="ssh_username"
                name="ssh_username"
                value={formData.ssh_username}
                onChange={handleInputChange}
                style={styles.input}
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="ssh_password">Password SSH</label>
              <input
                type="password"
                id="ssh_password"
                name="ssh_password"
                value={formData.ssh_password}
                onChange={handleInputChange}
                style={styles.input}
              />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label} htmlFor="ssh_key_path">Path of private key SSH (optionnal)</label>
              <input
                type="text"
                id="ssh_key_path"
                name="ssh_key_path"
                value={formData.ssh_key_path}
                onChange={handleInputChange}
                style={styles.input}
              />
            </div>
          </>
        )}
        
        <div style={styles.buttonGroup}>
          <button
            type="button"
            onClick={() => navigate('/servers')}
            style={styles.cancelButton}
          >
            Annuler
          </button>
          
          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitButton,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Saving...' : isEditMode ? 'Update' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ServerForm;