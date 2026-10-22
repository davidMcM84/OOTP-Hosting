import json
import math
import sqlite3
from datetime import datetime
import numpy as np

from app.config import HOST_DB_PATH, POSITIONS
from app.irl_counterparts import (
    METRO_ALIASES,
    get_irl_counterparts_registry,
    get_reference_city_populations,
    haversine_miles,
    lookup_irl_counterparts,
)


METRO_MSA_REFERENCE_POPS = {
    ("new york", "NY"): 9800000,
    ("los angeles", "CA"): 6400000,
    ("chicago", "IL"): 4800000,
    ("mexico city", "DIS"): 5600000,
    ("toronto", "ON"): 4100000,
    ("dallas", "TX"): 3900000,
    ("arlington", "TX"): 3900000,
    ("fort worth", "TX"): 2600000,
    ("houston", "TX"): 3700000,
    ("philadelphia", "PA"): 3400000,
    ("washington", "DC"): 3200000,
    ("atlanta", "GA"): 3200000,
    ("miami", "FL"): 3100000,
    ("san francisco", "CA"): 3100000,
    ("boston", "MA"): 3000000,
    ("phoenix", "AZ"): 2900000,
    ("montreal", "QC"): 2450000,
    ("detroit", "MI"): 2400000,
    ("seattle", "WA"): 2350000,
    ("oakland", "CA"): 2200000,
    ("minneapolis", "MN"): 2150000,
    ("st. paul", "MN"): 1850000,
    ("tampa", "FL"): 2050000,
    ("st. petersburg", "FL"): 1950000,
    ("san diego", "CA"): 2000000,
    ("denver", "CO"): 1950000,
    ("baltimore", "MD"): 1800000,
    ("st. louis", "MO"): 1800000,
    ("charlotte", "NC"): 1780000,
    ("orlando", "FL"): 1760000,
    ("san antonio", "TX"): 1750000,
    ("portland", "OR"): 1750000,
    ("pittsburgh", "PA"): 1650000,
    ("sacramento", "CA"): 1620000,
    ("las vegas", "NV"): 1600000,
    ("austin", "TX"): 1600000,
    ("round rock", "TX"): 1450000,
    ("cincinnati", "OH"): 1550000,
    ("kansas city", "MO"): 1520000,
    ("columbus", "OH"): 1520000,
    ("indianapolis", "IN"): 1500000,
    ("cleveland", "OH"): 1480000,
    ("nashville", "TN"): 1480000,
    ("vancouver", "BC"): 1650000,
    ("monterrey", "NUE"): 2100000,
    ("guadalajara", "JAL"): 1950000,
    ("santo domingo", "DIS"): 1850000,
    ("san juan", "SAN"): 1450000,
    ("havana", "LA"): 1650000,
    ("caracas", "DIS"): 1900000,
    ("allentown", "PA"): 680000,
    ("harrisburg", "PA"): 490000,
    ("scranton", "PA"): 460000,
    ("moosic", "PA"): 460000,
    ("lancaster", "PA"): 440000,
    ("reading", "PA"): 380000,
    ("york", "PA"): 360000,
    ("erie", "PA"): 250000,
}


def _are_metro_linked(city_a: str, state_a: str, city_b: str, state_b: str) -> bool:
    ca = (city_a or "").strip().lower()
    cb = (city_b or "").strip().lower()
    if not ca or not cb:
        return False
    if ca == cb and (not state_a or not state_b or state_a.upper() == state_b.upper()):
        return True
    for hub, aliases in METRO_ALIASES.items():
        hub_low = hub.lower()
        als_low = [a.lower() for a in aliases]
        cluster = {hub_low, *als_low}
        if ca in cluster and cb in cluster:
            return True
    return False


NICKNAME_FALLBACKS = [
    "Colonels", "Keystones", "Pioneers", "Zephyrs", "Monarchs", "Admirals",
    "Clippers", "Knights", "Express", "Captains", "Stars", "Barons",
    "Sounders", "Wanderers", "Centurions", "Voyagers", "Aviators", "foundry",
]


def _safe_float(val, default=0.0) -> float:
    try:
        if val is None or val == "" or (isinstance(val, float) and math.isnan(val)):
            return default
        return float(val)
    except Exception:
        return default


def _safe_int(val, default=0) -> int:
    try:
        if val is None or val == "" or (isinstance(val, float) and math.isnan(val)):
            return default
        return int(float(val))
    except Exception:
        return default


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    return cur.fetchone() is not None


def _compute_gini(values: list[float]) -> float:
    arr = sorted([float(x) for x in values if x and float(x) > 0])
    n = len(arr)
    if n < 2:
        return 0.0
    total = sum(arr)
    if total <= 0:
        return 0.0
    cum = 0.0
    for i, val in enumerate(arr, start=1):
        cum += i * val
    gini = (2.0 * cum) / (n * total) - (n + 1.0) / n
    return round(max(0.0, min(1.0, gini)), 3)


def _classify_region_bucket(state_abbr: str, nation_id: int, lat: float, lon: float, primary_states: set[str]) -> str:
    st = (state_abbr or "").strip().upper()
    if st and st in primary_states and len(primary_states) <= 2:
        return f"Primary State ({st})"
    if nation_id == 36 or st in ("ON", "QC", "BC", "AB", "MB", "NS", "SK", "NB"):
        return "Canada"
    if nation_id not in (206, 36, 0):
        return "Latin America / International"
    if st in ("PA", "NY", "NJ", "DE", "MD", "DC", "CT", "RI", "MA", "VT", "NH", "ME"):
        return "Northeast & Mid-Atlantic"
    if st in ("OH", "MI", "IN", "IL", "WI", "MN", "IA", "MO", "KS", "NE", "ND", "SD"):
        return "Midwest & Great Lakes"
    if st in ("VA", "WV", "NC", "SC", "GA", "FL", "KY", "TN", "AL", "MS", "LA", "AR"):
        return "South & Southeast"
    if st in ("TX", "OK", "NM", "AZ"):
        return "Texas & Southwest"
    if st in ("CA", "OR", "WA", "NV", "UT", "CO", "ID", "MT", "WY", "AK", "HI"):
        return "West & Pacific"
    if lon < -102:
        return "West & Pacific"
    if lat < 36.5:
        return "South & Southeast"
    return "Northeast & Mid-Atlantic"


