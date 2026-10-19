# OOTP Hosting - Project Status Summary

**Cataloged by Antigravity Agent**
**Timestamp:** 2026-10-19T00:44:00-04:00

---

## 1. Project Overview & Purpose

The **OOTP Hosting** suite is an autonomous local web server, online league hosting environment, and StatsPlus analytics platform designed for Out of the Park Baseball 27. It automatically discovers active `.lg` saves, parses and imports monthly/yearly simulation CSV dumps, box scores, almanac files, and player rating snapshots, and serves comprehensive analytics, Statcast visualizers, Cooperstown Hall of Fame JAWS profiles, League Evolution blueprints, and online league reporting portals at `http://localhost:8080`.

- **Local Path:** `D:\Code\Projects\OOTP Hosting`
- **GitHub Repository:** `https://github.com/davidMcM84/OOTP-Hosting`
- **Current Execution Status:** Active / Operational
- **Primary Stack:** Python 3.13, Starlette, Uvicorn, Pandas, NumPy, SQLite3, HTML5/Tailwind/Bootstrap 5
- **Google Drive Folder:** `https://drive.google.com/drive/folders/1Q8FyiRALq6Uqg0TReuSuPk1w0_X1E0lw`

---

## 2. Key Components & Architecture

- **Setup & Functionality Verification Wizard (`app/setup_engine.py`, `setup_wizard.py`, `Setup_Wizard.bat`):**
  - **In-App 4-Step Wizard & CLI Wizard:** Auto-detects OOTP 27/26/25 `saved_games` paths across Documents, OneDrive, AppData, and Steam, includes a native Windows folder browser dialog, and persists settings in `data/user_config.json`.
  - **Bundled Demo League Generator (`OOTP27_Demo_League.lg`):** Generates a full 16-Team MLB + 16-Team AAA sample save with 480+ players, 1,400+ Statcast batted-ball events, and Cooperstown HOF legends so the application works out-of-the-box on any machine even before exporting CSVs from OOTP 27.
  - **9-Point Self-Test Suite:** End-to-end diagnostic verification of Python/ASGI dependencies, SQLite storage, multi-dump ingestion, Standings & Team Hub, Sabermetrics & Leaders, 3D Statcast Spray Coordinates, StatsPlus & HOF JAWS, Evolution Hub & BNN Almanacs, and Front Page Gazette / "The Stretch" / World Dashboard.
- **Ingestion & Data Normalization Engine (`app/ingestor.py`):** Automatically detects saves in configured OOTP directories, aggregates across 71+ CSV tables from `import_export/csv/` and chronological `dump/` subdirectories (`dump_YYYY_MM`, `dump_YYYY_yearly`), compiles rating snapshots for development tracking, and produces index-optimized SQLite databases.
- **Analytics, StatsPlus, Cooperstown, Gazette & Stretch Suite (`app/analytics.py`, `app/evolution_engine.py`):** Computes sabermetric leaderboards, FIP, wOBA, WAR, spray chart coordinate transformations, top 100 prospect ranks, organizational farm depth, payroll efficiency (`$/WAR`), transaction grading, Cooperstown JAWS plaques, Front Page Gazette broadsheet dispatches, "The Stretch" pennant/playoff bracket probabilities, World Dashboard organizational pyramids, and demographic expansion readiness.
- **REST & ASGI Web Service (`app/api.py`, `run_server.py`):** Fast asynchronous web application built on Starlette serving REST endpoints (`/api/setup/*`, `/api/overview`, `/api/newspaper`, `/api/stretch`, `/api/world`, `/api/statsplus`, `/api/sabermetrics`, `/api/leaders`, `/api/records`, `/api/hof`, `/api/bnn/catalog`, `/api/evolution`) and static/dynamic BNN reports.

---

## 3. Dependencies & Prerequisites

- **Python Runtime:** Python 3.10+ (tested on Python 3.13)
- **Dependencies (`requirements.txt`):** `uvicorn`, `starlette`, `pandas`, `numpy`, `aiofiles`
- **Game Environment:** Out of the Park Baseball 27 installation (or standalone via the built-in Demo League generator)
