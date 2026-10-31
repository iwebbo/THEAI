# THEAI Changelog

## Version v1.1.17 - [31/10/2026]

Adds reviews login functionality with authentication routes and frontend pages for agent management, dashboard improvements, and new overview and SLA pages.

---

### New Features & Enhancements

#### Reviews Login System
Implements authentication routes and login page for the reviews system with backend API endpoints for agent and auth operations.

*   **Auth Routes:** Added authentication routes in backend/app/api/routes/auth.py
*   **Login Page:** Created new LoginPage.js component with 90 lines added
*   **Agent API:** Extended agent routes in backend/app/api/routes/agent.py

#### Agent Management UI
New pages and components for managing agents including inventory, list views, and panel controls.

*   **Agent Inventory:** Added AgentInventory.js page with 732 lines
*   **Agent List:** Created AgentList.js component with 515 lines
*   **Agent Panel:** Updated AgentPanel.js with 118 lines added

#### Dashboard Enhancements
Significant updates to Dashboard.js and related layout components for improved navigation and server display.

*   **Dashboard Update:** Modified Dashboard.js with 438 lines added
*   **Sidebar Navigation:** Updated Sidebar.js with 85 lines added, 15 removed
*   **Header Component:** Enhanced Header.js with 3 lines added

#### New Pages
Added Overview and SLA pages to the application with full implementation.

*   **Overview Page:** Created new Overview.js page with 835 lines
*   **SLA Page:** Added SLA.js page with 518 lines

#### Frontend Assets
Added logo image and updated main styles for the new pages.

*   **Logo Asset:** Added frontend/public/logo.png
*   **Main Styles:** Updated frontend/src/styles/main.css with 31 lines added

---