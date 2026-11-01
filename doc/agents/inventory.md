# Agent Inventory Report

This document provides a summary and detailed analysis of the agent inventory data reported across various servers, including information on operating systems and vulnerability status.

## 1. General Inventory Summary

The inventory covers agent data distributed across multiple servers.

| Metric | Value | Description |
| :--- | :--- | :--- |
| **Total Inventories** | 4 / 4 | All inventories have been successfully processed. |
| **Total Packages Count** | 4,054 | Total number of packages identified in the inventory. |
| **Servers with Vulnerabilities** | 2 | Servers identified with vulnerability statuses (Unsupported / Error). |

## 2. Operating System (OS) Coverage

The inventory covers agents reporting from the following operating systems:

*   Raspbian GNU/Linux 12 (bookworm): 1 server
*   Microsoft Windows 11 Professional: 1 server
*   Debian GNU/Linux 13 (trixie): 1 server
*   Debian GNU/Linux 12 (bookworm): 1 server

## 3. Vulnerability Analysis

The vulnerability analysis reveals the following distribution across the servers:

*   **"Unsupported / Error" Status:** 2 servers
*   **"OK" Status:** 2 servers

## 4. Server Ranking by Package Count

This ranking identifies the servers with the highest number of recorded packages:

| Rank | Server ID | Package Count |
| :--- | :--- | :--- |
| **#1** | Server #17 | 1,729 |
| **#2** | Server #19 | 1,720 |
| **#3** | Server #21 | 406 |
| **#4** | Server #18 | 199 |

## 5. Detailed Server Information

The table below provides specific details for each server, including the operating system, architecture, package count, vulnerability status, and associated metadata.

| Server ID | OS | Kernel/Version | Architecture | Packages | Vulnerability Status | Errors | Last Updated |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Server #17** | Raspbian GNU/Linux 12 (bookworm) | 6.6.74+rpt-rpi-v7 | arm | 1,729 | Unsupported | 0 | 29/10/2026 22:31:17 |
| **Server #18** | Microsoft Windows 11 Professional | 10.0.26100 | amd64 | 199 | Unsupported | 0 | 01/11/2026 04:01:08 |
| **Server #19** | Debian GNU/Linux 13 (trixie) | 6.18.50+rpt-rpi-v8 | arm64 | 1,720 | OK | 2,335 | 01/11/2026 04:27:52 |
| **Server #21** | Debian GNU/Linux 12 (bookworm) | 6.1.0-52-amd64 | amd64 | 406 | OK | 666 | 31/10/2026 04:21:13 |
