import os
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SAVES_DB_DIR = DATA_DIR / "saves"
UPLOADED_SAVES_DIR = DATA_DIR / "uploaded_saves"
HOST_DB_PATH = DATA_DIR / "ootp_host.db"
ACTIVE_DB_PATH = DATA_DIR / "ootp_analytics.db"
USER_CONFIG_PATH = DATA_DIR / "user_config.json"

STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

for d in (DATA_DIR, SAVES_DB_DIR, UPLOADED_SAVES_DIR, STATIC_DIR, TEMPLATES_DIR):
    d.mkdir(parents=True, exist_ok=True)


def _build_candidate_ootp_dirs() -> list[tuple[str, Path]]:
    home = Path(os.path.expanduser("~"))
    appdata = Path(os.environ.get("APPDATA", str(home / "AppData" / "Roaming")))
    localappdata = Path(os.environ.get("LOCALAPPDATA", str(home / "AppData" / "Local")))
    candidates: list[tuple[str, Path]] = []

    env_dir = os.environ.get("OOTP_SAVED_GAMES_DIR", "").strip()
    if env_dir:
        candidates.append(("Environment Variable (OOTP_SAVED_GAMES_DIR)", Path(env_dir)))

    for ver in ("27", "26", "25"):
        candidates.extend([
            (f"OOTP Baseball {ver} — Documents", home / "Documents" / "Out of the Park Developments" / f"OOTP Baseball {ver}" / "saved_games"),
            (f"OOTP Baseball {ver} — OneDrive Documents", home / "OneDrive" / "Documents" / "Out of the Park Developments" / f"OOTP Baseball {ver}" / "saved_games"),
            (f"OOTP Baseball {ver} — AppData Roaming", appdata / "Out of the Park Developments" / f"OOTP Baseball {ver}" / "saved_games"),
            (f"OOTP Baseball {ver} — AppData Local", localappdata / "Out of the Park Developments" / f"OOTP Baseball {ver}" / "saved_games"),
            (f"OOTP Baseball {ver} — Steam (C:)", Path(rf"C:\Program Files (x86)\Steam\steamapps\common\OOTP Baseball {ver}\data\saved_games")),
            (f"OOTP Baseball {ver} — Steam (D:)", Path(rf"D:\SteamLibrary\steamapps\common\OOTP Baseball {ver}\data\saved_games")),
            (f"OOTP Baseball {ver} — macOS Application Support", home / "Library" / "Application Support" / "Out of the Park Developments" / f"OOTP Baseball {ver}" / "saved_games"),
            (f"OOTP Baseball {ver} — Linux Local Share", home / ".local" / "share" / "Out of the Park Developments" / f"OOTP Baseball {ver}" / "saved_games"),
        ])

    # Deduplicate while preserving order
    seen = set()
    unique_candidates = []
    for label, path_obj in candidates:
        norm = str(path_obj).lower()
        if norm not in seen:
            seen.add(norm)
            unique_candidates.append((label, path_obj))
    return unique_candidates


CANDIDATE_OOTP_DIRS = [p for _, p in _build_candidate_ootp_dirs()]
DEFAULT_SAVED_GAMES_DIR = next((p for p in CANDIDATE_OOTP_DIRS if p.exists()), CANDIDATE_OOTP_DIRS[0])


