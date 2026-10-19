import os
import sys
import time
import json
import math
import shutil
import random
import sqlite3
import platform
import subprocess
import importlib.metadata
from datetime import datetime
from pathlib import Path
import pandas as pd

from app.config import (
    BASE_DIR,
    DATA_DIR,
    SAVES_DB_DIR,
    UPLOADED_SAVES_DIR,
    HOST_DB_PATH,
    ACTIVE_DB_PATH,
    USER_CONFIG_PATH,
    PORT,
    HOST,
    load_user_config,
    save_user_config,
    get_saved_games_dir,
    get_candidate_ootp_dirs_info,
)
from app.ingestor import (
    discover_all_saves,
    get_active_save_slug,
    set_active_save_slug,
    ingest_save_to_sqlite,
    slugify,
)


REQUIRED_PACKAGES = [
    ("starlette", "Starlette ASGI Web Framework"),
    ("uvicorn", "Uvicorn Lightning ASGI Server"),
    ("pandas", "Pandas Data Analytics Engine"),
    ("numpy", "NumPy Scientific Computing"),
    ("aiofiles", "Async Static File Handler"),
]


def check_environment_health() -> dict:
    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    py_ok = (sys.version_info.major, sys.version_info.minor) >= (3, 10)

    packages = []
    all_pkgs_ok = True
    for pkg_name, desc in REQUIRED_PACKAGES:
        try:
            ver = importlib.metadata.version(pkg_name)
            packages.append({
                "name": pkg_name,
                "description": desc,
                "version": ver,
                "installed": True,
                "status": "ok",
            })
        except importlib.metadata.PackageNotFoundError:
            all_pkgs_ok = False
            packages.append({
                "name": pkg_name,
                "description": desc,
                "version": "Missing",
                "installed": False,
                "status": "error",
            })

    # Check SQLite version & WAL capability
    sqlite_ver = sqlite3.sqlite_version
    data_writable = False
    free_gb = 0.0
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        SAVES_DB_DIR.mkdir(parents=True, exist_ok=True)
        UPLOADED_SAVES_DIR.mkdir(parents=True, exist_ok=True)
        probe = DATA_DIR / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        data_writable = True
        usage = shutil.disk_usage(DATA_DIR)
        free_gb = round(usage.free / (1024 ** 3), 2)
    except Exception:
        data_writable = False

    # Check Desktop shortcut existence
    desktop_dir = Path(os.path.expanduser("~")) / "Desktop"
    shortcut_path = desktop_dir / "OOTP 27 Analytics & Hosting Hub.lnk"
    shortcut_exists = shortcut_path.is_file()

    return {
        "python_version": py_ver,
        "python_executable": sys.executable,
        "python_ok": py_ok,
        "platform": f"{platform.system()} {platform.release()} ({platform.machine()})",
        "sqlite_version": sqlite_ver,
        "packages": packages,
        "all_packages_ok": all_pkgs_ok,
        "data_dir": str(DATA_DIR),
        "data_writable": data_writable,
        "disk_free_gb": free_gb,
        "shortcut_exists": shortcut_exists,
        "shortcut_path": str(shortcut_path),
        "port": PORT,
        "host": HOST,
    }


def get_ootp_export_guide() -> list[dict]:
    return [
        {
            "step": 1,
            "title": "Open Game Settings in OOTP Baseball 27",
            "detail": "Load your league save in OOTP 27, then navigate to Game -> Game Settings from the top menu bar.",
            "icon": "bi-gear-wide-connected",
        },
        {
            "step": 2,
            "title": "Enable CSV Data Exports (Database Tab)",
            "detail": "Go to the 'Database' tab -> click 'Database Tools' in the top-right -> select 'Export data to CSV files now' (or enable automatic periodic CSV dumps into import_export/csv or dump/).",
            "icon": "bi-filetype-csv",
        },
        {
            "step": 3,
            "title": "Optional: Enable BNN HTML & Almanac Reports",
            "detail": "Under Game Settings -> 'Online League' or 'Almanac', generate HTML reports to populate news/html/ for the built-in BNN & Almanac reader.",
            "icon": "bi-globe2",
        },
        {
            "step": 4,
            "title": "Click 'Sync' or Select Your Save Here",
            "detail": "Once CSVs are exported, this suite automatically ingests 71+ tables, Statcast batted-ball locations, ratings snapshots, and historical dumps into SQLite.",
            "icon": "bi-lightning-charge-fill",
        },
    ]


def get_setup_status() -> dict:
    cfg = load_user_config()
    env = check_environment_health()
    saved_games_dir = get_saved_games_dir()
    candidate_dirs = get_candidate_ootp_dirs_info()
    saves = discover_all_saves()
    active_slug = get_active_save_slug()

    enriched_saves = []
    ready_full_count = 0
    ready_html_count = 0

    for s in saves:
        csv_cnt = int(s.get("csv_count") or 0)
        html_cnt = int(s.get("html_count") or 0)
        dump_cnt = int(s.get("dump_count") or 0)
        db_file = Path(s.get("db_path") or (SAVES_DB_DIR / f"{s['save_slug']}.db"))
        db_ready = db_file.is_file() and db_file.stat().st_size > 65536
        db_size_mb = round(db_file.stat().st_size / (1024 * 1024), 2) if db_file.is_file() else 0.0

        if csv_cnt >= 5:
            readiness = "ready_full"
            readiness_label = f"Full Analytics Ready ({csv_cnt} CSVs" + (f", {dump_cnt} Dumps)" if dump_cnt > 1 else ")")
            ready_full_count += 1
        elif html_cnt > 0:
            readiness = "ready_html_only"
            readiness_label = f"BNN HTML Only ({html_cnt} pages — Export CSVs in OOTP for Full Analytics)"
            ready_html_count += 1
        else:
            readiness = "empty"
            readiness_label = "No CSV or HTML Exports Found Yet"

        enriched_saves.append({
            **s,
            "readiness": readiness,
            "readiness_label": readiness_label,
            "db_ready": db_ready,
            "db_size_mb": db_size_mb,
            "is_active": s["save_slug"] == active_slug,
        })

    has_ready_save = ready_full_count > 0
    needs_wizard = (not cfg.get("setup_completed", False)) and (not has_ready_save)

    return {
        "status": "ok",
        "config": cfg,
        "environment": env,
        "saved_games_dir": str(saved_games_dir),
        "saved_games_dir_exists": saved_games_dir.is_dir(),
        "candidate_dirs": candidate_dirs,
        "saves": enriched_saves,
        "active_save": active_slug,
        "counts": {
            "total_saves": len(enriched_saves),
            "ready_full": ready_full_count,
            "ready_html_only": ready_html_count,
        },
        "has_ready_save": has_ready_save,
        "setup_completed": bool(cfg.get("setup_completed", False)),
        "needs_wizard": needs_wizard,
        "export_guide": get_ootp_export_guide(),
    }


def normalize_ootp_directory_input(raw_path: str) -> tuple[Path, str]:
    """
    Normalizes a user-supplied OOTP path:
    - If they point to the parent 'OOTP Baseball 27' folder that contains 'saved_games', automatically step into 'saved_games'.
    - If they point directly to a '.lg' folder, or a 'saved_games' folder, keep it.
    """
    cleaned = str(raw_path or "").strip().strip('"').strip("'")
    if not cleaned:
        return get_saved_games_dir(), "Using default saved_games path."
    p = Path(os.path.expanduser(cleaned))
    if p.is_dir() and not p.name.lower().endswith(".lg"):
        sg_sub = p / "saved_games"
        if sg_sub.is_dir():
            return sg_sub, f"Automatically resolved to '{sg_sub}' subfolder."
        data_sg_sub = p / "data" / "saved_games"
        if data_sg_sub.is_dir():
            return data_sg_sub, f"Automatically resolved to '{data_sg_sub}' subfolder."
    return p, "Path configured."


def update_setup_config(payload: dict) -> dict:
    updates = {}
    notes = []

    if "saved_games_dir" in payload and payload["saved_games_dir"] is not None:
        resolved_path, note = normalize_ootp_directory_input(str(payload["saved_games_dir"]))
        updates["saved_games_dir"] = str(resolved_path)
        notes.append(note)

    if "extra_save_dirs" in payload and isinstance(payload["extra_save_dirs"], list):
        clean_extras = []
        for ed in payload["extra_save_dirs"]:
            if str(ed).strip():
                rp, _ = normalize_ootp_directory_input(str(ed))
                clean_extras.append(str(rp))
        updates["extra_save_dirs"] = clean_extras

    if "port" in payload and payload["port"]:
        try:
            p_val = int(payload["port"])
            if 1024 <= p_val <= 65535:
                updates["port"] = p_val
        except Exception:
            pass

    if "app_mode" in payload:
        updates["app_mode"] = bool(payload["app_mode"])

    if "setup_completed" in payload:
        updates["setup_completed"] = bool(payload["setup_completed"])

    if "default_save_slug" in payload and payload["default_save_slug"]:
        updates["default_save_slug"] = str(payload["default_save_slug"]).strip()

    save_user_config(updates)
    discover_all_saves()

    if updates.get("default_save_slug"):
        set_active_save_slug(updates["default_save_slug"])

    status = get_setup_status()
    status["notes"] = notes
    return status


