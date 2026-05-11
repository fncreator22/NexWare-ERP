# WareOps ERP — Enterprise Multi-Warehouse Platform

WareOps is a professional-grade SaaS ERP platform designed for managing multi-warehouse operations, inventory, workforce, and financial analytics with a focus on real-time data integrity and pro-user productivity.

## 🚀 Quick Start

To run the project locally, ensure you have **Node.js** installed, then follow these steps:

### 1. Build and Run (Recommended)
This command bundles all the source files and starts the local development server.
```bash
npm run dev
```

### 2. Manual Commands
If you wish to perform individual operations:

*   **Build Bundle**: Bundles `js/` files into `bundle.js`.
    ```bash
    npm run build
    ```
*   **Start Server**: Launches the static server on [http://localhost:3000](http://localhost:3000) (or next available).
    ```bash
    npm run serve
    ```

## 🛠️ Project Structure

*   `js/modules/`: Core logic (State management, Router, Exporter).
*   `js/components/`: Reusable UI components (Shell, Command Palette).
*   `js/pages/`: Page-specific rendering logic (Dashboard, Inventory, Billing).
*   `css/`: Modular design system (Variables, Layout, Components).
*   `bundle.js`: The compiled production bundle (Auto-generated).

## ⚡ Pro Features

*   **Command Palette (Ctrl + K)**: Instant search and navigation across the entire platform.
*   **Cross-Tab Sync**: Real-time state synchronization using the `storage` event listener.
*   **Regional Compliance**: Warehouse-specific tax overrides and localized reporting.
*   **Data Integrity**: Cascading deletions and immutable financial snapshots.

---
© 2026 WareOps Enterprise Systems. All rights reserved.
