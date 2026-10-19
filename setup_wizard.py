"""
OOTP 27 Local Analytics, Statcast & League Hosting Suite — Interactive Setup & Verification Wizard
==================================================================================================
Ensures 100% out-of-the-box functionality on any machine:
1. Checks Python 3.10+ runtime and automatically installs/verifies requirements.txt dependencies.
2. Auto-detects OOTP Baseball 27/26/25 saved_games folders (or accepts a custom path).
3. Discovers .lg saves, or generates a full multi-season Demo League (OOTP27_Demo_League.lg) if no CSV exports exist yet.
4. Ingests the active save into SQLite and executes an 8-point end-to-end functionality self-test.
5. Optionally creates the Windows Desktop Shortcut and launches the standalone web suite.

Usage:
  python setup_wizard.py            # Interactive step-by-step setup wizard
  python setup_wizard.py --auto     # Unattended setup, demo fallback if needed, & 8-point verification
  python setup_wizard.py --verify   # Run the 8-point functionality verification suite and exit
  python setup_wizard.py --demo     # Generate/refresh the bundled OOTP27_Demo_League.lg save and verify
"""

import os
import sys
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
REQUIREMENTS_FILE = BASE_DIR / "requirements.txt"


def print_banner():
    print("=" * 78)
    print("  OOTP 27 LOCAL ANALYTICS, STATCAST & LEAGUE HOSTING SUITE - SETUP WIZARD")
    print("=" * 78)