def load_user_config() -> dict:
    default_cfg = {
        "saved_games_dir": str(DEFAULT_SAVED_GAMES_DIR),
        "extra_save_dirs": [],
        "port": int(os.environ.get("OOTP_PORT", "8080")),
        "host": os.environ.get("OOTP_HOST", "0.0.0.0"),
        "app_mode": True,
        "setup_completed": False,
        "default_save_slug": "",
    }
    if USER_CONFIG_PATH.is_file():
        try:
            loaded = json.loads(USER_CONFIG_PATH.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                default_cfg.update(loaded)
        except Exception:
            pass
    return default_cfg


def save_user_config(updates: dict) -> dict:
    cfg = load_user_config()
    cfg.update(updates)
    USER_CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    return cfg


def get_saved_games_dir() -> Path:
    cfg = load_user_config()
    custom_dir = str(cfg.get("saved_games_dir") or "").strip()
    if custom_dir:
        p = Path(custom_dir)
        if p.exists():
            return p
    return next((p for p in CANDIDATE_OOTP_DIRS if p.exists()), Path(custom_dir) if custom_dir else CANDIDATE_OOTP_DIRS[0])


def get_candidate_ootp_dirs_info() -> list[dict]:
    results = []
    cfg = load_user_config()
    active_norm = str(get_saved_games_dir()).lower()
    seen = set()

    custom_dir = str(cfg.get("saved_games_dir") or "").strip()
    all_pairs = _build_candidate_ootp_dirs()
    if custom_dir:
        all_pairs = [("Configured Saved Games Folder", Path(custom_dir))] + all_pairs

    for label, p in all_pairs:
        norm = str(p).lower()
        if norm in seen:
            continue
        seen.add(norm)
        exists = p.is_dir()
        lg_count = 0
        if exists:
            try:
                if p.name.lower().endswith(".lg"):
                    lg_count = 1
                else:
                    lg_count = sum(1 for item in p.iterdir() if item.is_dir() and item.name.lower().endswith(".lg") and item.name != ".lg")
            except Exception:
                lg_count = 0
        # Include if it exists, or is the currently configured path, or is the default OOTP 27 Documents path
        if exists or norm == active_norm or "ootp baseball 27 — documents" in label.lower():
            results.append({
                "label": label,
                "path": str(p),
                "exists": exists,
                "lg_count": lg_count,
                "is_active": norm == active_norm,
            })
    return results


_initial_cfg = load_user_config()
PORT = int(os.environ.get("OOTP_PORT", str(_initial_cfg.get("port", 8080))))
HOST = os.environ.get("OOTP_HOST", str(_initial_cfg.get("host", "0.0.0.0")))

POSITIONS = {
    0: "PH/PR",
    1: "P",
    2: "C",
    3: "1B",
    4: "2B",
    5: "3B",
    6: "SS",
    7: "LF",
    8: "CF",
    9: "RF",
    10: "DH",
}

ROLE_NAMES = {
    11: "SP",
    12: "RP",
    13: "CL",
}

BATS_HAND = {1: "R", 2: "L", 3: "S"}
THROWS_HAND = {1: "R", 2: "L"}

VELOCITY_MAP = {
    1: "75-80 mph",
    2: "80-83 mph",
    3: "83-85 mph",
    4: "84-86 mph",
    5: "85-87 mph",
    6: "86-88 mph",
    7: "87-89 mph",
    8: "88-90 mph",
    9: "89-91 mph",
    10: "90-92 mph",
    11: "91-93 mph",
    12: "92-94 mph",
    13: "93-95 mph",
    14: "94-96 mph",
    15: "95-97 mph",
    16: "96-98 mph",
    17: "97-99 mph",
    18: "98-100 mph",
    19: "99-101 mph",
    20: "100+ mph",
}

VELOCITY_MPH_MID = {
    1: 78.0, 2: 81.5, 3: 84.0, 4: 85.0, 5: 86.0,
    6: 87.0, 7: 88.0, 8: 89.0, 9: 90.0, 10: 91.0,
    11: 92.0, 12: 93.0, 13: 94.0, 14: 95.0, 15: 96.0,
    16: 97.0, 17: 98.0, 18: 99.0, 19: 100.0, 20: 101.5,
}

ARM_SLOTS = {
    1: "Submarine",
    2: "Sidearm",
    3: "Low 3/4",
    4: "3/4 (Normal)",
    5: "Over the Top",
}

AT_BAT_RESULTS = {
    1: {"code": "K", "label": "Strikeout", "is_pa": True, "is_ab": True, "is_hit": False, "is_bip": False, "bases": 0, "color": "#ef4444"},
    2: {"code": "BB", "label": "Walk", "is_pa": True, "is_ab": False, "is_hit": False, "is_bip": False, "bases": 0, "color": "#38bdf8"},
    3: {"code": "IBB", "label": "Intentional Walk", "is_pa": True, "is_ab": False, "is_hit": False, "is_bip": False, "bases": 0, "color": "#38bdf8"},
    4: {"code": "GO", "label": "Groundout / Field Out", "is_pa": True, "is_ab": True, "is_hit": False, "is_bip": True, "bases": 0, "color": "#64748b"},
    5: {"code": "FO", "label": "Flyout / Lineout", "is_pa": True, "is_ab": True, "is_hit": False, "is_bip": True, "bases": 0, "color": "#94a3b8"},
    6: {"code": "1B", "label": "Single", "is_pa": True, "is_ab": True, "is_hit": True, "is_bip": True, "bases": 1, "color": "#22c55e"},
    7: {"code": "2B", "label": "Double", "is_pa": True, "is_ab": True, "is_hit": True, "is_bip": True, "bases": 2, "color": "#eab308"},
    8: {"code": "3B", "label": "Triple", "is_pa": True, "is_ab": True, "is_hit": True, "is_bip": True, "bases": 3, "color": "#f97316"},
    9: {"code": "HR", "label": "Home Run", "is_pa": True, "is_ab": True, "is_hit": True, "is_bip": True, "bases": 4, "color": "#ec4899"},
    10: {"code": "HBP", "label": "Hit By Pitch", "is_pa": True, "is_ab": False, "is_hit": False, "is_bip": False, "bases": 0, "color": "#a855f7"},
    11: {"code": "CI", "label": "Catcher Interference", "is_pa": True, "is_ab": False, "is_hit": False, "is_bip": False, "bases": 0, "color": "#8b5cf6"},
}

AWARD_NAMES = {
    0: "Player of the Week",
    1: "Pitcher of the Month",
    2: "Batter of the Month",
    3: "Rookie of the Month",
    4: "Pitcher of the Year (Cy Young)",
    5: "Most Valuable Player (MVP)",
    6: "Rookie of the Year",
    7: "Gold Glove Award",
    8: "Manager of the Year",
    9: "All-Star Selection",
    10: "Platinum Stick Award",
    11: "Silver Slugger Award",
    12: "Outstanding Reliever",
    13: "Reliever of the Year",
    14: "League Series MVP",
    15: "World Series / Playoff MVP",
}

STREAK_NAMES = {
    0: {"name": "Hitting Streak", "unit": "G", "type": "batting", "icon": "bi-fire"},
    1: {"name": "Scoring Streak (Runs)", "unit": "G", "type": "batting", "icon": "bi-flag-fill"},
    2: {"name": "Home Run Streak", "unit": "G", "type": "batting", "icon": "bi-bullseye"},
    3: {"name": "RBI Streak", "unit": "G", "type": "batting", "icon": "bi-graph-up-arrow"},
    4: {"name": "Consecutive Saves Converted", "unit": "SV", "type": "pitching", "icon": "bi-lock-fill"},
    5: {"name": "Pitching Winning Streak", "unit": "W", "type": "pitching", "icon": "bi-trophy-fill"},
    6: {"name": "Pitching Losing Streak", "unit": "L", "type": "pitching", "icon": "bi-arrow-down-circle-fill"},
    7: {"name": "Undefeated Starts Streak", "unit": "GS", "type": "pitching", "icon": "bi-shield-fill-check"},
    8: {"name": "Consecutive Shutdowns", "unit": "SD", "type": "pitching", "icon": "bi-shield-check"},
    9: {"name": "On-Base Streak", "unit": "G", "type": "batting", "icon": "bi-check2-circle"},
    10: {"name": "Extra-Base Hit Streak", "unit": "G", "type": "batting", "icon": "bi-lightning-charge-fill"},
    11: {"name": "Consecutive Quality Starts", "unit": "QS", "type": "pitching", "icon": "bi-star-fill"},
    12: {"name": "Scoreless Appearances Streak", "unit": "G", "type": "pitching", "icon": "bi-shield-lock-fill"},
    13: {"name": "Consecutive Hits (At-Bats)", "unit": "H", "type": "batting", "icon": "bi-fire"},
    14: {"name": "Consecutive Times On Base (PA)", "unit": "PA", "type": "batting", "icon": "bi-check2-all"},
    15: {"name": "Consecutive Stolen Bases", "unit": "SB", "type": "batting", "icon": "bi-wind"},
    16: {"name": "Consecutive Strikeouts", "unit": "K", "type": "pitching", "icon": "bi-lightning-fill"},
    17: {"name": "Pinch-Hit Hitting Streak", "unit": "PH", "type": "batting", "icon": "bi-person-check-fill"},
    18: {"name": "Pinch-Hit Home Run Streak", "unit": "HR", "type": "batting", "icon": "bi-bullseye"},
    19: {"name": "Scoreless Innings Streak", "unit": "IP", "type": "pitching", "icon": "bi-shield-shaded"},
    20: {"name": "Hitless Innings Streak", "unit": "IP", "type": "pitching", "icon": "bi-slash-circle-fill"},
    21: {"name": "Consecutive Hitless Outs", "unit": "Outs", "type": "pitching", "icon": "bi-award-fill"},
}


def map_hit_to_spray_coords(hit_loc: int, hit_xy: int, result: int, exit_velo: float, launch_angle: float):
    """
    Convert OOTP 27's internal (hit_loc, hit_xy, result, exit_velo, launch_angle) into:
    - angle_deg: Spray angle in degrees where -45 is LF foul pole, 0 is dead CF, +45 is RF foul pole
    - distance_ft: Estimated batted ball landing/fielded distance in feet from home plate
    - zone_code: Human-readable OOTP zone code (e.g. '7LD', '8XD', '6MD', 'HR-LCF')
    - direction: 'Left' (<-15 deg), 'Center' (-15..+15 deg), 'Right' (>+15 deg)
    """
    nx = (hit_xy & 0x0F) / 15.0 - 0.5          # -0.5 to +0.5 jitter
    ny = ((hit_xy >> 4) & 0x0F) / 15.0 - 0.5   # -0.5 to +0.5 jitter

    # Default angle & distance by OOTP field zone
    if hit_loc <= 12:
        # Pitcher / Catcher / Home / Mound / Infield grass
        angle_map = {
            0: (0, 48, "1S"), 1: (0, 60, "1"), 2: (14, 65, "13"), 3: (-14, 65, "15"),
            4: (0, 35, "2S"), 5: (0, 15, "2F"), 6: (25, 45, "23"), 7: (38, 25, "2RF"),
            8: (-25, 45, "25"), 9: (-38, 25, "2LF"), 10: (5, 52, "1M"), 11: (-5, 30, "2"), 12: (0, 75, "1D")
        }
        base_ang, base_dist, zcode = angle_map.get(hit_loc, (0, 55, "IF"))
        angle = base_ang + nx * 16.0
        dist = max(12.0, base_dist + ny * 22.0)
    elif 13 <= hit_loc <= 21:
        # 1B line / Right side infield (3, 3S, 3D, 3F)
        sub = hit_loc - 13
        angle = 32.0 + (sub % 3) * 4.5 + nx * 7.5
        if hit_loc == 19:
            # 3D down the RF line (often doubles)
            dist = 215.0 + ny * 45.0 + max(0.0, (exit_velo - 85.0) * 1.4)
            zcode = "3D"
        elif hit_loc in (14, 16):
            dist = 138.0 + ny * 24.0
            zcode = "3M"
        elif hit_loc in (17, 18, 21):
            angle = 44.0 + abs(nx) * 6.0
            dist = 85.0 + ny * 30.0
            zcode = "3F"
        else:
            dist = 102.0 + ny * 22.0
            zcode = "3"
    elif 22 <= hit_loc <= 27:
        # 2B & 3-4 hole
        angle_table = {22: 26.0, 23: 24.0, 24: 18.0, 25: 16.0, 26: 12.0, 27: 15.0}
        dist_table = {22: 118.0, 23: 152.0, 24: 115.0, 25: 156.0, 26: 96.0, 27: 112.0}
        code_table = {22: "34", 23: "34D", 24: "4M", 25: "4MD", 26: "4S", 27: "4"}
        angle = angle_table[hit_loc] + nx * 7.0
        dist = dist_table[hit_loc] + ny * 22.0
        zcode = code_table[hit_loc]
    elif 28 <= hit_loc <= 34:
        # Shortstop & 6-hole / up the middle
        angle_table = {28: 4.0, 29: -6.0, 30: -8.0, 31: -14.0, 32: -17.0, 33: -22.0, 34: -12.0}
        dist_table = {28: 124.0, 29: 118.0, 30: 156.0, 31: 114.0, 32: 154.0, 33: 90.0, 34: 95.0}
        code_table = {28: "6M", 29: "6MS", 30: "6MD", 31: "6", 32: "6D", 33: "6F", 34: "6S"}
        angle = angle_table[hit_loc] + nx * 7.0
        dist = dist_table[hit_loc] + ny * 22.0
        zcode = code_table[hit_loc]
    elif 35 <= hit_loc <= 43:
        # 3B & 5-6 hole (left side infield)
        if hit_loc == 35:
            # Down the LF line (5D)
            angle = -39.0 + nx * 5.5
            dist = 215.0 + ny * 45.0 + max(0.0, (exit_velo - 85.0) * 1.4)
            zcode = "5D"
        else:
            angle_table = {36: -31.0, 37: -44.0, 38: -25.0, 39: -24.0, 40: -33.0, 41: -27.0, 42: -35.0, 43: -30.0}
            dist_table = {36: 104.0, 37: 88.0, 38: 118.0, 39: 155.0, 40: 112.0, 41: 152.0, 42: 96.0, 43: 108.0}
            code_table = {36: "5", 37: "5F", 38: "56", 39: "56D", 40: "5M", 41: "5MD", 42: "5S", 43: "5"}
            angle = angle_table.get(hit_loc, -30.0) + nx * 6.5
            dist = dist_table.get(hit_loc, 110.0) + ny * 22.0
            zcode = code_table.get(hit_loc, "5")
    elif 44 <= hit_loc <= 56:
        # Left Field (7L, 7LS, 7LM, 7LD, 7S, 7M, 7D)
        lf_map = {
            44: (-40.0, 275.0, "7LM"),
            45: (-39.0, 235.0, "7LS"),
            46: (-38.0, 198.0, "7L"),
            47: (-40.5, 318.0, "7LD"),
            48: (-30.0, 295.0, "7D"),
            49: (-31.0, 330.0, "7XD"),
            50: (-44.0, 250.0, "7LF"),
            51: (-26.0, 265.0, "7M"),
            52: (-45.0, 210.0, "7LSF"),
            53: (-25.0, 215.0, "7S"),
            54: (-45.0, 175.0, "7F"),
            55: (-29.0, 255.0, "7"),
            56: (-28.0, 195.0, "7S"),
        }
        base_ang, base_dist, zcode = lf_map.get(hit_loc, (-30.0, 260.0, "7"))
        angle = base_ang + nx * 6.5
        dist = base_dist + ny * 28.0 + max(-20.0, min(35.0, (exit_velo - 90.0) * 1.1))
    elif 57 <= hit_loc <= 68:
        # Left-Center, Center Field, Right-Center (78, 8, 89)
        cf_map = {
            57: (-17.0, 280.0, "78M"),
            58: (-16.0, 240.0, "78S"),
            59: (-15.0, 195.0, "78"),
            60: (-18.0, 342.0, "78D"),
            61: (-4.0, 295.0, "8LM"),
            62: (-2.0, 250.0, "8"),
            63: (-1.0, 198.0, "8S"),
            64: (-5.0, 358.0, "8LXD"),
            65: (5.0, 295.0, "8RM"),
            66: (3.0, 252.0, "8M"),
            67: (2.0, 198.0, "8RS"),
            68: (8.0, 360.0, "8RXD"),
        }
        base_ang, base_dist, zcode = cf_map.get(hit_loc, (0.0, 275.0, "8"))
        angle = base_ang + nx * 6.5
        dist = base_dist + ny * 30.0 + max(-20.0, min(38.0, (exit_velo - 90.0) * 1.2))
    elif 69 <= hit_loc <= 86:
        # Right-Center & Right Field (89, 9, 9L)
        rf_map = {
            69: (17.0, 305.0, "89D"),
            70: (18.0, 345.0, "89XD"),
            71: (25.0, 280.0, "89M"),
            72: (26.0, 275.0, "9M"),
            73: (44.0, 220.0, "9LSF"),
            74: (25.0, 225.0, "9S"),
            75: (45.0, 185.0, "9F"),
            76: (29.0, 258.0, "9"),
            77: (28.0, 198.0, "9S"),
            79: (38.0, 318.0, "9LD"),
            80: (35.0, 300.0, "9D"),
            84: (39.0, 335.0, "9LXD"),
            85: (40.5, 315.0, "9LM"),
            86: (42.0, 160.0, "9LF"),
        }
        base_ang, base_dist, zcode = rf_map.get(hit_loc, (29.0, 265.0, "9"))
        angle = base_ang + nx * 6.5
        dist = base_dist + ny * 28.0 + max(-20.0, min(35.0, (exit_velo - 90.0) * 1.1))
    elif hit_loc == 87:
        angle = nx * 28.0
        dist = 68.0 + ny * 20.0
        zcode = "15S"
    elif hit_loc >= 98:
        # Home Runs beyond the wall (98=LF pole .. 105=RF pole)
        hr_map = {
            98: (-40.5, 358.0, "HR-LFL"),
            99: (-29.5, 382.0, "HR-LF"),
            100: (-16.5, 398.0, "HR-LCF"),
            101: (-6.5, 412.0, "HR-CF"),
            102: (3.5, 415.0, "HR-CF"),
            103: (15.5, 398.0, "HR-RCF"),
            104: (28.5, 382.0, "HR-RF"),
            105: (40.0, 356.0, "HR-RFL"),
        }
        base_ang, base_dist, zcode = hr_map.get(hit_loc, (0.0, 395.0, "HR"))
        angle = base_ang + nx * 6.8
        # Scale HR distance realistically using Exit Velocity and Launch Angle
        ev_boost = max(-15.0, (exit_velo - 102.0) * 3.1) if exit_velo > 0 else 0.0
        la_penalty = -abs(launch_angle - 28.5) * 0.9 if launch_angle > 0 else 0.0
        dist = max(332.0, min(495.0, base_dist + ev_boost + la_penalty + ny * 16.0))
    else:
        angle = nx * 40.0
        dist = 180.0 + ny * 40.0
        zcode = "BIP"

    angle = max(-47.0, min(47.0, angle))
    dist = round(float(dist), 1)
    angle = round(float(angle), 1)

    if angle < -15.0:
        direction = "Left"
    elif angle > 15.0:
        direction = "Right"
    else:
        direction = "Center"

    return {
        "angle_deg": angle,
        "distance_ft": dist,
        "zone_code": zcode,
        "direction": direction,
    }
