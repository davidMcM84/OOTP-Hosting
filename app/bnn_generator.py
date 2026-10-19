import os
import re
import sqlite3
from pathlib import Path
from app.config import HOST_DB_PATH, POSITIONS, BATS_HAND, THROWS_HAND
from app.analytics import (
    get_save_db_connection,
    get_player_profile,
    get_game_logs_and_replay,
    get_save_overview,
    get_sabermetric_leaderboards,
    safe_int,
    safe_float,
)


def get_save_html_dir(save_slug: str) -> Path | None:
    conn = sqlite3.connect(HOST_DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT html_dir, folder_path FROM saves_registry WHERE save_slug = ?", (save_slug,)).fetchone()
    conn.close()
    if not row:
        return None
    if row["html_dir"] and os.path.isdir(row["html_dir"]):
        return Path(row["html_dir"])
    cand = Path(row["folder_path"]) / "news" / "html"
    return cand if cand.is_dir() else None


def get_save_folder_path(save_slug: str) -> Path | None:
    conn = sqlite3.connect(HOST_DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT folder_path FROM saves_registry WHERE save_slug = ?", (save_slug,)).fetchone()
    conn.close()
    if row and row["folder_path"] and os.path.isdir(row["folder_path"]):
        return Path(row["folder_path"])
    return None


def list_available_bnn_reports(save_slug: str, league_id: int = None) -> dict:
    html_dir = get_save_html_dir(save_slug)
    folder_path = get_save_folder_path(save_slug)
    conn = sqlite3.connect(HOST_DB_PATH)
    conn.row_factory = sqlite3.Row
    meta = conn.execute("SELECT * FROM saves_registry WHERE save_slug = ?", (save_slug,)).fetchone()
    conn.close()
    lid = league_id or (meta["primary_league_id"] if meta else 200)
    labbr = meta["primary_league_abbr"] if meta else "MLB"

    # Check if SQLite DB has multiple leagues to expose league-specific BNN links
    sconn = get_save_db_connection(save_slug)
    leagues_list = []
    if sconn:
        try:
            for r in sconn.execute("SELECT league_id, name, abbr, league_level FROM leagues ORDER BY league_level ASC, league_id ASC"):
                d = dict(r)
                leagues_list.append({
                    "league_id": safe_int(d.get("league_id"), 200),
                    "name": d.get("name", "League"),
                    "abbr": d.get("abbr", "LGE"),
                    "level": safe_int(d.get("league_level"), 1),
                })
        except Exception:
            pass
        sconn.close()

    if leagues_list and league_id:
        matched_lg = next((x for x in leagues_list if x["league_id"] == league_id), None)
        if matched_lg:
            labbr = matched_lg["abbr"]
    elif not leagues_list and html_dir and (html_dir / "leagues").is_dir():
        for cand_f in sorted((html_dir / "leagues").glob("league_*_*.html")):
            m_id = re.match(r"league_(\d+)_", cand_f.name)
            if m_id:
                lid = int(m_id.group(1))
                break

    quick_links = [
        {"title": f"{labbr} League Home", "category": "Core", "icon": "bi-trophy", "path": f"leagues/league_{lid}_home.html"},
        {"title": "BNN Index & Directory", "category": "Core", "icon": "bi-house-door", "path": "index.html"},
        {"title": f"{labbr} Standings", "category": "League", "icon": "bi-list-ol", "path": f"leagues/league_{lid}_standings.html"},
        {"title": f"{labbr} Scores & Schedule", "category": "League", "icon": "bi-calendar3", "path": f"leagues/league_{lid}_scores.html"},
        {"title": f"{labbr} League Stats & Leaders", "category": "League", "icon": "bi-bar-chart-line", "path": f"leagues/league_{lid}_stats.html"},
        {"title": f"{labbr} Teams Directory", "category": "League", "icon": "bi-shield-shaded", "path": f"leagues/league_{lid}_teams.html"},
        {"title": f"{labbr} Player Index", "category": "League", "icon": "bi-people", "path": f"leagues/league_{lid}_players.html"},
        {"title": f"{labbr} Transactions Wire", "category": "League", "icon": "bi-arrow-left-right", "path": f"leagues/league_{lid}_transactions_0_0.html"},
        {"title": f"{labbr} Preseason Predictions", "category": "Analytics", "icon": "bi-graph-up-arrow", "path": f"leagues/league_{lid}_preseason_prediction_report.html"},
        {"title": f"{labbr} Power Rankings", "category": "Analytics", "icon": "bi-lightning-charge", "path": f"leagues/league_{lid}_team_power_rankings_page.html"},
        {"title": f"{labbr} League History Index", "category": "History", "icon": "bi-clock-history", "path": f"history/league_{lid}_index.html"},
    ]

    # Discover Almanac HTML directories (news/almanac_YYYY)
    almanacs = []
    if folder_path and (folder_path / "news").is_dir():
        for alm_dir in sorted((folder_path / "news").glob("almanac_*"), reverse=True):
            if alm_dir.is_dir():
                yr_m = re.search(r"(\d{4})", alm_dir.name)
                yr = int(yr_m.group(1)) if yr_m else 0
                html_cnt = sum(len(list((alm_dir / sd).glob("*.html"))) for sd in ["leagues", "teams", "players", "history", "box_scores", "coaches"] if (alm_dir / sd).is_dir())
                lg_home_rel = f"{alm_dir.name}/leagues/league_{lid}_home.html"
                best_entry = lg_home_rel if (alm_dir / "leagues" / f"league_{lid}_home.html").is_file() else f"{alm_dir.name}/index.html"
                almanacs.append({
                    "name": f"{yr} Season Almanac" if yr else alm_dir.name,
                    "year": yr,
                    "folder": alm_dir.name,
                    "html_count": html_cnt,
                    "index_url": best_entry,
                    "index_path": best_entry,
                    "league_home_path": lg_home_rel,
                    "standings_path": f"{alm_dir.name}/leagues/league_{lid}_standings.html",
                })
                quick_links.append({
                    "title": f"Almanac {yr} ({html_cnt:,} pgs)",
                    "category": "Almanac",
                    "icon": "bi-journal-bookmark-fill",
                    "path": best_entry,
                })

    box_scores = []
    league_pages = []
    if html_dir and html_dir.is_dir():
        bs_dir = html_dir / "box_scores"
        if bs_dir.is_dir():
            for f in sorted(bs_dir.glob("*.html"), key=lambda x: x.stat().st_mtime, reverse=True)[:40]:
                box_scores.append({
                    "name": f.stem.replace("game_box_", "Game #"),
                    "path": f"box_scores/{f.name}",
                })
        lg_dir = html_dir / "leagues"
        if lg_dir.is_dir():
            for f in sorted(lg_dir.glob("*.html")):
                if f.name.startswith("league__"):
                    continue
                league_pages.append({
                    "name": f.stem.replace("_", " ").title(),
                    "path": f"leagues/{f.name}",
                })
                if len(league_pages) >= 60:
                    break

    return {
        "has_native_html": bool((html_dir and html_dir.is_dir()) or almanacs),
        "html_dir": str(html_dir) if html_dir else "",
        "league_id": lid,
        "default_path": f"leagues/league_{lid}_home.html",
        "leagues": leagues_list,
        "almanacs": almanacs,
        "quick_links": quick_links,
        "recent_box_scores": box_scores,
        "league_pages": league_pages,
    }


def _is_valid_ootp_html_file(p: Path) -> bool:
    if not p.is_file():
        return False
    if p.suffix.lower() not in (".html", ".htm"):
        return True
    if p.name.startswith("league__"):
        return False
    try:
        sz = p.stat().st_size
        # OOTP's index.html splash screen is 2687-2695 bytes and only has 2 links; let dynamic generator build a full portal
        if p.name == "index.html" and sz < 3200:
            return False
        if sz < 2800:
            head_txt = p.read_text(encoding="utf-8", errors="ignore")[:1500]
            if "League page not available" in head_txt or "League ID missing" in head_txt:
                return False
    except Exception:
        return False
    return True


def resolve_bnn_file_path(html_dir: Path | None, rel_path: str, save_slug: str = None) -> Path | None:
    """
    Resolves a requested BNN relative path, supporting both `news/html` AND
    `news/almanac_YYYY/...` archives while filtering out OOTP's `league__*.html` error stubs.
    """
    clean_rel = rel_path.lstrip("/\\")
    base_dir = html_dir

    # Support almanac_YYYY/... paths
    if clean_rel.startswith("almanac_") and save_slug:
        folder_path = get_save_folder_path(save_slug)
        if folder_path:
            parts = clean_rel.split("/", 1)
            alm_folder = folder_path / "news" / parts[0]
            if alm_folder.is_dir():
                base_dir = alm_folder
                clean_rel = parts[1] if len(parts) > 1 else "index.html"

    if not base_dir or not base_dir.is_dir():
        return None

    target = (base_dir / clean_rel).resolve()
    if str(target).lower().startswith(str(base_dir.resolve()).lower()) and _is_valid_ootp_html_file(target):
        return target

    # Reverse lookup if a page linked to league__home.html -> find actual league_<id>_home.html
    if "league__" in clean_rel:
        pattern = clean_rel.replace("league__", "league_*_")
        matches = [m for m in base_dir.glob(pattern) if _is_valid_ootp_html_file(m)]
        if matches:
            return matches[0]

    # If an almanac page requested shared styles.css, scripts/*, or images/* that only exist in news/html, fall back to html_dir
    if base_dir != html_dir and html_dir and html_dir.is_dir():
        fallback_target = (html_dir / clean_rel).resolve()
        if str(fallback_target).lower().startswith(str(html_dir.resolve()).lower()) and _is_valid_ootp_html_file(fallback_target):
            return fallback_target

    return None


def rewrite_ootp_html_content(html_text: str, save_slug: str, rel_path: str, primary_league_id: int = 200) -> str:
    """
    Enhances raw OOTP 27 HTML pages by:
    1. Fixing broken `league__*.html` links or empty `team_.html` links
    2. Injecting a modern floating bar (styled in the Octet White-on-Black palette) allowing 1-click navigation
       back to the Analytics Suite or opening the current Player / Team / Game inside the interactive Hub.
    """
    fixed = re.sub(r'href="(\.\./)?leagues/league__([a-z0-9_]+\.html)"', rf'href="\1leagues/league_{primary_league_id}_\2"', html_text)

    deep_btn = ""
    m_player = re.search(r"player_(\d+)\.html", rel_path)
    m_team = re.search(r"team_(\d+)\.html", rel_path)
    m_game = re.search(r"(?:game_box_|log_)(\d+)\.html", rel_path)

    if m_player:
        pid = int(m_player.group(1))
        deep_btn = f"""<button onclick="if(window.parent && window.parent.openPlayerModal){{window.parent.openPlayerModal({pid});}}else{{window.location.href='/?player={pid}';}}" style="background:#dbdbdb;color:#0a0a0a;border:none;padding:5px 12px;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px;">Open Player Statcast & Scouting Card #{pid}</button>"""
    elif m_team:
        tid = int(m_team.group(1))
        deep_btn = f"""<button onclick="if(window.parent && window.parent.switchTeamAndGo){{window.parent.switchTeamAndGo({tid});}}else{{window.location.href='/?team={tid}';}}" style="background:#dbdbdb;color:#0a0a0a;border:none;padding:5px 12px;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px;">Open Team Analytics Hub</button>"""
    elif m_game:
        gid = int(m_game.group(1))
        deep_btn = f"""<button onclick="if(window.parent && window.parent.openGameReplayModal){{window.parent.openGameReplayModal({gid});}}else{{window.location.href='/?game={gid}';}}" style="background:#dbdbdb;color:#0a0a0a;border:none;padding:5px 12px;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px;">Open Interactive Statcast Game Replay #{gid}</button>"""

    clean_for_depth = rel_path.strip("/")
    if clean_for_depth.startswith("almanac_"):
        sub_parts = clean_for_depth.split("/", 1)
        clean_for_depth = sub_parts[1] if len(sub_parts) > 1 else ""
    depth_prefix = "../" if "/" in clean_for_depth else ""
    badge_label = "OOTP 27 ALMANAC ARCHIVE" if rel_path.strip("/").startswith("almanac_") else "OOTP 27 BNN REPORT"

    toolbar = f"""
    <div style="background:linear-gradient(90deg,#0a0a0a,#1f1f20);color:#dbdbdb;padding:8px 16px;font-family:system-ui,-apple-system,sans-serif;font-size:12px;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #5f6062;position:sticky;top:0;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.5);">
        <div style="display:flex;align-items:center;gap:12px;">
            <span style="background:#dbdbdb;color:#0a0a0a;font-weight:800;padding:2px 8px;border-radius:4px;letter-spacing:0.5px;">{badge_label}</span>
            <a href="{depth_prefix}index.html" style="color:#999999;text-decoration:none;font-weight:600;">BNN Index</a>
            <span style="color:#373839;">|</span>
            <a href="{depth_prefix}leagues/league_{primary_league_id}_home.html" style="color:#dbdbdb;text-decoration:none;font-weight:600;">League Home</a>
            <a href="{depth_prefix}leagues/league_{primary_league_id}_standings.html" style="color:#dbdbdb;text-decoration:none;font-weight:600;">Standings</a>
            <a href="{depth_prefix}leagues/league_{primary_league_id}_scores.html" style="color:#dbdbdb;text-decoration:none;font-weight:600;">Scores</a>
            <a href="{depth_prefix}leagues/league_{primary_league_id}_stats.html" style="color:#dbdbdb;text-decoration:none;font-weight:600;">Leaderboards</a>
            <a href="{depth_prefix}leagues/league_{primary_league_id}_teams.html" style="color:#dbdbdb;text-decoration:none;font-weight:600;">Teams</a>
            <a href="{depth_prefix}leagues/league_{primary_league_id}_players.html" style="color:#dbdbdb;text-decoration:none;font-weight:600;">Players</a>
            <a href="{depth_prefix}history/league_{primary_league_id}_index.html" style="color:#dbdbdb;text-decoration:none;font-weight:600;">History</a>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
            {deep_btn}
        </div>
    </div>
    """

    if "<body" in fixed:
        fixed = re.sub(r"(<body[^>]*>)", r"\1" + toolbar, fixed, count=1, flags=re.IGNORECASE)
    else:
        fixed = toolbar + fixed
    return fixed


def generate_dynamic_bnn_html(save_slug: str, rel_path: str) -> str | None:
    """
    Dynamically generates a 100% authentic OOTP 27 BNN HTML report from SQLite when
    OOTP didn't pre-export a specific player_<id>.html, team_<id>.html, log_<id>.html,
    game_box_<id>.html, or league report page.
    """
    conn = sqlite3.connect(HOST_DB_PATH)
    conn.row_factory = sqlite3.Row
    meta = conn.execute("SELECT * FROM saves_registry WHERE save_slug = ?", (save_slug,)).fetchone()
    conn.close()
    lid = meta["primary_league_id"] if meta else 200
    lname = meta["primary_league_name"] if meta else "Major League Baseball"
    labbr = meta["primary_league_abbr"] if meta else "MLB"

    # Check if rel_path specifies a league_<id>_*.html or almanac_<year>
    m_lid = re.search(r"league_(\d+)_", rel_path)
    if m_lid:
        lid = int(m_lid.group(1))
    m_alm = re.search(r"almanac_(\d{4})", rel_path)
    alm_year = int(m_alm.group(1)) if m_alm else None

    clean_for_depth = rel_path.strip("/")
    if clean_for_depth.startswith("almanac_"):
        sub_parts = clean_for_depth.split("/", 1)
        clean_for_depth = sub_parts[1] if len(sub_parts) > 1 else ""
    page_depth = 1 if "/" in clean_for_depth else 0
    prefix = "../" * page_depth

    def wrap_bnn_shell(title: str, subtitle: str, body_html: str, depth: int = page_depth) -> str:
        pfx = "../" * depth
        html = f"""<!DOCTYPE HTML>
<html>
<head>
<title>{title}</title>
<meta charset="utf-8">
<link rel="stylesheet" type="text/css" href="{pfx}styles.css">
<style>
  body.ext_bg {{ background-color: #0a0a0a; color: #dbdbdb; font-family: Tahoma, Geneva, sans-serif; margin: 0; }}
  .bnn-card {{ background: #1f1f20; border: 1px solid #373839; border-radius: 6px; margin-bottom: 14px; overflow: hidden; }}
  .bnn-title {{ background: linear-gradient(90deg, #1f1f20, #373839); color: #dbdbdb; font-weight: bold; padding: 8px 12px; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; border-bottom: 1px solid #5f6062; }}
  table.bnn-table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
  table.bnn-table th {{ background: #0a0a0a; color: #999999; padding: 6px 8px; text-align: right; border-bottom: 1px solid #373839; }}
  table.bnn-table th.dl, table.bnn-table td.dl {{ text-align: left; }}
  table.bnn-table td {{ padding: 6px 8px; text-align: right; border-bottom: 1px solid #1f1f20; background: #141415; color: #dbdbdb; }}
  table.bnn-table tr:hover td {{ background: #1f1f20; }}
  table.bnn-table a {{ color: #dbdbdb; text-decoration: underline; text-decoration-color: #5f6062; font-weight: 600; }}
  table.bnn-table a:hover {{ color: #ffffff; }}
  .bnn-grid-2 {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 14px; }}
</style>
</head>
<body class="ext_bg">
<div style="max-width:1160px;margin:18px auto;padding:0 12px;">
  <div style="background:linear-gradient(135deg,#0a0a0a,#1f1f20);border:1px solid #5f6062;border-radius:8px;padding:18px 22px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:11px;color:#999999;font-weight:700;letter-spacing:1px;text-transform:uppercase;">{lname} ({labbr}) — OOTP 27 BNN Report</div>
      <div style="font-size:24px;font-weight:800;color:#dbdbdb;margin-top:2px;">{title}</div>
      <div style="font-size:13px;color:#999999;margin-top:2px;">{subtitle}</div>
    </div>
    <div>
      <img src="{pfx}images/league_logos/major_league_baseball.png" onerror="this.style.display='none'" style="height:64px;">
    </div>
  </div>
  {body_html}
</div>
</body>
</html>"""
        return rewrite_ootp_html_content(html, save_slug, rel_path, primary_league_id=lid)

    # 1. Dynamic Player Report: players/player_<id>.html
    m_player = re.search(r"players/player_(\d+)\.html", rel_path)
    if m_player:
        pid = int(m_player.group(1))
        prof = get_player_profile(save_slug, pid)
        if not prof:
            return wrap_bnn_shell(f"Player #{pid}", "Player record in SQLite", "<div class='bnn-card' style='padding:16px;'>Player not found in active SQLite save.</div>")

        bat = prof.get("batting")
        pit = prof.get("pitching")
        team = prof.get("team", {})

        ratings_html = ""
        if bat and not prof.get("is_pitcher"):
            ratings_html = f"""
            <div class="bnn-card">
              <div class="bnn-title">Scouting & Sabermetric Snapshot (20-80 Scale)</div>
              <table class="bnn-table">
                <tr><th class="dl">Contact</th><th>Gap</th><th>Power</th><th>Eye</th><th>Avoid K</th><th>Speed</th><th>Steal</th><th>Def ZR</th><th>OVR / POT</th><th>wOBA / xwOBA</th><th>wRC+</th><th>WAR</th></tr>
                <tr>
                  <td class="dl"><b>{bat['rtg_contact']}</b> (Pot {bat['rtg_talent_contact']})</td>
                  <td>{bat['rtg_gap']}</td>
                  <td><b>{bat['rtg_power']}</b> (Pot {bat['rtg_talent_power']})</td>
                  <td><b>{bat['rtg_eye']}</b> (Pot {bat['rtg_talent_eye']})</td>
                  <td>{bat['rtg_k']}</td>
                  <td>{bat['rtg_speed']}</td>
                  <td>{bat['rtg_steal']}</td>
                  <td>{bat['zr']:+.1f}</td>
                  <td><b>{bat['oa']} / {bat['pot']}</b></td>
                  <td>{bat['woba']:.3f} / {bat['xwoba']:.3f}</td>
                  <td><b>{bat['wrc_plus']}</b></td>
                  <td><b>{bat['war']:.2f}</b></td>
                </tr>
              </table>
            </div>
            """
        elif pit:
            ratings_html = f"""
            <div class="bnn-card">
              <div class="bnn-title">Pitching Scouting & Sabermetric Snapshot (20-80 Scale)</div>
              <table class="bnn-table">
                <tr><th class="dl">Stuff</th><th>Movement</th><th>Control</th><th>Stamina</th><th>Velocity</th><th>Arm Slot</th><th>OVR / POT</th><th>ERA</th><th>FIP / xFIP</th><th>K/9</th><th>WHIP</th><th>WAR</th></tr>
                <tr>
                  <td class="dl"><b>{pit['rtg_stuff']}</b> (Pot {pit['rtg_talent_stuff']})</td>
                  <td><b>{pit['rtg_movement']}</b> (Pot {pit['rtg_talent_movement']})</td>
                  <td><b>{pit['rtg_control']}</b> (Pot {pit['rtg_talent_control']})</td>
                  <td>{pit['rtg_stamina']}</td>
                  <td>{pit['velocity_str']}</td>
                  <td>{pit['arm_slot']}</td>
                  <td><b>{pit['oa']} / {pit['pot']}</b></td>
                  <td><b>{pit['era']:.2f}</b></td>
                  <td>{pit['fip']:.2f} / {pit['xfip']:.2f}</td>
                  <td>{pit['k9']:.2f}</td>
                  <td>{pit['whip']:.2f}</td>
                  <td><b>{pit['war']:.2f}</b></td>
                </tr>
              </table>
            </div>
            """

        cbat_rows = ""
        for r in prof.get("career_batting", []):
            cbat_rows += f"<tr><td class='dl'>{r['year']}</td><td class='dl'>{r['team_abbr']}</td><td>{r['g']}</td><td>{r['pa']}</td><td>{r['ab']}</td><td>{r['r']}</td><td>{r['h']}</td><td>{r['2b']}</td><td>{r['3b']}</td><td>{r['hr']}</td><td>{r['rbi']}</td><td>{r['bb']}</td><td>{r['k']}</td><td>{r['sb']}</td><td>{r['avg']:.3f}</td><td>{r['obp']:.3f}</td><td>{r['slg']:.3f}</td><td>{r['ops']:.3f}</td><td><b>{r['war']:.2f}</b></td></tr>"

        cpit_rows = ""
        for r in prof.get("career_pitching", []):
            cpit_rows += f"<tr><td class='dl'>{r['year']}</td><td class='dl'>{r['team_abbr']}</td><td>{r['g']}</td><td>{r['gs']}</td><td>{r['w']}-{r['l']}</td><td>{r['sv']}</td><td>{r['ip_display']}</td><td>{r['ha']}</td><td>{r['er']}</td><td>{r['hra']}</td><td>{r['bb']}</td><td>{r['k']}</td><td><b>{r['era']:.2f}</b></td><td>{r['whip']:.2f}</td><td><b>{r['war']:.2f}</b></td></tr>"

        body = f"""
        {ratings_html}
        {"<div class='bnn-card'><div class='bnn-title'>Career Batting Statistics</div><table class='bnn-table'><tr><th class='dl'>Year</th><th class='dl'>Team</th><th>G</th><th>PA</th><th>AB</th><th>R</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>RBI</th><th>BB</th><th>K</th><th>SB</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>WAR</th></tr>" + cbat_rows + "</table></div>" if cbat_rows else ""}
        {"<div class='bnn-card'><div class='bnn-title'>Career Pitching Statistics</div><table class='bnn-table'><tr><th class='dl'>Year</th><th class='dl'>Team</th><th>G</th><th>GS</th><th>W-L</th><th>SV</th><th>IP</th><th>H</th><th>ER</th><th>HR</th><th>BB</th><th>K</th><th>ERA</th><th>WHIP</th><th>WAR</th></tr>" + cpit_rows + "</table></div>" if cpit_rows else ""}
        """
        return wrap_bnn_shell(
            f"{prof['position']} {prof['name']} #{prof['uniform_number']}",
            f"Team: {team.get('full_name', 'Free Agent')} | Age: {prof['age']} | Bats: {prof['bats']} | Throws: {prof['throws']}",
            body,
        )

    # 2. Dynamic Team Report: teams/team_<id>.html
    m_team = re.search(r"teams/team_(\d+)\.html", rel_path)
    if m_team:
        tid = int(m_team.group(1))
        ov = get_save_overview(save_slug, team_id=tid, year=alm_year)
        lb = get_sabermetric_leaderboards(save_slug, team_id=tid, limit_top=100, year=alm_year)
        tinfo = next((t for t in ov.get("standings", []) if t["team_id"] == tid), None)
        if not tinfo:
            return wrap_bnn_shell(f"Team #{tid}", "Team Report", "<div class='bnn-card' style='padding:16px;'>Team not found.</div>")

        b_rows = "".join(
            f"<tr><td class='dl'><a href='{prefix}players/player_{b['player_id']}.html'>{b['name']}</a></td><td class='dl'>{b['position']}</td><td>{b['age']}</td><td>{b['g']}</td><td>{b['pa']}</td><td>{b['avg']:.3f}</td><td>{b['obp']:.3f}</td><td>{b['slg']:.3f}</td><td>{b['ops']:.3f}</td><td>{b['hr']}</td><td>{b['rbi']}</td><td>{b['woba']:.3f}</td><td><b>{b['wrc_plus']}</b></td><td><b>{b['war']:.2f}</b></td></tr>"
            for b in lb.get("batters", [])
        )
        p_rows = "".join(
            f"<tr><td class='dl'><a href='{prefix}players/player_{p['player_id']}.html'>{p['name']}</a></td><td class='dl'>{p['role']}</td><td>{p['age']}</td><td>{p['g']}</td><td>{p['gs']}</td><td>{p['w']}-{p['l']}</td><td>{p['sv']}</td><td>{p['ip_display']}</td><td><b>{p['era']:.2f}</b></td><td>{p['fip']:.2f}</td><td>{p['whip']:.2f}</td><td>{p['k']}</td><td><b>{p['war']:.2f}</b></td></tr>"
            for p in lb.get("pitchers", [])
        )
        rec_str = tinfo.get("record_str") or f"{tinfo['w']}-{tinfo['l']}"
        body = f"""
        <div class="bnn-card">
          <div class="bnn-title">Team Season Summary — {tinfo['full_name']} ({rec_str}, {tinfo['pct']:.3f})</div>
          <table class="bnn-table">
            <tr><th class="dl">Record</th><th>Pythagorean W-L</th><th>Run Diff</th><th>Team OPS</th><th>Team wRC+</th><th>Team ERA</th><th>Team FIP</th><th>Def ZR</th><th>Total WAR</th><th>Ballpark</th></tr>
            <tr>
              <td class="dl"><b>{rec_str} ({tinfo['pct']:.3f})</b></td>
              <td>{tinfo['pyth_w']}-{tinfo['pyth_l']}</td>
              <td>{tinfo['run_diff']:+d} ({tinfo['rs']} RS / {tinfo['ra']} RA)</td>
              <td>{tinfo['ops']:.3f}</td>
              <td>{tinfo['wrc_plus']:.0f}</td>
              <td>{tinfo['era']:.2f}</td>
              <td>{tinfo['fip']:.2f}</td>
              <td>{tinfo['zr']:+.1f}</td>
              <td><b>{tinfo['total_war']:.1f}</b></td>
              <td>{tinfo['park']['name']}</td>
            </tr>
          </table>
        </div>
        <div class="bnn-card"><div class="bnn-title">Team Batting Roster & Sabermetrics</div><table class="bnn-table"><tr><th class="dl">Player</th><th class="dl">Pos</th><th>Age</th><th>G</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>HR</th><th>RBI</th><th>wOBA</th><th>wRC+</th><th>WAR</th></tr>{b_rows}</table></div>
        <div class="bnn-card"><div class="bnn-title">Team Pitching Staff & Sabermetrics</div><table class="bnn-table"><tr><th class="dl">Pitcher</th><th class="dl">Role</th><th>Age</th><th>G</th><th>GS</th><th>W-L</th><th>SV</th><th>IP</th><th>ERA</th><th>FIP</th><th>WHIP</th><th>K</th><th>WAR</th></tr>{p_rows}</table></div>
        """
        return wrap_bnn_shell(
            f"{tinfo['full_name']} ({tinfo['abbr']})",
            f"Record: {rec_str} | Home Park: {tinfo['park']['name']} | Manager: {tinfo['manager_name']}",
            body,
        )

    # 3. Dynamic Game Log / Box Score: game_logs/log_<id>.html or box_scores/game_box_<id>.html
    m_log = re.search(r"(?:game_logs/log_|box_scores/game_box_)(\d+)\.html", rel_path)
    if m_log:
        gid = int(m_log.group(1))
        gl = get_game_logs_and_replay(save_slug, game_id=gid)
        g = gl.get("active_game")
        if not g:
            return wrap_bnn_shell(f"Game #{gid}", "Game Report", "<div class='bnn-card' style='padding:16px;'>Game not found.</div>")

        pbp_rows = ""
        for idx, ab in enumerate(g.get("at_bats", []), start=1):
            ev_badge = f"<span style='color:#999999;'>EV {ab['exit_velo']} mph | LA {ab['launch_angle']}° | {ab['distance_ft']} ft ({ab['zone_code']})</span>" if ab["is_bip"] else ""
            pbp_rows += f"""
            <tr>
              <td class="dl">{ab.get('inning_label', f"Inn {ab['inning']}")} ({ab['outs']} Out)</td>
              <td class="dl"><a href="{prefix}teams/team_{ab['team_id']}.html">{ab['team_abbr']}</a></td>
              <td class="dl"><a href="{prefix}players/player_{ab['player_id']}.html">{ab['batter_name']}</a> ({ab['bats']})</td>
              <td class="dl"><a href="{prefix}players/player_{ab['opponent_id']}.html">{ab['pitcher_name']}</a> ({ab['throws']})</td>
              <td>{ab['count']}</td>
              <td class="dl"><b style="color:{ab['color']};">{ab['result_label']}</b> {ev_badge}</td>
              <td>{ab.get('away_score_after', 0)}-{ab.get('home_score_after', 0)}</td>
              <td>{ab['rbi'] if ab['rbi'] else ''}</td>
            </tr>
            """
        body = f"""
        <div class="bnn-card">
          <div class="bnn-title">Final Score: {g['away_name']} {g['away_runs']}, {g['home_name']} {g['home_runs']} ({g['date']})</div>
          <div style="padding:10px 14px;font-size:13px;display:flex;justify-content:space-between;">
            <span><b>{g['away_abbr']}:</b> {g['away_runs']} R, {g['away_hits']} H, {g['away_errors']} E</span>
            <span><b>{g['home_abbr']}:</b> {g['home_runs']} R, {g['home_hits']} H, {g['home_errors']} E</span>
            <span><b>Park:</b> {g['park']['name']} | <b>Attendance:</b> {g['attendance']:,}</span>
          </div>
        </div>
        <div class="bnn-card">
          <div class="bnn-title">Reconstructed At-Bat Play-by-Play & Statcast Log ({len(g.get('at_bats', []))} Plate Appearances)</div>
          <table class="bnn-table">
            <tr><th class="dl">Inning</th><th class="dl">Team</th><th class="dl">Batter</th><th class="dl">Pitcher</th><th>Count</th><th class="dl">Play Outcome & Statcast</th><th>Score</th><th>RBI</th></tr>
            {pbp_rows}
          </table>
        </div>
        """
        return wrap_bnn_shell(
            f"{g['away_name']} @ {g['home_name']} — Game #{gid}",
            f"Date: {g['date']} | {g['park']['name']} | Attendance: {g['attendance']:,}",
            body,
        )

    # 4. Specialized League Pages (_home, _standings, _scores, _stats, _teams, _players, _transactions, history, index)
    ov = get_save_overview(save_slug, league_id=lid, year=alm_year)
    standings = ov.get("standings", [])
    active_lg = ov.get("active_league", {"name": lname, "abbr": labbr, "season_year": 2026})
    season_yr = ov.get("selected_year") or active_lg.get("season_year", 2026)
    has_ties = ov.get("environment", {}).get("league_has_ties", False)

    st_header = "<tr><th class='dl'>Team</th><th class='dl'>Division</th><th>G</th><th>W</th><th>L</th>" + ("<th>T</th>" if has_ties else "") + "<th>PCT</th><th>GB</th><th>Pyth W-L</th><th>RS</th><th>RA</th><th>Diff</th><th>OPS</th><th>ERA</th><th>WAR</th></tr>"
    st_rows = "".join(
        f"<tr><td class='dl'><a href='{prefix}teams/team_{t['team_id']}.html'>{t['full_name']} ({t['abbr']})</a></td><td class='dl'>{t.get('division_name', '')}</td><td>{t['g']}</td><td><b>{t['w']}</b></td><td>{t['l']}</td>"
        + (f"<td>{t.get('t', 0)}</td>" if has_ties else "")
        + f"<td><b>{t['pct']:.3f}</b></td><td>{t['gb']:.1f}</td><td>{t['pyth_w']}-{t['pyth_l']}</td><td>{t['rs']}</td><td>{t['ra']}</td><td>{t['run_diff']:+d}</td><td>{t['ops']:.3f}</td><td>{t['era']:.2f}</td><td><b>{t['total_war']:.1f}</b></td></tr>"
        for t in standings
    )
    standings_card = f"<div class='bnn-card'><div class='bnn-title'>{active_lg.get('name', lname)} — {season_yr} Standings</div><table class='bnn-table'>{st_header}{st_rows}</table></div>"

    lower_rel = rel_path.lower()

    # 4A. Scores & Schedule Page
    if "_scores" in lower_rel:
        gl = get_game_logs_and_replay(save_slug, limit=80)
        g_rows = "".join(
            f"<tr><td class='dl'>{g['date']}</td><td class='dl'><a href='{prefix}teams/team_{g['away_team_id']}.html'>{g['away_name']}</a></td><td><b>{g['away_runs']}</b></td><td class='dl'><a href='{prefix}teams/team_{g['home_team_id']}.html'>{g['home_name']}</a></td><td><b>{g['home_runs']}</b></td><td class='dl'>{g['winning_pitcher']}</td><td class='dl'>{g['losing_pitcher']}</td><td class='dl'>{g['save_pitcher'] or '-'}</td><td>{g['attendance']:,}</td><td class='dl'><a href='{prefix}box_scores/game_box_{g['game_id']}.html'>Box Score #{g['game_id']}</a></td></tr>"
            for g in gl.get("games", [])
        )
        return wrap_bnn_shell(
            f"{active_lg.get('name', lname)} — {season_yr} Scores & Box Scores",
            f"Completed Games & Official BNN Box Score Links ({len(gl.get('games', []))} Recent Games)",
            f"<div class='bnn-card'><div class='bnn-title'>Recent Completed Games</div><table class='bnn-table'><tr><th class='dl'>Date</th><th class='dl'>Away</th><th>R</th><th class='dl'>Home</th><th>R</th><th class='dl'>WP</th><th class='dl'>LP</th><th class='dl'>SV</th><th>Attendance</th><th class='dl'>Box Score</th></tr>{g_rows}</table></div>",
        )

    # 4B. League Stats & Leaders Page
    if "_stats" in lower_rel or "_batting" in lower_rel or "_pitching" in lower_rel:
        lb = get_sabermetric_leaderboards(save_slug, league_id=lid, limit_top=50, year=alm_year)
        bat_rows = "".join(
            f"<tr><td>{i+1}</td><td class='dl'><a href='{prefix}players/player_{b['player_id']}.html'>{b['name']}</a></td><td class='dl'>{b['team_abbr']}</td><td class='dl'>{b['position']}</td><td>{b['pa']}</td><td><b>{b['avg']:.3f}</b></td><td>{b['obp']:.3f}</td><td>{b['slg']:.3f}</td><td><b>{b['ops']:.3f}</b></td><td>{b['hr']}</td><td>{b['rbi']}</td><td>{b['sb']}</td><td>{b['wrc_plus']}</td><td><b>{b['war']:.2f}</b></td></tr>"
            for i, b in enumerate(lb.get("batters", [])[:35])
        )
        pit_rows = "".join(
            f"<tr><td>{i+1}</td><td class='dl'><a href='{prefix}players/player_{p['player_id']}.html'>{p['name']}</a></td><td class='dl'>{p['team_abbr']}</td><td class='dl'>{p['role']}</td><td>{p['ip_display']}</td><td>{p['w']}-{p['l']}</td><td>{p['sv']}</td><td><b>{p['era']:.2f}</b></td><td>{p['fip']:.2f}</td><td>{p['whip']:.2f}</td><td>{p['k']}</td><td><b>{p['war']:.2f}</b></td></tr>"
            for i, p in enumerate(lb.get("pitchers", [])[:35])
        )
        return wrap_bnn_shell(
            f"{active_lg.get('name', lname)} — {season_yr} League Statistics & Leaderboards",
            "Individual Batting & Pitching Leaderboards",
            f"<div class='bnn-card'><div class='bnn-title'>Top 35 Batting Leaders (Sorted by WAR)</div><table class='bnn-table'><tr><th>Rk</th><th class='dl'>Batter</th><th class='dl'>Tm</th><th class='dl'>Pos</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>HR</th><th>RBI</th><th>SB</th><th>wRC+</th><th>WAR</th></tr>{bat_rows}</table></div>"
            f"<div class='bnn-card'><div class='bnn-title'>Top 35 Pitching Leaders (Sorted by WAR)</div><table class='bnn-table'><tr><th>Rk</th><th class='dl'>Pitcher</th><th class='dl'>Tm</th><th class='dl'>Role</th><th>IP</th><th>W-L</th><th>SV</th><th>ERA</th><th>FIP</th><th>WHIP</th><th>K</th><th>WAR</th></tr>{pit_rows}</table></div>",
        )

    # 4C. Teams Directory Page
    if "_teams" in lower_rel:
        tm_rows = "".join(
            f"<tr><td class='dl'><a href='{prefix}teams/team_{t['team_id']}.html'>{t['full_name']}</a></td><td class='dl'>{t['abbr']}</td><td class='dl'>{t.get('sub_league_name', '')} / {t.get('division_name', '')}</td><td><b>{t.get('record_str') or (str(t['w']) + '-' + str(t['l']))}</b></td><td>{t['pct']:.3f}</td><td class='dl'>{t.get('park', {}).get('name', '')}</td><td>${t.get('payroll', 0)/1e6:.1f}M</td><td>${t.get('budget', 0)/1e6:.1f}M</td><td>{t.get('attendance', 0):,}</td><td>{t.get('fan_interest', 0)}</td><td><b>{t['total_war']:.1f}</b></td></tr>"
            for t in standings
        )
        return wrap_bnn_shell(
            f"{active_lg.get('name', lname)} — {season_yr} Franchise Directory",
            f"{len(standings)} Active Clubs",
            f"<div class='bnn-card'><div class='bnn-title'>Franchise Directory & Front Office Overview</div><table class='bnn-table'><tr><th class='dl'>Franchise</th><th class='dl'>Abbr</th><th class='dl'>Division</th><th>Record</th><th>PCT</th><th class='dl'>Ballpark</th><th>Payroll</th><th>Budget</th><th>Attendance</th><th>Fan Int</th><th>WAR</th></tr>{tm_rows}</table></div>",
        )

    # 4D. Players Index Page
    if "_players" in lower_rel:
        lb = get_sabermetric_leaderboards(save_slug, league_id=lid, limit_top=120, year=alm_year)
        pl_rows = "".join(
            f"<tr><td class='dl'><a href='{prefix}players/player_{b['player_id']}.html'>{b['name']}</a></td><td class='dl'>{b['position']}</td><td class='dl'><a href='{prefix}teams/team_{b['team_id']}.html'>{b['team_abbr']}</a></td><td>{b['age']}</td><td>{b['bats']}/{b['throws']}</td><td><b>{b['oa']} / {b['pot']}</b></td><td>{b['avg']:.3f} / {b['ops']:.3f} / {b['hr']} HR</td><td><b>{b['war']:.2f}</b></td></tr>"
            for b in lb.get("batters", [])[:80]
        ) + "".join(
            f"<tr><td class='dl'><a href='{prefix}players/player_{p['player_id']}.html'>{p['name']}</a></td><td class='dl'>{p['role']}</td><td class='dl'><a href='{prefix}teams/team_{p['team_id']}.html'>{p['team_abbr']}</a></td><td>{p['age']}</td><td>{p['throws']}</td><td><b>{p['oa']} / {p['pot']}</b></td><td>{p['era']:.2f} ERA / {p['ip_display']} IP / {p['k']} K</td><td><b>{p['war']:.2f}</b></td></tr>"
            for p in lb.get("pitchers", [])[:80]
        )
        return wrap_bnn_shell(
            f"{active_lg.get('name', lname)} — {season_yr} Active Player Register",
            "Click any player to open their BNN Scouting & Career Report",
            f"<div class='bnn-card'><div class='bnn-title'>Active League Players (Batters & Pitchers)</div><table class='bnn-table'><tr><th class='dl'>Player</th><th class='dl'>Pos</th><th class='dl'>Team</th><th>Age</th><th>B/T</th><th>OVR / POT</th><th>Season Line</th><th>WAR</th></tr>{pl_rows}</table></div>",
        )

    # 4E. Transactions & League Wire Page
    if "_transactions" in lower_rel:
        from app.analytics import get_statsplus_reports
        sp = get_statsplus_reports(save_slug, league_id=lid, year=alm_year)
        tr_rows = "".join(
            f"<tr><td class='dl' style='white-space:nowrap;'>{tr['date']}</td><td class='dl'><b>{tr['team0_name']} &harr; {tr['team1_name']}</b></td><td class='dl'>{tr['summary_clean']}</td><td><b>{tr['winner_badge']}</b></td></tr>"
            for tr in sp.get("trades", [])
        )
        msg_rows = "".join(
            f"<tr><td class='dl' style='white-space:nowrap;'>{m.get('date', '')}</td><td class='dl'><b>{m.get('subject', '')}</b><br><span style='color:#999999;font-size:11px;'>{(m.get('body_text') or '')[:260]}</span></td></tr>"
            for m in sp.get("messages", [])
        )
        return wrap_bnn_shell(
            f"{active_lg.get('name', lname)} — {season_yr} Transactions & News Wire",
            "Official Trades, Roster Moves & League Headlines",
            (f"<div class='bnn-card'><div class='bnn-title'>Completed Trades ({len(sp.get('trades', []))})</div><table class='bnn-table'><tr><th class='dl'>Date</th><th class='dl'>Clubs</th><th class='dl'>Transaction Summary</th><th>WAR Grade</th></tr>{tr_rows}</table></div>" if tr_rows else "")
            + f"<div class='bnn-card'><div class='bnn-title'>League News & Wire ({len(sp.get('messages', []))})</div><table class='bnn-table'><tr><th class='dl'>Date</th><th class='dl'>Headline & Dispatch</th></tr>{msg_rows}</table></div>",
        )

    # 4F. League History Index Page
    if "history" in lower_rel:
        from app.analytics import get_league_evolution_hub
        evo = get_league_evolution_hub(save_slug, league_id=lid, year=alm_year)
        yby = evo.get("history", {}).get("year_by_year", [])
        fran = evo.get("history", {}).get("franchise_ledger", [])
        y_rows = "".join(
            f"<tr><td class='dl'><b>{y['year']}</b></td><td>{y['teams_count']}</td><td class='dl'>{y.get('expansion_event') or 'Stable'}</td><td class='dl'><b>{y['champion']}</b> ({y['best_record']})</td><td class='dl'>{y['top_batter']}</td><td class='dl'>{y['top_pitcher']}</td><td>{y['league_avg']:.3f}</td><td>{y['league_ops']:.3f}</td><td>{y['league_era']:.2f}</td><td>{y['total_hr']:,}</td></tr>"
            for y in yby
        )
        f_rows = "".join(
            f"<tr><td>{i+1}</td><td class='dl'><a href='{prefix}teams/team_{f['team_id']}.html'>{f['full_name']} ({f['abbr']})</a></td><td>{f['active_years']}</td><td>{f['seasons']}</td><td><b>{f['record_str']}</b></td><td><b>{f['pct']:.3f}</b></td><td>{f['playoff_appearances']}</td><td><b>{f['championships']}</b></td><td class='dl'>{f['best_season_str']}</td><td>{f['run_diff']:+d}</td></tr>"
            for i, f in enumerate(fran)
        )
        return wrap_bnn_shell(
            f"{active_lg.get('name', lname)} — Historical League & Franchise Index",
            f"Multi-Year Champions, Statistical Environment & All-Time Franchise Ledger ({len(yby)} Seasons)",
            f"<div class='bnn-card'><div class='bnn-title'>Year-by-Year Season History & Champions</div><table class='bnn-table'><tr><th class='dl'>Year</th><th>Teams</th><th class='dl'>Structure</th><th class='dl'>Champion</th><th class='dl'>Best Batter</th><th class='dl'>Best Pitcher</th><th>Lg AVG</th><th>Lg OPS</th><th>Lg ERA</th><th>HR</th></tr>{y_rows}</table></div>"
            f"<div class='bnn-card'><div class='bnn-title'>All-Time Franchise Standings Ledger</div><table class='bnn-table'><tr><th>Rk</th><th class='dl'>Franchise</th><th>Span</th><th>Yrs</th><th>All-Time W-L-T</th><th>PCT</th><th>Playoffs</th><th>Titles</th><th class='dl'>Best Season</th><th>Run Diff</th></tr>{f_rows}</table></div>",
        )

    # 4G. Default League Home / BNN Index Portal (rich multi-panel BNN Home Page)
    bat_leaders = ov.get("leaders", {}).get("top_war_batters", [])[:10]
    pit_leaders = ov.get("leaders", {}).get("top_war_pitchers", [])[:10]
    b_lead_rows = "".join(
        f"<tr><td class='dl'><a href='{prefix}players/player_{b['player_id']}.html'>{b['name']}</a></td><td class='dl'>{b['team_abbr']}</td><td>{b['avg']:.3f}</td><td>{b['ops']:.3f}</td><td>{b['hr']}</td><td>{b['wrc_plus']}</td><td><b>{b['war']:.2f}</b></td></tr>"
        for b in bat_leaders
    )
    p_lead_rows = "".join(
        f"<tr><td class='dl'><a href='{prefix}players/player_{p['player_id']}.html'>{p['name']}</a></td><td class='dl'>{p['team_abbr']}</td><td>{p['w']}-{p['l']}</td><td>{p['ip_display']}</td><td><b>{p['era']:.2f}</b></td><td>{p['k']}</td><td><b>{p['war']:.2f}</b></td></tr>"
        for p in pit_leaders
    )
    body_home = f"""
    {standings_card}
    <div class="bnn-grid-2">
      <div class="bnn-card">
        <div class="bnn-title">Top 10 Batting WAR Leaders</div>
        <table class="bnn-table"><tr><th class="dl">Batter</th><th class="dl">Tm</th><th>AVG</th><th>OPS</th><th>HR</th><th>wRC+</th><th>WAR</th></tr>{b_lead_rows}</table>
      </div>
      <div class="bnn-card">
        <div class="bnn-title">Top 10 Pitching WAR Leaders</div>
        <table class="bnn-table"><tr><th class="dl">Pitcher</th><th class="dl">Tm</th><th>W-L</th><th>IP</th><th>ERA</th><th>K</th><th>WAR</th></tr>{p_lead_rows}</table>
      </div>
    </div>
    """
    return wrap_bnn_shell(
        f"{active_lg.get('name', lname)} — {season_yr} BNN League Home",
        f"Standings, Leaderboards & Official BNN Reports ({len(standings)} Franchises)",
        body_home,
        depth=page_depth,
    )