def ensure_dependencies(auto_install: bool = True) -> bool:
    """
    Checks for required packages before importing app modules.
    Automatically runs 'pip install -r requirements.txt' if any package is missing.
    """
    required_First_check = ["uvicorn", "starlette", "pandas", "numpy", "aiofiles"]
    missing = []
    for mod_name in required_First_check:
        try:
            __import__(mod_name)
        except ImportError:
            missing.append(mod_name)

    if not missing:
        return True

    print(f"[SETUP] Missing Python packages detected: {', '.join(missing)}")
    if not auto_install:
        print(f"[SETUP] Please run: {sys.executable} -m pip install -r requirements.txt")
        return False

    print(f"[SETUP] Installing dependencies from {REQUIREMENTS_FILE.name} ...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(REQUIREMENTS_FILE)])
        print("[SETUP] All required Python dependencies installed successfully.\n")
        return True
    except Exception as exc:
        print(f"[ERROR] Failed to install dependencies automatically: {exc}")
        return False


def print_verification_table(report: dict):
    print("\n" + "-" * 78)
    print(f"  8-POINT FUNCTIONALITY VERIFICATION REPORT (Save: {report.get('save_slug')})")
    print("-" * 78)
    for chk in report.get("checks", []):
        st = chk["status"].upper()
        badge = "[PASS]" if st == "PASS" else ("[WARN]" if st == "WARN" else "[FAIL]")
        print(f"  {badge:<6} {chk['name']:<52} ({chk['duration_ms']:>6.1f} ms)")
        print(f"         -> {chk['detail']}")
    print("-" * 78)
    print(
        f"  OVERALL STATUS: {report.get('overall_status', 'unknown').upper()} "
        f"({report.get('passed')}/{report.get('total')} checks passed in {report.get('total_duration_ms')} ms)"
    )
    print("-" * 78 + "\n")


def run_wizard():
    print_banner()

    if sys.version_info < (3, 10):
        print(f"[ERROR] Python 3.10+ is required. Current version: {sys.version}")
        sys.exit(1)

    auto_mode = "--auto" in sys.argv or "--verify" in sys.argv or "--demo" in sys.argv
    verify_only = "--verify" in sys.argv
    force_demo = "--demo" in sys.argv

    # Step 1: Ensure Python packages
    print("[STEP 1/4] Verifying Python Runtime & Package Dependencies...")
    if not ensure_dependencies(auto_install=True):
        sys.exit(1)

    from app.setup_engine import (
        get_setup_status,
        update_setup_config,
        generate_demo_save,
        run_functionality_verification,
        create_desktop_shortcut_action,
    )
    from app.ingestor import ingest_save_to_sqlite, set_active_save_slug

    status = get_setup_status()
    env = status["environment"]
    print(f"  -> Python {env['python_version']} on {env['platform']}")
    print(f"  -> SQLite {env['sqlite_version']} | Free Disk Space: {env['disk_free_gb']} GB")

    if verify_only:
        report = run_functionality_verification()
        print_verification_table(report)
        sys.exit(0 if report["overall_status"] in ("healthy", "warning") else 1)

    if force_demo:
        print("\n[DEMO] Generating & ingesting bundled OOTP27_Demo_League.lg save...")
        demo_res = generate_demo_save("OOTP27_Demo_League")
        print(f"  -> Created Demo Save at: {demo_res['folder_path']}")
        report = run_functionality_verification(demo_res["save_slug"])
        print_verification_table(report)
        sys.exit(0)

    # Step 2: Configure OOTP Saved Games Directory
    print("\n[STEP 2/4] OOTP Baseball Saved Games Directory Discovery...")
    print(f"  -> Active Path: {status['saved_games_dir']} ({'EXISTS' if status['saved_games_dir_exists'] else 'NOT FOUND'})")
    for idx, cd in enumerate(status["candidate_dirs"], start=1):
        tag = "ACTIVE" if cd["is_active"] else ("FOUND" if cd["exists"] else "MISSING")
        print(f"     [{idx}] [{tag}] {cd['label']}: {cd['path']} ({cd['lg_count']} .lg saves)")

    if not auto_mode:
        user_path = input("\n  Press ENTER to keep current path, or paste a custom OOTP saved_games / .lg path: ").strip()
        if user_path:
            status = update_setup_config({"saved_games_dir": user_path})
            print(f"  -> Updated path to: {status['saved_games_dir']}")

    # Step 3: Save Discovery, Demo Fallback & SQLite Ingestion
    print("\n[STEP 3/4] Auditing Discovered OOTP Saves & CSV Exports...")
    saves = status["saves"]
    ready_saves = [s for s in saves if s["readiness"] == "ready_full"]

    if saves:
        for idx, s in enumerate(saves, start=1):
            act = "*" if s["is_active"] else " "
            print(f"  {act} [{idx}] {s['save_name']} ({s['save_slug']}) -> {s['readiness_label']}")
    else:
        print("  -> No .lg save folders found in the configured directory.")

    if not ready_saves:
        print("\n  [NOTICE] No saves with exported CSV tables were found yet.")
        create_demo = True
        if not auto_mode:
            ans = input("  Would you like to generate the bundled 16-Team Demo League so all analytics work immediately? [Y/n]: ").strip().lower()
            create_demo = ans in ("", "y", "yes")
        if create_demo:
            print("  -> Generating 'OOTP27_Demo_League.lg' (16 MLB Teams, 480+ Players, 1,400+ Statcast Events)...")
            demo_res = generate_demo_save("OOTP27_Demo_League")
            print(f"  -> Demo League ingested: {demo_res['save_slug']}")
            status = get_setup_status()
    else:
        if not auto_mode and len(ready_saves) > 1:
            choice = input(f"\n  Press ENTER to use '{status['active_save']}', or enter save number [1-{len(saves)}]: ").strip()
            if choice.isdigit() and 1 <= int(choice) <= len(saves):
                chosen_save = saves[int(choice) - 1]["save_slug"]
                print(f"  -> Ingesting & activating '{chosen_save}'...")
                ingest_save_to_sqlite(chosen_save, force=False)
                set_active_save_slug(chosen_save)
                update_setup_config({"default_save_slug": chosen_save})

    # Step 4: Run 8-Point Functionality Verification
    print("\n[STEP 4/4] Running 8-Point End-to-End Functionality Verification Suite...")
    report = run_functionality_verification()
    print_verification_table(report)

    update_setup_config({"setup_completed": True})

    if not auto_mode:
        if os.name == "nt":
            sc_ans = input("  Create/Update Windows Desktop Shortcut ('OOTP 27 Analytics & Hosting Hub')? [Y/n]: ").strip().lower()
            if sc_ans in ("", "y", "yes"):
                sc_res = create_desktop_shortcut_action()
                if sc_res.get("ok"):
                    print(f"  -> Created Desktop Shortcut: {sc_res.get('shortcut_path')}")
                else:
                    print(f"  -> Shortcut notice: {sc_res.get('error') or sc_res.get('output')}")

        launch_ans = input("\n  Launch OOTP 27 Analytics & Hosting Suite server now? [Y/n]: ").strip().lower()
        if launch_ans in ("", "y", "yes"):
            subprocess.call([sys.executable, str(BASE_DIR / "run_server.py"), "--app"])


if __name__ == "__main__":
    run_wizard()
