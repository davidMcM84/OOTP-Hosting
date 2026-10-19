import os
import re
import glob
import json
import shutil
import sqlite3
import zipfile
from datetime import datetime
from pathlib import Path
import pandas as pd

from app.config import (
    DEFAULT_SAVED_GAMES_DIR,
    SAVES_DB_DIR,
    UPLOADED_SAVES_DIR,
    HOST_DB_PATH,
    ACTIVE_DB_PATH,
    get_saved_games_dir,
    load_user_config,
)

CORE_CSV_TABLES = [
    "leagues",
    "sub_leagues",
    "divisions",
    "teams",
    "team_record",
    "team_batting_stats",
    "team_pitching_stats",
    "team_bullpen_pitching_stats",
    "team_starting_pitching_stats",
    "team_fielding_stats_stats",
    "team_financials",
    "team_last_financials",
    "team_roster",
    "team_roster_staff",
    "team_affiliations",
    "team_relations",
    "team_history",
    "team_history_record",
    "team_history_batting_stats",
    "team_history_pitching_stats",
    "team_history_fielding_stats_stats",
    "team_history_financials",
    "parks",
    "games",
    "games_score",
    "game_logs",
    "players",
    "players_batting",
    "players_pitching",
    "players_fielding",
    "players_value",
    "players_contract",
    "players_contract_extension",
    "players_roster_status",
    "players_career_batting_stats",
    "players_career_pitching_stats",
    "players_career_fielding_stats",
    "players_game_batting",
    "players_game_pitching_stats",
    "players_at_bat_batting_stats",
    "players_individual_batting_stats",
    "players_awards",
    "players_injury_history",
    "players_salary_history",
    "players_streak",
    "players_league_leader",
    "coaches",
    "trade_history",
    "messages",
    "league_events",
    "league_playoffs",
    "league_playoff_fixtures",
    "league_history",
    "league_history_all_star",
    "league_history_batting_stats",
    "league_history_pitching_stats",
    "league_history_fielding_stats",
    "human_managers",
    "human_manager_history",
    "human_manager_history_record",
    "human_manager_history_batting_stats",
    "human_manager_history_pitching_stats",
    "human_manager_history_fielding_stats_stats",
    "human_manager_history_financials",
    "projected_starting_pitchers",
    "nations",
    "states",
    "cities",
    "continents",
    "languages",
    "language_data",
]


def slugify(text: str) -> str:
    s = re.sub(r"\.lg$", "", text, flags=re.IGNORECASE)
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").lower()
    return s or "ootp_save"


def _parse_date_tuple(date_str: str, fallback_year: int = 0) -> tuple[int, int, int]:
    if not date_str:
        return (fallback_year, 0, 0)
    parts = re.findall(r"\d+", str(date_str))
    if len(parts) >= 3:
        return (int(parts[0]), int(parts[1]), int(parts[2]))
    if len(parts) == 2:
        return (int(parts[0]), int(parts[1]), 0)
    if len(parts) == 1:
        return (int(parts[0]), 0, 0)
    return (fallback_year, 0, 0)


def _inspect_csv_source(label: str, cdir: Path) -> dict | None:
    if not cdir or not cdir.is_dir():
        return None
    csv_files = list(cdir.glob("*.csv"))
    if len(csv_files) < 5:
        return None
    mtime = max(f.stat().st_mtime for f in csv_files)
    mtime_str = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")

    yr_match = re.search(r"(\d{4})", label)
    season_year = int(yr_match.group(1)) if yr_match else 0
    current_date = ""
    leagues_count = 1
    primary_league_id = 200
    primary_league_name = ""
    primary_league_abbr = "MLB"

    lf = cdir / "leagues.csv"
    if lf.exists():
        try:
            ldf = pd.read_csv(lf, nrows=25)
            if not ldf.empty:
                leagues_count = len(ldf)
                row0 = ldf.iloc[0]
                primary_league_id = int(row0.get("league_id", 200))
                primary_league_name = str(row0.get("name", ""))
                primary_league_abbr = str(row0.get("abbr", "LGE"))
                season_year = int(row0.get("season_year", season_year or 2026))
                current_date = str(row0.get("current_date", "") or "")
        except Exception:
            pass

    teams_count = 0
    total_teams_count = 0
    tf = cdir / "teams.csv"
    if tf.exists():
        try:
            tdf = pd.read_csv(tf, usecols=lambda c: c in {"team_id", "level", "allstar_team"})
            if "allstar_team" in tdf.columns:
                tdf = tdf[tdf["allstar_team"] == 0]
            total_teams_count = len(tdf)
            if "level" in tdf.columns:
                teams_count = int((tdf["level"] == 1).sum() or total_teams_count)
            else:
                teams_count = total_teams_count
        except Exception:
            pass

    llow = label.lower()
    if "yearly" in llow:
        dump_type = "yearly"
    elif re.search(r"dump_\d{4}_\d{2}", llow):
        dump_type = "monthly"
    elif llow == "import_export":
        dump_type = "import_export"
    else:
        dump_type = "snapshot"

    date_tuple = _parse_date_tuple(current_date, season_year)
    # If monthly dump label has a month number (e.g. dump_2046_09) and current_date was empty, use it
    m_month = re.search(r"dump_(\d{4})_(\d{2})", llow)
    if m_month and date_tuple == (season_year, 0, 0):
        date_tuple = (int(m_month.group(1)), int(m_month.group(2)), 1)

    return {
        "label": label,
        "csv_dir": cdir,
        "csv_count": len(csv_files),
        "mtime": mtime,
        "mtime_str": mtime_str,
        "season_year": season_year or 2026,
        "current_date": current_date or f"{season_year or 2026}-01-01",
        "date_tuple": date_tuple,
        "dump_type": dump_type,
        "teams_count": teams_count,
        "total_teams_count": total_teams_count,
        "leagues_count": leagues_count,
        "primary_league_id": primary_league_id,
        "primary_league_name": primary_league_name,
        "primary_league_abbr": primary_league_abbr,
    }


