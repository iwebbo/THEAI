# THEAI Changelog

## Version v1.1.30 - [18/11/2026]

This pull request fixes issues with the local wiki version checker (v3) and adds database purge retention configuration for HTTP Synthetic monitoring.

---

### New Features & Enhancements

#### Local wiki version checker v3
Updates the local wiki version checker to support version 3 with improved functionality.

*   **checker_local.py:** Enhanced version checking logic for local wiki
*   **config.py:** Updated configuration settings

#### HTTP Synthetic monitor scheduler retention
Adds database purge retention period configuration to the HTTP synthetic monitoring scheduler.

*   **http_synthetic_scheduler.py:** Implements db purge retention setting
*   **values.yaml:** Exposes retention configuration in charts

**Fixes & Bug Resolutions**

*   **Local wiki version checker v3:** Fixes issues with the local wiki version checker for version 3
