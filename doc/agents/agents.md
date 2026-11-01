# System Health and Inventory Documentation

This documentation outlines the capabilities of the system for monitoring, managing, and tracking installed agents and associated servers.

## 1. Agent Operational Status Overview

This section provides a high-level view of the health and configuration state of all managed agents.

*   **Connectivity Monitoring:** The system tracks agent connectivity via heartbeats to ensure real-time operational status. This allows administrators to quickly identify agents that are actively reporting data versus those that are offline or unresponsive.
*   **Enrollment Management:** The system manages the enrollment lifecycle for agents, tracking which agents are successfully integrated into the platform and identifying any agents that require configuration or setup.

## 2. Agent Version and Compatibility Management

This section details how the system handles the software versions deployed across the agent fleet.

*   **Version Diversity Tracking:** The system monitors the range of installed agent versions to assess software diversity and potential compatibility issues.
*   **Release Tracking:** It provides a breakdown of agent versions, allowing for analysis of which versions are most prevalent or if specific updates are being adopted across the platform.

## 3. Platform Deployment Scope

This section details the cross-platform deployment of agents, ensuring system compatibility is understood.

### Operating System Support
The system tracks agent deployment across various operating systems, confirming multi-platform support:
*   **Cross-Platform Deployment:** Agents are deployed on multiple OS families (e.g., Linux, Windows), demonstrating broad operational reach.
*   **Unknown Systems:** The inventory includes tracking for agents running on unknown or unclassified operating system families.

### Architecture Support
The system manages agent deployment across different processor architectures:
*   **Multi-Architecture Support:** Agents are deployed on various architectures (e.g., x86-64, ARM variants), ensuring compatibility with diverse hardware environments.

## 4. Server Asset Inventory Details

This section details the inventory of registered servers linked to the installed agents, providing a complete asset map.

| Data Field | Functional Purpose |
| :--- | :--- |
| **Server ID** | Unique identifier for tracking specific server assets. |
| **Hostname / IP Address** | Provides the unique network location and address for asset identification. |
| **OS Family / Architecture** | Defines the underlying operating system and hardware architecture of the host, crucial for compatibility checks. |
| **Agent Version** | Specifies the exact agent software version installed on that specific server instance. |
| **Status** | Reports the current operational state of the agent (e.g., Online, Not Enrolled), indicating immediate health status. |
| **Last Seen** | Records the timestamp of the last successful communication or heartbeat, used for monitoring latency and activity. |

### Key System Insights:

*   **Active Monitoring:** The inventory confirms that a significant portion of servers are actively reporting their status, confirming ongoing system monitoring.
*   **Configuration Gaps:** The presence of agents marked as "Not enrolled" highlights areas where configuration or setup actions are required to fully integrate the agent into the system.
*   **Deployment Scope:** The data confirms that the system supports a heterogeneous environment, managing assets across different OS families and processor architectures simultaneously.