def init_roadmap_table():
    conn = sqlite3.connect(HOST_DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS evolution_roadmaps (
            save_slug TEXT,
            league_id INTEGER,
            roadmap_json TEXT,
            updated_at TEXT,
            PRIMARY KEY (save_slug, league_id)
        )
        """
    )
    conn.commit()
    conn.close()


def get_saved_roadmap(save_slug: str, league_id: int) -> dict | None:
    init_roadmap_table()
    conn = sqlite3.connect(HOST_DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT roadmap_json, updated_at FROM evolution_roadmaps WHERE save_slug = ? AND league_id = ?",
        (save_slug, int(league_id or 200)),
    ).fetchone()
    conn.close()
    if row and row["roadmap_json"]:
        try:
            data = json.loads(row["roadmap_json"])
            data["updated_at"] = row["updated_at"]
            data["is_saved"] = True
            return data
        except Exception:
            return None
    return None


def save_custom_roadmap(save_slug: str, league_id: int, roadmap_payload: dict) -> dict:
    init_roadmap_table()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(HOST_DB_PATH)
    conn.execute(
        """
        INSERT OR REPLACE INTO evolution_roadmaps (save_slug, league_id, roadmap_json, updated_at)
        VALUES (?, ?, ?, ?)
        """,
        (save_slug, int(league_id or 200), json.dumps(roadmap_payload), now_str),
    )
    conn.commit()
    conn.close()
    return {"status": "ok", "save_slug": save_slug, "league_id": league_id, "updated_at": now_str}


def build_enhanced_evolution_analysis(
    conn: sqlite3.Connection,
    save_slug: str,
    lid: int,
    season_year: int,
    active_league: dict,
    leagues: list[dict],
    standings: list[dict],
    batters: list[dict],
    pitchers: list[dict],
    supp: dict,
    **kwargs,
) -> dict:
    """
    Computes deep League/Association Health Diagnostics, Expanded Structural Blueprints,
    Configurable Expansion Target City Recommendations (with Real-Life MLB/MiLB Counterparts),
    and the Interactive Roadmap Workshop state.
    """
    num_teams = max(1, len(standings))

    # =========================================================================
    # 1. ACTIVE TEAMS GEOGRAPHY & FOOTPRINT TELEMETRY
    # =========================================================================
    team_geo_map = {}
    if _table_exists(conn, "teams"):
        has_cities = _table_exists(conn, "cities")
        has_states = _table_exists(conn, "states")
        has_parks = _table_exists(conn, "parks")
        has_leagues_tbl = _table_exists(conn, "leagues")
        q_tgeo = f"""
        SELECT t.team_id, t.name, t.nickname, t.abbr, t.city_id, t.nation_id,
               t.league_id, t.level, t.parent_team_id,
               t.sub_league_id, t.division_id, t.background_color_id, t.logo_file_name
               {', c.name as city_name, c.latitude as c_lat, c.longitude as c_lon, c.population as c_pop, c.state_id' if has_cities else ''}
               {', s.name as state_name, s.abbreviation as state_abbr' if (has_cities and has_states) else ''}
               {', p.lat as p_lat, p.long as p_lon, p.name as park_name, p.capacity as park_cap' if has_parks else ''}
               {', l.abbr as lg_abbr, l.name as lg_name' if has_leagues_tbl else ''}
        FROM teams t
        {'LEFT JOIN cities c ON t.city_id = c.city_id' if has_cities else ''}
        {'LEFT JOIN states s ON c.state_id = s.state_id AND c.nation_id = s.nation_id' if (has_cities and has_states) else ''}
        {'LEFT JOIN parks p ON t.park_id = p.park_id' if has_parks else ''}
        {'LEFT JOIN leagues l ON t.league_id = l.league_id' if has_leagues_tbl else ''}
        WHERE t.allstar_team = 0
        """
        try:
            for r in conn.execute(q_tgeo):
                d = dict(r)
                tid = _safe_int(d.get("team_id"))
                lat = _safe_float(d.get("c_lat")) or _safe_float(d.get("p_lat")) or 39.95
                lon = _safe_float(d.get("c_lon")) or _safe_float(d.get("p_lon")) or -75.16
                t_name = (d.get("name") or "").strip()
                t_nick = (d.get("nickname") or "").strip()
                team_geo_map[tid] = {
                    "team_id": tid,
                    "name": t_name,
                    "nickname": t_nick,
                    "full_name": f"{t_name} {t_nick}".strip(),
                    "abbr": (d.get("abbr") or "").strip(),
                    "league_id": _safe_int(d.get("league_id")),
                    "league_abbr": (d.get("lg_abbr") or "").strip(),
                    "level": _safe_int(d.get("level"), 1),
                    "city_id": _safe_int(d.get("city_id")),
                    "city": d.get("city_name") or t_name or "City",
                    "state": d.get("state_abbr") or "",
                    "state_name": d.get("state_name") or "",
                    "nation_id": _safe_int(d.get("nation_id"), 206),
                    "lat": round(lat, 4),
                    "lon": round(lon, 4),
                    "population": _safe_int(d.get("c_pop"), 0),
                    "park_name": d.get("park_name") or "Ballpark",
                    "park_capacity": _safe_int(d.get("park_cap"), 35000),
                }
        except Exception:
            pass

    active_team_nodes = []
    primary_states_counts = {}
    existing_city_ids = set()
    existing_city_names = set()
    existing_city_state_keys = set()
    active_city_teams_map = {}
    standings_team_ids = {s["team_id"] for s in standings}
    sister_league_city_map = {}

    for tid_other, g_other in team_geo_map.items():
        if tid_other in standings_team_ids or g_other.get("league_id", 0) <= 0:
            continue
        ocid = g_other.get("city_id") or 0
        ocname = (g_other.get("city") or "").strip().lower()
        ost = (g_other.get("state") or "").strip().upper()
        lbl = f"{g_other['abbr']} ({g_other.get('league_abbr') or 'MiLB'})"
        if ocid > 0:
            sister_league_city_map.setdefault(("id", ocid), []).append(lbl)
        if ocname:
            sister_league_city_map.setdefault((ocname, ost), []).append(lbl)

    for s in standings:
        tid = s["team_id"]
        ginfo = team_geo_map.get(tid, {})
        lat = ginfo.get("lat", 39.95)
        lon = ginfo.get("lon", -75.16)
        st_abbr = (ginfo.get("state") or "").strip().upper()
        if st_abbr:
            primary_states_counts[st_abbr] = primary_states_counts.get(st_abbr, 0) + 1
        cid_val = ginfo.get("city_id") or 0
        if cid_val:
            existing_city_ids.add(cid_val)
            active_city_teams_map.setdefault(("id", cid_val), []).append(s["abbr"])
        cname = (ginfo.get("city") or s.get("name") or "").strip()
        if cname:
            existing_city_names.add(cname.lower())
            if st_abbr:
                existing_city_state_keys.add((cname.lower(), st_abbr))
                active_city_teams_map.setdefault((cname.lower(), st_abbr), []).append(s["abbr"])
            active_city_teams_map.setdefault(("name", cname.lower()), []).append(s["abbr"])
        if s.get("name"):
            tname_low = str(s["name"]).strip().lower()
            existing_city_names.add(tname_low)
            if tname_low not in (cname.lower() if cname else "",):
                active_city_teams_map.setdefault(("name", tname_low), []).append(s["abbr"])

        irl_match = lookup_irl_counterparts(
            city_id=ginfo.get("city_id", 0),
            city_name=cname,
            state_abbr=st_abbr,
            lat=lat,
            lon=lon,
        )
        active_team_nodes.append({
            "team_id": tid,
            "full_name": s["full_name"],
            "name": s.get("name", ""),
            "nickname": s.get("nickname", ""),
            "abbr": s["abbr"],
            "logo_file_name": s.get("logo_file_name", ""),
            "bg_color": s.get("bg_color", "#38bdf8"),
            "sub_league_id": s.get("sub_league_id", 0),
            "sub_league_name": s.get("sub_league_name", "League"),
            "division_id": s.get("division_id", 0),
            "division_name": s.get("division_name", "Division"),
            "city_id": ginfo.get("city_id", 0),
            "city": cname,
            "state": st_abbr,
            "state_name": ginfo.get("state_name", ""),
            "lat": lat,
            "lon": lon,
            "population": ginfo.get("population", 0),
            "park_name": ginfo.get("park_name") or s.get("park", {}).get("name", "Ballpark"),
            "park_capacity": ginfo.get("park_capacity") or s.get("park", {}).get("capacity") or 35000,
            "w": s.get("w", 0),
            "l": s.get("l", 0),
            "pct": s.get("pct", 0.500),
            "total_war": s.get("total_war", 0.0),
            "payroll": s.get("payroll", 0.0),
            "budget": s.get("budget", 0.0),
            "attendance": s.get("attendance", 0),
            "fan_interest": s.get("fan_interest", 50),
            "irl_counterpart": irl_match.get("summary_badge", ""),
        })

    # Compute Centroid, Bounding Span, Pairwise Distances & Rivalry Pairs
    valid_coords = [(n["lat"], n["lon"]) for n in active_team_nodes if n["lat"] and n["lon"]]
    centroid_lat = round(float(np.mean([c[0] for c in valid_coords])), 4) if valid_coords else 39.95
    centroid_lon = round(float(np.mean([c[1] for c in valid_coords])), 4) if valid_coords else -77.50

    min_lat = min((c[0] for c in valid_coords), default=35.0)
    max_lat = max((c[0] for c in valid_coords), default=43.0)
    min_lon = min((c[1] for c in valid_coords), default=-85.0)
    max_lon = max((c[1] for c in valid_coords), default=-71.0)
    ns_span_miles = round(haversine_miles(min_lat, centroid_lon, max_lat, centroid_lon), 0)
    ew_span_miles = round(haversine_miles(centroid_lat, min_lon, centroid_lat, max_lon), 0)

    all_pair_dists = []
    intra_div_dists = []
    closest_pair = {"pair": "N/A", "label": "N/A", "miles": 9999.0}
    longest_pair = {"pair": "N/A", "label": "N/A", "miles": 0.0}

    for i, t1 in enumerate(active_team_nodes):
        dists_from_t1 = []
        div_dists_from_t1 = []
        nearest_other = None
        nearest_mi = 9999.0
        for j, t2 in enumerate(active_team_nodes):
            if i == j:
                continue
            d_mi = haversine_miles(t1["lat"], t1["lon"], t2["lat"], t2["lon"])
            dists_from_t1.append(d_mi)
            if t1["sub_league_id"] == t2["sub_league_id"] and t1["division_id"] == t2["division_id"]:
                div_dists_from_t1.append(d_mi)
            if d_mi < nearest_mi:
                nearest_mi = d_mi
                nearest_other = t2
            if i < j:
                all_pair_dists.append(d_mi)
                if t1["sub_league_id"] == t2["sub_league_id"] and t1["division_id"] == t2["division_id"]:
                    intra_div_dists.append(d_mi)
                pair_lbl = f"{t1['abbr']} ({t1['city']}) ↔ {t2['abbr']} ({t2['city']})"
                if d_mi < closest_pair["miles"]:
                    closest_pair = {
                        "pair": pair_lbl,
                        "label": pair_lbl,
                        "miles": round(d_mi, 1),
                    }
                if d_mi >= longest_pair["miles"]:
                    longest_pair = {
                        "pair": pair_lbl,
                        "label": pair_lbl,
                        "miles": round(d_mi, 1),
                    }
        avg_lg_mi = round(float(np.mean(dists_from_t1)), 1) if dists_from_t1 else 0.0
        avg_dv_mi = round(float(np.mean(div_dists_from_t1)), 1) if div_dists_from_t1 else avg_lg_mi
        t1["nearest_rival_abbr"] = nearest_other["abbr"] if nearest_other else "-"
        t1["nearest_rival_name"] = nearest_other["full_name"] if nearest_other else "-"
        t1["nearest_rival_miles"] = round(nearest_mi, 1) if nearest_other else 0.0
        t1["avg_div_miles"] = avg_dv_mi
        t1["avg_league_miles"] = avg_lg_mi
        t1["avg_dist_to_league_miles"] = avg_lg_mi
        t1["dist_to_centroid_miles"] = round(haversine_miles(t1["lat"], t1["lon"], centroid_lat, centroid_lon), 1)

    if closest_pair["miles"] >= 9999.0:
        closest_pair["miles"] = 0.0
    avg_inter_team_miles = round(float(np.mean(all_pair_dists)), 1) if all_pair_dists else 0.0
    avg_intra_div_miles = round(float(np.mean(intra_div_dists)), 1) if intra_div_dists else avg_inter_team_miles
    most_isolated = max(active_team_nodes, key=lambda x: x["avg_dist_to_league_miles"]) if active_team_nodes else None

    # =========================================================================
    # 2. ENHANCED TALENT POOL DIAGNOSTICS (Positional Supply, Tiers, Age, FA Pool)
    # =========================================================================
    pos_Order = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SP", "RP"]
    pos_labels = {
        "C": "Catcher",
        "1B": "First Base",
        "2B": "Second Base",
        "3B": "Third Base",
        "SS": "Shortstop",
        "LF": "Left Field",
        "CF": "Center Field",
        "RF": "Right Field",
        "DH": "Designated Hitter",
        "SP": "Starting Pitcher",
        "RP": "Relief Pitcher",
    }
    pos_buckets = {p: [] for p in pos_Order}
    seen_active_pids = set()

    for b in batters:
        pid = _safe_int(b.get("player_id"))
        if pid > 0:
            seen_active_pids.add(pid)
        pcode = b.get("position", "DH")
        if pcode not in pos_buckets or pcode == "P":
            pcode = "DH"
        pos_buckets[pcode].append(b)
    for p in pitchers:
        pid = _safe_int(p.get("player_id"))
        if pid > 0:
            seen_active_pids.add(pid)
        role = p.get("role", "RP")
        pcode = "SP" if role == "SP" else "RP"
        pos_buckets[pcode].append(p)

    # Supplement with any unretired rostered players on active clubs who have 0 PA/IP so far (e.g. Opening Day / Offseason)
    active_team_abbr_map = {s["team_id"]: s["abbr"] for s in standings}
    extra_rostered_players = []
    if _table_exists(conn, "players") and _table_exists(conn, "players_value") and active_team_abbr_map:
        try:
            q_rost = """
            SELECT p.player_id, p.first_name, p.last_name, p.age, p.position, p.role, p.team_id,
                   v.oa, v.pot
            FROM players p
            JOIN players_value v ON p.player_id = v.player_id
            WHERE p.retired = 0 AND p.team_id > 0 AND (p.league_id = ? OR p.league_id = 0)
            """
            for r in conn.execute(q_rost, (lid,)):
                pid = _safe_int(r["player_id"])
                tid = _safe_int(r["team_id"])
                if pid in seen_active_pids or tid not in active_team_abbr_map:
                    continue
                seen_active_pids.add(pid)
                pos_id = _safe_int(r["position"], 10)
                role_id = _safe_int(r["role"], 12)
                if pos_id == 1:
                    pcode = "SP" if role_id == 11 else "RP"
                else:
                    pcode = POSITIONS.get(pos_id, "DH")
                    if pcode not in pos_buckets or pcode == "P":
                        pcode = "DH"
                p_obj = {
                    "player_id": pid,
                    "name": f"{r['first_name']} {r['last_name']}".strip(),
                    "age": _safe_int(r["age"], 26),
                    "position": pcode,
                    "role": pcode if pos_id == 1 else "",
                    "team_id": tid,
                    "team_abbr": active_team_abbr_map.get(tid, ""),
                    "oa": _safe_int(r["oa"], 40),
                    "pot": _safe_int(r["pot"], 45),
                    "war": 0.0,
                }
                pos_buckets[pcode].append(p_obj)
                extra_rostered_players.append(p_obj)
        except Exception:
            pass

    # U-24 Prospects by Position from players + players_value
    prospect_by_pos = {p: 0 for p in pos_Order}
    free_agents_summary = {
        "total_unsigned": 0,
        "total_free_agents": 0,
        "ready_regulars_45plus": 0,
        "viable_fa_45plus": 0,
        "replacement_buffer_38plus": 0,
        "star_fa_55plus": 0,
        "prospect_fa_pot50": 0,
        "expansion_rosters_fillable": 0.0,
        "top_free_agents": [],
    }

    if _table_exists(conn, "players") and _table_exists(conn, "players_value"):
        try:
            for r in conn.execute(
                """
                SELECT p.position, p.role, COUNT(*) as cnt
                FROM players p
                JOIN players_value v ON p.player_id = v.player_id
                WHERE p.retired = 0 AND p.age <= 24 AND v.pot >= 45
                GROUP BY p.position, p.role
                """
            ):
                pos_id = _safe_int(r["position"], 1)
                role_id = _safe_int(r["role"], 12)
                if pos_id == 1:
                    pcode = "SP" if role_id == 11 else "RP"
                else:
                    pcode = POSITIONS.get(pos_id, "DH")
                    if pcode not in prospect_by_pos:
                        pcode = "DH"
                prospect_by_pos[pcode] = prospect_by_pos.get(pcode, 0) + _safe_int(r["cnt"])
        except Exception:
            pass

        # Free Agent Pool Analysis
        try:
            fa_rows = conn.execute(
                """
                SELECT p.player_id, p.first_name, p.last_name, p.age, p.position, p.role,
                       v.oa, v.pot, v.overall_value, v.talent_value
                FROM players p
                JOIN players_value v ON p.player_id = v.player_id
                WHERE p.retired = 0 AND (p.free_agent = 1 OR p.team_id = 0)
                ORDER BY v.oa DESC, v.pot DESC
                """
            ).fetchall()
            total_fa = len(fa_rows)
            viable_fa = sum(1 for r in fa_rows if _safe_int(r["oa"]) >= 45)
            repl_fa_38 = sum(1 for r in fa_rows if _safe_int(r["oa"]) >= 38)
            star_fa = sum(1 for r in fa_rows if _safe_int(r["oa"]) >= 55)
            pros_fa = sum(1 for r in fa_rows if _safe_int(r["age"]) <= 24 and _safe_int(r["pot"]) >= 50)
            top_fa_list = []
            for r in fa_rows[:12]:
                pos_id = _safe_int(r["position"], 1)
                role_id = _safe_int(r["role"], 12)
                pcode = ("SP" if role_id == 11 else "RP") if pos_id == 1 else POSITIONS.get(pos_id, "DH")
                top_fa_list.append({
                    "player_id": _safe_int(r["player_id"]),
                    "name": f"{r['first_name']} {r['last_name']}".strip(),
                    "age": _safe_int(r["age"]),
                    "pos": pcode,
                    "position": pcode,
                    "oa": _safe_int(r["oa"]),
                    "pot": _safe_int(r["pot"]),
                })
            free_agents_summary = {
                "total_unsigned": total_fa,
                "total_free_agents": total_fa,
                "ready_regulars_45plus": viable_fa,
                "viable_fa_45plus": viable_fa,
                "replacement_buffer_38plus": repl_fa_38,
                "star_fa_55plus": star_fa,
                "prospect_fa_pot50": pros_fa,
                "expansion_rosters_fillable": round(viable_fa / 14.0, 1),
                "top_free_agents": top_fa_list,
            }
        except Exception:
            pass

    positional_supply = []
    bottleneck_positions = []
    surplus_positions = []

    for pcode in pos_Order:
        plist = pos_buckets.get(pcode, [])
        is_pit = pcode in ("SP", "RP")
        war_thresh = 1.0 if is_pit else 1.2
        star_war_thresh = 3.2 if is_pit else 3.5

        regs = [x for x in plist if _safe_int(x.get("oa")) >= 45 or _safe_float(x.get("war")) >= war_thresh]
        stars = [x for x in plist if _safe_int(x.get("oa")) >= 60 or _safe_float(x.get("war")) >= star_war_thresh]
        repl = [x for x in plist if 35 <= _safe_int(x.get("oa")) < 45 and x not in regs]
        pros_cnt = prospect_by_pos.get(pcode, 0)

        ideal_per_tm = 4.2 if pcode == "SP" else (5.0 if pcode == "RP" else 1.25)
        regs_per_tm = round(len(regs) / num_teams, 2)
        surplus_ratio = round(regs_per_tm / max(0.1, ideal_per_tm), 2)
        depth_ratio_pct = int(round(surplus_ratio * 100))

        top_by_war = sorted(plist, key=lambda x: (_safe_float(x.get("war")), _safe_int(x.get("oa"))), reverse=True)
        top_by_oa = sorted([x for x in plist if _safe_int(x.get("oa")) > 0], key=lambda x: (_safe_int(x.get("oa")), _safe_float(x.get("war"))), reverse=True)
        avg_ovr = round(float(np.mean([_safe_int(x.get("oa"), 45) for x in top_by_oa[: max(1, num_teams)]])), 1) if top_by_oa else 45.0
        avg_war = round(float(np.mean([_safe_float(x.get("war"), 0.0) for x in top_by_war[: max(1, num_teams)]])), 2) if top_by_war else 0.0
        best_p = top_by_war[0] if top_by_war else None

        if best_p:
            tm_tag = best_p.get("team_abbr") or ""
            w_val = _safe_float(best_p.get("war"))
            if w_val > 0 and tm_tag:
                top_player_disp = f"{best_p['name']} ({tm_tag} · {w_val:.1f}W)"
            elif tm_tag:
                top_player_disp = f"{best_p['name']} ({tm_tag} · OVR {_safe_int(best_p.get('oa'))})"
            else:
                top_player_disp = best_p["name"]
        else:
            top_player_disp = "-"

        if surplus_ratio >= 1.15:
            status = "Surplus"
            status_detail = "Surplus (Expansion Ready)"
            status_color = "#10b981"
            surplus_positions.append(pcode)
        elif surplus_ratio >= 0.88:
            status = "Healthy"
            status_detail = "Balanced Supply"
            status_color = "#38bdf8"
        elif surplus_ratio >= 0.68:
            status = "Bottleneck"
            status_detail = "Tight Supply"
            status_color = "#f59e0b"
            bottleneck_positions.append(pcode)
        else:
            status = "Bottleneck"
            status_detail = "Thin / Bottleneck"
            status_color = "#f43f5e"
            bottleneck_positions.append(pcode)

        positional_supply.append({
            "position": pcode,
            "label": pos_labels.get(pcode, pcode),
            "total_active": len(plist),
            "active_count": len(plist),
            "regular_count": len(regs),
            "regulars_45plus": len(regs),
            "star_count": len(stars),
            "stars_60plus": len(stars),
            "replacement_35_44": len(repl),
            "prospect_count": pros_cnt,
            "prospects_u24": pros_cnt,
            "regulars_per_team": regs_per_tm,
            "target_per_team": ideal_per_tm,
            "ideal_per_team": ideal_per_tm,
            "surplus_ratio": surplus_ratio,
            "depth_ratio_pct": depth_ratio_pct,
            "avg_oa": avg_ovr,
            "avg_starter_ovr": avg_ovr,
            "avg_starter_war": avg_war,
            "top_player": top_player_disp,
            "top_player_name": best_p["name"] if best_p else "-",
            "top_player_id": best_p["player_id"] if best_p else 0,
            "top_player_war": round(_safe_float(best_p.get("war")), 1) if best_p else 0.0,
            "status": status,
            "status_detail": status_detail,
            "status_color": status_color,
        })

    # Rating Tier Distribution & Age Curve across active league players
    all_active_players = batters + pitchers + extra_rostered_players
    tier_defs = [
        ("80 Elite (75–80)", 75, 100, "#dbdbdb"),
        ("70 All-Star (65–74)", 65, 74, "#10b981"),
        ("60 Plus Regular (55–64)", 55, 64, "#84cc16"),
        ("50 Solid Regular (48–54)", 48, 54, "#eab308"),
        ("45 Role / Fringe (42–47)", 42, 47, "#f97316"),
        ("40 Replacement (35–41)", 35, 41, "#64748b"),
        ("Org Depth (<35)", 0, 34, "#475569"),
    ]
    total_ap = max(1, len(all_active_players))
    rating_distribution = []
    for label, lo, hi, col in tier_defs:
        ovr_cnt = sum(1 for x in all_active_players if lo <= _safe_int(x.get("oa"), 20) <= hi)
        pot_cnt = sum(1 for x in all_active_players if lo <= _safe_int(x.get("pot"), 20) <= hi)
        ovr_pct_val = round((ovr_cnt / total_ap) * 100.0, 1)
        per_tm_val = round(ovr_cnt / num_teams, 1)
        rating_distribution.append({
            "tier": label,
            "color": col,
            "count": ovr_cnt,
            "ovr_count": ovr_cnt,
            "pot_count": pot_cnt,
            "pct": ovr_pct_val,
            "ovr_pct": ovr_pct_val,
            "pot_pct": round((pot_cnt / total_ap) * 100.0, 1),
            "per_team": per_tm_val,
            "per_team_ovr": per_tm_val,
        })

    age_defs = [
        ("U-23 Rookie / Prospect", 0, 23, "#a855f7"),
        ("24–26 Pre-Prime Ascension", 24, 26, "#10b981"),
        ("27–29 Peak Prime Core", 27, 29, "#38bdf8"),
        ("30–33 Veteran Core", 30, 33, "#f59e0b"),
        ("34+ Twilight / Mentor", 34, 99, "#f43f5e"),
    ]
    age_curve = []
    for label, alo, ahi, col in age_defs:
        sub_p = [x for x in all_active_players if alo <= _safe_int(x.get("age"), 27) <= ahi]
        cnt = len(sub_p)
        age_curve.append({
            "bracket": label,
            "color": col,
            "count": cnt,
            "pct": round((cnt / total_ap) * 100.0, 1),
            "avg_ovr": round(float(np.mean([_safe_int(x.get("oa"), 45) for x in sub_p])), 1) if sub_p else 0.0,
            "avg_pot": round(float(np.mean([_safe_int(x.get("pot"), 45) for x in sub_p])), 1) if sub_p else 0.0,
            "total_war": round(sum(_safe_float(x.get("war"), 0.0) for x in sub_p), 1),
        })

    # =========================================================================
    # 3. FINANCIAL IMPACTS & MACRO-ECONOMICS ANALYSIS
    # =========================================================================
    tf_map = {}
    if _table_exists(conn, "team_financials"):
        for r in conn.execute("SELECT * FROM team_financials"):
            d = dict(r)
            tf_map[_safe_int(d.get("team_id"))] = d

    club_financials = []
    tot_rev = tot_gate = tot_st_rev = tot_media = tot_loc_media = tot_nat_media = tot_merch = 0.0
    tot_exp = tot_payroll = tot_staff = tot_scout = tot_dev = tot_intl = 0.0

    for s in standings:
        tid = s["team_id"]
        tf = tf_map.get(tid, {})
        ginfo = team_geo_map.get(tid, {})
        budget = _safe_float(tf.get("budget") or s.get("budget"), 0.0)
        payroll = _safe_float(tf.get("player_payroll") or tf.get("player_expenses") or s.get("payroll"), 0.0)
        next_payroll = _safe_float(tf.get("player_payroll_next_season"), payroll * 0.82)
        gate_rev = _safe_float(tf.get("gate_revenue"), 0.0)
        st_rev = _safe_float(tf.get("season_ticket_revenue"), 0.0)
        loc_med = _safe_float(tf.get("local_media_contract"), 0.0)
        nat_med = _safe_float(tf.get("national_media_contract"), 0.0)
        med_rev = _safe_float(tf.get("media_revenue"), loc_med + nat_med)
        merch_rev = _safe_float(tf.get("merchandising_revenue"), 0.0)
        rev_share = _safe_float(tf.get("revenue_sharing"), 0.0)
        tot_r = _safe_float(tf.get("total_revenue"), gate_rev + st_rev + med_rev + merch_rev)
        if tot_r <= 0 and budget > 0:
            tot_r = budget * 0.96

        staff_exp = _safe_float(tf.get("staff_expenses"), 0.0)
        scout_bud = _safe_float(tf.get("scouting_budget"), 0.0)
        dev_bud = _safe_float(tf.get("development_budget"), 0.0)
        intl_bud = _safe_float(tf.get("intl_fa_budget"), 0.0)
        tot_e = _safe_float(tf.get("total_expenses"), payroll + staff_exp + scout_bud + dev_bud)
        op_margin = tot_r - tot_e
        cash = _safe_float(tf.get("cash") or s.get("cash"), 0.0)
        mkt_size = _safe_int(tf.get("market"), 5)
        fan_int = _safe_int(tf.get("fan_interest_visible") or tf.get("fan_interest") or s.get("fan_interest"), 50)
        fan_loy = _safe_int(tf.get("fan_loyalty"), 5)
        att = _safe_int(tf.get("attendance") or s.get("attendance"), 0)
        st_cnt = _safe_int(tf.get("season_tickets"), 0)
        t_price = round(_safe_float(tf.get("ticket_price") or s.get("ticket_price"), 25.0), 2)
        cap_pct = round((payroll / max(1.0, budget)) * 100.0, 1) if budget > 0 else 0.0
        war_val = max(0.5, _safe_float(s.get("total_war"), 10.0))
        wins_val = max(1, _safe_int(s.get("w"), 1))
        dollars_per_war = round(payroll / war_val, 0) if payroll > 0 else 0.0
        dollars_per_win = round(payroll / wins_val, 0) if payroll > 0 else 0.0

        tot_rev += tot_r
        tot_gate += gate_rev
        tot_st_rev += st_rev
        tot_media += med_rev
        tot_loc_media += loc_med
        tot_nat_media += nat_med
        tot_merch += merch_rev
        tot_exp += tot_e
        tot_payroll += payroll
        tot_staff += staff_exp
        tot_scout += scout_bud
        tot_dev += dev_bud
        tot_intl += intl_bud

        if op_margin >= 0 and cap_pct <= 82 and mkt_size >= 6:
            h_tier = "Dynasty / Contender"
            h_col = "#10b981"
        elif op_margin >= -2000000 and cap_pct <= 92:
            h_tier = "Healthy & Sustainable"
            h_col = "#38bdf8"
        elif cap_pct > 92:
            h_tier = "Strained Cap (>92%)"
            h_col = "#f59e0b"
        else:
            h_tier = "Distressed / Deficit"
            h_col = "#f43f5e"

        club_financials.append({
            "team_id": tid,
            "full_name": s["full_name"],
            "abbr": s["abbr"],
            "city": ginfo.get("city") or s.get("name") or "",
            "state": ginfo.get("state") or "USA",
            "logo_file_name": s.get("logo_file_name", ""),
            "w": s.get("w", 0),
            "l": s.get("l", 0),
            "pct": s.get("pct", 0.500),
            "total_war": s.get("total_war", 0.0),
            "market_size": mkt_size,
            "fan_interest": fan_int,
            "fan_loyalty": fan_loy,
            "budget": round(budget, 0),
            "payroll": round(payroll, 0),
            "payroll_next_season": round(next_payroll, 0),
            "cap_space": round(max(0.0, budget - payroll), 0),
            "cap_pct": cap_pct,
            "cap_utilization_pct": cap_pct,
            "total_revenue": round(tot_r, 0),
            "gate_revenue": round(gate_rev + st_rev, 0),
            "media_revenue": round(med_rev, 0),
            "merch_revenue": round(merch_rev, 0),
            "revenue_sharing": round(rev_share, 0),
            "total_expenses": round(tot_e, 0),
            "operating_margin": round(op_margin, 0),
            "scouting_dev_spend": round(scout_bud + dev_bud, 0),
            "cash": round(cash, 0),
            "attendance": att,
            "season_tickets": st_cnt,
            "ticket_price": t_price,
            "dollars_per_war": dollars_per_war,
            "dollars_per_win": dollars_per_win,
            "health_tier": h_tier,
            "health_color": h_col,
        })

    club_financials.sort(key=lambda x: x["budget"], reverse=True)

    payrolls_nz = [c["payroll"] for c in club_financials if c["payroll"] > 0]
    budgets_nz = [c["budget"] for c in club_financials if c["budget"] > 0]
    revs_nz = [c["total_revenue"] for c in club_financials if c["total_revenue"] > 0]

    payroll_gini = _compute_gini(payrolls_nz)
    budget_gini = _compute_gini(budgets_nz)
    revenue_gini = _compute_gini(revs_nz)

    sorted_pay = sorted(payrolls_nz, reverse=True)
    q_cnt = max(1, len(sorted_pay) // 4)
    top_q_avg = float(np.mean(sorted_pay[:q_cnt])) if sorted_pay else 1.0
    bot_q_avg = float(np.mean(sorted_pay[-q_cnt:])) if sorted_pay else 1.0
    top_bot_ratio = round(top_q_avg / max(1.0, bot_q_avg), 2)

    # Payroll vs Win% correlation
    if len(club_financials) >= 4 and any(c["payroll"] > 0 for c in club_financials):
        try:
            p_arr = np.array([c["payroll"] for c in club_financials], dtype=float)
            w_arr = np.array([c["pct"] for c in club_financials], dtype=float)
            if np.std(p_arr) > 0 and np.std(w_arr) > 0:
                pay_win_corr = round(float(np.corrcoef(p_arr, w_arr)[0, 1]), 3)
            else:
                pay_win_corr = 0.0
        except Exception:
            pay_win_corr = 0.0
    else:
        pay_win_corr = 0.0

    avg_bud_val = round(float(np.mean(budgets_nz)), 0) if budgets_nz else 150000000.0
    avg_pay_val = round(float(np.mean(payrolls_nz)), 0) if payrolls_nz else 115000000.0

    # =========================================================================
    # 4. WORLD INFORMATION, RULES & DEMOGRAPHICS
    # =========================================================================
    lg_raw = {}
    if _table_exists(conn, "leagues"):
        row_l = conn.execute("SELECT * FROM leagues WHERE league_id = ? LIMIT 1", (lid,)).fetchone()
        if not row_l:
            row_l = conn.execute("SELECT * FROM leagues LIMIT 1").fetchone()
        if row_l:
            lg_raw = dict(row_l)

    active_roster_lim = _safe_int(lg_raw.get("rules_active_roster_limit"), 26)
    expanded_roster_lim = _safe_int(lg_raw.get("rules_expanded_roster_limit"), 28)

    # Expansion Economic Impact Simulator (+2, +4, +6 Teams)
    est_franchise_fee = round(max(2500000.0, avg_bud_val * 1.25), 0)
    expansion_econ_models = []
    for add_k, label in [(2, "+2 Expansion Franchises"), (4, "+4 Wave Expansion"), (6, "+6 Mega-Expansion / Tier 2")]:
        fee_pool = est_franchise_fee * add_k
        per_club_windfall = round(fee_pool / num_teams, 0)
        new_payroll_cap = round(avg_pay_val * 0.88 * add_k, 0)
        new_media_uplift = round((max(tot_media, avg_bud_val * num_teams * 0.35) / num_teams) * 0.92 * add_k, 0)
        proj_nat_media_pool = round(tot_nat_media + new_media_uplift, 0)
        fa_inflation_pct = round((add_k / num_teams) * 14.5, 1)
        expansion_econ_models.append({
            "added_teams": add_k,
            "new_total_teams": num_teams + add_k,
            "target_teams": num_teams + add_k,
            "label": label,
            "est_franchise_fee_each": est_franchise_fee,
            "total_expansion_fee_pool": fee_pool,
            "windfall_per_existing_club": per_club_windfall,
            "new_active_roster_spots": add_k * active_roster_lim,
            "new_reserve_spots": add_k * 65,
            "new_payroll_injected": new_payroll_cap,
            "projected_media_uplift": new_media_uplift,
            "projected_national_media_pool": proj_nat_media_pool,
            "fa_salary_inflation_pct": fa_inflation_pct,
            "projected_fa_inflation_pct": fa_inflation_pct,
            "net_financial_verdict": "Accretive Windfall" if add_k <= 2 else ("Balanced Growth" if add_k == 4 else "High FA Inflation"),
        })

    # Check World Population Scale (Ashes vs Standard)
    max_us_city_pop = 0
    if _table_exists(conn, "cities"):
        try:
            r_mp = conn.execute("SELECT MAX(CAST(population AS INTEGER)) FROM cities WHERE CAST(nation_id AS INTEGER) = 206").fetchone()
            max_us_city_pop = _safe_int(r_mp[0]) if r_mp else 0
        except Exception:
            pass

    total_world_players = len(all_active_players)
    if _table_exists(conn, "players"):
        try:
            total_world_players = _safe_int(conn.execute("SELECT COUNT(*) FROM players WHERE retired = 0").fetchone()[0]) or total_world_players
        except Exception:
            pass

    total_world_teams = num_teams
    if _table_exists(conn, "teams"):
        try:
            total_world_teams = _safe_int(conn.execute("SELECT COUNT(*) FROM teams WHERE allstar_team = 0").fetchone()[0]) or num_teams
        except Exception:
            pass

    json_configs = supp.get("json_configs", {})
    has_ashes_json = "ashes_universe_state.json" in json_configs or "PABL_settings.json" in json_configs
    is_ashes_world = (0 < max_us_city_pop < 250000) or has_ashes_json
    us_pop_multiplier = round(8336000.0 / max(1, max_us_city_pop), 1) if is_ashes_world and max_us_city_pop > 0 else 1.0

    if is_ashes_world:
        world_mode = "Ashes / Post-Cataclysm Custom Population Universe"
        world_mode_badge = "ASHES / CUSTOM POP SCALE"
    elif len(leagues) > 1:
        world_mode = f"Multi-League Baseball Ecosystem ({len(leagues)} Active Leagues)"
        world_mode_badge = "MULTI-LEAGUE ECOSYSTEM"
    else:
        world_mode = "Standard OOTP Baseball Universe"
        world_mode_badge = "STANDARD WORLD DB"

    rev_share_on = bool(_safe_int(lg_raw.get("rules_revenue_sharing"), 1))
    rev_share_tax = _safe_int(lg_raw.get("rules_revenue_sharing_tax"), 0)
    lux_on = bool(_safe_int(lg_raw.get("rules_luxury_sharing"), 0))
    lux_cap = _safe_int(lg_raw.get("rules_luxury_sharing_cap"), 140)
    lux_rate = _safe_int(lg_raw.get("rules_luxury_tax"), 20)

    c_con = round(_safe_float(lg_raw.get("player_creation_modifier_contact"), 1.0), 3)
    c_gap = round(_safe_float(lg_raw.get("player_creation_modifier_gap"), 1.0), 3)
    c_pow = round(_safe_float(lg_raw.get("player_creation_modifier_power"), 1.0), 3)
    c_eye = round(_safe_float(lg_raw.get("player_creation_modifier_eye"), 1.0), 3)
    c_k = round(_safe_float(lg_raw.get("player_creation_modifier_strikeouts"), 1.0), 3)
    c_stf = round(_safe_float(lg_raw.get("player_creation_modifier_stuff"), 1.0), 3)
    c_mov = round(_safe_float(lg_raw.get("player_creation_modifier_movement"), 1.0), 3)
    c_ctl = round(_safe_float(lg_raw.get("player_creation_modifier_control"), 1.0), 3)

    league_rules_summary = {
        "world_mode": world_mode,
        "world_mode_badge": world_mode_badge,
        "is_ashes_world": is_ashes_world,
        "max_us_city_pop": max_us_city_pop,
        "world_start_year": _safe_int(lg_raw.get("world_start_year"), season_year),
        "season_year": season_year,
        "seasons_elapsed": max(1, season_year - _safe_int(lg_raw.get("world_start_year"), season_year) + 1),
        "current_date": lg_raw.get("current_date") or active_league.get("current_date") or f"{season_year}-06-01",
        "start_date": lg_raw.get("start_date") or f"{season_year}-04-01",
        "reputation": _safe_int(lg_raw.get("reputation"), 10),
        "league_level": _safe_int(lg_raw.get("league_level"), 1),
        "active_roster_limit": active_roster_lim,
        "expanded_roster_limit": expanded_roster_lim,
        "schedule_games_per_team": _safe_int(lg_raw.get("rules_schedule_games_per_team"), 162),
        "typical_series_games": _safe_int(lg_raw.get("rules_schedule_typical_series"), 3),
        "dh_rule": "Universal DH",
        "amateur_draft_rounds": _safe_int(lg_raw.get("rules_amateur_draft_rounds"), 20),
        "rule_5_draft": bool(_safe_int(lg_raw.get("rules_rule_5"), 1)),
        "trading_enabled": bool(_safe_int(lg_raw.get("rules_trading"), 1)),
        "fa_minimum_years": _safe_int(lg_raw.get("rules_fa_minimum_years"), 6),
        "arb_minimum_years": _safe_int(lg_raw.get("rules_salary_arbitration_minimum_years"), 3),
        "min_service_days": _safe_int(lg_raw.get("rules_min_service_days"), 172),
        "minimum_salary": _safe_int(lg_raw.get("rules_minimum_salary"), 740000),
        "salary_cap": _safe_int(lg_raw.get("rules_salary_cap"), 0),
        "superstar_salary": _safe_int(lg_raw.get("rules_player_salary7"), 35000000),
        "star_salary": _safe_int(lg_raw.get("rules_player_salary6"), 25000000),
        "good_salary": _safe_int(lg_raw.get("rules_player_salary5"), 18000000),
        "avg_regular_salary": _safe_int(lg_raw.get("rules_player_salary4"), 12000000),
        "revenue_sharing_enabled": rev_share_on,
        "revenue_sharing_tax_pct": rev_share_tax,
        "revenue_sharing": f"Enabled ({rev_share_tax}%)" if (rev_share_on and rev_share_tax > 0) else ("Enabled" if rev_share_on else "Disabled"),
        "luxury_tax_enabled": lux_on,
        "luxury_cap_pct": lux_cap,
        "luxury_tax_rate_pct": lux_rate,
        "luxury_tax": f"{lux_cap}% Cap ({lux_rate}% Tax)" if lux_on else "Disabled",
        "national_media_baseline": _safe_int(lg_raw.get("rules_average_national_media_contract"), 50000000),
        "avg_attendance_baseline": _safe_int(lg_raw.get("rules_average_attendance"), 28000),
        "avg_ticket_price_baseline": round(_safe_float(lg_raw.get("rules_average_ticket_price"), 35.0), 2),
        "financial_coefficient": round(_safe_float(lg_raw.get("financial_coefficient"), 1.0), 3),
        "calendar_dates": {
            "Opening Day": lg_raw.get("start_date", "-"),
            "Intl FA Signing": lg_raw.get("international_fa_date", "-"),
            "Trade Deadline": lg_raw.get("trade_deadline_date", "-"),
            "Amateur Draft": lg_raw.get("draft_date", "-"),
            "All-Star Break": lg_raw.get("allstar_date", "-"),
            "Roster Expansion": lg_raw.get("roster_expand_date", "-"),
            "Rule 5 Draft": lg_raw.get("rule_5_draft_date", "-"),
        },
        "creation_modifiers": {
            "contact": c_con,
            "gap": c_gap,
            "power": c_pow,
            "eye": c_eye,
            "strikeouts": c_k,
            "stuff": c_stf,
            "movement": c_mov,
            "control": c_ctl,
            "Contact": c_con,
            "Gap Power": c_gap,
            "Home Run Power": c_pow,
            "Eye / Discipline": c_eye,
            "Avoid K": c_k,
            "Stuff": c_stf,
            "Movement": c_mov,
            "Control": c_ctl,
        },
    }

    # Player Nationality & Birth State Breakdown
    top_nations = []
    top_birth_states = []
    if _table_exists(conn, "players"):
        try:
            tot_unretired = max(
                1,
                _safe_int(conn.execute("SELECT COUNT(*) FROM players WHERE retired = 0").fetchone()[0]),
            )
            if _table_exists(conn, "nations"):
                q_nat = """
                SELECT n.nation_id, n.name, n.abbreviation, n.baseball_quality,
                       COUNT(p.player_id) as cnt,
                       AVG(v.oa) as avg_oa,
                       AVG(v.pot) as avg_pot
                FROM players p
                LEFT JOIN nations n ON p.nation_id = n.nation_id
                LEFT JOIN players_value v ON p.player_id = v.player_id
                WHERE p.retired = 0
                GROUP BY p.nation_id
                ORDER BY cnt DESC
                LIMIT 12
                """
                for r in conn.execute(q_nat):
                    d = dict(r)
                    cnt = _safe_int(d.get("cnt"))
                    pct_val = round((cnt / tot_unretired) * 100.0, 1)
                    n_name = d.get("name") or "Unknown Nation"
                    top_nations.append({
                        "nation_id": _safe_int(d.get("nation_id")),
                        "nation": n_name,
                        "name": n_name,
                        "abbr": d.get("abbreviation") or "INT",
                        "baseball_quality": _safe_int(d.get("baseball_quality"), 0),
                        "count": cnt,
                        "players_count": cnt,
                        "pct": pct_val,
                        "share_pct": pct_val,
                        "avg_ovr": round(_safe_float(d.get("avg_oa"), 42.0), 1),
                        "avg_pot": round(_safe_float(d.get("avg_pot"), 48.0), 1),
                    })
            if _table_exists(conn, "cities") and _table_exists(conn, "states"):
                q_st = """
                SELECT s.name as state_name, s.abbreviation as state_abbr, n.abbreviation as nation_abbr,
                       COUNT(p.player_id) as cnt,
                       AVG(v.oa) as avg_oa,
                       AVG(v.pot) as avg_pot
                FROM players p
                JOIN cities c ON p.city_of_birth_id = c.city_id
                JOIN states s ON c.state_id = s.state_id AND c.nation_id = s.nation_id
                LEFT JOIN nations n ON c.nation_id = n.nation_id
                LEFT JOIN players_value v ON p.player_id = v.player_id
                WHERE p.retired = 0
                GROUP BY s.state_id, s.nation_id
                ORDER BY cnt DESC
                LIMIT 14
                """
                for r in conn.execute(q_st):
                    d = dict(r)
                    cnt = _safe_int(d.get("cnt"))
                    pct_val = round((cnt / tot_unretired) * 100.0, 1)
                    s_name = d.get("state_name") or "Region"
                    s_abbr = (d.get("state_abbr") or "").strip() or (d.get("nation_abbr") or "USA")
                    top_birth_states.append({
                        "state": s_name,
                        "state_name": s_name,
                        "abbr": s_abbr,
                        "state_abbr": s_abbr,
                        "nation_abbr": d.get("nation_abbr") or "USA",
                        "count": cnt,
                        "players_count": cnt,
                        "pct": pct_val,
                        "share_pct": pct_val,
                        "avg_ovr": round(_safe_float(d.get("avg_oa"), 42.0), 1),
                        "avg_pot": round(_safe_float(d.get("avg_pot"), 48.0), 1),
                    })
        except Exception:
            pass

    # =========================================================================
    # 5. CONFIGURABLE EXPANSION TARGET CITY RECOMMENDER (WITH IRL COUNTERPARTS)
    # =========================================================================
    primary_states = {st for st, cnt in primary_states_counts.items() if cnt >= 1}
    is_single_state_league = len(primary_states) == 1
    single_state_abbr = next(iter(primary_states)) if is_single_state_league else "PA"

    candidate_pool = []
    seen_cand_keys = set()
    seen_city_ids = set()

    ref_pops = get_reference_city_populations()
    curated_reg = get_irl_counterparts_registry()
    curated_cids = [int(r["city_id"]) for r in curated_reg if r.get("city_id") and int(r["city_id"]) > 0]
    curated_cids_sql = ",".join(str(x) for x in sorted(set(curated_cids))) if curated_cids else "0"
    primary_states_sql = ",".join(f"'{st}'" for st in sorted(primary_states) if st.isalpha()) or "'PA'"

    if _table_exists(conn, "cities") and _table_exists(conn, "states"):
        try:
            # Query 1: All curated Real-Life MLB / MiLB / Partner / Historic Counterpart cities
            # Query 2: Top 8 cities in EVERY US state and Canadian province (prevents state-skewed population scaling from hiding Western/Midwest states)
            # Query 3: Top 120 US cities by in-save population
            # Query 4: Top 30 cities in the active league's primary state(s) for regional depth
            # Query 5: Top 45 international baseball markets (Canada 36, Mexico 124, DR 56, PR 151, Cuba 49, Venezuela 210, Japan 98, Korea 177, Panama 145, Colombia 44)
            queries = [
                f"""
                SELECT c.city_id, c.name as city_name, c.population, c.latitude, c.longitude, c.nation_id,
                       s.name as state_name, s.abbreviation as state_abbr, n.abbreviation as nation_abbr
                FROM cities c
                LEFT JOIN states s ON c.state_id = s.state_id AND c.nation_id = s.nation_id
                LEFT JOIN nations n ON c.nation_id = n.nation_id
                WHERE CAST(c.city_id AS INTEGER) IN ({curated_cids_sql})
                """,
                """
                SELECT city_id, city_name, population, latitude, longitude, nation_id, state_name, state_abbr, nation_abbr
                FROM (
                    SELECT c.city_id, c.name as city_name, c.population, c.latitude, c.longitude, c.nation_id,
                           s.name as state_name, s.abbreviation as state_abbr, n.abbreviation as nation_abbr,
                           ROW_NUMBER() OVER (PARTITION BY c.nation_id, c.state_id ORDER BY CAST(c.population AS INTEGER) DESC) as rn
                    FROM cities c
                    LEFT JOIN states s ON c.state_id = s.state_id AND c.nation_id = s.nation_id
                    LEFT JOIN nations n ON c.nation_id = n.nation_id
                    WHERE CAST(c.nation_id AS INTEGER) IN (206, 36) AND CAST(c.population AS INTEGER) > 0
                )
                WHERE rn <= 8
                """,
                """
                SELECT c.city_id, c.name as city_name, c.population, c.latitude, c.longitude, c.nation_id,
                       s.name as state_name, s.abbreviation as state_abbr, n.abbreviation as nation_abbr
                FROM cities c
                LEFT JOIN states s ON c.state_id = s.state_id AND c.nation_id = s.nation_id
                LEFT JOIN nations n ON c.nation_id = n.nation_id
                WHERE CAST(c.nation_id AS INTEGER) = 206
                ORDER BY CAST(c.population AS INTEGER) DESC
                LIMIT 120
                """,
                f"""
                SELECT c.city_id, c.name as city_name, c.population, c.latitude, c.longitude, c.nation_id,
                       s.name as state_name, s.abbreviation as state_abbr, n.abbreviation as nation_abbr
                FROM cities c
                LEFT JOIN states s ON c.state_id = s.state_id AND c.nation_id = s.nation_id
                LEFT JOIN nations n ON c.nation_id = n.nation_id
                WHERE s.abbreviation IN ({primary_states_sql})
                ORDER BY CAST(c.population AS INTEGER) DESC
                LIMIT 30
                """,
                """
                SELECT c.city_id, c.name as city_name, c.population, c.latitude, c.longitude, c.nation_id,
                       s.name as state_name, s.abbreviation as state_abbr, n.abbreviation as nation_abbr
                FROM cities c
                LEFT JOIN states s ON c.state_id = s.state_id AND c.nation_id = s.nation_id
                LEFT JOIN nations n ON c.nation_id = n.nation_id
                WHERE CAST(c.nation_id AS INTEGER) IN (36, 124, 56, 151, 49, 210, 98, 177, 145, 44)
                ORDER BY CAST(c.population AS INTEGER) DESC
                LIMIT 45
                """,
            ]
            raw_city_rows = []
            for q_sql in queries:
                try:
                    raw_city_rows.extend(conn.execute(q_sql).fetchall())
                except Exception:
                    pass

            for r in raw_city_rows:
                cd = dict(r)
                cid = _safe_int(cd.get("city_id"))
                cname = str(cd.get("city_name") or "").strip()
                st_abbr = str(cd.get("state_abbr") or "").strip()
                st_name = str(cd.get("state_name") or "").strip()
                nat_id = _safe_int(cd.get("nation_id"), 206)
                nat_abbr = str(cd.get("nation_abbr") or ("USA" if nat_id == 206 else ("CAN" if nat_id == 36 else "INTL"))).strip()
                lat = round(_safe_float(cd.get("latitude")), 4)
                lon = round(_safe_float(cd.get("longitude")), 4)
                raw_pop = _safe_int(cd.get("population"))

                if not cname or raw_pop <= 0:
                    continue
                if cid in seen_city_ids:
                    continue
                ckey = (cname.lower(), st_abbr.upper())
                if ckey in seen_cand_keys:
                    continue

                # Skip unincorporated townships that clutter candidate lists (e.g., Cheltenham Township, Lower Merion Township)
                if "township" in cname.lower():
                    continue

                # Check if city already hosts an active team in this league
                already_active = (
                    (cid in existing_city_ids)
                    or (ckey in existing_city_state_keys)
                    or (not st_abbr and cname.lower() in existing_city_names)
                )

                # Normalize population when US states have custom Ashes scaling (e.g. PA scaled 1/25x while CA is 1/480x)
                ref_pop = (
                    ref_pops.get("by_id", {}).get(cid)
                    or ref_pops.get("by_name_state", {}).get(ckey)
                    or 0
                )
                if is_ashes_world and nat_id == 206:
                    scaled_est = int(round(raw_pop * us_pop_multiplier))
                    eff_pop = max(scaled_est, ref_pop) if ref_pop > 0 else scaled_est
                    save_scaled_pop = raw_pop
                elif is_ashes_world and nat_id != 206:
                    eff_pop = max(raw_pop, ref_pop)
                    save_scaled_pop = max(100, int(round(eff_pop / max(1.0, us_pop_multiplier))))
                else:
                    eff_pop = max(raw_pop, ref_pop)
                    save_scaled_pop = raw_pop

                # Distance to active league teams & centroid
                dist_centroid = round(haversine_miles(lat, lon, centroid_lat, centroid_lon), 1)
                dists_to_active = []
                in_city_teams = []
                metro_only_teams = []
                regional_teams = []
                for tn in active_team_nodes:
                    d_mi = haversine_miles(lat, lon, tn["lat"], tn["lon"])
                    dists_to_active.append((d_mi, tn))
                    tn_cid = _safe_int(tn.get("city_id"))
                    tn_city_low = (tn.get("city") or "").strip().lower()
                    tn_state_up = (tn.get("state") or "").strip().upper()
                    tn_name_low = (tn.get("name") or "").strip().lower()
                    is_in_city = (
                        (cid > 0 and tn_cid == cid)
                        or (tn_city_low == cname.lower() and (not st_abbr or not tn_state_up or tn_state_up == st_abbr.upper() or d_mi <= 15.0))
                        or (tn_name_low == cname.lower() and d_mi <= 25.0)
                    )
                    if is_in_city:
                        in_city_teams.append({
                            "team_id": tn["team_id"],
                            "abbr": tn["abbr"],
                            "full_name": tn["full_name"],
                            "city": tn["city"],
                            "state": tn["state"],
                            "distance_mi": round(d_mi, 1),
                            "service_role": "In-City",
                        })
                    elif d_mi <= 38.0 or (d_mi <= 55.0 and _are_metro_linked(cname, st_abbr, tn.get("city", ""), tn.get("state", ""))):
                        metro_only_teams.append({
                            "team_id": tn["team_id"],
                            "abbr": tn["abbr"],
                            "full_name": tn["full_name"],
                            "city": tn["city"],
                            "state": tn["state"],
                            "distance_mi": round(d_mi, 1),
                            "service_role": "Metro",
                        })
                    elif d_mi <= 85.0:
                        regional_teams.append({
                            "team_id": tn["team_id"],
                            "abbr": tn["abbr"],
                            "full_name": tn["full_name"],
                            "city": tn["city"],
                            "state": tn["state"],
                            "distance_mi": round(d_mi, 1),
                            "service_role": "Regional",
                        })

                dists_to_active.sort(key=lambda x: x[0])
                in_city_teams.sort(key=lambda x: x["distance_mi"])
                metro_only_teams.sort(key=lambda x: x["distance_mi"])
                regional_teams.sort(key=lambda x: x["distance_mi"])

                if in_city_teams:
                    already_active = True

                in_city_tids = {t["team_id"] for t in in_city_teams}
                ext_dists = [(d, tn) for d, tn in dists_to_active if tn["team_id"] not in in_city_tids]

                nearest_mi = round(dists_to_active[0][0], 1) if dists_to_active else 150.0
                nearest_tm = dists_to_active[0][1] if dists_to_active else None
                second_mi = round(dists_to_active[1][0], 1) if len(dists_to_active) > 1 else nearest_mi
                if already_active and ext_dists:
                    # For cities with an active club, note the nearest external rival distance
                    nearest_ext_mi = round(ext_dists[0][0], 1)
                    nearest_ext_tm = ext_dists[0][1]
                else:
                    nearest_ext_mi = nearest_mi
                    nearest_ext_tm = nearest_tm

                # Lookup Real-Life MLB / MiLB / Partner / Historic Counterpart(s)
                irl_info = lookup_irl_counterparts(
                    city_id=cid,
                    city_name=cname,
                    state_abbr=st_abbr,
                    lat=lat,
                    lon=lon,
                    active_city_names=existing_city_names,
                )

                # Apply realistic metro population floor for exact-city MLB / Historic MLB / Triple-A hubs
                # where municipal city limits (e.g. San Francisco 874k, Miami 442k, Atlanta 498k, St. Louis 301k, Pittsburgh 303k)
                # understate the true MSA media market size.
                msa_ref_floor = METRO_MSA_REFERENCE_POPS.get(ckey, 0)
                if msa_ref_floor > 0:
                    eff_pop = max(eff_pop, msa_ref_floor)
                elif irl_info.get("is_exact_city_counterpart"):
                    p_lvl = irl_info.get("primary_level", "")
                    if p_lvl == "MLB":
                        eff_pop = max(eff_pop, int(round(eff_pop * 1.45)), 1450000)
                    elif p_lvl == "Historic MLB":
                        eff_pop = max(eff_pop, int(round(eff_pop * 1.35)), 1100000)
                    elif p_lvl in ("Triple-A", "Historic Triple-A"):
                        eff_pop = max(eff_pop, int(round(eff_pop * 1.25)), 480000)

                # If city already has an active team in this league, only include it in the ledger if it is a major
                # Real-Life MLB/MiLB counterpart or major metro (for 2nd-team metro expansion / Counterpart Ledger reference)
                if already_active and not (irl_info["has_irl_counterpart"] or eff_pop >= 750000 or is_single_state_league):
                    continue

                # Filter out small residential suburbs that have no IRL counterpart and sit inside an existing active team's metro (<22 mi)
                if not irl_info["has_irl_counterpart"] and eff_pop < 100000 and nearest_mi < 22.0 and not already_active:
                    continue

                seen_city_ids.add(cid)
                seen_cand_keys.add(ckey)

                active_abbrs = [t["abbr"] for t in in_city_teams] or (
                    active_city_teams_map.get(("id", cid))
                    or active_city_teams_map.get(ckey)
                    or active_city_teams_map.get(("name", cname.lower()))
                    or []
                )
                active_abbrs = list(dict.fromkeys(active_abbrs))
                if active_abbrs:
                    already_active = True
                in_city_count = len(active_abbrs)
                metro_teams_count = in_city_count + len(metro_only_teams)
                regional_teams_count = len(regional_teams)

                sister_clubs = list(dict.fromkeys(
                    (sister_league_city_map.get(("id", cid)) or [])
                    + (sister_league_city_map.get(ckey) or [])
                ))

                # Build Current Market Service Tag & Details
                serving_teams = in_city_teams + metro_only_teams + regional_teams[:3]
                serving_team_abbrs = list(dict.fromkeys(active_abbrs + [t["abbr"] for t in serving_teams]))
                if in_city_count > 0:
                    market_service_tier = "in_city"
                    market_service_label = "In-Market Tenant"
                    if metro_only_teams:
                        m_extra = ", ".join(t["abbr"] for t in metro_only_teams[:2])
                        serving_teams_tag = f"Served by: {', '.join(active_abbrs)} (+Metro: {m_extra})"
                    elif len(in_city_teams) == 1:
                        serving_teams_tag = f"Served by: {in_city_teams[0]['abbr']} ({in_city_teams[0]['full_name']})"
                    elif in_city_count == 1:
                        serving_teams_tag = f"Served by: {active_abbrs[0]} (In-City Club)"
                    else:
                        serving_teams_tag = f"Served by: {', '.join(active_abbrs)} ({in_city_count} In-City Clubs)"
                    serving_teams_detail = " • ".join(
                        ([f"{t['full_name']} ({t['abbr']}, In-City)" for t in in_city_teams] or [f"{a} (In-City)" for a in active_abbrs])
                        + [f"{t['full_name']} ({t['abbr']}, Metro {t['distance_mi']:.0f} mi)" for t in metro_only_teams]
                    )
                elif metro_only_teams:
                    market_service_tier = "metro"
                    market_service_label = "Metro Catchment"
                    m_str = ", ".join(f"{t['abbr']} ({t['distance_mi']:.0f} mi)" for t in metro_only_teams[:3])
                    serving_teams_tag = f"Metro Served: {m_str}"
                    serving_teams_detail = " • ".join(
                        f"{t['full_name']} ({t['abbr']} — {t['city']}, {t['distance_mi']:.0f} mi)"
                        for t in metro_only_teams[:4]
                    )
                elif regional_teams:
                    market_service_tier = "regional"
                    market_service_label = "Regional Catchment"
                    r_str = ", ".join(f"{t['abbr']} ({t['distance_mi']:.0f} mi)" for t in regional_teams[:2])
                    serving_teams_tag = f"Regional Reach: {r_str}"
                    serving_teams_detail = " • ".join(
                        f"{t['full_name']} ({t['abbr']} — {t['city']}, {t['distance_mi']:.0f} mi)"
                        for t in regional_teams[:4]
                    )
                else:
                    market_service_tier = "unserved"
                    market_service_label = "Unserved / Open"
                    near_lbl = f"Nearest: {nearest_tm['abbr']} {nearest_mi:.0f} mi" if nearest_tm else "Open"
                    serving_teams_tag = f"Unserved Market ({near_lbl})"
                    serving_teams_detail = f"Open territory with no active club within 85 miles ({near_lbl})"

                # Compute the 5 Configurable Factor Sub-Scores (0 - 100)
                # 1. Population & Media Scale Factor (log/power curve on effective metro pop)
                pop_factor = int(round(min(99.0, max(28.0, 22.0 + math.log10(max(10000.0, eff_pop)) * 12.2))))
                if eff_pop >= 3000000:
                    pop_factor = 99
                elif eff_pop >= 2000000:
                    pop_factor = min(98, max(94, pop_factor + 8))
                elif eff_pop >= 1200000:
                    pop_factor = min(96, max(90, pop_factor + 6))

                # 2. Economic & Corporate Capacity Factor
                irl_econ_bonus = 12 if irl_info.get("primary_level") in ("MLB", "Historic MLB") else (8 if irl_info["has_irl_counterpart"] else 0)
                econ_raw = int(round(min(198, max(88, 78 + (pop_factor * 1.15) + irl_econ_bonus))))
                econ_factor = int(round(min(99.0, max(35.0, (econ_raw - 70) * 0.76))))

                # Determine Market Team Capacity (How Many Teams Market Could Support)
                if eff_pop >= 8500000:
                    supported_teams_min, supported_teams_max = 3, 4
                    supported_teams_display = "3–4 Teams"
                    capacity_tier_label = "Mega-Metro (Up to 4 Clubs)"
                elif eff_pop >= 4500000 or (is_single_state_league and eff_pop >= 2800000):
                    supported_teams_min, supported_teams_max = 2, 3
                    supported_teams_display = "2–3 Teams"
                    capacity_tier_label = "Major Metro (Up to 3 Clubs)"
                elif eff_pop >= 2350000 or (is_single_state_league and eff_pop >= 1500000):
                    supported_teams_min, supported_teams_max = 2, 2
                    supported_teams_display = "2 Teams"
                    capacity_tier_label = "Two-Club Metro"
                elif eff_pop >= 1650000 and (econ_factor >= 76 or irl_info.get("primary_level") in ("MLB", "Historic MLB", "Triple-A", "International Pro")):
                    supported_teams_min, supported_teams_max = 1, 2
                    supported_teams_display = "1–2 Teams"
                    capacity_tier_label = "Primary Hub (1–2 Clubs)"
                elif eff_pop >= 130000 or irl_info["has_irl_counterpart"] or (is_single_state_league and eff_pop >= 45000):
                    supported_teams_min, supported_teams_max = 1, 1
                    supported_teams_display = "1 Team"
                    capacity_tier_label = "Single-Club Market"
                else:
                    supported_teams_min, supported_teams_max = 1, 1
                    supported_teams_display = "1 Team"
                    capacity_tier_label = "Small / Feeder Hub"

                if in_city_count > 0:
                    available_team_slots = max(0, supported_teams_max - in_city_count)
                elif metro_teams_count > 0:
                    # Satellite city in an active metro: check parent metro capacity vs current metro teams
                    metro_hub_pop = eff_pop
                    for mt in metro_only_teams:
                        mt_ckey = ((mt.get("city") or "").strip().lower(), (mt.get("state") or "").strip().upper())
                        metro_hub_pop = max(metro_hub_pop, METRO_MSA_REFERENCE_POPS.get(mt_ckey, 0))
                    metro_cap = 4 if metro_hub_pop >= 8500000 else (3 if (metro_hub_pop >= 4500000 or (is_single_state_league and metro_hub_pop >= 2800000)) else (2 if metro_hub_pop >= 1650000 else 1))
                    available_team_slots = min(supported_teams_max, max(0, metro_cap - metro_teams_count))
                else:
                    available_team_slots = supported_teams_max

                if in_city_count == 0 and metro_teams_count == 0:
                    capacity_status_tier = "open"
                    capacity_status_tag = f"0/{supported_teams_max} Occupied • +{available_team_slots} Open"
                elif in_city_count > 0:
                    if available_team_slots > 0:
                        capacity_status_tier = "room"
                        capacity_status_tag = f"{in_city_count}/{supported_teams_max} In-City • +{available_team_slots} Open"
                    else:
                        capacity_status_tier = "saturated"
                        capacity_status_tag = f"{in_city_count}/{supported_teams_max} In-City • Saturated"
                else:
                    if available_team_slots > 0:
                        capacity_status_tier = "room"
                        capacity_status_tag = f"{metro_teams_count} in Metro • +{available_team_slots} Open"
                    else:
                        capacity_status_tier = "saturated"
                        capacity_status_tag = f"{metro_teams_count} in Metro • Saturated"

                # 3. Geographic Compactness & Footprint Fit Factor
                ideal_span = max(220.0, (ns_span_miles + ew_span_miles) * 0.65)
                geo_factor = int(round(min(98.0, max(38.0, 96.0 - (dist_centroid / max(180.0, ideal_span)) * 28.0))))
                if is_single_state_league and st_abbr == single_state_abbr:
                    geo_factor = min(99, geo_factor + 14)
                elif nat_id == 206:
                    geo_factor = min(99, geo_factor + 8)
                    # Major national MLB/Triple-A hubs remain strong national expansion anchors even when opening a new coast/region
                    if irl_info.get("is_exact_city_counterpart") and irl_info.get("primary_level") in ("MLB", "Historic MLB"):
                        geo_factor = max(geo_factor, 72 if is_single_state_league else 86)
                    elif irl_info.get("is_exact_city_counterpart") and irl_info.get("primary_level") in ("Triple-A", "Historic Triple-A"):
                        geo_factor = max(geo_factor, 66 if is_single_state_league else 78)

                # 4. Untapped Territory & Optimal Rivalry Spacing Factor
                if already_active:
                    # City already hosts 1+ active teams: viable for 2nd/3rd-team metro rivalry if capacity slots remain open
                    if available_team_slots >= 2:
                        gap_factor = 76
                    elif available_team_slots == 1:
                        gap_factor = 68
                    else:
                        gap_factor = 38
                elif 35.0 <= nearest_mi <= 240.0:
                    gap_factor = 94
                elif 240.0 < nearest_mi <= 650.0:
                    gap_factor = 90 if (eff_pop >= 500000 or irl_info["has_irl_counterpart"]) else 82
                elif nearest_mi > 650.0:
                    # Major national expansion markets in an unrepresented region (e.g. West Coast for an Eastern/Midwest league)
                    # represent premier untapped geographic territories!
                    if eff_pop >= 1000000 or irl_info.get("primary_level") in ("MLB", "Historic MLB"):
                        gap_factor = 92
                    elif eff_pop >= 350000 or irl_info["has_irl_counterpart"]:
                        gap_factor = 84
                    else:
                        gap_factor = 70
                elif 18.0 <= nearest_mi < 35.0:
                    gap_factor = 82 if available_team_slots > 0 else 58
                else:
                    gap_factor = 64 if available_team_slots > 0 else 48  # Metro derby / shared market

                # 5. Real-Life Baseball Heritage & Ballpark Readiness Factor
                irl_factor = int(irl_info.get("irl_tier_score", 42))

                # Default Composite Score (30% Pop, 20% Econ, 20% Geo, 15% Gap, 15% IRL)
                composite_score = int(
                    round(
                        0.30 * pop_factor
                        + 0.20 * econ_factor
                        + 0.20 * geo_factor
                        + 0.15 * gap_factor
                        + 0.15 * irl_factor
                    )
                )

                proj_mkt_size = max(2, min(10, int(round(pop_factor / 10.5))))
                proj_budget = round(avg_bud_val * (0.72 + (proj_mkt_size / 10.0) * 0.52), -5)
                proj_fan = min(98, max(52, int(round(0.55 * irl_factor + 0.45 * pop_factor))))

                # Potential Revenue & Market Share Calculations
                avg_full_season_rev = max(tot_rev / max(1, num_teams), avg_bud_val * 0.96, 15000000.0)
                league_total_rev_pool = avg_full_season_rev * num_teams
                pop_log_term = (math.log10(max(50000.0, eff_pop)) - 5.5) * 0.22
                rev_scale = (
                    0.56
                    + (proj_mkt_size / 10.0) * 0.36
                    + pop_log_term
                    + ((econ_factor - 65.0) / 100.0) * 0.14
                    + ((proj_fan - 65.0) / 100.0) * 0.12
                )
                standalone_club_rev = round(avg_full_season_rev * max(0.50, min(1.62, rev_scale)), -4)
                multi_team_mult = {1: 1.0, 2: 1.68, 3: 2.28, 4: 2.85}.get(supported_teams_max, 1.0)
                total_market_revenue_potential = round(standalone_club_rev * multi_team_mult, -4)

                if market_service_tier == "unserved":
                    local_market_share_pct = 100.0
                    market_share_type = "Sole Market Club"
                    projected_revenue = standalone_club_rev
                elif market_service_tier == "regional":
                    overlap_loss = sum(max(0.025, (88.0 - t["distance_mi"]) / 380.0) for t in regional_teams[:3])
                    local_market_share_pct = round(max(66.0, min(95.0, (1.0 - overlap_loss) * 100.0)), 1)
                    market_share_type = f"Regional Split ({regional_teams_count} Neighbor{'s' if regional_teams_count > 1 else ''})"
                    projected_revenue = round(standalone_club_rev * (0.42 + 0.58 * (local_market_share_pct / 100.0)), -4)
                elif market_service_tier == "metro":
                    total_post = metro_teams_count + 1
                    sub_w = 0.92 if eff_pop >= 450000 else (0.80 if eff_pop >= 180000 else 0.68)
                    local_market_share_pct = round(max(14.0, min(50.0, (100.0 / total_post) * sub_w)), 1)
                    market_share_type = f"Metro Split (1 of {total_post})"
                    eff_metro_pool = max(
                        total_market_revenue_potential,
                        standalone_club_rev * min(2.28, 1.0 + 0.62 * min(max(1, supported_teams_max), metro_teams_count)),
                    )
                    projected_revenue = round(max(avg_full_season_rev * 0.45, eff_metro_pool * (local_market_share_pct / 100.0)), -4)
                else:
                    total_post = metro_teams_count + 1
                    local_market_share_pct = round(max(18.0, min(48.0, (100.0 / total_post) * 0.92)), 1)
                    market_share_type = f"Shared City (1 of {total_post})"
                    eff_metro_pool = max(
                        total_market_revenue_potential,
                        standalone_club_rev * min(2.85, 1.0 + 0.65 * min(max(1, supported_teams_max - 1), metro_teams_count)),
                    )
                    projected_revenue = round(max(avg_full_season_rev * 0.48, eff_metro_pool * (local_market_share_pct / 100.0)), -4)

                projected_gate_revenue = round(projected_revenue * 0.40, -4)
                projected_media_revenue = round(projected_revenue * 0.42, -4)
                projected_merch_revenue = round(max(0.0, projected_revenue - projected_gate_revenue - projected_media_revenue), -4)
                league_market_share_pct = round((projected_revenue / max(1.0, league_total_rev_pool + projected_revenue)) * 100.0, 2)
                market_share_label = f"{local_market_share_pct:.0f}% Local • {league_market_share_pct:.1f}% Lg"

                if proj_mkt_size >= 8:
                    fin_tier = "Large Market (Tier 1)"
                elif proj_mkt_size >= 5:
                    fin_tier = "Mid-Size Market (Tier 2)"
                else:
                    fin_tier = "Regional Hub (Tier 3)"

                sug_nick = irl_info.get("suggested_nickname") or NICKNAME_FALLBACKS[len(candidate_pool) % len(NICKNAME_FALLBACKS)].title()
                sug_abbr = irl_info.get("suggested_abbr") or cname[:3].upper()
                sug_park = irl_info.get("suggested_park") or f"{cname} Field"
                sug_cap = irl_info.get("suggested_capacity") or (38000 if proj_mkt_size >= 7 else 24000)

                region_bucket = _classify_region_bucket(st_abbr, nat_id, lat, lon, primary_states)
                if already_active and active_abbrs:
                    region_bucket = f"{region_bucket} • Active: {', '.join(active_abbrs[:2])}"

                candidate_pool.append({
                    "city_id": cid,
                    "city": cname,
                    "city_name": cname,
                    "state": st_abbr or nat_abbr,
                    "state_abbr": st_abbr or nat_abbr,
                    "state_name": st_name or nat_abbr,
                    "nation": nat_abbr,
                    "nation_id": nat_id,
                    "region_bucket": region_bucket,
                    "is_primary_state": st_abbr in primary_states,
                    "is_active_league_city": already_active,
                    "active_teams_count": in_city_count,
                    "active_team_abbrs": active_abbrs,
                    "metro_teams_count": metro_teams_count,
                    "regional_teams_count": regional_teams_count,
                    "serving_teams": serving_teams,
                    "serving_team_abbrs": serving_team_abbrs,
                    "serving_teams_tag": serving_teams_tag,
                    "serving_teams_detail": serving_teams_detail,
                    "market_service_tier": market_service_tier,
                    "market_service_label": market_service_label,
                    "in_save_sister_teams": sister_clubs,
                    "supported_teams_min": supported_teams_min,
                    "supported_teams_max": supported_teams_max,
                    "supported_teams": supported_teams_max,
                    "supported_teams_display": supported_teams_display,
                    "capacity_tier_label": capacity_tier_label,
                    "available_team_slots": available_team_slots,
                    "capacity_status_tier": capacity_status_tier,
                    "capacity_status_tag": capacity_status_tag,
                    "lat": lat,
                    "lon": lon,
                    "population": save_scaled_pop,
                    "raw_population": raw_pop,
                    "effective_metro_pop": eff_pop,
                    "economy": econ_raw,
                    "financial_tier": fin_tier,
                    "market_tier": fin_tier,
                    "projected_market_size": proj_mkt_size,
                    "projected_budget": proj_budget,
                    "projected_revenue": projected_revenue,
                    "potential_revenue": projected_revenue,
                    "total_market_revenue_potential": total_market_revenue_potential,
                    "projected_gate_revenue": projected_gate_revenue,
                    "projected_media_revenue": projected_media_revenue,
                    "projected_merch_revenue": projected_merch_revenue,
                    "local_market_share_pct": local_market_share_pct,
                    "projected_market_share_pct": local_market_share_pct,
                    "league_market_share_pct": league_market_share_pct,
                    "market_share_type": market_share_type,
                    "market_share_label": market_share_label,
                    "projected_fan_interest": proj_fan,
                    "dist_to_centroid_miles": dist_centroid,
                    "nearest_team_abbr": (nearest_ext_tm["abbr"] if already_active and nearest_ext_tm else (nearest_tm["abbr"] if nearest_tm else "-")),
                    "nearest_team_name": (nearest_ext_tm["full_name"] if already_active and nearest_ext_tm else (nearest_tm["full_name"] if nearest_tm else "-")),
                    "nearest_team_miles": (nearest_ext_mi if already_active else nearest_mi),
                    "second_nearest_miles": second_mi,
                    "factor_pop": pop_factor,
                    "factor_econ": econ_factor,
                    "factor_geo": geo_factor,
                    "factor_gap": gap_factor,
                    "factor_irl": irl_factor,
                    "market_score": composite_score,
                    "score": composite_score,
                    "overall_score": composite_score,
                    "suggested_nickname": sug_nick,
                    "recommended_nickname": sug_nick,
                    "suggested_abbr": sug_abbr,
                    "suggested_park": sug_park,
                    "suggested_capacity": sug_cap,
                    "has_irl_counterpart": irl_info["has_irl_counterpart"],
                    "is_exact_city_counterpart": bool(irl_info.get("is_exact_city_counterpart", False)),
                    "irl_primary_level": irl_info["primary_level"],
                    "irl_summary_badge": irl_info["summary_badge"],
                    "irl_detail_line": irl_info["detail_line"],
                    "irl_counterparts": irl_info["counterparts"],
                    "rationale": (
                        f"{irl_info['summary_badge']} • {serving_teams_tag} • {supported_teams_display} ({capacity_status_tag})"
                    ),
                    "fit_tag": fin_tier,
                    "source": "OOTP cities.csv + IRL Registry",
                })
        except Exception:
            pass

    candidate_pool.sort(
        key=lambda x: (
            not x.get("is_active_league_city", False),
            x["is_primary_state"] if is_single_state_league else True,
            x["market_score"],
            x["is_exact_city_counterpart"],
            x["effective_metro_pop"],
        ),
        reverse=True,
    )
    candidate_markets = candidate_pool
    open_candidate_markets = [m for m in candidate_markets if not m.get("is_active_league_city")] or candidate_markets

    # =========================================================================
    # 6. EXPANDED STRUCTURAL EVOLUTION & REALIGNMENT BLUEPRINTS (6 ARCHITECTURES)
    # =========================================================================
    def _build_geographic_divisions(teams_list: list[dict], num_divs: int, div_names: list[str]) -> list[dict]:
        if not teams_list:
            return []
        # Sort primarily West-to-East or North-to-South depending on spread
        sorted_t = sorted(teams_list, key=lambda x: (round(x.get("lon", -75.0) * 0.7 - x.get("lat", 40.0) * 0.3, 2)))
        per_div = max(1, math.ceil(len(sorted_t) / num_divs))
        divs_out = []
        for d_idx in range(num_divs):
            chunk = sorted_t[d_idx * per_div : (d_idx + 1) * per_div]
            if not chunk:
                continue
            d_label = div_names[d_idx] if d_idx < len(div_names) else f"Division {d_idx + 1}"
            # Compute average intra-division distance
            d_dists = []
            for i in range(len(chunk)):
                for j in range(i + 1, len(chunk)):
                    d_dists.append(haversine_miles(chunk[i]["lat"], chunk[i]["lon"], chunk[j]["lat"], chunk[j]["lon"]))
            avg_d_mi = round(float(np.mean(d_dists)), 1) if d_dists else 0.0
            divs_out.append({
                "division_name": d_label,
                "teams_count": len(chunk),
                "avg_travel_miles": avg_d_mi,
                "avg_intra_div_miles": avg_d_mi,
                "teams": [
                    {
                        "team_id": t.get("team_id", 0),
                        "full_name": t.get("full_name") or f"{t['city']} {t.get('suggested_nickname', 'BC')}",
                        "abbr": t.get("abbr") or t.get("suggested_abbr", "EXP"),
                        "city": t.get("city", ""),
                        "state": t.get("state", ""),
                        "is_expansion": bool(t.get("is_expansion", False)),
                        "irl_badge": t.get("irl_summary_badge") or t.get("irl_counterpart") or "",
                    }
                    for t in chunk
                ],
            })
        return divs_out

    top_exp_cands = [
        {
            **m,
            "team_id": 9000 + i,
            "full_name": f"{m['city']} {m['suggested_nickname']}",
            "abbr": m["suggested_abbr"],
            "is_expansion": True,
        }
        for i, m in enumerate(open_candidate_markets[:6])
    ]

    sched_games = league_rules_summary["schedule_games_per_team"]
    wpcts = [t["pct"] for t in standings if t["g"] > 0]
    std_wpct = round(float(np.std(wpcts)), 3) if len(wpcts) >= 2 else 0.065

    # Blueprint 1: +2 Franchise Expansion
    n_p2 = num_teams + 2
    divs_p2_cnt = 2 if n_p2 <= 12 else (4 if n_p2 % 4 == 0 else (6 if n_p2 % 6 == 0 else 2))
    div_names_p2 = (
        ["Eastern Division", "Western Division"]
        if divs_p2_cnt == 2
        else (
            ["Atlantic Division", "Northeast Division", "Midwest Division", "Frontier Division"]
            if divs_p2_cnt == 4
            else ["Atlantic", "Metropolitan", "Keystone", "Great Lakes", "Heartland", "Western"]
        )
    )
    divs_p2 = _build_geographic_divisions(active_team_nodes + top_exp_cands[:2], divs_p2_cnt, div_names_p2)

    # Blueprint 2: +4 Wave Expansion
    n_p4 = num_teams + 4
    divs_p4_cnt = 2 if n_p4 <= 10 else (4 if n_p4 % 4 == 0 else (6 if n_p4 % 6 == 0 else 4))
    div_names_p4 = (
        ["Eastern Conference", "Western Conference"]
        if divs_p4_cnt == 2
        else (
            ["Atlantic Pod", "Keystone / Metro Pod", "Great Lakes Pod", "Heartland / West Pod"]
            if divs_p4_cnt == 4
            else ["New England", "Mid-Atlantic", "Keystone", "Ohio Valley", "Great Lakes", "Southern / West"]
        )
    )
    divs_p4 = _build_geographic_divisions(active_team_nodes + top_exp_cands[:4], divs_p4_cnt, div_names_p4)

    # Blueprint 3: Geographic Pod Realignment (Current N Teams, Zero Expansion)
    divs_geo_cnt = 2 if num_teams <= 8 else (4 if num_teams % 4 == 0 else (6 if num_teams % 6 == 0 else 3))
    div_names_geo = (
        ["East Pod", "West Pod"]
        if divs_geo_cnt == 2
        else (
            ["Coastal / East Pod", "Central / Keystone Pod", "Western / Heartland Pod"]
            if divs_geo_cnt == 3
            else (
                ["Northeast Pod", "Mid-Atlantic Pod", "Great Lakes Pod", "Heartland / South Pod"]
                if divs_geo_cnt == 4
                else ["New England", "Metropolitan", "Mid-Atlantic", "Allegheny", "Midwest", "South"]
            )
        )
    )
    divs_geo = _build_geographic_divisions(active_team_nodes, divs_geo_cnt, div_names_geo)
    opt_intra_miles = round(float(np.mean([d["avg_travel_miles"] for d in divs_geo if d["avg_travel_miles"] > 0])), 1) if divs_geo else avg_intra_div_miles
    travel_saved_pct = round(max(0.0, ((avg_intra_div_miles - opt_intra_miles) / max(1.0, avg_intra_div_miles)) * 100.0), 1)

    # Blueprint 4: 2-Tier Promotion / Relegation Pyramid (Tier 1 Premier + Tier 2 Championship)
    pool_pro_rel = active_team_nodes + top_exp_cands[:2]
    sorted_by_power = sorted(
        pool_pro_rel,
        key=lambda x: (not x.get("is_expansion", False), _safe_float(x.get("pct"), 0.450), _safe_float(x.get("total_war"), 0.0)),
        reverse=True,
    )
    t1_cnt = max(4, (len(sorted_by_power) // 2) + (1 if len(sorted_by_power) >= 14 else 0))
    if t1_cnt % 2 == 1:
        t1_cnt -= 1
    tier1_teams = sorted_by_power[:t1_cnt]
    tier2_teams = sorted_by_power[t1_cnt:]
    divs_pro_rel = [
        {
            "division_name": f"Tier 1: Premier Flight ({len(tier1_teams)} Clubs)",
            "teams_count": len(tier1_teams),
            "avg_travel_miles": avg_inter_team_miles,
            "avg_intra_div_miles": avg_inter_team_miles,
            "teams": [
                {
                    "team_id": t["team_id"],
                    "full_name": t["full_name"],
                    "abbr": t["abbr"],
                    "city": t.get("city", ""),
                    "state": t.get("state", ""),
                    "is_expansion": bool(t.get("is_expansion", False)),
                    "irl_badge": t.get("irl_summary_badge") or t.get("irl_counterpart") or "",
                }
                for t in tier1_teams
            ],
        },
        {
            "division_name": f"Tier 2: Championship Flight ({len(tier2_teams)} Clubs — Top 2 Promoted)",
            "teams_count": len(tier2_teams),
            "avg_travel_miles": avg_inter_team_miles,
            "avg_intra_div_miles": avg_inter_team_miles,
            "teams": [
                {
                    "team_id": t["team_id"],
                    "full_name": t["full_name"],
                    "abbr": t["abbr"],
                    "city": t.get("city", ""),
                    "state": t.get("state", ""),
                    "is_expansion": bool(t.get("is_expansion", False)),
                    "irl_badge": t.get("irl_summary_badge") or t.get("irl_counterpart") or "",
                }
                for t in tier2_teams
            ],
        },
    ]

    # Blueprint 5: Regional State / Multi-League Association Federation
    fed_pool = active_team_nodes + top_exp_cands[:4]
    by_state_groups = {}
    for t in fed_pool:
        st = t.get("state") or "REG"
        if st in ("PA", "DE"):
            grp = "Keystone Baseball League (PA/DE)"
        elif st in ("NY", "NJ", "QC", "ON", "CT", "MA", "RI"):
            grp = "Empire & Atlantic League (NY/NJ/NE/CAN)"
        elif st in ("OH", "MI", "IL", "IN", "WI", "MO", "MN"):
            grp = "Great Lakes & Heartland League (OH/MW)"
        else:
            grp = "Southern & Chesapake League (MD/DC/VA/FL/GA)"
        by_state_groups.setdefault(grp, []).append(t)
    divs_federation = []
    for grp_name, tlist in by_state_groups.items():
        fed_d_mi = round(
            float(
                np.mean(
                    [
                        haversine_miles(tlist[i]["lat"], tlist[i]["lon"], tlist[j]["lat"], tlist[j]["lon"])
                        for i in range(len(tlist))
                        for j in range(i + 1, len(tlist))
                    ]
                    or [85.0]
                )
            ),
            1,
        )
        divs_federation.append({
            "division_name": grp_name,
            "teams_count": len(tlist),
            "avg_travel_miles": fed_d_mi,
            "avg_intra_div_miles": fed_d_mi,
            "teams": [
                {
                    "team_id": t["team_id"],
                    "full_name": t["full_name"],
                    "abbr": t["abbr"],
                    "city": t.get("city", ""),
                    "state": t.get("state", ""),
                    "is_expansion": bool(t.get("is_expansion", False)),
                    "irl_badge": t.get("irl_summary_badge") or t.get("irl_counterpart") or "",
                }
                for t in tlist
            ],
        })

    # Blueprint 6: Long-Horizon +6 Multi-Pod Mega-League
    n_p6 = num_teams + 6
    divs_p6_cnt = 4 if n_p6 <= 20 else 6
    div_names_p6 = ["Atlantic Pod", "Keystone Pod", "Metropolitan Pod", "Great Lakes Pod", "Heartland Pod", "Southern / Western Pod"][:divs_p6_cnt]
    divs_p6 = _build_geographic_divisions(active_team_nodes + top_exp_cands[:6], divs_p6_cnt, div_names_p6)

    avg_p2_mi = round(float(np.mean([d["avg_travel_miles"] for d in divs_p2 if d["avg_travel_miles"] > 0] or [avg_intra_div_miles])), 1)
    avg_p4_mi = round(float(np.mean([d["avg_travel_miles"] for d in divs_p4 if d["avg_travel_miles"] > 0] or [avg_intra_div_miles])), 1)
    avg_fed_mi = round(float(np.mean([d["avg_travel_miles"] for d in divs_federation] or [110.0])), 1)
    avg_p6_mi = round(float(np.mean([d["avg_travel_miles"] for d in divs_p6 if d["avg_travel_miles"] > 0] or [avg_intra_div_miles])), 1)

    structural_blueprints = [
        {
            "id": "exp_plus_2",
            "title": f"Blueprint I: Targeted +2 Expansion ({num_teams} → {n_p2} Franchises)",
            "type": "Expansion (+2)",
            "badge": "LOW-RISK EXPANSION",
            "recommended": True,
            "target_teams": n_p2,
            "added_teams": 2,
            "expansion_delta": 2,
            "recommended_markets": [m["city"] for m in top_exp_cands[:2]],
            "alignment": f"{divs_p2_cnt} Balanced Geographic Divisions ({n_p2 // divs_p2_cnt} clubs/div)",
            "division_alignment": f"{divs_p2_cnt} Balanced Geographic Divisions",
            "schedule_matrix": f"{sched_games} Games: ~{int(sched_games * 0.42)} Div / ~{int(sched_games * 0.40)} Intra-SL / ~{int(sched_games * 0.18)} Interleague",
            "playoff_format": f"{min(12, max(4, (n_p2 // 3) // 2 * 2))}-Team Postseason ({divs_p2_cnt} Div Winners + Wild Cards)",
            "draft_rule": "35-Round Expansion Draft (15 protected per club, max 3 lost per existing team)",
            "roster_spots_created": 2 * league_rules_summary["active_roster_limit"],
            "projected_avg_oa_delta": -0.8,
            "talent_dilution_risk": "Low (-0.8 OVR)",
            "est_expansion_fee_pool": round(est_franchise_fee * 2, 0),
            "financial_impact": {
                "windfall_per_existing_club": round((est_franchise_fee * 2) / max(1, num_teams), 0),
                "est_expansion_fee_pool": round(est_franchise_fee * 2, 0),
            },
            "avg_div_travel_miles": avg_p2_mi,
            "travel_impact": {
                "avg_intra_div_miles": avg_p2_mi,
                "summary": f"{divs_p2_cnt} Geographic Pods ({avg_p2_mi:.0f} mi avg)",
            },
            "pros": (
                f"Adds {2 * league_rules_summary['active_roster_limit']} active roster spots across top targets "
                f"({', '.join(m['city'] for m in top_exp_cands[:2])}) while preserving competitive parity (σ={std_wpct:.3f})."
            ),
            "proposed_divisions": divs_p2,
            "realigned_divisions": divs_p2,
        },
        {
            "id": "exp_plus_4",
            "title": f"Blueprint II: Four-Club Wave Expansion ({num_teams} → {n_p4} Franchises)",
            "type": "Expansion (+4)",
            "badge": "NATIONAL FOOTPRINT",
            "recommended": len(all_active_players) / num_teams >= 16.0,
            "target_teams": n_p4,
            "added_teams": 4,
            "expansion_delta": 4,
            "recommended_markets": [m["city"] for m in top_exp_cands[:4]],
            "alignment": f"2 Sub-Leagues × {divs_p4_cnt // 2} Divisions ({n_p4 // divs_p4_cnt} clubs/div)",
            "division_alignment": f"{divs_p4_cnt} Regional Divisions",
            "schedule_matrix": f"{sched_games} Games: Home-and-Home Division Rivalry Matrix + Rotating Inter-Pod Series",
            "playoff_format": f"{min(12, max(6, (n_p4 // 3) // 2 * 2))}-Team Bracket (Top 2 Seeds Receive First-Round Byes)",
            "draft_rule": "Two-Wave Expansion Draft (14 protected in Rd 1, +2 protected in Rd 2) + Lottery Picks #3-#6",
            "roster_spots_created": 4 * league_rules_summary["active_roster_limit"],
            "projected_avg_oa_delta": -1.6,
            "talent_dilution_risk": "Moderate (-1.6 OVR)",
            "est_expansion_fee_pool": round(est_franchise_fee * 4, 0),
            "financial_impact": {
                "windfall_per_existing_club": round((est_franchise_fee * 4) / max(1, num_teams), 0),
                "est_expansion_fee_pool": round(est_franchise_fee * 4, 0),
            },
            "avg_div_travel_miles": avg_p4_mi,
            "travel_impact": {
                "avg_intra_div_miles": avg_p4_mi,
                "summary": f"{divs_p4_cnt} Regional Divisions ({avg_p4_mi:.0f} mi avg)",
            },
            "pros": (
                f"Expands into 4 prime markets ({', '.join(m['city'] for m in top_exp_cands[:4])}), unlocking symmetrical "
                f"{divs_p4_cnt}-division scheduling and ${est_franchise_fee * 4 / 1e6:.1f}M in expansion fee liquidity."
            ),
            "proposed_divisions": divs_p4,
            "realigned_divisions": divs_p4,
        },
        {
            "id": "geo_realign_current",
            "title": f"Blueprint III: Geographic Pod Realignment ({num_teams} Teams — Zero Expansion)",
            "type": "Geographic Realignment",
            "badge": f"TRAVEL OPTIMIZED (-{travel_saved_pct:.0f}% MI)",
            "recommended": True,
            "target_teams": num_teams,
            "added_teams": 0,
            "expansion_delta": 0,
            "recommended_markets": [],
            "alignment": f"{divs_geo_cnt} Geographically Clustered Regional Pods ({num_teams // divs_geo_cnt} clubs/pod)",
            "division_alignment": f"{divs_geo_cnt} Compact Regional Pods",
            "schedule_matrix": f"{sched_games} Games: 55% Intra-Pod Derby Series + 45% Cross-Pod Balanced Matrix",
            "playoff_format": f"{min(12, max(4, divs_geo_cnt * 2))}-Team Postseason (Pod Champions + Balanced Wild Card Table)",
            "draft_rule": "No Expansion Draft Required — Zero Talent Dilution (0.0 OVR Delta)",
            "roster_spots_created": 0,
            "projected_avg_oa_delta": 0.0,
            "talent_dilution_risk": "None (0.0 OVR Delta)",
            "est_expansion_fee_pool": 0,
            "financial_impact": {
                "windfall_per_existing_club": 0,
                "est_expansion_fee_pool": 0,
            },
            "avg_div_travel_miles": opt_intra_miles,
            "travel_impact": {
                "avg_intra_div_miles": opt_intra_miles,
                "summary": f"Saves {travel_saved_pct:.0f}% Intra-Div Travel ({opt_intra_miles:.0f} mi avg)",
            },
            "pros": (
                f"Clusters existing {num_teams} clubs by Haversine coordinates into {divs_geo_cnt} regional pods, "
                f"reducing average intra-division travel to {opt_intra_miles:.0f} mi and intensifying natural geographic derbies."
            ),
            "proposed_divisions": divs_geo,
            "realigned_divisions": divs_geo,
        },
        {
            "id": "promo_rel_2tier",
            "title": f"Blueprint IV: 2-Tier Promotion / Relegation Pyramid ({len(tier1_teams)} Premier + {len(tier2_teams)} Tier 2)",
            "type": "Association Pyramid",
            "badge": "PROMOTION / RELEGATION",
            "recommended": num_teams >= 12 or is_ashes_world,
            "target_teams": len(pool_pro_rel),
            "added_teams": 2,
            "expansion_delta": 2,
            "recommended_markets": [m["city"] for m in top_exp_cands[:2]],
            "alignment": f"Tier 1 Premier Flight ({len(tier1_teams)}T) + Tier 2 Championship ({len(tier2_teams)}T)",
            "division_alignment": "2-Tier Vertical Pyramid (Bottom 2 Relegated / Top 2 Promoted)",
            "schedule_matrix": f"{sched_games} Games: Full Double Round-Robin within Tier + Inter-Tier Association Cup",
            "playoff_format": "Top 4 Premier Championship Series + Tier 2 Promotion Final (Seeds 1-2 Auto-Promote, 3-6 Playoff)",
            "draft_rule": "Unified Association Draft + Parachute Revenue Sharing (15% Media Pool to Relegated Clubs)",
            "roster_spots_created": 2 * league_rules_summary["active_roster_limit"],
            "projected_avg_oa_delta": +2.4,
            "talent_dilution_risk": "Low (+2.4 OVR in Premier Tier)",
            "est_expansion_fee_pool": round(est_franchise_fee * 2, 0),
            "financial_impact": {
                "windfall_per_existing_club": round((est_franchise_fee * 2) / max(1, num_teams), 0),
                "est_expansion_fee_pool": round(est_franchise_fee * 2, 0),
            },
            "avg_div_travel_miles": avg_inter_team_miles,
            "travel_impact": {
                "avg_intra_div_miles": avg_inter_team_miles,
                "summary": f"2 Vertical Flights ({avg_inter_team_miles:.0f} mi avg)",
            },
            "pros": (
                "Concentrates elite stars in the Premier Tier (+2.4 OVR concentration) while eliminating tanking via "
                "high-stakes relegation battles and giving expansion clubs a realistic Tier 2 entry runway."
            ),
            "proposed_divisions": divs_pro_rel,
            "realigned_divisions": divs_pro_rel,
        },
        {
            "id": "regional_association",
            "title": f"Blueprint V: Multi-League Regional Association ({len(fed_pool)} Clubs in {len(divs_federation)} Regional Leagues)",
            "type": "Regional Federation",
            "badge": "ASHES / ASSOCIATION MODEL",
            "recommended": is_ashes_world or len(leagues) > 1,
            "target_teams": len(fed_pool),
            "added_teams": 4,
            "expansion_delta": 4,
            "recommended_markets": [m["city"] for m in top_exp_cands[:4]],
            "alignment": f"{len(divs_federation)} Autonomous State/Regional Leagues under 1 Association Umbrella",
            "division_alignment": f"{len(divs_federation)} Regional Member Leagues",
            "schedule_matrix": f"{sched_games} Games: 80% Regional League Schedule + 20% Association Inter-League Showcase",
            "playoff_format": "Regional League Pennants → 8-Club Association Champions Cup Tournament",
            "draft_rule": "Regional Territorial Amateur Draft Rights + Open Association Free Agency",
            "roster_spots_created": 4 * league_rules_summary["active_roster_limit"],
            "projected_avg_oa_delta": -1.1,
            "talent_dilution_risk": "Low-Moderate (-1.1 OVR)",
            "est_expansion_fee_pool": round(est_franchise_fee * 4, 0),
            "financial_impact": {
                "windfall_per_existing_club": round((est_franchise_fee * 4) / max(1, num_teams), 0),
                "est_expansion_fee_pool": round(est_franchise_fee * 4, 0),
            },
            "avg_div_travel_miles": avg_fed_mi,
            "travel_impact": {
                "avg_intra_div_miles": avg_fed_mi,
                "summary": f"Compact State/Regional Bus Leagues ({avg_fed_mi:.0f} mi avg)",
            },
            "pros": (
                "Mirrors the historic & Ashes State League progression model—each region operates compact bus-distance rivalries "
                "before crowning a supreme champion in the October Association Cup."
            ),
            "proposed_divisions": divs_federation,
            "realigned_divisions": divs_federation,
        },
        {
            "id": "mega_horizon",
            "title": f"Blueprint VI: Long-Horizon +6 Mega-Expansion ({num_teams} → {n_p6} Franchises)",
            "type": "Expansion (+6)",
            "badge": "5-YEAR HORIZON",
            "recommended": False,
            "target_teams": n_p6,
            "added_teams": 6,
            "expansion_delta": 6,
            "recommended_markets": [m["city"] for m in top_exp_cands[:6]],
            "alignment": f"2 Sub-Leagues × {divs_p6_cnt // 2} Pods ({n_p6 // divs_p6_cnt} clubs/pod)",
            "division_alignment": f"{divs_p6_cnt} Geographic Pods",
            "schedule_matrix": f"{sched_games} Games: Phased 3-Wave Rollout (+2 teams every 2 seasons)",
            "playoff_format": "12-Team or 14-Team Expanded Postseason Tournament",
            "draft_rule": "Phased Expansion Drafts (Year +1, Year +3, Year +5) + Expanded International FA Pool",
            "roster_spots_created": 6 * league_rules_summary["active_roster_limit"],
            "projected_avg_oa_delta": -2.4,
            "talent_dilution_risk": "High if Immediate (-2.4 OVR) / Low if Phased",
            "est_expansion_fee_pool": round(est_franchise_fee * 6, 0),
            "financial_impact": {
                "windfall_per_existing_club": round((est_franchise_fee * 6) / max(1, num_teams), 0),
                "est_expansion_fee_pool": round(est_franchise_fee * 6, 0),
            },
            "avg_div_travel_miles": avg_p6_mi,
            "travel_impact": {
                "avg_intra_div_miles": avg_p6_mi,
                "summary": f"{divs_p6_cnt} Geographic Pods ({avg_p6_mi:.0f} mi avg)",
            },
            "pros": (
                f"Long-term master plan adding {', '.join(m['city'] for m in top_exp_cands[:6])} across a 5-year horizon "
                f"as amateur draft classes and player creation modifiers scale talent supply."
            ),
            "proposed_divisions": divs_p6,
            "realigned_divisions": divs_p6,
        },
    ]

    # =========================================================================
    # 7. DEFAULT / SAVED ROADMAP WORKSHOP STATE
    # =========================================================================
    saved_rm = get_saved_roadmap(save_slug, lid)
    default_selected_cities = [m["city_id"] for m in open_candidate_markets[:2]] if len(open_candidate_markets) >= 2 else []
    default_roadmap = {
        "is_saved": False,
        "updated_at": None,
        "title": f"{active_league.get('name', 'League')} {season_year}–{season_year + 5} Evolution Master Plan",
        "roadmap_title": f"{active_league.get('name', 'League')} {season_year}–{season_year + 5} Evolution Master Plan",
        "horizon_years": 5,
        "selected_blueprint_id": "exp_plus_2",
        "target_architecture": "Balanced Multi-Division Expansion",
        "selected_market_ids": default_selected_cities,
        "custom_identities": {},
        "weights": {
            "pop": 30,
            "econ": 20,
            "geo": 20,
            "gap": 15,
            "irl": 15,
        },
        "filters": {
            "scope": "all",
            "irl_filter": "all",
            "rivalry_mode": "balanced",
        },
        "goals": [
            {
                "id": "goal_1",
                "category": "Expansion & Footprint",
                "title": f"Expand from {num_teams} to {num_teams + 2} Franchises in High-Score Markets",
                "target_metric": f"{num_teams + 2} Active Clubs (Score ≥ 75)",
                "target_year": season_year + 1,
                "status": "Ready",
            },
            {
                "id": "goal_2",
                "category": "Talent Pool & Draft",
                "title": f"Address Positional Depth in {', '.join(bottleneck_positions[:2]) if bottleneck_positions else 'Catching & Bullpen'} Before Wave 2",
                "target_metric": "≥ 1.15 Regulars/Team Across All 11 Positions",
                "target_year": season_year + 2,
                "status": "In Progress",
            },
            {
                "id": "goal_3",
                "category": "Financial Parity",
                "title": f"Maintain League Payroll Gini ≤ {max(0.18, round(payroll_gini - 0.02, 2)):.2f} & Positive Operating Margins",
                "target_metric": f"Top/Bottom Payroll Ratio ≤ {max(1.8, round(top_bot_ratio - 0.2, 1))}x",
                "target_year": season_year + 3,
                "status": "Planned",
            },
            {
                "id": "goal_4",
                "category": "Structural Alignment",
                "title": f"Optimize Regional Division Geometry ({opt_intra_miles:.0f} mi Avg Division Travel)",
                "target_metric": f"{divs_p2_cnt} Balanced Divisions • {sched_games}G Schedule",
                "target_year": season_year + 2,
                "status": "Planned",
            },
        ],
        "phases": [
            {
                "phase": "Phase 1 — Immediate Offseason",
                "year": season_year + 1,
                "headline": f"Wave I Expansion (+2 Clubs: {', '.join(m['city'] for m in open_candidate_markets[:2])})",
                "actions": (
                    f"Conduct 35-round Expansion Draft (15 protected/club); admit {', '.join(m['city'] + ' ' + m['suggested_nickname'] for m in open_candidate_markets[:2])}; "
                    f"distribute ${est_franchise_fee * 2 / max(1, num_teams) / 1e6:.1f}M expansion windfall per existing club."
                ),
            },
            {
                "phase": "Phase 2 — Mid-Term Consolidation",
                "year": season_year + 3,
                "headline": "Division Pod Realignment & Feeder/Prospect Depth Audit",
                "actions": (
                    f"Realign into {divs_p2_cnt} geographic pods to cut travel by {travel_saved_pct:.0f}%; audit U-24 prospect supply "
                    f"and calibrate amateur draft rounds ({league_rules_summary['amateur_draft_rounds']} rds)."
                ),
            },
            {
                "phase": "Phase 3 — Long-Horizon Evolution",
                "year": season_year + 5,
                "headline": f"Wave II Expansion ({num_teams + 2} → {num_teams + 4} Clubs) or 2-Tier Association Split",
                "actions": (
                    f"Evaluate Wave II candidates ({', '.join(m['city'] for m in open_candidate_markets[2:4])}) or launch a "
                    f"Promotion/Relegation Championship Tier once league regulars exceed 16.5/club."
                ),
            },
        ],
    }

    active_roadmap = saved_rm if saved_rm else default_roadmap
    parity_label = (
        "High Economic Parity"
        if payroll_gini <= 0.16
        else ("Balanced Market Dispersion" if payroll_gini <= 0.28 else "Stratified Big-Market Hierarchy")
    )
    if is_single_state_league:
        footprint_type = f"Single-State League ({single_state_abbr})"
    elif max(ns_span_miles, ew_span_miles) <= 450:
        footprint_type = f"Compact Regional ({', '.join(sorted(list(primary_states))[:3])})"
    elif max(ns_span_miles, ew_span_miles) <= 1100:
        footprint_type = "Multi-Region Corridor"
    else:
        footprint_type = "Continental / National Footprint"

    geo_payload = {
        "footprint_type": footprint_type,
        "centroid": {"lat": centroid_lat, "lon": centroid_lon},
        "centroid_lat": centroid_lat,
        "centroid_lon": centroid_lon,
        "ns_span_miles": ns_span_miles,
        "ew_span_miles": ew_span_miles,
        "avg_inter_team_miles": avg_inter_team_miles,
        "avg_division_distance_mi": avg_intra_div_miles,
        "avg_intra_division_miles": avg_intra_div_miles,
        "closest_rivalry": closest_pair,
        "closest_rivalry_pair": closest_pair,
        "longest_trip": longest_pair,
        "most_isolated_team": {
            "full_name": most_isolated["full_name"],
            "abbr": most_isolated["abbr"],
            "city": most_isolated["city"],
            "avg_miles": most_isolated["avg_dist_to_league_miles"],
        }
        if most_isolated
        else None,
        "team_travel": active_team_nodes,
        "active_teams": active_team_nodes,
    }

    return {
        "health_analysis": {
            "talent_pool": {
                "positional_supply": positional_supply,
                "bottleneck_positions": bottleneck_positions,
                "surplus_positions": surplus_positions,
                "rating_distribution": rating_distribution,
                "age_curve": age_curve,
                "free_agent_pool": free_agents_summary,
            },
            "financial_impacts": {
                "macro_ledger": {
                    "total_revenue": round(tot_rev, 0),
                    "avg_revenue": round(tot_rev / num_teams, 0),
                    "total_gate_revenue": round(tot_gate + tot_st_rev, 0),
                    "total_media_revenue": round(tot_media, 0),
                    "total_local_media": round(tot_loc_media, 0),
                    "total_national_media": round(tot_nat_media, 0),
                    "total_merch_revenue": round(tot_merch, 0),
                    "total_expenses": round(tot_exp, 0),
                    "avg_expenses": round(tot_exp / num_teams, 0),
                    "total_payroll": round(tot_payroll, 0),
                    "avg_payroll": avg_pay_val,
                    "avg_budget": avg_bud_val,
                    "total_staff_expenses": round(tot_staff, 0),
                    "total_scouting_budget": round(tot_scout, 0),
                    "total_dev_budget": round(tot_dev, 0),
                    "total_intl_budget": round(tot_intl, 0),
                    "total_operating_profit": round(tot_rev - tot_exp, 0),
                    "avg_operating_profit": round((tot_rev - tot_exp) / num_teams, 0),
                    "profitable_teams_count": sum(1 for c in club_financials if c["operating_margin"] >= 0),
                    "deficit_teams_count": sum(1 for c in club_financials if c["operating_margin"] < 0),
                },
                "inequality_metrics": {
                    "payroll_gini": payroll_gini,
                    "budget_gini": budget_gini,
                    "revenue_gini": revenue_gini,
                    "top_bottom_quartile_payroll_ratio": top_bot_ratio,
                    "payroll_to_win_corr": pay_win_corr,
                    "parity_regime": parity_label,
                    "parity_diagnosis": parity_label,
                },
                "club_financials": club_financials,
                "expansion_economic_models": expansion_econ_models,
                "expansion_simulator": {
                    "estimated_fee_per_team": est_franchise_fee,
                    "tiers": expansion_econ_models,
                },
                "league_financial_rules": league_rules_summary,
            },
            "world_info": {
                "universe_scale": league_rules_summary,
                "league_rules": league_rules_summary,
                "universe_profile": league_rules_summary,
                "player_nationalities": top_nations,
                "player_birth_states": top_birth_states,
                "player_demographics": {
                    "top_nations": top_nations,
                    "top_birth_states": top_birth_states,
                },
                "geography": geo_payload,
                "geographic_footprint": geo_payload,
            },
        },
        "structural_blueprints": structural_blueprints,
        "candidate_markets": candidate_markets,
        "workshop": {
            "active_roadmap": active_roadmap,
            "default_roadmap": default_roadmap,
            "active_team_nodes": active_team_nodes,
            "default_selected_city_ids": default_selected_cities,
            "primary_states": sorted(list(primary_states)),
            "is_single_state_league": is_single_state_league,
            "single_state_abbr": single_state_abbr,
        },
    }
