import os
import sqlite3
from pathlib import Path
from starlette.applications import Starlette
from starlette.responses import JSONResponse, HTMLResponse, FileResponse, Response
from starlette.routing import Route, Mount
from starlette.staticfiles import StaticFiles

from app.config import STATIC_DIR, TEMPLATES_DIR, HOST_DB_PATH
from app.ingestor import (
    discover_all_saves,
    get_active_save_slug,
    set_active_save_slug,
    ingest_save_to_sqlite,
    import_online_league_archive,
)
from app.analytics import (
    get_save_overview,
    get_sabermetric_leaderboards,
    get_spray_chart_data,
    get_game_logs_and_replay,
    get_player_profile,
    get_projections_suite,
    get_statsplus_reports,
    get_team_dashboard,
    get_league_evolution_hub,
    get_league_leaders_hub,
    get_league_records_book,
    get_hall_of_fame_hub,
    get_stretch_hub,
    get_world_dashboard,
    get_newspaper_front_page,
    safe_int,
)
from app.bnn_generator import (
    get_save_html_dir,
    get_save_folder_path,
    list_available_bnn_reports,
    resolve_bnn_file_path,
    rewrite_ootp_html_content,
    generate_dynamic_bnn_html,
)


async def index_page(request):
    index_file = TEMPLATES_DIR / "index.html"
    if not index_file.exists():
        return HTMLResponse("<h1>OOTP 27 Analytics Suite Loading...</h1>")
    return HTMLResponse(
        index_file.read_text(encoding="utf-8"),
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


async def api_saves(request):
    saves = discover_all_saves()
    active = get_active_save_slug()
    return JSONResponse({"active_save": active, "saves": saves})


async def api_select_save(request):
    body = await request.json()
    save_slug = body.get("save_slug") or get_active_save_slug()
    force = bool(body.get("force", False))
    source_label = body.get("source_label") or None
    res = ingest_save_to_sqlite(save_slug, force=force, source_label=source_label)
    set_active_save_slug(save_slug)
    return JSONResponse({"status": "ok", "active_save": save_slug, "ingestion": res})


async def api_upload_online_save(request):
    body = await request.body()
    save_name = request.query_params.get("name", "Online_League_Import")
    if not body:
        return JSONResponse({"error": "Empty archive body"}, status_code=400)
    res = import_online_league_archive(body, save_name)
    return JSONResponse({"status": "ok", "ingestion": res})


async def api_overview(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    team_id = safe_int(request.query_params.get("team_id"), 0) or None
    year = safe_int(request.query_params.get("year"), 0) or None
    data = get_save_overview(save_slug, league_id=league_id, team_id=team_id, year=year)
    return JSONResponse(data)


async def api_sabermetrics(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    team_id = safe_int(request.query_params.get("team_id"), 0) or None
    split_id = safe_int(request.query_params.get("split_id"), 1)
    min_pa = safe_int(request.query_params.get("min_pa"), 0)
    min_ip = safe_int(request.query_params.get("min_ip"), 0)
    year = safe_int(request.query_params.get("year"), 0) or None
    data = get_sabermetric_leaderboards(
        save_slug, league_id=league_id, team_id=team_id, split_id=split_id, min_pa=min_pa, min_ip=min_ip, year=year
    )
    return JSONResponse(data)


async def api_spray(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    player_id = safe_int(request.query_params.get("player_id"), 0) or None
    opponent_id = safe_int(request.query_params.get("opponent_id"), 0) or None
    team_id = safe_int(request.query_params.get("team_id"), 0) or None
    game_id = safe_int(request.query_params.get("game_id"), 0) or None
    raw_park = str(request.query_params.get("park_id", "")).strip().upper()
    if raw_park in ("ALL", "-1"):
        park_id = -1
    else:
        park_id = safe_int(raw_park, 0) or None
    result_filter = request.query_params.get("result", "ALL")
    limit = safe_int(request.query_params.get("limit"), 1000)
    data = get_spray_chart_data(
        save_slug,
        player_id=player_id,
        opponent_id=opponent_id,
        team_id=team_id,
        game_id=game_id,
        park_id=park_id,
        result_filter=result_filter,
        limit=limit,
    )
    return JSONResponse(data)


async def api_games(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    game_id = safe_int(request.query_params.get("game_id"), 0) or None
    team_id = safe_int(request.query_params.get("team_id"), 0) or None
    limit = safe_int(request.query_params.get("limit"), 120)
    data = get_game_logs_and_replay(save_slug, game_id=game_id, team_id=team_id, limit=limit)
    return JSONResponse(data)


async def api_player(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    player_id = safe_int(request.path_params.get("player_id"), 0)
    data = get_player_profile(save_slug, player_id)
    return JSONResponse(data)


async def api_projections(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    team_id = safe_int(request.query_params.get("team_id"), 0) or None
    year = safe_int(request.query_params.get("year"), 0) or None
    data = get_projections_suite(save_slug, league_id=league_id, team_id=team_id, year=year)
    return JSONResponse(data)


async def api_statsplus(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    team_id = safe_int(request.query_params.get("team_id"), 0) or None
    year = safe_int(request.query_params.get("year"), 0) or None
    data = get_statsplus_reports(save_slug, league_id=league_id, team_id=team_id, year=year)
    return JSONResponse(data)


async def api_team_dashboard(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    team_id = safe_int(request.query_params.get("team_id"), 0) or None
    year = safe_int(request.query_params.get("year"), 0) or None
    data = get_team_dashboard(save_slug, team_id=team_id, league_id=league_id, year=year)
    return JSONResponse(data)


async def api_evolution(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    year = safe_int(request.query_params.get("year"), 0) or None
    data = get_league_evolution_hub(save_slug, league_id=league_id, year=year)
    return JSONResponse(data)


async def api_evolution_roadmap(request):
    from app.evolution_engine import get_saved_roadmap, save_custom_roadmap
    if request.method == "POST":
        body = await request.json()
        save_slug = body.get("save_slug") or request.query_params.get("save") or get_active_save_slug()
        league_id = safe_int(body.get("league_id") or request.query_params.get("league_id"), 200)
        res = save_custom_roadmap(save_slug, league_id, body)
        return JSONResponse(res)
    else:
        save_slug = request.query_params.get("save") or get_active_save_slug()
        league_id = safe_int(request.query_params.get("league_id"), 200)
        saved = get_saved_roadmap(save_slug, league_id)
        return JSONResponse({"ok": True, "roadmap": saved})


async def api_leaders(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    year = safe_int(request.query_params.get("year"), 0) or None
    split_id = safe_int(request.query_params.get("split_id"), 1)
    data = get_league_leaders_hub(save_slug, league_id=league_id, year=year, split_id=split_id)
    return JSONResponse(data)


async def api_records(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    data = get_league_records_book(save_slug, league_id=league_id)
    return JSONResponse(data)


async def api_hof(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    data = get_hall_of_fame_hub(save_slug, league_id=league_id)
    return JSONResponse(data)


async def api_stretch(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    league_ids_str = request.query_params.get("league_ids") or None
    year = safe_int(request.query_params.get("year"), 0) or None
    data = get_stretch_hub(save_slug, league_id=league_id, league_ids_str=league_ids_str, year=year)
    return JSONResponse(data)


async def api_world_dashboard(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    year = safe_int(request.query_params.get("year"), 0) or None
    data = get_world_dashboard(save_slug, year=year)
    return JSONResponse(data)


async def api_frontpage(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    year = safe_int(request.query_params.get("year"), 0) or None
    headline_mode = request.query_params.get("headline_mode") or "auto"
    data = get_newspaper_front_page(save_slug, league_id=league_id, year=year, headline_mode=headline_mode)
    return JSONResponse(data)


async def api_bnn_catalog(request):
    save_slug = request.query_params.get("save") or get_active_save_slug()
    league_id = safe_int(request.query_params.get("league_id"), 0) or None
    return JSONResponse(list_available_bnn_reports(save_slug, league_id=league_id))


async def serve_bnn_report(request):
    save_slug = request.path_params.get("save_slug") or get_active_save_slug()
    rel_path = request.path_params.get("path") or "index.html"
    html_dir = get_save_html_dir(save_slug)

    resolved = resolve_bnn_file_path(html_dir, rel_path, save_slug=save_slug)
    if resolved and resolved.is_file():
        if resolved.suffix.lower() in (".html", ".htm"):
            conn = sqlite3.connect(HOST_DB_PATH)
            conn.row_factory = sqlite3.Row
            meta = conn.execute("SELECT primary_league_id FROM saves_registry WHERE save_slug = ?", (save_slug,)).fetchone()
            conn.close()
            lid = meta["primary_league_id"] if meta else 200
            raw_html = resolved.read_text(encoding="utf-8", errors="ignore")
            enhanced = rewrite_ootp_html_content(raw_html, save_slug, rel_path, primary_league_id=lid)
            return HTMLResponse(enhanced)
        return FileResponse(str(resolved))

    # If HTML page is missing on disk, dynamically render a BNN-compatible page from SQLite!
    if rel_path.endswith(".html") or rel_path.endswith(".htm"):
        dyn_html = generate_dynamic_bnn_html(save_slug, rel_path)
        if dyn_html:
            return HTMLResponse(dyn_html)

    # Fallback transparent/themed SVG if an old BNN spacer image is missing
    if rel_path.lower().endswith((".png", ".gif", ".jpg", ".jpeg")):
        svg = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" rx="8" fill="#1f1f20"/></svg>'
        return Response(svg, media_type="image/svg+xml")

    return HTMLResponse("<h3>Report Not Found</h3>", status_code=404)


async def serve_ootp_asset(request):
    """
    Serves team logos, league logos, ballpark previews (.webp), or player/coach portraits
    from the save's news/html/images or import_export folder, with clean SVG fallback crests/avatars.
    """
    save_slug = request.path_params.get("save_slug") or get_active_save_slug()
    asset_type = request.path_params.get("asset_type")
    filename = request.path_params.get("filename", "")
    html_dir = get_save_html_dir(save_slug)
    folder_path = get_save_folder_path(save_slug)

    if asset_type == "import_export" and folder_path and filename:
        ie_cand = (folder_path / "import_export" / filename).resolve()
        if str(ie_cand).startswith(str((folder_path / "import_export").resolve())) and ie_cand.is_file():
            return FileResponse(str(ie_cand))

    if html_dir and filename:
        folder_map = {
            "team_logo": "images/team_logos",
            "league_logo": "images/league_logos",
            "player_pic": "images/person_pictures",
        }
        sub = folder_map.get(asset_type, "images")
        cand = (html_dir / sub / filename).resolve()
        if cand.is_file():
            return FileResponse(str(cand))

    # Generate high-craft SVG fallback in the White-on-Black palette
    label = Path(filename).stem[:3].upper() if filename else "MLB"
    if asset_type == "player_pic":
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 135">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0a0a0a"/><stop offset="100%" stop-color="#1f1f20"/></linearGradient></defs>
        <rect width="90" height="135" rx="10" fill="url(#g)" stroke="#5f6062" stroke-width="2"/>
        <circle cx="45" cy="46" r="20" fill="#373839"/>
        <path d="M15 122 C15 86 75 86 75 122 Z" fill="#373839"/>
        </svg>"""
    else:
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
        <defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1f1f20"/><stop offset="100%" stop-color="#0a0a0a"/></linearGradient></defs>
        <circle cx="40" cy="40" r="36" fill="url(#tg)" stroke="#5f6062" stroke-width="3"/>
        <text x="40" y="46" text-anchor="middle" fill="#dbdbdb" font-family="system-ui,sans-serif" font-weight="800" font-size="18">{label}</text>
        </svg>"""
    return Response(svg, media_type="image/svg+xml")


async def api_setup_status(request):
    from app.setup_engine import get_setup_status
    return JSONResponse(get_setup_status())


async def api_setup_config(request):
    from app.setup_engine import update_setup_config
    body = await request.json()
    return JSONResponse(update_setup_config(body))


async def api_setup_browse(request):
    from app.setup_engine import browse_native_folder
    try:
        body = await request.json()
    except Exception:
        body = {}
    return JSONResponse(browse_native_folder(body.get("initial_dir")))


async def api_setup_demo(request):
    from app.setup_engine import generate_demo_save
    try:
        body = await request.json()
    except Exception:
        body = {}
    save_name = body.get("save_name") or "OOTP27_Demo_League"
    return JSONResponse(generate_demo_save(save_name))


async def api_setup_verify(request):
    from app.setup_engine import run_functionality_verification
    try:
        body = await request.json()
    except Exception:
        body = {}
    save_slug = body.get("save_slug") or request.query_params.get("save") or None
    return JSONResponse(run_functionality_verification(save_slug))


async def api_setup_shortcut(request):
    from app.setup_engine import create_desktop_shortcut_action
    return JSONResponse(create_desktop_shortcut_action())


routes = [
    Route("/", index_page),
    Route("/api/setup/status", api_setup_status),
    Route("/api/setup/config", api_setup_config, methods=["POST"]),
    Route("/api/setup/browse", api_setup_browse, methods=["POST"]),
    Route("/api/setup/demo", api_setup_demo, methods=["POST"]),
    Route("/api/setup/verify", api_setup_verify, methods=["GET", "POST"]),
    Route("/api/setup/shortcut", api_setup_shortcut, methods=["POST"]),
    Route("/api/saves", api_saves),
    Route("/api/saves/select", api_select_save, methods=["POST"]),
    Route("/api/saves/upload", api_upload_online_save, methods=["POST"]),
    Route("/api/overview", api_overview),
    Route("/api/frontpage", api_frontpage),
    Route("/api/stretch", api_stretch),
    Route("/api/world_dashboard", api_world_dashboard),
    Route("/api/sabermetrics", api_sabermetrics),
    Route("/api/spray", api_spray),
    Route("/api/games", api_games),
    Route("/api/player/{player_id:int}", api_player),
    Route("/api/projections", api_projections),
    Route("/api/statsplus", api_statsplus),
    Route("/api/team_dashboard", api_team_dashboard),
    Route("/api/evolution", api_evolution),
    Route("/api/evolution/roadmap", api_evolution_roadmap, methods=["GET", "POST"]),
    Route("/api/leaders", api_leaders),
    Route("/api/records", api_records),
    Route("/api/hof", api_hof),
    Route("/api/bnn/catalog", api_bnn_catalog),
    Route("/bnn/{save_slug:str}/{path:path}", serve_bnn_report),
    Route("/ootp_asset/{save_slug:str}/{asset_type:str}/{filename:path}", serve_ootp_asset),
    Mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static"),
]

_starlette_app = Starlette(debug=False, routes=routes)


class NoCacheMiddleware:
    def __init__(self, app_inner):
        self.app = app_inner

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = [
                    (k, v)
                    for (k, v) in message.get("headers", [])
                    if k.lower() not in (b"cache-control", b"pragma", b"expires")
                ]
                headers.append((b"cache-control", b"no-store, no-cache, must-revalidate, max-age=0"))
                headers.append((b"pragma", b"no-cache"))
                headers.append((b"expires", b"0"))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)


app = NoCacheMiddleware(_starlette_app)
