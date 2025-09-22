# THEAI Monitoring & Vulnerability Platform

A modern, professional server monitoring application built with React frontend and FastAPI backend. Monitor your servers in real-time using multiple protocols (ICMP, HTTP, SSH) with an intuitive dashboard interface.

![License](https://img.shields.io/badge/MIT-00599C?style=for-the-badge&logo=MIT&logoColor=black)
![Python](https://img.shields.io/badge/Python-4EAA25?style=for-the-badge&logo=Python&logoColor=black)
![React](https://img.shields.io/badge/React-4EAA25?style=for-the-badge&logo=React&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-0078D6?style=for-the-badge&logo=Docker&logoColor=black)

## Features

### Current Features
- **Multi-Protocol Monitoring**: Support for ICMP (ping), HTTP/HTTPS, and SSH monitoring
- **Real-time Dashboard**: Modern, responsive interface with server status overview
- **Server Management**: Add, edit, delete, and configure servers to monitor
- **Automated Checks**: Periodic server health checks with configurable intervals
- **Status Tracking**: Visual status indicators and response time monitoring
- **Modern UI**: Professional interface with customizable themes
- **Settings Panel**: Configure monitoring intervals, alerts, and preferences
- **Dockerized Deployment**: Complete containerized setup with Docker Compose
- **Authentication System**: JWT-based login with environment-configured default user

### Monitoring Capabilities
- **ICMP Ping**: Basic connectivity testing with response time measurement
- **HTTP/HTTPS Monitoring**: Web service availability with custom ports and paths
- **SSH Connectivity**: SSH service monitoring with authentication support
- **Response Time Tracking**: Monitor and track server response times
- **Status History**: Track server status changes over time

## Security & Vulnerability Management

### Current Security Measures
- **Input Validation**: All user inputs are validated and sanitized
- **SQL Injection Protection**: Using SQLAlchemy ORM with parameterized queries
- **CORS Configuration**: Properly configured Cross-Origin Resource Sharing
- **Environment Variables**: Sensitive data stored in environment variables
- **Docker Security**: Non-root containers and minimal attack surface
- **JWT Authentication**: Secure token-based authentication system

### Known Security Considerations
- **SSH Credentials**: Currently stored in database (encryption planned)
- **HTTPS**: Currently HTTP only (TLS termination recommended)
- **Rate Limiting**: No rate limiting implemented yet
- **Audit Logging**: Limited security event logging

### Vulnerability Assessment
This application is designed for internal network monitoring. For production deployment:
- Deploy behind a reverse proxy with TLS termination
- Implement network segmentation
- Regular security updates of dependencies
- Monitor for CVEs in used packages
- Consider implementing WAF (Web Application Firewall)

## Prerequisites

- **Docker** and **Docker Compose** installed on your machine
- **Git** for cloning the repository
- Minimum **2GB RAM** and **1GB storage** for optimal performance

## 🔧 Installation

### Quick Start with Docker

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd theai
   ```

2. **Configure authentication** (optional):
   Create a `.env` file at the root of the project:
   ```bash
   # Authentication Configuration
   SECRET_KEY=your-super-secret-jwt-key-change-this-in-production
   DEFAULT_ADMIN_USERNAME=admin
   DEFAULT_ADMIN_PASSWORD=SecurePassword123!
   DEFAULT_ADMIN_EMAIL=admin@theai.local
   ```

3. **Start the application**:
   ```bash
   docker-compose up -d
   ```

4. **Access the application**:
   - Frontend: http://localhost
   - API Documentation: http://localhost:8000/docs
   - Database: localhost:5432 (postgres/postgres)

### Default Login
The application automatically creates a default admin user on startup:
- **Username**: `admin` (or value from `DEFAULT_ADMIN_USERNAME` in .env)
- **Password**: `admin123` (or value from `DEFAULT_ADMIN_PASSWORD` in .env)

You can customize these credentials by setting the appropriate environment variables in your `.env` file.

### Manual Installation

#### Backend Setup
```bash
cd backend
pip install -r requirements.txt
cd app
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### Frontend Setup
```bash
cd frontend
npm install
npm start
```

#### Database Setup
```bash
# Using Docker for PostgreSQL
docker run --name postgres-monitoring \
  -e POSTGRES_DB=server_monitoring \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d postgres:15-alpine
```

## 🏗️ Architecture

The application consists of three main services:

### Frontend (React)
- **Technology**: React 18+ with modern hooks
- **Styling**: Custom CSS with CSS variables for theming
- **Routing**: React Router for SPA navigation
- **API Client**: Axios for HTTP requests
- **Charts**: Chart.js integration for data visualization
- **Authentication**: JWT token management with automatic login/logout

### Backend (FastAPI)
- **Technology**: Python 3.11+ with FastAPI framework
- **Database**: SQLAlchemy ORM with PostgreSQL
- **Monitoring**: Custom monitoring services for each protocol
- **Scheduling**: Background tasks for automated checks
- **Documentation**: Automatic OpenAPI/Swagger documentation
- **Authentication**: JWT-based authentication with bcrypt password hashing

### Database (PostgreSQL)
- **Version**: PostgreSQL 15+
- **Features**: ACID compliance, JSON support, full-text search
- **Backup**: Volume persistence for data safety
- **Performance**: Optimized queries and indexing

## 📖 Usage

### Adding Servers
1. Navigate to **"Servers"** → **"Add Server"**
2. Configure server details:
   - **Name**: Friendly server name
   - **Hostname/IP**: Server address
   - **Protocols**: Select monitoring methods (ICMP, HTTP, SSH)
   - **Protocol Settings**: Configure ports, paths, credentials

### Monitoring Dashboard
- **Server Overview**: Real-time status of all servers
- **Statistics**: Uptime percentages and response times
- **Alerts**: Visual indicators for offline servers
- **Quick Actions**: Manual server checks and status refresh

### Settings Configuration
- **Monitoring Intervals**: Configure check frequencies
- **Alert Thresholds**: Set response time limits
- **Notifications**: Enable/disable email alerts
- **Data Retention**: Configure data storage periods

## 🔮 Upcoming Features

### High Priority
- **Additional Protocols**: FTP, SMTP, DNS, TCP port monitoring
- **Vulnerability Scanning**: Integrated security assessment tools
- **SSO Authentication**: Single Sign-On integration (SAML, OAuth2, LDAP)

### Medium Priority
- **Advanced Alerting**: webhook notifications
- **Performance Metrics**: Detailed performance analytics and trending
- **Mobile App**: Native mobile application for monitoring

### Future Enhancements
- **AI-Powered Insights**: Predictive analytics and anomaly detection
- **Compliance Reporting**: Security and uptime compliance reports

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

### Development Guidelines
- Follow PEP 8 for Python code
- Use ESLint/Prettier for JavaScript code
- Write tests for new features
- Update documentation for API changes

## 📝 API Documentation

Access the interactive API documentation at:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Key Endpoints
- `GET /api/v1/servers` - List all servers
- `POST /api/v1/servers` - Create new server
- `GET /api/v1/servers/{id}/check` - Check server status
- `GET /api/v1/servers/check/all` - Check all servers
- `POST /api/v1/auth/login` - User authentication
- `GET /api/v1/auth/me` - Get current user info

## 🐛 Troubleshooting

### Common Issues

**Application won't start**:
```bash
# Check Docker logs
docker-compose logs -f

# Restart services
docker-compose down && docker-compose up -d
```

**Database connection errors**:
```bash
# Reset database
docker-compose down -v
docker-compose up -d
```

**Permission denied for ping**:
```bash
# On Linux, you may need to allow ping for non-root users
sudo sysctl net.ipv4.ping_group_range="0 2000"
```

### Getting Help
- Check the [Issues](../../issues) page for known problems
- Review Docker logs for error messages
- Ensure all required ports are available (80, 8000, 5432)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **FastAPI** for the excellent Python web framework
- **React** community for the frontend ecosystem
- **PostgreSQL** for reliable data storage
- **Docker** for containerization simplicity

---

**Built with ❤️ for system administrators and DevOps engineers**

For questions, suggestions, or support, please open an issue or contact the maintainers.