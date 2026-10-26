# NexWare ERP — Enterprise Marketing & Evaluation Platform

<p align="center">
  <a href="https://nexware-erp.vercel.app"><img src="https://img.shields.io/badge/Production%20Deployment-nexware--erp.vercel.app-brightgreen?style=for-the-badge&logo=vercel" alt="Live Deployment"/></a>
  <img src="https://img.shields.io/badge/React-19.2.8-blue?style=for-the-badge&logo=react"/>
  <img src="https://img.shields.io/badge/Vite-8.2.1-purple?style=for-the-badge&logo=vite"/>
  <img src="https://img.shields.io/badge/TailwindCSS-3.4.19-38B2AC?style=for-the-badge&logo=tailwind-css"/>
  <img src="https://img.shields.io/badge/TypeScript-6.0-blue?style=for-the-badge&logo=typescript"/>
  <img src="https://img.shields.io/badge/Vitest-4.1.10-success?style=for-the-badge"/>
</p>

## Overview

The **NexWare ERP Landing Platform** provides a high-converting, enterprise-grade digital front door for NexWare OS. It features responsive 12-column bento grids, glassmorphism telemetry panels, 60fps canvas particle field animations, interactive persona tours, live currency switching, ROI calculators, and seamless handoff into the core ERP application.

### Key Deployment URLs
- **Production Marketing Platform**: [https://nexware-erp.vercel.app](https://nexware-erp.vercel.app)
- **Direct ERP Application**: [https://nexware-erp.vercel.app/warehouse-erp/](https://nexware-erp.vercel.app/warehouse-erp/)
- **ERP Authentication Entry**: [https://nexware-erp.vercel.app/warehouse-erp/index.html#/login](https://nexware-erp.vercel.app/warehouse-erp/index.html#/login)

---

## Architectural Highlights

- **Dynamic Ambient Canvas**: Interactive 60fps math-based particle network reacting to cursor coordinates, light/dark theme switching, and window resizing.
- **Role-Based Sandbox Tour**: Guided 4-step evaluations tailored for CFO, COO, CTO, and Supply Chain Director personas.
- **Multi-Currency ROI Estimator**: Dynamic real-time calculation of cost savings across USD, EUR, and GBP with headcount multipliers.
- **Industrial Design System**: High-contrast, accessibility-tested palette (`#070814` deep space background, `#00F0FF` cyan accents, `#FFB800` amber indicators, and `#10B981` emerald operational telemetry).
- **Zero-Emoji Policy**: Vector-pure SVG iconography powered by Lucide React.
- **Deep Routing Integration**: Sub-page modal drawer system supporting 18+ corporate and compliance contexts (`about`, `careers`, `security`, `sla`, `privacy`, `terms`, `sys_arch`, etc.).

---

## Scripts & Development

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Run Vitest test suite (90 passing tests)
npm test

# Build production bundle
npm run build
```
