# OOTP 27 Local Analytics, Statcast & League Hosting Suite

The **OOTP 27 Local Analytics, Statcast & League Hosting Suite** is a high-performance local web server, online league hosting environment, and StatsPlus analytics platform designed for Out of the Park Baseball 27 (`.lg` saves). It automatically discovers, ingests, and analyzes monthly/yearly simulation dumps, box scores, almanac records, player contract matrices, Cooperstown Hall of Fame JAWS profiles, league evolution blueprints, and Statcast metrics.

---

## Overview & Key Features

- **Interactive Setup & Functionality Verification Wizard:**
  - **In-App 4-Step Setup Wizard** (`http://localhost:8080/?setup=1` or via the **Setup Wizard** button in the top command bar) and **CLI / Batch Setup Wizard** (`Setup_Wizard.bat` / `python setup_wizard.py`).
  - Automatically verifies Python 3.10+ runtime, installs required packages (`starlette`, `uvicorn`, `pandas`, `numpy`, `aiofiles`), discovers OOTP 27/26/25 `saved_games` directories across Documents, OneDrive, AppData, and Steam, and includes a native folder picker.
  - **Bundled Demo League Generator (`OOTP27_Demo_League.lg`):** Guarantees 100% out-of-the-box functionality on any machine—even before exporting CSVs from OOTP 27—by generating a complete 16-Team MLB + 16-Team AAA multi-season save with 480+ players, 1,400+ Statcast batted-ball events, and Cooperstown Hall of Fame legends.
  - **9-Point End-to-End Self-Test:** Verifies SQLite ingestion, League Standings, Team Franchise Hub, Sabermetrics, 3D Statcast Spray Coordinates, StatsPlus Reports, Cooperstown HOF JAWS, Evolution Hub & BNN Almanacs, and Front Page Gazette / "The Stretch" / World Dashboard.
- **Front Page Gazette, "The Stretch" & World Dashboard:**
  - **Front Page Gazette:** Broadsheet newspaper hub with auto-generated headlines, pennant race dispatches, hot/cold streaks, box score capsules, and league leaders.
  - **"The Stretch" Pennant & Postseason Hub:** Magic numbers, playoff probability matrix, October bracket tree, and strength-of-schedule analysis.
  - **World Dashboard:** Multi-tier organizational pyramid, cross-league talent flow, global player demographics, and league parity index.
- **Autonomous Save Ingestion:** Scans and monitors your configured OOTP `saved_games` directory for active leagues, importing 71+ CSV tables, historical monthly/yearly dumps, and almanac data into index-optimized SQLite databases (`data/saves/<slug>.db`).
- **StatsPlus Web Portal & Cooperstown Museum:**
  - **Player Development Tracker:** Multi-year talent changes, rating bumps/drops across contact, power, eye, stuff, movement, control, and overall/potential values.
  - **Top 100 Prospects & Farm System Rankings:** Organization rankings and prospect leaderboards.
  - **Contract & Payroll Matrix:** Multi-year team financial allocations, surplus value, and `$/WAR` efficiency calculations.
  - **Interactive Trade Machine & Transaction Wire:** Chronological transaction log with WAR surplus grading and live multi-player trade simulator.
  - **Cooperstown Hall of Fame & JAWS Museum:** Plaques, positional JAWS standards, Black/Gray Ink, HOF Monitor, induction classes, and active watchlist.
- **Statcast & 3D Spray Chart Visualizer:** Converts pitch-by-pitch and batted-ball exit velocity, launch angle, and zone codes into interactive spray charts and Statcast summaries.
- **League Evolution Hub:** Expansion market readiness, demographic population normalization, divisional realignment blueprints, and historical simulation timelines.
- **BNN Almanac Directory:** Serves historical BNN HTML reports and yearly almanac archives with dynamic SQLite fallback rendering.
- **Ultrawide Broadcast Command Workspace:** Persistent right-hand Player Scout Dock, compact table density toggle, and instant column sorting.

