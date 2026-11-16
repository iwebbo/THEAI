#  Version Checker — Software Version Monitoring Documentation

##  Overview
This tool keeps track of the software versions running across your infrastructure and compares them with the latest versions officially published by each vendor. It answers one question for every application: **"Am I up to date, and if not, how far behind am I?"**

The core purpose is to plan updates proactively: spot missing patches and minor releases early, and be aware of major releases (migrations) before they become urgent.

Supported applications: **Jenkins, SonarQube, Portainer, Grafana, Argo CD, Wiki.js, Gitea, OpenSearch, MinIO, Proxmox VE**. New applications can be added in the backend without any database change.

---

##  Key Functionalities & What It Monitors

The tool aggregates data across three pillars: **Installed version**, **Latest official version**, and **Comparison**.

###  1. Installed Version (Local)
*   **What it tracks:** The version really running on each instance, read directly from the application through its own API (read-only calls).
*   **Data Displayed:** The `Installed` column of the dashboard (e.g., `2.528.3`).
*   **What it means:** It reflects reality, not what the inventory says. If the instance cannot be read (wrong URL, expired certificate, refused credentials), the row shows a `Local error` with the reason.

###  2. Latest Official Version (Remote)
*   **What it tracks:** The most recent stable release published by the vendor (official release feeds, repositories or package indexes). Drafts and pre-releases are ignored.
*   **Data Displayed:** The `Target` column (e.g., `2.568.1`) and a link to the official release page.
*   **What it means:** Even an instance **without URL configured** still gets its latest official version, so the dashboard doubles as a technology watch.
*   **Release channels:** Jenkins (`stable` / `weekly`) and Portainer (`lts` / `sts` / `any`) can be pinned per instance.

###  3. Comparison (Update Status)
The `Target` is the latest version **within the same major version** as the installed one. A newer major version is reported separately in the `Note` column, because moving to it is a **migration**, not a routine update (e.g., Wiki.js 2 → 3, Grafana 12 → 13).

---

##  Dashboard Guide

| Element | Meaning |
| :--- | :--- |
| **Summary cards** | Number of instances, up to date, updates available, errors, not configured, and the time of the last check. |
| **Refresh** | Reloads the data from the database. No call is made to your applications. |
| **Check now** | Runs a full check of all enabled instances (installed + official version) and saves it in the history. Takes a few seconds. *(admin)* |
| **Add instance** | Opens the form to register a new instance to monitor. *(admin)* |
| **Row actions** | Check this instance only, edit, delete. *(admin)* |
| **Last check** | Time of the most recent check of that row (displayed in your local time zone). |

---

##  Detailed Data Interpretation Guide

| Status | Meaning | Implication / Action Required |
| :--- | :--- | :--- |
| **Up to date** | Installed version equals the target. | ✅ Good. No action needed. |
| **Patch available** | A newer patch exists (e.g., `2.5.308` → `2.5.315`). | Low risk. Apply at the next maintenance window. |
| **Minor available** | A newer minor release exists (e.g., `12.3.1` → `12.4.15`). | Plan the update; read the release notes. |
| **MAJOR available** | No release is published in your major version anymore, or you are behind a major version. | 🚨 Plan a migration; check compatibility and support status. |
| **Update available** | Same as above for date-based versions (MinIO `RELEASE.<date>`). | Plan the update. |
| **Ahead of release** | Installed version is newer than the latest stable (beta, edge, or very recent build). | Verify it is intentional. |
| **Unknown** | The comparison could not be made (installed or official version missing). | Check the `Note` column. |
| **Not configured** | No URL is set for this application. | Set the URL to start monitoring it. The official version is still shown. |
| **Not checked** | The instance is configured but has never been checked. | Click **Check now**. |
| **Local error** | The installed version could not be read. | See the `Note` column: certificate, credentials, network, or wrong URL. |
| **Disabled** | The instance is excluded from checks. | Re-enable it in the edit form if needed. |