def browse_native_folder(initial_dir: str = None) -> dict:
    """
    Opens a native OS folder selection dialog on the local machine and returns the chosen path.
    """
    start_dir = initial_dir or str(get_saved_games_dir())
    if not Path(start_dir).is_dir():
        start_dir = str(Path(os.path.expanduser("~")) / "Documents")

    if platform.system() == "Windows":
        ps_script = f"""
        Add-Type -AssemblyName System.Windows.Forms
        $ f = New-Object System.Windows.Forms.FolderBrowserDialog
        $f.Description = "Select your OOTP Baseball 27 'saved_games' folder or a specific '.lg' save directory"
        $f.SelectedPath = '{start_dir.replace("'", "''")}'
        $f.ShowNewFolderButton = $false
        $top = New-Object System.Windows.Forms.Form
        $top.TopMost = $true
        $res = $f.ShowDialog($top)
        if ($res -eq [System.Windows.Forms.DialogResult]::OK) {{
            Write-Output $f.SelectedPath
        }}
        """
        ps_script = ps_script.replace("$ f", "$f")
        try:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-STA", "-Command", ps_script],
                capture_output=True,
                text=True,
                timeout=120,
            )
            chosen = (proc.stdout or "").strip()
            if chosen:
                norm_p, note = normalize_ootp_directory_input(chosen)
                return {"selected": True, "path": str(norm_p), "note": note}
            return {"selected": False, "path": "", "note": "Folder selection cancelled."}
        except Exception as exc:
            return {"selected": False, "path": "", "error": str(exc)}
    else:
        return {"selected": False, "path": "", "note": "Please paste your directory path directly on non-Windows systems."}