---

## Tech Stack

- **Backend Framework:** Python 3.10+ (tested on Python 3.12 / 3.13), Starlette, Uvicorn (ASGI)
- **Data Ingestion & Processing:** Pandas, NumPy, SQLite3 with WAL/memory pragma optimizations
- **Presentation & Frontend:** HTML5, Tailwind CSS, Bootstrap 5, Bootstrap Icons, Chart.js
- **Data Source:** Out of the Park Baseball 27 (`.lg` format, `import_export/csv/`, `dump/`, `news/almanac_*/`)

---

## Project Structure

```text
OOTP Hosting/
├── app/
│   ├── __init__.py           # Package initialization
│   ├── analytics.py          # Sabermetrics, StatsPlus reports, leaderboards, HOF JAWS, Gazette, Stretch & World Hub
│   ├── api.py                # Starlette ASGI routes, Setup Wizard API, and static asset handlers
│   ├── bnn_generator.py      # BNN almanac catalog, quick links, and HTML report navigation
│   ├── config.py             # Dynamic user config, path discovery, and Statcast coordinate mappings
│   ├── evolution_engine.py   # League Evolution Hub, expansion market readiness, and roadmaps
│   ├── ingestor.py           # Multi-dump CSV parser, SQLite ingestion engine, and active save manager
│   ├── irl_counterparts.py   # MLB/MiLB real-life counterpart registry and city population normalizer
│   └── setup_engine.py       # Setup Wizard backend, demo league generator, and 9-point self-test engine
├── data/
│   ├── saves/                # Ingested SQLite databases per save slug (auto-generated)
│   └── uploaded_saves/       # Upload staging folder & generated Demo League save
├── static/                   # Icons, stylesheets (app.css), and frontend controllers (app.js, charts.js)
├── templates/                # HTML5 templates (index.html with Setup Wizard modal)
├── create_shortcut.ps1       # Dynamic Windows Desktop shortcut & custom icon generator
├── Launch_OOTP27_Hub.bat     # Windows batch launcher (Port 8080)
├── Launch_OOTP27_Hub.vbs     # Silent background VBS launcher
├── Setup_Wizard.bat          # One-click interactive Setup & Verification Wizard launcher
├── setup_wizard.py           # Standalone CLI Setup Wizard, dependency installer & 9-point verifier
├── requirements.txt          # Python dependencies (uvicorn, starlette, pandas, numpy, aiofiles)
└── run_server.py             # Server entry point with auto-dependency check & browser launch
```

---

## Getting Started & Setup Wizard

### Option 1: One-Click Setup Wizard (Recommended)
Double-click **`Setup_Wizard.bat`** or run:
```powershell
python setup_wizard.py
```
The Setup Wizard will:
1. Verify your Python runtime and automatically install any missing dependencies from `requirements.txt`.
2. Auto-detect your `OOTP Baseball 27\saved_games` directory (or let you specify a custom path).
3. Audit your `.lg` saves—and if you don't have CSV exports yet, offer to generate the **16-Team Demo League (`OOTP27_Demo_League.lg`)** so every feature works immediately.
4. Run the **9-Point Functionality Verification Suite** and optionally create a Desktop shortcut.

### Option 2: Automated CLI Verification / Demo Generation
```powershell
# Run unattended setup and 9-point functionality verification:
python setup_wizard.py --auto

# Run only the 9-point diagnostic self-test:
python setup_wizard.py --verify

# Generate/refresh the bundled 16-Team Demo League save and verify:
python setup_wizard.py --demo
```

### Option 3: Launch the Web Server Directly
```powershell
python run_server.py --app
```
Or double-click **`Launch_OOTP27_Hub.bat`** to start the server on `http://localhost:8080`. Click the **`Setup Wizard`** button in the top-right command bar at any time to change your OOTP `saved_games` folder, load the Demo League, or run the 9-Point Functionality Self-Test in the browser.