def init_host_db():
    conn = sqlite3.connect(HOST_DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS saves_registry (
            save_slug TEXT PRIMARY KEY,
            save_name TEXT,
            folder_path TEXT,
            csv_dir TEXT,
            html_dir TEXT,
            db_path TEXT,
            csv_count INTEGER DEFAULT 0,
            html_count INTEGER DEFAULT 0,
            dump_count INTEGER DEFAULT 0,
            is_online_compatible INTEGER DEFAULT 1,
            primary_league_id INTEGER DEFAULT 200,
            primary_league_name TEXT DEFAULT '',
            primary_league_abbr TEXT DEFAULT '',
            season_year INTEGER DEFAULT 2026,
            teams_count INTEGER DEFAULT 0,
            players_count INTEGER DEFAULT 0,
            at_bats_count INTEGER DEFAULT 0,
            ingested_at TEXT DEFAULT '',
            last_modified TEXT DEFAULT ''
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT
        )
        """
    )
    conn.commit()
    conn.close()


def get_active_save_slug() -> str:
    init_host_db()
    conn = sqlite3.connect(HOST_DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT value FROM app_state WHERE key = 'active_save_slug'")
    row = cur.fetchone()
    if row and row[0]:
        chk = cur.execute("SELECT save_slug FROM saves_registry WHERE save_slug = ?", (row[0],)).fetchone()
        if chk:
            conn.close()
            return row[0]

    cfg_default = load_user_config().get("default_save_slug", "")
    if cfg_default:
        chk = cur.execute("SELECT save_slug FROM saves_registry WHERE save_slug = ?", (cfg_default,)).fetchone()
        if chk:
            conn.close()
            return cfg_default

    # Pick the best default save (prefer saves with CSV exports)
    cur.execute(
        """
        SELECT save_slug FROM saves_registry
        ORDER BY (csv_count > 0) DESC,
                 CASE WHEN save_slug = 'american_baseball_system' THEN 0 ELSE 1 END,
                 at_bats_count DESC, last_modified DESC
        LIMIT 1
        """
    )
    row = cur.fetchone()
    conn.close()
    return row[0] if row else "american_baseball_system"


def set_active_save_slug(save_slug: str):
    init_host_db()
    conn = sqlite3.connect(HOST_DB_PATH)
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('active_save_slug', ?)",
        (save_slug,),
    )
    conn.commit()
    cur = conn.cursor()
    cur.execute("SELECT db_path FROM saves_registry WHERE save_slug = ?", (save_slug,))
    row = cur.fetchone()
    conn.close()

    if row and row[0] and os.path.exists(row[0]):
        try:
            shutil.copy2(row[0], ACTIVE_DB_PATH)
        except Exception:
            pass


def find_csv_sources_for_save(lg_path: Path):
    """
    Returns (best_csv_dir, all_dump_csv_dirs) for a given .lg save directory.
    Inspects leagues.csv in import_export/csv and dump/* so the chronologically
    latest full CSV export is chosen as default while preserving all monthly/yearly dumps.
    """
    candidates = []
    dump_dirs = []

    ie_csv = lg_path / "import_export" / "csv"
    info_ie = _inspect_csv_source("import_export", ie_csv)
    if info_ie:
        candidates.append(info_ie)
        dump_dirs.append(("import_export", ie_csv))

    dump_root = lg_path / "dump"
    if dump_root.is_dir():
        for sub in sorted(dump_root.iterdir()):
            if sub.is_dir():
                cdir = sub / "csv"
                if not cdir.is_dir():
                    cdir = sub
                info_sub = _inspect_csv_source(sub.name, cdir)
                if info_sub:
                    candidates.append(info_sub)
                    dump_dirs.append((sub.name, cdir))

    direct_csv = lg_path / "csv"
    info_direct = _inspect_csv_source("csv", direct_csv)
    if info_direct:
        candidates.append(info_direct)
        dump_dirs.append(("csv", direct_csv))

    info_root = _inspect_csv_source("root", lg_path)
    if info_root:
        candidates.append(info_root)
        dump_dirs.append(("root", lg_path))

    if not candidates:
        return None, []

    # Sort by: full CSV set (>= 25 files), latest in-game date_tuple, file mtime
    candidates.sort(
        key=lambda x: (
            x["csv_count"] >= 25,
            x["date_tuple"],
            x["mtime"],
        ),
        reverse=True,
    )
    return candidates[0]["csv_dir"], dump_dirs


def inspect_all_csv_sources(lg_path: Path) -> list[dict]:
    """
    Returns rich metadata dicts for all CSV sources (import_export + monthly/yearly dumps)
    sorted chronologically from oldest to newest.
    """
    sources = []
    ie_csv = lg_path / "import_export" / "csv"
    info_ie = _inspect_csv_source("import_export", ie_csv)
    if info_ie:
        sources.append(info_ie)

    dump_root = lg_path / "dump"
    if dump_root.is_dir():
        for sub in sorted(dump_root.iterdir()):
            if sub.is_dir():
                cdir = sub / "csv"
                if not cdir.is_dir():
                    cdir = sub
                info_sub = _inspect_csv_source(sub.name, cdir)
                if info_sub:
                    sources.append(info_sub)

    direct_csv = lg_path / "csv"
    info_direct = _inspect_csv_source("csv", direct_csv)
    if info_direct:
        sources.append(info_direct)

    sources.sort(key=lambda x: (x["date_tuple"], x["mtime"]))
    return sources


def parse_league_dev_files(lg_path: Path) -> list[dict]:
    """
    Parses OOTP's league_dev_<id>.txt and league_dev_od_<id>.txt files into
    structured year-by-year telemetry records.
    """
    results = []
    dev_files = sorted(lg_path.glob("league_dev*.txt"))
    for df_path in dev_files:
        m_id = re.search(r"league_dev_(?:od_)?(\d+)\.txt", df_path.name)
        lid = int(m_id.group(1)) if m_id else 200
        is_od = "league_dev_od_" in df_path.name
        try:
            raw_text = df_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        year_blocks = re.split(r"Year\s+(\d{4})\s*:", raw_text)
        years_parsed = []
        # year_blocks[0] is preamble, then pairs of (year_str, block_body)
        for idx in range(1, len(year_blocks) - 1, 2):
            yr = int(year_blocks[idx])
            body = year_blocks[idx + 1]
            entry = {
                "year": yr,
                "league_id": lid,
                "is_opening_day": is_od,
                "positional_ovr": {},
                "ratings_avg": {},
                "talent_avg": {},
                "financials": {},
                "talent_changes": {},
                "team_modes": {},
                "statcast": {},
                "pitching_usage": {},
            }
            for line in body.splitlines():
                s = line.strip()
                if not s:
                    continue
                if s.startswith("Overall Value "):
                    m = re.match(r"Overall Value\s+([A-Z0-9]+):\s*(\d+)", s)
                    if m:
                        entry["positional_ovr"][m.group(1)] = int(m.group(2))
                elif s.startswith("Average ") and "Talent:" in s:
                    m = re.match(r"Average\s+([a-zA-Z]+)\s+Talent:\s*([\d.]+)", s)
                    if m:
                        entry["talent_avg"][m.group(1).lower()] = float(m.group(2))
                elif s.startswith("Average "):
                    m = re.match(r"Average\s+([^:]+):\s*([\d,.-]+)", s)
                    if m:
                        k = m.group(1).strip().lower()
                        val_str = m.group(2).replace(",", "")
                        try:
                            val = float(val_str) if "." in val_str else int(val_str)
                        except ValueError:
                            continue
                        if k in {"contact", "gap", "power", "eye", "strikeouts", "babip", "stuff", "movement", "control"}:
                            entry["ratings_avg"][k] = val
                        else:
                            entry["financials"][k] = val
                elif s.startswith(("Num Min Contracts:", "AVG Min Contract:", "Num Arb Contracts:", "AVG Arb Contract:", "Num FA Contracts:", "AVG FA Contract:", "Major Contracts per Team:", "Demand Factor:")):
                    k, _, v = s.partition(":")
                    val_str = v.strip().replace(",", "")
                    try:
                        entry["financials"][k.strip().lower()] = float(val_str) if "." in val_str else int(val_str)
                    except ValueError:
                        pass
                elif s.startswith("Talent "):
                    k, _, v = s.partition(":")
                    val_str = v.strip().replace(",", "")
                    try:
                        entry["talent_changes"][k.strip().lower()] = int(val_str)
                    except ValueError:
                        pass
                elif s.startswith(("Neutral:", "Win Now!:", "Rebuilding:", "Build a Dynasty!:")):
                    k, _, v = s.partition(":")
                    try:
                        entry["team_modes"][k.strip()] = int(v.strip())
                    except ValueError:
                        pass
                elif s.startswith(("SP BF:", "SP IP:", "SP PI:", "RP BF:", "RP IP:", "RP PI:", "CG:")):
                    k, _, v = s.partition(":")
                    try:
                        entry["pitching_usage"][k.strip()] = float(v.strip())
                    except ValueError:
                        pass
                elif s.startswith("EV/LA:"):
                    m = re.search(r"([\d.]+)/([\d.]+)", s)
                    if m:
                        entry["statcast"]["avg_ev"] = float(m.group(1))
                        entry["statcast"]["avg_la"] = float(m.group(2))
                elif s.startswith("xBA/xSLG/xwOBA:"):
                    m = re.search(r"(\.\d+)/(\.\d+)/(\.\d+)", s)
                    if m:
                        entry["statcast"]["xba"] = float(m.group(1))
                        entry["statcast"]["xslg"] = float(m.group(2))
                        entry["statcast"]["xwoba"] = float(m.group(3))
                elif s.startswith("gbfb "):
                    m_hrfb = re.search(r"hrfb\s+([\d.]+)%", s)
                    m_ld = re.search(r"ld\s+([\d.]+)%", s)
                    m_gb = re.search(r"gb\s+([\d.]+)%", s)
                    m_fb = re.search(r"fb\s+([\d.]+)%", s)
                    if m_hrfb:
                        entry["statcast"]["hr_fb_pct"] = float(m_hrfb.group(1))
                    if m_ld:
                        entry["statcast"]["ld_pct"] = float(m_ld.group(1))
                    if m_gb:
                        entry["statcast"]["gb_pct"] = float(m_gb.group(1))
                    if m_fb:
                        entry["statcast"]["fb_pct"] = float(m_fb.group(1))
                elif s.startswith("S/M/H - HH/BA:"):
                    m_hh = re.search(r"-\s*([\d.]+)%/([\d.]+)%", s)
                    if m_hh:
                        entry["statcast"]["hard_hit_pct"] = float(m_hh.group(1))
                        entry["statcast"]["barrel_pct"] = float(m_hh.group(2))

            years_parsed.append(entry)

        if years_parsed:
            results.append({
                "file_name": df_path.name,
                "league_id": lid,
                "is_opening_day": is_od,
                "years": years_parsed,
            })
    return results


def collect_supplemental_save_data(lg_path: Path, sources_info: list[dict], active_label: str) -> dict:
    """
    Collects all non-CSV and multi-dump metadata from an OOTP .lg folder:
    - Monthly & Yearly CSV dump catalog
    - Almanac HTML archives (news/almanac_YYYY)
    - League development telemetry (league_dev_*.txt)
    - League hints & record trivia (league_hints.txt)
    - ID changelogs (id_changelog_*.txt)
    - Universe / Automation JSON states (ashes_universe_state.json, ashes_automation_state.json, import_export/*.json)
    - Import/Export supplemental files (.prk ballparks, .webp, .xml, .sql, reports_set_season_almanac_files.txt)
    - Text archives (news/txt/leagues/*.txt, messages/*.txt count)
    """
    dumps_catalog = []
    for s in sources_info:
        dumps_catalog.append({
            "label": s["label"],
            "dump_type": s["dump_type"],
            "season_year": s["season_year"],
            "current_date": s["current_date"],
            "teams_count": s["teams_count"],
            "total_teams_count": s["total_teams_count"],
            "leagues_count": s["leagues_count"],
            "csv_count": s["csv_count"],
            "mtime_str": s["mtime_str"],
            "is_active": s["label"] == active_label,
        })

    # Almanac HTML archives
    almanacs = []
    news_dir = lg_path / "news"
    if news_dir.is_dir():
        for alm_dir in sorted(news_dir.glob("almanac_*")):
            if alm_dir.is_dir():
                yr_m = re.search(r"(\d{4})", alm_dir.name)
                yr = int(yr_m.group(1)) if yr_m else 0
                html_cnt = 0
                sections = []
                for sub_name in ["leagues", "teams", "players", "history", "box_scores", "game_logs", "coaches"]:
                    sd = alm_dir / sub_name
                    if sd.is_dir():
                        cnt = len(list(sd.glob("*.html")))
                        if cnt > 0:
                            sections.append({"name": sub_name, "count": cnt})
                        html_cnt += cnt
                if (alm_dir / "index.html").is_file():
                    html_cnt += 1
                almanacs.append({
                    "folder_name": alm_dir.name,
                    "year": yr,
                    "html_count": html_cnt,
                    "sections": sections,
                    "index_path": f"{alm_dir.name}/index.html",
                })

    # League hints trivia
    league_hints = []
    hints_file = lg_path / "league_hints.txt"
    if hints_file.is_file():
        try:
            seen_hints = set()
            for line in hints_file.read_text(encoding="utf-8", errors="ignore").splitlines():
                clean = line.strip()
                if clean and clean not in seen_hints:
                    seen_hints.add(clean)
                    league_hints.append(clean)
        except Exception:
            pass

    # ID changelogs
    id_changelogs = []
    for cl_file in sorted(lg_path.glob("id_changelog*.txt")):
        try:
            lines = [ln.strip() for ln in cl_file.read_text(encoding="utf-8", errors="ignore").splitlines() if ln.strip()]
            id_changelogs.append({
                "file_name": cl_file.name,
                "entries_count": len(lines),
                "entries": lines[:150],
            })
        except Exception:
            pass

    # JSON state files in root and import_export
    json_configs = {}
    for jf in list(lg_path.glob("*.json")) + list((lg_path / "import_export").glob("*.json") if (lg_path / "import_export").is_dir() else []):
        try:
            json_configs[jf.name] = json.loads(jf.read_text(encoding="utf-8", errors="ignore"))
        except Exception:
            pass

    # Import/Export supplemental files (.prk, .webp, .txt, .xml, .sql, .json)
    ie_files = []
    ie_dir = lg_path / "import_export"
    if ie_dir.is_dir():
        for f in sorted(ie_dir.iterdir()):
            if f.is_file() and f.suffix.lower() != ".csv":
                ie_files.append({
                    "name": f.name,
                    "ext": f.suffix.lower().lstrip("."),
                    "size_kb": round(f.stat().st_size / 1024.0, 1),
                    "modified": datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d %H:%M"),
                })

    # Text game logs & messages count
    txt_logs = []
    txt_leagues_dir = lg_path / "news" / "txt" / "leagues"
    if txt_leagues_dir.is_dir():
        for tf in sorted(txt_leagues_dir.glob("*.txt"), key=lambda x: x.stat().st_mtime, reverse=True)[:50]:
            txt_logs.append({
                "name": tf.name,
                "size_kb": round(tf.stat().st_size / 1024.0, 1),
            })

    msg_dir = lg_path / "messages"
    msg_files_count = len(list(msg_dir.glob("*.txt"))) if msg_dir.is_dir() else 0

    league_dev = parse_league_dev_files(lg_path)

    return {
        "active_source_label": active_label,
        "dumps": dumps_catalog,
        "almanacs": almanacs,
        "league_dev": league_dev,
        "league_hints": league_hints,
        "id_changelogs": id_changelogs,
        "json_configs": json_configs,
        "import_export_files": ie_files,
        "txt_logs": txt_logs,
        "message_txt_count": msg_files_count,
    }


def discover_all_saves():
    """
    Scans configured saved_games_dir, extra_save_dirs, and UPLOADED_SAVES_DIR,
    updates saves_registry, prunes stale missing directories, and returns list of save metadata dicts.
    """
    init_host_db()
    cfg = load_user_config()
    primary_dir = get_saved_games_dir()
    search_roots = []
    seen_roots = set()

    for cand_root in [primary_dir] + [Path(p) for p in cfg.get("extra_save_dirs", []) if p] + [UPLOADED_SAVES_DIR]:
        try:
            if cand_root and cand_root.is_dir():
                norm = str(cand_root.resolve()).lower()
                if norm not in seen_roots:
                    seen_roots.add(norm)
                    search_roots.append(cand_root)
        except Exception:
            pass

    conn = sqlite3.connect(HOST_DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Collect all candidate .lg directories
    lg_items: list[tuple[Path, Path]] = []
    for root in search_roots:
        if root.name.lower().endswith(".lg") and root.name != ".lg":
            lg_items.append((root.parent, root))
            continue
        try:
            for item in sorted(root.iterdir()):
                if not item.is_dir() or item.name == ".lg":
                    continue
                if not (item.name.lower().endswith(".lg") or root == UPLOADED_SAVES_DIR):
                    continue
                lg_items.append((root, item))
        except Exception:
            pass

    discovered_slugs = set()
    for root, item in lg_items:
        save_slug = slugify(item.name)
        discovered_slugs.add(save_slug)
        save_name = re.sub(r"\.lg$", "", item.name, flags=re.IGNORECASE)
        best_csv_dir, dump_dirs = find_csv_sources_for_save(item)
        csv_count = len(list(best_csv_dir.glob("*.csv"))) if best_csv_dir else 0

        html_dir = item / "news" / "html"
        html_count = 0
        if html_dir.is_dir():
            for _, _, files in os.walk(html_dir):
                html_count += sum(1 for f in files if f.endswith(".html"))
        # Also count almanac HTML files
        news_dir = item / "news"
        if news_dir.is_dir():
            for alm_dir in news_dir.glob("almanac_*"):
                if alm_dir.is_dir():
                    for _, _, files in os.walk(alm_dir):
                        html_count += sum(1 for f in files if f.endswith(".html"))

        db_path = SAVES_DB_DIR / f"{save_slug}.db"
        mtime_str = datetime.fromtimestamp(item.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")

        # Peek at leagues.csv and teams.csv if available
        primary_league_id = 200
        primary_league_name = save_name
        primary_league_abbr = "MLB"
        season_year = 2026
        teams_count = 0

        if best_csv_dir:
            lf = best_csv_dir / "leagues.csv"
            if lf.exists():
                try:
                    ldf = pd.read_csv(lf, nrows=5)
                    if not ldf.empty:
                        row0 = ldf.iloc[0]
                        primary_league_id = int(row0.get("league_id", 200))
                        primary_league_name = str(row0.get("name", save_name))
                        primary_league_abbr = str(row0.get("abbr", "LGE"))
                        season_year = int(row0.get("season_year", 2026))
                except Exception:
                    pass
            tf = best_csv_dir / "teams.csv"
            if tf.exists():
                try:
                    tdf = pd.read_csv(tf, usecols=lambda c: c in {"team_id", "level", "allstar_team"})
                    if "allstar_team" in tdf.columns:
                        tdf = tdf[tdf["allstar_team"] == 0]
                    teams_count = int((tdf["level"] == 1).sum() or len(tdf)) if "level" in tdf.columns else len(tdf)
                except Exception:
                    pass

        cur.execute("SELECT csv_dir, ingested_at, players_count, at_bats_count FROM saves_registry WHERE save_slug = ?", (save_slug,))
        existing = cur.fetchone()
        ingested_at = existing["ingested_at"] if existing else ""
        players_count = existing["players_count"] if existing else 0
        at_bats_count = existing["at_bats_count"] if existing else 0
        # If best_csv_dir changed from what was previously registered, mark ingested_at empty so it refreshes
        if existing and best_csv_dir and existing["csv_dir"] != str(best_csv_dir):
            ingested_at = ""

        cur.execute(
            """
            INSERT OR REPLACE INTO saves_registry (
                save_slug, save_name, folder_path, csv_dir, html_dir, db_path,
                csv_count, html_count, dump_count, is_online_compatible,
                primary_league_id, primary_league_name, primary_league_abbr,
                season_year, teams_count, players_count, at_bats_count,
                ingested_at, last_modified
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                save_slug,
                save_name,
                str(item),
                str(best_csv_dir) if best_csv_dir else "",
                str(html_dir) if html_dir.is_dir() else "",
                str(db_path),
                csv_count,
                html_count,
                len(dump_dirs),
                primary_league_id,
                primary_league_name,
                primary_league_abbr,
                season_year,
                teams_count,
                players_count,
                at_bats_count,
                ingested_at,
                mtime_str,
            ),
        )

    # Prune stale registry entries whose folder no longer exists on disk
    existing_rows = cur.execute("SELECT save_slug, folder_path FROM saves_registry").fetchall()
    for er in existing_rows:
        slug_val = er["save_slug"]
        fpath = er["folder_path"]
        if slug_val not in discovered_slugs and (not fpath or not Path(fpath).exists()):
            cur.execute("DELETE FROM saves_registry WHERE save_slug = ?", (slug_val,))

    conn.commit()
    cur.execute(
        """
        SELECT * FROM saves_registry
        ORDER BY (csv_count > 0) DESC, (html_count > 0) DESC,
                 CASE WHEN save_slug = 'american_baseball_system' THEN 0 ELSE 1 END,
                 save_name ASC
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def ingest_save_to_sqlite(save_slug: str, force: bool = False, source_label: str = None) -> dict:
    """
    Ingests all CSV files for the specified save_slug into its SQLite database
    (and copies to data/ootp_analytics.db if active). Also ingests:
    - All 71+ CSV tables (plus any custom CSV exports present)
    - Multi-dump team standings & financial snapshots (dump_team_snapshots)
    - Multi-year/monthly rating snapshots (rating_snapshots)
    - Full supplemental data (league_dev_*.txt, league_hints.txt, almanacs, JSON states, messages/*.txt bodies)
    """
    init_host_db()
    conn = sqlite3.connect(HOST_DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM saves_registry WHERE save_slug = ?", (save_slug,))
    meta = cur.fetchone()
    conn.close()

    if not meta:
        discover_all_saves()
        conn = sqlite3.connect(HOST_DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM saves_registry WHERE save_slug = ?", (save_slug,))
        meta = cur.fetchone()
        conn.close()
        if not meta:
            raise ValueError(f"Save '{save_slug}' not found.")

    meta = dict(meta)
    lg_path = Path(meta["folder_path"])
    db_path = Path(meta["db_path"])
    sources_info = inspect_all_csv_sources(lg_path)

    csv_dir = Path(meta["csv_dir"]) if meta["csv_dir"] else None
    active_label = "current"

    if source_label:
        matched = next((s for s in sources_info if s["label"] == source_label), None)
        if matched:
            csv_dir = matched["csv_dir"]
            active_label = matched["label"]
            force = True
    elif csv_dir:
        matched = next((s for s in sources_info if s["csv_dir"] == csv_dir), None)
        if matched:
            active_label = matched["label"]

    if not csv_dir or not csv_dir.is_dir():
        return {
            "status": "no_csv",
            "save_slug": save_slug,
            "message": "No CSV export files found in this save yet (HTML reports are still available if exported).",
        }

    # Check if already ingested, fresh, and has save_supplemental_data table
    if not force and db_path.exists() and db_path.stat().st_size > 65536 and meta.get("ingested_at"):
        try:
            chk_conn = sqlite3.connect(db_path)
            has_supp = chk_conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='save_supplemental_data'"
            ).fetchone()
            chk_conn.close()
            if has_supp:
                return {
                    "status": "cached",
                    "save_slug": save_slug,
                    "active_source_label": active_label,
                    "db_path": str(db_path),
                    "players_count": meta.get("players_count", 0),
                    "at_bats_count": meta.get("at_bats_count", 0),
                }
        except Exception:
            pass

    tmp_db_path = db_path.with_suffix(".tmp.db")
    if tmp_db_path.exists():
        tmp_db_path.unlink()

    sconn = sqlite3.connect(tmp_db_path)
    sconn.execute("PRAGMA synchronous = OFF")
    sconn.execute("PRAGMA journal_mode = MEMORY")
    sconn.execute("PRAGMA temp_store = MEMORY")
    sconn.execute("PRAGMA cache_size = -64000")

    tables_loaded = 0
    players_count = 0
    at_bats_count = 0

    # Combine CORE_CSV_TABLES with any additional CSV files found in csv_dir
    discovered_tables = list(CORE_CSV_TABLES)
    known_set = set(CORE_CSV_TABLES)
    for extra_csv in sorted(csv_dir.glob("*.csv")):
        tname = extra_csv.stem
        if tname not in known_set:
            discovered_tables.append(tname)
            known_set.add(tname)

    for table_name in discovered_tables:
        csv_file = csv_dir / f"{table_name}.csv"
        if not csv_file.exists():
            continue
        try:
            fsize_mb = csv_file.stat().st_size / (1024 * 1024)
            # For huge historical career/player tables (>20 MB), stream in chunks
            if fsize_mb > 18.0:
                first_chunk = True
                for chunk in pd.read_csv(csv_file, low_memory=False, chunksize=60000, on_bad_lines="skip"):
                    if table_name == "players" and "retired" in chunk.columns and fsize_mb > 25.0:
                        chunk = chunk[(chunk["retired"] == 0) | (chunk.get("hall_of_fame", 0) == 1) | (chunk["team_id"] > 0)]
                    chunk.to_sql(table_name, sconn, if_exists="replace" if first_chunk else "append", index=False)
                    first_chunk = False
                    if table_name == "players":
                        players_count += len(chunk)
                    elif table_name == "players_at_bat_batting_stats":
                        at_bats_count += len(chunk)
            else:
                df = pd.read_csv(csv_file, low_memory=False, on_bad_lines="skip")
                # Enrich messages table with full text from messages/message_<id>.txt if available
                if table_name == "messages" and not df.empty and "message_id" in df.columns:
                    msg_dir = lg_path / "messages"
                    if msg_dir.is_dir():
                        bodies = []
                        for mid in df["message_id"]:
                            mf = msg_dir / f"message_{int(mid)}.txt"
                            if mf.is_file():
                                try:
                                    bodies.append(mf.read_text(encoding="utf-8", errors="ignore").strip()[:2000])
                                except Exception:
                                    bodies.append("")
                            else:
                                bodies.append("")
                        df["body_text"] = bodies
                df.to_sql(table_name, sconn, if_exists="replace", index=False)
                if table_name == "players":
                    players_count = len(df)
                elif table_name == "players_at_bat_batting_stats":
                    at_bats_count = len(df)
            tables_loaded += 1
        except Exception as exc:
            print(f"Warning loading {csv_file}: {exc}")

    # Ingest team standings & financial snapshots across ALL dumps (yearly + monthly + import_export)
    dump_team_rows = []
    for sinfo in sources_info:
        sdir = sinfo["csv_dir"]
        slabel = sinfo["label"]
        syear = sinfo["season_year"]
        sdate = sinfo["current_date"]
        stype = sinfo["dump_type"]
        tf = sdir / "teams.csv"
        trf = sdir / "team_record.csv"
        if not (tf.exists() and trf.exists()):
            continue
        try:
            tdf = pd.read_csv(
                tf,
                usecols=lambda c: c in {"team_id", "name", "nickname", "abbr", "league_id", "sub_league_id", "division_id", "level", "allstar_team"},
                low_memory=False,
            )
            if "allstar_team" in tdf.columns:
                tdf = tdf[tdf["allstar_team"] == 0]
            trdf = pd.read_csv(
                trf,
                usecols=lambda c: c in {"team_id", "g", "w", "l", "t", "pos", "pct", "gb", "magic_number"},
                low_memory=False,
            )
            merged_t = pd.merge(tdf, trdf, on="team_id", how="left")
            tbf = sdir / "team_batting_stats.csv"
            if tbf.exists():
                tbdf = pd.read_csv(
                    tbf,
                    usecols=lambda c: c in {"team_id", "split_id", "r", "h", "hr", "bb", "k", "sb", "avg", "obp", "slg", "ops", "war"},
                    low_memory=False,
                )
                if "split_id" in tbdf.columns:
                    tbdf = tbdf[tbdf["split_id"] == 1]
                tbdf = tbdf.rename(columns={"r": "rs", "war": "bat_war"})
                merged_t = pd.merge(merged_t, tbdf.drop(columns=["split_id"], errors="ignore"), on="team_id", how="left")

            tpf = sdir / "team_pitching_stats.csv"
            if tpf.exists():
                tpdf = pd.read_csv(
                    tpf,
                    usecols=lambda c: c in {"team_id", "split_id", "r", "er", "ip", "ha", "hra", "bb", "k", "era", "whip", "war"},
                    low_memory=False,
                )
                if "split_id" in tpdf.columns:
                    tpdf = tpdf[tpdf["split_id"] == 1]
                tpdf = tpdf.rename(columns={"r": "ra", "bb": "p_bb", "k": "p_k", "war": "pit_war"})
                merged_t = pd.merge(merged_t, tpdf.drop(columns=["split_id"], errors="ignore"), on="team_id", how="left")

            tff = sdir / "team_financials.csv"
            if tff.exists():
                tfdf = pd.read_csv(
                    tff,
                    usecols=lambda c: c in {"team_id", "gate_revenue", "media_revenue", "total_revenue", "player_expenses", "total_expenses", "budget", "player_payroll", "fan_interest", "fan_loyalty", "market", "attendance"},
                    low_memory=False,
                )
                merged_t = pd.merge(merged_t, tfdf, on="team_id", how="left")

            merged_t["snapshot_label"] = slabel
            merged_t["snapshot_type"] = stype
            merged_t["snapshot_year"] = syear
            merged_t["snapshot_date"] = sdate
            dump_team_rows.append(merged_t)
        except Exception:
            pass

    if dump_team_rows:
        dt_df = pd.concat(dump_team_rows, ignore_index=True)
        dt_df.to_sql("dump_team_snapshots", sconn, if_exists="replace", index=False)

    # Ingest historical dump snapshots for StatsPlus Player Development Tracker
    # Include all yearly dumps plus the latest 4 monthly/current dumps
    yearly_sources = [(s["label"], s["csv_dir"]) for s in sources_info if s["dump_type"] == "yearly"]
    other_sources = [(s["label"], s["csv_dir"]) for s in sources_info if s["dump_type"] != "yearly"][-4:]
    snapshot_sources = yearly_sources + [x for x in other_sources if x not in yearly_sources]
    if csv_dir and all(sdir != csv_dir for _, sdir in snapshot_sources):
        snapshot_sources.append(("current", csv_dir))

    snapshots_rows = []
    for snap_label, sdir in snapshot_sources:
        yr_match = re.search(r"(\d{4})", snap_label)
        snap_year = int(yr_match.group(1)) if yr_match else meta.get("season_year", 2026)
        pb_file = sdir / "players_batting.csv"
        pp_file = sdir / "players_pitching.csv"
        pv_file = sdir / "players_value.csv"
        if pb_file.exists() and pp_file.exists():
            try:
                pb = pd.read_csv(
                    pb_file,
                    usecols=lambda c: c in {
                        "player_id", "team_id", "position",
                        "batting_ratings_overall_contact", "batting_ratings_overall_gap",
                        "batting_ratings_overall_power", "batting_ratings_overall_eye",
                        "batting_ratings_overall_strikeouts", "batting_ratings_talent_contact",
                        "batting_ratings_talent_power", "batting_ratings_talent_eye",
                        "running_ratings_speed",
                    },
                    low_memory=False,
                )
                pp = pd.read_csv(
                    pp_file,
                    usecols=lambda c: c in {
                        "player_id",
                        "pitching_ratings_overall_stuff", "pitching_ratings_overall_movement",
                        "pitching_ratings_overall_control", "pitching_ratings_talent_stuff",
                        "pitching_ratings_talent_movement", "pitching_ratings_talent_control",
                        "pitching_ratings_misc_velocity", "pitching_ratings_misc_stamina",
                    },
                    low_memory=False,
                )
                merged = pd.merge(pb, pp, on="player_id", how="left")
                if pv_file.exists():
                    pv = pd.read_csv(
                        pv_file,
                        usecols=lambda c: c in {"player_id", "oa", "pot", "overall_value", "talent_value"},
                        low_memory=False,
                    )
                    merged = pd.merge(merged, pv, on="player_id", how="left")
                merged["snapshot_label"] = snap_label
                merged["snapshot_year"] = snap_year
                snapshots_rows.append(merged)
            except Exception:
                pass

    if snapshots_rows:
        snap_df = pd.concat(snapshots_rows, ignore_index=True)
        snap_df.to_sql("rating_snapshots", sconn, if_exists="replace", index=False)

    # Store supplemental non-CSV and multi-dump data in save_supplemental_data table
    supp_data = collect_supplemental_save_data(lg_path, sources_info, active_label)
    sconn.execute("CREATE TABLE IF NOT EXISTS save_supplemental_data (key TEXT PRIMARY KEY, value TEXT)")
    for k, v in supp_data.items():
        sconn.execute(
            "INSERT OR REPLACE INTO save_supplemental_data (key, value) VALUES (?, ?)",
            (k, json.dumps(v)),
        )

    # Create high-speed indexes
    index_statements = [
        "CREATE INDEX IF NOT EXISTS idx_players_id ON players(player_id)",
        "CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id)",
        "CREATE INDEX IF NOT EXISTS idx_pbat_id ON players_batting(player_id)",
        "CREATE INDEX IF NOT EXISTS idx_ppit_id ON players_pitching(player_id)",
        "CREATE INDEX IF NOT EXISTS idx_pfld_id ON players_fielding(player_id)",
        "CREATE INDEX IF NOT EXISTS idx_pval_id ON players_value(player_id)",
        "CREATE INDEX IF NOT EXISTS idx_pcon_id ON players_contract(player_id)",
        "CREATE INDEX IF NOT EXISTS idx_cbat_pid ON players_career_batting_stats(player_id, year, split_id)",
        "CREATE INDEX IF NOT EXISTS idx_cbat_yr ON players_career_batting_stats(year, league_id, split_id)",
        "CREATE INDEX IF NOT EXISTS idx_cpit_pid ON players_career_pitching_stats(player_id, year, split_id)",
        "CREATE INDEX IF NOT EXISTS idx_cpit_yr ON players_career_pitching_stats(year, league_id, split_id)",
        "CREATE INDEX IF NOT EXISTS idx_cfld_pid ON players_career_fielding_stats(player_id, year)",
        "CREATE INDEX IF NOT EXISTS idx_ab_pid ON players_at_bat_batting_stats(player_id)",
        "CREATE INDEX IF NOT EXISTS idx_ab_opp ON players_at_bat_batting_stats(opponent_player_id)",
        "CREATE INDEX IF NOT EXISTS idx_ab_game ON players_at_bat_batting_stats(game_id)",
        "CREATE INDEX IF NOT EXISTS idx_ab_team ON players_at_bat_batting_stats(team_id)",
        "CREATE INDEX IF NOT EXISTS idx_gbat_game ON players_game_batting(game_id)",
        "CREATE INDEX IF NOT EXISTS idx_gpit_game ON players_game_pitching_stats(game_id)",
        "CREATE INDEX IF NOT EXISTS idx_games_id ON games(game_id)",
        "CREATE INDEX IF NOT EXISTS idx_gscore_id ON games_score(game_id)",
        "CREATE INDEX IF NOT EXISTS idx_snap_pid ON rating_snapshots(player_id, snapshot_year)",
        "CREATE INDEX IF NOT EXISTS idx_dts_label ON dump_team_snapshots(snapshot_label, league_id)",
        "CREATE INDEX IF NOT EXISTS idx_dts_year ON dump_team_snapshots(snapshot_year, league_id)",
        "CREATE INDEX IF NOT EXISTS idx_th_yr ON team_history(year, league_id, team_id)",
        "CREATE INDEX IF NOT EXISTS idx_thr_yr ON team_history_record(year, league_id, team_id)",
    ]
    for stmt in index_statements:
        try:
            sconn.execute(stmt)
        except Exception:
            pass

    sconn.commit()
    sconn.close()

    try:
        tmp_db_path.replace(db_path)
    except Exception:
        try:
            if db_path.exists():
                db_path.unlink()
            tmp_db_path.rename(db_path)
        except Exception:
            shutil.copy2(tmp_db_path, db_path)
            try:
                tmp_db_path.unlink()
            except Exception:
                pass

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    # Update season_year and teams_count in saves_registry if source_label changed them
    active_info = next((s for s in sources_info if s["csv_dir"] == csv_dir), None)
    new_season_year = active_info["season_year"] if active_info else meta.get("season_year", 2026)
    new_teams_count = active_info["teams_count"] if active_info else meta.get("teams_count", 0)

    hconn = sqlite3.connect(HOST_DB_PATH)
    hconn.execute(
        """
        UPDATE saves_registry
        SET ingested_at = ?, players_count = ?, at_bats_count = ?,
            csv_dir = ?, season_year = ?, teams_count = ?
        WHERE save_slug = ?
        """,
        (now_str, players_count, at_bats_count, str(csv_dir), new_season_year, new_teams_count, save_slug),
    )
    hconn.commit()
    hconn.close()

    if get_active_save_slug() == save_slug or not ACTIVE_DB_PATH.exists():
        try:
            shutil.copy2(db_path, ACTIVE_DB_PATH)
        except Exception:
            pass

    return {
        "status": "ingested",
        "save_slug": save_slug,
        "active_source_label": active_label,
        "tables_loaded": tables_loaded,
        "players_count": players_count,
        "at_bats_count": at_bats_count,
        "ingested_at": now_str,
    }


def import_online_league_archive(zip_bytes: bytes, save_name: str) -> dict:
    """
    Extracts an uploaded OOTP Online League .zip archive (containing CSV exports and/or HTML reports)
    into data/uploaded_saves/<save_name>.lg and ingests it into SQLite.
    """
    clean_name = re.sub(r"\.zip$", "", save_name, flags=re.IGNORECASE).strip()
    if not clean_name.endswith(".lg"):
        clean_name = f"{clean_name}.lg"
    target_dir = UPLOADED_SAVES_DIR / clean_name
    if target_dir.exists():
        shutil.rmtree(target_dir, ignore_errors=True)
    target_dir.mkdir(parents=True, exist_ok=True)

    tmp_zip = UPLOADED_SAVES_DIR / "_upload_tmp.zip"
    tmp_zip.write_bytes(zip_bytes)
    with zipfile.ZipFile(tmp_zip, "r") as zf:
        zf.extractall(target_dir)
    tmp_zip.unlink(missing_ok=True)

    # Organize extracted CSVs if they were placed flat or nested
    csv_files = list(target_dir.rglob("*.csv"))
    if csv_files:
        ie_csv = target_dir / "import_export" / "csv"
        ie_csv.mkdir(parents=True, exist_ok=True)
        for cf in csv_files:
            if cf.parent != ie_csv:
                shutil.copy2(cf, ie_csv / cf.name)

    discover_all_saves()
    slug = slugify(clean_name)
    res = ingest_save_to_sqlite(slug, force=True)
    set_active_save_slug(slug)
    return res