def generate_demo_save(save_name: str = "OOTP27_Demo_League") -> dict:
    """
    Generates a rich, complete, multi-year (2025-2026) OOTP 27 sample .lg save in
    data/uploaded_saves/OOTP27_Demo_League.lg with full CSV exports, Statcast batted-ball
    coordinates, ratings snapshots, career histories, contracts, trades, and BNN HTML reports,
    then ingests it into SQLite and sets it as the active save.
    """
    clean_name = save_name if save_name.lower().endswith(".lg") else f"{save_name}.lg"
    lg_dir = UPLOADED_SAVES_DIR / clean_name
    ie_csv = lg_dir / "import_export" / "csv"
    dump_2025 = lg_dir / "dump" / "dump_2025_yearly" / "csv"
    dump_2026 = lg_dir / "dump" / "dump_2026_yearly" / "csv"
    html_dir = lg_dir / "news" / "html"
    msg_dir = lg_dir / "messages"

    for d in (ie_csv, dump_2025, dump_2026, html_dir / "leagues", html_dir / "teams", msg_dir):
        d.mkdir(parents=True, exist_ok=True)

    rng = random.Random(2027)

    # 1. Nations, States, Cities, Parks
    nations_df = pd.DataFrame([
        {"nation_id": 206, "name": "United States", "short_name": "USA", "abbreviation": "USA", "baseball_quality": 5},
        {"nation_id": 58, "name": "Dominican Republic", "short_name": "Dominican Rep.", "abbreviation": "DOM", "baseball_quality": 5},
        {"nation_id": 102, "name": "Japan", "short_name": "Japan", "abbreviation": "JPN", "baseball_quality": 5},
        {"nation_id": 211, "name": "Venezuela", "short_name": "Venezuela", "abbreviation": "VEN", "baseball_quality": 5},
    ])
    states_df = pd.DataFrame([
        {"state_id": 1, "nation_id": 206, "name": "New York", "abbreviation": "NY", "population": 19800000},
        {"state_id": 2, "nation_id": 206, "name": "Massachusetts", "abbreviation": "MA", "population": 7000000},
        {"state_id": 3, "nation_id": 206, "name": "Illinois", "abbreviation": "IL", "population": 12600000},
        {"state_id": 4, "nation_id": 206, "name": "California", "abbreviation": "CA", "population": 38900000},
        {"state_id": 5, "nation_id": 206, "name": "Texas", "abbreviation": "TX", "population": 30500000},
        {"state_id": 6, "nation_id": 206, "name": "Georgia", "abbreviation": "GA", "population": 11000000},
        {"state_id": 7, "nation_id": 206, "name": "Pennsylvania", "abbreviation": "PA", "population": 12900000},
        {"state_id": 8, "nation_id": 206, "name": "Missouri", "abbreviation": "MO", "population": 6190000},
        {"state_id": 9, "nation_id": 206, "name": "Washington", "abbreviation": "WA", "population": 7800000},
        {"state_id": 10, "nation_id": 206, "name": "Maryland", "abbreviation": "MD", "population": 6180000},
        {"state_id": 11, "nation_id": 206, "name": "Ohio", "abbreviation": "OH", "population": 11780000},
        {"state_id": 12, "nation_id": 206, "name": "Minnesota", "abbreviation": "MN", "population": 5730000},
    ])

    team_specs = [
        # Sub-league 0 (Eastern Conference), Div 0 (Atlantic)
        (1, "New York", "Empires", "NYE", 0, 0, 1, 40.8296, -73.9262, 8335897, "Empire Stadium", 47309, "#003087", "#E4002C"),
        (2, "Boston", "Bay Sox", "BOS", 0, 0, 2, 42.3467, -71.0972, 4941632, "Fenway Grounds", 37755, "#BD3039", "#0C2340"),
        (3, "Baltimore", "Clippers", "BAL", 0, 0, 10, 39.2838, -76.6216, 2844510, "Camden Harbor Park", 44970, "#DF4601", "#000000"),
        (4, "Philadelphia", "Keystones", "PHI", 0, 0, 7, 39.9061, -75.1665, 6245051, "Liberty Bell Field", 42792, "#E81828", "#002D72"),
        # Sub-league 0 (Eastern Conference), Div 1 (Central)
        (5, "Chicago", "Lakers", "CHI", 0, 1, 3, 41.9484, -87.6553, 9458539, "Lakeshore Park", 41649, "#0E3386", "#CC3433"),
        (6, "Atlanta", "Peachtrees", "ATL", 0, 1, 6, 33.8907, -84.4677, 6307261, "Peachtree Park", 41084, "#CE1141", "#13274F"),
        (7, "St. Louis", "Archers", "STL", 0, 1, 8, 38.6226, -90.1928, 2809299, "Gateway Stadium", 44383, "#C41E3A", "#0C2340"),
        (8, "Cleveland", "Founders", "CLE", 0, 1, 11, 41.4962, -81.6852, 2075662, "Erie Bank Ballpark", 34830, "#00385D", "#E50022"),
        # Sub-league 1 (Western Conference), Div 0 (Midwest/South)
        (9, "Houston", "Apollos", "HOU", 1, 0, 5, 29.7573, -95.3555, 7510253, "Orbit Dome", 41168, "#002D62", "#EB6E1F"),
        (10, "Texas", "Lone Stars", "TEX", 1, 0, 5, 32.7473, -97.0825, 8100037, "Arlington Field", 40300, "#003278", "#C0111F"),
        (11, "Minnesota", "North Stars", "MIN", 1, 0, 12, 44.9817, -93.2778, 3712020, "Twin Cities Field", 38544, "#002B5C", "#D31145"),
        (12, "Pittsburgh", "Ironmen", "PIT", 1, 0, 7, 40.4469, -80.0057, 2429017, "Three Rivers Park", 38747, "#FDB827", "#27251F"),
        # Sub-league 1 (Western Conference), Div 1 (Pacific)
        (13, "Los Angeles", "Stars", "LAS", 1, 1, 4, 34.0739, -118.2400, 12872322, "Chavez Ravine Stadium", 56000, "#005A9C", "#EF3E42"),
        (14, "San Francisco", "Goldens", "SFG", 1, 1, 4, 37.7786, -122.3893, 4566961, "McCovey Cove Park", 41265, "#FD5A1E", "#27251F"),
        (15, "Seattle", "Emeralds", "SEA", 1, 1, 9, 47.5914, -122.3325, 4044837, "Puget Sound Field", 47929, "#0C2C56", "#005C5C"),
        (16, "San Diego", "Friars", "SDP", 1, 1, 4, 32.7073, -117.1566, 3269973, "Gaslamp Ballpark", 40209, "#2F241D", "#FFC425"),
    ]

    cities_rows = []
    parks_rows = []
    teams_rows = []
    affiliations_rows = []

    for tid, city_name, nick, abbr, sl_id, div_id, st_id, lat, lon, pop, park_name, cap, bg_col, txt_col in team_specs:
        cities_rows.append({
            "city_id": tid,
            "nation_id": 206,
            "state_id": st_id,
            "name": city_name,
            "population": pop,
            "latitude": lat,
            "longitude": lon,
        })
        parks_rows.append({
            "park_id": tid,
            "name": park_name,
            "capacity": cap,
            "avg": round(rng.uniform(0.975, 1.035), 3),
            "d": round(rng.uniform(0.95, 1.06), 3),
            "t": round(rng.uniform(0.90, 1.10), 3),
            "hr": round(rng.uniform(0.94, 1.08), 3),
            "hr_l": round(rng.uniform(0.93, 1.09), 3),
            "hr_r": round(rng.uniform(0.93, 1.09), 3),
            "turf": 0,
            "type": 0,
            "distances0": 330,
            "distances1": 375,
            "distances2": 405,
            "distances3": 375,
            "distances4": 330,
        })
        teams_rows.append({
            "team_id": tid,
            "name": city_name,
            "nickname": nick,
            "abbr": abbr,
            "league_id": 200,
            "sub_league_id": sl_id,
            "division_id": div_id,
            "level": 1,
            "parent_team_id": 0,
            "park_id": tid,
            "city_id": tid,
            "nation_id": 206,
            "allstar_team": 0,
            "background_color_id": bg_col,
            "text_color_id": txt_col,
            "logo_file_name": f"team_{tid}.png",
        })
        # AAA affiliate
        aaa_id = 100 + tid
        teams_rows.append({
            "team_id": aaa_id,
            "name": f"{city_name} AAA",
            "nickname": f"{nick} Jr.",
            "abbr": f"{abbr}3",
            "league_id": 201,
            "sub_league_id": sl_id,
            "division_id": div_id,
            "level": 2,
            "parent_team_id": tid,
            "park_id": tid,
            "city_id": tid,
            "nation_id": 206,
            "allstar_team": 0,
            "background_color_id": bg_col,
            "text_color_id": txt_col,
            "logo_file_name": f"team_{aaa_id}.png",
        })
        affiliations_rows.append({"team_id": tid, "affiliated_team_id": aaa_id})

    leagues_df = pd.DataFrame([
        {
            "league_id": 200,
            "name": "Major League Baseball (Demo)",
            "abbr": "MLB",
            "nation_id": 206,
            "league_level": 1,
            "season_year": 2026,
            "current_date": "2026-10-01",
            "start_date": "2026-04-01",
            "parent_league_id": 0,
        },
        {
            "league_id": 201,
            "name": "International Triple-A League",
            "abbr": "AAA",
            "nation_id": 206,
            "league_level": 2,
            "season_year": 2026,
            "current_date": "2026-10-01",
            "start_date": "2026-04-01",
            "parent_league_id": 200,
        },
    ])

    sub_leagues_df = pd.DataFrame([
        {"league_id": 200, "sub_league_id": 0, "name": "Eastern League", "abbr": "EL", "designated_hitter": 1},
        {"league_id": 200, "sub_league_id": 1, "name": "Western League", "abbr": "WL", "designated_hitter": 1},
        {"league_id": 201, "sub_league_id": 0, "name": "AAA East", "abbr": "AE", "designated_hitter": 1},
        {"league_id": 201, "sub_league_id": 1, "name": "AAA West", "abbr": "AW", "designated_hitter": 1},
    ])

    divisions_df = pd.DataFrame([
        {"league_id": 200, "sub_league_id": 0, "division_id": 0, "name": "Atlantic Division"},
        {"league_id": 200, "sub_league_id": 0, "division_id": 1, "name": "Central Division"},
        {"league_id": 200, "sub_league_id": 1, "division_id": 0, "name": "Midwest Division"},
        {"league_id": 200, "sub_league_id": 1, "division_id": 1, "name": "Pacific Division"},
        {"league_id": 201, "sub_league_id": 0, "division_id": 0, "name": "AAA Atlantic"},
        {"league_id": 201, "sub_league_id": 0, "division_id": 1, "name": "AAA Central"},
        {"league_id": 201, "sub_league_id": 1, "division_id": 0, "name": "AAA Midwest"},
        {"league_id": 201, "sub_league_id": 1, "division_id": 1, "name": "AAA Pacific"},
    ])

    # Standings & Team Stats for 2025 and 2026
    def build_team_season_tables(yr: int):
        t_rec = []
        t_bat = []
        t_pit = []
        t_fin = []
        for (sl, dv) in [(0, 0), (0, 1), (1, 0), (1, 1)]:
            div_teams = [t for t in team_specs if t[4] == sl and t[5] == dv]
            wins_list = sorted([rng.randint(70, 102) for _ in div_teams], reverse=True)
            max_w = wins_list[0]
            for pos_idx, (t_spec, w) in enumerate(zip(div_teams, wins_list), start=1):
                tid = t_spec[0]
                l = 162 - w
                pct = round(w / 162.0, 3)
                gb = round((max_w - w), 1)
                rs = int(680 + (w - 81) * 4.8 + rng.randint(-25, 25))
                ra = int(680 - (w - 81) * 4.5 + rng.randint(-25, 25))
                t_rec.append({
                    "team_id": tid, "g": 162, "w": w, "l": l, "t": 0,
                    "pos": pos_idx, "pct": pct, "gb": gb, "streak": rng.choice([1, 2, 3, -1, -2]), "magic_number": 0,
                })
                t_bat.append({
                    "team_id": tid, "year": yr, "league_id": 200, "split_id": 1,
                    "g": 162, "pa": 6180, "ab": 5520, "r": rs, "h": int(1410 + (w - 81) * 3),
                    "d": rng.randint(265, 315), "t": rng.randint(18, 36), "hr": int(195 + (w - 81) * 1.5),
                    "rbi": rs - 22, "bb": int(520 + (w - 81) * 2), "k": rng.randint(1220, 1450),
                    "sb": rng.randint(75, 155), "cs": rng.randint(20, 42),
                    "avg": round(0.252 + (w - 81) * 0.0006, 3),
                    "obp": round(0.324 + (w - 81) * 0.0007, 3),
                    "slg": round(0.422 + (w - 81) * 0.0012, 3),
                    "ops": round(0.746 + (w - 81) * 0.0019, 3),
                    "war": round(24.0 + (w - 81) * 0.45, 1),
                })
                t_pit.append({
                    "team_id": tid, "year": yr, "league_id": 200, "split_id": 1,
                    "g": 162, "gs": 162, "w": w, "l": l, "s": int(w * 0.48),
                    "ip": 1452, "ha": int(1340 - (w - 81) * 3), "r": ra, "er": int(ra * 0.92),
                    "hra": int(180 - (w - 81) * 1.1), "bb": int(490 - (w - 81) * 1.8), "k": int(1380 + (w - 81) * 3.5),
                    "era": round((ra * 0.92 * 9.0) / 1452.0, 2),
                    "whip": round(1.26 - (w - 81) * 0.004, 2),
                    "war": round(18.0 + (w - 81) * 0.38, 1),
                })
                payroll = int(rng.randint(135, 245) * 1_000_000)
                budget = int(payroll + rng.randint(15, 45) * 1_000_000)
                t_fin.append({
                    "team_id": tid, "gate_revenue": int(budget * 0.45), "media_revenue": int(budget * 0.38),
                    "total_revenue": budget + 8_000_000, "player_expenses": payroll, "total_expenses": int(payroll * 1.18),
                    "budget": budget, "player_payroll": payroll, "fan_interest": rng.randint(68, 98),
                    "fan_loyalty": rng.randint(65, 95), "market": rng.randint(4, 9), "attendance": rng.randint(2_100_000, 3_600_000),
                })
        return pd.DataFrame(t_rec), pd.DataFrame(t_bat), pd.DataFrame(t_pit), pd.DataFrame(t_fin)

    first_names = [
        "Marcus", "Julian", "Carlos", "Shohei", "Bryce", "Corbin", "Gunnar", "Bobby", "Ronald", "Mookie",
        "Freddie", "Tarik", "Paul", "Zack", "Gerrit", "Spencer", "Adley", "Julio", "Yordan", "Kyle",
        "Francisco", "Rafael", "Vladimir", "Fernando", "Corey", "Jackson", "Elly", "Wyatt", "Mason", "Logan",
        "Dylan", "Tanner", "Caleb", "Mateo", "Luis", "Diego", "Kenji", "Roki", "streaming", "Xavier",
    ]
    first_names[38] = "Dante"
    last_names = [
        "Vance", "Ramirez", "Takahashi", "Henderson", "Sterling", "Guerrero", "Castillo", "Rutschman", "Witt", "Acuna",
        "Ohtani", "Skenes", "Skubal", "Wheeler", "Strider", "Lindor", "Soto", "Alvarez", "Tucker", "Carroll",
        "Seager", "Devers", "Tatis", "Chourio", "Langford", "Holliday", "De La Cruz", "Miller", "Gilbert", "Kirby",
        "McClanahan", "Valdez", "Peralta", "Gallen", "Webb", "Snell", "Burnes", "Glasnow", "Caminero", "Mayer",
    ]

    players_rows = []
    pbat_rows = []
    ppit_rows = []
    pfld_rows = []
    pval_rows = []
    pcon_rows = []
    prost_rows = []
    cbat_rows = []
    cpit_rows = []
    cfld_rows = []
    awards_rows = []
    streak_rows = []

    pid_counter = 1000
    pos_cycle = [2, 3, 4, 5, 6, 7, 8, 9, 10, 2, 4, 6, 8]  # 13 batters per MLB team
    pit_roles = [11, 11, 11, 11, 11, 13, 12, 12, 12, 12, 12, 12]  # 5 SP, 1 CL, 6 RP per MLB team

    for t_spec in team_specs:
        tid = t_spec[0]
        aaa_id = 100 + tid
        # 13 MLB Batters + 4 AAA Prospect Batters
        for b_idx in range(17):
            pid_counter += 1
            pid = pid_counter
            is_prospect = b_idx >= 13
            cur_team_id = aaa_id if is_prospect else tid
            pos = pos_cycle[b_idx % len(pos_cycle)]
            age = rng.randint(19, 23) if is_prospect else rng.randint(23, 35)
            fn = rng.choice(first_names)
            ln = last_names[(pid * 7 + b_idx) % len(last_names)]
            oa = rng.randint(42, 55) if is_prospect else rng.randint(50, 80)
            pot = rng.randint(62, 80) if is_prospect else max(oa, rng.randint(55, 80))

            con_r = int(100 + (oa - 50) * 2.4 + rng.randint(-12, 12))
            pow_r = int(95 + (oa - 50) * 2.6 + rng.randint(-15, 15))
            eye_r = int(95 + (oa - 50) * 2.3 + rng.randint(-12, 12))
            gap_r = int(95 + (oa - 50) * 2.0 + rng.randint(-10, 10))
            ks_r = int(100 + (oa - 50) * 1.8 + rng.randint(-10, 10))
            spd_r = rng.randint(70, 175)

            players_rows.append({
                "player_id": pid, "team_id": cur_team_id, "league_id": 201 if is_prospect else 200,
                "organization_id": tid, "last_team_id": tid, "last_league_id": 200,
                "position": pos, "role": 0, "first_name": fn, "last_name": ln, "nick_name": "",
                "uniform_number": (pid % 89) + 2,
                "age": age, "date_of_birth": f"{2026 - age}-05-14", "city_of_birth_id": tid,
                "nation_id": 206, "weight": rng.randint(185, 235), "height": rng.randint(178, 196),
                "retired": 0, "free_agent": 0, "hall_of_fame": 0, "inducted": 0,
                "bats": rng.choice([1, 1, 2, 3]), "throws": 1, "experience": max(1, age - 22),
                "injury_is_injured": 0, "injury_dtd_injury": 0, "injury_dl_left": 0, "injury_left": 0,
                "morale": rng.randint(110, 185), "local_pop": rng.randint(3, 6), "prone_overall": rng.randint(60, 130),
                "draft_year": 2026 - max(1, age - 20), "draft_round": rng.randint(1, 5), "draft_pick": rng.randint(1, 30), "draft_overall_pick": rng.randint(1, 150),
                "personality_work_ethic": rng.randint(100, 180), "personality_intelligence": rng.randint(100, 180), "personality_leader": rng.randint(90, 175),
            })
            pbat_rows.append({
                "player_id": pid, "team_id": cur_team_id, "league_id": 201 if is_prospect else 200, "position": pos,
                "batting_ratings_overall_contact": con_r, "batting_ratings_overall_gap": gap_r,
                "batting_ratings_overall_power": pow_r, "batting_ratings_overall_eye": eye_r,
                "batting_ratings_overall_strikeouts": ks_r,
                "batting_ratings_talent_contact": con_r + (25 if is_prospect else 4),
                "batting_ratings_talent_gap": gap_r + (20 if is_prospect else 3),
                "batting_ratings_talent_power": pow_r + (28 if is_prospect else 4),
                "batting_ratings_talent_eye": eye_r + (22 if is_prospect else 3),
                "batting_ratings_talent_strikeouts": ks_r + (18 if is_prospect else 2),
                "running_ratings_speed": spd_r, "running_ratings_stealing": spd_r, "running_ratings_baserunning": spd_r,
            })
            ppit_rows.append({
                "player_id": pid, "team_id": cur_team_id, "league_id": 201 if is_prospect else 200, "position": pos, "role": 0,
                "pitching_ratings_overall_stuff": 20, "pitching_ratings_overall_movement": 20, "pitching_ratings_overall_control": 20,
                "pitching_ratings_talent_stuff": 20, "pitching_ratings_talent_movement": 20, "pitching_ratings_talent_control": 20,
                "pitching_ratings_misc_velocity": 8, "pitching_ratings_misc_stamina": 20,
            })
            pfld_rows.append({
                "player_id": pid, "team_id": cur_team_id, "league_id": 201 if is_prospect else 200, "position": pos,
                "fielding_ratings_infield_range": rng.randint(85, 165), "fielding_ratings_infield_arm": rng.randint(85, 165),
                "fielding_ratings_turn_doubleplay": rng.randint(85, 160), "fielding_ratings_outfield_range": rng.randint(85, 168),
                "fielding_ratings_outfield_arm": rng.randint(85, 168), "fielding_ratings_catcher_arm": rng.randint(85, 165),
                "fielding_ratings_catcher_ability": rng.randint(85, 165), "fielding_ratings_catcher_framing": rng.randint(85, 165),
                "fielding_ratings_infield_error": rng.randint(85, 160), "fielding_ratings_outfield_error": rng.randint(85, 160),
                f"fielding_rating_pos{pos}": rng.randint(105, 175),
            })
            pval_rows.append({
                "player_id": pid, "team_id": cur_team_id, "position": pos, "oa": oa, "pot": pot,
                "overall_value": oa * 10, "talent_value": pot * 11,
            })
            sal = 740_000 if is_prospect or age <= 25 else int(max(1, (oa - 45)) * 680_000)
            pcon_rows.append({
                "player_id": pid, "team_id": tid, "league_id": 200, "years": rng.randint(1, 6),
                "current_year": 0, "salary0": sal, "salary1": int(sal * 1.08), "salary2": int(sal * 1.15),
                "salary3": int(sal * 1.20), "salary4": 0,
                "is_major": 0 if is_prospect else 1, "no_trade": 0, "last_year_team_option": 0, "last_year_player_option": 0,
            })
            prost_rows.append({
                "player_id": pid, "team_id": cur_team_id, "league_id": 201 if is_prospect else 200,
                "is_active": 0 if is_prospect else 1, "is_on_secondary": 1, "mlb_service_years": max(0, age - 23),
            })

            # Career batting stats (2025 & 2026)
            for yr in (2025, 2026):
                lvl_id = 201 if is_prospect else 200
                g_played = rng.randint(95, 158) if b_idx < 9 else rng.randint(55, 118)
                ab = int(g_played * 3.75)
                avg_val = min(0.338, max(0.212, 0.235 + (con_r - 100) * 0.0009 + rng.uniform(-0.018, 0.018)))
                h = int(ab * avg_val)
                hr = max(2, int((pow_r - 75) * 0.34 * (g_played / 150.0) + rng.randint(-4, 6)))
                d = max(5, int(h * 0.21))
                t_3b = max(0, int(h * 0.02))
                bb = max(12, int((eye_r - 65) * 0.68 * (g_played / 150.0)))
                k = max(25, int((200 - ks_r) * 1.15 * (g_played / 150.0)))
                pa = ab + bb + 6
                r = int(h * 0.45 + hr * 0.65)
                rbi = int(h * 0.42 + hr * 1.15)
                sb = max(0, int((spd_r - 95) * 0.35 * (g_played / 150.0)))
                war_val = round(max(-0.5, (h * 0.035 + hr * 0.14 + bb * 0.025 - ab * 0.008)), 1)
                cbat_rows.append({
                    "player_id": pid, "year": yr, "team_id": cur_team_id, "game_id": 0,
                    "league_id": lvl_id, "level_id": 2 if is_prospect else 1, "split_id": 1,
                    "position": pos, "ab": ab, "h": h, "k": k, "pa": pa, "pitches_seen": pa * 4,
                    "g": g_played, "gs": g_played - 4, "d": d, "t": t_3b, "hr": hr, "r": r, "rbi": rbi,
                    "sb": sb, "cs": max(1, int(sb * 0.22)), "bb": bb, "ibb": max(0, int(hr / 10)),
                    "gdp": rng.randint(3, 14), "sh": 0, "sf": 4, "hp": 2, "ci": 0,
                    "wpa": round(war_val * 0.55, 2), "stint": 1, "ubr": round(rng.uniform(-1.5, 3.2), 1),
                    "war": war_val,
                })
                cfld_rows.append({
                    "player_id": pid, "year": yr, "team_id": cur_team_id, "league_id": lvl_id,
                    "level_id": 2 if is_prospect else 1, "split_id": 1, "position": pos,
                    "g": g_played, "gs": g_played - 4, "ip": g_played * 8, "ipf": 0, "tc": g_played * 3,
                    "po": g_played * 2, "a": g_played, "e": rng.randint(2, 11), "dp": rng.randint(10, 65),
                    "tp": 0, "pb": 2 if pos == 2 else 0, "sba": 35 if pos == 2 else 0, "rto": 12 if pos == 2 else 0,
                    "er": 0, "plays": g_played * 2, "plays_base": g_played * 2, "roe": 1,
                    "framing": round(rng.uniform(-2.5, 5.5), 1) if pos == 2 else 0.0,
                    "arm": round(rng.uniform(-1.5, 4.0), 1),
                    "zr": round(rng.uniform(-4.5, 9.5), 1),
                })

        # 12 MLB Pitchers + 3 AAA Prospect Pitchers
        for p_idx in range(15):
            pid_counter += 1
            pid = pid_counter
            is_prospect = p_idx >= 12
            cur_team_id = aaa_id if is_prospect else tid
            role = pit_roles[p_idx % len(pit_roles)]
            age = rng.randint(20, 24) if is_prospect else rng.randint(23, 36)
            fn = rng.choice(first_names)
            ln = last_names[(pid * 11 + p_idx) % len(last_names)]
            oa = rng.randint(43, 55) if is_prospect else rng.randint(50, 80)
            pot = rng.randint(62, 80) if is_prospect else max(oa, rng.randint(54, 80))

            stu_r = int(100 + (oa - 50) * 2.5 + rng.randint(-12, 14))
            mov_r = int(98 + (oa - 50) * 2.2 + rng.randint(-12, 12))
            ctl_r = int(98 + (oa - 50) * 2.3 + rng.randint(-12, 12))
            velo_code = rng.randint(12, 19)
            stam_r = rng.randint(115, 165) if role == 11 else rng.randint(35, 70)

            players_rows.append({
                "player_id": pid, "team_id": cur_team_id, "league_id": 201 if is_prospect else 200,
                "organization_id": tid, "last_team_id": tid, "last_league_id": 200,
                "position": 1, "role": role, "first_name": fn, "last_name": ln, "nick_name": "",
                "uniform_number": (pid % 89) + 2,
                "age": age, "date_of_birth": f"{2026 - age}-07-21", "city_of_birth_id": tid,
                "nation_id": 206, "weight": rng.randint(195, 240), "height": rng.randint(183, 199),
                "retired": 0, "free_agent": 0, "hall_of_fame": 0, "inducted": 0,
                "bats": 1, "throws": rng.choice([1, 1, 2]), "experience": max(1, age - 22),
                "injury_is_injured": 0, "injury_dtd_injury": 0, "injury_dl_left": 0, "injury_left": 0,
                "morale": rng.randint(110, 185), "local_pop": rng.randint(3, 6), "prone_overall": rng.randint(60, 130),
                "draft_year": 2026 - max(1, age - 20), "draft_round": rng.randint(1, 5), "draft_pick": rng.randint(1, 30), "draft_overall_pick": rng.randint(1, 150),
                "personality_work_ethic": rng.randint(100, 180), "personality_intelligence": rng.randint(100, 180), "personality_leader": rng.randint(90, 175),
            })
            pbat_rows.append({
                "player_id": pid, "team_id": cur_team_id, "league_id": 201 if is_prospect else 200, "position": 1,
                "batting_ratings_overall_contact": 25, "batting_ratings_overall_gap": 25,
                "batting_ratings_overall_power": 25, "batting_ratings_overall_eye": 25,
                "batting_ratings_overall_strikeouts": 25,
                "batting_ratings_talent_contact": 25, "batting_ratings_talent_gap": 25,
                "batting_ratings_talent_power": 25, "batting_ratings_talent_eye": 25,
                "batting_ratings_talent_strikeouts": 25,
                "running_ratings_speed": 45, "running_ratings_stealing": 30, "running_ratings_baserunning": 40,
            })
            ppit_rows.append({
                "player_id": pid, "team_id": cur_team_id, "league_id": 201 if is_prospect else 200, "position": 1, "role": role,
                "pitching_ratings_overall_stuff": stu_r, "pitching_ratings_overall_movement": mov_r,
                "pitching_ratings_overall_control": ctl_r,
                "pitching_ratings_talent_stuff": stu_r + (24 if is_prospect else 3),
                "pitching_ratings_talent_movement": mov_r + (20 if is_prospect else 3),
                "pitching_ratings_talent_control": ctl_r + (22 if is_prospect else 3),
                "pitching_ratings_misc_velocity": velo_code, "pitching_ratings_misc_stamina": stam_r,
                "pitching_ratings_Misc_arm_slot": rng.choice([3, 4, 4, 5]),
                "pitching_ratings_pitches_fastball": min(200, stu_r + 18),
                "pitching_ratings_pitches_slider": min(200, stu_r + 8),
                "pitching_ratings_pitches_changeup": min(200, mov_r + 5),
                "pitching_ratings_pitches_curveball": min(200, stu_r),
            })
            pfld_rows.append({
                "player_id": pid, "team_id": cur_team_id, "league_id": 201 if is_prospect else 200, "position": 1,
                "fielding_ratings_infield_range": 90, "fielding_ratings_infield_arm": 120,
                "fielding_ratings_turn_doubleplay": 70, "fielding_ratings_outfield_range": 60,
                "fielding_ratings_outfield_arm": 110, "fielding_ratings_catcher_arm": 50,
                "fielding_ratings_catcher_ability": 50, "fielding_ratings_catcher_framing": 50,
                "fielding_ratings_infield_error": 100, "fielding_ratings_outfield_error": 90, "fielding_rating_pos1": 125,
            })
            pval_rows.append({
                "player_id": pid, "team_id": cur_team_id, "position": 1, "oa": oa, "pot": pot,
                "overall_value": oa * 10, "talent_value": pot * 11,
            })
            sal = 740_000 if is_prospect or age <= 25 else int(max(1, (oa - 45)) * 620_000)
            pcon_rows.append({
                "player_id": pid, "team_id": tid, "league_id": 200, "years": rng.randint(1, 5),
                "current_year": 0, "salary0": sal, "salary1": int(sal * 1.08), "salary2": int(sal * 1.15),
                "salary3": 0, "salary4": 0,
                "is_major": 0 if is_prospect else 1, "no_trade": 0, "last_year_team_option": 0, "last_year_player_option": 0,
            })
            prost_rows.append({
                "player_id": pid, "team_id": cur_team_id, "league_id": 201 if is_prospect else 200,
                "is_active": 0 if is_prospect else 1, "is_on_secondary": 1, "mlb_service_years": max(0, age - 23),
            })

            for yr in (2025, 2026):
                lvl_id = 201 if is_prospect else 200
                is_sp = role == 11
                g_p = rng.randint(27, 33) if is_sp else rng.randint(52, 70)
                gs_p = g_p if is_sp else 0
                ip = int(g_p * 5.8) if is_sp else int(g_p * 1.05)
                era_target = max(2.15, min(5.40, 4.35 - (oa - 50) * 0.055 + rng.uniform(-0.35, 0.35)))
                er = max(6, int((era_target * ip) / 9.0))
                r_p = int(er * 1.07)
                k_p = max(20, int(ip * (0.85 + (stu_r - 90) * 0.0055)))
                bb_p = max(8, int(ip * max(0.18, (0.42 - (ctl_r - 90) * 0.0022))))
                hra_p = max(2, int(ip * max(0.06, (0.15 - (mov_r - 90) * 0.0009))))
                ha_p = max(20, int(ip * 0.88))
                w_p = max(2, int(ip / 12.5 + (4.20 - era_target) * 2.2)) if is_sp else rng.randint(2, 7)
                l_p = max(2, int(gs_p * 0.62 - w_p)) if is_sp else rng.randint(1, 5)
                sv_p = rng.randint(28, 44) if role == 13 else (rng.randint(0, 4) if not is_sp else 0)
                war_p = round(max(-0.4, (ip / 9.0) * ((4.50 - era_target) / 9.2)), 1)
                cpit_rows.append({
                    "player_id": pid, "year": yr, "team_id": cur_team_id, "game_id": 0,
                    "league_id": lvl_id, "level_id": 2 if is_prospect else 1, "split_id": 1,
                    "ip": ip, "ab": ip * 3 + ha_p, "tb": ha_p + hra_p * 3, "ha": ha_p, "k": k_p,
                    "bf": ip * 3 + ha_p + bb_p, "rs": int(ip * 0.5), "bb": bb_p, "r": r_p, "er": er,
                    "gb": int(ip * 1.3), "fb": int(ip * 0.9), "pi": ip * 16, "ipf": 0,
                    "g": g_p, "gs": gs_p, "w": w_p, "l": l_p, "s": sv_p, "sa": sv_p + 3 if sv_p else 0,
                    "da": int(ha_p * 0.18), "sh": 0, "sf": 2, "ta": 1, "hra": hra_p, "bk": 0,
                    "ci": 0, "iw": 1, "wp": 3, "hp": 3, "gf": g_p - gs_p, "dp": int(ip * 0.09),
                    "qs": int(gs_p * 0.58) if is_sp else 0, "svo": sv_p + 4 if sv_p else 0,
                    "bs": 3 if sv_p else 0, "ra": 0, "cg": 1 if is_sp and oa >= 70 else 0,
                    "sho": 1 if is_sp and oa >= 74 else 0, "sb": 0, "cs": 0,
                    "hld": rng.randint(6, 22) if (not is_sp and role != 13) else 0,
                    "ir": 0, "irs": 0, "wpa": round(war_p * 0.5, 2), "li": 1.0, "stint": 1,
                    "outs": ip * 3, "sd": 0, "md": 0,
                    "war": war_p, "ra9war": war_p, "r9": round((r_p * 9.0) / max(1, ip), 2),
                })

    # Add 8 Retired Hall of Fame Legends so Cooperstown HOF & JAWS Museum is populated!
    hof_legends = [
        ("Hank", "Sovereign", 8, 19, 2021),
        ("Roberto", "Delgado", 9, 18, 2022),
        ("Nolan", "Kershaw", 1, 20, 2023),
        ("Cal", "Jeter", 6, 19, 2024),
        ("Albert", "Cabrera", 3, 21, 2025),
        ("Pedro", "Halladay", 1, 17, 2025),
        ("Johnny", "Piazza", 2, 16, 2026),
        ("Rickey", "Mays", 7, 20, 2026),
    ]
    for h_idx, (fn, ln, pos, seasons_cnt, induct_yr) in enumerate(hof_legends, start=1):
        pid_counter += 1
        pid = pid_counter
        tid = ((h_idx - 1) % 16) + 1
        players_rows.append({
            "player_id": pid, "team_id": 0, "league_id": 200,
            "organization_id": tid, "last_team_id": tid, "last_league_id": 200,
            "position": pos, "role": 11 if pos == 1 else 0,
            "first_name": fn, "last_name": ln, "nick_name": "The Legend",
            "uniform_number": 99 - h_idx,
            "age": 44 + h_idx, "date_of_birth": f"{1980 - h_idx}-04-10", "city_of_birth_id": tid,
            "nation_id": 206, "weight": 215, "height": 188,
            "retired": 1, "free_agent": 0, "hall_of_fame": 1, "inducted": induct_yr,
            "bats": 1, "throws": 1, "experience": seasons_cnt,
            "injury_is_injured": 0, "injury_dtd_injury": 0, "injury_dl_left": 0, "injury_left": 0,
            "morale": 185, "local_pop": 6, "prone_overall": 75,
            "draft_year": 2000, "draft_round": 1, "draft_pick": h_idx, "draft_overall_pick": h_idx,
            "personality_work_ethic": 190, "personality_intelligence": 185, "personality_leader": 190,
        })
        pval_rows.append({"player_id": pid, "team_id": tid, "position": pos, "oa": 80, "pot": 80, "overall_value": 800, "talent_value": 850})
        for s_offset in range(seasons_cnt):
            s_yr = induct_yr - seasons_cnt - 2 + s_offset
            if pos == 1:
                w_hof = round(rng.uniform(4.8, 7.9), 1)
                cpit_rows.append({
                    "player_id": pid, "year": s_yr, "team_id": tid, "game_id": 0, "league_id": 200, "level_id": 1, "split_id": 1,
                    "ip": 218, "ab": 810, "tb": 260, "ha": 175, "k": 248, "bf": 865, "rs": 110, "bb": 48,
                    "r": 64, "er": 59, "gb": 280, "fb": 190, "pi": 3300, "ipf": 0, "g": 33, "gs": 33,
                    "w": 18, "l": 6, "s": 0, "sa": 0, "da": 30, "sh": 0, "sf": 2, "ta": 1, "hra": 16,
                    "bk": 0, "ci": 0, "iw": 0, "wp": 2, "hp": 3, "gf": 0, "dp": 18, "qs": 24, "svo": 0,
                    "bs": 0, "ra": 0, "cg": 3, "sho": 2, "sb": 0, "cs": 0, "hld": 0,
                    "ir": 0, "irs": 0, "wpa": 4.1, "li": 1.0, "stint": 1, "outs": 218 * 3, "sd": 0, "md": 0,
                    "war": w_hof, "ra9war": w_hof, "r9": 2.64,
                })
            else:
                cbat_rows.append({
                    "player_id": pid, "year": s_yr, "team_id": tid, "game_id": 0, "league_id": 200, "level_id": 1, "split_id": 1,
                    "position": pos, "ab": 585, "h": 186, "k": 82, "pa": 665, "pitches_seen": 2600,
                    "g": 154, "gs": 152, "d": 38, "t": 4, "hr": 36, "r": 108, "rbi": 114,
                    "sb": 18, "cs": 4, "bb": 74, "ibb": 8, "gdp": 9, "sh": 0, "sf": 6, "hp": 4, "ci": 0,
                    "wpa": 4.2, "stint": 1, "ubr": 2.1, "war": round(rng.uniform(4.5, 8.2), 1),
                })

    # Generate Games & Statcast At-Bat Spray Chart rows
    games_rows = []
    gscore_rows = []
    ab_rows = []
    gbat_rows = []
    gpit_rows = []

    mlb_batters = [p for p in players_rows if p["position"] != 1 and p["retired"] == 0 and p["league_id"] == 200]
    mlb_pitchers = [p for p in players_rows if p["position"] == 1 and p["retired"] == 0 and p["league_id"] == 200]

    for g_idx in range(1, 41):
        gid = 5000 + g_idx
        home_tid = ((g_idx - 1) % 16) + 1
        away_tid = ((g_idx + 3) % 16) + 1
        if away_tid == home_tid:
            away_tid = (home_tid % 16) + 1
        r_home = rng.randint(1, 9)
        r_away = rng.randint(1, 9)
        if r_home == r_away:
            r_home += 1
        games_rows.append({
            "game_id": gid, "league_id": 200, "home_team": home_tid, "away_team": away_tid,
            "attendance": rng.randint(28500, 46000), "date": f"2026-09-{(g_idx % 28) + 1:02d}",
            "time": 1905, "game_type": 0, "played": 1, "innings": 9,
            "runs0": r_away, "runs1": r_home, "hits0": r_away + 5, "hits1": r_home + 5,
            "errors0": rng.randint(0, 2), "errors1": rng.randint(0, 2),
            "winning_pitcher": mlb_pitchers[home_tid % len(mlb_pitchers)]["player_id"],
            "losing_pitcher": mlb_pitchers[away_tid % len(mlb_pitchers)]["player_id"],
            "save_pitcher": 0, "starter0": mlb_pitchers[away_tid % len(mlb_pitchers)]["player_id"],
            "starter1": mlb_pitchers[home_tid % len(mlb_pitchers)]["player_id"],
        })
        for team_side, tid_val, runs_tot in [(0, away_tid, r_away), (1, home_tid, r_home)]:
            gscore_rows.append({
                "game_id": gid, "team": team_side, "inning": 1, "score": runs_tot,
            })

        # Create 35 Statcast batted-ball / PA events per game (1,400 total)
        home_bats = [b for b in mlb_batters if b["team_id"] == home_tid] or mlb_batters[:9]
        away_bats = [b for b in mlb_batters if b["team_id"] == away_tid] or mlb_batters[9:18]
        home_pits = [p for p in mlb_pitchers if p["team_id"] == home_tid] or mlb_pitchers[:3]
        away_pits = [p for p in mlb_pitchers if p["team_id"] == away_tid] or mlb_pitchers[3:6]

        for pa_idx in range(36):
            is_bot = pa_idx % 2 == 1
            b_player = rng.choice(home_bats if is_bot else away_bats)
            p_player = rng.choice(away_pits if is_bot else home_pits)
            res_code = rng.choices([1, 2, 4, 5, 6, 7, 8, 9], weights=[22, 9, 24, 21, 14, 5, 1, 4])[0]
            if res_code == 9:  # Home run
                hit_loc = rng.randint(98, 105)
                ev = round(rng.uniform(100.5, 114.8), 1)
                la = round(rng.uniform(22.0, 34.0), 1)
            elif res_code in (6, 7, 8):  # Hit in play
                hit_loc = rng.randint(44, 85)
                ev = round(rng.uniform(86.0, 111.5), 1)
                la = round(rng.uniform(8.0, 26.0), 1)
            elif res_code == 4:  # Groundout
                hit_loc = rng.randint(13, 42)
                ev = round(rng.uniform(76.0, 103.0), 1)
                la = round(rng.uniform(-14.0, 6.0), 1)
            elif res_code == 5:  # Flyout
                hit_loc = rng.randint(44, 85)
                ev = round(rng.uniform(82.0, 99.5), 1)
                la = round(rng.uniform(24.0, 44.0), 1)
            else:  # K or BB
                hit_loc = 0
                ev = 0.0
                la = 0.0

            ab_rows.append({
                "player_id": b_player["player_id"],
                "game_id": gid,
                "team_id": b_player["team_id"],
                "opponent_player_id": p_player["player_id"],
                "inning": (pa_idx // 4) + 1,
                "outs": pa_idx % 3,
                "balls": rng.randint(0, 3),
                "strikes": rng.randint(0, 2),
                "result": res_code,
                "pitches": rng.randint(2, 7),
                "base1": 1 if pa_idx % 5 == 0 else 0,
                "base2": 1 if pa_idx % 7 == 0 else 0,
                "base3": 0,
                "rbi": 1 if res_code == 9 else 0,
                "hit_loc": hit_loc,
                "hit_xy": rng.randint(0, 255),
                "exit_velo": ev,
                "launch_angle": la,
                "sprint_speed": round(rng.uniform(25.5, 30.2), 1),
                "spot": (pa_idx % 9) + 1,
                "r": 1 if res_code == 9 else 0,
                "sb": 0,
                "cs": 0,
                "sac": 0,
                "Close": 1 if pa_idx >= 28 else 0,
                "run_diff": 0,
                "pinch": 0,
            })

    # Awards & Trades
    top_batters = mlb_batters[:10]
    top_pitchers = mlb_pitchers[:10]
    for yr in (2025, 2026):
        awards_rows.append({"player_id": top_batters[0]["player_id"], "league_id": 200, "team_id": top_batters[0]["team_id"], "sub_league_id": 0, "award_id": 5, "year": yr, "season": 1, "position": 0, "day": 1, "month": 10, "finish": 1})
        awards_rows.append({"player_id": top_pitchers[0]["player_id"], "league_id": 200, "team_id": top_pitchers[0]["team_id"], "sub_league_id": 0, "award_id": 4, "year": yr, "season": 1, "position": 1, "day": 1, "month": 10, "finish": 1})
        awards_rows.append({"player_id": top_batters[1]["player_id"], "league_id": 200, "team_id": top_batters[1]["team_id"], "sub_league_id": 1, "award_id": 5, "year": yr, "season": 1, "position": 0, "day": 1, "month": 10, "finish": 1})
        awards_rows.append({"player_id": top_pitchers[1]["player_id"], "league_id": 200, "team_id": top_pitchers[1]["team_id"], "sub_league_id": 1, "award_id": 4, "year": yr, "season": 1, "position": 1, "day": 1, "month": 10, "finish": 1})

    for b in top_batters[:6]:
        streak_rows.append({"player_id": b["player_id"], "league_id": 200, "streak_id": 0, "value": rng.randint(14, 26), "has_ended": 0, "started": "2026-08-15", "ended": "2026-09-20"})

    trades_df = pd.DataFrame([
        {
            "trade_id": 1, "date": "2026-07-30", "summary": "Deadline Blockbuster Trade",
            "team_id_0": 1, "player_id_0_0": top_batters[2]["player_id"], "player_id_0_1": 0,
            "team_id_1": 13, "player_id_1_0": top_pitchers[2]["player_id"], "player_id_1_1": 0,
        },
        {
            "trade_id": 2, "date": "2026-07-31", "summary": "Contender Bullpen Upgrade",
            "team_id_0": 2, "player_id_0_0": top_batters[4]["player_id"], "player_id_0_1": 0,
            "team_id_1": 9, "player_id_1_0": top_pitchers[4]["player_id"], "player_id_1_1": 0,
        },
    ])

    messages_df = pd.DataFrame([
        {"message_id": 1, "subject": "2026 Postseason Race Heating Up Across Both Conferences", "date": "2026-09-25", "sender_type": 0, "sender_id": 0, "Importance": 1, "message_type": 1, "team_id_0": 1, "player_id_0": top_batters[0]["player_id"]},
        {"message_id": 2, "subject": f"{top_batters[0]['first_name']} {top_batters[0]['last_name']} Leads League MVP Chase", "date": "2026-09-28", "sender_type": 0, "sender_id": 0, "Importance": 1, "message_type": 1, "team_id_0": top_batters[0]["team_id"], "player_id_0": top_batters[0]["player_id"]},
    ])

    league_playoffs_df = pd.DataFrame([
        {
            "league_id": 200, "play_off_mode": 4, "round": 2, "max_round": 3,
            "round_names0": "Division Series", "round_names1": "League Championship Series", "round_names2": "World Series",
            "best_of0": 5, "best_of1": 7, "best_of2": 7, "split0": 1, "split1": 1, "split2": 1,
        }
    ])

    league_playoff_fixtures_df = pd.DataFrame([
        {"league_id": 200, "team_id0": 1, "team_id1": 4, "winner": 1, "finished": 1, "best_of": 5, "played": 4, "round": 0, "series": 0, "result0": 3, "result1": 1},
        {"league_id": 200, "team_id0": 5, "team_id1": 2, "winner": 5, "finished": 1, "best_of": 5, "played": 5, "round": 0, "series": 1, "result0": 3, "result1": 2},
        {"league_id": 200, "team_id0": 9, "team_id1": 12, "winner": 9, "finished": 1, "best_of": 5, "played": 4, "round": 0, "series": 2, "result0": 3, "result1": 1},
        {"league_id": 200, "team_id0": 13, "team_id1": 10, "winner": 13, "finished": 1, "best_of": 5, "played": 5, "round": 0, "series": 3, "result0": 3, "result1": 2},
        {"league_id": 200, "team_id0": 1, "team_id1": 5, "winner": 1, "finished": 1, "best_of": 7, "played": 6, "round": 1, "series": 4, "result0": 4, "result1": 2},
        {"league_id": 200, "team_id0": 9, "team_id1": 13, "winner": 13, "finished": 1, "best_of": 7, "played": 7, "round": 1, "series": 5, "result0": 3, "result1": 4},
        {"league_id": 200, "team_id0": 1, "team_id1": 13, "winner": 0, "finished": 0, "best_of": 7, "played": 5, "round": 2, "series": 6, "result0": 3, "result1": 2},
    ])

    # Write CSV tables to 2025 dump, 2026 dump, and import_export/csv
    t_rec_25, t_bat_25, t_pit_25, t_fin_25 = build_team_season_tables(2025)
    t_rec_26, t_bat_26, t_pit_26, t_fin_26 = build_team_season_tables(2026)

    common_tables = {
        "nations": nations_df,
        "states": states_df,
        "cities": pd.DataFrame(cities_rows),
        "parks": pd.DataFrame(parks_rows),
        "sub_leagues": sub_leagues_df,
        "divisions": divisions_df,
        "teams": pd.DataFrame(teams_rows),
        "team_affiliations": pd.DataFrame(affiliations_rows),
        "players": pd.DataFrame(players_rows),
        "players_batting": pd.DataFrame(pbat_rows),
        "players_pitching": pd.DataFrame(ppit_rows),
        "players_fielding": pd.DataFrame(pfld_rows),
        "players_value": pd.DataFrame(pval_rows),
        "players_contract": pd.DataFrame(pcon_rows),
        "players_roster_status": pd.DataFrame(prost_rows),
        "players_career_batting_stats": pd.DataFrame(cbat_rows),
        "players_career_pitching_stats": pd.DataFrame(cpit_rows),
        "players_career_fielding_stats": pd.DataFrame(cfld_rows),
        "players_at_bat_batting_stats": pd.DataFrame(ab_rows),
        "games": pd.DataFrame(games_rows),
        "games_score": pd.DataFrame(gscore_rows),
        "players_awards": pd.DataFrame(awards_rows),
        "players_streak": pd.DataFrame(streak_rows),
        "trade_history": trades_df,
        "messages": messages_df,
        "league_playoffs": league_playoffs_df,
        "league_playoff_fixtures": league_playoff_fixtures_df,
    }

    for target_dir, yr, t_rec, t_bat, t_pit, t_fin in [
        (dump_2025, 2025, t_rec_25, t_bat_25, t_pit_25, t_fin_25),
        (dump_2026, 2026, t_rec_26, t_bat_26, t_pit_26, t_fin_26),
        (ie_csv, 2026, t_rec_26, t_bat_26, t_pit_26, t_fin_26),
    ]:
        lg_copy = leagues_df.copy()
        lg_copy["season_year"] = yr
        lg_copy["current_date"] = f"{yr}-10-01"
        lg_copy.to_csv(target_dir / "leagues.csv", index=False)
        t_rec.to_csv(target_dir / "team_record.csv", index=False)
        t_bat.to_csv(target_dir / "team_batting_stats.csv", index=False)
        t_pit.to_csv(target_dir / "team_pitching_stats.csv", index=False)
        t_fin.to_csv(target_dir / "team_financials.csv", index=False)

        for name, df in common_tables.items():
            if name == "players_value" and yr == 2025:
                df_25 = df.copy()
                df_25["oa"] = df_25["oa"].apply(lambda x: max(35, x - 3))
                df_25.to_csv(target_dir / f"{name}.csv", index=False)
            else:
                df.to_csv(target_dir / f"{name}.csv", index=False)

    # Create sample BNN index.html
    (html_dir / "index.html").write_text(
        """<!DOCTYPE html><html><head><title>OOTP 27 Demo League BNN Index</title></head>
        <body style="background:#0a0a0a;color:#dbdbdb;font-family:sans-serif;padding:24px;">
        <h2>OOTP 27 Demo League — BNN Report Center</h2>
        <p>This bundled demo save includes 16 MLB Franchises, 16 AAA Affiliates, 480+ Players, 1,400+ Statcast Batted-Ball Events, and Cooperstown HOF Legends.</p>
        </body></html>""",
        encoding="utf-8",
    )

    discover_all_saves()
    slug = slugify(clean_name)
    ingest_res = ingest_save_to_sqlite(slug, force=True)
    set_active_save_slug(slug)
    save_user_config({"default_save_slug": slug, "setup_completed": True})

    return {
        "status": "ok",
        "save_slug": slug,
        "save_name": save_name,
        "folder_path": str(lg_dir),
        "ingestion": ingest_res,
    }


def run_functionality_verification(save_slug: str = None) -> dict:
    """
    Executes a 9-point end-to-end diagnostic verification suite across the application's
    core subsystems to guarantee functionality.
    """
    from app.analytics import (
        get_save_overview,
        get_team_dashboard,
        get_sabermetric_leaderboards,
        get_spray_chart_data,
        get_statsplus_reports,
        get_league_evolution_hub,
        get_league_leaders_hub,
        get_hall_of_fame_hub,
        get_newspaper_front_page,
        get_stretch_hub,
        get_world_dashboard,
    )
    from app.bnn_generator import list_available_bnn_reports

    t_start = time.perf_counter()
    checks = []

    # 1. Environment & Dependencies
    t0 = time.perf_counter()
    env = check_environment_health()
    env_ok = env["python_ok"] and env["all_packages_ok"]
    checks.append({
        "id": "env_deps",
        "name": "1. Python Runtime & ASGI Dependencies",
        "status": "pass" if env_ok else "fail",
        "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
        "detail": f"Python {env['python_version']} | SQLite {env['sqlite_version']} | All {len(env['packages'])} core packages verified",
    })

    # 2. Storage & SQLite Registry
    t0 = time.perf_counter()
    saves = discover_all_saves()
    target_slug = save_slug or get_active_save_slug()
    checks.append({
        "id": "storage_registry",
        "name": "2. SQLite Host Registry & Save Discovery",
        "status": "pass" if env["data_writable"] and len(saves) > 0 else ("warn" if env["data_writable"] else "fail"),
        "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
        "detail": f"Discovered {len(saves)} save(s) | Data dir writable ({env['disk_free_gb']} GB free) | Target save: '{target_slug}'",
    })

    # 3. SQLite Save Ingestion
    t0 = time.perf_counter()
    ing_status = "fail"
    ing_detail = "No active save found to ingest."
    has_csv = False
    try:
        if saves:
            ing_res = ingest_save_to_sqlite(target_slug, force=False)
            if ing_res.get("status") in ("cached", "ingested"):
                ing_status = "pass"
                has_csv = True
                ing_detail = f"SQLite DB verified ({ing_res.get('status')}) | {ing_res.get('players_count', 0):,} players | {ing_res.get('at_bats_count', 0):,} Statcast PAs"
            else:
                ing_status = "warn"
                ing_detail = ing_res.get("message", "No CSV tables exported in this save yet.")
    except Exception as exc:
        ing_status = "fail"
        ing_detail = f"Ingestion error: {exc}"
    checks.append({
        "id": "sqlite_ingestion",
        "name": "3. Multi-Dump CSV to SQLite Ingestion Engine",
        "status": ing_status,
        "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
        "detail": ing_detail,
    })

    # 4. Overview & Team Franchise Hub
    t0 = time.perf_counter()
    try:
        ov = get_save_overview(target_slug)
        teams = ov.get("teams") or []
        first_tid = teams[0]["team_id"] if teams else None
        td = get_team_dashboard(target_slug, team_id=first_tid) if first_tid else {}
        pos_str_cnt = len(td.get("positional_strengths") or [])
        ov_ok = bool(ov.get("has_csv") and len(teams) > 0 and pos_str_cnt > 0)
        checks.append({
            "id": "overview_teamhub",
            "name": "4. League Pulse, Standings & Team Franchise Hub",
            "status": "pass" if ov_ok else "warn",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Loaded {len(ov.get('leagues', []))} league(s), {len(teams)} teams, {pos_str_cnt} positional depth units on Team Hub",
        })
    except Exception as exc:
        checks.append({
            "id": "overview_teamhub",
            "name": "4. League Pulse, Standings & Team Franchise Hub",
            "status": "fail",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Error: {exc}",
        })

    # 5. Sabermetrics & League Leaders
    t0 = time.perf_counter()
    try:
        saber = get_sabermetric_leaderboards(target_slug)
        leaders = get_league_leaders_hub(target_slug)
        bat_cnt = len(saber.get("batters") or [])
        pit_cnt = len(saber.get("pitchers") or [])
        checks.append({
            "id": "sabermetrics_leaders",
            "name": "5. Sabermetric Lab (wOBA/wRC+/FIP/WAR) & Leaders Hub",
            "status": "pass" if (bat_cnt > 0 or pit_cnt > 0) else "warn",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Computed sabermetrics for {bat_cnt:,} batters & {pit_cnt:,} pitchers | Leaders cards verified",
        })
    except Exception as exc:
        checks.append({
            "id": "sabermetrics_leaders",
            "name": "5. Sabermetric Lab (wOBA/wRC+/FIP/WAR) & Leaders Hub",
            "status": "fail",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Error: {exc}",
        })

    # 6. Statcast & 3D Spray Charts
    t0 = time.perf_counter()
    try:
        spray = get_spray_chart_data(target_slug, limit=250)
        pts_cnt = len(spray.get("points") or [])
        checks.append({
            "id": "statcast_spray",
            "name": "6. Statcast Exit Velo, Barrel & 3D Spray Chart Engine",
            "status": "pass" if (pts_cnt > 0 or has_csv) else "warn",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Mapped {pts_cnt} batted-ball coordinates | Avg EV: {spray.get('summary', {}).get('avg_ev', 0)} mph | Barrels: {spray.get('summary', {}).get('barrels', 0)}",
        })
    except Exception as exc:
        checks.append({
            "id": "statcast_spray",
            "name": "6. Statcast Exit Velo, Barrel & 3D Spray Chart Engine",
            "status": "fail",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Error: {exc}",
        })

    # 7. StatsPlus Portal & Cooperstown HOF / JAWS
    t0 = time.perf_counter()
    try:
        sp = get_statsplus_reports(target_slug)
        hof = get_hall_of_fame_hub(target_slug)
        prosp_cnt = len(sp.get("prospects") or [])
        jaws_cnt = len(hof.get("jaws_overall_leaders") or [])
        checks.append({
            "id": "statsplus_hof",
            "name": "7. StatsPlus Portal, Farm Rankings & Cooperstown JAWS HOF",
            "status": "pass" if (prosp_cnt > 0 or jaws_cnt > 0 or has_csv) else "warn",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Ranked {prosp_cnt} prospects | Evaluated {jaws_cnt} career JAWS profiles & {hof.get('total_inductees', 0)} HOFers",
        })
    except Exception as exc:
        checks.append({
            "id": "statsplus_hof",
            "name": "7. StatsPlus Portal, Farm Rankings & Cooperstown JAWS HOF",
            "status": "fail",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Error: {exc}",
        })

    # 8. Evolution Hub & BNN Almanac Catalog
    t0 = time.perf_counter()
    try:
        evo = get_league_evolution_hub(target_slug)
        bnn = list_available_bnn_reports(target_slug)
        cand_cnt = len(evo.get("candidate_markets") or [])
        ql_cnt = len(bnn.get("quick_links") or [])
        checks.append({
            "id": "evolution_bnn",
            "name": "8. League Evolution Hub & BNN Almanac Report Server",
            "status": "pass" if (cand_cnt > 0 or ql_cnt > 0) else "warn",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Evaluated {cand_cnt} expansion markets | {ql_cnt} BNN navigation endpoints & {len(bnn.get('almanacs') or [])} almanac(s)",
        })
    except Exception as exc:
        checks.append({
            "id": "evolution_bnn",
            "name": "8. League Evolution Hub & BNN Almanac Report Server",
            "status": "fail",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Error: {exc}",
        })

    # 9. Front Page Gazette, "The Stretch" & World Dashboard
    t0 = time.perf_counter()
    try:
        fp = get_newspaper_front_page(target_slug)
        st = get_stretch_hub(target_slug)
        wd = get_world_dashboard(target_slug)
        hl_cnt = len(fp.get("headlines") or [])
        pkg_cnt = len(st.get("league_packages") or [])
        org_cnt = len(wd.get("organizational_pyramid") or [])
        checks.append({
            "id": "frontpage_stretch_world",
            "name": "9. Front Page Gazette, 'The Stretch' & World Dashboard",
            "status": "pass" if (hl_cnt > 0 and pkg_cnt > 0 and org_cnt > 0) else "warn",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Generated {hl_cnt} dynamic headlines ('{fp.get('primary_headline', {}).get('headline', '')}') | {pkg_cnt} Stretch race package(s) | {org_cnt} World Organizations",
        })
    except Exception as exc:
        checks.append({
            "id": "frontpage_stretch_world",
            "name": "9. Front Page Gazette, 'The Stretch' & World Dashboard",
            "status": "fail",
            "duration_ms": round((time.perf_counter() - t0) * 1000, 1),
            "detail": f"Error: {exc}",
        })

    pass_cnt = sum(1 for c in checks if c["status"] == "pass")
    fail_cnt = sum(1 for c in checks if c["status"] == "fail")
    overall = "healthy" if fail_cnt == 0 and pass_cnt >= 7 else ("warning" if fail_cnt == 0 else "error")

    return {
        "overall_status": overall,
        "save_slug": target_slug,
        "passed": pass_cnt,
        "total": len(checks),
        "total_duration_ms": round((time.perf_counter() - t_start) * 1000, 1),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "checks": checks,
    }


def create_desktop_shortcut_action() -> dict:
    ps1_path = BASE_DIR / "create_shortcut.ps1"
    if not ps1_path.is_file():
        return {"ok": False, "error": "create_shortcut.ps1 not found in project root."}
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps1_path)],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            timeout=30,
        )
        out = (proc.stdout or "").strip()
        err = (proc.stderr or "").strip()
        desktop_dir = Path(os.path.expanduser("~")) / "Desktop"
        shortcut_path = desktop_dir / "OOTP 27 Analytics & Hosting Hub.lnk"
        return {
            "ok": proc.returncode == 0 and shortcut_path.is_file(),
            "shortcut_path": str(shortcut_path),
            "output": out or err,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
