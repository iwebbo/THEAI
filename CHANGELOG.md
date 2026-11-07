# THEAI Changelog

## Version v1.1.28 - [07/11/2026]

This release introduces comprehensive synthetic monitoring capabilities for both HTTP and HTTPS targets, alongside improvements to the frontend theming system.

---

### New Features & Enhancements

#### HTTP Synthetic Monitoring
Added full backend support for defining and scheduling HTTP-based synthetic checks. This includes new models, services, and API routes.

*   **New Target Model:** Introduced `http_synthetic_target` model to define monitoring targets.
*   **API Routes Added:** Implemented dedicated API routes for handling HTTP synthetic data.
*   **Scheduling Logic:** Added a new scheduler task specifically for running HTTP synthetic checks.

#### HTTPS Target Management
Enhanced the user interface and services to manage HTTPS monitoring targets.

*   **Target Form Component:** Updated `HttpsTargetForm.js` for defining HTTPS monitoring endpoints.
*   **Frontend Service Layer:** Added dedicated service logic for handling HTTPS monitor operations.

#### Theming System Update
Implemented new theming capabilities across the application's frontend components.

*   **Theme Hook Updated:** Updated `useTheme.js` to support theme switching logic.
*   **Global Styling Changes:** Modified main CSS styles to accommodate new themes.

**Fixes & Bug Resolutions**

*   **K8s Pod Monitoring Fix:** Fixed issues related to ICMP monitoring in non-root pods within the Helm/Kubernetes environment.

---
