# THEAI Changelog

## Version v1.1.29 - [15/11/2026]

Adds a new Version Checker feature that enables users to check for available software updates through local registry checks and upstream source verification.

---

### New Features & Enhancements

#### Version Checker API
Implements backend REST endpoint with models, schemas, and service layer for version checking functionality.

*   **REST Endpoint:** New /version_checker route in app/api/routes/version_checker.py
*   **Data Models:** VersionChecker model defines request/response structure
*   **Schemas:** Pydantic schemas validate version check inputs and outputs

#### Version Checker Services
Creates comprehensive service layer for different version checking strategies including local, upstream, registry, and crypto verification.

*   **Local Check:** checker_local.py checks installed version against configured target
*   **Upstream Check:** checker_upstream.py fetches latest versions from official sources
*   **Registry Check:** checker_registry.py queries package registries for available versions
*   **Crypto Verification:** checker_crypto.py validates version signatures and integrity

#### Version Checker Scheduler
Adds background task scheduler to automatically check for updates at configured intervals.

*   **Scheduled Tasks:** version_checker_scheduler.py runs periodic update checks
*   **Config Support:** checker_config.py stores scheduling preferences and settings

#### Version Checker UI
Adds frontend pages for viewing version information and configuring update targets.

*   **Version Page:** VersionCheckerPage.js displays current vs available versions
*   **Target Form:** VersionTargetFormPage.js lets users configure update destinations

---
