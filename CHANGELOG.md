# THEAI Changelog

## Version v.1.1.10 - [12/10/2026]

We are excited to announce a major update focusing on enhanced monitoring capabilities, improved data ingestion reliability, and significant architectural enhancements for integration with Grafana.

---

### New Features & Enhancements

#### Agent Monitoring Overhaul
The THEAI Agent has been significantly updated, providing more robust, secure, and comprehensive data collection across multiple operating systems.

*   **Enhanced Data Streams:** The agent now collects detailed information on:
    *   **Heartbeat:** CPU, RAM, Swap, Load, Uptime, Network, Disks (adjustable frequency).
    *   **Inventory:** OS, Kernel, installed packages (+ source package details) (collected every 30 minutes or upon hash change).
    *   **Ports:** TCP/UDP listening ports (collected every 5 minutes if changes are detected).
*   **Improved Cross-Platform Coverage:** Detailed metrics and inventory collection have been refined for specific OS families:
    *   **Linux Debian/Ubuntu/Alpine:** Full coverage, including process monitoring (if run as root) and **CVE correlation via OSV**.
    *   **Windows:** Comprehensive data on CPU, RAM, disks, network, and installed software.
    *   **AIX / FreeBSD / Solaris / macOS:** Best-effort metrics collection for stability and uptime tracking.
*   **Secure Enrollment Process:** The enrollment process has been streamlined: Users generate a time-limited token in the THEAI UI, which is exchanged on the target machine for a secure, server-specific API key.

#### Grafana Direct Monitoring Integration (New Architecture)
THEAI now supports direct monitoring data reading from PostgreSQL via Grafana, bypassing the need to pass through the backend API layer.

*   **Direct SQL Access:** Grafana can execute custom SQL queries directly against the `servers` and `server_check_history` tables in the Postgres database.
*   **Simplified Setup:** Credentials used for this direct connection must match those configured for the main THEAI backend.

#### NVD Data Ingestion Improvements
The process for integrating vulnerability data from the National Vulnerability Database (NVD) has been enhanced:

*   **API Key Flexibility:** The system now supports running without an explicit `NVD_API_KEY` set; however, using a valid key drastically improves performance.
    *   *Performance Note:* Without a key, the initial bootstrap process can take up to 20 minutes, compared to approximately 3 minutes with a valid API key.

---

### Improvements & Stability

#### Ingestor Deployment Reliability
The documentation and deployment guide for the data ingestor have been clarified to ensure smooth setup across different environments:

*   **Automated Scheduling:** The CronJob is now reliably created by Helm using `values.yaml` (defaulting to 03:00 UTC). No manual scheduling is required.
*   **Bootstrap & Delta Logic:** The first run automatically performs a full bootstrap of the database, while subsequent runs efficiently process only delta changes.
*   **Deployment Clarity:** Clear instructions are provided for mandatory steps (`helm upgrade --set ingestor.image.tag=`) and optional debugging commands (e.g., manual job creation/logging).

---

### Documentation & Guides Updates

*   **Agent Usage Guide:** The documentation now includes detailed, step-by-step guides for building and installing the agent across all major operating systems (Linux, Windows, AIX, etc.), including specific commands for `curl`, PowerShell, and native package managers.
*   **Security Best Practices:** Added comprehensive guidance on TLS requirements (`https://`) and setting up internal PKI using `THEAI_CA_FILE`.
*   **NVD Token Management Guide:** A dedicated process guide has been added detailing how to configure the NVD token via both environment variables and through a potential future front-end settings panel.
*   **Technical Documentation Cleanup:** General documentation has been reviewed for clarity, removing unnecessary code comments and correcting outdated HTTP path links.

---