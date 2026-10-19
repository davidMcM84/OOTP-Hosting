import sys
import time
import socket
import threading
import webbrowser
import subprocess

from setup_wizard import ensure_dependencies, run_wizard

ensure_dependencies(auto_install=True)

import uvicorn
from app.config import HOST, PORT
from app.ingestor import discover_all_saves, get_active_save_slug, ingest_save_to_sqlite


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def open_browser_when_ready(url: str, app_mode: bool = False):
    for _ in range(30):
        if is_port_in_use(PORT):
            break
        time.sleep(0.25)
    if app_mode:
        # Try launching Microsoft Edge or Chrome in sleek standalone desktop app mode
        for browser_cmd in [
            ["cmd", "/c", "start", "msedge", f"--app={url}"],
            ["cmd", "/c", "start", "chrome", f"--app={url}"],
        ]:
            try:
                subprocess.Popen(browser_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return
            except Exception:
                pass
    webbrowser.open(url)


def main():
    if "--cli-setup" in sys.argv or "--verify" in sys.argv:
        run_wizard()
        return

    open_setup = "--setup" in sys.argv
    open_browser = "--open-browser" in sys.argv or "--app" in sys.argv or open_setup
    app_mode = "--app" in sys.argv
    url = f"http://localhost:{PORT}" + ("/?setup=1" if open_setup else "")

    print("=" * 72)
    print("  OOTP 27 LOCAL ANALYTICS, STATCAST & LEAGUE HOSTING SUITE")
    print(f"  Listening on: {url}")
    print("=" * 72)

    if is_port_in_use(PORT):
        print(f"[INFO] Server is already running on {url}. Opening interface...")
        if open_browser:
            open_browser_when_ready(url, app_mode=app_mode)
        return

    saves = discover_all_saves()
    has_csv_save = any(int(s.get("csv_count") or 0) >= 5 for s in saves)
    if not has_csv_save:
        print("[SETUP] No local saves with CSV exports found yet — generating bundled OOTP27_Demo_League.lg...")
        try:
            from app.setup_engine import generate_demo_save
            generate_demo_save("OOTP27_Demo_League")
            saves = discover_all_saves()
            if not open_setup:
                url = f"http://localhost:{PORT}/?setup=1"
        except Exception as exc:
            print(f"[WARN] Demo save generation notice: {exc}")

    active_slug = get_active_save_slug()
    print(f"[INFO] Discovered {len(saves)} OOTP 27 saves. Active save: {active_slug}")
    try:
        ingest_save_to_sqlite(active_slug, force=False)
    except Exception as exc:
        print(f"[WARN] Initial ingestion notice: {exc}")

    if open_browser:
        threading.Thread(target=open_browser_when_ready, args=(url, app_mode), daemon=True).start()

    uvicorn.run("app.api:app", host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()