### Notes you may see
*   **`major X available (migration)`**: a newer major version exists. The target stays on your current major on purpose.
*   **`upstream repository ARCHIVED`**: the project no longer publishes official updates (e.g., MinIO community edition). Plan a replacement.
*   **Access errors** (HTTP 401 / 403): the application requires credentials; see the table below.

---

##  Adding an Instance

Use **Version Checker → Add Instance**, choose the application, and fill in:

| Application | Authentication | Notes |
| :--- | :--- | :--- |
| **Jenkins** | Optional: username + API token | The token is entered in the password field. The version is readable without authentication. |
| **SonarQube** | None | Public endpoint. |
| **Portainer** | None (token optional) | Optional release channel: `lts`, `sts`, `any`. |
| **Grafana** | None (token optional) | A service-account token is only needed if the version is hidden from anonymous users. |
| **Argo CD** | None | Public endpoint. |
| **Wiki.js** | **API key required** | The key needs permission to read system information. |
| **Gitea** | None (token optional) | A token is needed only if sign-in is required to view the instance. |
| **OpenSearch** | Username + password | Read-only account is enough. |
| **MinIO** | Token optional | Either enable public Prometheus metrics (`MINIO_PROMETHEUS_AUTH_TYPE=public`) or use the token generated by `mc admin prometheus generate`. |
| **Proxmox VE** | **API token required** | Format `user@realm!tokenid=<secret>`; the `PVEAuditor` role is enough. |

Other options: **Name** (unique per application, use it to monitor several instances of the same product), **Verify TLS certificate**, **CA file** (server-side path of an internal CA), **Enabled**.

>  **Secrets** (tokens, passwords) are encrypted in the database and are **never displayed again**. When editing, leave the field empty to keep the stored secret, or tick *Remove the stored secret*.
>
>  Only **administrators** can add, edit, delete or run checks. Other users have read-only access to the dashboard.

---

##  Automatic Checks

A background scheduler runs a full check at a regular interval (default: **every 7 days**). It runs only when at least one enabled instance was never checked or was last checked longer ago than the interval, so restarting the application does not trigger needless checks. Instances without a URL are included: their official version is still refreshed.

| Setting (environment variable) | Default | Description |
| :--- | :--- | :--- |
| `VERSION_CHECKER_INTERVAL_HOURS` | `168` | Interval in hours (`720` ≈ monthly). |
| `VERSION_CHECKER_SCHEDULER_ENABLED` | `true` | Set to `false` to disable the scheduler. |
| `VERSION_CHECKER_RETENTION_DAYS` | `365` | History retention. |
| `VERSION_CHECKER_ENCRYPTION_KEY` | `SECRET_KEY` | Key used to encrypt stored secrets. **Changing it makes existing secrets unreadable** (they must be re-entered). |
| `VERSION_CHECKER_GITHUB_TOKEN` | – | Optional. Raises the GitHub API rate limit (60 → 5000 requests/hour). |

Official versions are cached in memory for 1 hour; each check is saved in the history (installed version, official version, status), kept for the retention period.

---

## 🌍 Official Sources

| Application | Source of the latest version |
| :--- | :--- |
| Jenkins | `updates.jenkins.io` (stable or weekly) |
| SonarQube | SonarSource community release announcements, Docker official image as fallback |
| Portainer | GitHub releases (LTS / STS filter) |
| Grafana | GitHub releases |
| Argo CD | GitHub releases |
| Wiki.js | GitHub releases (`requarks/wiki`) |
| Gitea | `dl.gitea.com` version file, GitHub releases as fallback |
| OpenSearch | Maven Central metadata |
| MinIO | GitHub releases (with the *archived* status of the repository) |
| Proxmox VE | Official Proxmox package index (Debian suite deduced from your installed major version) |

If a source is unreachable (no Internet access, proxy, rate limit), the row shows the reason in the `Note` column and the installed version is still reported.

