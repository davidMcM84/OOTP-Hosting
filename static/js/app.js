// OOTP 27 Local Analytics, Sabermetrics, Statcast & BNN Reporting Suite — Core Application Controller

const AppState = {
  activeSave: "",
  activeLeagueId: null,
  activeYear: null,
  activeDump: null,
  activeTeamId: null,
  activeTab: "frontpage",
  frontPageData: null,
  frontPageHeadlineMode: "auto", // auto | matchup | champions | phillies_fire | hot_streak | superstar
  frontPagePaperTheme: "dark", // dark | light
  stretchData: null,
  stretchLeagueIds: [],
  worldData: null,
  worldTalentMode: "tiers", // tiers | ages
  worldOrgSearch: "",
  worldSelectedOrgId: null,
  teamHubSubTab: "depth", // depth | strengths | roadmap | roster | command
  selectedDepthPos: "SS",
  saberSubTab: "batting", // batting | pitching | split_saber | proj_teams | proj_batters | proj_pitchers | split_proj
  saberFilterSearch: "",
  saberFilterTeam: "",
  saberFilterPos: "",
  evolutionSubTab: "readiness", // readiness | health | workshop | history | vault
  statsPlusSubTab: "dev", // dev | prospects | contracts | trades | trade_machine | news | all_sp
  sideDockOpen: false,
  dockedPlayerId: null,
  activeModalPlayerId: null,
  compactDensity: false,
  bnnSplitMode: false,
  bnnActivePane: "left",
  bnnLeftPath: null,
  bnnRightPath: null,
  saves: [],
  overview: null,
  teamDashboard: null,
  teamLb: null,
  teamSpray: null,
  sabermetrics: null,
  spray: null,
  gamesData: null,
  replayStep: null,
  replayPlaying: false,
  replaySpeedMs: 1100,
  replayTimer: null,
  projections: null,
  evolutionData: null,
  statsplus: null,
  bnnCatalog: null,
  leadersData: null,
  leadersCategoryTab: "batting", // batting | pitching | fielding | statcast | table
  leadersQualMode: "qualified", // qualified | half | all
  leadersSubLeague: "ALL",
  leadersTeam: "",
  leadersPos: "",
  leadersPitcherRole: "ALL", // ALL | SP | RP
  leadersTableDomain: "batting", // batting | pitching | fielding
  recordsData: null,
  recordsSubTab: "side_by_side", // side_by_side | season_records | career_records | single_game | streaks | teams
  recordsDomain: "batting", // batting | pitching | fielding
  recordsSelectedMetric: "hr",
  hofData: null,
  hofSubTab: "plaques", // plaques | jaws_pos | classes | ballot | active_watch
  hofPosFilter: "ALL",
  hofSearch: "",
  tradeSideA: [],
  tradeSideB: [],
};

function fmtMoney(val) {
  const n = Number(val) || 0;
  if (n === 0) return "$0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtAvg(val) {
  const n = Number(val) || 0;
  return n.toFixed(3).replace(/^0/, "");
}

function teamLogoUrl(logoFile, saveSlug) {
  const s = saveSlug || AppState.activeSave || "american_baseball_system";
  const fn = logoFile || "default_team.png";
  return `/ootp_asset/${s}/team_logo/${encodeURIComponent(fn)}`;
}

function playerPicUrl(playerId, saveSlug) {
  const s = saveSlug || AppState.activeSave || "american_baseball_system";
  return `/ootp_asset/${s}/player_pic/player_${playerId}.png`;
}

function baseDiamondSvg(b1, b2, b3) {
  const c1 = b1 ? "#facc15" : "#373839";
  const c2 = b2 ? "#facc15" : "#373839";
  const c3 = b3 ? "#facc15" : "#373839";
  return `
    <svg width="28" height="22" viewBox="0 0 28 22" class="inline-block align-middle">
      <rect x="11" y="2" width="6" height="6" fill="${c2}" transform="rotate(45 14 5)" />
      <rect x="18" y="9" width="6" height="6" fill="${c1}" transform="rotate(45 21 12)" />
      <rect x="4" y="9" width="6" height="6" fill="${c3}" transform="rotate(45 7 12)" />
    </svg>
  `;
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.json();
}

function parseSortableCellValue(rawText) {
  const s = String(rawText || "").trim();
  if (!s || s === "-" || s === "—") return { isNum: true, val: -999999 };
  // Currency ($12.50M, -$3.20M, $450K)
  const moneyMatch = s.match(/^([+-]?)\$(\d+(?:\.\d+)?)([MK]?)$/i);
  if (moneyMatch) {
    const sign = moneyMatch[1] === "-" ? -1 : 1;
    const base = parseFloat(moneyMatch[2]);
    const mult = moneyMatch[3].toUpperCase() === "M" ? 1e6 : (moneyMatch[3].toUpperCase() === "K" ? 1e3 : 1);
    return { isNum: true, val: sign * base * mult };
  }
  // W-L or W-L-T record (e.g., 92-70, 88-72-2, or 1,250-1,100)
  const recMatch = s.replace(/,/g, "").match(/^(\d+)-(\d+)(?:-(\d+))?$/);
  if (recMatch) {
    return { isNum: true, val: parseInt(recMatch[1], 10) * 1000 - parseInt(recMatch[2], 10) };
  }
  // Rating badge with potential (e.g. 65/80)
  const rtgMatch = s.match(/^(\d{2})\/(\d{2})$/);
  if (rtgMatch) {
    return { isNum: true, val: parseInt(rtgMatch[1], 10) * 100 + parseInt(rtgMatch[2], 10) };
  }
  // Standard number, decimal, percentage, degree, or comma-formatted integer
  const cleaned = s.replace(/[,%°+#🏆★]/g, "").split(/\s+/)[0];
  if (/^[+-]?\d*\.?\d+$/.test(cleaned) && cleaned !== "" && cleaned !== "." && cleaned !== "+" && cleaned !== "-") {
    return { isNum: true, val: parseFloat(cleaned) };
  }
  return { isNum: false, val: s.toLowerCase() };
}

function initGlobalTableSorting() {
  if (window._globalTableSortingBound) return;
  window._globalTableSortingBound = true;

  document.addEventListener("click", e => {
    const th = e.target.closest(".saber-table thead th");
    if (!th || th.hasAttribute("onclick")) return;
    const table = th.closest(".saber-table");
    const tbody = table && table.querySelector("tbody");
    if (!tbody) return;

    const headers = Array.from(th.parentElement.children);
    const colIdx = headers.indexOf(th);
    if (colIdx < 0) return;

    const currentDir = th.getAttribute("data-sort-dir");
    const nextDir = currentDir === "desc" ? "asc" : "desc";
    headers.forEach(h => h.removeAttribute("data-sort-dir"));
    th.setAttribute("data-sort-dir", nextDir);

    const rows = Array.from(tbody.querySelectorAll("tr"));
    if (rows.length <= 1) return;

    rows.sort((ra, rb) => {
      const ca = ra.children[colIdx];
      const cb = rb.children[colIdx];
      const va = parseSortableCellValue(ca ? ca.textContent : "");
      const vb = parseSortableCellValue(cb ? cb.textContent : "");
      let cmp = 0;
      if (va.isNum && vb.isNum) {
        cmp = va.val - vb.val;
      } else {
        cmp = String(va.val).localeCompare(String(vb.val));
      }
      return nextDir === "asc" ? cmp : -cmp;
    });

    rows.forEach(r => tbody.appendChild(r));
  });

  // Close quick-scout dropdown when clicking outside
  document.addEventListener("click", e => {
    const resBox = document.getElementById("global-player-search-results");
    const inputBox = document.getElementById("global-player-quick-search");
    if (resBox && !resBox.classList.contains("hidden")) {
      if (!resBox.contains(e.target) && e.target !== inputBox) {
        resBox.classList.add("hidden");
      }
    }
  });
}

function initSortableTables(container = document) {
  initGlobalTableSorting();
  const root = container && typeof container.querySelectorAll === "function" ? container : document;
  root.querySelectorAll(".saber-table thead th").forEach(th => {
    if (!th.hasAttribute("title")) {
      th.setAttribute("title", "Click to sort column");
    }
  });
}
window.initSortableTables = initSortableTables;

window.toggleTableDensity = function() {
  AppState.compactDensity = !AppState.compactDensity;
  document.body.classList.toggle("density-compact", AppState.compactDensity);
  const btn = document.getElementById("btn-toggle-density");
  const lbl = document.getElementById("btn-toggle-density-label");
  if (btn) {
    btn.classList.toggle("bg-sky-500/20", AppState.compactDensity);
    btn.classList.toggle("border-sky-400/50", AppState.compactDensity);
    btn.classList.toggle("text-sky-300", AppState.compactDensity);
  }
  if (lbl) lbl.textContent = AppState.compactDensity ? "Dense: ON" : "Dense";
};

window.onGlobalPlayerQuickSearch = async function(query) {
  const resBox = document.getElementById("global-player-search-results");
  if (!resBox) return;
  const q = String(query || "").trim().toLowerCase();
  if (q.length < 2) {
    resBox.classList.add("hidden");
    return;
  }
  if (!AppState.sabermetrics) {
    try {
      AppState.sabermetrics = await fetchJSON(`/api/sabermetrics?save=${AppState.activeSave}`);
    } catch (e) {}
  }
  const allPlayers = [
    ...((AppState.sabermetrics && AppState.sabermetrics.batters) || []),
    ...((AppState.sabermetrics && AppState.sabermetrics.pitchers) || []),
  ];
  const seen = new Set();
  const matches = [];
  for (const p of allPlayers) {
    if (seen.has(p.player_id)) continue;
    const hay = `${p.name} ${p.team_abbr} ${p.position || p.role || ""}`.toLowerCase();
    if (hay.includes(q)) {
      seen.add(p.player_id);
      matches.push(p);
      if (matches.length >= 14) break;
    }
  }
  if (!matches.length) {
    resBox.innerHTML = `<div class="p-2.5 text-xs text-slate-400 text-center">No matching players found</div>`;
  } else {
    resBox.innerHTML = matches.map(p => `
      <div onclick="openPlayerModal(${p.player_id}); document.getElementById('global-player-search-results')?.classList.add('hidden');" class="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800 cursor-pointer text-xs transition">
        <div class="flex items-center gap-2 min-w-0">
          <img src="${playerPicUrl(p.player_id)}" class="w-6 h-8 object-cover rounded border border-slate-700" alt="">
          <div class="truncate">
            <div class="font-bold text-white truncate">${p.name}</div>
            <div class="text-[10px] font-mono text-slate-400">${p.team_abbr} • ${p.position || p.role} • Age ${p.age}</div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 font-mono shrink-0">
          ${rtgBadge(p.oa, p.pot)}
          <span class="text-sky-400 font-bold">${Number(p.war || 0).toFixed(1)}W</span>
        </div>
      </div>
    `).join("");
  }
  resBox.classList.remove("hidden");
};

async function initApp() {
  initGlobalTableSorting();
  showLoading("Initializing OOTP 27 SQLite Analytics Engine...");
  try {
    const [savesRes, setupRes] = await Promise.all([
      fetchJSON("/api/saves"),
      fetchJSON("/api/setup/status").catch(() => null),
    ]);
    AppState.saves = savesRes.saves || [];
    AppState.setupStatus = setupRes;
    AppState.activeSave = savesRes.active_save || (AppState.saves[0] && AppState.saves[0].save_slug) || "american_baseball_system";

    await loadOverviewData();
    renderHeaderControls();
    switchTab(AppState.activeTab);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("setup") === "1" || (setupRes && setupRes.needs_wizard)) {
      openSetupWizardModal();
    }
  } catch (err) {
    console.error(err);
    document.getElementById("main-view-container").innerHTML = `
      <div class="glass-card p-8 text-center my-8">
        <h3 class="text-xl font-bold text-rose-400 mb-2">Welcome to OOTP 27 Analytics & Hosting Suite</h3>
        <p class="text-slate-300 text-sm mb-4">${err.message}</p>
        <button onclick="openSetupWizardModal()" class="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider transition">
          <i class="bi bi-magic mr-1.5"></i> Launch Setup & Verification Wizard
        </button>
      </div>
    `;
  } finally {
    hideLoading();
  }
}

function showLoading(msg = "Loading analytics...") {
  const el = document.getElementById("global-loader");
  const txt = document.getElementById("global-loader-text");
  if (txt) txt.textContent = msg;
  if (el) el.classList.remove("hidden");
}

function hideLoading() {
  const el = document.getElementById("global-loader");
  if (el) el.classList.add("hidden");
}

async function loadOverviewData() {
  const params = new URLSearchParams({ save: AppState.activeSave });
  if (AppState.activeLeagueId) params.set("league_id", AppState.activeLeagueId);
  if (AppState.activeYear) params.set("year", AppState.activeYear);
  AppState.overview = await fetchJSON(`/api/overview?${params.toString()}`);
  AppState.saves = AppState.overview.saves || AppState.saves;
  if (AppState.overview.active_league) {
    AppState.activeLeagueId = AppState.overview.active_league.league_id;
  }
  if (AppState.overview.selected_year) {
    AppState.activeYear = AppState.overview.selected_year;
  }
  const teams = AppState.overview.teams || [];
  if (teams.length && (!AppState.activeTeamId || !teams.some(t => t.team_id === AppState.activeTeamId))) {
    AppState.activeTeamId = teams[0].team_id;
  }
  applyTeamTheme();
}

function applyTeamTheme() {
  const teams = (AppState.overview && AppState.overview.teams) || [];
  const activeTeam = teams.find(t => t.team_id === AppState.activeTeamId) || teams[0];
  if (activeTeam && activeTeam.bg_color) {
    document.documentElement.style.setProperty("--team-primary", activeTeam.bg_color);
  }
}

function renderHeaderControls() {
  const saveSelect = document.getElementById("save-selector");
  if (saveSelect) {
    saveSelect.innerHTML = AppState.saves.map(s => {
      const lgsCnt = (s.leagues || []).length;
      const lgLabel = lgsCnt > 1 ? `${lgsCnt} Lgs` : (s.primary_league_abbr || "LGE");
      const badge = s.csv_count > 0 ? `(${lgLabel} • ${s.season_year} • ${s.teams_count}T)` : `(HTML • ${s.html_count} pgs)`;
      return `<option value="${s.save_slug}" ${s.save_slug === AppState.activeSave ? "selected" : ""}>${s.save_name} ${badge}</option>`;
    }).join("");
  }

  const leagueWrap = document.getElementById("league-selector-wrap");
  const leagueSelect = document.getElementById("league-selector");
  const leagues = (AppState.overview && AppState.overview.leagues) || [];
  if (leagueSelect) {
    if (leagues.length >= 1) {
      if (leagueWrap) leagueWrap.classList.remove("hidden");
      leagueSelect.innerHTML = leagues.map(l => {
        const lvl = l.level_label ? `[${l.level_label}] ` : "";
        const tcnt = l.teams_count ? ` (${l.teams_count}T)` : "";
        return `<option value="${l.league_id}" ${l.league_id === AppState.activeLeagueId ? "selected" : ""}>${lvl}${l.abbr} — ${l.name}${tcnt}</option>`;
      }).join("");
    } else if (leagueWrap) {
      leagueWrap.classList.add("hidden");
    }
  }

  const yearWrap = document.getElementById("year-selector-wrap");
  const yearSelect = document.getElementById("year-selector");
  const years = (AppState.overview && AppState.overview.available_years) || [];
  const activeLgYear = AppState.overview && AppState.overview.active_league ? AppState.overview.active_league.season_year : null;
  if (yearSelect) {
    if (years.length >= 1) {
      if (yearWrap) yearWrap.classList.remove("hidden");
      yearSelect.innerHTML = years.map(y => {
        const tag = y === activeLgYear ? " (Active)" : "";
        return `<option value="${y}" ${Number(y) === Number(AppState.activeYear) ? "selected" : ""}>${y}${tag}</option>`;
      }).join("");
    } else if (yearWrap) {
      yearWrap.classList.add("hidden");
    }
  }

  const dumpWrap = document.getElementById("dump-selector-wrap");
  const dumpSelect = document.getElementById("dump-selector");
  const dumps = (AppState.overview && AppState.overview.supplemental && AppState.overview.supplemental.dumps)
    || (AppState.overview && AppState.overview.save_meta && AppState.overview.save_meta.csv_sources)
    || [];
  const activeDumpLabel = (AppState.overview && AppState.overview.save_meta && AppState.overview.save_meta.active_csv_source) || AppState.activeDump || "";
  if (dumpSelect) {
    if (dumps.length >= 1) {
      if (dumpWrap) dumpWrap.classList.remove("hidden");
      dumpSelect.innerHTML = dumps.map(d => {
        const dtStr = d.in_game_date ? ` (${d.in_game_date})` : "";
        const isSel = d.label === activeDumpLabel || (!activeDumpLabel && d.is_active);
        return `<option value="${d.label}" ${isSel ? "selected" : ""}>${d.label}${dtStr}</option>`;
      }).join("");
    } else if (dumpWrap) {
      dumpWrap.classList.add("hidden");
    }
  }

  const teamSelect = document.getElementById("team-selector");
  const teams = (AppState.overview && AppState.overview.teams) || [];
  if (teamSelect) {
    teamSelect.innerHTML = `<option value="">All Teams (${teams.length})</option>` +
      teams.map(t => `<option value="${t.team_id}" ${t.team_id === AppState.activeTeamId ? "selected" : ""}>${t.abbr} — ${t.full_name} (${t.record_str || `${t.w}-${t.l}`})</option>`).join("");
  }
}

async function onSaveChanged(newSaveSlug, forceSync = false, sourceLabel = null) {
  showLoading(`Loading save '${newSaveSlug}'${sourceLabel ? ` [Dump: ${sourceLabel}]` : ""} & syncing CSVs to SQLite...`);
  try {
    await fetchJSON("/api/saves/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ save_slug: newSaveSlug, force: forceSync, source_label: sourceLabel }),
    });
    AppState.activeSave = newSaveSlug;
    if (!sourceLabel) {
      AppState.activeLeagueId = null;
      AppState.activeTeamId = null;
    }
    AppState.activeYear = null;
    AppState.activeDump = sourceLabel;
    AppState.frontPageData = null;
    AppState.stretchData = null;
    AppState.stretchLeagueIds = [];
    AppState.worldData = null;
    AppState.teamDashboard = null;
    AppState.sabermetrics = null;
    AppState.spray = null;
    AppState.gamesData = null;
    AppState.projections = null;
    AppState.evolutionData = null;
    AppState.statsplus = null;
    AppState.bnnCatalog = null;
    AppState.leadersData = null;
    AppState.recordsData = null;
    AppState.hofData = null;

    await loadOverviewData();
    renderHeaderControls();
    if (!AppState.overview.has_csv && AppState.activeTab !== "bnn") {
      switchTab("bnn");
    } else {
      switchTab(AppState.activeTab);
    }
  } finally {
    hideLoading();
  }
}

async function onLeagueChanged(newLeagueId) {
  AppState.activeLeagueId = Number(newLeagueId) || null;
  AppState.activeTeamId = null;
  AppState.frontPageData = null;
  AppState.stretchData = null;
  AppState.stretchLeagueIds = AppState.activeLeagueId ? [AppState.activeLeagueId] : [];
  AppState.teamDashboard = null;
  AppState.sabermetrics = null;
  AppState.projections = null;
  AppState.evolutionData = null;
  AppState.statsplus = null;
  AppState.leadersData = null;
  AppState.recordsData = null;
  AppState.hofData = null;
  AppState.leadersSubLeague = "ALL";
  AppState.leadersTeam = "";
  showLoading("Switching League Level...");
  try {
    await loadOverviewData();
    renderHeaderControls();
    switchTab(AppState.activeTab);
  } finally {
    hideLoading();
  }
}

async function onYearChanged(newYear) {
  AppState.activeYear = Number(newYear) || null;
  AppState.frontPageData = null;
  AppState.stretchData = null;
  AppState.worldData = null;
  AppState.sabermetrics = null;
  AppState.projections = null;
  AppState.evolutionData = null;
  AppState.leadersData = null;
  showLoading(`Loading Season ${AppState.activeYear} Standings, Leaders & Projections...`);
  try {
    await loadOverviewData();
    renderHeaderControls();
    switchTab(AppState.activeTab);
  } finally {
    hideLoading();
  }
}

window.onDumpSourceChanged = async function(sourceLabel) {
  if (!sourceLabel) return;
  await onSaveChanged(AppState.activeSave, true, sourceLabel);
};

function onTeamPerspectiveChanged(teamIdStr) {
  const tid = Number(teamIdStr) || null;
  if (tid) {
    AppState.activeTeamId = tid;
    applyTeamTheme();
  }
  switchTab(AppState.activeTab);
}

window.switchTeamAndGo = function(teamId) {
  AppState.activeTeamId = Number(teamId);
  const ts = document.getElementById("team-selector");
  if (ts) ts.value = String(teamId);
  applyTeamTheme();
  switchTab("teamhub");
};

async function switchTab(tabName) {
  if (AppState.replayTimer) {
    clearInterval(AppState.replayTimer);
    AppState.replayTimer = null;
    AppState.replayPlaying = false;
  }
  AppState.activeTab = tabName;
  document.querySelectorAll(".nav-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  const container = document.getElementById("main-view-container");
  if (!container) return;

  if (!AppState.overview.has_csv && tabName !== "bnn") {
    container.innerHTML = renderNoCsvPrompt();
    return;
  }

  try {
    if (tabName === "frontpage") {
      await renderFrontPageTab(container);
    } else if (tabName === "stretch") {
      await renderStretchTab(container);
    } else if (tabName === "world") {
      await renderWorldDashboardTab(container);
    } else if (tabName === "overview") {
      renderOverviewTab(container);
    } else if (tabName === "teamhub") {
      await renderTeamHubTab(container);
    } else if (tabName === "leaders") {
      await renderLeagueLeadersTab(container);
    } else if (tabName === "records") {
      await renderRecordsTab(container);
    } else if (tabName === "hof") {
      await renderHofTab(container);
    } else if (tabName === "statcast") {
      await renderStatcastTab(container);
    } else if (tabName === "gamelogs") {
      await renderGameLogsTab(container);
    } else if (tabName === "sabermetrics") {
      await renderSabermetricsTab(container);
    } else if (tabName === "evolution") {
      await renderEvolutionTab(container);
    } else if (tabName === "statsplus") {
      await renderStatsPlusTab(container);
    } else if (tabName === "bnn") {
      await renderBnnPortalTab(container);
    }
  } catch (err) {
    console.error(`Error rendering tab '${tabName}':`, err);
    container.innerHTML = `
      <div class="glass-card p-6 my-4 border border-rose-500/40 text-center max-w-2xl mx-auto animate-view">
        <div class="text-rose-400 text-2xl mb-2"><i class="bi bi-exclamation-triangle-fill"></i></div>
        <h3 class="text-base font-black text-white uppercase tracking-wider mb-1">Could Not Load View (${tabName})</h3>
        <p class="text-xs font-mono text-slate-300 mb-4">${err.message || err}</p>
        <button onclick="switchTab('${tabName}')" class="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider transition">
          <i class="bi bi-arrow-clockwise mr-1"></i> Retry Loading View
        </button>
      </div>
    `;
  }
}

function renderNoCsvPrompt() {
  const s = AppState.overview.save_meta || {};
  return `
    <div class="glass-card p-8 my-6 max-w-3xl mx-auto text-center animate-view">
      <div class="w-16 h-16 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center mx-auto mb-4 text-sky-400 text-3xl">
        <i class="bi bi-database-exclamation"></i>
      </div>
      <h2 class="text-2xl font-extrabold text-white mb-2">${s.save_name || 'Selected Save'} — HTML Reports Ready, CSV Dump Needed for SQLite</h2>
      <p class="text-slate-300 text-sm mb-6">
        This save currently has <b>${s.html_count || 0} native OOTP 27 HTML reports</b> available in the BNN Portal, but hasn't had its CSV tables exported to <code>import_export/csv</code> or <code>dump/</code> yet.
      </p>
      <div class="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 text-left text-xs text-slate-300 mb-6 space-y-2">
        <div class="font-bold text-sky-400 uppercase tracking-wider">How to Export CSVs in OOTP 27 (takes 5 seconds):</div>
        <div>1. Open <b>${s.save_name}</b> in OOTP Baseball 27.</div>
        <div>2. Go to <b>Game &rarr; Game Settings &rarr; Database &rarr; Database Tools &rarr; Export Data to CSV Files</b> (or enable <i>Dump Data to CSV Yearly</i>).</div>
        <div>3. Click <b>Re-Sync SQLite</b> in the top-right bar here!</div>
      </div>
      <div class="flex justify-center gap-3">
        ${s.html_count > 0 ? `<button onclick="switchTab('bnn')" class="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition"><i class="bi bi-globe2 mr-1.5"></i>Browse ${s.html_count} Native OOTP 27 HTML Reports</button>` : ""}
        <button onclick="onSaveChanged('american_baseball_system')" class="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm border border-slate-600 transition">Switch to American Baseball System.lg</button>
      </div>
    </div>
  `;
}

/* ============================================================================
 * 1. COMMAND CENTER / OVERVIEW TAB
 * ============================================================================ */
function renderOverviewTab(container) {
  const ov = AppState.overview;
  const env = ov.environment || {};
  const standings = ov.standings || [];
  const leaders = ov.leaders || {};
  const recentGames = ov.recent_games || [];
  const leagues = ov.leagues || [];
  const availYears = ov.available_years || [];
  const dumps = (ov.supplemental && ov.supplemental.dumps) || [];
  const hasTies = Boolean(env.league_has_ties) || standings.some(t => Number(t.t || 0) > 0);

  // Group standings by sub_league & division
  const groups = {};
  standings.forEach(t => {
    const key = `${t.sub_league_name || 'League'} ${t.division_name && t.division_name !== 'Division 0' ? '— ' + t.division_name : ''}`.trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const standingsHtml = Object.entries(groups).map(([grpName, list]) => `
    <div class="glass-card overflow-hidden mb-5">
      <div class="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2">
        <div class="flex items-center gap-2">
          <i class="bi bi-trophy-fill text-amber-400"></i>
          <h3 class="font-extrabold text-sm tracking-wide uppercase text-white">${grpName} Standings & Pythagorean Matrix (${env.season_year})</h3>
          ${hasTies ? `<span class="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">Includes Ties (W-L-T)</span>` : ""}
          ${ov.is_historical_year ? `<span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Historical Season Snapshot (${env.season_year})</span>` : ""}
        </div>
        <span class="text-xs text-slate-400">Click any team for Full Franchise Hub • Click column headers to sort</span>
      </div>
      <div class="overflow-x-auto">
        <table class="saber-table">
          <thead>
            <tr>
              <th class="text-left">Team</th>
              <th class="text-right">W</th>
              <th class="text-right">L</th>
              <th class="text-right" title="Tied Games">T</th>
              <th class="text-right">PCT</th>
              <th class="text-right">GB</th>
              <th class="text-right" title="Division Magic / Elimination Number">Magic#</th>
              <th class="text-right" title="Record in Last 10 Games">L10</th>
              <th class="text-right">Strk</th>
              <th class="text-right" title="Pythagorean Expected W-L-T (RS^1.83 / (RS^1.83 + RA^1.83))">Pyth W-L-T</th>
              <th class="text-right" title="Actual Wins minus Pythagorean Wins">Luck</th>
              <th class="text-right">RS</th>
              <th class="text-right">RA</th>
              <th class="text-right">Diff</th>
              <th class="text-right" title="BaseRuns Expected Runs Scored">BsR RS</th>
              <th class="text-right">wOBA</th>
              <th class="text-right">wRC+</th>
              <th class="text-right">ERA</th>
              <th class="text-right">FIP</th>
              <th class="text-right">Def ZR</th>
              <th class="text-right">Team WAR</th>
              <th class="text-right">Playoff %</th>
              <th class="text-right">Payroll</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((t, idx) => {
              const diffCls = t.run_diff > 0 ? "text-emerald-400 font-bold" : (t.run_diff < 0 ? "text-rose-400 font-bold" : "text-slate-400");
              const luckCls = t.luck_diff > 0 ? "text-emerald-400" : (t.luck_diff < 0 ? "text-rose-400" : "text-slate-400");
              const tiesCount = Number(t.t || 0);
              const pythStr = tiesCount > 0 ? `${t.pyth_w}-${t.pyth_l}-${tiesCount}` : `${t.pyth_w}-${t.pyth_l}`;
              const mStr = t.magic_str || "-";
              const mCls = mStr === "CLINCHED" ? "text-amber-300 font-extrabold" : (mStr === "ELIM" ? "text-slate-500" : "text-sky-300");
              const l10Str = t.l10_str || "5-5";
              const l10Cls = (t.l10_w || 0) >= 7 ? "text-emerald-400 font-bold" : ((t.l10_w || 0) <= 3 ? "text-rose-400" : "text-slate-200");
              return `
                <tr onclick="switchTeamAndGo(${t.team_id})" class="cursor-pointer">
                  <td class="font-bold">
                    <div class="flex items-center gap-2.5">
                      <span class="text-xs font-mono text-slate-500 w-4">${idx + 1}</span>
                      <img src="${teamLogoUrl(t.logo_file_name)}" class="w-6 h-6 object-contain rounded" alt="${t.abbr}">
                      <div>
                        <span class="text-white hover:text-sky-400 transition">${t.full_name}</span>
                        <span class="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">${t.abbr}</span>
                        ${t.human_team ? `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">GM</span>` : ""}
                      </div>
                    </div>
                  </td>
                  <td class="text-right font-bold text-white">${t.w}</td>
                  <td class="text-right text-slate-300">${t.l}</td>
                  <td class="text-right font-mono ${tiesCount > 0 ? 'text-amber-300 font-bold' : 'text-slate-500'}">${tiesCount}</td>
                  <td class="text-right font-mono font-bold text-sky-300">${fmtAvg(t.pct)}</td>
                  <td class="text-right font-mono text-slate-400">${t.gb === 0 ? "-" : t.gb.toFixed(1)}</td>
                  <td class="text-right font-mono text-xs ${mCls}">${mStr}</td>
                  <td class="text-right font-mono text-xs ${l10Cls}">${l10Str}</td>
                  <td class="text-right font-mono text-xs ${t.streak > 0 ? 'text-emerald-400' : 'text-rose-400'}">${t.streak_str}</td>
                  <td class="text-right font-mono text-slate-200">${pythStr}</td>
                  <td class="text-right font-mono ${luckCls}">${t.luck_diff > 0 ? '+' : ''}${t.luck_diff}</td>
                  <td class="text-right font-mono">${t.rs}</td>
                  <td class="text-right font-mono">${t.ra}</td>
                  <td class="text-right font-mono ${diffCls}">${t.run_diff > 0 ? '+' : ''}${t.run_diff}</td>
                  <td class="text-right font-mono text-slate-300">${t.bsr_rs}</td>
                  <td class="text-right font-mono">${fmtAvg(t.woba)}</td>
                  <td class="text-right font-mono font-bold ${t.wrc_plus >= 105 ? 'text-emerald-400' : (t.wrc_plus <= 95 ? 'text-rose-400' : 'text-slate-200')}">${t.wrc_plus}</td>
                  <td class="text-right font-mono font-semibold text-amber-300">${t.era.toFixed(2)}</td>
                  <td class="text-right font-mono text-slate-200">${t.fip.toFixed(2)}</td>
                  <td class="text-right font-mono ${t.zr >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${t.zr > 0 ? '+' : ''}${t.zr.toFixed(1)}</td>
                  <td class="text-right font-mono font-extrabold text-sky-400">${t.total_war.toFixed(1)}</td>
                  <td class="text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      <div class="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div class="h-full bg-sky-400" style="width:${t.playoff_prob}%"></div>
                      </div>
                      <span class="font-mono text-xs">${t.playoff_prob.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td class="text-right font-mono text-slate-300">${fmtMoney(t.payroll)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `).join("");

  const renderLeaderCard = (title, icon, items, valKey, valFormatter, subKey, subLabel) => `
    <div class="glass-card p-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div class="flex items-center gap-2">
          <i class="bi ${icon} text-sky-400"></i>
          <h4 class="font-bold text-xs uppercase tracking-wider text-slate-200">${title}</h4>
        </div>
        <span class="text-[10px] font-mono text-slate-400 uppercase">${env.season_year || ''}</span>
      </div>
      <div class="space-y-2">
        ${(items || []).slice(0, 5).map((p, i) => `
          <div onclick="openPlayerModal(${p.player_id})" class="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-800/70 cursor-pointer transition">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-xs font-mono font-bold ${i === 0 ? 'text-amber-400' : 'text-slate-500'} w-4">${i + 1}</span>
              <img src="${playerPicUrl(p.player_id)}" class="w-7 h-9 object-cover rounded border border-slate-700" alt="">
              <div class="truncate">
                <div class="text-xs font-bold text-white truncate">${p.name}</div>
                <div class="text-[10px] text-slate-400">${p.team_abbr} • ${p.position || p.role}</div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-sm font-extrabold font-mono text-sky-400">${valFormatter(p[valKey])}</div>
              <div class="text-[10px] font-mono text-slate-400">${subLabel}: ${p[subKey]}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  container.innerHTML = `
    <div class="animate-view space-y-4">
      <!-- Interactive Multi-League & Multi-Year Browser Bar -->
      ${(leagues.length > 1 || availYears.length > 1 || dumps.length > 1) ? `
      <div class="glass-card p-3 flex flex-col uw:flex-row uw:items-center uw:justify-between gap-2.5">
        ${leagues.length > 1 ? `
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 mr-1"><i class="bi bi-diagram-2-fill mr-1"></i>Leagues in Save (${leagues.length}):</span>
            ${leagues.map(l => `
              <button onclick="onLeagueChanged(${l.league_id})" class="px-2.5 py-1 rounded-lg text-xs font-bold border transition ${l.league_id === AppState.activeLeagueId ? 'bg-sky-500 text-slate-950 border-sky-300 shadow' : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'}">
                <span class="text-[10px] font-mono opacity-75">[${l.level_label || 'L' + l.league_level}]</span> ${l.abbr} <span class="text-[10px] font-normal opacity-80">(${l.teams_count || 0}T)</span>
              </button>
            `).join("")}
          </div>
        ` : ""}
        ${availYears.length > 1 ? `
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 mr-1"><i class="bi bi-calendar3 mr-1"></i>Season Years (${availYears.length}):</span>
            ${availYears.slice(0, 18).map(y => `
              <button onclick="onYearChanged(${y})" class="px-2 py-0.5 rounded-lg text-xs font-mono font-bold border transition ${Number(y) === Number(env.season_year) ? 'bg-sky-500 text-slate-950 border-sky-300 shadow' : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'}">
                ${y}
              </button>
            `).join("")}
            ${availYears.length > 18 ? `<span class="text-[10px] text-slate-400 font-mono">+${availYears.length - 18} earlier years in top Year dropdown</span>` : ""}
          </div>
        ` : ""}
      </div>
      ` : ""}

      <!-- Top League Environment KPI Strip -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="glass-card p-3.5 border-l-4 border-l-sky-400">
          <div class="text-[11px] text-slate-400 font-semibold uppercase">Active League & Year</div>
          <div class="text-lg font-extrabold text-white mt-0.5 truncate">${ov.active_league ? ov.active_league.abbr : 'MLB'} ${env.season_year}</div>
          <div class="text-[11px] text-sky-400 font-mono">${standings.length} Teams • ${env.total_games} Games${env.total_ties ? ` (${env.total_ties} Ties)` : ''}</div>
        </div>
        <div class="glass-card p-3.5 border-l-4 border-l-emerald-400">
          <div class="text-[11px] text-slate-400 font-semibold uppercase">League Slash / wOBA</div>
          <div class="text-lg font-extrabold text-white font-mono mt-0.5">${fmtAvg(env.league_avg)} / ${fmtAvg(env.league_obp)} / ${fmtAvg(env.league_slg)}</div>
          <div class="text-[11px] text-emerald-400 font-mono">lgwOBA: ${fmtAvg(env.league_woba)} • OPS: ${fmtAvg(env.league_ops)}</div>
        </div>
        <div class="glass-card p-3.5 border-l-4 border-l-amber-400">
          <div class="text-[11px] text-slate-400 font-semibold uppercase">Pitching Environment</div>
          <div class="text-lg font-extrabold text-white font-mono mt-0.5">${Number(env.league_era || 0).toFixed(2)} ERA</div>
          <div class="text-[11px] text-amber-400 font-mono">FIP Constant: ${Number(env.fip_constant || 3.15).toFixed(2)}</div>
        </div>
        <div class="glass-card p-3.5 border-l-4 border-l-pink-500">
          <div class="text-[11px] text-slate-400 font-semibold uppercase">Statcast PAs Tracked</div>
          <div class="text-lg font-extrabold text-white font-mono mt-0.5">${Number(env.at_bats_tracked || 0).toLocaleString()}</div>
          <div class="text-[11px] text-pink-400 font-mono">${Number(env.total_hr || 0).toLocaleString()} HR • ${Number(env.total_k || 0).toLocaleString()} K</div>
        </div>
        <div class="glass-card p-3.5 border-l-4 border-l-purple-400 cursor-pointer" onclick="switchTab('evolution')">
          <div class="text-[11px] text-slate-400 font-semibold uppercase">Dumps & Almanacs</div>
          <div class="text-lg font-extrabold text-white font-mono mt-0.5">${dumps.length} Dumps • ${((ov.supplemental && ov.supplemental.almanacs) || []).length} Alm</div>
          <div class="text-[11px] text-purple-400 font-semibold">Open Evolution & Vault &rarr;</div>
        </div>
        <div class="glass-card p-3.5 border-l-4 border-l-cyan-400 cursor-pointer" onclick="switchTab('bnn')">
          <div class="text-[11px] text-slate-400 font-semibold uppercase">OOTP 27 BNN Reports</div>
          <div class="text-lg font-extrabold text-white font-mono mt-0.5">${Number(ov.save_meta.html_count || 0).toLocaleString()} HTMLs</div>
          <div class="text-[11px] text-cyan-400 font-semibold">Open BNN & Almanacs &rarr;</div>
        </div>
      </div>

      <!-- Recent Scoreboard Ticker (Expanded up to 10 games on Ultrawide) -->
      ${recentGames.length ? `
      <div class="glass-card p-3.5">
        <div class="flex items-center justify-between mb-2.5">
          <div class="text-xs font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Recent Box Scores & Statcast Game Logs
          </div>
          <button onclick="switchTab('gamelogs')" class="text-xs text-sky-400 hover:underline font-semibold">View All Season Games &rarr;</button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 uw:grid-cols-8 suw:grid-cols-10 gap-2.5">
          ${recentGames.slice(0, 10).map(g => `
            <div onclick="openGameReplayModal(${g.game_id})" class="bg-slate-900/85 hover:bg-slate-800/90 border border-slate-800 hover:border-sky-500/50 rounded-xl p-2.5 cursor-pointer transition">
              <div class="flex justify-between items-center text-[10px] text-slate-400 font-mono mb-1.5">
                <span>${g.date}</span>
                <span class="px-1.5 py-0.2 bg-slate-800 text-sky-300 rounded">FINAL${g.innings > 9 ? '/' + g.innings : ''}</span>
              </div>
              <div class="flex justify-between items-center text-xs font-bold mb-1">
                <div class="flex items-center gap-1.5">
                  <img src="${teamLogoUrl(g.away_logo)}" class="w-4 h-4 object-contain">
                  <span class="${g.away_runs > g.home_runs ? 'text-white' : 'text-slate-400'}">${g.away_abbr}</span>
                </div>
                <span class="font-mono ${g.away_runs > g.home_runs ? 'text-emerald-400 font-extrabold' : 'text-slate-400'}">${g.away_runs}</span>
              </div>
              <div class="flex justify-between items-center text-xs font-bold">
                <div class="flex items-center gap-1.5">
                  <img src="${teamLogoUrl(g.home_logo)}" class="w-4 h-4 object-contain">
                  <span class="${g.home_runs > g.away_runs ? 'text-white' : 'text-slate-400'}">${g.home_abbr}</span>
                </div>
                <span class="font-mono ${g.home_runs > g.away_runs ? 'text-emerald-400 font-extrabold' : 'text-slate-400'}">${g.home_runs}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
      ` : ""}

      <!-- Ultrawide Side-by-Side Command Grid: Standings Matrices + League Leaders -->
      <div class="grid grid-cols-1 uw:grid-cols-12 gap-5 items-start">
        <div class="uw:col-span-8 suw:col-span-9 min-w-0">
          ${standingsHtml}
        </div>
        <div class="uw:col-span-4 suw:col-span-3 uw:sticky uw:top-[104px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 uw:grid-cols-2 gap-3.5">
          ${renderLeaderCard("Batting WAR Leaders", "bi-star-fill", leaders.bat_war, "war", v => Number(v).toFixed(2), "wrc_plus", "wRC+")}
          ${renderLeaderCard("Batting wRC+ Leaders", "bi-lightning-charge-fill", leaders.bat_wrc, "wrc_plus", v => v, "xwoba", "xwOBA")}
          ${renderLeaderCard("Pitching WAR Leaders", "bi-shield-fill-check", leaders.pit_war, "war", v => Number(v).toFixed(2), "fip", "FIP")}
          ${renderLeaderCard("Pitching FIP Leaders", "bi-fire", leaders.pit_fip, "fip", v => Number(v).toFixed(2), "k9", "K/9")}
        </div>
      </div>
    </div>
  `;
}

/* ============================================================================
 * 2. TEAM FRANCHISE HUB (SELECTABLE FOR ALL TEAMS)
 * ============================================================================ */
async function renderTeamHubTab(container) {
  const ov = AppState.overview;
  const teams = ov.teams || [];
  if (!teams.length) return;
  const team = teams.find(t => t.team_id === AppState.activeTeamId) || teams[0];
  AppState.activeTeamId = team.team_id;

  showLoading(`Loading ${team.full_name} Graphical Depth Chart, Positional Strengths & Franchise Roadmap...`);
  let teamLb, teamSpray, teamDash;
  try {
    const yrParam = AppState.activeYear ? `&year=${AppState.activeYear}` : "";
    [teamLb, teamSpray, teamDash] = await Promise.all([
      fetchJSON(`/api/sabermetrics?save=${AppState.activeSave}&team_id=${team.team_id}${yrParam}`),
      fetchJSON(`/api/spray?save=${AppState.activeSave}&team_id=${team.team_id}&limit=450`),
      fetchJSON(`/api/team_dashboard?save=${AppState.activeSave}&team_id=${team.team_id}`),
    ]);
    AppState.teamDashboard = { teamId: team.team_id, lb: teamLb, spray: teamSpray, dash: teamDash };
  } finally {
    hideLoading();
  }

  renderTeamHubSubView(container);
}

window.switchTeamHubSubTab = function(subTab) {
  AppState.teamHubSubTab = subTab;
  const container = document.getElementById("main-view-container");
  if (container && AppState.teamDashboard) {
    renderTeamHubSubView(container);
  }
};

window.selectDepthChartUnit = function(pos) {
  AppState.selectedDepthPos = pos;
  const dash = AppState.teamDashboard && AppState.teamDashboard.dash;
  if (!dash) return;
  renderGraphicalDepthChartDiamond("team-depth-diamond-svg", dash.graphical_depth_chart, pos);
  const insp = document.getElementById("team-depth-unit-inspector");
  if (insp) insp.innerHTML = buildDepthUnitInspectorHtml(dash.graphical_depth_chart, pos);
};

function buildDepthUnitInspectorHtml(depthData, pos) {
  if (!depthData) return "";
  const isPit = pos === "SP" || pos === "RP";
  const unit = isPit
    ? (pos === "SP" ? { pos: "SP", name: "Starting Rotation", starter: (depthData.rotation || [])[0], backups: (depthData.rotation || []).slice(1, 5), unit_war: (depthData.rotation || []).slice(0, 5).reduce((s, p) => s + (p.war || 0), 0), grade: "ROT", status_color: "#dbdbdb", league_percentile: 70 }
                    : { pos: "RP", name: "Bullpen Corps", starter: (depthData.bullpen || [])[0], backups: (depthData.bullpen || []).slice(1, 6), unit_war: (depthData.bullpen || []).slice(0, 6).reduce((s, p) => s + (p.war || 0), 0), grade: "PEN", status_color: "#fbbf24", league_percentile: 70 })
    : ((depthData.positions && depthData.positions[pos]) || {});
  const st = unit.starter;
  const backups = unit.backups || [];

  return `
    <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
      <div>
        <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40">${unit.pos || pos} UNIT</span>
        <h4 class="text-sm font-extrabold text-white mt-1">${unit.name || pos} Depth Breakdown</h4>
      </div>
      <div class="text-right">
        <div class="text-xs font-mono text-slate-400">Unit WAR</div>
        <div class="text-lg font-black font-mono" style="color:${unit.status_color || '#dbdbdb'}">${Number(unit.unit_war || 0).toFixed(1)}</div>
      </div>
    </div>
    ${st ? `
      <div onclick="openPlayerModal(${st.player_id})" class="p-3 rounded-xl bg-slate-900/95 border border-sky-500/40 hover:border-sky-400 cursor-pointer transition mb-3">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">★ Primary Starter</span>
          <span class="text-[10px] font-mono text-slate-400">Age ${st.age} • ${st.bats ? `B:${st.bats}` : `T:${st.throws}`}</span>
        </div>
        <div class="flex items-center gap-3">
          <img src="${playerPicUrl(st.player_id)}" class="w-11 h-14 object-cover rounded-lg border border-slate-700" alt="">
          <div class="min-w-0 flex-1">
            <div class="text-sm font-extrabold text-white truncate">${st.name}</div>
            <div class="mt-1 flex flex-wrap items-center gap-1.5">
              ${rtgBadge(st.oa, st.pot)}
              <span class="text-xs font-mono font-bold text-sky-400">${Number(st.war || 0).toFixed(1)} WAR</span>
              ${st.wrc_plus !== undefined ? `<span class="text-xs font-mono text-emerald-300">${st.wrc_plus} wRC+</span>` : `<span class="text-xs font-mono text-amber-300">${Number(st.fip || 0).toFixed(2)} FIP</span>`}
              ${st.zr !== undefined ? `<span class="text-[11px] font-mono text-slate-300">ZR ${st.zr > 0 ? '+' : ''}${Number(st.zr || 0).toFixed(1)}</span>` : ""}
            </div>
          </div>
        </div>
      </div>
    ` : `<div class="text-xs text-slate-500 italic mb-3">No starter assigned</div>`}

    <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Depth Chart Backups & Options (${backups.length})</div>
    <div class="space-y-1.5">
      ${backups.length ? backups.map((b, idx) => `
        <div onclick="openPlayerModal(${b.player_id})" class="flex items-center justify-between p-2 rounded-lg bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800 cursor-pointer transition text-xs">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[10px] font-mono text-slate-500">#${idx + 2}</span>
            <img src="${playerPicUrl(b.player_id)}" class="w-6 h-8 object-cover rounded border border-slate-700" alt="">
            <div class="truncate">
              <div class="font-bold text-slate-200 truncate">${b.name}</div>
              <div class="text-[10px] text-slate-400">Age ${b.age} • ${b.position || b.role}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${rtgBadge(b.oa, b.pot)}
            <span class="font-mono font-bold text-sky-300 w-12 text-right">${Number(b.war || 0).toFixed(1)}W</span>
          </div>
        </div>
      `).join("") : `<div class="text-xs text-slate-500 italic">No secondary depth options on active roster</div>`}
    </div>
  `;
}

function renderTeamHubSubView(container) {
  const ov = AppState.overview;
  const teams = ov.teams || [];
  const team = teams.find(t => t.team_id === AppState.activeTeamId) || teams[0];
  const { lb: teamLb, spray: teamSpray, dash: teamDash } = AppState.teamDashboard;
  const batters = teamLb.batters || [];
  const pitchers = teamLb.pitchers || [];
  const depthChart = (teamDash && teamDash.graphical_depth_chart) || { positions: {}, rotation: [], bullpen: [] };
  const strengths = (teamDash && teamDash.positional_strengths) || { units: [], top_strengths: [], upgrade_targets: [] };
  const roadmap = (teamDash && teamDash.roadmap) || { years_header: [], payroll_horizon: [], player_matrix: [], prospect_pipeline: [] };
  const subTab = AppState.teamHubSubTab || "depth";
  const selPos = AppState.selectedDepthPos || "SS";
  const rotation = depthChart.rotation || [];
  const bullpen = depthChart.bullpen || [];

  const renderDepthAndSprayPanorama = () => `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <!-- Column 1: Interactive Graphical Field Depth Chart -->
      <div class="glass-card p-4 lg:col-span-8 uw:col-span-5">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <i class="bi bi-diagram-3-fill text-emerald-400"></i> Interactive Graphical Field Depth Chart
            </h3>
            <p class="text-xs text-slate-400">Click any position node on the diamond for starter/backup breakdowns, or click a player name for full Scouting & Career Dossier</p>
          </div>
          <div class="flex flex-wrap gap-1">
            ${["C","1B","2B","3B","SS","LF","CF","RF","DH","SP","RP"].map(p => `
              <button onclick="selectDepthChartUnit('${p}')" class="px-2 py-1 rounded text-[10px] font-mono font-bold border transition ${selPos === p ? 'bg-sky-500 text-slate-950 border-sky-300' : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'}">${p}</button>
            `).join("")}
          </div>
        </div>
        <div id="team-depth-diamond-svg"></div>
      </div>

      <!-- Column 2: Unit Inspector + Starting Rotation & Bullpen -->
      <div class="lg:col-span-4 uw:col-span-3 space-y-4">
        <div id="team-depth-unit-inspector" class="glass-card p-4">
          ${buildDepthUnitInspectorHtml(depthChart, selPos)}
        </div>

        <div class="glass-card p-4">
          <h4 class="text-xs font-extrabold uppercase tracking-wider text-amber-300 mb-2.5 flex items-center justify-between">
            <span><i class="bi bi-fire mr-1"></i> Starting Rotation (1-5)</span>
            <span class="font-mono text-[10px] text-slate-400">Click player to scout</span>
          </h4>
          <div class="space-y-1.5">
            ${rotation.slice(0, 5).map((p, i) => `
              <div onclick="openPlayerModal(${p.player_id})" class="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 cursor-pointer transition text-xs">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[10px] font-mono font-bold text-amber-400 w-6">SP${i + 1}</span>
                  <span class="font-bold text-white truncate">${p.name}</span>
                  <span class="text-[10px] font-mono text-slate-400">(${p.throws})</span>
                </div>
                <div class="flex items-center gap-2 font-mono shrink-0">
                  ${rtgBadge(p.oa, p.pot)}
                  <span class="text-amber-300">${Number(p.era || 0).toFixed(2)} ERA</span>
                  <span class="font-bold text-sky-400 w-11 text-right">${Number(p.war || 0).toFixed(1)}W</span>
                </div>
              </div>
            `).join("")}
          </div>

          <h4 class="text-xs font-extrabold uppercase tracking-wider text-sky-300 mt-4 mb-2 flex items-center justify-between">
            <span><i class="bi bi-shield-shaded mr-1"></i> High-Leverage Bullpen</span>
            <span class="font-mono text-[10px] text-slate-400">Top Relievers</span>
          </h4>
          <div class="space-y-1.5">
            ${bullpen.slice(0, 5).map((p, i) => `
              <div onclick="openPlayerModal(${p.player_id})" class="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/65 hover:bg-slate-800 border border-slate-800/80 cursor-pointer transition text-xs">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-[10px] font-mono font-bold ${i === 0 ? 'text-emerald-400' : 'text-sky-400'} w-6">${i === 0 ? 'CL' : 'RP' + i}</span>
                  <span class="font-semibold text-slate-200 truncate">${p.name}</span>
                </div>
                <div class="flex items-center gap-2 font-mono shrink-0">
                  ${rtgBadge(p.oa, p.pot)}
                  <span class="text-slate-300">${Number(p.fip || 0).toFixed(2)} FIP</span>
                  <span class="font-bold text-sky-400 w-11 text-right">${Number(p.war || 0).toFixed(1)}W</span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

      <!-- Column 3: Home Ballpark Spray Chart & Team Statcast Telemetry -->
      <div class="glass-card p-4 lg:col-span-12 uw:col-span-4 space-y-3">
        <div>
          <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
            <i class="bi bi-bullseye text-pink-400"></i> ${team.full_name} — Spray Chart at ${team.park.name}
          </h3>
          <p class="text-xs text-slate-400">Hover or click any batted ball dot for Statcast Exit Velo, Launch Angle & At-Bat context</p>
        </div>
        <div id="team-hub-spray-svg"></div>
        <div id="team-hub-spray-inspector" class="bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 text-xs"></div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs font-mono">
          <div class="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
            <div class="text-[10px] text-slate-400">Team Avg EV</div>
            <div class="text-sm font-extrabold text-white">${teamSpray.summary.avg_ev} mph</div>
          </div>
          <div class="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
            <div class="text-[10px] text-slate-400">Team Barrel %</div>
            <div class="text-sm font-extrabold text-amber-300">${teamSpray.summary.barrel_pct}%</div>
          </div>
          <div class="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
            <div class="text-[10px] text-slate-400">Hard-Hit %</div>
            <div class="text-sm font-extrabold text-pink-400">${teamSpray.summary.hard_hit_pct}%</div>
          </div>
          <div class="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
            <div class="text-[10px] text-slate-400">Max Exit Velo</div>
            <div class="text-sm font-extrabold text-sky-300">${teamSpray.summary.max_ev} mph</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const renderStrengthsPanorama = () => `
    <!-- Top Strengths vs Upgrade Targets Banner -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="glass-card p-4 border-l-4 border-l-emerald-400">
        <h3 class="text-xs font-extrabold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-2">
          <i class="bi bi-arrow-up-right-circle-fill"></i> Cornerstone Positional Strengths (vs. League Avg)
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          ${(strengths.top_strengths || []).map(u => `
            <div class="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-3">
              <div class="flex justify-between items-center">
                <span class="text-xs font-black text-white">${u.pos}</span>
                <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">Grade ${u.grade}</span>
              </div>
              <div class="text-sm font-bold text-sky-300 truncate mt-1">${u.starter_name}</div>
              <div class="text-xs font-mono text-emerald-400 font-bold mt-1">${u.war_diff > 0 ? '+' : ''}${u.war_diff} WAR vs Avg</div>
              <div class="text-[10px] font-mono text-slate-400">Unit: ${u.team_war}W (${u.percentile}th pct)</div>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="glass-card p-4 border-l-4 border-l-rose-500">
        <h3 class="text-xs font-extrabold uppercase tracking-wider text-rose-400 mb-3 flex items-center gap-2">
          <i class="bi bi-exclamation-triangle-fill"></i> Priority Trade / Free-Agency Upgrade Targets
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          ${(strengths.upgrade_targets || []).map(u => `
            <div class="bg-slate-900/90 border border-rose-500/30 rounded-xl p-3">
              <div class="flex justify-between items-center">
                <span class="text-xs font-black text-white">${u.pos}</span>
                <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">${u.recommendation}</span>
              </div>
              <div class="text-sm font-bold text-slate-200 truncate mt-1">${u.starter_name}</div>
              <div class="text-xs font-mono text-rose-400 font-bold mt-1">${u.war_diff > 0 ? '+' : ''}${u.war_diff} WAR vs Avg</div>
              <div class="text-[10px] font-mono text-slate-400">Unit: ${u.team_war}W (${u.percentile}th pct)</div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>

    <!-- Ultrawide Side-by-Side: Charts on Left, Complete 11-Unit Matrix Table on Right -->
    <div class="grid grid-cols-1 uw:grid-cols-12 gap-5 items-start">
      <div class="uw:col-span-5 grid grid-cols-1 lg:grid-cols-12 uw:grid-cols-1 gap-5">
        <div class="glass-card p-4 lg:col-span-7 uw:col-span-1">
          <h3 class="text-sm font-extrabold uppercase tracking-wider text-white mb-1 flex items-center gap-2">
            <i class="bi bi-bar-chart-steps text-sky-400"></i> Positional WAR Differential vs. League Average (All 11 Units)
          </h3>
          <p class="text-xs text-slate-400 mb-3">Positive bars indicate elite surplus value over the average league team at that position</p>
          <div class="h-64">
            <canvas id="team-pos-strengths-canvas"></canvas>
          </div>
        </div>

        <div class="glass-card p-4 lg:col-span-5 uw:col-span-1 flex flex-col justify-between">
          <div>
            <h3 class="text-sm font-extrabold uppercase tracking-wider text-white mb-1 flex items-center gap-2">
              <i class="bi bi-pentagon-half text-sky-400"></i> 6-Tool Franchise Analytical Radar
            </h3>
            <p class="text-xs text-slate-400 mb-2">Team percentile rank across Offense, Power, Discipline, Run Prevention, Stuff & Defense</p>
            <div class="h-60">
              <canvas id="team-radar-canvas"></canvas>
            </div>
          </div>
        </div>
      </div>

      <div class="glass-card overflow-hidden uw:col-span-7">
        <div class="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex justify-between items-center">
          <h3 class="font-extrabold text-sm uppercase tracking-wider text-white"><i class="bi bi-grid-3x3-gap-fill text-sky-400 mr-1.5"></i> Complete 11-Unit Positional Strength & League Percentile Matrix</h3>
          <span class="text-xs text-slate-400">Sorted in tactical field order • Click headers to sort</span>
        </div>
        <div class="overflow-x-auto">
          <table class="saber-table">
            <thead>
              <tr>
                <th class="text-left">Unit</th>
                <th class="text-left">Primary Starter</th>
                <th class="text-center">Starter OVR</th>
                <th class="text-right">Team Unit WAR</th>
                <th class="text-right">League Avg WAR</th>
                <th class="text-right">Net Advantage</th>
                <th class="text-right">Unit wRC+</th>
                <th class="text-right">Def ZR</th>
                <th class="text-center">League Percentile</th>
                <th class="text-center">Grade</th>
                <th class="text-left">Front Office Action</th>
              </tr>
            </thead>
            <tbody>
              ${(strengths.units || []).map(u => `
                <tr>
                  <td class="font-mono font-extrabold text-sky-300">${u.pos} <span class="text-xs text-slate-400 font-normal">(${u.name})</span></td>
                  <td class="font-bold text-white">${u.starter_name}</td>
                  <td class="text-center">${rtgBadge(u.starter_oa)}</td>
                  <td class="text-right font-mono font-bold text-white">${u.team_war.toFixed(1)}</td>
                  <td class="text-right font-mono text-slate-400">${u.lg_avg_war.toFixed(1)}</td>
                  <td class="text-right font-mono font-extrabold ${u.war_diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${u.war_diff > 0 ? '+' : ''}${u.war_diff.toFixed(1)}</td>
                  <td class="text-right font-mono">${u.pos === 'SP' || u.pos === 'RP' ? '-' : u.wrc_plus}</td>
                  <td class="text-right font-mono ${u.zr >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${u.pos === 'SP' || u.pos === 'RP' || u.pos === 'DH' ? '-' : (u.zr > 0 ? '+' : '') + u.zr.toFixed(1)}</td>
                  <td class="text-center">
                    <div class="flex items-center justify-center gap-2">
                      <div class="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div class="h-full" style="width:${u.percentile}%;background:${u.status_color}"></div>
                      </div>
                      <span class="font-mono text-xs">${u.percentile}%</span>
                    </div>
                  </td>
                  <td class="text-center"><span class="px-2 py-0.5 rounded font-mono text-xs font-extrabold" style="background:${u.status_color}22;color:${u.status_color};border:1px solid ${u.status_color}55">${u.grade}</span></td>
                  <td class="text-xs font-semibold" style="color:${u.status_color}">${u.recommendation}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const renderRoadmapPanorama = () => {
    const yrs = roadmap.years_header || [];
    const baseYearLabel = yrs[0] || (teamDash && teamDash.season_year) || (ov.environment && ov.environment.season_year) || "Season";
    return `
      <!-- 5-Year Payroll Horizon & Competitive Window Summary -->
      <div class="glass-card p-5">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div>
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">${roadmap.window_label || 'Franchise Window'}</span>
            <h3 class="text-lg font-black text-white mt-1"><i class="bi bi-calendar-range text-sky-400 mr-1.5"></i> 5-Year Payroll Commitments & Budget Cap Space Horizon (${yrs[0] || ''}–${yrs[yrs.length - 1] || ''})</h3>
            ${roadmap.gm_brief ? `<p class="text-xs text-slate-300 mt-1">${roadmap.gm_brief}</p>` : ""}
          </div>
          <div class="text-right text-xs font-mono text-slate-300">
            Core Avg Age: <b class="text-sky-400">${roadmap.avg_core_age || '-'}</b> • Total Budget: <b class="text-emerald-400">${fmtMoney(roadmap.budget)}</b>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-5 gap-3">
          ${(roadmap.payroll_horizon || []).map(ph => `
            <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
              <div class="flex justify-between items-center text-xs font-mono text-slate-400 mb-1">
                <span class="font-extrabold text-white text-sm">${ph.year}</span>
                <span>${ph.committed_players} Players</span>
              </div>
              <div class="text-base font-black text-amber-300 font-mono">${fmtMoney(ph.committed_salary)}</div>
              <div class="text-[11px] font-mono text-emerald-400 mt-0.5">Est Space: ${fmtMoney(ph.projected_space)}</div>
              <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-2">
                <div class="h-full ${ph.pct_committed > 85 ? 'bg-rose-500' : (ph.pct_committed > 65 ? 'bg-amber-400' : 'bg-sky-400')}" style="width:${Math.min(100, ph.pct_committed)}%"></div>
              </div>
              <div class="text-[10px] font-mono text-slate-400 mt-1 text-right">${ph.pct_committed}% of Budget</div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- Ultrawide Side-by-Side: Multi-Year Roster Control Matrix + Prospect Pipeline -->
      <div class="grid grid-cols-1 uw:grid-cols-12 gap-5 items-start">
        <div class="glass-card overflow-hidden uw:col-span-7">
          <div class="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2">
            <div>
              <h3 class="font-extrabold text-sm uppercase tracking-wider text-white"><i class="bi bi-kanban-fill text-sky-400 mr-1.5"></i> Multi-Year Roster Control, Contract & Age-Curve Matrix (${(roadmap.player_matrix || []).length} Core Players)</h3>
              <p class="text-xs text-slate-400">Color-coded by contract status (Guaranteed vs. Arb/Pre-Arb vs. Free Agency) and player aging curve</p>
            </div>
            <div class="flex items-center gap-2 text-[10px] font-mono">
              <span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40">Guaranteed $</span>
              <span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Team Control / Arb</span>
              <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">Free Agent (FA)</span>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="saber-table">
              <thead>
                <tr>
                  <th class="text-left">Player</th>
                  <th>Pos</th>
                  <th>Age</th>
                  <th>OVR/POT</th>
                  <th class="text-right">${baseYearLabel} WAR</th>
                  ${yrs.map(y => `<th class="text-center">${y} Status</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${(roadmap.player_matrix || []).map(p => `
                  <tr onclick="openPlayerModal(${p.player_id})" class="cursor-pointer">
                    <td class="font-bold text-white hover:text-sky-400">${p.name}</td>
                    <td class="text-center font-mono text-xs text-sky-300">${p.pos}</td>
                    <td class="text-center font-mono">${p.age}</td>
                    <td class="text-center">${rtgBadge(p.oa, p.pot)}</td>
                    <td class="text-right font-mono font-extrabold text-sky-400">${Number(p.war || 0).toFixed(1)}</td>
                    ${(p.years || []).map(cell => {
                      let cls = "bg-slate-900/60 text-slate-500 border-slate-800";
                      if (cell.status === "Guaranteed") cls = "bg-sky-500/15 text-sky-200 border-sky-500/40";
                      else if (cell.status === "Team Control") cls = "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
                      const tierDot = cell.age_tier === "Prime" ? "🟢" : (cell.age_tier === "Ascent" ? "🔵" : (cell.age_tier === "Veteran" ? "🟡" : "🔴"));
                      return `
                        <td class="text-center p-1.5">
                          <div class="px-2 py-1 rounded-lg border text-xs font-mono ${cls}">
                            <div class="font-bold">${cell.status === 'Guaranteed' ? fmtMoney(cell.salary) : cell.label}</div>
                            <div class="text-[9px] opacity-80">${tierDot} Age ${cell.age} (${cell.age_tier})</div>
                          </div>
                        </td>
                      `;
                    }).join("")}
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="glass-card overflow-hidden uw:col-span-5">
          <div class="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex justify-between items-center">
            <h3 class="font-extrabold text-sm uppercase tracking-wider text-white"><i class="bi bi-stars text-amber-400 mr-1.5"></i> High-Ceiling Prospect & Young Core Pipeline (Age &le; 25)</h3>
            <span class="text-xs text-slate-400">Sorted by Potential Ceiling</span>
          </div>
          <div class="overflow-x-auto">
            <table class="saber-table">
              <thead>
                <tr>
                  <th class="text-left">Player</th>
                  <th>Pos</th>
                  <th>Age</th>
                  <th class="text-center">Current OVR</th>
                  <th class="text-center">Ceiling POT</th>
                  <th class="text-center">Growth Upside</th>
                  <th class="text-center">Projected ETA</th>
                  <th class="text-left">Key Scouting Tools (20-80)</th>
                  <th class="text-left">Positional Need Impact</th>
                </tr>
              </thead>
              <tbody>
                ${(roadmap.prospect_pipeline || []).map(pr => `
                  <tr onclick="openPlayerModal(${pr.player_id})" class="cursor-pointer">
                    <td class="font-bold text-white hover:text-sky-400">${pr.name}</td>
                    <td class="text-center font-mono text-xs text-sky-300">${pr.pos}</td>
                    <td class="text-center font-mono">${pr.age}</td>
                    <td class="text-center">${rtgBadge(pr.oa)}</td>
                    <td class="text-center">${rtgBadge(pr.pot)}</td>
                    <td class="text-center font-mono font-bold text-emerald-400">+${pr.upside}</td>
                    <td class="text-center"><span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-xs font-bold">${pr.eta}</span></td>
                    <td class="font-mono text-xs text-slate-300">${pr.key_tools}</td>
                    <td><span class="px-2 py-0.5 rounded text-xs font-bold ${pr.addresses_need === 'High Need' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-300'}">${pr.addresses_need}</span></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  };

  const renderRosterPanorama = () => `
    <!-- Team Batting Roster Table -->
    <div class="glass-card overflow-hidden">
      <div class="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex justify-between items-center">
        <h3 class="font-extrabold text-sm uppercase tracking-wider text-white"><i class="bi bi-person-lines-fill text-sky-400 mr-1.5"></i> ${team.full_name} — Position Players (20-80 Scouting + Sabermetrics + Statcast)</h3>
        <span class="text-xs text-slate-400">${batters.length} Batters • Click any header to sort</span>
      </div>
      <div class="overflow-x-auto">
        <table class="saber-table">
          <thead>
            <tr>
              <th class="text-left">Player</th>
              <th>Pos</th>
              <th>Age</th>
              <th>B</th>
              <th>OVR/POT</th>
              <th>CON</th>
              <th>POW</th>
              <th>EYE</th>
              <th>SPD</th>
              <th>PA</th>
              <th>AVG</th>
              <th>OBP</th>
              <th>SLG</th>
              <th>OPS</th>
              <th>HR</th>
              <th>RBI</th>
              <th>SB</th>
              <th>BB%</th>
              <th>K%</th>
              <th>wOBA</th>
              <th>xwOBA</th>
              <th>Avg EV</th>
              <th>Brl%</th>
              <th>wRC+</th>
              <th>Def ZR</th>
              <th>WAR</th>
              <th>Salary</th>
            </tr>
          </thead>
          <tbody>
            ${batters.map(b => `
              <tr onclick="openPlayerModal(${b.player_id})" class="cursor-pointer">
                <td class="font-bold text-white hover:text-sky-400">${b.name}</td>
                <td class="text-center font-mono text-xs text-sky-300">${b.position}</td>
                <td class="text-center font-mono">${b.age}</td>
                <td class="text-center font-mono">${b.bats}</td>
                <td class="text-center">${rtgBadge(b.oa, b.pot)}</td>
                <td class="text-center">${rtgBadge(b.rtg_contact)}</td>
                <td class="text-center">${rtgBadge(b.rtg_power)}</td>
                <td class="text-center">${rtgBadge(b.rtg_eye)}</td>
                <td class="text-center">${rtgBadge(b.rtg_speed)}</td>
                <td class="text-right font-mono">${b.pa}</td>
                <td class="text-right font-mono font-semibold">${fmtAvg(b.avg)}</td>
                <td class="text-right font-mono">${fmtAvg(b.obp)}</td>
                <td class="text-right font-mono">${fmtAvg(b.slg)}</td>
                <td class="text-right font-mono font-bold text-slate-200">${fmtAvg(b.ops)}</td>
                <td class="text-right font-mono font-bold text-pink-400">${b.hr}</td>
                <td class="text-right font-mono">${b.rbi}</td>
                <td class="text-right font-mono">${b.sb}</td>
                <td class="text-right font-mono">${b.bb_pct.toFixed(1)}%</td>
                <td class="text-right font-mono">${b.k_pct.toFixed(1)}%</td>
                <td class="text-right font-mono font-bold text-sky-300">${fmtAvg(b.woba)}</td>
                <td class="text-right font-mono text-amber-300">${fmtAvg(b.xwoba)}</td>
                <td class="text-right font-mono">${b.avg_ev}</td>
                <td class="text-right font-mono">${b.barrel_pct}%</td>
                <td class="text-right font-mono font-extrabold ${b.wrc_plus >= 105 ? 'text-emerald-400' : 'text-slate-200'}">${b.wrc_plus}</td>
                <td class="text-right font-mono ${b.zr >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${b.zr > 0 ? '+' : ''}${b.zr.toFixed(1)}</td>
                <td class="text-right font-mono font-extrabold text-sky-400">${b.war.toFixed(2)}</td>
                <td class="text-right font-mono text-xs text-slate-400">${fmtMoney(b.salary)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Team Pitching Staff Table -->
    <div class="glass-card overflow-hidden">
      <div class="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex justify-between items-center">
        <h3 class="font-extrabold text-sm uppercase tracking-wider text-white"><i class="bi bi-lightning-fill text-amber-400 mr-1.5"></i> ${team.full_name} — Pitching Staff (20-80 Scouting + FIP/xFIP/SIERA + Statcast)</h3>
        <span class="text-xs text-slate-400">${pitchers.length} Pitchers • Click any header to sort</span>
      </div>
      <div class="overflow-x-auto">
        <table class="saber-table">
          <thead>
            <tr>
              <th class="text-left">Pitcher</th>
              <th>Role</th>
              <th>Age</th>
              <th>T</th>
              <th>OVR/POT</th>
              <th>STU</th>
              <th>MOV</th>
              <th>CTL</th>
              <th>STM</th>
              <th>Velo</th>
              <th>G</th>
              <th>GS</th>
              <th>W-L</th>
              <th>SV</th>
              <th>IP</th>
              <th>ERA</th>
              <th>FIP</th>
              <th>xFIP</th>
              <th>SIERA</th>
              <th>ERA+</th>
              <th>WHIP</th>
              <th>K/9</th>
              <th>BB/9</th>
              <th>K-BB%</th>
              <th>GB%</th>
              <th>EV Agst</th>
              <th>WAR</th>
            </tr>
          </thead>
          <tbody>
            ${pitchers.map(p => `
              <tr onclick="openPlayerModal(${p.player_id})" class="cursor-pointer">
                <td class="font-bold text-white hover:text-sky-400">${p.name}</td>
                <td class="text-center font-mono text-xs text-amber-300">${p.role}</td>
                <td class="text-center font-mono">${p.age}</td>
                <td class="text-center font-mono">${p.throws}</td>
                <td class="text-center">${rtgBadge(p.oa, p.pot)}</td>
                <td class="text-center">${rtgBadge(p.rtg_stuff)}</td>
                <td class="text-center">${rtgBadge(p.rtg_movement)}</td>
                <td class="text-center">${rtgBadge(p.rtg_control)}</td>
                <td class="text-center">${rtgBadge(p.rtg_stamina)}</td>
                <td class="text-right font-mono text-xs text-sky-300">${p.velocity_str}</td>
                <td class="text-right font-mono">${p.g}</td>
                <td class="text-right font-mono">${p.gs}</td>
                <td class="text-right font-mono">${p.w}-${p.l}</td>
                <td class="text-right font-mono font-bold text-emerald-400">${p.sv}</td>
                <td class="text-right font-mono font-semibold">${p.ip_display}</td>
                <td class="text-right font-mono font-bold text-amber-300">${p.era.toFixed(2)}</td>
                <td class="text-right font-mono font-bold text-sky-300">${p.fip.toFixed(2)}</td>
                <td class="text-right font-mono">${p.xfip.toFixed(2)}</td>
                <td class="text-right font-mono text-slate-300">${p.siera.toFixed(2)}</td>
                <td class="text-right font-mono font-bold ${p.era_plus >= 105 ? 'text-emerald-400' : 'text-slate-200'}">${p.era_plus}</td>
                <td class="text-right font-mono">${p.whip.toFixed(2)}</td>
                <td class="text-right font-mono">${p.k9.toFixed(2)}</td>
                <td class="text-right font-mono">${p.bb9.toFixed(2)}</td>
                <td class="text-right font-mono">${p.k_minus_bb.toFixed(1)}%</td>
                <td class="text-right font-mono">${p.gb_pct.toFixed(1)}%</td>
                <td class="text-right font-mono">${p.avg_ev_against}</td>
                <td class="text-right font-mono font-extrabold text-sky-400">${p.war.toFixed(2)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  let subViewHtml = "";
  if (subTab === "depth") {
    subViewHtml = renderDepthAndSprayPanorama();
  } else if (subTab === "strengths") {
    subViewHtml = renderStrengthsPanorama();
  } else if (subTab === "roadmap") {
    subViewHtml = renderRoadmapPanorama();
  } else if (subTab === "command") {
    subViewHtml = `
      <div class="space-y-5">
        ${renderDepthAndSprayPanorama()}
        ${renderStrengthsPanorama()}
        ${renderRoadmapPanorama()}
        ${renderRosterPanorama()}
      </div>
    `;
  } else {
    subViewHtml = renderRosterPanorama();
  }

  container.innerHTML = `
    <div class="animate-view space-y-4">
      <!-- All-Teams Quick Pill Selector -->
      <div class="glass-card p-3.5">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Select Franchise Perspective (${teams.length} Teams):</div>
          <div class="text-[11px] font-mono text-slate-400">Active: <b class="text-white">${team.full_name} (${team.abbr})</b></div>
        </div>
        <div class="flex flex-wrap gap-2">
          ${teams.map(t => `
            <button onclick="switchTeamAndGo(${t.team_id})" class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-extrabold border transition ${t.team_id === team.team_id ? 'bg-sky-500 text-slate-950 border-sky-300 shadow-lg shadow-sky-500/25 scale-[1.03]' : 'bg-slate-900/85 text-slate-200 border-slate-800 hover:border-slate-500 hover:bg-slate-800/80'}">
              <img src="${teamLogoUrl(t.logo_file_name)}" class="w-6 h-6 object-contain drop-shadow">
              <span class="tracking-tight">${t.abbr}</span>
              <span class="text-[10px] opacity-80 font-mono">(${t.record_str || `${t.w}-${t.l}`})</span>
            </button>
          `).join("")}
        </div>
      </div>

      <!-- Flagship Broadcast Team Hero Banner -->
      <div class="glass-card team-banner-gradient team-hero-showcase p-6 sm:p-8 uw:p-10" style="--team-primary:${team.bg_color || '#1f1f20'}; --team-glow:${team.bg_color || '#38bdf8'}66;">
        <!-- Giant Atmospheric Watermark Crest -->
        <img src="${teamLogoUrl(team.logo_file_name)}" class="team-crest-watermark" alt="" aria-hidden="true">

        <div class="relative z-10 flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-6 uw:gap-10">
          <!-- Prominent Franchise Crest & Commanding Team Name -->
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-6 sm:gap-8">
            <div class="w-28 h-28 sm:w-36 sm:h-36 xl:w-40 xl:h-40 uw:w-44 uw:h-44 p-3.5 sm:p-4 team-crest-pedestal shrink-0">
              <img src="${teamLogoUrl(team.logo_file_name)}" class="w-full h-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.85)]" alt="${team.full_name}">
            </div>

            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2.5 mb-2">
                <span class="px-3 py-1 rounded-lg text-xs sm:text-sm font-black font-mono uppercase tracking-widest bg-white text-slate-950 shadow-md">${team.abbr}</span>
                <span class="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-400/40">${team.sub_league_name}</span>
                <span class="px-3 py-1 rounded-full text-xs font-extrabold font-mono bg-slate-950/80 text-emerald-400 border border-emerald-500/40">${team.record_str || `${team.w}-${team.l}`} (${fmtAvg(team.pct)})</span>
                <span class="text-xs text-slate-300 font-mono bg-slate-950/60 px-2.5 py-1 rounded-lg border border-white/10">GM / Mgr: <b class="text-white">${team.manager_name}</b></span>
                <a href="/bnn/${AppState.activeSave}/teams/team_${team.team_id}.html" target="_blank" class="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/40 text-xs text-amber-300 hover:bg-amber-500/25 font-bold transition"><i class="bi bi-box-arrow-up-right mr-1"></i>Native BNN Report</a>
              </div>

              <h2 class="text-4xl sm:text-5xl xl:text-6xl uw:text-7xl font-black text-white team-hero-title uppercase tracking-tight my-1">${team.full_name}</h2>

              <div class="text-xs sm:text-sm text-slate-200 mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 bg-slate-950/55 border border-white/10 rounded-xl px-4 py-2.5 backdrop-blur-md">
                <span><i class="bi bi-geo-alt-fill text-sky-400 mr-1"></i>Ballpark: <b class="text-white">${team.park.name}</b> <span class="text-slate-400 font-mono">(Cap: ${Number(team.park.capacity || 40000).toLocaleString()})</span></span>
                <span><i class="bi bi-cash-stack text-emerald-400 mr-1"></i>Payroll: <b class="text-white font-mono">${fmtMoney(team.payroll)}</b> <span class="text-slate-400 font-mono">/ Budget: ${fmtMoney(team.budget)}</span></span>
                <span><i class="bi bi-heart-fill text-rose-400 mr-1"></i>Fan Interest: <b class="text-white font-mono">${team.fan_interest}/100</b></span>
              </div>
            </div>
          </div>

          <!-- Executive KPI Grid -->
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-2.5 uw:gap-3 text-center shrink-0">
            <div class="bg-slate-950/75 px-4 py-3 rounded-2xl border border-white/15 shadow-lg">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Record</div>
              <div class="text-xl uw:text-2xl font-black text-white font-mono mt-0.5">${team.record_str || `${team.w}-${team.l}`}</div>
              <div class="text-[11px] text-sky-400 font-mono font-bold">${fmtAvg(team.pct)}</div>
            </div>
            <div class="bg-slate-950/75 px-4 py-3 rounded-2xl border border-white/15 shadow-lg">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pythagorean</div>
              <div class="text-xl uw:text-2xl font-black text-emerald-400 font-mono mt-0.5">${team.pyth_w}-${team.pyth_l}</div>
              <div class="text-[11px] text-slate-300 font-mono">Diff: ${team.run_diff > 0 ? '+' : ''}${team.run_diff}</div>
            </div>
            <div class="bg-slate-950/75 px-4 py-3 rounded-2xl border border-white/15 shadow-lg">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Offense wRC+</div>
              <div class="text-xl uw:text-2xl font-black text-white font-mono mt-0.5">${team.wrc_plus}</div>
              <div class="text-[11px] text-slate-300 font-mono">wOBA ${fmtAvg(team.woba)}</div>
            </div>
            <div class="bg-slate-950/75 px-4 py-3 rounded-2xl border border-white/15 shadow-lg">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team ERA / FIP</div>
              <div class="text-xl uw:text-2xl font-black text-amber-300 font-mono mt-0.5">${team.era.toFixed(2)}</div>
              <div class="text-[11px] text-slate-300 font-mono">FIP ${team.fip.toFixed(2)}</div>
            </div>
            <div class="bg-slate-950/75 px-4 py-3 rounded-2xl border border-white/15 shadow-lg">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Defense ZR</div>
              <div class="text-xl uw:text-2xl font-black ${team.zr >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono mt-0.5">${team.zr > 0 ? '+' : ''}${team.zr.toFixed(1)}</div>
              <div class="text-[11px] text-slate-300 font-mono">Framing ${team.framing > 0 ? '+' : ''}${team.framing.toFixed(1)}</div>
            </div>
            <div class="bg-slate-950/75 px-4 py-3 rounded-2xl border border-white/15 shadow-lg">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total WAR</div>
              <div class="text-xl uw:text-2xl font-black text-sky-400 font-mono mt-0.5">${team.total_war.toFixed(1)}</div>
              <div class="text-[11px] text-slate-300 font-mono">PO Odds ${team.playoff_prob.toFixed(0)}%</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Team Dashboard Sub-Navigation Bar -->
      <div class="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button onclick="switchTeamHubSubTab('depth')" class="px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-2 ${subTab === 'depth' ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
          <i class="bi bi-diagram-3-fill"></i> Graphical Depth Chart & Field Map
        </button>
        <button onclick="switchTeamHubSubTab('strengths')" class="px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-2 ${subTab === 'strengths' ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
          <i class="bi bi-bar-chart-steps"></i> Positional Strengths & Upgrade Matrix
        </button>
        <button onclick="switchTeamHubSubTab('roadmap')" class="px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-2 ${subTab === 'roadmap' ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
          <i class="bi bi-calendar-range"></i> 5-Year Franchise Roadmap & Pipeline
        </button>
        <button onclick="switchTeamHubSubTab('roster')" class="px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-2 ${subTab === 'roster' ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
          <i class="bi bi-table"></i> Full Scouting & Sabermetric Roster (${batters.length + pitchers.length})
        </button>
        <button onclick="switchTeamHubSubTab('command')" class="px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-2 ${subTab === 'command' ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' : 'bg-slate-900 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400'}">
          <i class="bi bi-aspect-ratio-fill"></i> Ultrawide All-in-One Panorama
        </button>
      </div>

      ${subViewHtml}
    </div>
  `;

  if (subTab === "depth" || subTab === "command") {
    renderGraphicalDepthChartDiamond("team-depth-diamond-svg", depthChart, selPos);
    renderBallparkSpraySVG("team-hub-spray-svg", teamSpray, { inspectorId: "team-hub-spray-inspector" });
  }
  if (subTab === "strengths" || subTab === "command") {
    renderPositionalStrengthsChart("team-pos-strengths-canvas", strengths.units || []);
    renderTeamRadarChart("team-radar-canvas", team, teams);
  }
}

/* ============================================================================
 * 3. STATCAST, SPRAY CHARTS & AT-BAT VISUALIZER TAB
 * ============================================================================ */
async function renderStatcastTab(container) {
  showLoading("Loading Statcast Batted Ball & Spray Chart Engine...");
  try {
    if (!AppState.sabermetrics) {
      AppState.sabermetrics = await fetchJSON(`/api/sabermetrics?save=${AppState.activeSave}`);
    }
    AppState.spray = await fetchJSON(`/api/spray?save=${AppState.activeSave}&limit=900`);
  } finally {
    hideLoading();
  }

  const batters = AppState.sabermetrics.batters || [];
  const pitchers = AppState.sabermetrics.pitchers || [];
  const teams = (AppState.overview && AppState.overview.teams) || [];
  const parks = AppState.spray.parks || [];
  const sum = AppState.spray.summary || {};

  container.innerHTML = `
    <div class="animate-view space-y-5">
      <!-- Interactive Statcast Filter Bar -->
      <div class="glass-card p-4">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1 min-w-[180px]">
            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Filter by Batter</label>
            <select id="sc-batter-select" onchange="reloadSprayChart()" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white">
              <option value="">All League Batters</option>
              ${batters.slice(0, 180).map(b => `<option value="${b.player_id}">${b.name} (${b.team_abbr} • ${b.hr} HR, ${b.avg_ev} EV)</option>`).join("")}
            </select>
          </div>
          <div class="flex-1 min-w-[180px]">
            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Filter by Opposing Pitcher</label>
            <select id="sc-pitcher-select" onchange="reloadSprayChart()" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white">
              <option value="">All Opposing Pitchers</option>
              ${pitchers.slice(0, 180).map(p => `<option value="${p.player_id}">${p.name} (${p.team_abbr} • ${p.k} K, ${p.era.toFixed(2)} ERA)</option>`).join("")}
            </select>
          </div>
          <div class="w-44">
            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Filter by Team</label>
            <select id="sc-team-select" onchange="reloadSprayChart()" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white">
              <option value="">All Teams</option>
              ${teams.map(t => `<option value="${t.team_id}">${t.abbr} — ${t.full_name}</option>`).join("")}
            </select>
          </div>
          <div class="w-40">
            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Play Result</label>
            <select id="sc-result-select" onchange="reloadSprayChart()" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white">
              <option value="ALL">All Balls in Play</option>
              <option value="HITS">All Hits (1B/2B/3B/HR)</option>
              <option value="HR">Home Runs Only</option>
              <option value="2B">Doubles Only</option>
              <option value="3B">Triples Only</option>
              <option value="1B">Singles Only</option>
              <option value="FO">Flyouts / Lineouts</option>
              <option value="GO">Groundouts</option>
            </select>
          </div>
          <div class="w-60">
            <label class="block text-[10px] font-bold uppercase text-pink-400 mb-1">"Would It Dong?" Stadium Overlay</label>
            <select id="sc-park-select" onchange="reloadSprayChart()" class="w-full bg-slate-900 border border-pink-500/50 rounded-lg px-3 py-2 text-xs text-white font-semibold">
              <option value="ALL">🏟️ All League Stadiums (${parks.length}-Park Overlay)</option>
              ${parks.map(pk => `<option value="${pk.park_id}">${pk.name} (CF ${pk.distances ? pk.distances[3] : 405}' / HR PF ${pk.hr})</option>`).join("")}
            </select>
          </div>
          <div class="w-40">
            <label class="block text-[10px] font-bold uppercase text-slate-400 mb-1">Dot Color Mode</label>
            <select id="sc-colormode-select" onchange="updateSprayColorMode()" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white">
              <option value="result">By Hit Outcome</option>
              <option value="ev">By Exit Velocity</option>
              <option value="dong">Would It Dong? (Multi-Park)</option>
            </select>
          </div>
          <button onclick="selectAllStadiumsSpray()" class="px-3 py-2 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/50 text-pink-300 text-xs font-extrabold transition flex items-center gap-1.5">
            <i class="bi bi-layers-half"></i> Overlay All Stadiums
          </button>
        </div>
      </div>

      <!-- Ultrawide 3-Column Broadcast Row: Ballpark Spray Chart (5) + At-Bat Inspector & KPIs (3) + EV/LA Barrel Zone (4) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div class="glass-card p-4 lg:col-span-7 uw:col-span-5 flex flex-col justify-between">
          <div class="flex flex-wrap justify-between items-center mb-2 gap-2">
            <div>
              <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <i class="bi bi-crosshair text-sky-400"></i> Interactive Ballpark Spray Chart & Wall Geometry
              </h3>
              <p class="text-xs text-slate-400">Select <b>All League Stadiums</b> to overlay every park's wall contour and see how many ballparks each hit clears</p>
            </div>
            <div class="flex items-center gap-2.5 text-[11px]">
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-pink-500 inline-block"></span> HR</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"></span> 3B</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block"></span> 2B</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> 1B</span>
              <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span> Out</span>
            </div>
          </div>
          <div id="main-spray-svg-container" class="my-auto"></div>
        </div>

        <div class="lg:col-span-5 uw:col-span-3 flex flex-col gap-5">
          <!-- Selected At-Bat Inspector Card -->
          <div class="glass-card p-4 flex-1 flex flex-col justify-between">
            <div class="text-xs font-extrabold uppercase tracking-wider text-sky-400 mb-2 flex items-center gap-1.5">
              <i class="bi bi-broadcast"></i> Statcast At-Bat Inspector
            </div>
            <div id="spray-at-bat-inspector" class="text-xs text-slate-300 my-auto">Hover or click any ball in play on the stadium field to inspect exit velocity, launch angle, hang time, and multi-stadium home run clearance.</div>
          </div>

          <!-- Summary KPI Strip -->
          <div id="spray-summary-kpis" class="glass-card p-4">
            ${renderSpraySummaryBoxes(sum)}
          </div>
        </div>

        <!-- Exit Velocity vs Launch Angle Scatter Chart (Dedicated 3rd Column on Ultrawide) -->
        <div class="glass-card p-4 lg:col-span-12 uw:col-span-4 flex flex-col justify-between">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <i class="bi bi-graph-up text-pink-400"></i> Exit Velocity vs. Launch Angle (Barrel Zone)
            </h4>
            <span class="text-[10px] font-mono text-pink-300">98+ mph • 26°–30° Sweet Spot</span>
          </div>
          <div class="h-64 uw:h-[420px] flex-1">
            <canvas id="ev-la-scatter-canvas"></canvas>
          </div>
        </div>
      </div>

      <!-- Statcast Leaderboards -->
      <div class="glass-card overflow-hidden">
        <div class="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2">
          <h3 class="font-extrabold text-sm uppercase tracking-wider text-white"><i class="bi bi-fire text-amber-400 mr-1.5"></i> League Statcast Quality of Contact Leaderboard</h3>
          <span class="text-xs text-slate-400">Click any column header to sort • Click any batter for Savant & Spray Card</span>
        </div>
        <div class="overflow-x-auto">
          <table class="saber-table">
            <thead>
              <tr>
                <th class="text-left">Batter</th>
                <th>Team</th>
                <th>Pos</th>
                <th>PA</th>
                <th>BIP</th>
                <th>Avg EV</th>
                <th>Max EV</th>
                <th>Avg LA</th>
                <th>Sprint (ft/s)</th>
                <th>Barrels</th>
                <th>Barrel %</th>
                <th>Hard-Hit %</th>
                <th>Sweet-Spot %</th>
                <th>GB %</th>
                <th>LD %</th>
                <th>FB %</th>
                <th>BA</th>
                <th>xBA</th>
                <th>SLG</th>
                <th>xSLG</th>
                <th>wOBA</th>
                <th>xwOBA</th>
                <th>wOBA-xwOBA</th>
              </tr>
            </thead>
            <tbody>
              ${[...batters].sort((a, b) => b.barrels - a.barrels || b.xwoba - a.xwoba).slice(0, 80).map(b => `
                <tr onclick="openPlayerModal(${b.player_id})" class="cursor-pointer">
                  <td class="font-bold text-white hover:text-sky-400">${b.name}</td>
                  <td class="text-center font-mono text-xs">${b.team_abbr}</td>
                  <td class="text-center font-mono text-xs text-sky-300">${b.position}</td>
                  <td class="text-right font-mono">${b.pa}</td>
                  <td class="text-right font-mono">${b.bip}</td>
                  <td class="text-right font-mono font-bold text-white">${b.avg_ev}</td>
                  <td class="text-right font-mono text-pink-400 font-bold">${b.max_ev}</td>
                  <td class="text-right font-mono">${b.avg_la}°</td>
                  <td class="text-right font-mono">${b.avg_sprint}</td>
                  <td class="text-right font-mono font-extrabold text-amber-400">${b.barrels}</td>
                  <td class="text-right font-mono font-bold text-amber-300">${b.barrel_pct}%</td>
                  <td class="text-right font-mono text-pink-300">${b.hard_hit_pct}%</td>
                  <td class="text-right font-mono text-emerald-300">${b.sweet_spot_pct}%</td>
                  <td class="text-right font-mono">${b.gb_pct}%</td>
                  <td class="text-right font-mono">${b.ld_pct}%</td>
                  <td class="text-right font-mono">${b.fb_pct}%</td>
                  <td class="text-right font-mono">${fmtAvg(b.avg)}</td>
                  <td class="text-right font-mono text-sky-300">${fmtAvg(b.xba)}</td>
                  <td class="text-right font-mono">${fmtAvg(b.slg)}</td>
                  <td class="text-right font-mono text-sky-300">${fmtAvg(b.xslg)}</td>
                  <td class="text-right font-mono font-bold">${fmtAvg(b.woba)}</td>
                  <td class="text-right font-mono font-extrabold text-amber-300">${fmtAvg(b.xwoba)}</td>
                  <td class="text-right font-mono ${b.woba_diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${b.woba_diff >= 0 ? '+' : ''}${b.woba_diff.toFixed(3)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const parkSel = document.getElementById("sc-park-select");
  if (parkSel && AppState.spray.park && !AppState.spray.park.is_all_stadiums) {
    parkSel.value = String(AppState.spray.park.park_id);
  }
  renderBallparkSpraySVG("main-spray-svg-container", AppState.spray, { inspectorId: "spray-at-bat-inspector" });
  renderEVLAScatterChart("ev-la-scatter-canvas", AppState.spray.points);
}

window.selectAllStadiumsSpray = function() {
  const parkSel = document.getElementById("sc-park-select");
  const colorSel = document.getElementById("sc-colormode-select");
  if (parkSel) parkSel.value = "ALL";
  if (colorSel) colorSel.value = "dong";
  reloadSprayChart();
};

function renderSpraySummaryBoxes(sum) {
  return `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs font-mono mb-3">
      <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
        <div class="text-[10px] text-slate-400">Avg / 90th EV</div>
        <div class="font-extrabold text-white">${sum.avg_ev || 0} / ${sum.ev90 || 0}</div>
      </div>
      <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
        <div class="text-[10px] text-slate-400">Max Exit Velo</div>
        <div class="font-extrabold text-pink-400">${sum.max_ev || 0} mph</div>
      </div>
      <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
        <div class="text-[10px] text-slate-400">Barrels (%)</div>
        <div class="font-extrabold text-amber-400">${sum.barrels || 0} (${sum.barrel_pct || 0}%)</div>
      </div>
      <div class="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
        <div class="text-[10px] text-pink-400">Actual HR / Selected Park</div>
        <div class="font-extrabold text-pink-300">${sum.hr || 0} / ${sum.would_it_dong || 0}</div>
      </div>
      <div class="bg-slate-900/90 p-2 rounded-lg border border-emerald-500/30">
        <div class="text-[10px] text-emerald-400" title="Cleared every active ballpark wall in the league">No-Doubters (${sum.total_parks || 20}/${sum.total_parks || 20} Parks)</div>
        <div class="font-extrabold text-emerald-300">${sum.no_doubter_hrs || 0} HRs</div>
      </div>
      <div class="bg-slate-900/90 p-2 rounded-lg border border-amber-500/30">
        <div class="text-[10px] text-amber-300" title="Would be a HR in at least 1 league stadium">HR in 1+ Stadiums</div>
        <div class="font-extrabold text-amber-300">${sum.unicorn_hrs || 0} Balls</div>
      </div>
    </div>
    <div class="space-y-1.5 text-[11px]">
      <div class="flex justify-between text-slate-400"><span>Spray Direction:</span><span class="font-mono text-slate-200">Left ${sum.left_pct || 0}% • Center ${sum.center_pct || 0}% • Right ${sum.right_pct || 0}%</span></div>
      <div class="flex justify-between text-slate-400"><span>Batted Ball Types:</span><span class="font-mono text-slate-200">GB ${sum.gb_pct || 0}% • LD ${sum.ld_pct || 0}% • FB ${sum.fb_pct || 0}% • PU ${sum.pu_pct || 0}%</span></div>
    </div>
  `;
}

window.reloadSprayChart = async function() {
  const player_id = document.getElementById("sc-batter-select")?.value || "";
  const opponent_id = document.getElementById("sc-pitcher-select")?.value || "";
  const team_id = document.getElementById("sc-team-select")?.value || "";
  const result = document.getElementById("sc-result-select")?.value || "ALL";
  const park_id = document.getElementById("sc-park-select")?.value || "";
  const colorMode = document.getElementById("sc-colormode-select")?.value || "result";

  const params = new URLSearchParams({ save: AppState.activeSave, result, limit: "900" });
  if (player_id) params.set("player_id", player_id);
  if (opponent_id) params.set("opponent_id", opponent_id);
  if (team_id) params.set("team_id", team_id);
  if (park_id) params.set("park_id", park_id);

  AppState.spray = await fetchJSON(`/api/spray?${params.toString()}`);
  const kpiEl = document.getElementById("spray-summary-kpis");
  if (kpiEl) kpiEl.innerHTML = renderSpraySummaryBoxes(AppState.spray.summary || {});
  renderBallparkSpraySVG("main-spray-svg-container", AppState.spray, { inspectorId: "spray-at-bat-inspector", colorMode });
  renderEVLAScatterChart("ev-la-scatter-canvas", AppState.spray.points);
};

window.updateSprayColorMode = function() {
  const colorMode = document.getElementById("sc-colormode-select")?.value || "result";
  renderBallparkSpraySVG("main-spray-svg-container", AppState.spray, { inspectorId: "spray-at-bat-inspector", colorMode });
};

/* ============================================================================
 * 4. GAME LOGS, BOX SCORES & AT-BAT REPLAY CENTER
 * ============================================================================ */
async function renderGameLogsTab(container, selectedGameId = null, startReplayFromZero = false) {
  if (AppState.replayTimer) {
    clearInterval(AppState.replayTimer);
    AppState.replayTimer = null;
    AppState.replayPlaying = false;
  }

  showLoading("Loading Season Game Logs, Box Scores & At-Bat Replay...");
  try {
    const params = new URLSearchParams({ save: AppState.activeSave, limit: "120" });
    if (selectedGameId) params.set("game_id", selectedGameId);
    AppState.gamesData = await fetchJSON(`/api/games?${params.toString()}`);
  } finally {
    hideLoading();
  }

  const games = AppState.gamesData.games || [];
  const g = AppState.gamesData.active_game;
  if (g) {
    AppState.replayStep = startReplayFromZero ? 0 : g.at_bats.length;
  }

  container.innerHTML = `
    <div class="animate-view grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <!-- Left Sidebar: Completed Games Selector (Docked slim column on ultrawide) -->
      <div class="glass-card p-3.5 lg:col-span-4 uw:col-span-3 suw:col-span-2 max-h-[920px] uw:max-h-[calc(100vh-140px)] uw:sticky uw:top-20 flex flex-col">
        <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
          <h3 class="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-1.5">
            <i class="bi bi-calendar2-week text-sky-400"></i> Games (${games.length})
          </h3>
          <span class="text-[10px] font-mono text-emerald-400">Click to Replay</span>
        </div>
        <div class="overflow-y-auto space-y-2 pr-1 flex-1">
          ${games.map(item => {
            const isSel = g && item.game_id === g.game_id;
            return `
              <div onclick="renderGameLogsTab(document.getElementById('main-view-container'), ${item.game_id})" class="p-2.5 rounded-xl border cursor-pointer transition ${isSel ? 'bg-sky-500/15 border-sky-400 shadow-md' : 'bg-slate-900/75 border-slate-800 hover:border-slate-600'}">
                <div class="flex justify-between items-center text-[10px] font-mono text-slate-400 mb-1">
                  <span>#${item.game_id} • ${item.date}</span>
                  <button onclick="event.stopPropagation(); startFullGameReplay(${item.game_id})" class="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/40 font-bold text-[10px]">▶ 0-0</button>
                </div>
                <div class="flex justify-between items-center text-xs font-bold">
                  <div class="flex items-center gap-1.5 truncate">
                    <img src="${teamLogoUrl(item.away_logo)}" class="w-4 h-4 object-contain">
                    <span class="text-white truncate">${item.away_name}</span>
                  </div>
                  <span class="font-mono text-sm ${item.away_runs > item.home_runs ? 'text-emerald-400 font-black' : 'text-slate-300'}">${item.away_runs}</span>
                </div>
                <div class="flex justify-between items-center text-xs font-bold mt-1">
                  <div class="flex items-center gap-1.5 truncate">
                    <img src="${teamLogoUrl(item.home_logo)}" class="w-4 h-4 object-contain">
                    <span class="text-white truncate">${item.home_name}</span>
                  </div>
                  <span class="font-mono text-sm ${item.home_runs > item.away_runs ? 'text-emerald-400 font-black' : 'text-slate-300'}">${item.home_runs}</span>
                </div>
                <div class="mt-1.5 pt-1 border-t border-slate-800/80 text-[10px] text-slate-400 flex justify-between truncate">
                  <span class="truncate">W: <b class="text-slate-200">${item.winning_pitcher}</b> • L: <b class="text-slate-200">${item.losing_pitcher}</b></span>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Right Detail Pane: Active Game Replay Console, Box Score, Spray Chart & At-Bat Feed -->
      <div id="active-game-detail-pane" class="lg:col-span-8 uw:col-span-9 suw:col-span-10 space-y-5">
        ${g ? renderActiveGameDetailHtml(g) : `<div class="glass-card p-8 text-center text-slate-400">Select a game on the left to inspect its full box score, spray chart, and play-by-play replay.</div>`}
      </div>
    </div>
  `;

  if (g) {
    updateReplayVisuals();
    if (startReplayFromZero) {
      toggleGameReplay(true);
    }
  }
}

window.startFullGameReplay = async function(gameId) {
  await renderGameLogsTab(document.getElementById("main-view-container"), gameId, true);
};

window.setReplayStep = function(stepIdx) {
  const g = AppState.gamesData && AppState.gamesData.active_game;
  if (!g) return;
  const maxStep = g.at_bats.length;
  AppState.replayStep = Math.max(0, Math.min(maxStep, Number(stepIdx)));
  updateReplayVisuals();
};

window.stepReplay = function(delta) {
  const g = AppState.gamesData && AppState.gamesData.active_game;
  if (!g) return;
  const next = (AppState.replayStep ?? g.at_bats.length) + delta;
  if (next > g.at_bats.length) {
    if (AppState.replayTimer) {
      clearInterval(AppState.replayTimer);
      AppState.replayTimer = null;
      AppState.replayPlaying = false;
    }
    setReplayStep(g.at_bats.length);
    return;
  }
  setReplayStep(next);
};

window.setReplaySpeed = function(ms) {
  AppState.replaySpeedMs = Number(ms) || 900;
  document.querySelectorAll(".replay-speed-btn").forEach(btn => {
    btn.classList.toggle("bg-sky-500", Number(btn.dataset.speed) === AppState.replaySpeedMs);
    btn.classList.toggle("text-slate-950", Number(btn.dataset.speed) === AppState.replaySpeedMs);
  });
  if (AppState.replayPlaying) {
    clearInterval(AppState.replayTimer);
    AppState.replayTimer = setInterval(() => stepReplay(1), AppState.replaySpeedMs);
  }
};

window.toggleGameReplay = function(forceStart = false) {
  const g = AppState.gamesData && AppState.gamesData.active_game;
  if (!g) return;
  if (AppState.replayPlaying && !forceStart) {
    clearInterval(AppState.replayTimer);
    AppState.replayTimer = null;
    AppState.replayPlaying = false;
    updateReplayVisuals();
    return;
  }
  if (AppState.replayStep >= g.at_bats.length) {
    AppState.replayStep = 0;
  }
  AppState.replayPlaying = true;
  if (AppState.replayTimer) clearInterval(AppState.replayTimer);
  AppState.replayTimer = setInterval(() => stepReplay(1), AppState.replaySpeedMs || 900);
  updateReplayVisuals();
};

window.jumpToReplayInning = function(inningNum) {
  const g = AppState.gamesData && AppState.gamesData.active_game;
  if (!g) return;
  const found = g.at_bats.find(ab => Number(ab.inning) === Number(inningNum));
  if (found) {
    setReplayStep(found.step_index);
  }
};

function updateReplayVisuals() {
  const g = AppState.gamesData && AppState.gamesData.active_game;
  if (!g) return;
  const totalSteps = g.at_bats.length;
  const step = Math.max(0, Math.min(totalSteps, AppState.replayStep ?? totalSteps));
  const curAb = step > 0 ? g.at_bats[step - 1] : null;

  const awayScore = step === 0 ? 0 : (curAb ? curAb.away_score_after : g.away_runs);
  const homeScore = step === 0 ? 0 : (curAb ? curAb.home_score_after : g.home_runs);
  const winProb = step === 0 ? 50.0 : (curAb ? curAb.home_win_prob : (g.home_runs > g.away_runs ? 100.0 : 0.0));
  const inningLabel = step === 0 ? "PRE-GAME (0-0)" : (step === totalSteps && !AppState.replayPlaying ? `FINAL (${g.away_runs}-${g.home_runs})` : (curAb ? curAb.inning_label : "FINAL"));

  // Update Scorebug DOM
  const elAwayScore = document.getElementById("replay-away-score");
  const elHomeScore = document.getElementById("replay-home-score");
  const elInning = document.getElementById("replay-inning-badge");
  const elDesc = document.getElementById("replay-play-banner");
  const elDiamond = document.getElementById("replay-diamond-outs");
  const elScrubber = document.getElementById("replay-scrubber");
  const elStepLabel = document.getElementById("replay-step-counter");
  const elPlayBtn = document.getElementById("replay-play-btn");
  const elWpBar = document.getElementById("replay-wp-bar");
  const elWpLabel = document.getElementById("replay-wp-label");

  if (elAwayScore) elAwayScore.textContent = awayScore;
  if (elHomeScore) elHomeScore.textContent = homeScore;
  if (elInning) elInning.textContent = inningLabel;
  if (elScrubber) elScrubber.value = String(step);
  if (elStepLabel) elStepLabel.textContent = `Play ${step} / ${totalSteps}`;
  if (elPlayBtn) {
    elPlayBtn.innerHTML = AppState.replayPlaying
      ? `<i class="bi bi-pause-fill mr-1"></i>Pause`
      : (step === 0 || step === totalSteps ? `<i class="bi bi-play-fill mr-1"></i>Replay from 0-0` : `<i class="bi bi-play-fill mr-1"></i>Resume`);
  }
  if (elWpBar) elWpBar.style.width = `${winProb}%`;
  if (elWpLabel) elWpLabel.textContent = `${g.home_abbr} Win Prob: ${winProb.toFixed(1)}% | ${g.away_abbr}: ${(100 - winProb).toFixed(1)}%`;

  if (elDesc) {
    if (step === 0) {
      elDesc.innerHTML = `<span class="text-emerald-400 font-extrabold">READY FOR FIRST PITCH:</span> Click <b>Replay from 0-0</b> or press <b>Next Play</b> to watch ${g.away_name} at ${g.home_name} unfold play-by-play!`;
    } else if (curAb) {
      const runBadge = curAb.runs_on_play > 0 ? `<span class="ml-2 px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-black text-xs animate-pulse">+${curAb.runs_on_play} RUN${curAb.runs_on_play > 1 ? 'S' : ''} SCORED!</span>` : "";
      elDesc.innerHTML = `
        <span class="font-mono text-sky-400 font-bold">[${curAb.inning_label} • ${curAb.outs} Out • Count ${curAb.count}]</span>
        <span class="text-white font-semibold ml-1.5">${curAb.play_description}</span>
        ${runBadge}
      `;
    }
  }

  if (elDiamond) {
    const b1 = curAb ? curAb.base1 : 0;
    const b2 = curAb ? curAb.base2 : 0;
    const b3 = curAb ? curAb.base3 : 0;
    const outs = curAb ? curAb.outs_after : 0;
    elDiamond.innerHTML = `
      ${baseDiamondSvg(b1, b2, b3)}
      <div class="flex items-center gap-1 ml-2" title="Outs">
        ${[1, 2, 3].map(o => `<span class="w-2.5 h-2.5 rounded-full ${o <= outs ? 'bg-amber-400 shadow-sm shadow-amber-400' : 'bg-slate-800 border border-slate-600'}"></span>`).join("")}
        <span class="text-[10px] font-mono text-slate-400 ml-1">${outs} Out</span>
      </div>
    `;
  }

  // Update progressive line score cells
  const maxInn = Math.max(9, g.away_innings.length, g.home_innings.length);
  for (let inn = 1; inn <= maxInn; inn++) {
    const awayCell = document.getElementById(`linescore-away-${inn}`);
    const homeCell = document.getElementById(`linescore-home-${inn}`);
    if (step === totalSteps) {
      const af = g.away_innings.find(x => x.inning === inn);
      const hf = g.home_innings.find(x => x.inning === inn);
      if (awayCell) awayCell.textContent = af ? af.runs : (inn <= 9 ? 0 : "");
      if (homeCell) homeCell.textContent = hf ? hf.runs : (inn <= 9 ? 0 : "");
    } else {
      const curInn = curAb ? curAb.inning : 0;
      const curHalf = curAb ? curAb.half : "top";
      const awayPlays = g.at_bats.slice(0, step).filter(x => x.inning === inn && x.half === "top");
      const homePlays = g.at_bats.slice(0, step).filter(x => x.inning === inn && x.half === "bottom");
      if (awayCell) {
        if (step === 0 || inn > curInn) awayCell.textContent = "-";
        else awayCell.textContent = awayPlays.reduce((s, x) => s + (x.runs_on_play || 0), 0);
      }
      if (homeCell) {
        if (step === 0 || inn > curInn || (inn === curInn && curHalf === "top")) homeCell.textContent = "-";
        else homeCell.textContent = homePlays.reduce((s, x) => s + (x.runs_on_play || 0), 0);
      }
    }
  }

  // Highlight active play row in feed
  document.querySelectorAll(".pbp-step-row").forEach(row => {
    const rStep = Number(row.dataset.step);
    const isCurrent = rStep === step;
    row.classList.toggle("border-amber-400", isCurrent);
    row.classList.toggle("bg-amber-500/15", isCurrent);
    row.classList.toggle("opacity-40", step < totalSteps && rStep > step);
    if (isCurrent && AppState.replayPlaying) {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });

  // Update Spray Chart up to current step + highlight current play
  const visiblePoints = g.at_bats.slice(0, step);
  renderBallparkSpraySVG(
    "game-detail-spray-svg",
    { park: g.park, points: visiblePoints, summary: g.spray_summary },
    { inspectorId: "game-detail-spray-inspector", highlightStepIndex: curAb ? curAb.step_index : null }
  );

  // Update Win Probability Chart up to current step
  renderGameWinProbChart("game-win-prob-canvas", g.at_bats, step, g.away_abbr, g.home_abbr);
}

function renderActiveGameDetailHtml(g) {
  const maxInn = Math.max(9, g.away_innings.length, g.home_innings.length);
  const innHeaders = Array.from({ length: maxInn }, (_, i) => `<th onclick="jumpToReplayInning(${i + 1})" class="text-center font-mono cursor-pointer hover:text-sky-400" title="Click to jump replay to Inning ${i + 1}">${i + 1}</th>`).join("");
  const awayInnCells = Array.from({ length: maxInn }, (_, i) => `<td id="linescore-away-${i + 1}" class="text-center font-mono">0</td>`).join("");
  const homeInnCells = Array.from({ length: maxInn }, (_, i) => `<td id="linescore-home-${i + 1}" class="text-center font-mono">0</td>`).join("");

  return `
    <!-- Interactive Broadcast Game Replay Console & Live Scorebug -->
    <div class="glass-card p-4 border-t-4 border-t-sky-400">
      <div class="flex flex-wrap justify-between items-center gap-2 mb-3">
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/40 text-xs font-extrabold">GAME #${g.game_id} • ${g.date}</span>
          <span id="replay-inning-badge" class="px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 text-xs font-mono font-extrabold">FINAL</span>
          <span class="text-xs text-slate-400"><i class="bi bi-geo-alt"></i> ${g.park.name}</span>
        </div>
        <div class="flex gap-2">
          <a href="/bnn/${AppState.activeSave}/box_scores/game_box_${g.game_id}.html" target="_blank" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-bold border border-slate-600 transition"><i class="bi bi-file-earmark-code mr-1"></i>Box Score HTML</a>
          <a href="/bnn/${AppState.activeSave}/game_logs/log_${g.game_id}.html" target="_blank" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold border border-slate-600 transition"><i class="bi bi-journal-text mr-1"></i>Game Log HTML</a>
        </div>
      </div>

      <!-- Ultrawide Side-by-Side Scorebug/Controls (Left) + Progressive Line Score (Right) -->
      <div class="grid grid-cols-1 uw:grid-cols-12 gap-4 items-center">
        <div class="uw:col-span-7 space-y-2.5">
          <!-- Broadcast Scorebug Strip -->
          <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-slate-950/80 border border-slate-800 rounded-2xl p-3">
            <div class="md:col-span-4 flex items-center justify-between px-2">
              <div class="flex items-center gap-2.5">
                <img src="${teamLogoUrl(g.away_logo)}" class="w-9 h-9 object-contain">
                <div>
                  <div class="text-[10px] text-slate-400 font-mono uppercase">Away</div>
                  <div class="text-sm font-black text-white">${g.away_name}</div>
                </div>
              </div>
              <div id="replay-away-score" class="text-2xl font-black font-mono text-sky-400">${g.away_runs}</div>
            </div>

            <div class="md:col-span-4 flex flex-col items-center justify-center border-y md:border-y-0 md:border-x border-slate-800 py-1">
              <div id="replay-diamond-outs" class="flex items-center justify-center mb-1"></div>
              <div id="replay-wp-label" class="text-[10px] font-mono text-slate-400 mb-1">Win Probability</div>
              <div class="w-full max-w-[180px] h-1.5 bg-rose-500/40 rounded-full overflow-hidden">
                <div id="replay-wp-bar" class="h-full bg-sky-400 transition-all duration-300" style="width:50%"></div>
              </div>
            </div>

            <div class="md:col-span-4 flex items-center justify-between px-2">
              <div id="replay-home-score" class="text-2xl font-black font-mono text-emerald-400">${g.home_runs}</div>
              <div class="flex items-center gap-2.5 text-right">
                <div>
                  <div class="text-[10px] text-slate-400 font-mono uppercase">Home</div>
                  <div class="text-sm font-black text-white">${g.home_name}</div>
                </div>
                <img src="${teamLogoUrl(g.home_logo)}" class="w-9 h-9 object-contain">
              </div>
            </div>
          </div>

          <!-- Playback Controls & Scrubber Bar -->
          <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800 rounded-xl p-2.5">
            <div class="flex items-center gap-1">
              <button onclick="setReplayStep(0)" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700" title="Reset to 0-0 Start"><i class="bi bi-skip-start-fill"></i> 0-0</button>
              <button onclick="stepReplay(-1)" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700" title="Previous Play"><i class="bi bi-chevron-left"></i> Prev</button>
              <button id="replay-play-btn" onclick="toggleGameReplay()" class="px-3.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-lg shadow-emerald-500/20 transition"><i class="bi bi-play-fill mr-1"></i>Replay from 0-0</button>
              <button onclick="stepReplay(1)" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700" title="Next Play">Next <i class="bi bi-chevron-right"></i></button>
              <button onclick="setReplayStep(${g.at_bats.length})" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700" title="Jump to Final Score">Final <i class="bi bi-skip-end-fill"></i></button>
            </div>

            <div class="flex-1 min-w-[140px] flex items-center gap-2">
              <input id="replay-scrubber" type="range" min="0" max="${g.at_bats.length}" value="${g.at_bats.length}" oninput="setReplayStep(this.value)" class="w-full accent-sky-400 cursor-pointer">
              <span id="replay-step-counter" class="text-[11px] font-mono text-slate-300 shrink-0">Play ${g.at_bats.length} / ${g.at_bats.length}</span>
            </div>

            <div class="flex items-center gap-1 text-[11px] font-mono">
              <span class="text-slate-400">Speed:</span>
              <button data-speed="1200" onclick="setReplaySpeed(1200)" class="replay-speed-btn px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">1x</button>
              <button data-speed="650" onclick="setReplaySpeed(650)" class="replay-speed-btn px-1.5 py-0.5 rounded border border-slate-700 bg-sky-500 text-slate-950 font-bold">2x</button>
              <button data-speed="250" onclick="setReplaySpeed(250)" class="replay-speed-btn px-1.5 py-0.5 rounded border border-slate-700 text-slate-300">5x</button>
            </div>
          </div>
        </div>

        <!-- Progressive Inning-by-Inning Line Score + Current Play Banner -->
        <div class="uw:col-span-5 space-y-2.5">
          <div class="overflow-x-auto bg-slate-950/60 border border-slate-800 rounded-xl p-1">
            <table class="saber-table">
              <thead>
                <tr>
                  <th class="text-left">Club (Jump Inning)</th>
                  ${innHeaders}
                  <th class="text-center font-extrabold text-sky-400">R</th>
                  <th class="text-center font-extrabold">H</th>
                  <th class="text-center font-extrabold">E</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="font-bold text-white flex items-center gap-1.5"><img src="${teamLogoUrl(g.away_logo)}" class="w-4 h-4 object-contain"> ${g.away_abbr}</td>
                  ${awayInnCells}
                  <td class="text-center font-mono font-black text-base text-sky-400">${g.away_runs}</td>
                  <td class="text-center font-mono font-bold">${g.away_hits}</td>
                  <td class="text-center font-mono">${g.away_errors}</td>
                </tr>
                <tr>
                  <td class="font-bold text-white flex items-center gap-1.5"><img src="${teamLogoUrl(g.home_logo)}" class="w-4 h-4 object-contain"> ${g.home_abbr}</td>
                  ${homeInnCells}
                  <td class="text-center font-mono font-black text-base text-sky-400">${g.home_runs}</td>
                  <td class="text-center font-mono font-bold">${g.home_hits}</td>
                  <td class="text-center font-mono">${g.home_errors}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- Current Play Call Banner -->
          <div id="replay-play-banner" class="bg-slate-900/90 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs min-h-[38px] flex items-center"></div>
        </div>
      </div>
    </div>

    <!-- Ultrawide 3-Column Live Game Broadcast Grid: Spray/WinProb (4) + Play-by-Play (4) + Full Box Scores (4) -->
    <div class="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
      <div class="md:col-span-6 uw:col-span-4 space-y-5">
        <div class="glass-card p-4">
          <h4 class="text-xs font-extrabold uppercase tracking-wider text-white mb-2"><i class="bi bi-bullseye text-pink-400 mr-1"></i> Live Replay Ballpark Spray Chart</h4>
          <div id="game-detail-spray-svg"></div>
          <div id="game-detail-spray-inspector" class="mt-2 bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-xs"></div>
        </div>

        <div class="glass-card p-4">
          <h4 class="text-xs font-extrabold uppercase tracking-wider text-white mb-2"><i class="bi bi-activity text-sky-400 mr-1"></i> Live Win Probability Curve (${g.home_abbr} vs ${g.away_abbr})</h4>
          <div class="h-44">
            <canvas id="game-win-prob-canvas"></canvas>
          </div>
        </div>
      </div>

      <div class="glass-card p-4 md:col-span-6 uw:col-span-4 flex flex-col max-h-[780px]">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-xs font-extrabold uppercase tracking-wider text-white"><i class="bi bi-list-ul text-sky-400 mr-1"></i> Chronological Play-by-Play (${g.at_bats.length} Plays)</h4>
          <span class="text-[10px] font-mono text-slate-400">Click any play to jump</span>
        </div>
        <div class="overflow-y-auto space-y-1.5 pr-1 flex-1">
          ${g.at_bats.map(ab => `
            <div data-step="${ab.step_index}" onclick="setReplayStep(${ab.step_index})" class="pbp-step-row p-2 rounded-lg bg-slate-900/80 border border-slate-800/90 hover:border-sky-500/50 cursor-pointer text-xs flex items-center justify-between gap-2 transition">
              <div class="flex items-center gap-2 min-w-0">
                <span class="font-mono text-[10px] px-1.5 py-0.5 rounded ${ab.half === 'top' ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'}">${ab.inning_label} • ${ab.outs}O</span>
                ${baseDiamondSvg(ab.base1, ab.base2, ab.base3)}
                <div class="truncate">
                  <div>
                    <span class="font-bold text-white">${ab.batter_name}</span>
                    <span class="text-slate-500">vs</span>
                    <span class="text-slate-300">${ab.pitcher_name}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 font-mono">
                    Score: <b class="text-slate-200">${ab.away_score_after}-${ab.home_score_after}</b> • Count ${ab.count} ${ab.is_bip ? `• EV ${ab.exit_velo} mph • ${ab.distance_ft} ft` : ""}
                  </div>
                </div>
              </div>
              <div class="text-right shrink-0">
                <span class="px-2 py-0.5 rounded text-[11px] font-extrabold" style="background:${ab.color}25; color:${ab.color}; border:1px solid ${ab.color}70;">${ab.result}</span>
                ${ab.runs_on_play > 0 ? `<div class="text-[10px] font-bold text-emerald-400 mt-0.5">+${ab.runs_on_play} R</div>` : ""}
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- Batting & Pitching Box Score Tables (3rd Column on Ultrawide, 2-Column Grid below on Standard) -->
      <div class="md:col-span-12 uw:col-span-4 grid grid-cols-1 md:grid-cols-2 uw:grid-cols-1 suw:grid-cols-2 gap-4">
        <div class="glass-card overflow-hidden">
          <div class="px-3.5 py-2 bg-slate-900 border-b border-slate-800 font-extrabold text-xs uppercase text-white flex items-center justify-between">
            <span>${g.away_name} Box Score</span>
            <span class="text-[10px] font-mono text-sky-400">${g.away_runs} R • ${g.away_hits} H</span>
          </div>
          <div class="overflow-x-auto">
            <table class="saber-table">
              <thead><tr><th class="text-left">Batter</th><th>Pos</th><th>AB</th><th>R</th><th>H</th><th>HR</th><th>RBI</th><th>BB</th><th>K</th><th>WPA</th></tr></thead>
              <tbody>
                ${g.away_batting.map(b => `<tr onclick="openPlayerModal(${b.player_id})" class="cursor-pointer"><td class="font-bold text-white">${b.name}</td><td class="text-center font-mono text-xs">${b.position}</td><td class="text-right font-mono">${b.ab}</td><td class="text-right font-mono">${b.r}</td><td class="text-right font-mono font-bold">${b.h}</td><td class="text-right font-mono text-pink-400">${b.hr}</td><td class="text-right font-mono">${b.rbi}</td><td class="text-right font-mono">${b.bb}</td><td class="text-right font-mono">${b.k}</td><td class="text-right font-mono ${b.wpa >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${b.wpa >= 0 ? '+' : ''}${b.wpa.toFixed(2)}</td></tr>`).join("")}
              </tbody>
            </table>
            <table class="saber-table border-t border-slate-700">
              <thead><tr><th class="text-left">Pitcher</th><th>IP</th><th>H</th><th>ER</th><th>BB</th><th>K</th><th>Pitches</th><th>GSc</th><th>WPA</th></tr></thead>
              <tbody>
                ${g.away_pitching.map(p => `<tr onclick="openPlayerModal(${p.player_id})" class="cursor-pointer"><td class="font-bold text-white">${p.name}</td><td class="text-right font-mono">${p.ip_display}</td><td class="text-right font-mono">${p.ha}</td><td class="text-right font-mono">${p.er}</td><td class="text-right font-mono">${p.bb}</td><td class="text-right font-mono font-bold text-sky-300">${p.k}</td><td class="text-right font-mono">${p.pitches}</td><td class="text-right font-mono font-bold">${p.gsc}</td><td class="text-right font-mono ${p.wpa >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${p.wpa >= 0 ? '+' : ''}${p.wpa.toFixed(2)}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="glass-card overflow-hidden">
          <div class="px-3.5 py-2 bg-slate-900 border-b border-slate-800 font-extrabold text-xs uppercase text-white flex items-center justify-between">
            <span>${g.home_name} Box Score</span>
            <span class="text-[10px] font-mono text-emerald-400">${g.home_runs} R • ${g.home_hits} H</span>
          </div>
          <div class="overflow-x-auto">
            <table class="saber-table">
              <thead><tr><th class="text-left">Batter</th><th>Pos</th><th>AB</th><th>R</th><th>H</th><th>HR</th><th>RBI</th><th>BB</th><th>K</th><th>WPA</th></tr></thead>
              <tbody>
                ${g.home_batting.map(b => `<tr onclick="openPlayerModal(${b.player_id})" class="cursor-pointer"><td class="font-bold text-white">${b.name}</td><td class="text-center font-mono text-xs">${b.position}</td><td class="text-right font-mono">${b.ab}</td><td class="text-right font-mono">${b.r}</td><td class="text-right font-mono font-bold">${b.h}</td><td class="text-right font-mono text-pink-400">${b.hr}</td><td class="text-right font-mono">${b.rbi}</td><td class="text-right font-mono">${b.bb}</td><td class="text-right font-mono">${b.k}</td><td class="text-right font-mono ${b.wpa >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${b.wpa >= 0 ? '+' : ''}${b.wpa.toFixed(2)}</td></tr>`).join("")}
              </tbody>
            </table>
            <table class="saber-table border-t border-slate-700">
              <thead><tr><th class="text-left">Pitcher</th><th>IP</th><th>H</th><th>ER</th><th>BB</th><th>K</th><th>Pitches</th><th>GSc</th><th>WPA</th></tr></thead>
              <tbody>
                ${g.home_pitching.map(p => `<tr onclick="openPlayerModal(${p.player_id})" class="cursor-pointer"><td class="font-bold text-white">${p.name}</td><td class="text-right font-mono">${p.ip_display}</td><td class="text-right font-mono">${p.ha}</td><td class="text-right font-mono">${p.er}</td><td class="text-right font-mono">${p.bb}</td><td class="text-right font-mono font-bold text-sky-300">${p.k}</td><td class="text-right font-mono">${p.pitches}</td><td class="text-right font-mono font-bold">${p.gsc}</td><td class="text-right font-mono ${p.wpa >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${p.wpa >= 0 ? '+' : ''}${p.wpa.toFixed(2)}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.openGameReplayModal = function(gameId) {
  AppState.activeTab = "gamelogs";
  document.querySelectorAll(".nav-tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === "gamelogs"));
  renderGameLogsTab(document.getElementById("main-view-container"), gameId, true);
};

/* ============================================================================
 * 5. SABERMETRIC LAB & PROJECTIONS SUITE
 * ============================================================================ */
window.updateSaberFilter = function(field, val) {
  AppState[field] = val;
  renderSabermetricsTab(document.getElementById("main-view-container"));
};

function filterSaberPlayerList(list) {
  const q = (AppState.saberFilterSearch || "").trim().toLowerCase();
  const tm = (AppState.saberFilterTeam || "").trim();
  return (list || []).filter(item => {
    if (tm && item.team_abbr !== tm && String(item.team_id) !== tm) return false;
    if (q) {
      const hay = `${item.name || ''} ${item.team_abbr || ''} ${item.position || item.role || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function buildSaberBattingTableHtml(list) {
  return `
    <div class="overflow-x-auto">
      <table class="saber-table">
        <thead>
          <tr>
            <th class="text-left">Rk</th>
            <th class="text-left">Batter</th>
            <th>Team</th>
            <th>Pos</th>
            <th>Age</th>
            <th>OVR/POT</th>
            <th>PA</th>
            <th>AVG</th>
            <th>OBP</th>
            <th>SLG</th>
            <th>OPS</th>
            <th>ISO</th>
            <th>BABIP</th>
            <th>HR</th>
            <th>SB</th>
            <th>BB%</th>
            <th>K%</th>
            <th>wOBA</th>
            <th>xwOBA</th>
            <th>wRAA</th>
            <th>wRC+</th>
            <th>OPS+</th>
            <th>UBR</th>
            <th>Def ZR</th>
            <th>WPA</th>
            <th>WAR</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((b, i) => `
            <tr onclick="openPlayerModal(${b.player_id})" class="cursor-pointer">
              <td class="font-mono text-slate-500">${i + 1}</td>
              <td class="font-bold text-white hover:text-sky-400">${b.name}</td>
              <td class="text-center font-mono text-xs">${b.team_abbr}</td>
              <td class="text-center font-mono text-xs text-sky-300">${b.position}</td>
              <td class="text-center font-mono">${b.age}</td>
              <td class="text-center">${rtgBadge(b.oa, b.pot)}</td>
              <td class="text-right font-mono">${b.pa}</td>
              <td class="text-right font-mono font-semibold">${fmtAvg(b.avg)}</td>
              <td class="text-right font-mono">${fmtAvg(b.obp)}</td>
              <td class="text-right font-mono">${fmtAvg(b.slg)}</td>
              <td class="text-right font-mono font-bold">${fmtAvg(b.ops)}</td>
              <td class="text-right font-mono">${fmtAvg(b.iso)}</td>
              <td class="text-right font-mono">${fmtAvg(b.babip)}</td>
              <td class="text-right font-mono font-bold text-pink-400">${b.hr}</td>
              <td class="text-right font-mono">${b.sb}</td>
              <td class="text-right font-mono">${b.bb_pct.toFixed(1)}%</td>
              <td class="text-right font-mono">${b.k_pct.toFixed(1)}%</td>
              <td class="text-right font-mono font-bold text-sky-300">${fmtAvg(b.woba)}</td>
              <td class="text-right font-mono text-amber-300">${fmtAvg(b.xwoba)}</td>
              <td class="text-right font-mono ${b.wraa >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${b.wraa > 0 ? '+' : ''}${b.wraa.toFixed(1)}</td>
              <td class="text-right font-mono font-extrabold ${b.wrc_plus >= 105 ? 'text-emerald-400' : 'text-slate-200'}">${b.wrc_plus}</td>
              <td class="text-right font-mono">${b.ops_plus}</td>
              <td class="text-right font-mono">${b.ubr.toFixed(1)}</td>
              <td class="text-right font-mono ${b.zr >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${b.zr > 0 ? '+' : ''}${b.zr.toFixed(1)}</td>
              <td class="text-right font-mono">${b.wpa.toFixed(2)}</td>
              <td class="text-right font-mono font-extrabold text-sky-400">${b.war.toFixed(2)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildSaberPitchingTableHtml(list) {
  return `
    <div class="overflow-x-auto">
      <table class="saber-table">
        <thead>
          <tr>
            <th class="text-left">Rk</th>
            <th class="text-left">Pitcher</th>
            <th>Team</th>
            <th>Role</th>
            <th>Age</th>
            <th>OVR/POT</th>
            <th>IP</th>
            <th>W-L</th>
            <th>SV</th>
            <th>ERA</th>
            <th>FIP</th>
            <th>xFIP</th>
            <th>SIERA</th>
            <th>ERA+</th>
            <th>FIP-</th>
            <th>WHIP</th>
            <th>K/9</th>
            <th>BB/9</th>
            <th>HR/9</th>
            <th>K%</th>
            <th>BB%</th>
            <th>K-BB%</th>
            <th>BABIP</th>
            <th>LOB%</th>
            <th>GB%</th>
            <th>WPA</th>
            <th>fWAR</th>
            <th>rWAR</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((p, i) => `
            <tr onclick="openPlayerModal(${p.player_id})" class="cursor-pointer">
              <td class="font-mono text-slate-500">${i + 1}</td>
              <td class="font-bold text-white hover:text-sky-400">${p.name}</td>
              <td class="text-center font-mono text-xs">${p.team_abbr}</td>
              <td class="text-center font-mono text-xs text-amber-300">${p.role}</td>
              <td class="text-center font-mono">${p.age}</td>
              <td class="text-center">${rtgBadge(p.oa, p.pot)}</td>
              <td class="text-right font-mono font-bold">${p.ip_display}</td>
              <td class="text-right font-mono">${p.w}-${p.l}</td>
              <td class="text-right font-mono">${p.sv}</td>
              <td class="text-right font-mono font-bold text-amber-300">${p.era.toFixed(2)}</td>
              <td class="text-right font-mono font-bold text-sky-300">${p.fip.toFixed(2)}</td>
              <td class="text-right font-mono">${p.xfip.toFixed(2)}</td>
              <td class="text-right font-mono text-slate-300">${p.siera.toFixed(2)}</td>
              <td class="text-right font-mono font-bold ${p.era_plus >= 105 ? 'text-emerald-400' : 'text-slate-200'}">${p.era_plus}</td>
              <td class="text-right font-mono ${p.fip_minus <= 95 ? 'text-emerald-400' : 'text-slate-300'}">${p.fip_minus}</td>
              <td class="text-right font-mono">${p.whip.toFixed(2)}</td>
              <td class="text-right font-mono">${p.k9.toFixed(2)}</td>
              <td class="text-right font-mono">${p.bb9.toFixed(2)}</td>
              <td class="text-right font-mono">${p.hr9.toFixed(2)}</td>
              <td class="text-right font-mono">${p.k_pct.toFixed(1)}%</td>
              <td class="text-right font-mono">${p.bb_pct.toFixed(1)}%</td>
              <td class="text-right font-mono font-bold text-emerald-300">${p.k_minus_bb.toFixed(1)}%</td>
              <td class="text-right font-mono">${fmtAvg(p.babip)}</td>
              <td class="text-right font-mono">${p.lob_pct.toFixed(1)}%</td>
              <td class="text-right font-mono">${p.gb_pct.toFixed(1)}%</td>
              <td class="text-right font-mono">${p.wpa.toFixed(2)}</td>
              <td class="text-right font-mono font-extrabold text-sky-400">${p.war.toFixed(2)}</td>
              <td class="text-right font-mono text-slate-300">${p.ra9war.toFixed(2)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildProjBattersTableHtml(list) {
  return `
    <div class="overflow-x-auto">
      <table class="saber-table">
        <thead>
          <tr>
            <th class="text-left">Rk</th>
            <th class="text-left">Batter</th>
            <th>Team</th>
            <th>Pos</th>
            <th>Age</th>
            <th>OVR/POT</th>
            <th>Curr WAR</th>
            <th>Proj PA</th>
            <th>Proj AVG</th>
            <th>Proj OBP</th>
            <th>Proj SLG</th>
            <th>Proj OPS</th>
            <th>Proj wOBA</th>
            <th>Proj wRC+</th>
            <th>Proj H</th>
            <th>Proj 2B</th>
            <th>Proj HR</th>
            <th>Proj R</th>
            <th>Proj RBI</th>
            <th>Proj SB</th>
            <th>10th WAR</th>
            <th>Median Proj WAR</th>
            <th>90th WAR</th>
            <th>WAR Delta</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((b, i) => `
            <tr onclick="openPlayerModal(${b.player_id})" class="cursor-pointer">
              <td class="font-mono text-slate-500">${i + 1}</td>
              <td class="font-bold text-white hover:text-sky-400">${b.name}</td>
              <td class="text-center font-mono text-xs">${b.team_abbr}</td>
              <td class="text-center font-mono text-xs text-sky-300">${b.position}</td>
              <td class="text-center font-mono">${b.age}</td>
              <td class="text-center">${rtgBadge(b.oa, b.pot)}</td>
              <td class="text-right font-mono text-slate-400">${b.curr_war.toFixed(1)}</td>
              <td class="text-right font-mono">${b.proj_pa}</td>
              <td class="text-right font-mono font-semibold">${fmtAvg(b.proj_avg)}</td>
              <td class="text-right font-mono">${fmtAvg(b.proj_obp)}</td>
              <td class="text-right font-mono">${fmtAvg(b.proj_slg)}</td>
              <td class="text-right font-mono font-bold text-white">${fmtAvg(b.proj_ops)}</td>
              <td class="text-right font-mono text-sky-300">${fmtAvg(b.proj_woba)}</td>
              <td class="text-right font-mono font-extrabold text-emerald-400">${b.proj_wrc_plus}</td>
              <td class="text-right font-mono">${b.proj_h}</td>
              <td class="text-right font-mono">${b.proj_2b}</td>
              <td class="text-right font-mono font-bold text-pink-400">${b.proj_hr}</td>
              <td class="text-right font-mono">${b.proj_r}</td>
              <td class="text-right font-mono">${b.proj_rbi}</td>
              <td class="text-right font-mono">${b.proj_sb}</td>
              <td class="text-right font-mono text-slate-400">${b.proj_war_10.toFixed(1)}</td>
              <td class="text-right font-mono font-black text-sky-400">${b.proj_war_50.toFixed(1)}</td>
              <td class="text-right font-mono text-emerald-300">${b.proj_war_90.toFixed(1)}</td>
              <td class="text-right font-mono ${b.war_delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${b.war_delta >= 0 ? '+' : ''}${b.war_delta.toFixed(1)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildProjPitchersTableHtml(list) {
  return `
    <div class="overflow-x-auto">
      <table class="saber-table">
        <thead>
          <tr>
            <th class="text-left">Rk</th>
            <th class="text-left">Pitcher</th>
            <th>Team</th>
            <th>Role</th>
            <th>Age</th>
            <th>OVR/POT</th>
            <th>Curr WAR</th>
            <th>Proj IP</th>
            <th>Proj W-L</th>
            <th>Proj SV</th>
            <th>Proj ERA</th>
            <th>Proj FIP</th>
            <th>Proj WHIP</th>
            <th>Proj K</th>
            <th>Proj BB</th>
            <th>Proj K/9</th>
            <th>Proj BB/9</th>
            <th>10th WAR</th>
            <th>Median Proj WAR</th>
            <th>90th WAR</th>
            <th>WAR Delta</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((p, i) => `
            <tr onclick="openPlayerModal(${p.player_id})" class="cursor-pointer">
              <td class="font-mono text-slate-500">${i + 1}</td>
              <td class="font-bold text-white hover:text-sky-400">${p.name}</td>
              <td class="text-center font-mono text-xs">${p.team_abbr}</td>
              <td class="text-center font-mono text-xs text-amber-300">${p.role}</td>
              <td class="text-center font-mono">${p.age}</td>
              <td class="text-center">${rtgBadge(p.oa, p.pot)}</td>
              <td class="text-right font-mono text-slate-400">${p.curr_war.toFixed(1)}</td>
              <td class="text-right font-mono font-bold">${p.proj_ip}</td>
              <td class="text-right font-mono">${p.proj_w}-${p.proj_l}</td>
              <td class="text-right font-mono">${p.proj_sv}</td>
              <td class="text-right font-mono font-bold text-amber-300">${p.proj_era.toFixed(2)}</td>
              <td class="text-right font-mono font-bold text-sky-300">${p.proj_fip.toFixed(2)}</td>
              <td class="text-right font-mono">${p.proj_whip.toFixed(2)}</td>
              <td class="text-right font-mono font-bold">${p.proj_k}</td>
              <td class="text-right font-mono">${p.proj_bb}</td>
              <td class="text-right font-mono">${p.proj_k9.toFixed(2)}</td>
              <td class="text-right font-mono">${p.proj_bb9.toFixed(2)}</td>
              <td class="text-right font-mono text-slate-400">${p.proj_war_10.toFixed(1)}</td>
              <td class="text-right font-mono font-black text-sky-400">${p.proj_war_50.toFixed(1)}</td>
              <td class="text-right font-mono text-emerald-300">${p.proj_war_90.toFixed(1)}</td>
              <td class="text-right font-mono ${p.war_delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${p.war_delta >= 0 ? '+' : ''}${p.war_delta.toFixed(1)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderSabermetricsTab(container) {
  showLoading("Calculating Sabermetric Leaderboards & Hybrid True-Talent Projections...");
  try {
    const yrParam = AppState.activeYear ? `&year=${AppState.activeYear}` : "";
    if (!AppState.sabermetrics) {
      AppState.sabermetrics = await fetchJSON(`/api/sabermetrics?save=${AppState.activeSave}&league_id=${AppState.activeLeagueId || ''}${yrParam}`);
    }
    if (!AppState.projections) {
      AppState.projections = await fetchJSON(`/api/projections?save=${AppState.activeSave}&league_id=${AppState.activeLeagueId || ''}${yrParam}`);
    }
  } finally {
    hideLoading();
  }

  const sub = AppState.saberSubTab;
  const teams = (AppState.overview && AppState.overview.teams) || [];
  let tableContent = "";

  if (sub === "batting") {
    const list = filterSaberPlayerList(AppState.sabermetrics.batters || []);
    tableContent = `<div class="glass-card overflow-hidden">${buildSaberBattingTableHtml(list)}</div>`;
  } else if (sub === "pitching") {
    const list = filterSaberPlayerList(AppState.sabermetrics.pitchers || []);
    tableContent = `<div class="glass-card overflow-hidden">${buildSaberPitchingTableHtml(list)}</div>`;
  } else if (sub === "proj_batters") {
    const list = filterSaberPlayerList(AppState.projections.batters || []);
    tableContent = `<div class="glass-card overflow-hidden">${buildProjBattersTableHtml(list)}</div>`;
  } else if (sub === "proj_pitchers") {
    const list = filterSaberPlayerList(AppState.projections.pitchers || []);
    tableContent = `<div class="glass-card overflow-hidden">${buildProjPitchersTableHtml(list)}</div>`;
  } else if (sub === "split_saber") {
    const batList = filterSaberPlayerList(AppState.sabermetrics.batters || []);
    const pitList = filterSaberPlayerList(AppState.sabermetrics.pitchers || []);
    tableContent = `
      <div class="grid grid-cols-1 uw:grid-cols-2 gap-5 items-start">
        <div class="glass-card overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-900 border-b border-slate-800 font-extrabold text-xs uppercase text-sky-400 flex justify-between">
            <span><i class="bi bi-bar-chart-steps mr-1.5"></i>Batting Sabermetrics (${batList.length})</span>
            <span class="text-[10px] text-slate-400">Click header to sort</span>
          </div>
          ${buildSaberBattingTableHtml(batList)}
        </div>
        <div class="glass-card overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-900 border-b border-slate-800 font-extrabold text-xs uppercase text-amber-400 flex justify-between">
            <span><i class="bi bi-speedometer2 mr-1.5"></i>Pitching Sabermetrics (${pitList.length})</span>
            <span class="text-[10px] text-slate-400">Click header to sort</span>
          </div>
          ${buildSaberPitchingTableHtml(pitList)}
        </div>
      </div>
    `;
  } else if (sub === "split_proj") {
    const batList = filterSaberPlayerList(AppState.projections.batters || []);
    const pitList = filterSaberPlayerList(AppState.projections.pitchers || []);
    tableContent = `
      <div class="grid grid-cols-1 uw:grid-cols-2 gap-5 items-start">
        <div class="glass-card overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-900 border-b border-slate-800 font-extrabold text-xs uppercase text-emerald-400 flex justify-between">
            <span><i class="bi bi-cpu mr-1.5"></i>Batter ZiPS/Talent Projections (${batList.length})</span>
            <span class="text-[10px] text-slate-400">Click header to sort</span>
          </div>
          ${buildProjBattersTableHtml(batList)}
        </div>
        <div class="glass-card overflow-hidden">
          <div class="px-4 py-2.5 bg-slate-900 border-b border-slate-800 font-extrabold text-xs uppercase text-sky-400 flex justify-between">
            <span><i class="bi bi-graph-up-arrow mr-1.5"></i>Pitcher ZiPS/Talent Projections (${pitList.length})</span>
            <span class="text-[10px] text-slate-400">Click header to sort</span>
          </div>
          ${buildProjPitchersTableHtml(pitList)}
        </div>
      </div>
    `;
  } else if (sub === "proj_teams") {
    const list = AppState.projections.teams || [];
    tableContent = `
      <div class="glass-card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="saber-table">
            <thead>
              <tr>
                <th class="text-left">Rk</th>
                <th class="text-left">Team</th>
                <th class="text-right" title="Actual Season Record (W-L-T)">Actual W-L-T</th>
                <th class="text-right" title="Pythagorean Expected Record (W-L-T)">Pythagorean W-L-T</th>
                <th class="text-right">Proj Bat WAR</th>
                <th class="text-right">Proj Pit WAR</th>
                <th class="text-right">Projected Roster WAR</th>
                <th class="text-right" title="Monte Carlo Projected Full-Season Record (W-L-T)">Monte Carlo Proj W-L-T</th>
                <th class="text-right" title="Projected Ties">Proj T</th>
                <th class="text-right">Proj Win %</th>
                <th class="text-right">Division Win %</th>
                <th class="text-right">Playoff Odds %</th>
                <th class="text-right">Championship %</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((t, i) => {
                const projTies = Number(t.proj_t ?? t.curr_t ?? 0);
                const actualWlt = t.w_l_t_str || t.record_str || `${t.curr_w}-${t.curr_l}-${t.curr_t || 0}`;
                const pythWlt = t.pyth_record_str || (projTies > 0 ? `${t.pyth_w}-${t.pyth_l}-${projTies}` : `${t.pyth_w}-${t.pyth_l}`);
                const projWlt = t.proj_record_str || (projTies > 0 ? `${t.proj_w}-${t.proj_l}-${projTies}` : `${t.proj_w}-${t.proj_l}`);
                return `
                  <tr onclick="switchTeamAndGo(${t.team_id})" class="cursor-pointer">
                    <td class="font-mono text-slate-500">${i + 1}</td>
                    <td class="font-bold text-white flex items-center gap-2"><img src="${teamLogoUrl(t.logo_file_name)}" class="w-5 h-5 object-contain"> ${t.full_name} (${t.abbr})</td>
                    <td class="text-right font-mono font-bold text-white">${actualWlt}</td>
                    <td class="text-right font-mono text-slate-300">${pythWlt}</td>
                    <td class="text-right font-mono text-emerald-400">${t.proj_bat_war.toFixed(1)}</td>
                    <td class="text-right font-mono text-amber-300">${t.proj_pit_war.toFixed(1)}</td>
                    <td class="text-right font-mono font-extrabold text-sky-400">${t.proj_total_war.toFixed(1)}</td>
                    <td class="text-right font-mono font-black text-white">${projWlt}</td>
                    <td class="text-right font-mono ${projTies > 0 ? 'text-amber-300 font-bold' : 'text-slate-500'}">${projTies}</td>
                    <td class="text-right font-mono font-bold text-sky-300">${fmtAvg(t.proj_wpct)}</td>
                    <td class="text-right font-mono">${t.div_prob.toFixed(1)}%</td>
                    <td class="text-right font-mono font-bold text-emerald-400">${t.playoff_prob.toFixed(1)}%</td>
                    <td class="text-right font-mono font-extrabold text-amber-400">${t.champ_prob.toFixed(1)}%</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="animate-view space-y-5">
      <div class="glass-card p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-1.5">
          ${[
            ["batting", "bi-bar-chart-steps", "Batting Sabermetrics"],
            ["pitching", "bi-speedometer2", "Pitching Sabermetrics"],
            ["split_saber", "bi-layout-split", "Ultrawide Split: Bat + Pit"],
            ["proj_batters", "bi-cpu", "Batter Projections (ZiPS/Talent)"],
            ["proj_pitchers", "bi-graph-up-arrow", "Pitcher Projections (ZiPS/Talent)"],
            ["split_proj", "bi-columns-gap", "Ultrawide Split: Projections"],
            ["proj_teams", "bi-trophy", "Monte Carlo Team Projections (W-L-T)"],
          ].map(([key, ic, label]) => `
            <button onclick="AppState.saberSubTab='${key}'; renderSabermetricsTab(document.getElementById('main-view-container'))" class="px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${sub === key ? 'bg-sky-500 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}">
              <i class="bi ${ic}"></i> ${label}
            </button>
          `).join("")}
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input type="text" value="${AppState.saberFilterSearch || ''}" oninput="updateSaberFilter('saberFilterSearch', this.value)" placeholder="Filter player or pos..." class="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white w-44">
          <select onchange="updateSaberFilter('saberFilterTeam', this.value)" class="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white">
            <option value="">All Teams</option>
            ${teams.map(t => `<option value="${t.abbr}" ${AppState.saberFilterTeam === t.abbr ? 'selected' : ''}>${t.abbr} — ${t.full_name}</option>`).join("")}
          </select>
          <span class="text-[11px] text-slate-400 hidden xl:inline">Click any column to sort</span>
        </div>
      </div>

      ${tableContent}
    </div>
  `;
}

/* ============================================================================
 * 5B. LEAGUE / ASSOCIATION EVOLUTION HUB & MULTI-YEAR HISTORY VAULT
 * ============================================================================ */
window.openAlmanacInBnn = async function(relPath) {
  AppState.activeTab = "bnn";
  document.querySelectorAll(".nav-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === "bnn");
  });
  const container = document.getElementById("main-view-container");
  if (container) {
    await renderBnnPortalTab(container, relPath);
  }
};

/* ============================================================================
 * 5B. LEAGUE / ASSOCIATION EVOLUTION INTERACTIVE STATE & CONTROLLERS
 * ============================================================================ */
function initEvolutionUIState(evo) {
  if (!evo) return;
  const ws = evo.workshop || {};
  const rm = ws.active_roadmap || {};
  const saveKey = `${AppState.activeSave}_${AppState.activeLeagueId || (evo.active_league && evo.active_league.league_id) || 200}`;

  if (!AppState.evoWorkshop || AppState.evoWorkshop.saveKey !== saveKey) {
    const defWeights = rm.weights || { pop: 30, econ: 20, geo: 20, gap: 15, irl: 15 };
    const defFilters = rm.filters || { scope: "all", irl_filter: "all", rivalry_mode: "balanced", search: "" };
    const defSelected = Array.isArray(rm.selected_market_ids) && rm.selected_market_ids.length
      ? [...rm.selected_market_ids]
      : (ws.default_selected_city_ids || []);

    AppState.evoWorkshop = {
      saveKey,
      weights: { ...defWeights },
      filters: { search: "", ...defFilters },
      selectedMarketIds: defSelected.map(Number),
      customIdentities: { ...(rm.custom_identities || {}) },
      roadmapTitle: rm.title || `${(evo.active_league && evo.active_league.abbr) || 'League'} 5-Year Expansion & Realignment Roadmap`,
      horizonYears: Number(rm.horizon_years || 5),
      targetArchitecture: rm.target_architecture || "Balanced Multi-Division Expansion",
      goals: Array.isArray(rm.goals) ? JSON.parse(JSON.stringify(rm.goals)) : [],
      phases: Array.isArray(rm.phases) ? JSON.parse(JSON.stringify(rm.phases)) : [],
      mapZoomMode: "auto",
      showDivisionLines: true,
      showCandidatePins: true,
      previewBlueprintId: "current",
      expandedBlueprints: { bp_plus2: true },
      simWindfallTierIndex: 0,
      lastSavedAt: rm.updated_at || null,
    };
  }
}

function irlBadgeStyle(level) {
  const lvl = String(level || "");
  if (lvl === "MLB") return "bg-emerald-500/20 text-emerald-300 border-emerald-400/50";
  if (lvl === "Historic MLB") return "bg-amber-500/20 text-amber-300 border-amber-400/50";
  if (lvl === "Triple-A" || lvl === "Historic Triple-A") return "bg-sky-500/20 text-sky-300 border-sky-400/50";
  if (lvl === "Double-A" || lvl === "Historic Double-A") return "bg-indigo-500/20 text-indigo-300 border-indigo-400/50";
  if (lvl === "High-A" || lvl === "Single-A" || lvl === "Historic Single-A") return "bg-purple-500/20 text-purple-300 border-purple-400/50";
  if (lvl.includes("Partner") || lvl.includes("Draft") || lvl.includes("International")) return "bg-teal-500/20 text-teal-300 border-teal-400/50";
  return "bg-slate-800/90 text-slate-400 border-slate-700";
}

function computeConfiguredCandidateMarkets(evo) {
  initEvolutionUIState(evo);
  const st = AppState.evoWorkshop;
  const rawMarkets = (evo && (evo.candidate_markets || (evo.readiness && evo.readiness.candidate_markets))) || [];
  const w = st.weights || { pop: 30, econ: 20, geo: 20, gap: 15, irl: 15 };
  const totalW = Math.max(1, Number(w.pop) + Number(w.econ) + Number(w.geo) + Number(w.gap) + Number(w.irl));
  const flt = st.filters || {};

  const scored = rawMarkets.map(m => {
    const fPop = Number(m.factor_pop || 70);
    const fEcon = Number(m.factor_econ || 70);
    const fGeo = Number(m.factor_geo || 70);
    let fGap = Number(m.factor_gap || 75);
    const fIrl = Number(m.factor_irl || 45);
    const nearMi = Number(m.nearest_team_miles || 120);

    if (flt.rivalry_mode === "derby") {
      fGap = nearMi <= 95 ? 96 : (nearMi <= 180 ? 80 : 52);
    } else if (flt.rivalry_mode === "frontier") {
      fGap = nearMi >= 140 ? 96 : (nearMi >= 75 ? 78 : 50);
    }

    const compScore = Math.round(
      (Number(w.pop) * fPop + Number(w.econ) * fEcon + Number(w.geo) * fGeo + Number(w.gap) * fGap + Number(w.irl) * fIrl) / totalW
    );

    return {
      ...m,
      effective_gap_factor: fGap,
      computed_score: compScore,
    };
  });

  const filtered = scored.filter(m => {
    if (flt.scope === "open_only" && m.is_active_league_city) return false;
    if (flt.scope === "primary_state" && !m.is_primary_state) return false;
    if (flt.scope === "regional" && !m.is_primary_state && Number(m.nearest_team_miles || 999) > 350 && !String(m.region_bucket || "").includes("Primary") && !String(m.region_bucket || "").includes("Mid-Atlantic") && !String(m.region_bucket || "").includes("Northeast")) return false;
    if (flt.scope === "domestic" && Number(m.nation_id || 206) !== 206) return false;
    if (flt.scope === "international" && Number(m.nation_id || 206) === 206) return false;

    const lvl = String(m.irl_primary_level || "");
    if (flt.irl_filter === "any_irl" && !m.has_irl_counterpart) return false;
    if (flt.irl_filter === "mlb_hist" && lvl !== "MLB" && lvl !== "Historic MLB") return false;
    if (flt.irl_filter === "aaa" && !["MLB", "Historic MLB", "Triple-A", "Historic Triple-A"].includes(lvl)) return false;
    if (flt.irl_filter === "aa_a" && !["Double-A", "Historic Double-A", "High-A", "Single-A", "Historic Single-A"].includes(lvl)) return false;
    if (flt.irl_filter === "partner_intl" && !lvl.includes("Partner") && !lvl.includes("Draft") && !lvl.includes("International")) return false;
    if (flt.irl_filter === "untapped" && m.has_irl_counterpart) return false;

    if (flt.search && flt.search.trim()) {
      const q = flt.search.trim().toLowerCase();
      const hay = `${m.city} ${m.state} ${m.suggested_nickname} ${m.irl_summary_badge} ${m.irl_detail_line}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) =>
    (b.computed_score - a.computed_score) ||
    ((a.is_active_league_city ? 1 : 0) - (b.is_active_league_city ? 1 : 0)) ||
    (Number(b.effective_metro_pop || 0) - Number(a.effective_metro_pop || 0))
  );
  return filtered;
}

window.applyRecommenderPreset = function (presetKey) {
  if (!AppState.evoWorkshop) return;
  const presets = {
    balanced: { pop: 30, econ: 20, geo: 20, gap: 15, irl: 15 },
    metro_media: { pop: 50, econ: 30, geo: 5, gap: 5, irl: 10 },
    irl_pro: { pop: 20, econ: 15, geo: 15, gap: 10, irl: 40 },
    regional_compact: { pop: 15, econ: 15, geo: 40, gap: 20, irl: 10 },
    untapped_frontier: { pop: 25, econ: 20, geo: 10, gap: 40, irl: 5 },
  };
  if (presets[presetKey]) {
    AppState.evoWorkshop.weights = { ...presets[presetKey] };
    renderEvolutionTab(document.getElementById("main-view-container"));
  }
};

window.updateRecommenderWeight = function (factorKey, val) {
  if (!AppState.evoWorkshop) return;
  AppState.evoWorkshop.weights[factorKey] = Number(val);
  renderEvolutionTab(document.getElementById("main-view-container"));
};

window.updateRecommenderFilter = function (filterKey, val) {
  if (!AppState.evoWorkshop) return;
  AppState.evoWorkshop.filters[filterKey] = val;
  renderEvolutionTab(document.getElementById("main-view-container"));
};

window.toggleBlueprintAlignPreview = function (bpId) {
  if (!AppState.evoWorkshop) return;
  AppState.evoWorkshop.expandedBlueprints[bpId] = !AppState.evoWorkshop.expandedBlueprints[bpId];
  renderEvolutionTab(document.getElementById("main-view-container"));
};

window.toggleWorkshopExpansionCity = function (cityId) {
  if (!AppState.evoWorkshop) return;
  const cid = Number(cityId);
  const idx = AppState.evoWorkshop.selectedMarketIds.indexOf(cid);
  if (idx >= 0) {
    AppState.evoWorkshop.selectedMarketIds.splice(idx, 1);
  } else {
    AppState.evoWorkshop.selectedMarketIds.push(cid);
  }
  renderEvolutionTab(document.getElementById("main-view-container"));
};

window.loadBlueprintIntoWorkshop = function (bpId) {
  const evo = AppState.evolutionData || {};
  initEvolutionUIState(evo);
  const bps = evo.structural_blueprints || (evo.readiness && evo.readiness.structural_blueprints) || [];
  const bp = bps.find(b => b.id === bpId);
  if (!bp) return;

  const markets = computeConfiguredCandidateMarkets(evo);
  const delta = Math.max(0, Number(bp.expansion_delta || 0));
  if (delta > 0) {
    AppState.evoWorkshop.selectedMarketIds = markets.slice(0, delta).map(m => Number(m.city_id));
  } else {
    AppState.evoWorkshop.selectedMarketIds = [];
  }
  AppState.evoWorkshop.targetArchitecture = bp.title;
  AppState.evoWorkshop.previewBlueprintId = bp.id;
  AppState.evolutionSubTab = "workshop";
  renderEvolutionTab(document.getElementById("main-view-container"));
};

window.updateWorkshopCustomIdentity = function (cityId, field, value) {
  if (!AppState.evoWorkshop) return;
  const cid = Number(cityId);
  if (!AppState.evoWorkshop.customIdentities[cid]) {
    AppState.evoWorkshop.customIdentities[cid] = {};
  }
  AppState.evoWorkshop.customIdentities[cid][field] = value;
  const mapEl = document.getElementById("evo-workshop-map-svg");
  if (mapEl && AppState.evolutionData) {
    const evo = AppState.evolutionData;
    const activeTeams = (evo.workshop && evo.workshop.active_team_nodes) || [];
    const cands = computeConfiguredCandidateMarkets(evo);
    renderExpansionWorkshopMapSVG("evo-workshop-map-svg", {
      activeTeams,
      candidates: cands,
      selectedMarketIds: AppState.evoWorkshop.selectedMarketIds,
      customIdentities: AppState.evoWorkshop.customIdentities,
      zoomMode: AppState.evoWorkshop.mapZoomMode,
      showDivisionLines: AppState.evoWorkshop.showDivisionLines,
      showCandidatePins: AppState.evoWorkshop.showCandidatePins,
    });
  }
};

window.cycleWorkshopGoalStatus = function (idx) {
  if (!AppState.evoWorkshop || !AppState.evoWorkshop.goals[idx]) return;
  const order = ["Planned", "Ready", "In Progress", "Completed"];
  const cur = AppState.evoWorkshop.goals[idx].status || "Planned";
  AppState.evoWorkshop.goals[idx].status = order[(order.indexOf(cur) + 1) % order.length];
  renderEvolutionTab(document.getElementById("main-view-container"));
};

window.addWorkshopGoal = function () {
  if (!AppState.evoWorkshop) return;
  const evo = AppState.evolutionData || {};
  const yr = Number(evo.season_year || 2026) + 2;
  AppState.evoWorkshop.goals.push({
    id: `goal_${Date.now()}`,
    category: "Custom Milestone",
    title: "New League/Association Expansion or Rule Milestone",
    target_metric: "Commissioner Target KPI",
    target_year: yr,
    status: "Planned",
  });
  renderEvolutionTab(document.getElementById("main-view-container"));
};

window.removeWorkshopGoal = function (idx) {
  if (!AppState.evoWorkshop) return;
  AppState.evoWorkshop.goals.splice(idx, 1);
  renderEvolutionTab(document.getElementById("main-view-container"));
};

window.syncWorkshopPhasesWithSelectedCities = function () {
  const evo = AppState.evolutionData || {};
  initEvolutionUIState(evo);
  const st = AppState.evoWorkshop;
  const allCands = (evo.candidate_markets || []);
  const selCands = st.selectedMarketIds.map(id => allCands.find(m => Number(m.city_id) === Number(id))).filter(Boolean);
  const yr = Number(evo.season_year || 2026);
  const curTeams = Number((evo.readiness && evo.readiness.current_teams) || 20);

  const wave1 = selCands.slice(0, 2);
  const wave2 = selCands.slice(2, 6);
  const w1Names = wave1.length ? wave1.map(m => `${m.city} ${(st.customIdentities[m.city_id] && st.customIdentities[m.city_id].nickname) || m.suggested_nickname}`).join(" & ") : "Top 2 Target Markets";
  const w2Names = wave2.length ? wave2.map(m => `${m.city} ${(st.customIdentities[m.city_id] && st.customIdentities[m.city_id].nickname) || m.suggested_nickname}`).join(", ") : "Next Wave Markets";

  st.phases = [
    {
      phase: "Phase 1 — Immediate Offseason",
      year: yr + 1,
      headline: `Wave I Expansion (+${wave1.length || 2} Franchises: ${w1Names})`,
      actions: `Conduct 35-round Expansion Draft (15 protected/club); admit ${w1Names}; realign divisions geographically and distribute expansion fee windfall.`,
    },
    {
      phase: "Phase 2 — Mid-Term Consolidation",
      year: yr + 3,
      headline: `Division Travel Optimization & Feeder/Prospect Depth Calibration`,
      actions: `Audit positional depth across all ${curTeams + (wave1.length || 2)} clubs; adjust amateur draft rounds and international FA bonus pools to sustain 15.5+ regulars/club.`,
    },
    {
      phase: "Phase 3 — Long-Horizon Evolution",
      year: yr + 5,
      headline: wave2.length ? `Wave II Expansion (+${wave2.length} Franchises: ${w2Names})` : `Evaluate Wave II Expansion or 2-Tier Promotion/Relegation Pyramid`,
      actions: wave2.length ? `Admit ${w2Names} to reach ${curTeams + selCands.length} total clubs under ${st.targetArchitecture}.` : `Transition into ${st.targetArchitecture} once league talent surplus and operating margins hit target thresholds.`,
    },
  ];
  renderEvolutionTab(document.getElementById("main-view-container"));
};

window.saveEvolutionRoadmapToServer = async function () {
  const evo = AppState.evolutionData || {};
  initEvolutionUIState(evo);
  const st = AppState.evoWorkshop;
  const lid = AppState.activeLeagueId || (evo.active_league && evo.active_league.league_id) || 200;

  // Read current DOM inputs if on workshop tab
  const titleIn = document.getElementById("ws-roadmap-title-input");
  if (titleIn) st.roadmapTitle = titleIn.value;
  const archIn = document.getElementById("ws-roadmap-arch-input");
  if (archIn) st.targetArchitecture = archIn.value;
  const horIn = document.getElementById("ws-roadmap-horizon-select");
  if (horIn) st.horizonYears = Number(horIn.value || 5);

  const payload = {
    save_slug: AppState.activeSave,
    league_id: lid,
    title: st.roadmapTitle,
    horizon_years: st.horizonYears,
    target_architecture: st.targetArchitecture,
    selected_market_ids: st.selectedMarketIds,
    custom_identities: st.customIdentities,
    weights: st.weights,
    filters: st.filters,
    goals: st.goals,
    phases: st.phases,
  };

  try {
    const res = await fetch("/api/evolution/roadmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(r => r.json());
    if (res && res.updated_at) {
      st.lastSavedAt = res.updated_at;
      const badge = document.getElementById("ws-save-status-badge");
      if (badge) {
        badge.innerHTML = `<i class="bi bi-check-circle-fill text-emerald-400 mr-1"></i>Saved to SQLite (${res.updated_at})`;
      }
    }
  } catch (err) {
    console.error("Failed to save roadmap:", err);
  }
};

window.exportEvolutionRoadmapBrief = function () {
  const evo = AppState.evolutionData || {};
  initEvolutionUIState(evo);
  const st = AppState.evoWorkshop;
  const allCands = evo.candidate_markets || [];
  const selCands = st.selectedMarketIds.map(id => allCands.find(m => Number(m.city_id) === Number(id))).filter(Boolean);

  const md = [
    `# ${st.roadmapTitle}`,
    `- **Save / League**: ${AppState.activeSave} — ${(evo.active_league && evo.active_league.name) || 'League'} (${evo.season_year || 2026})`,
    `- **Target Architecture**: ${st.targetArchitecture} (${st.horizonYears}-Year Horizon)`,
    `- **Selected Expansion Class (${selCands.length} Clubs)**:`,
    ...selCands.map((m, i) => {
      const cust = st.customIdentities[m.city_id] || {};
      const nick = cust.nickname || m.suggested_nickname;
      const abbr = cust.abbr || m.suggested_abbr;
      const park = cust.park || m.suggested_park;
      return `  ${i + 1}. **${m.city}, ${m.state} — ${m.city} ${nick} (${abbr})** @ ${park} | IRL Counterpart: ${m.irl_summary_badge} | Nearest Rival: ${m.nearest_team_abbr} (${m.nearest_team_miles} mi)`;
    }),
    `\n## Strategic Goals & KPIs`,
    ...st.goals.map(g => `- **[${g.status}] ${g.title}** (${g.category} • Target ${g.target_year}: ${g.target_metric})`),
    `\n## Phased Execution Timeline`,
    ...st.phases.map(p => `### ${p.phase} (${p.year}): ${p.headline}\n${p.actions}`),
  ].join("\n");

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${AppState.activeSave}_evolution_roadmap.md`;
  a.click();
  URL.revokeObjectURL(url);
};

async function renderEvolutionTab(container) {
  showLoading("Analyzing League/Association Health, Structural Blueprints, Expansion Cities & Roadmaps...");
  try {
    const yrParam = AppState.activeYear ? `&year=${AppState.activeYear}` : "";
    if (!AppState.evolutionData) {
      AppState.evolutionData = await fetchJSON(`/api/evolution?save=${AppState.activeSave}&league_id=${AppState.activeLeagueId || ''}${yrParam}`);
    }
  } finally {
    hideLoading();
  }

  const evo = AppState.evolutionData || {};
  initEvolutionUIState(evo);
  const wsState = AppState.evoWorkshop;
  const rd = evo.readiness || {};
  const health = evo.health_analysis || {};
  const hist = evo.history || {};
  const vault = evo.data_vault || {};
  const sub = AppState.evolutionSubTab || "readiness";
  const allLeagues = evo.all_leagues || [];

  let subHtml = "";

  if (sub === "readiness") {
    const pillars = rd.pillars || [];
    const blueprints = evo.structural_blueprints || rd.structural_blueprints || rd.structural_scenarios || [];
    const configuredMarkets = computeConfiguredCandidateMarkets(evo);
    const selectedSet = new Set((wsState.selectedMarketIds || []).map(Number));
    const score = Number(rd.overall_score || 0);
    const scoreCol = rd.verdict_color || (score >= 75 ? "#10b981" : (score >= 60 ? "#dbdbdb" : "#f59e0b"));
    const w = wsState.weights;
    const flt = wsState.filters;
    const isAshes = Boolean(health.world_info && health.world_info.universe_scale && health.world_info.universe_scale.is_custom_scaled_world);

    subHtml = `
      <!-- Top Executive Expansion & Association Readiness Banner -->
      <div class="glass-card p-6 border-l-4" style="border-left-color:${scoreCol}">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div class="lg:col-span-8 space-y-2.5">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wider" style="background:${scoreCol}22; color:${scoreCol}; border:1px solid ${scoreCol}66;">
                <i class="bi bi-compass-fill mr-1"></i> ${rd.verdict || 'Expansion Readiness Analysis'}
              </span>
              <span class="text-xs font-mono text-slate-400">
                ${evo.active_league ? `${evo.active_league.abbr} — ${evo.active_league.name}` : ''} • ${rd.current_teams || 0} Active Franchises • ${rd.sub_leagues || 2} Sub-Leagues / ${rd.divisions || 4} Divisions
              </span>
            </div>
            <h2 class="text-2xl font-black text-white tracking-tight">League & Association Evolution Command Center</h2>
            <p class="text-sm text-slate-200 leading-relaxed">${rd.recommendation_summary || ''}</p>
            <div class="pt-1 flex flex-wrap items-center gap-2">
              <button onclick="AppState.evolutionSubTab='health'; renderEvolutionTab(document.getElementById('main-view-container'))" class="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-emerald-500/40 text-xs font-extrabold transition flex items-center gap-1.5">
                <i class="bi bi-heart-pulse-fill"></i> Inspect Talent, Financial & World Health
              </button>
              <button onclick="AppState.evolutionSubTab='workshop'; renderEvolutionTab(document.getElementById('main-view-container'))" class="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/50 text-xs font-extrabold transition flex items-center gap-1.5">
                <i class="bi bi-map-fill"></i> Open Interactive Expansion Map & Roadmap Workshop (${wsState.selectedMarketIds.length} Selected)
              </button>
              ${allLeagues.length > 1 ? allLeagues.map(l => `
                <button onclick="onLeagueChanged(${l.league_id})" class="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition ${l.league_id === AppState.activeLeagueId ? 'bg-sky-500 text-slate-950 border-sky-300' : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'}">
                  [${l.level_label}] ${l.abbr} (${l.teams_count}T)
                </button>
              `).join("") : ""}
            </div>
          </div>

          <div class="lg:col-span-4 grid grid-cols-2 gap-3 text-center">
            <div class="bg-slate-950/85 p-4 rounded-2xl border border-slate-800">
              <div class="text-[10px] font-bold uppercase text-slate-400">Expansion Readiness Index</div>
              <div class="text-4xl font-black font-mono mt-1" style="color:${scoreCol}">${score}<span class="text-lg text-slate-400">/100</span></div>
              <div class="text-[11px] font-mono text-slate-300 mt-1">${pillars.length}-Pillar Composite Score</div>
            </div>
            <div class="bg-slate-950/85 p-4 rounded-2xl border border-slate-800">
              <div class="text-[10px] font-bold uppercase text-slate-400">Recommended Action</div>
              <div class="text-2xl font-black font-mono text-white mt-2">
                ${rd.recommended_expansion_teams > 0 ? `+${rd.recommended_expansion_teams} TEAMS` : 'REALIGN / TIER'}
              </div>
              <div class="text-[11px] font-mono text-emerald-400 mt-1">
                ${rd.recommended_expansion_teams > 0 ? `Target: ${rd.current_teams + rd.recommended_expansion_teams} Teams` : 'Optimize Pods First'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 5 Analytical Readiness Pillars -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
        ${pillars.map(p => {
          const pCol = p.score >= 75 ? "#10b981" : (p.score >= 60 ? "#dbdbdb" : "#f59e0b");
          return `
            <div class="glass-card p-4 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                  <div class="flex items-center gap-1.5">
                    <i class="bi ${p.icon} text-white"></i>
                    <h4 class="text-[11px] font-extrabold uppercase tracking-wider text-white">${p.name}</h4>
                  </div>
                  <span class="px-1.5 py-0.5 rounded font-mono text-[11px] font-black" style="background:${pCol}22; color:${pCol}; border:1px solid ${pCol}55;">
                    ${p.score} (${p.grade})
                  </span>
                </div>
                <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div class="h-full" style="width:${p.score}%; background:${pCol};"></div>
                </div>
                <div class="text-xs font-bold text-white mb-1">${p.summary}</div>
                <p class="text-[11px] text-slate-400 leading-relaxed mb-2.5">${p.detail}</p>
              </div>
              <div class="bg-slate-950/75 rounded-xl p-2 border border-slate-800/90 space-y-1 text-[10.5px] font-mono">
                ${Object.entries(p.metrics || {}).map(([k, v]) => `
                  <div class="flex justify-between gap-1">
                    <span class="text-slate-400 truncate">${k}:</span>
                    <span class="font-bold text-white shrink-0">${v}</span>
                  </div>
                `).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>

      <!-- Expanded Structural Evolution & Realignment Blueprints (6 Architectures) -->
      <div class="glass-card p-5">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
          <div>
            <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <i class="bi bi-diagram-3-fill text-amber-400"></i> Expanded Structural Evolution & Realignment Blueprints (${blueprints.length} Architectures)
            </h3>
            <p class="text-xs text-slate-400">Data-driven expansion, geographic pod realignment, promotion/relegation pyramid, and multi-league federation models with live Haversine division clustering</p>
          </div>
          <span class="text-xs font-mono text-slate-400">Click "Inspect Division Pods" or "Load in Workshop" on any blueprint</span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 uw:grid-cols-3 gap-4">
          ${blueprints.map((sc, idx) => {
            const bpId = sc.id || `bp_${idx}`;
            const isExpanded = Boolean(wsState.expandedBlueprints[bpId]);
            const divs = sc.realigned_divisions || [];
            const finImp = sc.financial_impact || {};
            const trvImp = sc.travel_impact || {};
            return `
              <div class="bg-slate-900/90 border ${sc.recommended ? 'border-emerald-400/70 ring-1 ring-emerald-400/25' : 'border-slate-800'} rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div class="flex items-center gap-1.5">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${sc.recommended ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' : 'bg-slate-800 text-slate-300 border border-slate-700'}">
                        ${sc.recommended ? '★ RECOMMENDED FIT' : (sc.category || sc.type || 'BLUEPRINT')}
                      </span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-sky-300 border border-slate-800">
                        ${sc.target_teams} Teams ${sc.expansion_delta > 0 ? `(+${sc.expansion_delta})` : '(0 Exp)'}
                      </span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      ${divs.length ? `
                        <button onclick="toggleBlueprintAlignPreview('${bpId}')" class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition">
                          <i class="bi bi-grid-3x3-gap mr-1"></i>${isExpanded ? 'Hide Pods' : `Inspect ${divs.length} Pods`}
                        </button>
                      ` : ""}
                      <button onclick="loadBlueprintIntoWorkshop('${bpId}')" class="px-2.5 py-0.5 rounded text-[10px] font-mono font-extrabold bg-sky-500 hover:bg-sky-400 text-slate-950 transition">
                        <i class="bi bi-compass mr-1"></i>Load in Workshop
                      </button>
                    </div>
                  </div>

                  <h4 class="text-base font-black text-white mb-1">${sc.title}</h4>
                  <div class="text-xs font-mono text-amber-300 mb-2"><i class="bi bi-grid-1x2 mr-1"></i>${sc.alignment}</div>
                  <p class="text-xs text-slate-300 leading-relaxed mb-3">${sc.pros || sc.rationale || ''}</p>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/90 text-[11px] font-mono mb-3">
                    <div><span class="text-slate-400">Schedule Matrix:</span> <span class="text-white font-semibold">${sc.schedule_matrix || '162G Balanced'}</span></div>
                    <div><span class="text-slate-400">Postseason:</span> <span class="text-white font-semibold">${sc.playoff_format || '-'}</span></div>
                    <div><span class="text-slate-400">Draft / Rules:</span> <span class="text-slate-200">${sc.draft_rule || '-'}</span></div>
                    <div><span class="text-slate-400">Travel Impact:</span> <span class="text-emerald-300 font-bold">${trvImp.summary || `${trvImp.avg_intra_div_miles || 0} mi avg div`}</span></div>
                  </div>

                  ${isExpanded && divs.length ? `
                    <div class="mb-3 p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div class="text-[10px] font-mono font-extrabold uppercase tracking-wider text-sky-300 flex items-center justify-between">
                        <span>Projected Geographic Division / Tier Alignment</span>
                        <span class="text-slate-400">+EXP = Recommended Expansion Targets</span>
                      </div>
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        ${divs.map(d => `
                          <div class="p-2 rounded-lg bg-slate-900/90 border border-slate-800/80">
                            <div class="flex justify-between items-center text-[10px] font-mono font-bold text-white mb-1">
                              <span>${d.division_name} (${d.teams_count}T)</span>
                              <span class="text-slate-400">${d.avg_intra_div_miles} mi avg</span>
                            </div>
                            <div class="flex flex-wrap gap-1">
                              ${(d.teams || []).map(t => `
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${t.is_expansion ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50' : 'bg-slate-800 text-slate-200'}" title="${t.full_name} (${t.city}, ${t.state})">
                                  ${t.is_expansion ? '+ ' : ''}${t.abbr} <span class="text-[9px] font-normal opacity-80">${t.city}</span>
                                </span>
                              `).join("")}
                            </div>
                          </div>
                        `).join("")}
                      </div>
                    </div>
                  ` : ""}
                </div>

                <div class="pt-2.5 border-t border-slate-800 flex flex-wrap justify-between items-center gap-2 text-[11px] font-mono">
                  <div>
                    <span class="text-slate-400">Talent Dilution Risk:</span>
                    <span class="font-bold ml-1 ${(sc.talent_dilution_risk || '').includes('Low') || (sc.talent_dilution_risk || '').includes('None') ? 'text-emerald-400' : ((sc.talent_dilution_risk || '').includes('Moderate') ? 'text-amber-300' : 'text-rose-400')}">${sc.talent_dilution_risk || 'Moderate'}</span>
                  </div>
                  ${finImp.windfall_per_existing_club ? `
                    <div>
                      <span class="text-slate-400">Expansion Windfall:</span>
                      <span class="font-bold text-emerald-300 ml-1">$${(Number(finImp.windfall_per_existing_club) / 1e6).toFixed(1)}M / existing club</span>
                    </div>
                  ` : ""}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Configurable Expansion Target City Recommender (with Real-Life MLB/MiLB Counterparts) -->
      <div class="glass-card overflow-hidden">
        <div class="p-4 bg-slate-900/95 border-b border-slate-800 flex flex-wrap justify-between items-center gap-3">
          <div>
            <h3 class="font-extrabold text-sm uppercase tracking-wider text-white flex items-center gap-2">
              <i class="bi bi-geo-alt-fill text-emerald-400"></i> Configurable Expansion Target City Recommender & Real-Life MLB/MiLB Counterpart Ledger
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">
              Dynamically ranks candidate cities using 5 configurable factor weights, geographic scope filters, and Real-Life Major/Minor League Baseball counterpart matching
              ${isAshes ? `<span class="ml-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 font-mono text-[10px]">Ashes Scaled Population Normalization Active</span>` : ""}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] font-mono uppercase text-slate-400 mr-1">Strategy Presets:</span>
            ${[
              ["balanced", "Balanced Default"],
              ["irl_pro", "IRL Pro Ballpark Ready"],
              ["metro_media", "Mega-Metro & Media"],
              ["regional_compact", "Regional Compactness"],
              ["untapped_frontier", "Untapped Territory"],
            ].map(([pk, plabel]) => `
              <button onclick="applyRecommenderPreset('${pk}')" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-mono font-bold text-slate-200 border border-slate-700 transition">
                ${plabel}
              </button>
            `).join("")}
          </div>
        </div>

        <!-- Ultrawide Side-by-Side Recommender Controls (Left 3 Cols) + Ranked Candidate Cities Table (Right 9 Cols) -->
        <div class="grid grid-cols-1 uw:grid-cols-12 items-start">
          <div class="uw:col-span-3 p-4 bg-slate-950/85 border-b uw:border-b-0 uw:border-r border-slate-800 space-y-4">
            <div class="text-[11px] font-extrabold uppercase tracking-wider text-sky-400 flex items-center justify-between">
              <span><i class="bi bi-sliders mr-1"></i>5-Factor Weights</span>
              <span class="font-mono text-[10px] text-slate-400">${configuredMarkets.length} Matches</span>
            </div>
            <!-- 5 Configurable Weight Sliders -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 uw:grid-cols-1 gap-3 bg-slate-900/90 p-3 rounded-xl border border-slate-800">
              ${[
                ["pop", "Population & Media Scale", "text-sky-300"],
                ["econ", "Economic & Corp Strength", "text-emerald-300"],
                ["geo", "Geographic Compactness", "text-amber-300"],
                ["gap", "Untapped / Rivalry Spacing", "text-purple-300"],
                ["irl", "Real-Life MLB/MiLB Heritage", "text-pink-300"],
              ].map(([fk, flabel, fcol]) => `
                <div class="space-y-1">
                  <div class="flex justify-between items-center text-[11px] font-mono">
                    <span class="font-bold ${fcol} truncate">${flabel}</span>
                    <span class="font-extrabold text-white">${w[fk]}%</span>
                  </div>
                  <input type="range" min="0" max="100" step="5" value="${w[fk]}"
                    onchange="updateRecommenderWeight('${fk}', this.value)"
                    class="w-full accent-sky-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg" />
                </div>
              `).join("")}
            </div>

            <!-- Filter Bar (Geographic Scope, Real-Life Counterpart Level, Rivalry Mode, Search) -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 uw:grid-cols-1 gap-3 text-xs">
              <div>
                <label class="block text-[10px] font-mono uppercase text-slate-400 mb-1">Geographic Scope Filter</label>
                <select onchange="updateRecommenderFilter('scope', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs">
                  <option value="all" ${flt.scope === 'all' ? 'selected' : ''}>All Evaluated Markets (${(evo.candidate_markets || []).length})</option>
                  <option value="open_only" ${flt.scope === 'open_only' ? 'selected' : ''}>Open Expansion Markets Only (0 Active Clubs in City)</option>
                  <option value="primary_state" ${flt.scope === 'primary_state' ? 'selected' : ''}>Primary League State(s) Only</option>
                  <option value="regional" ${flt.scope === 'regional' ? 'selected' : ''}>Primary + Adjacent Regional Border States</option>
                  <option value="domestic" ${flt.scope === 'domestic' ? 'selected' : ''}>Domestic US Markets Only</option>
                  <option value="international" ${flt.scope === 'international' ? 'selected' : ''}>International Markets (CAN / MEX / CAR)</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-mono uppercase text-slate-400 mb-1">Real-Life MLB / MiLB Counterpart Filter</label>
                <select onchange="updateRecommenderFilter('irl_filter', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs">
                  <option value="all" ${flt.irl_filter === 'all' ? 'selected' : ''}>All Markets (IRL Pro + Untapped)</option>
                  <option value="any_irl" ${flt.irl_filter === 'any_irl' ? 'selected' : ''}>Has Real-Life MLB / MiLB / Partner Counterpart</option>
                  <option value="mlb_hist" ${flt.irl_filter === 'mlb_hist' ? 'selected' : ''}>MLB & Historic MLB Markets Only</option>
                  <option value="aaa" ${flt.irl_filter === 'aaa' ? 'selected' : ''}>MLB & Triple-A Markets Only</option>
                  <option value="aa_a" ${flt.irl_filter === 'aa_a' ? 'selected' : ''}>Double-A, High-A & Single-A Affiliates</option>
                  <option value="partner_intl" ${flt.irl_filter === 'partner_intl' ? 'selected' : ''}>MLB Partner, Draft League & International Pro</option>
                  <option value="untapped" ${flt.irl_filter === 'untapped' ? 'selected' : ''}>Greenfield / Untapped Markets Only (No Current Pro Club)</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-mono uppercase text-slate-400 mb-1">Rivalry Distance Preference</label>
                <select onchange="updateRecommenderFilter('rivalry_mode', this.value)" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs">
                  <option value="balanced" ${flt.rivalry_mode === 'balanced' ? 'selected' : ''}>Balanced Spacing (35–240 mi Ideal)</option>
                  <option value="derby" ${flt.rivalry_mode === 'derby' ? 'selected' : ''}>Close Regional Rivalry (< 95 mi Derby)</option>
                  <option value="frontier" ${flt.rivalry_mode === 'frontier' ? 'selected' : ''}>New Geographic Frontier (> 140 mi)</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-mono uppercase text-slate-400 mb-1">Search City, Affiliate or Ballpark</label>
                <input type="text" value="${flt.search || ''}" placeholder="e.g. Los Angeles, San Francisco, Allentown, AAA..."
                   oninput="AppState.evoWorkshop.filters.search = this.value; renderEvolutionTab(document.getElementById('main-view-container'))"
                  class="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs" />
              </div>
            </div>
          </div>

          <div class="uw:col-span-9 overflow-x-auto max-h-[680px]">
            <table class="saber-table">
              <thead>
                <tr>
                  <th class="text-center">Workshop</th>
                  <th class="text-center">Rk</th>
                  <th class="text-left">Candidate City & Scope</th>
                  <th class="text-left">Real-Life Major / Minor League Counterpart(s)</th>
                  <th class="text-left">Suggested Identity & Ballpark</th>
                  <th class="text-right">Metro Population</th>
                  <th class="text-center">Nearest Active Rival</th>
                  <th class="text-center">Factor Breakdown (P/E/G/R/B)</th>
                  <th class="text-right">Weighted Score</th>
                </tr>
              </thead>
              <tbody>
                ${configuredMarkets.map((m, idx) => {
                  const isSel = selectedSet.has(Number(m.city_id));
                  const cList = m.irl_counterparts || [];
                  const badgeCls = irlBadgeStyle(m.irl_primary_level);
                  return `
                    <tr class="${isSel ? 'bg-emerald-950/30' : ''}">
                      <td class="text-center">
                        <button onclick="toggleWorkshopExpansionCity(${m.city_id})" class="px-2.5 py-1 rounded-lg text-[10px] font-mono font-extrabold transition ${isSel ? 'bg-emerald-500 text-slate-950 shadow' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'}">
                          ${isSel ? '✓ Selected' : '+ Select'}
                        </button>
                      </td>
                      <td class="text-center font-mono font-bold text-amber-400">#${idx + 1}</td>
                      <td>
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="font-bold text-white text-sm">${m.city}, <span class="text-slate-300 font-mono">${m.state}</span></span>
                          ${m.is_active_league_city ? `<span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 text-[9px] font-mono">Active: ${(m.active_team_abbrs || []).join(', ') || '1+'} • 2nd-Club Metro</span>` : ''}
                        </div>
                        <div class="text-[10px] font-mono text-slate-400">${m.region_bucket} • ${m.financial_tier}</div>
                      </td>
                      <td class="max-w-md">
                        <div class="flex flex-wrap items-center gap-1.5 mb-1">
                          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-extrabold border ${badgeCls}">
                            ${m.has_irl_counterpart ? `⚾ ${m.irl_summary_badge}` : '🌱 Untapped Market (No Current MLB/MiLB Club)'}
                          </span>
                        </div>
                        ${cList.length ? `
                          <div class="space-y-0.5 text-[10.5px] font-mono text-slate-300">
                            ${cList.slice(0, 2).map(cp => `
                              <div class="truncate" title="${cp.team_name} — ${cp.league} @ ${cp.park} (${Number(cp.capacity || 0).toLocaleString()} cap)">
                                <b class="text-white">[${cp.level}]</b> ${cp.team_name}
                                ${cp.parent_abbr && !['MLB', 'IND'].includes(cp.parent_abbr) ? `<span class="px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[9.5px] ml-0.5">${cp.parent_abbr} Affil</span>` : ''}
                                <span class="text-slate-400">• ${cp.league} • ${cp.park} (${Number(cp.capacity || 0).toLocaleString()})</span>
                              </div>
                            `).join("")}
                          </div>
                        ` : `<div class="text-[10.5px] text-slate-500 italic">Greenfield expansion city — no active affiliated MLB/MiLB club</div>`}
                      </td>
                      <td>
                        <div class="font-extrabold text-sky-300 text-xs">${m.city} ${m.suggested_nickname} <span class="font-mono text-[10px] text-slate-400">(${m.suggested_abbr})</span></div>
                        <div class="text-[10.5px] font-mono text-slate-400">${m.suggested_park} • Est. Mkt Size ${m.projected_market_size}/10</div>
                      </td>
                      <td class="text-right font-mono">
                        <div class="font-bold text-white">${Number(m.effective_metro_pop || m.population || 0).toLocaleString()}</div>
                        ${isAshes && m.nation_id === 206 ? `<div class="text-[10px] text-amber-300/90">In-Save: ${Number(m.population || 0).toLocaleString()}</div>` : `<div class="text-[10px] text-slate-400">Econ ${m.economy}/200</div>`}
                      </td>
                      <td class="text-center font-mono text-xs">
                        <div class="font-bold text-white">${m.nearest_team_abbr} <span class="text-emerald-300">(${m.nearest_team_miles} mi)</span></div>
                        <div class="text-[10px] text-slate-400">Centroid: ${m.dist_to_centroid_miles} mi</div>
                      </td>
                      <td class="text-center font-mono text-[10px]">
                        <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                          <span title="Population Scale" class="text-sky-300">${m.factor_pop}</span>/
                          <span title="Economic Strength" class="text-emerald-300">${m.factor_econ}</span>/
                          <span title="Geographic Fit" class="text-amber-300">${m.factor_geo}</span>/
                          <span title="Rivalry Spacing" class="text-purple-300">${m.effective_gap_factor}</span>/
                          <span title="Real-Life Baseball Heritage" class="text-pink-300">${m.factor_irl}</span>
                        </div>
                      </td>
                      <td class="text-right font-mono">
                        <span class="px-2.5 py-1 rounded-lg text-sm font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/50">${m.computed_score}</span>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } else if (sub === "history") {
    const yby = hist.year_by_year || [];
    const fran = hist.franchise_ledger || [];
    const dumpProg = hist.dump_progression || [];
    const hints = hist.league_hints || [];

    subHtml = `
      <!-- Multi-Year League Evolution Chart + Milestones -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div class="glass-card p-4 lg:col-span-8">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <i class="bi bi-graph-up-arrow text-emerald-400"></i> Multi-Year League Evolution: Franchise Count, ERA & OPS (${yby.length} Seasons)
              </h3>
              <p class="text-xs text-slate-400">Tracks structural expansions alongside offensive and pitching environment shifts across league history</p>
            </div>
          </div>
          <div class="h-72">
            <canvas id="league-evolution-chart-canvas"></canvas>
          </div>
        </div>

        <div class="glass-card p-4 lg:col-span-4 flex flex-col justify-between">
          <div>
            <h3 class="text-sm font-extrabold uppercase tracking-wider text-white mb-2 flex items-center gap-2">
              <i class="bi bi-trophy-fill text-amber-400"></i> All-Time League Records & Hints
            </h3>
            <p class="text-xs text-slate-400 mb-3">Ingested directly from <code>league_hints.txt</code> & historical ledger</p>
            <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
              ${hints.length ? hints.map(h => `
                <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-200 font-medium">
                  <i class="bi bi-star-fill text-amber-400 mr-1.5"></i>${h}
                </div>
              `).join("") : `<div class="text-xs text-slate-400 italic">No league_hints.txt records found for this save.</div>`}
            </div>
          </div>
          <div class="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center text-xs font-mono text-slate-400">
            <span>Total Seasons Tracked: <b class="text-white">${yby.length}</b></span>
            <span>Franchises Tracked: <b class="text-white">${fran.length}</b></span>
          </div>
        </div>
      </div>

      <!-- Ultrawide Side-by-Side: Year-by-Year League History (Left 7 Cols) + All-Time Franchise History Ledger (Right 5 Cols) -->
      <div class="grid grid-cols-1 uw:grid-cols-12 gap-5 items-start">
        <!-- Year-by-Year League History & Era Ledger -->
        <div class="glass-card overflow-hidden uw:col-span-7">
          <div class="px-4 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2">
            <div>
              <h3 class="font-extrabold text-sm uppercase tracking-wider text-white"><i class="bi bi-journal-bookmark-fill text-amber-400 mr-1.5"></i> Year-by-Year League History, Champions & Era Ledger</h3>
              <p class="text-xs text-slate-400">Click any Season Year to switch the entire application to that historical year, or click Almanac to open its archived HTML portal</p>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="saber-table">
              <thead>
                <tr>
                  <th class="text-left">Year</th>
                  <th class="text-center">Teams</th>
                  <th class="text-left">Structural Event</th>
                  <th class="text-left">Champion / Best Record</th>
                  <th class="text-left">Top Batter (WAR)</th>
                  <th class="text-left">Top Pitcher (WAR)</th>
                  <th class="text-right">Lg AVG</th>
                  <th class="text-right">Lg OPS</th>
                  <th class="text-right">Lg ERA</th>
                  <th class="text-right">Total HR</th>
                  <th class="text-right">Parity SD</th>
                  <th class="text-right">Attendance</th>
                  <th class="text-center">Almanac / Snapshot</th>
                </tr>
              </thead>
              <tbody>
                ${yby.map(y => `
                  <tr>
                    <td class="font-mono font-black text-white">
                      <button onclick="onYearChanged(${y.year})" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 transition" title="Browse ${y.year} Season Standings & Leaders">
                        ${y.year} &rarr;
                      </button>
                    </td>
                    <td class="text-center font-mono font-bold text-white">${y.teams_count}</td>
                    <td>
                      ${y.expansion_event ? `
                        <span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                          <i class="bi bi-plus-circle-fill mr-1"></i>${y.expansion_event}
                        </span>
                      ` : `<span class="text-xs text-slate-500 font-mono">Stable (${y.teams_count}T)</span>`}
                    </td>
                    <td class="font-bold text-amber-300">${y.champion} <span class="text-xs font-mono text-slate-400">(${y.best_record})</span></td>
                    <td class="text-xs text-slate-200">${y.top_batter}</td>
                    <td class="text-xs text-slate-200">${y.top_pitcher}</td>
                    <td class="text-right font-mono">${fmtAvg(y.league_avg)}</td>
                    <td class="text-right font-mono font-bold text-white">${fmtAvg(y.league_ops)}</td>
                    <td class="text-right font-mono text-amber-300 font-semibold">${Number(y.league_era || 0).toFixed(2)}</td>
                    <td class="text-right font-mono text-pink-400">${Number(y.total_hr || 0).toLocaleString()}</td>
                    <td class="text-right font-mono text-slate-300">${Number(y.parity_sd || 0).toFixed(3)}</td>
                    <td class="text-right font-mono text-slate-300">${Number(y.total_attendance || 0).toLocaleString()}</td>
                    <td class="text-center">
                      <div class="flex items-center justify-center gap-1.5">
                        ${y.has_almanac ? `<button onclick="openAlmanacInBnn('almanac_${y.year}/leagues/league_${AppState.activeLeagueId || 200}_home.html')" class="px-2 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/35 text-purple-300 border border-purple-400/40 text-[10px] font-bold">Almanac ${y.year}</button>` : ""}
                        ${y.has_yearly_dump ? `<button onclick="onDumpSourceChanged('dump_${y.year}_yearly')" class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 text-[10px] font-mono">Dump ${y.year}</button>` : ""}
                      </div>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- All-Time Franchise History Ledger -->
        <div class="glass-card overflow-hidden uw:col-span-5">
          <div class="px-4 py-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
            <div>
              <h3 class="font-extrabold text-sm uppercase tracking-wider text-white"><i class="bi bi-building-fill-check text-white mr-1.5"></i> All-Time Franchise History & Championship Ledger</h3>
              <p class="text-xs text-slate-400">Cumulative multi-year franchise records, run differentials, playoff berths, and titles</p>
            </div>
            <span class="text-xs font-mono text-slate-400">${fran.length} Franchises</span>
          </div>
          <div class="overflow-x-auto">
            <table class="saber-table">
              <thead>
                <tr>
                  <th>Rk</th>
                  <th class="text-left">Franchise</th>
                  <th class="text-center">Active Span</th>
                  <th class="text-right">Seasons</th>
                  <th class="text-right">All-Time W-L-T</th>
                  <th class="text-right">Win %</th>
                  <th class="text-right">Playoff Berths</th>
                  <th class="text-right">Titles</th>
                  <th class="text-left">Best Season</th>
                  <th class="text-right">All-Time Run Diff</th>
                  <th class="text-right">Avg Attendance</th>
                  <th class="text-right">Cumulative WAR</th>
                </tr>
              </thead>
              <tbody>
                ${fran.map((f, i) => `
                  <tr onclick="switchTeamAndGo(${f.team_id})" class="cursor-pointer">
                    <td class="text-center font-mono text-slate-500">${i + 1}</td>
                    <td class="font-bold text-white flex items-center gap-2">
                      <img src="${teamLogoUrl(f.logo_file_name)}" class="w-5 h-5 object-contain">
                      <span>${f.full_name}</span>
                      <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">${f.abbr}</span>
                    </td>
                    <td class="text-center font-mono text-xs text-slate-300">${f.active_years}</td>
                    <td class="text-right font-mono">${f.seasons}</td>
                    <td class="text-right font-mono font-bold text-white">${f.record_str}</td>
                    <td class="text-right font-mono font-bold text-sky-300">${fmtAvg(f.pct)}</td>
                    <td class="text-right font-mono text-emerald-400 font-bold">${f.playoff_appearances}</td>
                    <td class="text-right font-mono font-black ${f.championships > 0 ? 'text-amber-400' : 'text-slate-500'}">${f.championships > 0 ? '🏆 ' + f.championships : '0'}</td>
                    <td class="font-mono text-xs text-slate-300">${f.best_year} (${f.best_record})</td>
                    <td class="text-right font-mono ${f.run_diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${f.run_diff >= 0 ? '+' : ''}${f.run_diff}</td>
                    <td class="text-right font-mono text-slate-300">${Number(f.avg_attendance || 0).toLocaleString()}</td>
                    <td class="text-right font-mono font-extrabold text-white">${Number(f.total_war || 0).toFixed(1)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Monthly & Yearly Dump Snapshot Progression -->
      ${dumpProg.length ? `
      <div class="glass-card overflow-hidden">
        <div class="px-4 py-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h3 class="font-extrabold text-sm uppercase tracking-wider text-white"><i class="bi bi-clock-history text-purple-400 mr-1.5"></i> Monthly & Yearly CSV Dump Snapshot Progression (${dumpProg.length} Snapshots)</h3>
            <p class="text-xs text-slate-400">Standings progression extracted across every monthly and yearly CSV dump in <code>dump/</code></p>
          </div>
        </div>
        <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 uw:grid-cols-4 suw:grid-cols-5 gap-3 max-h-[520px] overflow-y-auto">
          ${dumpProg.map(dp => `
            <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
              <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                <div>
                  <span class="font-mono text-xs font-extrabold text-white">${dp.dump_label}</span>
                  <div class="text-[10px] font-mono text-slate-400">In-Game Date: ${dp.in_game_date || 'N/A'} • ${dp.teams_count} Teams</div>
                </div>
                <button onclick="onDumpSourceChanged('${dp.dump_label}')" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-white border border-slate-600 transition">
                  Load Dump
                </button>
              </div>
              <div class="space-y-1 text-[11px] font-mono">
                ${(dp.top_teams || []).slice(0, 5).map((t, idx) => `
                  <div class="flex justify-between items-center">
                    <span class="text-slate-300"><b class="text-slate-500 mr-1">${idx + 1}.</b><b class="text-white">${t.abbr}</b> ${t.name}</span>
                    <span class="text-slate-200">${t.w}-${t.l}${t.t > 0 ? '-' + t.t : ''} <span class="text-slate-400">(${fmtAvg(t.pct)})</span></span>
                  </div>
                `).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
      ` : ""}
    `;
  } else if (sub === "vault") {
    const dumps = vault.dumps || [];
    const almanacs = vault.almanacs || [];
    const ldev = hist.league_dev || [];
    const jsonConfigs = vault.json_configs || {};
    const ieFiles = vault.import_export_files || [];
    const txtLogs = vault.txt_logs || [];
    const changelogs = hist.id_changelogs || [];

    subHtml = `
      <!-- Monthly & Yearly CSV Dumps + Yearly HTML Almanacs Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div class="glass-card p-4 lg:col-span-7">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <div>
              <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <i class="bi bi-database-fill-gear text-purple-400"></i> Dumped Monthly & Yearly CSV Snapshots (${dumps.length})
              </h3>
              <p class="text-xs text-slate-400">Click any monthly or yearly dump to switch the active SQLite database to that exact point in time</p>
            </div>
          </div>
          <div class="overflow-x-auto max-h-[380px]">
            <table class="saber-table">
              <thead>
                <tr>
                  <th class="text-left">Dump Label</th>
                  <th class="text-center">Frequency</th>
                  <th class="text-center">In-Game Date</th>
                  <th class="text-right">CSV Tables</th>
                  <th class="text-center">Status / Action</th>
                </tr>
              </thead>
              <tbody>
                ${dumps.map(d => `
                  <tr>
                    <td class="font-mono font-bold text-white">${d.label}</td>
                    <td class="text-center">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${d.dump_type === 'yearly' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : (d.dump_type === 'monthly' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-slate-800 text-slate-300')}">
                        ${(d.dump_type || 'export').toUpperCase()}
                      </span>
                    </td>
                    <td class="text-center font-mono text-xs text-emerald-300">${d.in_game_date || d.current_date || '-'}</td>
                    <td class="text-right font-mono">${d.csv_count} CSVs</td>
                    <td class="text-center">
                      <button onclick="onDumpSourceChanged('${d.label}')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition ${d.is_active ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50' : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600'}">
                        ${d.is_active ? '✓ Active in SQLite' : 'Switch to Dump'}
                      </button>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="glass-card p-4 lg:col-span-5">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <div>
              <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <i class="bi bi-journal-album text-amber-400"></i> Yearly HTML Almanac Archives (${almanacs.length})
              </h3>
              <p class="text-xs text-slate-400">Archived multi-year HTML almanacs in <code>news/almanac_YYYY</code></p>
            </div>
          </div>
          <div class="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            ${almanacs.length ? almanacs.map(a => {
              const almUrl = a.index_url || a.league_home_path || a.index_path || `almanac_${a.year}/leagues/league_${AppState.activeLeagueId || 200}_home.html`;
              const folderLabel = a.folder || a.folder_name || `almanac_${a.year}`;
              return `
              <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <div class="text-sm font-extrabold text-white font-mono">${a.year ? `${a.year} Season Almanac` : folderLabel}</div>
                  <div class="text-[11px] font-mono text-slate-400">Folder: <code>news/${folderLabel}</code> • <b>${Number(a.html_count || 0).toLocaleString()}</b> HTML Pages</div>
                </div>
                <button onclick="openAlmanacInBnn('${almUrl}')" class="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs transition">
                  <i class="bi bi-globe2 mr-1"></i> Open Almanac
                </button>
              </div>
              `;
            }).join("") : `<div class="p-6 text-center text-xs text-slate-400">No <code>news/almanac_YYYY</code> folders found in this save yet.</div>`}

            ${ieFiles.length ? `
              <div class="pt-3 border-t border-slate-800">
                <div class="text-xs font-bold uppercase text-slate-300 mb-2">Import/Export & Draft/Roster Files (${ieFiles.length})</div>
                <div class="space-y-1">
                  ${ieFiles.map(f => `
                    <div class="flex justify-between items-center text-[11px] font-mono bg-slate-950/70 px-2.5 py-1.5 rounded border border-slate-800">
                      <span class="text-slate-200 truncate">${f.rel_path || f.name}</span>
                      <span class="text-slate-400">${((f.size_bytes || (f.size_kb || 0) * 1024) / 1024).toFixed(1)} KB</span>
                    </div>
                  `).join("")}
                </div>
              </div>
            ` : ""}
          </div>
        </div>
      </div>

      <!-- OOTP Internal League Development & Statcast Telemetry (league_dev_*.txt) -->
      ${Array.isArray(ldev) && ldev.length ? `
      <div class="glass-card p-5">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
          <div>
            <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <i class="bi bi-activity text-emerald-400"></i> OOTP Internal League Development & Statcast Telemetry (<code>league_dev_*.txt</code>)
            </h3>
            <p class="text-xs text-slate-400">Ingested from ${ldev.map(d => `<code>${d.file_name}</code>`).join(", ")} — tracks annual ratings, Statcast EV/LA/xwOBA, financials, and AI team strategies</p>
          </div>
        </div>
        <div class="overflow-x-auto max-h-[380px]">
          <table class="saber-table">
            <thead>
              <tr>
                <th class="text-left">Source File</th>
                <th class="text-center">Year</th>
                <th class="text-right">Avg Contact / Power / Eye</th>
                <th class="text-right">Avg Stuff / Mov / Ctrl</th>
                <th class="text-right">Statcast EV / LA</th>
                <th class="text-right">xBA / xSLG / xwOBA</th>
                <th class="text-right">Hard-Hit / Barrel %</th>
                <th class="text-right">Avg Salary</th>
                <th class="text-left">AI Team Modes</th>
              </tr>
            </thead>
            <tbody>
              ${ldev.flatMap(f => (f.years || []).map(yr => ({...yr, file_name: f.file_name}))).reverse().map(yr => {
                const r = yr.ratings_avg || {};
                const sc = yr.statcast || {};
                const fin = yr.financials || {};
                const modes = Object.entries(yr.team_modes || {}).map(([k, v]) => `${k}: ${v}`).join(" • ");
                return `
                  <tr>
                    <td class="font-mono text-xs text-slate-300">${yr.file_name}</td>
                    <td class="text-center font-mono font-bold text-white">${yr.year}</td>
                    <td class="text-right font-mono text-xs text-sky-300">${r.contact || '-'} / ${r.power || '-'} / ${r.eye || '-'}</td>
                    <td class="text-right font-mono text-xs text-amber-300">${r.stuff || '-'} / ${r.movement || '-'} / ${r.control || '-'}</td>
                    <td class="text-right font-mono text-xs text-white">${sc.avg_ev ? `${sc.avg_ev} mph / ${sc.avg_la}°` : '-'}</td>
                    <td class="text-right font-mono text-xs text-emerald-300">${sc.xwoba ? `${fmtAvg(sc.xba)} / ${fmtAvg(sc.xslg)} / ${fmtAvg(sc.xwoba)}` : '-'}</td>
                    <td class="text-right font-mono text-xs text-pink-300">${sc.hard_hit_pct ? `${sc.hard_hit_pct}% / ${sc.barrel_pct}%` : '-'}</td>
                    <td class="text-right font-mono text-xs text-slate-200">${fin.salary ? '$' + Number(fin.salary).toLocaleString() : '-'}</td>
                    <td class="font-mono text-[11px] text-slate-400">${modes || '-'}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
      ` : ""}

      <!-- Save Universe State, JSON Configs, ID Changelogs & Text Logs -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div class="glass-card p-4 lg:col-span-7">
          <h3 class="text-sm font-extrabold uppercase tracking-wider text-white mb-2 flex items-center gap-2">
            <i class="bi bi-braces-asterisk text-amber-400"></i> Universe State & Automation JSON Configs (${Object.keys(jsonConfigs).length})
          </h3>
          <p class="text-xs text-slate-400 mb-3">Ingested from save root (e.g., <code>ashes_universe_state.json</code>, <code>ashes_automation_state.json</code>, <code>PABL_settings.json</code>)</p>
          ${Object.keys(jsonConfigs).length ? `
            <div class="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              ${Object.entries(jsonConfigs).map(([fn, data]) => `
                <div class="bg-slate-950/90 border border-slate-800 rounded-xl p-3">
                  <div class="font-mono text-xs font-extrabold text-amber-300 mb-1.5"><i class="bi bi-file-earmark-code mr-1"></i>${fn}</div>
                  <pre class="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-56 whitespace-pre-wrap">${JSON.stringify(data, null, 2)}</pre>
                </div>
              `).join("")}
            </div>
          ` : `<div class="text-xs text-slate-500 italic py-4">No custom JSON config files in this save's root folder.</div>`}
        </div>

        <div class="glass-card p-4 lg:col-span-5 space-y-4">
          <div>
            <h3 class="text-sm font-extrabold uppercase tracking-wider text-white mb-1 flex items-center gap-2">
              <i class="bi bi-file-earmark-text text-emerald-400"></i> Ingested Text Logs & Message Bodies
            </h3>
            <p class="text-xs text-slate-400 mb-2">
              Full message bodies linked from <code>messages/message_*.txt</code>: <b class="text-white font-mono">${Number(vault.message_txt_count || 0).toLocaleString()}</b> files
            </p>
            ${changelogs.length ? `
              <div class="mb-3">
                <div class="text-[11px] font-bold uppercase text-slate-300 mb-1">ID Changelogs (${changelogs.length})</div>
                ${changelogs.map(c => `
                  <div class="bg-slate-950/80 border border-slate-800 rounded-lg p-2 text-[11px] font-mono text-slate-300 mb-1.5">
                    <div class="font-bold text-white">${c.file} (${c.total_lines} lines)</div>
                    <div class="text-[10px] text-slate-400 truncate mt-0.5">${(c.entries || []).slice(0, 3).join(" • ")}</div>
                  </div>
                `).join("")}
              </div>
            ` : ""}
            <div class="text-[11px] font-bold uppercase text-slate-300 mb-1">News & Simulation Text Logs (${txtLogs.length})</div>
            <div class="space-y-1 max-h-48 overflow-y-auto pr-1">
              ${txtLogs.map(t => `
                <div class="flex justify-between items-center text-[11px] font-mono bg-slate-950/70 px-2.5 py-1.5 rounded border border-slate-800">
                  <span class="text-slate-200 truncate">${t.rel_path}</span>
                  <span class="text-slate-400 shrink-0">${(t.size_bytes / 1024).toFixed(1)} KB</span>
                </div>
              `).join("") || `<div class="text-xs text-slate-500 italic">No news/txt logs found.</div>`}
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (sub === "health") {
    const tp = health.talent_pool || {};
    const posSupply = tp.positional_supply || [];
    const ratingDist = tp.rating_distribution || [];
    const ageCurve = tp.age_curve || [];
    const faPool = tp.free_agent_pool || {};

    const fin = health.financial_impacts || {};
    const macro = fin.macro_ledger || {};
    const ineq = fin.inequality_metrics || {};
    const clubsFin = fin.club_financials || [];
    const expSim = fin.expansion_simulator || {};
    const simTiers = expSim.tiers || [];
    const selSimIdx = Math.min(simTiers.length - 1, Math.max(0, Number(wsState.simWindfallTierIndex || 0)));
    const activeSimTier = simTiers[selSimIdx] || {};

    const world = health.world_info || {};
    const uScale = world.universe_scale || {};
    const lRules = world.league_rules || {};
    const cMods = lRules.creation_modifiers || {};
    const natDist = world.player_nationalities || [];
    const birthStates = world.player_birth_states || [];
    const geo = world.geography || {};
    const teamTravel = geo.team_travel || [];

    subHtml = `
      <!-- SECTION 1: TALENT POOL, POSITIONAL DEPTH & REPLACEMENT SURPLUS -->
      <div class="glass-card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <i class="bi bi-people-fill text-sky-400"></i> Talent Pool Depth, Positional Supply Matrix & Prospect Pipeline
            </h3>
            <p class="text-xs text-slate-400">Audits active MLB-caliber regulars (45+ OVR), star concentration (60+ OVR), U-24 prospect supply, and unsigned free agent buffers across all 11 positions</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs font-mono">
            ${(tp.bottleneck_positions || []).length ? `
              <span class="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-400/40 font-bold">
                <i class="bi bi-exclamation-triangle-fill mr-1"></i>Bottlenecks: ${(tp.bottleneck_positions || []).join(", ")}
              </span>
            ` : `<span class="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-bold">✓ All Positions Above Bottleneck Threshold</span>`}
            ${(tp.surplus_positions || []).length ? `
              <span class="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                Surplus Depth: ${(tp.surplus_positions || []).join(", ")}
              </span>
            ` : ""}
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div class="lg:col-span-5 bg-slate-950/85 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div class="text-xs font-extrabold uppercase tracking-wider text-white mb-1">Positional Regulars/Club vs U-24 Prospect Pipeline</div>
              <p class="text-[11px] text-slate-400 mb-2">Bars show viable 45+ OVR regulars per club (emerald = surplus, sky = healthy, rose = bottleneck); amber line tracks U-24 prospects</p>
              <div class="h-64">
                <canvas id="evo-pos-supply-canvas"></canvas>
              </div>
            </div>
            <div class="mt-3 pt-2.5 border-t border-slate-800 grid grid-cols-3 gap-2 text-center font-mono text-[11px]">
              <div class="bg-slate-900 p-2 rounded-lg border border-slate-800">
                <div class="text-slate-400 text-[10px]">Unsigned FA Total</div>
                <div class="text-white font-black text-sm">${Number(faPool.total_unsigned || 0).toLocaleString()}</div>
              </div>
              <div class="bg-slate-900 p-2 rounded-lg border border-slate-800">
                <div class="text-slate-400 text-[10px]">Ready FA Regulars</div>
                <div class="text-emerald-300 font-black text-sm">${Number(faPool.ready_regulars_45plus || 0)}</div>
              </div>
              <div class="bg-slate-900 p-2 rounded-lg border border-slate-800">
                <div class="text-slate-400 text-[10px]">FA Replacement Buffer</div>
                <div class="text-sky-300 font-black text-sm">${Number(faPool.replacement_buffer_38plus || 0)}</div>
              </div>
            </div>
          </div>

          <div class="lg:col-span-7 overflow-x-auto">
            <table class="saber-table">
              <thead>
                <tr>
                  <th class="text-left">Pos</th>
                  <th class="text-right">Active</th>
                  <th class="text-right">Stars (60+)</th>
                  <th class="text-right">Regulars (45+)</th>
                  <th class="text-right">Regs / Club</th>
                  <th class="text-right">Target / Club</th>
                  <th class="text-right">U-24 Prospects</th>
                  <th class="text-right">Avg OVR</th>
                  <th class="text-left">Top Player</th>
                  <th class="text-center">Supply Status</th>
                </tr>
              </thead>
              <tbody>
                ${posSupply.map(p => {
                  const stCol = p.status === "Surplus" ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40" : (p.status === "Bottleneck" ? "bg-rose-500/20 text-rose-300 border-rose-400/40" : "bg-sky-500/20 text-sky-300 border-sky-400/40");
                  return `
                    <tr>
                      <td class="font-mono font-black text-white">${p.position} <span class="text-[10px] font-normal text-slate-400">${p.label}</span></td>
                      <td class="text-right font-mono">${p.total_active}</td>
                      <td class="text-right font-mono font-bold text-amber-300">${p.star_count}</td>
                      <td class="text-right font-mono font-bold text-white">${p.regular_count}</td>
                      <td class="text-right font-mono font-extrabold text-sky-300">${Number(p.regulars_per_team || 0).toFixed(2)}</td>
                      <td class="text-right font-mono text-slate-400">${Number(p.target_per_team || 1).toFixed(2)}</td>
                      <td class="text-right font-mono text-emerald-300 font-bold">${p.prospect_count}</td>
                      <td class="text-right font-mono">${Number(p.avg_oa || 0).toFixed(1)}</td>
                      <td class="text-xs text-slate-200 truncate max-w-[150px]">${p.top_player || '-'}</td>
                      <td class="text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${stCol}">${p.status} (${p.depth_ratio_pct}%)</span>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Rating Tier Pyramid + Age Curve + Top Unsigned Free Agents -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
            <h4 class="text-xs font-extrabold uppercase tracking-wider text-white mb-2 flex items-center gap-1.5">
              <i class="bi bi-bar-chart-steps text-amber-400"></i> Overall Rating Tier Pyramid (20–80 Scale)
            </h4>
            <div class="space-y-2">
              ${ratingDist.map(r => `
                <div>
                  <div class="flex justify-between text-[11px] font-mono mb-0.5">
                    <span class="text-slate-200 font-semibold">${r.tier}</span>
                    <span class="text-white font-bold">${r.count} <span class="text-slate-400">(${r.per_team}/tm • ${r.pct}%)</span></span>
                  </div>
                  <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-sky-400" style="width:${Math.min(100, Math.max(4, r.pct * 1.8))}%"></div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
            <h4 class="text-xs font-extrabold uppercase tracking-wider text-white mb-2 flex items-center gap-1.5">
              <i class="bi bi-hourglass-split text-emerald-400"></i> Active Roster Age Curve & Prime Window
            </h4>
            <div class="space-y-2">
              ${ageCurve.map(a => `
                <div>
                  <div class="flex justify-between text-[11px] font-mono mb-0.5">
                    <span class="text-slate-200 font-semibold">${a.bracket}</span>
                    <span class="text-white font-bold">${a.count} <span class="text-emerald-300">(${a.pct}%)</span></span>
                  </div>
                  <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full bg-emerald-400" style="width:${Math.min(100, Math.max(4, a.pct * 2.0))}%"></div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
            <h4 class="text-xs font-extrabold uppercase tracking-wider text-white mb-2 flex items-center gap-1.5">
              <i class="bi bi-person-plus-fill text-purple-400"></i> Top Unsigned Free Agents (Expansion Buffer)
            </h4>
            <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-[11px] font-mono">
              ${(faPool.top_free_agents || []).length ? (faPool.top_free_agents || []).map(f => `
                <div class="flex justify-between items-center bg-slate-900/90 px-2.5 py-1.5 rounded border border-slate-800">
                  <div>
                    <span class="font-bold text-white">${f.name}</span>
                    <span class="text-slate-400 ml-1">${f.pos} • Age ${f.age}</span>
                  </div>
                  <span class="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-400/40 font-bold">OVR ${f.oa} / POT ${f.pot}</span>
                </div>
              `).join("") : `<div class="text-xs text-slate-500 italic py-4">No unsigned free agents currently in pool.</div>`}
            </div>
          </div>
        </div>
      </div>

      <!-- SECTION 2: FINANCIAL IMPACTS, GINI INEQUALITY & EXPANSION WINDFALL SIMULATOR -->
      <div class="glass-card p-5 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <i class="bi bi-cash-coin text-emerald-400"></i> Financial Ecosystem, Payroll Inequality & Expansion Windfall Simulator
            </h3>
            <p class="text-xs text-slate-400">Evaluates macro league revenues, payroll-to-win% correlation, Gini coefficients, and simulated expansion fee distributions</p>
          </div>
          <span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono font-bold text-amber-300">
            ${ineq.parity_diagnosis || 'Balanced Financial Ecosystem'}
          </span>
        </div>

        <!-- Macro KPI Strip -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center font-mono">
          <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
            <div class="text-[10px] uppercase text-slate-400">Total League Revenue</div>
            <div class="text-lg font-black text-emerald-400 mt-0.5">$${(Number(macro.total_revenue || 0) / 1e6).toFixed(1)}M</div>
            <div class="text-[10px] text-slate-400">Avg $${(Number(macro.avg_revenue || 0) / 1e6).toFixed(1)}M/club</div>
          </div>
          <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
            <div class="text-[10px] uppercase text-slate-400">Total Player Payroll</div>
            <div class="text-lg font-black text-white mt-0.5">$${(Number(macro.total_payroll || 0) / 1e6).toFixed(1)}M</div>
            <div class="text-[10px] text-slate-400">Avg $${(Number(macro.avg_payroll || 0) / 1e6).toFixed(1)}M/club</div>
          </div>
          <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
            <div class="text-[10px] uppercase text-slate-400">Net Operating Profit</div>
            <div class="text-lg font-black ${Number(macro.total_operating_profit || 0) >= 0 ? 'text-emerald-300' : 'text-rose-400'} mt-0.5">$${(Number(macro.total_operating_profit || 0) / 1e6).toFixed(1)}M</div>
            <div class="text-[10px] text-slate-400">${macro.profitable_teams_count || 0} Profitable / ${macro.deficit_teams_count || 0} Deficit</div>
          </div>
          <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
            <div class="text-[10px] uppercase text-slate-400">Payroll Gini Index</div>
            <div class="text-lg font-black text-sky-300 mt-0.5">${Number(ineq.payroll_gini || 0).toFixed(3)}</div>
            <div class="text-[10px] text-slate-400">Budget Gini: ${Number(ineq.budget_gini || 0).toFixed(3)}</div>
          </div>
          <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
            <div class="text-[10px] uppercase text-slate-400">Top / Bottom Quartile</div>
            <div class="text-lg font-black text-amber-300 mt-0.5">${Number(ineq.top_bottom_quartile_payroll_ratio || 1).toFixed(2)}x</div>
            <div class="text-[10px] text-slate-400">Payroll Spend Ratio</div>
          </div>
          <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
            <div class="text-[10px] uppercase text-slate-400">Payroll → Win% Corr</div>
            <div class="text-lg font-black text-purple-300 mt-0.5">r = ${Number(ineq.payroll_to_win_corr || 0).toFixed(3)}</div>
            <div class="text-[10px] text-slate-400">Spend Efficiency Link</div>
          </div>
        </div>

        <!-- Interactive Expansion Economic Windfall & Salary Inflation Simulator -->
        ${simTiers.length ? `
          <div class="bg-slate-950/90 border border-slate-800 rounded-xl p-4">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h4 class="text-xs font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                  <i class="bi bi-calculator-fill"></i> Interactive Expansion Economic Windfall & Free Agent Inflation Simulator
                </h4>
                <p class="text-[11px] text-slate-400">Est. Franchise Entry Fee: <b class="text-white font-mono">$${(Number(expSim.estimated_fee_per_team || 0) / 1e6).toFixed(1)}M</b> per expansion club (1.25x average club valuation proxy)</p>
              </div>
              <div class="flex items-center gap-1.5">
                ${simTiers.map((t, idx) => `
                  <button onclick="AppState.evoWorkshop.simWindfallTierIndex=${idx}; renderEvolutionTab(document.getElementById('main-view-container'))"
                    class="px-3 py-1 rounded-lg text-xs font-mono font-extrabold transition ${idx === selSimIdx ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-700 hover:bg-slate-800'}">
                    +${t.added_teams} Teams (${t.new_total_teams}T)
                  </button>
                `).join("")}
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 font-mono text-xs">
              <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div class="text-[10px] text-slate-400">Total Expansion Fee Pool</div>
                <div class="text-base font-black text-emerald-400 mt-0.5">$${(Number(activeSimTier.total_expansion_fee_pool || 0) / 1e6).toFixed(1)}M</div>
                <div class="text-[10px] text-slate-400">Collected from +${activeSimTier.added_teams} owners</div>
              </div>
              <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div class="text-[10px] text-slate-400">Windfall / Existing Club</div>
                <div class="text-base font-black text-white mt-0.5">+$${(Number(activeSimTier.windfall_per_existing_club || 0) / 1e6).toFixed(2)}M</div>
                <div class="text-[10px] text-emerald-300">Immediate cash injection</div>
              </div>
              <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div class="text-[10px] text-slate-400">New Roster Spots Created</div>
                <div class="text-base font-black text-sky-300 mt-0.5">+${activeSimTier.new_active_roster_spots || 0} Active</div>
                <div class="text-[10px] text-slate-400">+${activeSimTier.new_reserve_spots || 0} Org/Reserve spots</div>
              </div>
              <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div class="text-[10px] text-slate-400">Projected National Media Pool</div>
                <div class="text-base font-black text-amber-300 mt-0.5">$${(Number(activeSimTier.projected_national_media_pool || 0) / 1e6).toFixed(1)}M</div>
                <div class="text-[10px] text-slate-400">Broadcast footprint uplift</div>
              </div>
              <div class="p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div class="text-[10px] text-slate-400">FA Salary Inflation Pressure</div>
                <div class="text-base font-black text-rose-300 mt-0.5">+${activeSimTier.projected_fa_inflation_pct || 0}%</div>
                <div class="text-[10px] text-slate-300 truncate">${activeSimTier.net_financial_verdict || ''}</div>
              </div>
            </div>
          </div>
        ` : ""}

        <!-- Club-by-Club Financial Health Ledger -->
        <div class="overflow-x-auto max-h-[420px]">
          <table class="saber-table">
            <thead>
              <tr>
                <th class="text-left">Club</th>
                <th class="text-center">W-L (Win%)</th>
                <th class="text-center">Mkt Size</th>
                <th class="text-center">Fan Int</th>
                <th class="text-right">Attendance</th>
                <th class="text-right">Payroll</th>
                <th class="text-right">Budget</th>
                <th class="text-right">Cap Used</th>
                <th class="text-right">Total Revenue</th>
                <th class="text-right">Operating Margin</th>
                <th class="text-right">$ / Win</th>
                <th class="text-center">Financial Health Tier</th>
              </tr>
            </thead>
            <tbody>
              ${clubsFin.map(c => {
                const hCol = c.health_tier.includes("Dynasty") || c.health_tier.includes("Contender")
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40"
                  : (c.health_tier.includes("Overachiever") ? "bg-sky-500/20 text-sky-300 border-sky-400/40" : (c.health_tier.includes("Distressed") || c.health_tier.includes("Strained") ? "bg-rose-500/20 text-rose-300 border-rose-400/40" : "bg-slate-800 text-slate-300 border-slate-700"));
                return `
                  <tr onclick="switchTeamAndGo(${c.team_id})" class="cursor-pointer">
                    <td class="font-bold text-white">${c.full_name} <span class="text-[10px] font-mono text-slate-400">(${c.abbr} • ${c.city}, ${c.state})</span></td>
                    <td class="text-center font-mono">${c.w}-${c.l} <span class="text-sky-300">(${fmtAvg(c.pct)})</span></td>
                    <td class="text-center font-mono font-bold text-amber-300">${c.market_size}/10</td>
                    <td class="text-center font-mono">${c.fan_interest}/100</td>
                    <td class="text-right font-mono">${Number(c.attendance || 0).toLocaleString()}</td>
                    <td class="text-right font-mono text-white font-bold">$${(Number(c.payroll || 0) / 1e6).toFixed(2)}M</td>
                    <td class="text-right font-mono text-slate-300">$${(Number(c.budget || 0) / 1e6).toFixed(2)}M</td>
                    <td class="text-right font-mono ${c.cap_utilization_pct > 95 ? 'text-rose-400 font-bold' : 'text-slate-300'}">${c.cap_utilization_pct}%</td>
                    <td class="text-right font-mono text-emerald-300">$${(Number(c.total_revenue || 0) / 1e6).toFixed(2)}M</td>
                    <td class="text-right font-mono font-bold ${c.operating_margin >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${c.operating_margin >= 0 ? '+' : ''}$${(Number(c.operating_margin || 0) / 1e6).toFixed(2)}M</td>
                    <td class="text-right font-mono text-xs text-slate-300">$${(Number(c.dollars_per_win || 0) / 1e6).toFixed(2)}M</td>
                    <td class="text-center">
                      <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${hCol}">${c.health_tier}</span>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- SECTION 3: WORLD INFORMATION, UNIVERSE RULES & GEOGRAPHIC FOOTPRINT TELEMETRY -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div class="glass-card p-5 lg:col-span-5 space-y-4">
          <div class="border-b border-slate-800 pb-2.5">
            <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <i class="bi bi-globe-americas text-amber-400"></i> World Scale, League Rules & Creation Modifiers
            </h3>
            <p class="text-xs text-slate-400">${uScale.world_mode || 'Standard Universe'} • ${Number(uScale.total_world_players || 0).toLocaleString()} Active Players • ${uScale.total_world_teams || 0} World Clubs</p>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-950/85 p-3 rounded-xl border border-slate-800">
            <div><span class="text-slate-400">Season Schedule:</span> <b class="text-white">${lRules.schedule_games_per_team || 162}G</b></div>
            <div><span class="text-slate-400">Active Roster:</span> <b class="text-white">${lRules.active_roster_limit || 26} (${lRules.expanded_roster_limit || 28} Exp)</b></div>
            <div><span class="text-slate-400">DH Rule:</span> <b class="text-sky-300">${lRules.dh_rule || 'Universal DH'}</b></div>
            <div><span class="text-slate-400">Salary Cap:</span> <b class="text-emerald-300">${lRules.salary_cap ? '$' + Number(lRules.salary_cap).toLocaleString() : 'No Hard Cap'}</b></div>
            <div><span class="text-slate-400">Luxury Tax:</span> <b class="text-amber-300">${lRules.luxury_tax || 'Disabled'}</b></div>
            <div><span class="text-slate-400">Revenue Sharing:</span> <b class="text-white">${lRules.revenue_sharing || 'Enabled'}</b></div>
            <div><span class="text-slate-400">Amateur Draft:</span> <b class="text-white">${lRules.amateur_draft_rounds || 'Disabled'} Rds</b></div>
            <div><span class="text-slate-400">Rule 5 / Trading:</span> <b class="text-white">${lRules.rule_5_draft ? 'Rule 5 On' : 'No Rule 5'} / ${lRules.trading_enabled ? 'Trades On' : 'No Trades'}</b></div>
          </div>

          <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
            <div class="text-[10px] font-mono uppercase text-slate-400 mb-1.5">OOTP Player Creation & Environment Modifiers</div>
            <div class="grid grid-cols-3 gap-2 text-center font-mono text-xs">
              <div class="bg-slate-900 p-1.5 rounded border border-slate-800"><span class="text-slate-400 text-[10px] block">Contact</span><b class="text-white">${Number(cMods.contact || 1).toFixed(3)}</b></div>
              <div class="bg-slate-900 p-1.5 rounded border border-slate-800"><span class="text-slate-400 text-[10px] block">Power</span><b class="text-white">${Number(cMods.power || 1).toFixed(3)}</b></div>
              <div class="bg-slate-900 p-1.5 rounded border border-slate-800"><span class="text-slate-400 text-[10px] block">Eye/BB</span><b class="text-white">${Number(cMods.eye || 1).toFixed(3)}</b></div>
              <div class="bg-slate-900 p-1.5 rounded border border-slate-800"><span class="text-slate-400 text-[10px] block">Pitch Stuff</span><b class="text-amber-300">${Number(cMods.stuff || 1).toFixed(3)}</b></div>
              <div class="bg-slate-900 p-1.5 rounded border border-slate-800"><span class="text-slate-400 text-[10px] block">Movement</span><b class="text-amber-300">${Number(cMods.movement || 1).toFixed(3)}</b></div>
              <div class="bg-slate-900 p-1.5 rounded border border-slate-800"><span class="text-slate-400 text-[10px] block">Control</span><b class="text-amber-300">${Number(cMods.control || 1).toFixed(3)}</b></div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
              <div class="text-[10px] font-mono uppercase text-slate-400 mb-1.5">Player Nationalities</div>
              <div class="space-y-1 max-h-36 overflow-y-auto pr-1 text-[11px] font-mono">
                ${natDist.slice(0, 8).map(n => `
                  <div class="flex justify-between">
                    <span class="text-slate-200 truncate">${n.nation} <span class="text-slate-500">(${n.abbr})</span></span>
                    <span class="font-bold text-white">${n.count} (${n.pct}%)</span>
                  </div>
                `).join("")}
              </div>
            </div>
            <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
              <div class="text-[10px] font-mono uppercase text-slate-400 mb-1.5">Top Player Birth States</div>
              <div class="space-y-1 max-h-36 overflow-y-auto pr-1 text-[11px] font-mono">
                ${birthStates.slice(0, 8).map(s => `
                  <div class="flex justify-between">
                    <span class="text-slate-200 truncate">${s.state} <span class="text-slate-500">(${s.abbr})</span></span>
                    <span class="font-bold text-sky-300">${s.count} (${s.pct}%)</span>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        </div>

        <div class="glass-card p-5 lg:col-span-7 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div>
              <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <i class="bi bi-Airplane-fill text-sky-400"></i> Geographic Footprint, Centroid & Club Travel Telemetry
              </h3>
              <p class="text-xs text-slate-400">
                ${geo.footprint_type || 'Regional Footprint'} • Centroid: ${(geo.centroid && geo.centroid.lat) || 0}°N, ${Math.abs((geo.centroid && geo.centroid.lon) || 0)}°W • Span: ${geo.ns_span_miles || 0} mi N-S × ${geo.ew_span_miles || 0} mi E-W
              </p>
            </div>
            <span class="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-400/40 text-xs font-mono font-bold">
              Avg Div Travel: ${geo.avg_division_distance_mi || 0} mi
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
              <div class="text-[10px] uppercase text-emerald-400">Closest Natural Rivalry Pair</div>
              <div class="text-sm font-black text-white mt-0.5">${(geo.closest_rivalry && geo.closest_rivalry.pair) || '-'}</div>
              <div class="text-[11px] text-slate-400">Distance: <b class="text-emerald-300">${(geo.closest_rivalry && geo.closest_rivalry.miles) || 0} miles</b></div>
            </div>
            <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
              <div class="text-[10px] uppercase text-rose-400">Longest Cross-League Trip</div>
              <div class="text-sm font-black text-white mt-0.5">${(geo.longest_trip && geo.longest_trip.pair) || '-'}</div>
              <div class="text-[11px] text-slate-400">Distance: <b class="text-rose-300">${(geo.longest_trip && geo.longest_trip.miles) || 0} miles</b></div>
            </div>
          </div>

          <div class="overflow-x-auto max-h-[340px]">
            <table class="saber-table">
              <thead>
                <tr>
                  <th class="text-left">Club</th>
                  <th class="text-left">City, State & Ballpark</th>
                  <th class="text-left">Division</th>
                  <th class="text-right">Avg Div Travel</th>
                  <th class="text-right">Avg League Travel</th>
                  <th class="text-left">Nearest Rival</th>
                </tr>
              </thead>
              <tbody>
                ${teamTravel.map(t => `
                  <tr onclick="switchTeamAndGo(${t.team_id})" class="cursor-pointer">
                    <td class="font-bold text-white">${t.full_name} <span class="text-[10px] font-mono text-slate-400">(${t.abbr})</span></td>
                    <td class="text-xs text-slate-300">${t.city}, ${t.state} • <span class="text-slate-400">${t.park_name} (${Number(t.park_capacity || 0).toLocaleString()})</span></td>
                    <td class="text-xs font-mono text-amber-300">${t.division_name}</td>
                    <td class="text-right font-mono font-bold text-sky-300">${t.avg_div_miles} mi</td>
                    <td class="text-right font-mono text-slate-300">${t.avg_league_miles} mi</td>
                    <td class="font-mono text-xs text-emerald-300">${t.nearest_rival_abbr} (${t.nearest_rival_miles} mi)</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } else if (sub === "workshop") {
    const configuredMarkets = computeConfiguredCandidateMarkets(evo);
    const allCands = evo.candidate_markets || [];
    const activeTeams = (evo.workshop && evo.workshop.active_team_nodes) || [];
    const bps = evo.structural_blueprints || (rd && rd.structural_blueprints) || [];
    const selectedSet = new Set((wsState.selectedMarketIds || []).map(Number));
    const selCands = wsState.selectedMarketIds.map(id => allCands.find(m => Number(m.city_id) === Number(id))).filter(Boolean);

    // Live Simulated Impact Calculations for Selected Expansion Class
    const curTeams = Math.max(1, activeTeams.length || Number(rd.current_teams || 20));
    const addedCount = selCands.length;
    const newTotalTeams = curTeams + addedCount;
    const newActiveSpots = addedCount * 26;
    const newOrgSpots = addedCount * 70;
    const avgRivalMiles = selCands.length
      ? Math.round(selCands.reduce((s, m) => s + Number(m.nearest_team_miles || 0), 0) / selCands.length)
      : 0;
    const avgExpScore = selCands.length
      ? Math.round(selCands.reduce((s, m) => s + Number(m.market_score || 80), 0) / selCands.length)
      : 0;
    const estFeePerClub = Number((health.financial_impacts && health.financial_impacts.expansion_simulator && health.financial_impacts.expansion_simulator.estimated_fee_per_team) || 25000000);
    const windfallPerExisting = Math.round((estFeePerClub * addedCount) / curTeams);

    // Auto-cluster combined clubs (Active + Selected Expansion) into balanced geographic pods
    const combinedNodes = [
      ...activeTeams.map(t => ({ ...t, is_expansion: false })),
      ...selCands.map(c => {
        const cust = wsState.customIdentities[c.city_id] || {};
        const nick = cust.nickname || c.suggested_nickname || "Royals";
        const abbr = (cust.abbr || c.suggested_abbr || c.city.slice(0, 3)).toUpperCase();
        return {
          team_id: -Number(c.city_id),
          abbr,
          full_name: `${c.city} ${nick}`,
          city: c.city,
          state: c.state,
          lat: c.lat,
          lon: c.lon,
          is_expansion: true,
        };
      }),
    ];
    combinedNodes.sort((a, b) => (Number(a.lon || -75) * 0.7 - Number(a.lat || 40) * 0.3) - (Number(b.lon || -75) * 0.7 - Number(b.lat || 40) * 0.3));
    const numPods = newTotalTeams % 4 === 0 ? 4 : (newTotalTeams % 3 === 0 ? 3 : 4);
    const perPod = Math.max(1, Math.ceil(combinedNodes.length / numPods));
    const podLabels = ["West / Frontier Pod", "Central / Heartland Pod", "Mid-Atlantic / Metro Pod", "East / Coastal Pod"];
    const simulatedPods = [];
    for (let i = 0; i < numPods; i++) {
      const chunk = combinedNodes.slice(i * perPod, (i + 1) * perPod);
      if (chunk.length) {
        simulatedPods.push({
          division_name: podLabels[i] || `Division ${i + 1}`,
          teams: chunk,
        });
      }
    }

    subHtml = `
      <!-- Workshop Top Studio Header -->
      <div class="glass-card p-5 border-l-4 border-l-sky-400">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2 mb-1">
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold uppercase bg-sky-500/20 text-sky-300 border border-sky-400/50">
                <i class="bi bi-compass-fill mr-1"></i> Interactive Expansion & Roadmap Studio
              </span>
              <span id="ws-save-status-badge" class="text-xs font-mono text-slate-400">
                ${wsState.lastSavedAt ? `<i class="bi bi-check-circle-fill text-emerald-400 mr-1"></i>Saved (${wsState.lastSavedAt})` : 'Unsaved Studio Draft'}
              </span>
            </div>
            <h2 class="text-xl font-black text-white">League / Association Expansion Map, Realignment Simulator & Multi-Year Roadmap</h2>
            <p class="text-xs text-slate-300">Click candidate pins directly on the map or in the quick-picker to model expansion waves, customize club identities from Real-Life MLB/MiLB counterparts, and persist your multi-year roadmap.</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button onclick="syncWorkshopPhasesWithSelectedCities()" class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/40 text-xs font-extrabold transition flex items-center gap-1.5">
              <i class="bi bi-arrow-repeat"></i> Sync Phases with Selected Cities
            </button>
            <button onclick="saveEvolutionRoadmapToServer()" class="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition flex items-center gap-1.5 shadow-lg">
              <i class="bi bi-cloud-check-fill"></i> Save Roadmap to SQLite
            </button>
            <button onclick="exportEvolutionRoadmapBrief()" class="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold transition flex items-center gap-1.5">
              <i class="bi bi-download"></i> Export Brief (.md)
            </button>
          </div>
        </div>
      </div>

      <!-- Ultrawide 3-Column Studio: Interactive Map (5) + Selected Expansion Class Customizer (3) + Persistent Multi-Year Roadmap Builder (4) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <!-- Column 1: Interactive SVG Expansion & Realignment Map -->
        <div class="glass-card p-4 lg:col-span-7 uw:col-span-5 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div>
              <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <i class="bi bi-pin-map-fill text-emerald-400"></i> Ideal Expansion & Division Realignment Map
              </h3>
              <p class="text-[11px] text-slate-400">Click any candidate pin on the map to toggle selection; dashed green vectors show rivalry distance to nearest active club</p>
            </div>
            <div class="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
              ${[
                ["auto", "Auto Fit"],
                ["footprint", "Active Footprint"],
                ["continental", "Wide / Continental"],
              ].map(([zm, zlabel]) => `
                <button onclick="AppState.evoWorkshop.mapZoomMode='${zm}'; renderEvolutionTab(document.getElementById('main-view-container'))"
                  class="px-2 py-1 rounded border transition ${wsState.mapZoomMode === zm ? 'bg-sky-500 text-slate-950 font-bold border-sky-300' : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'}">
                  ${zlabel}
                </button>
              `).join("")}
              <button onclick="AppState.evoWorkshop.showDivisionLines=!AppState.evoWorkshop.showDivisionLines; renderEvolutionTab(document.getElementById('main-view-container'))"
                class="px-2 py-1 rounded border transition ${wsState.showDivisionLines ? 'bg-amber-500/20 text-amber-300 border-amber-400/50' : 'bg-slate-900 text-slate-400 border-slate-800'}">
                Div Lines
              </button>
            </div>
          </div>

          <div id="evo-workshop-map-svg"></div>

          <!-- Quick Candidate Pin Picker Strip -->
          <div class="bg-slate-950/85 p-3 rounded-xl border border-slate-800">
            <div class="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400 mb-2">
              <span>Top Recommended Expansion Cities (Click to Toggle on Map)</span>
              <span>${selCands.length} Cities Selected</span>
            </div>
            <div class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
              ${configuredMarkets.slice(0, 20).map(m => {
                const isSel = selectedSet.has(Number(m.city_id));
                return `
                  <button onclick="toggleWorkshopExpansionCity(${m.city_id})"
                    class="px-2 py-1 rounded-lg text-[11px] font-mono transition flex items-center gap-1 border ${isSel ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400 font-extrabold' : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'}">
                    <span>${isSel ? '✓' : '+'} ${m.city}, ${m.state}</span>
                    <span class="text-[9.5px] opacity-80">(${m.computed_score})</span>
                  </button>
                `;
              }).join("")}
            </div>
          </div>
        </div>

        <!-- Column 2: Selected Expansion Class Customizer + Live Impact Preview -->
        <div class="glass-card p-4 lg:col-span-5 uw:col-span-3 flex flex-col justify-between space-y-4">
          <div>
            <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
              <div>
                <h3 class="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                  <i class="bi bi-stars text-amber-400"></i> Selected Expansion Class (${selCands.length} Clubs)
                </h3>
                <p class="text-[11px] text-slate-400">Customize franchise nickname, abbreviation & ballpark (pre-filled from Real-Life MLB/MiLB counterparts)</p>
              </div>
              ${selCands.length ? `
                <button onclick="AppState.evoWorkshop.selectedMarketIds=[]; renderEvolutionTab(document.getElementById('main-view-container'))" class="text-[10px] font-mono text-rose-400 hover:underline">
                  Clear All
                </button>
              ` : ""}
            </div>

            <div class="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              ${selCands.length ? selCands.map(m => {
                const cust = wsState.customIdentities[m.city_id] || {};
                const nick = cust.nickname !== undefined ? cust.nickname : m.suggested_nickname;
                const abbr = cust.abbr !== undefined ? cust.abbr : m.suggested_abbr;
                const park = cust.park !== undefined ? cust.park : m.suggested_park;
                const badgeCls = irlBadgeStyle(m.irl_primary_level);
                return `
                  <div class="p-3 rounded-xl bg-slate-950/90 border border-emerald-500/35 space-y-2">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <div class="text-sm font-black text-white">${m.city}, ${m.state} <span class="text-xs font-mono text-emerald-400 ml-1">Score ${m.market_score}</span></div>
                        <span class="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold border ${badgeCls}">
                          ⚾ ${m.irl_summary_badge}
                        </span>
                      </div>
                      <button onclick="toggleWorkshopExpansionCity(${m.city_id})" class="text-xs text-slate-400 hover:text-rose-400 font-mono">✕ Remove</button>
                    </div>
                    <div class="grid grid-cols-12 gap-2 text-xs font-mono">
                      <div class="col-span-5">
                        <label class="text-[9.5px] text-slate-400 block">Nickname</label>
                        <input type="text" value="${nick}" oninput="updateWorkshopCustomIdentity(${m.city_id}, 'nickname', this.value)"
                          class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs" />
                      </div>
                      <div class="col-span-2">
                        <label class="text-[9.5px] text-slate-400 block">Abbr</label>
                        <input type="text" maxlength="4" value="${abbr}" oninput="updateWorkshopCustomIdentity(${m.city_id}, 'abbr', this.value)"
                          class="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-white text-xs uppercase" />
                      </div>
                      <div class="col-span-5">
                        <label class="text-[9.5px] text-slate-400 block">Ballpark</label>
                        <input type="text" value="${park}" oninput="updateWorkshopCustomIdentity(${m.city_id}, 'park', this.value)"
                          class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs" />
                      </div>
                    </div>
                    <div class="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>Nearest Rival: <b class="text-white">${m.nearest_team_abbr} (${m.nearest_team_miles} mi)</b></span>
                      <span>Est. Budget: <b class="text-emerald-300">$${(Number(m.projected_budget || 0) / 1e6).toFixed(1)}M</b> (Mkt ${m.projected_market_size}/10)</span>
                    </div>
                  </div>
                `;
              }).join("") : `
                <div class="p-6 text-center rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400">
                  No expansion cities currently selected. Click any pin on the map or choose a blueprint to model expansion.
                </div>
              `}
            </div>
          </div>

          <!-- Live Simulated Expansion Impact Box -->
          <div class="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div class="text-xs font-extrabold uppercase tracking-wider text-sky-300 flex items-center justify-between">
              <span><i class="bi bi-lightning-charge-fill mr-1"></i>Live Simulated Impact Preview</span>
              <span class="font-mono text-white">${curTeams} → ${newTotalTeams} Teams</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs font-mono">
              <div class="bg-slate-900 p-2 rounded border border-slate-800">
                <span class="text-[10px] text-slate-400 block">New Roster Spots</span>
                <b class="text-white">+${newActiveSpots} MLB / +${newOrgSpots} Org</b>
              </div>
              <div class="bg-slate-900 p-2 rounded border border-slate-800">
                <span class="text-[10px] text-slate-400 block">Avg Rivalry Spacing</span>
                <b class="text-emerald-300">${avgRivalMiles} mi (${avgExpScore} Avg Score)</b>
              </div>
              <div class="bg-slate-900 p-2 rounded border border-slate-800">
                <span class="text-[10px] text-slate-400 block">Windfall / Existing Club</span>
                <b class="text-amber-300">+$${(windfallPerExisting / 1e6).toFixed(2)}M</b>
              </div>
              <div class="bg-slate-900 p-2 rounded border border-slate-800">
                <span class="text-[10px] text-slate-400 block">Projected OVR Dilution</span>
                <b class="${addedCount <= 2 ? 'text-emerald-300' : 'text-amber-300'}">${addedCount === 0 ? '0.0 OVR' : `-${(addedCount * 0.42).toFixed(1)} OVR`}</b>
              </div>
            </div>
            <div class="space-y-1 pt-1">
              <div class="text-[10px] font-mono uppercase text-slate-400">Simulated Geographic Pods (${simulatedPods.length} Pods):</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                ${simulatedPods.map(p => `
                  <div class="p-1.5 rounded bg-slate-900/90 border border-slate-800 text-[10px] font-mono">
                    <div class="font-bold text-slate-200 mb-0.5">${p.division_name} (${p.teams.length}T)</div>
                    <div class="flex flex-wrap gap-1">
                      ${p.teams.map(t => `<span class="px-1 rounded ${t.is_expansion ? 'bg-emerald-500/30 text-emerald-300 font-bold border border-emerald-400/50' : 'bg-slate-800 text-slate-300'}">${t.is_expansion ? '+' : ''}${t.abbr}</span>`).join("")}
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        </div>

        <!-- Column 3: Persistent Multi-Year Roadmap Builder (Goals, KPIs & Phased Timeline) -->
        <div class="glass-card p-4 lg:col-span-12 uw:col-span-4 space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pb-3 border-b border-slate-800">
            <div class="sm:col-span-12">
              <label class="block text-[10px] font-mono uppercase text-slate-400 mb-1">Roadmap Title</label>
              <input id="ws-roadmap-title-input" type="text" value="${wsState.roadmapTitle}"
                oninput="AppState.evoWorkshop.roadmapTitle = this.value"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-white" />
            </div>
            <div class="sm:col-span-8">
              <label class="block text-[10px] font-mono uppercase text-slate-400 mb-1">Target Structural Architecture</label>
              <input id="ws-roadmap-arch-input" type="text" value="${wsState.targetArchitecture}"
                oninput="AppState.evoWorkshop.targetArchitecture = this.value"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-sky-300" />
            </div>
            <div class="sm:col-span-4">
              <label class="block text-[10px] font-mono uppercase text-slate-400 mb-1">Horizon</label>
              <select id="ws-roadmap-horizon-select" onchange="AppState.evoWorkshop.horizonYears = Number(this.value)"
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-white">
                <option value="3" ${wsState.horizonYears === 3 ? 'selected' : ''}>3-Year Plan</option>
                <option value="5" ${wsState.horizonYears === 5 ? 'selected' : ''}>5-Year Plan</option>
                <option value="10" ${wsState.horizonYears === 10 ? 'selected' : ''}>10-Year Plan</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 uw:grid-cols-1 gap-4">
            <!-- Strategic Goals & KPIs -->
            <div class="lg:col-span-6 uw:col-span-1 space-y-2">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <i class="bi bi-check2-square text-emerald-400"></i> Strategic Goals & KPIs
                </h4>
                <button onclick="addWorkshopGoal()" class="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-mono font-bold text-emerald-300 border border-slate-700">
                  + Add Goal
                </button>
              </div>
              <div class="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                ${(wsState.goals || []).map((g, idx) => {
                  const stCol = g.status === "Completed" ? "bg-emerald-500/25 text-emerald-300 border-emerald-400/50" : (g.status === "Ready" ? "bg-sky-500/25 text-sky-300 border-sky-400/50" : (g.status === "In Progress" ? "bg-amber-500/25 text-amber-300 border-amber-400/50" : "bg-slate-800 text-slate-300 border-slate-700"));
                  return `
                    <div class="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5">
                      <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-1.5">
                          <button onclick="cycleWorkshopGoalStatus(${idx})" class="px-2 py-0.5 rounded text-[10px] font-mono font-extrabold border ${stCol}" title="Click to cycle status">
                            ${g.status}
                          </button>
                          <input type="text" value="${g.category}" oninput="AppState.evoWorkshop.goals[${idx}].category = this.value"
                            class="bg-transparent border-b border-slate-800 text-[10px] font-mono text-amber-300 w-28 focus:outline-none" />
                        </div>
                        <div class="flex items-center gap-1.5">
                          <span class="text-[10px] font-mono text-slate-400">Yr:</span>
                          <input type="number" value="${g.target_year}" oninput="AppState.evoWorkshop.goals[${idx}].target_year = Number(this.value)"
                            class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono text-white w-14" />
                          <button onclick="removeWorkshopGoal(${idx})" class="text-slate-500 hover:text-rose-400 text-xs">✕</button>
                        </div>
                      </div>
                      <input type="text" value="${g.title}" oninput="AppState.evoWorkshop.goals[${idx}].title = this.value"
                        class="w-full bg-slate-900/80 border border-slate-800 rounded px-2 py-1 text-xs font-bold text-white" />
                      <div class="flex items-center gap-2 text-[10px] font-mono">
                        <span class="text-slate-400 shrink-0">KPI:</span>
                        <input type="text" value="${g.target_metric}" oninput="AppState.evoWorkshop.goals[${idx}].target_metric = this.value"
                          class="w-full bg-transparent border-b border-slate-800 text-emerald-300 focus:outline-none" />
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>

            <!-- Multi-Phase Execution Timeline -->
            <div class="lg:col-span-6 uw:col-span-1 space-y-2">
              <h4 class="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-1.5">
                <i class="bi bi-calendar-range-fill text-sky-400"></i> Phased Execution Timeline
              </h4>
              <div class="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                ${(wsState.phases || []).map((p, idx) => `
                  <div class="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-mono text-[11px] font-black text-sky-300">${p.phase}</span>
                      <div class="flex items-center gap-1 text-[10px] font-mono">
                        <span class="text-slate-400">Yr:</span>
                        <input type="number" value="${p.year}" oninput="AppState.evoWorkshop.phases[${idx}].year = Number(this.value)"
                          class="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white font-bold w-16" />
                      </div>
                    </div>
                    <input type="text" value="${p.headline}" oninput="AppState.evoWorkshop.phases[${idx}].headline = this.value"
                      class="w-full bg-slate-900/90 border border-slate-800 rounded px-2 py-1 text-xs font-extrabold text-amber-300" />
                    <textarea rows="2" oninput="AppState.evoWorkshop.phases[${idx}].actions = this.value"
                      class="w-full bg-slate-900/60 border border-slate-800 rounded p-1.5 text-[11px] text-slate-200 leading-relaxed">${p.actions}</textarea>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="animate-view space-y-5">
      <!-- Evolution Sub-Navigation Bar -->
      <div class="glass-card p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2">
          ${[
            ["readiness", "bi-compass-fill", "Readiness, Blueprints & Target Recommender"],
            ["health", "bi-heart-pulse-fill", "League/Association Health, Financials & World"],
            ["workshop", "bi-map-fill", `Expansion & Roadmap Workshop (${(wsState.selectedMarketIds || []).length})`],
            ["history", "bi-clock-history", "League History, Champions & Era Analysis"],
            ["vault", "bi-archive-fill", "Dumps, Almanacs & Telemetry Vault"],
          ].map(([key, ic, label]) => `
            <button onclick="AppState.evolutionSubTab='${key}'; renderEvolutionTab(document.getElementById('main-view-container'))" class="px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 ${sub === key ? 'bg-sky-500 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'}">
              <i class="bi ${ic}"></i> ${label}
            </button>
          `).join("")}
        </div>
        <div class="text-xs font-mono text-slate-400">
          Active Dump: <b class="text-white">${vault.active_csv_source || 'Latest'}</b>
        </div>
      </div>

      ${subHtml}
    </div>
  `;

  if (sub === "history" && hist.year_by_year && hist.year_by_year.length) {
    renderLeagueEvolutionChart("league-evolution-chart-canvas", hist.year_by_year);
  } else if (sub === "health" && health.talent_pool && health.talent_pool.positional_supply) {
    renderPositionalSupplyChart("evo-pos-supply-canvas", health.talent_pool.positional_supply);
  } else if (sub === "workshop") {
    const activeTeams = (evo.workshop && evo.workshop.active_team_nodes) || [];
    const cands = computeConfiguredCandidateMarkets(evo);
    renderExpansionWorkshopMapSVG("evo-workshop-map-svg", {
      activeTeams,
      candidates: cands,
      selectedMarketIds: wsState.selectedMarketIds,
      customIdentities: wsState.customIdentities,
      zoomMode: wsState.mapZoomMode,
      showDivisionLines: wsState.showDivisionLines,
      showCandidatePins: wsState.showCandidatePins,
    });
  }
}

/* ============================================================================
 * 6. STATSPLUS SUITE & ONLINE LEAGUE HUB
 * ============================================================================ */
function buildStatsPlusDevCardHtml(sp) {
  return `
    <div class="glass-card overflow-hidden">
      <div class="px-4 py-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h3 class="font-extrabold text-sm uppercase text-white"><i class="bi bi-arrow-up-right-circle-fill text-emerald-400 mr-1.5"></i> StatsPlus Player Development & Scouting Bumps/Drops</h3>
          <p class="text-xs text-slate-400">${sp.has_multi_snapshots ? 'Comparing multi-year historical dump snapshots in SQLite' : 'Showing Current vs. True Talent Development Ceiling'}</p>
        </div>
      </div>
      <div class="overflow-x-auto max-h-[680px]">
        <table class="saber-table">
          <thead>
            <tr>
              <th class="text-left">Player</th>
              <th>Team</th>
              <th>Pos</th>
              <th>Age</th>
              <th>OVR / POT</th>
              <th>Tracking Window</th>
              <th class="text-left">Rating Bumps & Lumps Breakdown</th>
              <th class="text-right">Net Rating Delta</th>
            </tr>
          </thead>
          <tbody>
            ${(sp.development || []).map(d => `
              <tr onclick="openPlayerModal(${d.player_id})" class="cursor-pointer">
                <td class="font-bold text-white hover:text-sky-400">${d.name}</td>
                <td class="text-center font-mono text-xs">${d.team_abbr}</td>
                <td class="text-center font-mono text-xs text-sky-300">${d.position}</td>
                <td class="text-center font-mono">${d.age}</td>
                <td class="text-center">${rtgBadge(d.oa, d.pot)}</td>
                <td class="text-center font-mono text-xs text-slate-400">${d.period}</td>
                <td>
                  <div class="flex flex-wrap gap-1.5">
                    ${d.changes.map(c => `
                      <span class="px-2 py-0.5 rounded text-xs font-mono font-bold ${c.delta > 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'}">
                        ${c.attr} ${c.delta > 0 ? '+' : ''}${c.delta}
                      </span>
                    `).join("")}
                  </div>
                </td>
                <td class="text-right font-mono font-extrabold ${d.net_change >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${d.net_change > 0 ? '+' : ''}${d.net_change}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function buildStatsPlusProspectsCardHtml(sp) {
  return `
    <div class="glass-card overflow-hidden">
      <div class="px-4 py-3 bg-slate-900 border-b border-slate-800">
        <h3 class="font-extrabold text-sm uppercase text-white"><i class="bi bi-stars text-amber-400 mr-1.5"></i> StatsPlus Top 100 Prospects & U-25 Talent Pipeline</h3>
      </div>
      <div class="overflow-x-auto max-h-[680px]">
        <table class="saber-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th class="text-left">Prospect</th>
              <th>Organization</th>
              <th>Pos</th>
              <th>Age</th>
              <th>B/T</th>
              <th>Current OVR</th>
              <th>Potential Ceiling</th>
              <th class="text-right">Current Value</th>
              <th class="text-right">True Talent Value</th>
            </tr>
          </thead>
          <tbody>
            ${(sp.prospects || []).map(p => `
              <tr onclick="openPlayerModal(${p.player_id})" class="cursor-pointer">
                <td class="text-center font-mono font-bold text-amber-400">#${p.rank}</td>
                <td class="font-bold text-white hover:text-sky-400">${p.name}</td>
                <td class="text-center font-mono text-xs">${p.team_abbr} — ${p.team_name}</td>
                <td class="text-center font-mono text-xs text-sky-300">${p.position}</td>
                <td class="text-center font-mono">${p.age}</td>
                <td class="text-center font-mono">${p.bats}/${p.throws}</td>
                <td class="text-center">${rtgBadge(p.oa)}</td>
                <td class="text-center">${rtgBadge(p.pot)}</td>
                <td class="text-right font-mono">${p.overall_value}</td>
                <td class="text-right font-mono font-extrabold text-emerald-400">${p.talent_value}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function buildStatsPlusContractsCardHtml(sp) {
  return `
    <div class="glass-card overflow-hidden">
      <div class="px-4 py-3 bg-slate-900 border-b border-slate-800">
        <h3 class="font-extrabold text-sm uppercase text-white"><i class="bi bi-cash-coin text-emerald-400 mr-1.5"></i> StatsPlus Multi-Year Contract Matrix & $/WAR Surplus Valuation</h3>
      </div>
      <div class="overflow-x-auto max-h-[680px]">
        <table class="saber-table">
          <thead>
            <tr>
              <th class="text-left">Player</th>
              <th>Team</th>
              <th>Pos</th>
              <th>Age</th>
              <th>Yrs</th>
              <th class="text-right">Year 1 Salary</th>
              <th class="text-right">Year 2</th>
              <th class="text-right">Year 3</th>
              <th class="text-right">Year 4</th>
              <th class="text-right">Year 5</th>
              <th>Clauses</th>
              <th class="text-right">Season WAR</th>
              <th class="text-right">Surplus Value ($8.5M/WAR)</th>
            </tr>
          </thead>
          <tbody>
            ${(sp.contracts || []).map(c => `
              <tr onclick="openPlayerModal(${c.player_id})" class="cursor-pointer">
                <td class="font-bold text-white hover:text-sky-400">${c.name}</td>
                <td class="text-center font-mono text-xs">${c.team_abbr}</td>
                <td class="text-center font-mono text-xs text-sky-300">${c.position}</td>
                <td class="text-center font-mono">${c.age}</td>
                <td class="text-center font-mono font-bold">${c.years}</td>
                <td class="text-right font-mono font-bold text-white">${fmtMoney(c.salary0)}</td>
                <td class="text-right font-mono text-slate-300">${fmtMoney(c.salary1)}</td>
                <td class="text-right font-mono text-slate-300">${fmtMoney(c.salary2)}</td>
                <td class="text-right font-mono text-slate-400">${fmtMoney(c.salary3)}</td>
                <td class="text-right font-mono text-slate-400">${fmtMoney(c.salary4)}</td>
                <td class="text-center text-xs">
                  ${c.no_trade ? `<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">NTC</span>` : ""}
                  ${c.team_option ? `<span class="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">TO</span>` : ""}
                  ${c.player_option ? `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">PO</span>` : ""}
                </td>
                <td class="text-right font-mono font-bold text-sky-400">${c.war.toFixed(2)}</td>
                <td class="text-right font-mono font-extrabold ${c.surplus_value >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${fmtMoney(c.surplus_value)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderStatsPlusTab(container) {
  showLoading("Loading StatsPlus Development, Prospects, Contracts & Trade Machine...");
  try {
    if (!AppState.statsplus) {
      AppState.statsplus = await fetchJSON(`/api/statsplus?save=${AppState.activeSave}&league_id=${AppState.activeLeagueId || ''}`);
    }
    if (!AppState.sabermetrics) {
      AppState.sabermetrics = await fetchJSON(`/api/sabermetrics?save=${AppState.activeSave}`);
    }
  } finally {
    hideLoading();
  }

  const sp = AppState.statsplus;
  const sub = AppState.statsPlusSubTab;
  let bodyHtml = "";

  if (sub === "dev") {
    bodyHtml = buildStatsPlusDevCardHtml(sp);
  } else if (sub === "prospects") {
    bodyHtml = buildStatsPlusProspectsCardHtml(sp);
  } else if (sub === "contracts") {
    bodyHtml = buildStatsPlusContractsCardHtml(sp);
  } else if (sub === "trades") {
    bodyHtml = `
      <div class="grid grid-cols-1 xl:grid-cols-2 uw:grid-cols-3 gap-4">
        ${(sp.trades || []).map(tr => `
          <div class="glass-card p-4 flex flex-col justify-between">
            <div>
              <div class="flex flex-wrap justify-between items-center border-b border-slate-800 pb-2 mb-3 gap-2">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono text-slate-400">${tr.date}</span>
                  <span class="font-bold text-sm text-white">${tr.team0_name} &harr; ${tr.team1_name}</span>
                </div>
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                  <i class="bi bi-award-fill mr-1"></i>${tr.winner_badge}
                </span>
              </div>
              <p class="text-xs text-slate-300 mb-3">${tr.summary_clean}</p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                <div class="font-bold text-sky-400 mb-1.5">${tr.team0_abbr} Acquires (${tr.team0_war_gained} WAR):</div>
                <div class="flex flex-wrap gap-1.5">
                  ${tr.team0_received.map(p => `<button onclick="openPlayerModal(${p.player_id})" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold">${p.name} <span class="text-sky-400 font-mono">(${p.war}W)</span></button>`).join("")}
                </div>
              </div>
              <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                <div class="font-bold text-amber-400 mb-1.5">${tr.team1_abbr} Acquires (${tr.team1_war_gained} WAR):</div>
                <div class="flex flex-wrap gap-1.5">
                  ${tr.team1_received.map(p => `<button onclick="openPlayerModal(${p.player_id})" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold">${p.name} <span class="text-amber-400 font-mono">(${p.war}W)</span></button>`).join("")}
                </div>
              </div>
            </div>
          </div>
        `).join("") || `<div class="glass-card p-8 text-center text-slate-400 col-span-full">No trades recorded yet in this season's CSV export.</div>`}
      </div>
    `;
  } else if (sub === "trade_machine") {
    bodyHtml = renderTradeMachineHtml();
  } else if (sub === "news") {
    bodyHtml = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div class="glass-card p-4 lg:col-span-8 uw:col-span-9">
          <h3 class="text-sm font-extrabold uppercase text-white mb-3"><i class="bi bi-newspaper text-sky-400 mr-1.5"></i> League News, Stories & Transaction Wire (with Full <code>messages/*.txt</code> Bodies)</h3>
          <div class="grid grid-cols-1 uw:grid-cols-2 gap-3 max-h-[740px] overflow-y-auto pr-1">
            ${(sp.messages || []).map(m => `
              <div class="p-3.5 rounded-xl bg-slate-900/85 border border-slate-800 text-xs space-y-1.5 flex flex-col justify-between">
                <div>
                  <div class="flex justify-between items-start gap-2">
                    <div class="flex items-center gap-2">
                      ${m.date ? `<span class="text-[10px] font-mono text-slate-400 shrink-0">${m.date}</span>` : ""}
                      <span class="font-extrabold text-white text-sm">${m.subject}</span>
                    </div>
                    ${m.player_id ? `<button onclick="openPlayerModal(${m.player_id})" class="text-sky-400 hover:underline font-bold shrink-0">Inspect &rarr;</button>` : ""}
                  </div>
                  ${m.body ? `<p class="text-xs text-slate-300 leading-relaxed whitespace-pre-line border-t border-slate-800/80 pt-1.5 mt-1.5">${m.body}</p>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="glass-card p-4 lg:col-span-4 uw:col-span-3">
          <h3 class="text-sm font-extrabold uppercase text-white mb-3"><i class="bi bi-calendar-event text-amber-400 mr-1.5"></i> League Calendar Events</h3>
          <div class="space-y-2 max-h-[740px] overflow-y-auto pr-1">
            ${(sp.events || []).map(ev => `
              <div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex justify-between items-center text-xs">
                <div>
                  <div class="font-bold text-white">${ev.name}</div>
                  <div class="text-[10px] font-mono text-slate-400">${ev.date}</div>
                </div>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${ev.completed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">${ev.completed ? 'Done' : 'Upcoming'}</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  } else if (sub === "all_sp") {
    bodyHtml = `
      <div class="space-y-5">
        <div class="grid grid-cols-1 uw:grid-cols-2 gap-5 items-start">
          ${buildStatsPlusDevCardHtml(sp)}
          ${buildStatsPlusProspectsCardHtml(sp)}
        </div>
        <div class="grid grid-cols-1 uw:grid-cols-12 gap-5 items-start">
          <div class="uw:col-span-7">${buildStatsPlusContractsCardHtml(sp)}</div>
          <div class="uw:col-span-5">${renderTradeMachineHtml()}</div>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="animate-view space-y-5">
      <div class="glass-card p-3.5 flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap gap-1.5">
          ${[
            ["dev", "bi-graph-up-arrow", "Player Development (Bumps/Drops)"],
            ["prospects", "bi-stars", "Top 100 Prospects"],
            ["contracts", "bi-cash-stack", "Contract & Payroll Matrix"],
            ["trades", "bi-arrow-left-right", "Trade History & Grades"],
            ["trade_machine", "bi-sliders", "Interactive Trade Simulator"],
            ["news", "bi-broadcast-pin", "League Wire & Full Articles"],
            ["all_sp", "bi-aspect-ratio-fill", "Ultrawide Executive Overview"],
          ].map(([key, ic, label]) => `
            <button onclick="AppState.statsPlusSubTab='${key}'; renderStatsPlusTab(document.getElementById('main-view-container'))" class="px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${sub === key ? 'bg-sky-500 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}">
              <i class="bi ${ic}"></i> ${label}
            </button>
          `).join("")}
        </div>
        <button onclick="openOnlineModal()" class="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 hover:bg-emerald-500/30 transition">
          <i class="bi bi-cloud-arrow-up-up mr-1"></i> Online League Export / Sync
        </button>
      </div>
      ${bodyHtml}
    </div>
  `;
}

function renderTradeMachineHtml() {
  const allPlayers = [
    ...(AppState.sabermetrics.batters || []),
    ...(AppState.sabermetrics.pitchers || []),
  ];
  const sideAList = AppState.tradeSideA.map(id => allPlayers.find(p => p.player_id === id)).filter(Boolean);
  const sideBList = AppState.tradeSideB.map(id => allPlayers.find(p => p.player_id === id)).filter(Boolean);

  const warA = sideAList.reduce((s, p) => s + (p.war || 0), 0);
  const tvA = sideAList.reduce((s, p) => s + (p.talent_value || 500), 0);
  const salA = sideAList.reduce((s, p) => s + (p.salary || 0), 0);

  const warB = sideBList.reduce((s, p) => s + (p.war || 0), 0);
  const tvB = sideBList.reduce((s, p) => s + (p.talent_value || 500), 0);
  const salB = sideBList.reduce((s, p) => s + (p.salary || 0), 0);

  const diffScore = (warA * 250 + tvA) - (warB * 250 + tvB);
  const verdict = Math.abs(diffScore) < 350 ? "FAIR / BALANCED TRADE PACKAGE" : (diffScore > 0 ? "PACKAGE A HAS HIGHER VALUE" : "PACKAGE B HAS HIGHER VALUE");

  return `
    <div class="glass-card p-5 space-y-5">
      <div class="flex flex-wrap justify-between items-center border-b border-slate-800 pb-3">
        <div>
          <h3 class="text-base font-extrabold text-white"><i class="bi bi-cpu-fill text-sky-400 mr-1.5"></i> StatsPlus Interactive Trade Analyzer & Surplus Simulator</h3>
          <p class="text-xs text-slate-400">Build a custom trade package between any teams to evaluate WAR, True Talent Value, and Payroll impact</p>
        </div>
        <div class="px-4 py-1.5 rounded-xl bg-sky-500/20 border border-sky-400/50 text-sky-300 font-extrabold text-xs">
          ${verdict}
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <!-- Side A -->
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <div class="font-bold text-xs uppercase text-sky-400">Trade Package A</div>
          <div class="flex gap-2">
            <select id="tm-select-a" class="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white">
              ${allPlayers.slice(0, 250).map(p => `<option value="${p.player_id}">${p.name} (${p.team_abbr} • ${p.position || p.role} • ${p.war.toFixed(1)} WAR • OVR ${p.oa}/${p.pot})</option>`).join("")}
            </select>
            <button onclick="addTradePlayer('A')" class="px-3 py-2 rounded-lg bg-sky-500 text-slate-950 font-bold text-xs">+ Add</button>
          </div>
          <div class="space-y-1.5 min-h-[100px]">
            ${sideAList.map(p => `
              <div class="flex justify-between items-center p-2 rounded-lg bg-slate-800/80 text-xs">
                <span><b>${p.name}</b> (${p.team_abbr}) • ${rtgBadge(p.oa, p.pot)} • <b class="text-sky-400">${p.war.toFixed(1)} WAR</b> • ${fmtMoney(p.salary)}</span>
                <button onclick="removeTradePlayer('A', ${p.player_id})" class="text-rose-400 hover:text-rose-300"><i class="bi bi-x-lg"></i></button>
              </div>
            `).join("") || `<div class="text-xs text-slate-500 py-6 text-center">Add players to Package A</div>`}
          </div>
          <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-center font-mono text-xs">
            <div><div class="text-[10px] text-slate-400">Total WAR</div><div class="font-bold text-sky-400">${warA.toFixed(1)}</div></div>
            <div><div class="text-[10px] text-slate-400">Talent Score</div><div class="font-bold text-emerald-400">${tvA}</div></div>
            <div><div class="text-[10px] text-slate-400">Total Salary</div><div class="font-bold text-white">${fmtMoney(salA)}</div></div>
          </div>
        </div>

        <!-- Side B -->
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <div class="font-bold text-xs uppercase text-amber-400">Trade Package B</div>
          <div class="flex gap-2">
            <select id="tm-select-b" class="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white">
              ${allPlayers.slice(0, 250).map(p => `<option value="${p.player_id}">${p.name} (${p.team_abbr} • ${p.position || p.role} • ${p.war.toFixed(1)} WAR • OVR ${p.oa}/${p.pot})</option>`).join("")}
            </select>
            <button onclick="addTradePlayer('B')" class="px-3 py-2 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs">+ Add</button>
          </div>
          <div class="space-y-1.5 min-h-[100px]">
            ${sideBList.map(p => `
              <div class="flex justify-between items-center p-2 rounded-lg bg-slate-800/80 text-xs">
                <span><b>${p.name}</b> (${p.team_abbr}) • ${rtgBadge(p.oa, p.pot)} • <b class="text-amber-400">${p.war.toFixed(1)} WAR</b> • ${fmtMoney(p.salary)}</span>
                <button onclick="removeTradePlayer('B', ${p.player_id})" class="text-rose-400 hover:text-rose-300"><i class="bi bi-x-lg"></i></button>
              </div>
            `).join("") || `<div class="text-xs text-slate-500 py-6 text-center">Add players to Package B</div>`}
          </div>
          <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-center font-mono text-xs">
            <div><div class="text-[10px] text-slate-400">Total WAR</div><div class="font-bold text-amber-400">${warB.toFixed(1)}</div></div>
            <div><div class="text-[10px] text-slate-400">Total Score</div><div class="font-bold text-emerald-400">${tvB}</div></div>
            <div><div class="text-[10px] text-slate-400">Total Salary</div><div class="font-bold text-white">${fmtMoney(salB)}</div></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.addTradePlayer = function(side) {
  const sel = document.getElementById(side === "A" ? "tm-select-a" : "tm-select-b");
  if (!sel) return;
  const pid = Number(sel.value);
  const arr = side === "A" ? AppState.tradeSideA : AppState.tradeSideB;
  if (!arr.includes(pid)) arr.push(pid);
  renderStatsPlusTab(document.getElementById("main-view-container"));
};

window.removeTradePlayer = function(side, pid) {
  if (side === "A") AppState.tradeSideA = AppState.tradeSideA.filter(x => x !== pid);
  else AppState.tradeSideB = AppState.tradeSideB.filter(x => x !== pid);
  renderStatsPlusTab(document.getElementById("main-view-container"));
};

/* ============================================================================
 * 7. OUT-OF-THE-BOX OOTP 27 BNN HTML REPORTS & ALMANAC PORTAL
 * ============================================================================ */
async function renderBnnPortalTab(container, initialRelPath = null) {
  if (!AppState.bnnCatalog) {
    AppState.bnnCatalog = await fetchJSON(`/api/bnn/catalog?save=${AppState.activeSave}`);
  }
  const cat = AppState.bnnCatalog || {};
  const almanacs = cat.almanacs || [];
  const defaultPath = cat.default_path || "leagues/league_200_home.html";
  const relPath = initialRelPath || AppState.bnnLeftPath || defaultPath;
  AppState.bnnLeftPath = relPath;
  const rightRelPath = AppState.bnnRightPath || (cat.quick_links && cat.quick_links[1] ? cat.quick_links[1].path : defaultPath);
  AppState.bnnRightPath = rightRelPath;

  const iframeUrl = `/bnn/${AppState.activeSave}/${relPath}`;
  const rightIframeUrl = `/bnn/${AppState.activeSave}/${rightRelPath}`;

  container.innerHTML = `
    <div class="animate-view grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <!-- BNN & Almanac Navigation Sidebar (Slim 2-col on Ultrawide) -->
      <div class="glass-card p-4 lg:col-span-3 uw:col-span-2 space-y-4 max-h-[860px] overflow-y-auto">
        ${almanacs.length ? `
        <div class="pb-3 border-b border-slate-800">
          <div class="text-xs font-extrabold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
            <i class="bi bi-journal-album"></i> Yearly Almanacs (${almanacs.length})
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <button onclick="navigateBnnIframe('${defaultPath}')" class="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white border border-slate-600 text-left truncate">
              ★ Current HTML
            </button>
            ${almanacs.map(a => {
              const almUrl = a.index_url || a.league_home_path || a.index_path || `almanac_${a.year}/leagues/league_${AppState.activeLeagueId || 200}_home.html`;
              return `
              <button onclick="navigateBnnIframe('${almUrl}')" class="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-mono font-bold text-amber-300 border border-slate-800 text-left truncate" title="${a.html_count || a.total_html_files || 0} HTML files">
                📚 ${a.year || a.folder || a.folder_name}
              </button>
              `;
            }).join("")}
          </div>
        </div>
        ` : ""}

        <div>
          <div class="text-xs font-extrabold uppercase tracking-wider text-sky-400 mb-2 flex items-center gap-1.5">
            <i class="bi bi-journal-richtext"></i> OOTP 27 HTML Reports
          </div>
          <div class="space-y-1">
            ${(cat.quick_links || []).map(q => `
              <button onclick="navigateBnnIframe('${q.path}')" class="w-full text-left px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:bg-sky-500/20 hover:text-sky-300 transition flex items-center gap-2">
                <i class="bi ${q.icon} text-sky-400"></i> <span class="truncate">${q.title}</span>
              </button>
            `).join("")}
          </div>
        </div>

        ${(cat.league_pages && cat.league_pages.length) ? `
        <div class="pt-3 border-t border-slate-800">
          <div class="text-[11px] font-bold uppercase text-emerald-400 mb-2">Exported Native HTML (${cat.league_pages.length})</div>
          <div class="space-y-1 max-h-48 overflow-y-auto pr-1">
            ${cat.league_pages.map(lp => `
              <button onclick="navigateBnnIframe('${lp.path}')" class="w-full text-left px-2.5 py-1.5 rounded bg-slate-900/90 hover:bg-slate-800 text-[11px] font-mono text-slate-200 border border-slate-800 truncate flex items-center justify-between">
                <span class="truncate">${lp.name}</span>
                <span class="text-[9px] text-slate-400 ml-1 shrink-0">${lp.size_kb || ''}KB</span>
              </button>
            `).join("")}
          </div>
        </div>
        ` : ""}

        ${(cat.recent_box_scores && cat.recent_box_scores.length) ? `
        <div class="pt-3 border-t border-slate-800">
          <div class="text-[11px] font-bold uppercase text-slate-400 mb-2">Native HTML Box Scores (${cat.recent_box_scores.length}+)</div>
          <div class="grid grid-cols-2 gap-1.5">
            ${cat.recent_box_scores.slice(0, 24).map(bs => `
              <button onclick="navigateBnnIframe('${bs.path}')" class="px-2 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-[11px] font-mono text-slate-300 border border-slate-800 truncate">
                ${bs.name}
              </button>
            `).join("")}
          </div>
        </div>
        ` : ""}
      </div>

      <!-- BNN Report Viewport (Single or Dual Side-by-Side Split on Ultrawide) -->
      <div class="lg:col-span-9 uw:col-span-10 space-y-3">
        <div class="glass-card px-4 py-2.5 bg-slate-900/90 border border-slate-800 flex flex-wrap justify-between items-center gap-2">
          <div class="flex items-center gap-2 text-xs">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span class="font-mono text-slate-300" id="bnn-current-path-label">${iframeUrl}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            ${AppState.bnnSplitMode ? `
              <div class="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[11px] font-mono">
                <button onclick="AppState.bnnActivePane='left'; renderBnnPortalTab(document.getElementById('main-view-container'))" class="px-2 py-1 rounded ${AppState.bnnActivePane === 'left' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-300'}">Target: Left Pane</button>
                <button onclick="AppState.bnnActivePane='right'; renderBnnPortalTab(document.getElementById('main-view-container'))" class="px-2 py-1 rounded ${AppState.bnnActivePane === 'right' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-300'}">Target: Right Pane</button>
              </div>
            ` : ""}
            <button onclick="toggleBnnSplitMode()" class="px-3 py-1 rounded-lg text-xs font-bold border transition ${AppState.bnnSplitMode ? 'bg-amber-500/20 text-amber-300 border-amber-400/50' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'}">
              <i class="bi bi-layout-split mr-1"></i> ${AppState.bnnSplitMode ? 'Exit Dual-Report Split' : 'Dual-Report Split View'}
            </button>
            <a id="bnn-external-link" href="${iframeUrl}" target="_blank" class="px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition">
              <i class="bi bi-box-arrow-up-right mr-1"></i> Open in Browser Tab
            </a>
          </div>
        </div>

        <div class="grid grid-cols-1 ${AppState.bnnSplitMode ? 'uw:grid-cols-2' : ''} gap-4">
          <div class="glass-card overflow-hidden flex flex-col min-h-[780px]">
            ${AppState.bnnSplitMode ? `<div class="px-3 py-1.5 bg-slate-950 border-b border-slate-800 text-[11px] font-mono text-sky-400 flex justify-between"><span>Left Report Pane</span><span id="bnn-left-label">${iframeUrl}</span></div>` : ""}
            <iframe id="bnn-report-iframe" src="${iframeUrl}" class="w-full flex-1 bg-slate-950 border-0" style="min-height:760px;"></iframe>
          </div>
          ${AppState.bnnSplitMode ? `
            <div class="glass-card overflow-hidden flex flex-col min-h-[780px]">
              <div class="px-3 py-1.5 bg-slate-950 border-b border-slate-800 text-[11px] font-mono text-amber-400 flex justify-between">
                <span>Right Report Pane</span>
                <span id="bnn-right-label">${rightIframeUrl}</span>
              </div>
              <iframe id="bnn-report-iframe-right" src="${rightIframeUrl}" class="w-full flex-1 bg-slate-950 border-0" style="min-height:760px;"></iframe>
            </div>
          ` : ""}
        </div>
      </div>
    </div>
  `;
}

window.toggleBnnSplitMode = function() {
  AppState.bnnSplitMode = !AppState.bnnSplitMode;
  renderBnnPortalTab(document.getElementById("main-view-container"));
};

window.navigateBnnIframe = function(relPath) {
  const url = `/bnn/${AppState.activeSave}/${relPath}`;
  if (AppState.bnnSplitMode && AppState.bnnActivePane === "right") {
    AppState.bnnRightPath = relPath;
    const ifrR = document.getElementById("bnn-report-iframe-right");
    const lblR = document.getElementById("bnn-right-label");
    if (ifrR) ifrR.src = url;
    if (lblR) lblR.textContent = url;
    return;
  }
  AppState.bnnLeftPath = relPath;
  const ifr = document.getElementById("bnn-report-iframe");
  const lbl = document.getElementById("bnn-current-path-label");
  const lblL = document.getElementById("bnn-left-label");
  const ext = document.getElementById("bnn-external-link");
  if (ifr) ifr.src = url;
  if (lbl) lbl.textContent = url;
  if (lblL) lblL.textContent = url;
  if (ext) ext.href = url;
};

/* ============================================================================
 * 8. PLAYER DEEP-DIVE DOSSIER MODAL & PERSISTENT ULTRAWIDE SCOUT SIDE DOCK
 * ============================================================================ */
function buildPlayerDossierHtml(prof, prefix = "modal", isCompactDock = false) {
  const b = prof.batting;
  const p = prof.pitching;
  const isPit = prof.is_pitcher;

  const careerBatHtml = prof.career_batting && prof.career_batting.length ? `
    <div class="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
      <div class="px-3.5 py-2 bg-slate-950 border-b border-slate-800 font-bold text-xs uppercase text-white flex justify-between">
        <span>Year-by-Year Batting History</span>
        <span class="text-[10px] font-mono text-slate-400">${prof.career_batting.length} Seasons</span>
      </div>
      <div class="overflow-x-auto">
        <table class="saber-table">
          <thead><tr><th class="text-left">Year</th><th>Team</th><th>G</th><th>PA</th><th>AB</th><th>R</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>RBI</th><th>BB</th><th>K</th><th>SB</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>WAR</th></tr></thead>
          <tbody>
            ${prof.career_batting.map(r => `<tr><td class="font-bold font-mono">${r.year}</td><td class="text-center font-mono">${r.team_abbr}</td><td class="text-right font-mono">${r.g}</td><td class="text-right font-mono">${r.pa}</td><td class="text-right font-mono">${r.ab}</td><td class="text-right font-mono">${r.r}</td><td class="text-right font-mono font-bold">${r.h}</td><td class="text-right font-mono">${r['2b']}</td><td class="text-right font-mono">${r['3b']}</td><td class="text-right font-mono text-pink-400 font-bold">${r.hr}</td><td class="text-right font-mono">${r.rbi}</td><td class="text-right font-mono">${r.bb}</td><td class="text-right font-mono">${r.k}</td><td class="text-right font-mono">${r.sb}</td><td class="text-right font-mono font-semibold">${fmtAvg(r.avg)}</td><td class="text-right font-mono">${fmtAvg(r.obp)}</td><td class="text-right font-mono">${fmtAvg(r.slg)}</td><td class="text-right font-mono font-bold text-sky-300">${fmtAvg(r.ops)}</td><td class="text-right font-mono font-extrabold text-emerald-400">${r.war.toFixed(2)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  ` : "";

  const careerPitHtml = prof.career_pitching && prof.career_pitching.length ? `
    <div class="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
      <div class="px-3.5 py-2 bg-slate-950 border-b border-slate-800 font-bold text-xs uppercase text-white flex justify-between">
        <span>Year-by-Year Pitching History</span>
        <span class="text-[10px] font-mono text-slate-400">${prof.career_pitching.length} Seasons</span>
      </div>
      <div class="overflow-x-auto">
        <table class="saber-table">
          <thead><tr><th class="text-left">Year</th><th>Team</th><th>G</th><th>GS</th><th>W-L</th><th>SV</th><th>IP</th><th>H</th><th>ER</th><th>HR</th><th>BB</th><th>K</th><th>ERA</th><th>WHIP</th><th>WAR</th></tr></thead>
          <tbody>
            ${prof.career_pitching.map(r => `<tr><td class="font-bold font-mono">${r.year}</td><td class="text-center font-mono">${r.team_abbr}</td><td class="text-right font-mono">${r.g}</td><td class="text-right font-mono">${r.gs}</td><td class="text-right font-mono">${r.w}-${r.l}</td><td class="text-right font-mono">${r.sv}</td><td class="text-right font-mono font-bold">${r.ip_display}</td><td class="text-right font-mono">${r.ha}</td><td class="text-right font-mono">${r.er}</td><td class="text-right font-mono">${r.hra}</td><td class="text-right font-mono">${r.bb}</td><td class="text-right font-mono font-bold text-sky-300">${r.k}</td><td class="text-right font-mono font-bold text-amber-300">${r.era.toFixed(2)}</td><td class="text-right font-mono">${r.whip.toFixed(2)}</td><td class="text-right font-mono font-extrabold text-emerald-400">${r.war.toFixed(2)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>
  ` : "";

  return `
    <div class="space-y-4">
      <!-- Player Header Banner -->
      <div class="flex flex-col ${isCompactDock ? '' : 'md:flex-row md:items-center'} justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950/60 border border-slate-700/80">
        <div class="flex items-center gap-3.5">
          <img src="${playerPicUrl(prof.player_id)}" class="w-14 h-20 object-cover rounded-xl border-2 border-sky-400/60 shadow-lg" alt="${prof.name}">
          <div>
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="px-2 py-0.5 rounded bg-sky-500 text-slate-950 font-black text-xs">${prof.position}</span>
              <span class="font-mono text-xs text-slate-300">#${prof.uniform_number} • ${prof.team.full_name}</span>
              <a href="/bnn/${AppState.activeSave}/players/player_${prof.player_id}.html" target="_blank" class="text-xs text-amber-300 hover:underline font-semibold"><i class="bi bi-box-arrow-up-right"></i> BNN</a>
            </div>
            <h2 class="text-xl font-black text-white mt-0.5">${prof.name} ${prof.nick_name ? `<span class="text-xs font-normal text-sky-300">"${prof.nick_name}"</span>` : ""}</h2>
            <div class="text-[11px] text-slate-400 font-mono mt-0.5">
              Age: <b class="text-slate-200">${prof.age}</b> (${prof.date_of_birth}) • B/T: <b class="text-slate-200">${prof.bats}/${prof.throws}</b> • Injury: <b class="text-slate-200">${prof.injury_proneness.overall}</b>
            </div>
          </div>
        </div>

        ${!isPit && b ? `
          <div class="grid grid-cols-4 gap-2 text-center font-mono">
            <div class="bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800"><div class="text-[9.5px] text-slate-400">OVR / POT</div><div class="mt-0.5">${rtgBadge(b.oa, b.pot)}</div></div>
            <div class="bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800"><div class="text-[9.5px] text-slate-400">wOBA / xwOBA</div><div class="text-xs font-extrabold text-sky-300 mt-0.5">${fmtAvg(b.woba)} / ${fmtAvg(b.xwoba)}</div></div>
            <div class="bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800"><div class="text-[9.5px] text-slate-400">wRC+</div><div class="text-sm font-black text-emerald-400">${b.wrc_plus}</div></div>
            <div class="bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800"><div class="text-[9.5px] text-slate-400">WAR</div><div class="text-sm font-black text-sky-400">${b.war.toFixed(2)}</div></div>
          </div>
        ` : (p ? `
          <div class="grid grid-cols-4 gap-2 text-center font-mono">
            <div class="bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800"><div class="text-[9.5px] text-slate-400">OVR / POT</div><div class="mt-0.5">${rtgBadge(p.oa, p.pot)}</div></div>
            <div class="bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800"><div class="text-[9.5px] text-slate-400">ERA / FIP</div><div class="text-xs font-extrabold text-amber-300 mt-0.5">${p.era.toFixed(2)} / ${p.fip.toFixed(2)}</div></div>
            <div class="bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800"><div class="text-[9.5px] text-slate-400">K/9 • Velo</div><div class="text-[11px] font-bold text-sky-300 mt-1">${p.k9.toFixed(1)} • ${p.velocity_str}</div></div>
            <div class="bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800"><div class="text-[9.5px] text-slate-400">WAR</div><div class="text-sm font-black text-sky-400">${p.war.toFixed(2)}</div></div>
          </div>
        ` : "")}
      </div>

      ${isCompactDock ? `
        <!-- Stacked layout inside Right-Hand Ultrawide Side Dock -->
        <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <h4 class="text-xs font-extrabold uppercase tracking-wider text-white mb-2 flex items-center gap-1.5">
            <i class="bi bi-bullseye text-sky-400"></i> Statcast Spray Chart (${isPit ? 'Batted Balls Allowed' : 'Batted Balls Hit'})
          </h4>
          <div id="${prefix}-player-spray-svg"></div>
          <div id="${prefix}-player-spray-inspector" class="mt-2 bg-slate-950/90 border border-slate-800 rounded-xl p-2 text-xs"></div>
        </div>

        <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
          <h4 class="text-xs font-extrabold uppercase tracking-wider text-white mb-2.5 flex items-center gap-1.5">
            <i class="bi bi-sliders text-rose-400"></i> Savant Percentiles & 20–80 Scouting
          </h4>
          ${renderSavantPercentileSliders(prof.percentiles)}
          <div class="mt-3 pt-2.5 border-t border-slate-800">
            ${!isPit && b ? `
              <div class="grid grid-cols-3 gap-1.5 text-[11px]">
                <div class="bg-slate-950 p-1.5 rounded flex justify-between"><span>CON:</span> ${rtgBadge(b.rtg_contact, b.rtg_talent_contact)}</div>
                <div class="bg-slate-950 p-1.5 rounded flex justify-between"><span>POW:</span> ${rtgBadge(b.rtg_power, b.rtg_talent_power)}</div>
                <div class="bg-slate-950 p-1.5 rounded flex justify-between"><span>EYE:</span> ${rtgBadge(b.rtg_eye, b.rtg_talent_eye)}</div>
                <div class="bg-slate-950 p-1.5 rounded flex justify-between"><span>GAP:</span> ${rtgBadge(b.rtg_gap)}</div>
                <div class="bg-slate-950 p-1.5 rounded flex justify-between"><span>SPD:</span> ${rtgBadge(b.rtg_speed)}</div>
                <div class="bg-slate-950 p-1.5 rounded flex justify-between"><span>STL:</span> ${rtgBadge(b.rtg_steal)}</div>
              </div>
            ` : (p ? `
              <div class="grid grid-cols-3 gap-1.5 text-[11px] mb-2">
                <div class="bg-slate-950 p-1.5 rounded flex justify-between"><span>STU:</span> ${rtgBadge(p.rtg_stuff, p.rtg_talent_stuff)}</div>
                <div class="bg-slate-950 p-1.5 rounded flex justify-between"><span>MOV:</span> ${rtgBadge(p.rtg_movement, p.rtg_talent_movement)}</div>
                <div class="bg-slate-950 p-1.5 rounded flex justify-between"><span>CTL:</span> ${rtgBadge(p.rtg_control, p.rtg_talent_control)}</div>
              </div>
              <div class="flex flex-wrap gap-1">
                ${Object.entries(p.arsenal || {}).map(([pname, pval]) => `<span class="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px]">${pname}: ${rtgBadge(pval)}</span>`).join("")}
              </div>
            ` : "")}
          </div>
        </div>

        ${careerBatHtml}
        ${careerPitHtml}
      ` : `
        <!-- Ultrawide 3-Column Modal Layout: Savant & Scouting (3) + Spray Chart (4) + Career History Tables (5) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 lg:col-span-5 uw:col-span-3">
            <h4 class="text-xs font-extrabold uppercase tracking-wider text-white mb-3 flex items-center gap-1.5">
              <i class="bi bi-sliders text-rose-400"></i> Baseball Savant League Percentile Rankings
            </h4>
            ${renderSavantPercentileSliders(prof.percentiles)}

            <!-- 20-80 Scouting Ratings Strip -->
            <div class="mt-4 pt-3 border-t border-slate-800">
              <div class="text-[11px] font-bold uppercase text-slate-400 mb-2">OOTP 27 Scouting Grades (20-80 Scale)</div>
              ${!isPit && b ? `
                <div class="grid grid-cols-2 sm:grid-cols-3 uw:grid-cols-2 gap-2 text-xs">
                  <div class="bg-slate-950 p-2 rounded flex justify-between"><span>Contact:</span> ${rtgBadge(b.rtg_contact, b.rtg_talent_contact)}</div>
                  <div class="bg-slate-950 p-2 rounded flex justify-between"><span>Power:</span> ${rtgBadge(b.rtg_power, b.rtg_talent_power)}</div>
                  <div class="bg-slate-950 p-2 rounded flex justify-between"><span>Eye:</span> ${rtgBadge(b.rtg_eye, b.rtg_talent_eye)}</div>
                  <div class="bg-slate-950 p-2 rounded flex justify-between"><span>Gap:</span> ${rtgBadge(b.rtg_gap)}</div>
                  <div class="bg-slate-950 p-2 rounded flex justify-between"><span>Speed:</span> ${rtgBadge(b.rtg_speed)}</div>
                  <div class="bg-slate-950 p-2 rounded flex justify-between"><span>Steal:</span> ${rtgBadge(b.rtg_steal)}</div>
                </div>
              ` : (p ? `
                <div class="grid grid-cols-3 gap-2 text-xs mb-2">
                  <div class="bg-slate-950 p-2 rounded flex justify-between"><span>Stuff:</span> ${rtgBadge(p.rtg_stuff, p.rtg_talent_stuff)}</div>
                  <div class="bg-slate-950 p-2 rounded flex justify-between"><span>Movement:</span> ${rtgBadge(p.rtg_movement, p.rtg_talent_movement)}</div>
                  <div class="bg-slate-950 p-2 rounded flex justify-between"><span>Control:</span> ${rtgBadge(p.rtg_control, p.rtg_talent_control)}</div>
                </div>
                <div class="flex flex-wrap gap-1.5 mt-2">
                  ${Object.entries(p.arsenal || {}).map(([pname, pval]) => `<span class="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px]">${pname}: ${rtgBadge(pval)}</span>`).join("")}
                </div>
              ` : "")}
            </div>
          </div>

          <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4 lg:col-span-7 uw:col-span-4">
            <h4 class="text-xs font-extrabold uppercase tracking-wider text-white mb-2 flex items-center gap-1.5">
              <i class="bi bi-bullseye text-sky-400"></i> ${prof.name} — Statcast Spray Chart (${isPit ? 'Batted Balls Allowed' : 'Batted Balls Hit'})
            </h4>
            <div id="${prefix}-player-spray-svg"></div>
            <div id="${prefix}-player-spray-inspector" class="mt-2 bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-xs"></div>
          </div>

          <div class="lg:col-span-12 uw:col-span-5 space-y-4">
            ${careerBatHtml}
            ${careerPitHtml}
          </div>
        </div>
      `}
    </div>
  `;
}

window.togglePlayerSideDock = function(forceState = null) {
  const dock = document.getElementById("ultrawide-side-dock");
  const btn = document.getElementById("btn-toggle-dock");
  const badge = document.getElementById("dock-status-badge");
  if (!dock) return;

  AppState.sideDockOpen = forceState !== null ? Boolean(forceState) : !AppState.sideDockOpen;
  dock.classList.toggle("hidden", !AppState.sideDockOpen);

  if (btn) {
    btn.classList.toggle("border-sky-400", AppState.sideDockOpen);
    btn.classList.toggle("bg-sky-500/15", AppState.sideDockOpen);
  }
  if (badge) {
    badge.textContent = AppState.sideDockOpen ? "ON" : "OFF";
    badge.className = `px-1.5 py-0.2 rounded text-[10px] font-mono ${AppState.sideDockOpen ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'}`;
  }

  // If opening dock and we have a recent player, load them automatically
  if (AppState.sideDockOpen && !AppState.dockedPlayerId) {
    const defaultPid = AppState.activeModalPlayerId || (AppState.sabermetrics && AppState.sabermetrics.batters && AppState.sabermetrics.batters[0] && AppState.sabermetrics.batters[0].player_id);
    if (defaultPid) {
      renderPlayerIntoSideDock(defaultPid);
    }
  }
};

async function renderPlayerIntoSideDock(playerId) {
  if (!playerId) return;
  AppState.dockedPlayerId = playerId;
  AppState.activeModalPlayerId = playerId;
  const dockBody = document.getElementById("ultrawide-side-dock-body");
  if (!dockBody) return;

  dockBody.innerHTML = `<div class="p-8 text-center text-sky-400 font-bold text-xs"><i class="bi bi-arrow-repeat animate-spin mr-2"></i>Loading Player into Ultrawide Scout Dock...</div>`;
  try {
    const prof = await fetchJSON(`/api/player/${playerId}?save=${AppState.activeSave}`);
    dockBody.innerHTML = buildPlayerDossierHtml(prof, "dock", true);
    renderBallparkSpraySVG("dock-player-spray-svg", prof.spray, { inspectorId: "dock-player-spray-inspector" });
  } catch (err) {
    dockBody.innerHTML = `<div class="p-6 text-center text-rose-400 text-xs">Failed to load player: ${err.message}</div>`;
  }
}

window.pinCurrentModalPlayerToDock = function() {
  const pid = AppState.activeModalPlayerId;
  closePlayerModal();
  togglePlayerSideDock(true);
  if (pid) {
    renderPlayerIntoSideDock(pid);
  }
};

window.expandDockedPlayerToModal = function() {
  const pid = AppState.dockedPlayerId || AppState.activeModalPlayerId;
  if (pid) {
    openPlayerModal(pid, true);
  }
};

window.openPlayerModal = async function(playerId, forceModal = false) {
  if (!playerId) return;
  AppState.activeModalPlayerId = playerId;

  // If the persistent Ultrawide Side Dock is open and user didn't force full modal, update the Side Dock seamlessly!
  if (AppState.sideDockOpen && !forceModal) {
    await renderPlayerIntoSideDock(playerId);
    return;
  }

  const modal = document.getElementById("player-dossier-modal");
  const body = document.getElementById("player-dossier-body");
  if (!modal || !body) return;

  modal.classList.remove("hidden");
  body.innerHTML = `<div class="p-12 text-center text-sky-400 font-bold"><i class="bi bi-arrow-repeat animate-spin mr-2"></i>Loading Player Statcast & Scouting Dossier...</div>`;

  try {
    const prof = await fetchJSON(`/api/player/${playerId}?save=${AppState.activeSave}`);
    body.innerHTML = buildPlayerDossierHtml(prof, "modal", false);
    renderBallparkSpraySVG("modal-player-spray-svg", prof.spray, { inspectorId: "modal-player-spray-inspector" });
  } catch (err) {
    body.innerHTML = `<div class="p-8 text-center text-rose-400">Failed to load player profile: ${err.message}</div>`;
  }
};

window.closePlayerModal = function() {
  const modal = document.getElementById("player-dossier-modal");
  if (modal) modal.classList.add("hidden");
};

window.openOnlineModal = function() {
  document.getElementById("online-league-modal")?.classList.remove("hidden");
};

window.closeOnlineModal = function() {
  document.getElementById("online-league-modal")?.classList.add("hidden");
};

window.uploadOnlineArchive = async function() {
  const fileInput = document.getElementById("online-zip-input");
  const nameInput = document.getElementById("online-save-name-input");
  if (!fileInput || !fileInput.files.length) {
    alert("Please select a .zip archive containing OOTP CSV exports and/or HTML reports.");
    return;
  }
  const file = fileInput.files[0];
  const saveName = (nameInput && nameInput.value.trim()) || file.name.replace(/\.zip$/i, "");
  closeOnlineModal();
  showLoading(`Importing Online League Archive '${saveName}' into SQLite...`);
  try {
    const buf = await file.arrayBuffer();
    const res = await fetchJSON(`/api/saves/upload?name=${encodeURIComponent(saveName)}`, {
      method: "POST",
      body: buf,
    });
    if (res.ingestion && res.ingestion.save_slug) {
      await onSaveChanged(res.ingestion.save_slug);
    }
  } finally {
    hideLoading();
  }
};


// ============================================================================
// MODULE 9: LEAGUE LEADERS HUB (QUALIFIED LEADERS IN ALL STATISTICAL CATEGORIES)
// ============================================================================

const BATTING_LEADER_CATEGORIES = [
  // Rate & Slash Stats (require PA qualification)
  { key: "avg", code: "AVG", label: "Batting Average", group: "Slash & Rate", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "obp", code: "OBP", label: "On-Base Percentage", group: "Slash & Rate", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "slg", code: "SLG", label: "Slugging Percentage", group: "Slash & Rate", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "ops", code: "OPS", label: "On-Base + Slugging", group: "Slash & Rate", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "iso", code: "ISO", label: "Isolated Power", group: "Slash & Rate", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "babip", code: "BABIP", label: "Batting Avg on Balls in Play", group: "Slash & Rate", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "bb_pct", code: "BB%", label: "Walk Rate (BB%)", group: "Slash & Rate", isRate: true, asc: false, fmt: v => `${Number(v || 0).toFixed(1)}%` },
  { key: "k_pct", code: "K%", label: "Lowest Strikeout Rate (K%)", group: "Slash & Rate", isRate: true, asc: true, fmt: v => `${Number(v || 0).toFixed(1)}%` },
  { key: "bb_k", code: "BB/K", label: "Walk-to-Strikeout Ratio", group: "Slash & Rate", isRate: true, asc: false, fmt: v => Number(v || 0).toFixed(2) },
  { key: "sec_a", code: "SecA", label: "Secondary Average", group: "Slash & Rate", isRate: true, asc: false, fmt: v => fmtAvg(v) },

  // Sabermetric & Value Stats
  { key: "war", code: "WAR", label: "Wins Above Replacement", group: "Sabermetric", isRate: false, asc: false, fmt: v => Number(v || 0).toFixed(1) },
  { key: "wrc_plus", code: "wRC+", label: "Weighted Runs Created Plus", group: "Sabermetric", isRate: true, asc: false, fmt: v => Math.round(Number(v || 0)) },
  { key: "ops_plus", code: "OPS+", label: "Adjusted OPS+", group: "Sabermetric", isRate: true, asc: false, fmt: v => Math.round(Number(v || 0)) },
  { key: "woba", code: "wOBA", label: "Weighted On-Base Average", group: "Sabermetric", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "wraa", code: "wRAA", label: "Weighted Runs Above Avg", group: "Sabermetric", isRate: false, asc: false, fmt: v => `${Number(v || 0) > 0 ? '+' : ''}${Number(v || 0).toFixed(1)}` },
  { key: "wrc", code: "wRC", label: "Weighted Runs Created", group: "Sabermetric", isRate: false, asc: false, fmt: v => Number(v || 0).toFixed(1) },
  { key: "wpa", code: "WPA", label: "Win Probability Added", group: "Sabermetric", isRate: false, asc: false, fmt: v => `${Number(v || 0) > 0 ? '+' : ''}${Number(v || 0).toFixed(2)}` },

  // Counting Stats
  { key: "hr", code: "HR", label: "Home Runs", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "rbi", code: "RBI", label: "Runs Batted In", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "r", code: "R", label: "Runs Scored", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "h", code: "H", label: "Hits", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "tb", code: "TB", label: "Total Bases", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "xbh", code: "XBH", label: "Extra-Base Hits", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "2b", code: "2B", label: "Doubles", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "3b", code: "3B", label: "Triples", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "1b", code: "1B", label: "Singles", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "tob", code: "TOB", label: "Times On Base (H+BB+HBP)", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "bb", code: "BB", label: "Walks (Base on Balls)", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "ibb", code: "IBB", label: "Intentional Walks", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "hp", code: "HBP", label: "Hit By Pitch", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "sb", code: "SB", label: "Stolen Bases", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "pa", code: "PA", label: "Plate Appearances", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "g", code: "G", label: "Games Played", group: "Counting", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
];

const PITCHING_LEADER_CATEGORIES = [
  // Rate & Command Stats (require IP qualification)
  { key: "era", code: "ERA", label: "Earned Run Average", group: "Rate & Command", isRate: true, asc: true, fmt: v => Number(v || 0).toFixed(2) },
  { key: "whip", code: "WHIP", label: "Walks + Hits / IP", group: "Rate & Command", isRate: true, asc: true, fmt: v => Number(v || 0).toFixed(2) },
  { key: "baa", code: "BAA", label: "Opponent Batting Avg", group: "Rate & Command", isRate: true, asc: true, fmt: v => fmtAvg(v) },
  { key: "k9", code: "K/9", label: "Strikeouts per 9 IP", group: "Rate & Command", isRate: true, asc: false, fmt: v => Number(v || 0).toFixed(2) },
  { key: "bb9", code: "BB/9", label: "Lowest Walks per 9 IP", group: "Rate & Command", isRate: true, asc: true, fmt: v => Number(v || 0).toFixed(2) },
  { key: "hr9", code: "HR/9", label: "Lowest Home Runs per 9 IP", group: "Rate & Command", isRate: true, asc: true, fmt: v => Number(v || 0).toFixed(2) },
  { key: "h9", code: "H/9", label: "Lowest Hits per 9 IP", group: "Rate & Command", isRate: true, asc: true, fmt: v => Number(v || 0).toFixed(2) },
  { key: "k_bb", code: "K/BB", label: "Strikeout-to-Walk Ratio", group: "Rate & Command", isRate: true, asc: false, fmt: v => Number(v || 0).toFixed(2) },
  { key: "k_pct", code: "K%", label: "Strikeout Rate (K%)", group: "Rate & Command", isRate: true, asc: false, fmt: v => `${Number(v || 0).toFixed(1)}%` },
  { key: "k_minus_bb", code: "K-BB%", label: "K% minus BB%", group: "Rate & Command", isRate: true, asc: false, fmt: v => `${Number(v || 0).toFixed(1)}%` },
  { key: "w_pct", code: "W%", label: "Winning Percentage", group: "Rate & Command", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "lob_pct", code: "LOB%", label: "Left On-Base Percentage", group: "Rate & Command", isRate: true, asc: false, fmt: v => `${Number(v || 0).toFixed(1)}%` },
  { key: "gb_pct", code: "GB%", label: "Groundball Percentage", group: "Rate & Command", isRate: true, asc: false, fmt: v => `${Number(v || 0).toFixed(1)}%` },

  // Sabermetric Stats
  { key: "war", code: "WAR", label: "Pitching WAR (FIP-based)", group: "Sabermetric", isRate: false, asc: false, fmt: v => Number(v || 0).toFixed(1) },
  { key: "ra9war", code: "RA9-WAR", label: "RA9-WAR (Run-Prevention)", group: "Sabermetric", isRate: false, asc: false, fmt: v => Number(v || 0).toFixed(1) },
  { key: "fip", code: "FIP", label: "Fielding Independent Pitching", group: "Sabermetric", isRate: true, asc: true, fmt: v => Number(v || 0).toFixed(2) },
  { key: "xfip", code: "xFIP", label: "Expected FIP (xFIP)", group: "Sabermetric", isRate: true, asc: true, fmt: v => Number(v || 0).toFixed(2) },
  { key: "siera", code: "SIERA", label: "Skill-Interactive ERA", group: "Sabermetric", isRate: true, asc: true, fmt: v => Number(v || 0).toFixed(2) },
  { key: "era_plus", code: "ERA+", label: "Park-Adjusted ERA+", group: "Sabermetric", isRate: true, asc: false, fmt: v => Math.round(Number(v || 0)) },
  { key: "fip_minus", code: "FIP-", label: "Lowest Park-Adjusted FIP-", group: "Sabermetric", isRate: true, asc: true, fmt: v => Math.round(Number(v || 0)) },
  { key: "wpa", code: "WPA", label: "Win Probability Added", group: "Sabermetric", isRate: false, asc: false, fmt: v => `${Number(v || 0) > 0 ? '+' : ''}${Number(v || 0).toFixed(2)}` },

  // Counting & Bullpen Stats
  { key: "w", code: "W", label: "Wins", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "k", code: "K", label: "Strikeouts", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "sv", code: "SV", label: "Saves", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "hld", code: "HLD", label: "Holds", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "sv_hld", code: "SV+HLD", label: "Saves + Holds", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "qs", code: "QS", label: "Quality Starts", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "ip", code: "IP", label: "Innings Pitched", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toFixed(1) },
  { key: "cg", code: "CG", label: "Complete Games", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "sho", code: "SHO", label: "Shutouts", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "g", code: "G", label: "Games Pitched", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "gs", code: "GS", label: "Games Started", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "sd", code: "SD", label: "Shutdowns (Relief Leverage)", group: "Counting & Bullpen", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
];

const FIELDING_LEADER_CATEGORIES = [
  { key: "zr", code: "ZR", label: "Zone Rating (Runs Saved)", group: "Advanced Defense", isRate: false, asc: false, fmt: v => `${Number(v || 0) > 0 ? '+' : ''}${Number(v || 0).toFixed(2)}` },
  { key: "def_runs", code: "DEF", label: "Total Defensive Runs (ZR+Frm+Arm)", group: "Advanced Defense", isRate: false, asc: false, fmt: v => `${Number(v || 0) > 0 ? '+' : ''}${Number(v || 0).toFixed(2)}` },
  { key: "framing", code: "FRM", label: "Catcher Framing Runs", group: "Advanced Defense", isRate: false, asc: false, fmt: v => `${Number(v || 0) > 0 ? '+' : ''}${Number(v || 0).toFixed(2)}` },
  { key: "arm", code: "ARM", label: "Outfield / Infield Arm Runs", group: "Advanced Defense", isRate: false, asc: false, fmt: v => `${Number(v || 0) > 0 ? '+' : ''}${Number(v || 0).toFixed(2)}` },
  { key: "fld_pct", code: "FLD%", label: "Fielding Percentage", group: "Rate & Range", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "rf9", code: "RF/9", label: "Range Factor per 9 Inn", group: "Rate & Range", isRate: true, asc: false, fmt: v => Number(v || 0).toFixed(2) },
  { key: "rto_pct", code: "CS%", label: "Catcher Runners Thrown Out %", group: "Rate & Range", isRate: false, asc: false, fmt: v => `${Number(v || 0).toFixed(1)}%` },
  { key: "dp", code: "DP", label: "Double Plays Turned", group: "Counting Defense", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "po", code: "PO", label: "Putouts", group: "Counting Defense", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "a", code: "A", label: "Assists", group: "Counting Defense", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "tc", code: "TC", label: "Total Chances", group: "Counting Defense", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "fld_ip", code: "INN", label: "Defensive Innings Played", group: "Counting Defense", isRate: false, asc: false, fmt: v => Number(v || 0).toFixed(1) },
];

const STATCAST_LEADER_CATEGORIES = [
  { key: "xwoba", code: "xwOBA", label: "Expected wOBA (Statcast)", group: "Batter Statcast", pool: "batters", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "xba", code: "xBA", label: "Expected Batting Avg (xBA)", group: "Batter Statcast", pool: "batters", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "xslg", code: "xSLG", label: "Expected Slugging (xSLG)", group: "Batter Statcast", pool: "batters", isRate: true, asc: false, fmt: v => fmtAvg(v) },
  { key: "avg_ev", code: "Avg EV", label: "Average Exit Velocity (mph)", group: "Batter Statcast", pool: "batters", isRate: true, asc: false, fmt: v => `${Number(v || 0).toFixed(1)} mph` },
  { key: "max_ev", code: "Max EV", label: "Max Exit Velocity (mph)", group: "Batter Statcast", pool: "batters", isRate: false, asc: false, fmt: v => `${Number(v || 0).toFixed(1)} mph` },
  { key: "barrel_pct", code: "Brl%", label: "Barrel Percentage", group: "Batter Statcast", pool: "batters", isRate: true, asc: false, fmt: v => `${Number(v || 0).toFixed(1)}%` },
  { key: "barrels", code: "Barrels", label: "Total Barrels", group: "Batter Statcast", pool: "batters", isRate: false, asc: false, fmt: v => Number(v || 0).toLocaleString() },
  { key: "hard_hit_pct", code: "Hard%", label: "Hard-Hit Rate (95+ mph)", group: "Batter Statcast", pool: "batters", isRate: true, asc: false, fmt: v => `${Number(v || 0).toFixed(1)}%` },
  { key: "sweet_spot_pct", code: "SwSp%", label: "Launch Angle Sweet-Spot %", group: "Batter Statcast", pool: "batters", isRate: true, asc: false, fmt: v => `${Number(v || 0).toFixed(1)}%` },
  { key: "avg_sprint", code: "Sprint", label: "Sprint Speed (ft/sec)", group: "Baserunning & Speed", pool: "batters", isRate: true, asc: false, fmt: v => `${Number(v || 0).toFixed(1)} ft/s` },
  { key: "ubr", code: "UBR", label: "Ultimate Base Running (Runs)", group: "Baserunning & Speed", pool: "batters", isRate: false, asc: false, fmt: v => `${Number(v || 0) > 0 ? '+' : ''}${Number(v || 0).toFixed(2)}` },
  { key: "sb_pct", code: "SB%", label: "Stolen Base Success Rate", group: "Baserunning & Speed", pool: "batters", isRate: false, asc: false, fmt: v => `${Number(v || 0).toFixed(1)}%` },
  { key: "velocity_mph", code: "Velo", label: "Fastball Velocity (mph)", group: "Pitcher Statcast", pool: "pitchers", isRate: false, asc: false, fmt: v => `${Number(v || 0).toFixed(1)} mph` },
  { key: "avg_ev_against", code: "EV Agst", label: "Lowest Exit Velo Allowed", group: "Pitcher Statcast", pool: "pitchers", isRate: true, asc: true, fmt: v => `${Number(v || 0).toFixed(1)} mph` },
  { key: "hard_hit_against_pct", code: "HH% Agst", label: "Lowest Hard-Hit % Allowed", group: "Pitcher Statcast", pool: "pitchers", isRate: true, asc: true, fmt: v => `${Number(v || 0).toFixed(1)}%` },
  { key: "barrel_against_pct", code: "Brl% Agst", label: "Lowest Barrel % Allowed", group: "Pitcher Statcast", pool: "pitchers", isRate: true, asc: true, fmt: v => `${Number(v || 0).toFixed(1)}%` },
];

async function renderLeagueLeadersTab(container) {
  if (!AppState.leadersData) {
    showLoading("Computing Official Qualified League Leaders Across All Categories...");
    try {
      const lid = AppState.activeLeagueId || "";
      const yr = AppState.activeYear || "";
      AppState.leadersData = await fetchJSON(`/api/leaders?save=${AppState.activeSave}&league_id=${lid}&year=${yr}`);
    } finally {
      hideLoading();
    }
  }
  renderLeagueLeadersSubView(container);
}

window.setLeadersOption = function(key, val) {
  AppState[key] = val;
  const container = document.getElementById("main-view-container");
  if (container) renderLeagueLeadersSubView(container);
};

function renderLeaderCardHtml(cat, pool, qualRuleLabel, qualMode) {
  let eligible = pool.slice();
  if (qualMode === "qualified") {
    if (cat.isRate) {
      const qOnly = eligible.filter(p => p.is_qualified || (cat.pool === "pitchers" && AppState.leadersPitcherRole === "RP" && p.is_reliever_qualified));
      if (qOnly.length >= 3) eligible = qOnly;
    } else {
      // For counting stats, exclude zero values if possible
      const nonZero = eligible.filter(p => Number(p[cat.key] || 0) !== 0);
      if (nonZero.length > 0) eligible = nonZero;
    }
  } else if (qualMode === "half") {
    if (cat.isRate) {
      const hOnly = eligible.filter(p => p.is_half_qualified || p.is_reliever_qualified || p.is_qualified);
      if (hOnly.length >= 3) eligible = hOnly;
    }
  }

  // Special filter for Catcher CS% so non-catchers with 0 SBA don't clutter
  if (cat.key === "rto_pct") {
    eligible = eligible.filter(p => Number(p.sba || 0) >= 8);
  }
  if (cat.key === "sb_pct") {
    eligible = eligible.filter(p => (Number(p.sb || 0) + Number(p.cs || 0)) >= 8);
  }

  eligible.sort((a, b) => {
    const va = Number(a[cat.key] ?? (cat.asc ? 9999 : -9999));
    const vb = Number(b[cat.key] ?? (cat.asc ? 9999 : -9999));
    if (va !== vb) return cat.asc ? va - vb : vb - va;
    return Number(b.war || 0) - Number(a.war || 0);
  });

  const top10 = eligible.slice(0, 10);
  const leader = top10[0];
  const chases = top10.slice(1, 10);

  if (!leader) {
    return `
      <div class="glass-card p-4 border border-slate-800/80 flex flex-col justify-between">
        <div class="flex items-center justify-between border-b border-slate-800 pb-2">
          <span class="text-xs font-extrabold text-white">${cat.label}</span>
          <span class="px-2 py-0.5 rounded bg-slate-900 text-[10px] font-mono font-bold text-slate-400">${cat.code}</span>
        </div>
        <div class="py-6 text-center text-xs text-slate-500">No qualified players match current filter</div>
      </div>
    `;
  }

  const awardPills = (leader.awards || []).slice(0, 2).map(a =>
    `<span class="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-400/40">${a.name}</span>`
  ).join("");

  return `
    <div class="glass-card p-4 border border-slate-800/90 hover:border-slate-600 transition flex flex-col justify-between">
      <div>
        <!-- Card Header -->
        <div class="flex items-center justify-between gap-2 border-b border-slate-800/90 pb-2.5 mb-3">
          <div>
            <div class="text-xs font-black text-white uppercase tracking-tight">${cat.label}</div>
            <div class="text-[10px] font-mono text-slate-400">${cat.isRate ? `Qualifier: ${qualRuleLabel}` : 'Season Leader'}</div>
          </div>
          <span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono font-black text-amber-300 shrink-0">${cat.code}</span>
        </div>

        <!-- #1 Spotlight Podium -->
        <div onclick="openPlayerModal(${leader.player_id})" class="p-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-slate-900/90 to-slate-950 border border-amber-400/35 mb-3 cursor-pointer hover:border-amber-300 transition flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="relative shrink-0">
              <img src="${playerPicUrl(leader.player_id)}" class="w-11 h-14 rounded-lg object-cover bg-slate-950 border border-amber-400/50" onerror="this.style.display='none'">
              <span class="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] flex items-center justify-center shadow">#1</span>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <img src="${teamLogoUrl(leader.team_logo)}" class="w-4 h-4 object-contain shrink-0">
                <span class="text-sm font-black text-white truncate hover:underline">${leader.name}</span>
              </div>
              <div class="text-[11px] text-slate-300 font-mono flex flex-wrap items-center gap-1.5 mt-0.5">
                <span class="font-bold text-sky-300">${leader.team_abbr}</span>
                <span>•</span>
                <span>${leader.position || leader.role || ''}</span>
                ${leader.pa ? `<span>• ${leader.pa} PA</span>` : (leader.ip_display ? `<span>• ${leader.ip_display} IP</span>` : (leader.fld_g ? `<span>• ${leader.fld_g} G</span>` : ''))}
              </div>
              ${awardPills ? `<div class="flex flex-wrap gap-1 mt-1">${awardPills}</div>` : ''}
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-2xl font-black font-mono text-amber-300 tracking-tight">${cat.fmt(leader[cat.key])}</div>
            <div class="text-[10px] font-mono text-slate-400">${leader.war !== undefined ? `${Number(leader.war).toFixed(1)} WAR` : `${leader.zr !== undefined ? `${Number(leader.zr).toFixed(1)} ZR` : ''}`}</div>
          </div>
        </div>

        <!-- #2 to #10 Contenders -->
        <div class="space-y-1">
          ${chases.map((pl, idx) => `
            <div onclick="openPlayerModal(${pl.player_id})" class="px-2 py-1 rounded-lg hover:bg-slate-800/70 cursor-pointer transition flex items-center justify-between text-xs">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-5 text-[11px] font-mono font-bold text-slate-400">${idx + 2}.</span>
                <img src="${teamLogoUrl(pl.team_logo)}" class="w-3.5 h-3.5 object-contain shrink-0">
                <span class="font-semibold text-slate-200 truncate hover:text-white">${pl.name}</span>
                <span class="text-[10px] font-mono text-slate-400">${pl.team_abbr}</span>
              </div>
              <span class="font-mono font-bold text-white ml-2">${cat.fmt(pl[cat.key])}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderLeagueLeadersSubView(container) {
  const data = AppState.leadersData;
  if (!data || data.error) {
    container.innerHTML = `<div class="glass-card p-8 text-center text-rose-400">${(data && data.error) || 'Failed to load League Leaders'}</div>`;
    return;
  }

  const qual = data.qualification || {};
  const subLeagues = data.sub_leagues || [];
  const teams = data.teams || [];
  const catTab = AppState.leadersCategoryTab || "batting";
  const qualMode = AppState.leadersQualMode || "qualified";
  const slFilter = AppState.leadersSubLeague || "ALL";
  const teamFilter = Number(AppState.leadersTeam) || 0;
  const posFilter = AppState.leadersPos || "";
  const roleFilter = AppState.leadersPitcherRole || "ALL";

  const filterPlayer = (p, isPitcher = false) => {
    if (slFilter !== "ALL" && Number(p.sub_league_id) !== Number(slFilter)) return false;
    if (teamFilter && Number(p.team_id) !== teamFilter) return false;
    if (isPitcher) {
      if (roleFilter === "SP" && p.role !== "SP" && Number(p.gs || 0) < Number(p.g || 0) * 0.4) return false;
      if (roleFilter === "RP" && p.role === "SP" && Number(p.gs || 0) >= Number(p.g || 0) * 0.4) return false;
    } else if (posFilter && p.position !== posFilter) {
      return false;
    }
    return true;
  };

  const batters = (data.batters || []).filter(b => filterPlayer(b, false));
  const pitchers = (data.pitchers || []).filter(p => filterPlayer(p, true));
  const fielders = (data.fielders || []).filter(f => filterPlayer(f, false));

  let bodyHtml = "";
  if (catTab === "batting") {
    const groups = ["Slash & Rate", "Sabermetric", "Counting"];
    bodyHtml = groups.map(grp => {
      const cats = BATTING_LEADER_CATEGORIES.filter(c => c.group === grp);
      return `
        <div class="space-y-3">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 class="text-sm font-black uppercase tracking-wider text-sky-300 flex items-center gap-2">
              <i class="bi bi-trophy-fill text-amber-400"></i> Batting — ${grp} Leaders (${cats.length} Categories)
            </h3>
            <span class="text-xs font-mono text-slate-400">Rate Qualifier: ${qual.bat_rule_desc || `${qual.qual_pa} PA`}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 uw:grid-cols-5 gap-4">
            ${cats.map(c => renderLeaderCardHtml(c, batters, `${qual.qual_pa} PA`, qualMode)).join("")}
          </div>
        </div>
      `;
    }).join('<div class="my-6"></div>');
  } else if (catTab === "pitching") {
    const groups = ["Rate & Command", "Sabermetric", "Counting & Bullpen"];
    const pQualLabel = roleFilter === "RP" ? `${qual.qual_reliever_ip} IP (Reliever)` : `${qual.qual_ip} IP`;
    bodyHtml = groups.map(grp => {
      const cats = PITCHING_LEADER_CATEGORIES.filter(c => c.group === grp);
      return `
        <div class="space-y-3">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 class="text-sm font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
              <i class="bi bi-fire text-amber-400"></i> Pitching — ${grp} Leaders (${cats.length} Categories)
            </h3>
            <span class="text-xs font-mono text-slate-400">Rate Qualifier: ${pQualLabel}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 uw:grid-cols-5 gap-4">
            ${cats.map(c => renderLeaderCardHtml({ ...c, pool: "pitchers" }, pitchers, pQualLabel, qualMode)).join("")}
          </div>
        </div>
      `;
    }).join('<div class="my-6"></div>');
  } else if (catTab === "fielding") {
    const groups = ["Advanced Defense", "Rate & Range", "Counting Defense"];
    bodyHtml = groups.map(grp => {
      const cats = FIELDING_LEADER_CATEGORIES.filter(c => c.group === grp);
      return `
        <div class="space-y-3">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 class="text-sm font-black uppercase tracking-wider text-emerald-300 flex items-center gap-2">
              <i class="bi bi-shield-fill-check text-emerald-400"></i> Fielding & Defense — ${grp} Leaders (${cats.length} Categories)
            </h3>
            <span class="text-xs font-mono text-slate-400">Qualifier: ${qual.fld_rule_desc || `${qual.qual_fld_g} G`}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 uw:grid-cols-4 gap-4">
            ${cats.map(c => renderLeaderCardHtml(c, fielders, `${qual.qual_fld_g} G`, qualMode)).join("")}
          </div>
        </div>
      `;
    }).join('<div class="my-6"></div>');
  } else if (catTab === "statcast") {
    const groups = ["Batter Statcast", "Baserunning & Speed", "Pitcher Statcast"];
    bodyHtml = groups.map(grp => {
      const cats = STATCAST_LEADER_CATEGORIES.filter(c => c.group === grp);
      return `
        <div class="space-y-3">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 class="text-sm font-black uppercase tracking-wider text-purple-300 flex items-center gap-2">
              <i class="bi bi-bullseye text-purple-400"></i> ${grp} Leaders (${cats.length} Categories)
            </h3>
            <span class="text-xs font-mono text-slate-400">Batted-Ball & Speed Tracking</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            ${cats.map(c => {
              const pool = c.pool === "pitchers" ? pitchers : batters;
              const qLabel = c.pool === "pitchers" ? `${qual.qual_ip} IP` : `${qual.qual_pa} PA`;
              return renderLeaderCardHtml(c, pool, qLabel, qualMode);
            }).join("")}
          </div>
        </div>
      `;
    }).join('<div class="my-6"></div>');
  } else {
    // Sortable Master Qualified Table
    const dom = AppState.leadersTableDomain || "batting";
    let rowsHtml = "";
    let headersHtml = "";
    if (dom === "batting") {
      const pool = qualMode === "qualified" ? batters.filter(b => b.is_qualified) : (qualMode === "half" ? batters.filter(b => b.is_half_qualified) : batters);
      headersHtml = `
        <th>#</th><th>Player</th><th>Team</th><th>Pos</th><th>G</th><th>PA</th><th>AB</th><th>R</th><th>H</th><th>2B</th><th>3B</th><th>HR</th><th>RBI</th><th>SB</th><th>BB</th><th>K</th>
        <th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>ISO</th><th>BABIP</th><th>wOBA</th><th>xwOBA</th><th>wRC+</th><th>OPS+</th><th>WPA</th><th>UBR</th><th>ZR</th><th>WAR</th>
      `;
      rowsHtml = pool.slice(0, 250).map((b, i) => `
        <tr onclick="openPlayerModal(${b.player_id})" class="cursor-pointer">
          <td class="text-slate-400 font-mono">${i + 1}</td>
          <td class="font-bold text-white">${b.name}</td>
          <td><div class="flex items-center gap-1.5"><img src="${teamLogoUrl(b.team_logo)}" class="w-4 h-4 object-contain"><span>${b.team_abbr}</span></div></td>
          <td>${b.position}</td>
          <td>${b.g}</td><td>${b.pa}</td><td>${b.ab}</td><td>${b.r}</td><td>${b.h}</td><td>${b["2b"]}</td><td>${b["3b"]}</td>
          <td class="font-bold text-amber-300">${b.hr}</td><td class="font-bold text-emerald-300">${b.rbi}</td><td>${b.sb}</td><td>${b.bb}</td><td>${b.k}</td>
          <td class="font-bold text-white">${fmtAvg(b.avg)}</td><td>${fmtAvg(b.obp)}</td><td>${fmtAvg(b.slg)}</td><td class="font-bold text-sky-300">${fmtAvg(b.ops)}</td>
          <td>${fmtAvg(b.iso)}</td><td>${fmtAvg(b.babip)}</td><td class="font-bold text-amber-300">${fmtAvg(b.woba)}</td><td>${fmtAvg(b.xwoba)}</td>
          <td class="font-bold text-emerald-400">${b.wrc_plus}</td><td>${b.ops_plus}</td><td>${b.wpa.toFixed(2)}</td><td>${b.ubr.toFixed(1)}</td><td>${b.zr.toFixed(1)}</td>
          <td class="font-black text-sky-400">${b.war.toFixed(1)}</td>
        </tr>
      `).join("");
    } else if (dom === "pitching") {
      const pool = qualMode === "qualified"
        ? pitchers.filter(p => roleFilter === "RP" ? p.is_reliever_qualified : p.is_qualified)
        : (qualMode === "half" ? pitchers.filter(p => p.is_reliever_qualified) : pitchers);
      headersHtml = `
        <th>#</th><th>Pitcher</th><th>Team</th><th>Role</th><th>G</th><th>GS</th><th>W</th><th>L</th><th>SV</th><th>HLD</th><th>QS</th><th>IP</th>
        <th>ERA</th><th>WHIP</th><th>FIP</th><th>xFIP</th><th>SIERA</th><th>ERA+</th><th>FIP-</th><th>K</th><th>BB</th><th>K/9</th><th>BB/9</th><th>HR/9</th><th>K/BB</th><th>K-BB%</th><th>WPA</th><th>RA9-WAR</th><th>WAR</th>
      `;
      rowsHtml = pool.slice(0, 250).map((p, i) => `
        <tr onclick="openPlayerModal(${p.player_id})" class="cursor-pointer">
          <td class="text-slate-400 font-mono">${i + 1}</td>
          <td class="font-bold text-white">${p.name}</td>
          <td><div class="flex items-center gap-1.5"><img src="${teamLogoUrl(p.team_logo)}" class="w-4 h-4 object-contain"><span>${p.team_abbr}</span></div></td>
          <td>${p.role}</td>
          <td>${p.g}</td><td>${p.gs}</td><td class="font-bold text-emerald-300">${p.w}</td><td>${p.l}</td><td class="font-bold text-amber-300">${p.sv}</td><td>${p.hld}</td><td>${p.qs}</td>
          <td class="font-mono">${p.ip_display}</td>
          <td class="font-bold text-amber-300">${p.era.toFixed(2)}</td><td>${p.whip.toFixed(2)}</td><td class="font-bold text-sky-300">${p.fip.toFixed(2)}</td>
          <td>${p.xfip.toFixed(2)}</td><td>${p.siera.toFixed(2)}</td><td class="font-bold text-emerald-400">${p.era_plus}</td><td>${p.fip_minus}</td>
          <td class="font-bold text-white">${p.k}</td><td>${p.bb}</td><td>${p.k9.toFixed(2)}</td><td>${p.bb9.toFixed(2)}</td><td>${p.hr9.toFixed(2)}</td>
          <td>${p.k_bb.toFixed(2)}</td><td>${p.k_minus_bb.toFixed(1)}%</td><td>${p.wpa.toFixed(2)}</td><td>${p.ra9war.toFixed(1)}</td>
          <td class="font-black text-sky-400">${p.war.toFixed(1)}</td>
        </tr>
      `).join("");
    } else {
      const pool = qualMode === "qualified" ? fielders.filter(f => f.is_qualified) : fielders;
      headersHtml = `
        <th>#</th><th>Fielder</th><th>Team</th><th>Pos</th><th>G</th><th>GS</th><th>Inn</th><th>TC</th><th>PO</th><th>A</th><th>E</th><th>DP</th><th>FLD%</th><th>RF/9</th><th>ZR</th><th>Framing</th><th>ARM</th><th>Def Runs</th>
      `;
      rowsHtml = pool.slice(0, 250).map((f, i) => `
        <tr onclick="openPlayerModal(${f.player_id})" class="cursor-pointer">
          <td class="text-slate-400 font-mono">${i + 1}</td>
          <td class="font-bold text-white">${f.name}</td>
          <td><div class="flex items-center gap-1.5"><img src="${teamLogoUrl(f.team_logo)}" class="w-4 h-4 object-contain"><span>${f.team_abbr}</span></div></td>
          <td>${f.position}</td>
          <td>${f.fld_g}</td><td>${f.fld_gs}</td><td>${f.fld_ip.toFixed(1)}</td><td>${f.tc}</td><td>${f.po}</td><td>${f.a}</td><td>${f.e}</td><td>${f.dp}</td>
          <td class="font-bold text-white">${fmtAvg(f.fld_pct)}</td><td>${f.rf9.toFixed(2)}</td>
          <td class="font-bold ${f.zr >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${f.zr > 0 ? '+' : ''}${f.zr.toFixed(2)}</td>
          <td>${f.framing > 0 ? '+' : ''}${f.framing.toFixed(2)}</td>
          <td>${f.arm > 0 ? '+' : ''}${f.arm.toFixed(2)}</td>
          <td class="font-black text-sky-400">${f.def_runs > 0 ? '+' : ''}${f.def_runs.toFixed(2)}</td>
        </tr>
      `).join("");
    }

    bodyHtml = `
      <div class="glass-card p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <button onclick="setLeadersOption('leadersTableDomain','batting')" class="px-3 py-1.5 rounded-xl text-xs font-extrabold ${dom === 'batting' ? 'bg-sky-500 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-700'}">Batting Table</button>
            <button onclick="setLeadersOption('leadersTableDomain','pitching')" class="px-3 py-1.5 rounded-xl text-xs font-extrabold ${dom === 'pitching' ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-700'}">Pitching Table</button>
            <button onclick="setLeadersOption('leadersTableDomain','fielding')" class="px-3 py-1.5 rounded-xl text-xs font-extrabold ${dom === 'fielding' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-700'}">Fielding Table</button>
          </div>
          <div class="text-xs text-slate-400 font-mono">Click any column header to sort • Click any player row for full Scouting Dossier</div>
        </div>
        <div class="overflow-x-auto max-h-[72vh]">
          <table class="saber-table">
            <thead><tr>${headersHtml}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // Triple Crown & Awards Bar
  const tcList = data.triple_crown || [];
  const awards = data.season_awards || [];

  container.innerHTML = `
    <div class="animate-view space-y-5">
      <!-- Top Command Banner -->
      <div class="glass-card p-5 border-l-4 border-l-amber-400">
        <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-400/40">
                <i class="bi bi-award-fill mr-1"></i> Official League Leaders Hub
              </span>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-900 text-sky-300 border border-slate-700">
                Season ${data.season_year} • ${data.league_name}
              </span>
            </div>
            <h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight">Qualified Statistical Leaders (${BATTING_LEADER_CATEGORIES.length + PITCHING_LEADER_CATEGORIES.length + FIELDING_LEADER_CATEGORIES.length + STATCAST_LEADER_CATEGORIES.length} Categories)</h2>
            <div class="text-xs text-slate-300 font-mono mt-1 flex flex-wrap gap-4">
              <span><i class="bi bi-check2-circle text-emerald-400 mr-1"></i>Batters: <b class="text-white">${qual.bat_rule_desc}</b></span>
              <span><i class="bi bi-check2-circle text-amber-400 mr-1"></i>Starters: <b class="text-white">${qual.pit_rule_desc}</b></span>
              <span><i class="bi bi-check2-circle text-sky-400 mr-1"></i>Relievers: <b class="text-white">${qual.rel_rule_desc}</b></span>
              <span><i class="bi bi-check2-circle text-purple-400 mr-1"></i>Defense: <b class="text-white">${qual.fld_rule_desc}</b></span>
            </div>
          </div>

          <!-- Qualification Mode Switcher -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1">
              <button onclick="setLeadersOption('leadersQualMode','qualified')" class="px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${qualMode === 'qualified' ? 'bg-amber-400 text-slate-950 shadow' : 'text-slate-300 hover:text-white'}">
                Official Qualified
              </button>
              <button onclick="setLeadersOption('leadersQualMode','half')" class="px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${qualMode === 'half' ? 'bg-sky-400 text-slate-950 shadow' : 'text-slate-300 hover:text-white'}">
                50% Qualifier
              </button>
              <button onclick="setLeadersOption('leadersQualMode','all')" class="px-3 py-1.5 rounded-lg text-xs font-extrabold transition ${qualMode === 'all' ? 'bg-emerald-400 text-slate-950 shadow' : 'text-slate-300 hover:text-white'}">
                All Players
              </button>
            </div>
          </div>
        </div>

        <!-- Triple Crown Watch Cards -->
        ${tcList.length ? `
          <div class="grid grid-cols-1 lg:grid-cols-${Math.min(3, tcList.length)} gap-3 mt-4 pt-4 border-t border-slate-800/80">
            ${tcList.map(tc => `
              <div class="bg-slate-950/75 border border-slate-800 rounded-xl p-3 flex flex-col justify-between gap-2">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-black uppercase tracking-wider text-amber-300"><i class="bi bi-stars mr-1"></i>${tc.scope} — Triple Crown Watch</span>
                  <div class="flex gap-1">
                    ${tc.batting.is_triple_crown ? `<span class="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[10px]">BATTING TRIPLE CROWN!</span>` : ''}
                    ${tc.pitching.is_triple_crown ? `<span class="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-black text-[10px]">PITCHING TRIPLE CROWN!</span>` : ''}
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div class="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80 space-y-0.5">
                    <div class="text-[10px] text-sky-300 font-bold uppercase mb-1">Batting Crown</div>
                    ${tc.batting.avg ? `<div class="flex justify-between"><span class="text-slate-400">AVG:</span><span class="text-white font-bold truncate ml-1">${tc.batting.avg.name} (${fmtAvg(tc.batting.avg.value)})</span></div>` : ''}
                    ${tc.batting.hr ? `<div class="flex justify-between"><span class="text-slate-400">HR:</span><span class="text-white font-bold truncate ml-1">${tc.batting.hr.name} (${tc.batting.hr.value})</span></div>` : ''}
                    ${tc.batting.rbi ? `<div class="flex justify-between"><span class="text-slate-400">RBI:</span><span class="text-white font-bold truncate ml-1">${tc.batting.rbi.name} (${tc.batting.rbi.value})</span></div>` : ''}
                  </div>
                  <div class="bg-slate-900/80 p-2 rounded-lg border border-slate-800/80 space-y-0.5">
                    <div class="text-[10px] text-amber-300 font-bold uppercase mb-1">Pitching Crown</div>
                    ${tc.pitching.era ? `<div class="flex justify-between"><span class="text-slate-400">ERA:</span><span class="text-white font-bold truncate ml-1">${tc.pitching.era.name} (${Number(tc.pitching.era.value).toFixed(2)})</span></div>` : ''}
                    ${tc.pitching.w ? `<div class="flex justify-between"><span class="text-slate-400">W:</span><span class="text-white font-bold truncate ml-1">${tc.pitching.w.name} (${tc.pitching.w.value})</span></div>` : ''}
                    ${tc.pitching.k ? `<div class="flex justify-between"><span class="text-slate-400">K:</span><span class="text-white font-bold truncate ml-1">${tc.pitching.k.name} (${tc.pitching.k.value})</span></div>` : ''}
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        ` : ''}
      </div>

      <!-- Category Domain & Filter Bar -->
      <div class="glass-card p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-1.5">
          <button onclick="setLeadersOption('leadersCategoryTab','batting')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-1.5 ${catTab === 'batting' ? 'bg-sky-500 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
            <i class="bi bi-trophy-fill"></i> Batting (${BATTING_LEADER_CATEGORIES.length})
          </button>
          <button onclick="setLeadersOption('leadersCategoryTab','pitching')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-1.5 ${catTab === 'pitching' ? 'bg-amber-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
            <i class="bi bi-fire"></i> Pitching (${PITCHING_LEADER_CATEGORIES.length})
          </button>
          <button onclick="setLeadersOption('leadersCategoryTab','fielding')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-1.5 ${catTab === 'fielding' ? 'bg-emerald-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
            <i class="bi bi-shield-fill-check"></i> Fielding & Defense (${FIELDING_LEADER_CATEGORIES.length})
          </button>
          <button onclick="setLeadersOption('leadersCategoryTab','statcast')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-1.5 ${catTab === 'statcast' ? 'bg-purple-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
            <i class="bi bi-bullseye"></i> Statcast & Speed (${STATCAST_LEADER_CATEGORIES.length})
          </button>
          <button onclick="setLeadersOption('leadersCategoryTab','table')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition flex items-center gap-1.5 ${catTab === 'table' ? 'bg-white text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
            <i class="bi bi-table"></i> Sortable Master Table
          </button>
        </div>

        <!-- Sub-League, Team, Position & Role Filters -->
        <div class="flex flex-wrap items-center gap-2">
          ${subLeagues.length > 1 ? `
            <div class="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
              <button onclick="setLeadersOption('leadersSubLeague','ALL')" class="px-2.5 py-1 rounded-lg text-xs font-bold ${slFilter === 'ALL' ? 'bg-slate-200 text-slate-950' : 'text-slate-300'}">All</button>
              ${subLeagues.map(sl => `
                <button onclick="setLeadersOption('leadersSubLeague','${sl.sub_league_id}')" class="px-2.5 py-1 rounded-lg text-xs font-bold ${String(slFilter) === String(sl.sub_league_id) ? 'bg-slate-200 text-slate-950' : 'text-slate-300'}" title="${sl.name}">${sl.abbr || sl.name}</button>
              `).join("")}
            </div>
          ` : ''}

          <select onchange="setLeadersOption('leadersTeam', this.value)" class="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white">
            <option value="">All Teams (${teams.length})</option>
            ${teams.map(t => `<option value="${t.team_id}" ${Number(teamFilter) === Number(t.team_id) ? 'selected' : ''}>${t.abbr} — ${t.name}</option>`).join("")}
          </select>

          ${catTab === "pitching" ? `
            <select onchange="setLeadersOption('leadersPitcherRole', this.value)" class="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white">
              <option value="ALL" ${roleFilter === 'ALL' ? 'selected' : ''}>All Pitchers</option>
              <option value="SP" ${roleFilter === 'SP' ? 'selected' : ''}>Starters (SP)</option>
              <option value="RP" ${roleFilter === 'RP' ? 'selected' : ''}>Relievers (RP / CL)</option>
            </select>
          ` : `
            <select onchange="setLeadersOption('leadersPos', this.value)" class="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white">
              <option value="">All Positions</option>
              ${["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"].map(pos => `<option value="${pos}" ${posFilter === pos ? 'selected' : ''}>${pos}</option>`).join("")}
            </select>
          `}
        </div>
      </div>

      ${bodyHtml}
    </div>
  `;

  if (catTab === "table") {
    initSortableTables(container);
  }
}


// ============================================================================
// MODULE 10: ALL-TIME LEAGUE RECORDS BOOK & HISTORY LEADERBOARDS
// ============================================================================

async function renderRecordsTab(container) {
  if (!AppState.recordsData) {
    showLoading("Compiling All-Time Single-Season, Career, Single-Game & Streak Record Book...");
    try {
      const lid = AppState.activeLeagueId || "";
      AppState.recordsData = await fetchJSON(`/api/records?save=${AppState.activeSave}&league_id=${lid}`);
    } finally {
      hideLoading();
    }
  }
  renderRecordsSubView(container);
}

window.setRecordsOption = function(key, val) {
  AppState[key] = val;
  const container = document.getElementById("main-view-container");
  if (container) renderRecordsSubView(container);
};

function fmtRecordValue(key, val) {
  if (val === undefined || val === null) return "—";
  if (["avg", "obp", "slg", "ops", "iso", "woba", "w_pct", "pct"].includes(key)) return fmtAvg(val);
  if (["era", "whip", "fip", "k9", "h9", "k_bb", "wpa", "ubr", "zr", "framing", "arm", "def_runs"].includes(key)) return Number(val).toFixed(2);
  if (["war", "ra9war", "ip"].includes(key)) return Number(val).toFixed(1);
  return Number(val).toLocaleString();
}

function renderRecordLeaderboardCard(recObj, modeLabel, isCareer = false) {
  if (!recObj || !recObj.leaders || !recObj.leaders.length) return "";
  const top = recObj.leaders[0];
  const rest = recObj.leaders.slice(1, 10);
  const key = recObj.key;

  return `
    <div class="glass-card p-4 border border-slate-800/90 flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5 mb-3">
          <div>
            <div class="text-xs font-black text-white uppercase tracking-tight">${recObj.label}</div>
            <div class="text-[10px] font-mono text-slate-400">${modeLabel}${recObj.min_pa_qual ? ` • Min ${recObj.min_pa_qual} PA` : (recObj.min_ip_qual ? ` • Min ${recObj.min_ip_qual} IP` : '')}</div>
          </div>
          <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono font-bold text-emerald-300 uppercase">${recObj.group || ''}</span>
        </div>

        <!-- All-Time Record Holder (#1) -->
        <div onclick="openPlayerModal(${top.player_id})" class="p-3 rounded-xl bg-gradient-to-r from-emerald-500/15 via-slate-900/90 to-slate-950 border border-emerald-400/40 mb-3 cursor-pointer hover:border-emerald-300 transition flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="relative shrink-0">
              <img src="${playerPicUrl(top.player_id)}" class="w-11 h-14 rounded-lg object-cover bg-slate-950 border border-emerald-400/50" onerror="this.style.display='none'">
              <span class="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-emerald-400 text-slate-950 font-black text-[10px] flex items-center justify-center shadow">#1</span>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <img src="${teamLogoUrl(top.team?.logo)}" class="w-4 h-4 object-contain shrink-0">
                <span class="text-sm font-black text-white truncate hover:underline">${top.name}</span>
                ${top.is_hof ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-400 text-slate-950" title="Inducted Hall of Famer">HOF</span>` : ''}
              </div>
              <div class="text-[11px] text-slate-300 font-mono mt-0.5">
                <span class="font-bold text-sky-300">${top.team?.abbr || ''}</span>
                • <span>${isCareer ? `${top.years} (${top.seasons} Yr)` : `Season ${top.year}`}</span>
                • <span>${top.position}</span>
              </div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-2xl font-black font-mono text-emerald-300">${fmtRecordValue(key, top.value)}</div>
            <div class="text-[10px] font-mono text-slate-400">${top.war !== undefined ? `${Number(top.war).toFixed(1)} WAR` : `${top.g} G`}</div>
          </div>
        </div>

        <!-- #2 to #10 All-Time List -->
        <div class="space-y-1">
          ${rest.map(item => `
            <div onclick="openPlayerModal(${item.player_id})" class="px-2 py-1 rounded-lg hover:bg-slate-800/70 cursor-pointer transition flex items-center justify-between text-xs">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-5 text-[11px] font-mono font-bold text-slate-400">${item.rank}.</span>
                <img src="${teamLogoUrl(item.team?.logo)}" class="w-3.5 h-3.5 object-contain shrink-0">
                <span class="font-semibold text-slate-200 truncate hover:text-white">${item.name}</span>
                ${item.is_hof ? `<span class="px-1 py-0.2 rounded text-[8px] font-black bg-amber-400/25 text-amber-300 border border-amber-400/40">HOF</span>` : ''}
                <span class="text-[10px] font-mono text-slate-400">${item.team?.abbr || ''} (${isCareer ? item.years : item.year})</span>
              </div>
              <span class="font-mono font-bold text-white ml-2">${fmtRecordValue(key, item.value)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderRecordsSubView(container) {
  const data = AppState.recordsData;
  if (!data || data.error) {
    container.innerHTML = `<div class="glass-card p-8 text-center text-rose-400">${(data && data.error) || 'Failed to load League Records'}</div>`;
    return;
  }

  const subTab = AppState.recordsSubTab || "side_by_side";
  const dom = AppState.recordsDomain || "batting";
  const sBat = data.season_batting_records || {};
  const cBat = data.career_batting_records || {};
  const sPit = data.season_pitching_records || {};
  const cPit = data.career_pitching_records || {};
  const sFld = data.season_fielding_records || {};
  const cFld = data.career_fielding_records || {};

  let activeSeasonMap = sBat;
  let activeCareerMap = cBat;
  if (dom === "pitching") {
    activeSeasonMap = sPit;
    activeCareerMap = cPit;
  } else if (dom === "fielding") {
    activeSeasonMap = sFld;
    activeCareerMap = cFld;
  }

  let viewHtml = "";

  if (subTab === "side_by_side") {
    const keys = Object.keys(activeSeasonMap);
    const selKey = (AppState.recordsSelectedMetric && activeSeasonMap[AppState.recordsSelectedMetric]) ? AppState.recordsSelectedMetric : (keys[0] || "hr");
    const selSeason = activeSeasonMap[selKey] || { leaders: [] };
    const selCareer = activeCareerMap[selKey] || { leaders: [] };

    viewHtml = `
      <div class="space-y-5">
        <!-- Domain Switcher + OOTP History Index Side-by-Side Table -->
        <div class="glass-card p-4">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
            <div class="flex items-center gap-2">
              <button onclick="setRecordsOption('recordsDomain','batting')" class="px-4 py-2 rounded-xl text-xs font-extrabold uppercase ${dom === 'batting' ? 'bg-sky-500 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-700'}">
                <i class="bi bi-trophy-fill mr-1"></i> Batting Record Book (${Object.keys(sBat).length} Categories)
              </button>
              <button onclick="setRecordsOption('recordsDomain','pitching')" class="px-4 py-2 rounded-xl text-xs font-extrabold uppercase ${dom === 'pitching' ? 'bg-amber-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-700'}">
                <i class="bi bi-fire mr-1"></i> Pitching Record Book (${Object.keys(sPit).length} Categories)
              </button>
              <button onclick="setRecordsOption('recordsDomain','fielding')" class="px-4 py-2 rounded-xl text-xs font-extrabold uppercase ${dom === 'fielding' ? 'bg-emerald-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-700'}">
                <i class="bi bi-shield-fill-check mr-1"></i> Defensive Record Book (${Object.keys(sFld).length} Categories)
              </button>
            </div>
            <div class="text-xs font-mono text-slate-400">Click any category row below to inspect full Top-15 Single-Season vs. Top-20 Career Leaderboards</div>
          </div>

          <!-- Side-by-Side Master Summary Table (Single-Season #1 vs Career #1) -->
          <div class="overflow-x-auto">
            <table class="saber-table">
              <thead>
                <tr>
                  <th>Statistic Category</th>
                  <th>Group</th>
                  <th>Single-Season Record Holder (#1)</th>
                  <th>Team / Year</th>
                  <th class="text-right">Season Record</th>
                  <th>All-Time Career Record Holder (#1)</th>
                  <th>Primary Team / Span</th>
                  <th class="text-right">Career Record</th>
                </tr>
              </thead>
              <tbody>
                ${keys.map(k => {
                  const sObj = activeSeasonMap[k];
                  const cObj = activeCareerMap[k];
                  const s1 = sObj?.leaders?.[0];
                  const c1 = cObj?.leaders?.[0];
                  const isSel = k === selKey;
                  return `
                    <tr onclick="setRecordsOption('recordsSelectedMetric','${k}')" class="cursor-pointer ${isSel ? 'bg-sky-500/15 border-l-4 border-l-sky-400' : ''}">
                      <td class="font-extrabold text-white">${sObj?.label || k}</td>
                      <td><span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300">${sObj?.group || ''}</span></td>
                      <td>
                        ${s1 ? `
                          <div class="flex items-center gap-2">
                            <img src="${teamLogoUrl(s1.team?.logo)}" class="w-4 h-4 object-contain">
                            <span onclick="event.stopPropagation(); openPlayerModal(${s1.player_id})" class="font-bold text-sky-300 hover:underline">${s1.name}</span>
                            ${s1.is_hof ? `<span class="px-1 py-0.2 rounded text-[9px] font-black bg-amber-400 text-slate-950">HOF</span>` : ''}
                          </div>
                        ` : '—'}
                      </td>
                      <td class="font-mono text-xs text-slate-300">${s1 ? `${s1.team?.abbr || ''} (${s1.year})` : '—'}</td>
                      <td class="text-right font-mono font-black text-base text-emerald-300">${s1 ? fmtRecordValue(k, s1.value) : '—'}</td>
                      <td>
                        ${c1 ? `
                          <div class="flex items-center gap-2">
                            <img src="${teamLogoUrl(c1.team?.logo)}" class="w-4 h-4 object-contain">
                            <span onclick="event.stopPropagation(); openPlayerModal(${c1.player_id})" class="font-bold text-amber-300 hover:underline">${c1.name}</span>
                            ${c1.is_hof ? `<span class="px-1 py-0.2 rounded text-[9px] font-black bg-amber-400 text-slate-950">HOF</span>` : ''}
                          </div>
                        ` : '—'}
                      </td>
                      <td class="font-mono text-xs text-slate-300">${c1 ? `${c1.team?.abbr || ''} (${c1.years})` : '—'}</td>
                      <td class="text-right font-mono font-black text-base text-amber-300">${c1 ? fmtRecordValue(k, c1.value) : '—'}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Deep-Dive Side-by-Side Comparison for Selected Category -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="glass-card p-5 border-t-4 border-t-emerald-400">
            <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <h3 class="text-base font-black text-white uppercase"><i class="bi bi-lightning-charge-fill text-emerald-400 mr-1.5"></i>Single-Season Top 15 — ${selSeason.label || selKey}</h3>
              <span class="text-xs font-mono text-slate-400">All-Time Single-Season Leaders</span>
            </div>
            <div class="overflow-x-auto">
              <table class="saber-table">
                <thead><tr><th>Rank</th><th>Player</th><th>Team</th><th>Year</th><th>Pos</th><th class="text-right">${selSeason.label || 'Value'}</th></tr></thead>
                <tbody>
                  ${(selSeason.leaders || []).map(l => `
                    <tr onclick="openPlayerModal(${l.player_id})" class="cursor-pointer">
                      <td class="font-mono font-bold ${l.rank === 1 ? 'text-emerald-300' : 'text-slate-400'}">#${l.rank}</td>
                      <td>
                        <div class="flex items-center gap-2">
                          <img src="${playerPicUrl(l.player_id)}" class="w-6 h-8 rounded object-cover bg-slate-900" onerror="this.style.display='none'">
                          <span class="font-bold text-white">${l.name}</span>
                          ${l.is_hof ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-400 text-slate-950">HOF</span>` : ''}
                        </div>
                      </td>
                      <td><div class="flex items-center gap-1.5"><img src="${teamLogoUrl(l.team?.logo)}" class="w-4 h-4 object-contain"><span>${l.team?.abbr || ''}</span></div></td>
                      <td class="font-mono text-sky-300 font-bold">${l.year}</td>
                      <td>${l.position}</td>
                      <td class="text-right font-mono font-black text-emerald-300 text-sm">${fmtRecordValue(selKey, l.value)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>

          <div class="glass-card p-5 border-t-4 border-t-amber-400">
            <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <h3 class="text-base font-black text-white uppercase"><i class="bi bi-infinity text-amber-400 mr-1.5"></i>Career Top 20 — ${selCareer.label || selKey}</h3>
              <span class="text-xs font-mono text-slate-400">All-Time Career Leaders</span>
            </div>
            <div class="overflow-x-auto">
              <table class="saber-table">
                <thead><tr><th>Rank</th><th>Player</th><th>Primary Team</th><th>Years (Seasons)</th><th>Pos</th><th class="text-right">${selCareer.label || 'Value'}</th></tr></thead>
                <tbody>
                  ${(selCareer.leaders || []).map(l => `
                    <tr onclick="openPlayerModal(${l.player_id})" class="cursor-pointer">
                      <td class="font-mono font-bold ${l.rank === 1 ? 'text-amber-300' : 'text-slate-400'}">#${l.rank}</td>
                      <td>
                        <div class="flex items-center gap-2">
                          <img src="${playerPicUrl(l.player_id)}" class="w-6 h-8 rounded object-cover bg-slate-900" onerror="this.style.display='none'">
                          <span class="font-bold text-white">${l.name}</span>
                          ${l.is_hof ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-400 text-slate-950">HOF</span>` : ''}
                          ${l.active ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">Active</span>` : ''}
                        </div>
                      </td>
                      <td><div class="flex items-center gap-1.5"><img src="${teamLogoUrl(l.team?.logo)}" class="w-4 h-4 object-contain"><span>${l.team?.abbr || ''}</span></div></td>
                      <td class="font-mono text-slate-300">${l.years} (${l.seasons} yr)</td>
                      <td>${l.position}</td>
                      <td class="text-right font-mono font-black text-amber-300 text-sm">${fmtRecordValue(selKey, l.value)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (subTab === "season_records" || subTab === "career_records") {
    const isCareer = subTab === "career_records";
    const mapToUse = isCareer ? activeCareerMap : activeSeasonMap;
    const modeLabel = isCareer ? "All-Time Career Record" : "Single-Season Record";
    viewHtml = `
      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <button onclick="setRecordsOption('recordsDomain','batting')" class="px-3.5 py-1.5 rounded-xl text-xs font-extrabold uppercase ${dom === 'batting' ? 'bg-sky-500 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-700'}">Batting</button>
            <button onclick="setRecordsOption('recordsDomain','pitching')" class="px-3.5 py-1.5 rounded-xl text-xs font-extrabold uppercase ${dom === 'pitching' ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-700'}">Pitching</button>
            <button onclick="setRecordsOption('recordsDomain','fielding')" class="px-3.5 py-1.5 rounded-xl text-xs font-extrabold uppercase ${dom === 'fielding' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-900 text-slate-300 border border-slate-700'}">Defense</button>
          </div>
          <span class="text-xs font-mono text-slate-400">${modeLabel} Cards (${Object.keys(mapToUse).length} Categories)</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 uw:grid-cols-5 gap-4">
          ${Object.values(mapToUse).map(rec => renderRecordLeaderboardCard(rec, modeLabel, isCareer)).join("")}
        </div>
      </div>
    `;
  } else if (subTab === "single_game") {
    const batFeats = data.single_game_feats?.batting || [];
    const pitFeats = data.single_game_feats?.pitching || [];
    viewHtml = `
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div class="glass-card p-5">
          <h3 class="text-base font-black text-white uppercase mb-3 pb-2 border-b border-slate-800 flex items-center justify-between">
            <span><i class="bi bi-lightning-fill text-amber-400 mr-1.5"></i>Single-Game Batting Explosions</span>
            <span class="text-xs font-mono text-slate-400">Multi-HR, 4+ Hit, 5+ RBI & High-WPA Games</span>
          </h3>
          <div class="overflow-x-auto max-h-[70vh]">
            <table class="saber-table">
              <thead><tr><th>Player</th><th>Team vs Opp</th><th>Date</th><th>Game Line</th><th>TB</th><th>WPA</th><th>Feat Badges</th></tr></thead>
              <tbody>
                ${batFeats.map(f => `
                  <tr onclick="openPlayerModal(${f.player_id})" class="cursor-pointer">
                    <td class="font-bold text-white">${f.name}</td>
                    <td><div class="flex items-center gap-1.5"><img src="${teamLogoUrl(f.team?.logo)}" class="w-4 h-4 object-contain"><span>${f.team?.abbr}</span><span class="text-slate-500">vs</span><span>${f.opponent?.abbr || ''}</span></div></td>
                    <td class="font-mono text-xs text-slate-300">${f.date || '—'}</td>
                    <td class="font-mono font-bold text-amber-300">${f.line}</td>
                    <td class="font-mono font-bold">${f.tb}</td>
                    <td class="font-mono text-emerald-400">${f.wpa > 0 ? '+' : ''}${f.wpa.toFixed(2)}</td>
                    <td><div class="flex flex-wrap gap-1">${(f.badges || []).map(b => `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] font-bold">${b}</span>`).join("")}</div></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="glass-card p-5">
          <h3 class="text-base font-black text-white uppercase mb-3 pb-2 border-b border-slate-800 flex items-center justify-between">
            <span><i class="bi bi-fire text-sky-400 mr-1.5"></i>Single-Game Pitching Gems & No-Hitters</span>
            <span class="text-xs font-mono text-slate-400">No-Hitters, Shutouts, 10+ K & Game Score Leaders</span>
          </h3>
          <div class="overflow-x-auto max-h-[70vh]">
            <table class="saber-table">
              <thead><tr><th>Pitcher</th><th>Team vs Opp</th><th>Date</th><th>Pitching Line</th><th>GSc</th><th>WPA</th><th>Feat Badges</th></tr></thead>
              <tbody>
                ${pitFeats.map(f => `
                  <tr onclick="openPlayerModal(${f.player_id})" class="cursor-pointer">
                    <td class="font-bold text-white">${f.name}</td>
                    <td><div class="flex items-center gap-1.5"><img src="${teamLogoUrl(f.team?.logo)}" class="w-4 h-4 object-contain"><span>${f.team?.abbr}</span><span class="text-slate-500">vs</span><span>${f.opponent?.abbr || ''}</span></div></td>
                    <td class="font-mono text-xs text-slate-300">${f.date || '—'}</td>
                    <td class="font-mono font-bold text-sky-300">${f.line}</td>
                    <td class="font-mono font-black text-emerald-300">${f.game_score}</td>
                    <td class="font-mono text-emerald-400">${f.wpa > 0 ? '+' : ''}${f.wpa.toFixed(2)}</td>
                    <td><div class="flex flex-wrap gap-1">${(f.badges || []).map(b => `<span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/40 text-[10px] font-bold">${b}</span>`).join("")}</div></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } else if (subTab === "streaks") {
    const streaks = data.streaks || [];
    viewHtml = `
      <div class="glass-card p-5">
        <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
          <h3 class="text-base font-black text-white uppercase"><i class="bi bi-activity text-emerald-400 mr-1.5"></i>All-Time Player Streaks (${streaks.length} Historic Streaks)</h3>
          <span class="text-xs font-mono text-slate-400">Hitting, On-Base, Scoring, HR, Scoreless IP & Winning Streaks</span>
        </div>
        <div class="overflow-x-auto max-h-[72vh]">
          <table class="saber-table">
            <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Pos</th><th>Streak Category</th><th>Length</th><th>Started</th><th>Ended</th><th>Status</th></tr></thead>
            <tbody>
              ${streaks.map((st, idx) => `
                <tr onclick="openPlayerModal(${st.player_id})" class="cursor-pointer">
                  <td class="font-mono text-slate-400">${idx + 1}</td>
                  <td class="font-bold text-white">${st.name}</td>
                  <td><div class="flex items-center gap-1.5"><img src="${teamLogoUrl(st.team?.logo)}" class="w-4 h-4 object-contain"><span>${st.team?.abbr || ''}</span></div></td>
                  <td>${st.position}</td>
                  <td class="font-bold text-sky-300">${st.streak_name}</td>
                  <td class="font-mono font-black text-lg text-amber-300">${st.value}</td>
                  <td class="font-mono text-xs text-slate-300">${st.started || '—'}</td>
                  <td class="font-mono text-xs text-slate-300">${st.is_active ? 'Ongoing' : (st.ended || '—')}</td>
                  <td>${st.is_active ? `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[10px] font-black">ACTIVE</span>` : `<span class="text-xs text-slate-500">Completed</span>`}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else {
    const teamRecs = data.team_season_records || [];
    const franRecs = data.franchise_all_time || [];
    const hints = data.league_hints || [];
    viewHtml = `
      <div class="space-y-5">
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div class="glass-card p-5">
            <h3 class="text-base font-black text-white uppercase mb-3 pb-2 border-b border-slate-800">
              <i class="bi bi-shield-fill text-sky-400 mr-1.5"></i>Best Single-Season Team Records
            </h3>
            <div class="overflow-x-auto max-h-[65vh]">
              <table class="saber-table">
                <thead><tr><th>#</th><th>Team</th><th>Year</th><th>W-L</th><th>W%</th><th>Run Diff</th><th>R</th><th>HR</th><th>OPS</th><th>ERA</th></tr></thead>
                <tbody>
                  ${teamRecs.map((t, i) => `
                    <tr onclick="switchTeamAndGo(${t.team_id})" class="cursor-pointer">
                      <td class="font-mono text-slate-400">${i + 1}</td>
                      <td><div class="flex items-center gap-2"><img src="${teamLogoUrl(t.team?.logo)}" class="w-5 h-5 object-contain"><span class="font-bold text-white">${t.team?.full_name}</span></div></td>
                      <td class="font-mono font-bold text-sky-300">${t.year}</td>
                      <td class="font-mono font-bold text-white">${t.w}-${t.l}</td>
                      <td class="font-mono font-black text-emerald-400">${fmtAvg(t.pct)}</td>
                      <td class="font-mono ${t.run_diff >= 0 ? 'text-emerald-300' : 'text-rose-400'}">${t.run_diff > 0 ? '+' : ''}${t.run_diff}</td>
                      <td>${t.runs_scored || '—'}</td>
                      <td>${t.team_hr || '—'}</td>
                      <td>${t.team_ops ? fmtAvg(t.team_ops) : '—'}</td>
                      <td>${t.team_era ? t.team_era.toFixed(2) : '—'}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>

          <div class="glass-card p-5">
            <h3 class="text-base font-black text-white uppercase mb-3 pb-2 border-b border-slate-800">
              <i class="bi bi-building-fill text-amber-400 mr-1.5"></i>All-Time Franchise Win Ledger
            </h3>
            <div class="overflow-x-auto max-h-[65vh]">
              <table class="saber-table">
                <thead><tr><th>#</th><th>Franchise</th><th>Seasons</th><th>All-Time W-L</th><th>W%</th><th>Run Diff</th><th>Best Season</th></tr></thead>
                <tbody>
                  ${franRecs.map((f, i) => `
                    <tr onclick="switchTeamAndGo(${f.team_id})" class="cursor-pointer">
                      <td class="font-mono text-slate-400">${i + 1}</td>
                      <td><div class="flex items-center gap-2"><img src="${teamLogoUrl(f.team?.logo)}" class="w-5 h-5 object-contain"><span class="font-bold text-white">${f.team?.full_name}</span></div></td>
                      <td class="font-mono">${f.seasons}</td>
                      <td class="font-mono font-bold text-white">${f.w.toLocaleString()}-${f.l.toLocaleString()}</td>
                      <td class="font-mono font-black text-amber-300">${fmtAvg(f.pct)}</td>
                      <td class="font-mono ${f.run_diff >= 0 ? 'text-emerald-300' : 'text-rose-400'}">${f.run_diff > 0 ? '+' : ''}${f.run_diff.toLocaleString()}</td>
                      <td class="font-mono text-xs text-sky-300">${f.best_year} (${f.best_record}, ${fmtAvg(f.best_pct)})</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        ${hints.length ? `
          <div class="glass-card p-5">
            <h3 class="text-sm font-black text-amber-300 uppercase mb-3"><i class="bi bi-bookmark-star-fill mr-1.5"></i>Official OOTP Historical Record Book Notes</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              ${hints.map(h => `<div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-200 font-mono">${h}</div>`).join("")}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="animate-view space-y-5">
      <!-- Top Records Header -->
      <div class="glass-card p-5 border-l-4 border-l-emerald-400 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
              <i class="bi bi-journal-bookmark-fill mr-1"></i> Official League Record Book
            </span>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-900 text-sky-300 border border-slate-700">
              ${data.league_name} • ${data.year_span} (${data.num_seasons} Seasons)
            </span>
          </div>
          <h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight">All-Time Single-Season, Career, Game & Franchise Records</h2>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <button onclick="setRecordsOption('recordsSubTab','side_by_side')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase transition ${subTab === 'side_by_side' ? 'bg-emerald-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
            <i class="bi bi-layout-split mr-1"></i> Season vs. Career Book
          </button>
          <button onclick="setRecordsOption('recordsSubTab','season_records')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase transition ${subTab === 'season_records' ? 'bg-sky-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
            <i class="bi bi-lightning-charge-fill mr-1"></i> Single-Season Cards
          </button>
          <button onclick="setRecordsOption('recordsSubTab','career_records')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase transition ${subTab === 'career_records' ? 'bg-amber-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
            <i class="bi bi-infinity mr-1"></i> Career Immortals
          </button>
          <button onclick="setRecordsOption('recordsSubTab','single_game')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase transition ${subTab === 'single_game' ? 'bg-purple-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
            <i class="bi bi-stars mr-1"></i> Single-Game Feats
          </button>
          <button onclick="setRecordsOption('recordsSubTab','streaks')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase transition ${subTab === 'streaks' ? 'bg-rose-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
            <i class="bi bi-activity mr-1"></i> Streaks
          </button>
          <button onclick="setRecordsOption('recordsSubTab','teams')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase transition ${subTab === 'teams' ? 'bg-white text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
            <i class="bi bi-shield-shaded mr-1"></i> Team Records
          </button>
        </div>
      </div>

      ${viewHtml}
    </div>
  `;

  initSortableTables(container);
}


// ============================================================================
// MODULE 11: HALL OF FAME MUSEUM, JAWS ANALYTICS & FUTURE HOF WATCHLIST
// ============================================================================

async function renderHofTab(container) {
  if (!AppState.hofData) {
    showLoading("Loading Cooperstown Hall of Fame Plaques, JAWS Benchmarks & Ballot Watchlist...");
    try {
      const lid = AppState.activeLeagueId || "";
      AppState.hofData = await fetchJSON(`/api/hof?save=${AppState.activeSave}&league_id=${lid}`);
    } finally {
      hideLoading();
    }
  }
  renderHofSubView(container);
}

window.setHofOption = function(key, val) {
  AppState[key] = val;
  const container = document.getElementById("main-view-container");
  if (container) renderHofSubView(container);
};

function renderHofPlaqueCard(p, isProjected = false) {
  const aw = p.awards || {};
  const awardBadges = [];
  if (aw.mvp > 0) awardBadges.push(`${aw.mvp}× MVP`);
  if (aw.cy_young > 0) awardBadges.push(`${aw.cy_young}× Cy Young`);
  if (aw.roy > 0) awardBadges.push(`ROY`);
  if (aw.gold_glove > 0) awardBadges.push(`${aw.gold_glove}× GG`);
  if (aw.silver_slugger > 0) awardBadges.push(`${aw.silver_slugger}× SS`);
  if (aw.all_star > 0) awardBadges.push(`${aw.all_star}× All-Star`);

  const jawsDelta = Number(p.jaws_vs_std || 0);
  const stintsHtml = (p.team_stints || []).map(st => `
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/90 border border-amber-500/25 text-[10px] font-mono text-slate-200">
      <img src="${teamLogoUrl(st.logo)}" class="w-3.5 h-3.5 object-contain">
      <b>${st.abbr}</b> <span class="text-slate-400">${st.span}</span>
    </span>
  `).join("");

  return `
    <div onclick="openPlayerModal(${p.player_id})" class="hof-plaque-card p-5 cursor-pointer flex flex-col justify-between gap-3">
      <div>
        <!-- Top Bronze Header with Portrait, Team Crest & Induction Class -->
        <div class="flex items-start justify-between gap-3 pb-3 border-b border-amber-500/25">
          <div class="flex items-center gap-3.5 min-w-0">
            <div class="relative shrink-0">
              <img src="${playerPicUrl(p.player_id)}" class="w-16 h-20 rounded-xl object-cover bg-slate-950 border-2 border-amber-400/70 shadow-lg" onerror="this.style.display='none'">
              <img src="${teamLogoUrl(p.primary_team?.logo)}" class="w-7 h-7 object-contain absolute -bottom-1.5 -right-1.5 bg-slate-950 rounded-full p-0.5 border border-amber-400/60 shadow">
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${isProjected ? 'bg-sky-500/25 text-sky-300 border border-sky-400/50' : 'bg-amber-400 text-slate-950'}">
                  ${isProjected ? p.hof_tier : `CLASS OF ${p.inducted_year || 'HOF'}`}
                </span>
                <span class="px-2 py-0.5 rounded bg-slate-900 border border-amber-500/30 text-[10px] font-mono font-extrabold text-amber-300">${p.position}</span>
                <span class="text-[11px] font-mono text-slate-400">${p.years_span} (${p.seasons} Seasons)</span>
              </div>
              <h3 class="text-xl font-black text-white tracking-tight mt-1 truncate">${p.name}</h3>
              ${p.nick_name ? `<div class="text-xs italic text-amber-300/90">"${p.nick_name}"</div>` : ''}
              <div class="text-xs font-mono font-bold text-amber-200 mt-0.5">${p.stats?.headline || ''}</div>
            </div>
          </div>
        </div>

        <!-- JAWS Trio Bar (Career WAR / 7-Yr Peak WAR / JAWS) -->
        <div class="grid grid-cols-4 gap-2 my-3 text-center">
          <div class="bg-slate-950/85 p-2 rounded-xl border border-amber-500/20">
            <div class="text-[9px] font-bold uppercase text-slate-400">Career WAR</div>
            <div class="text-base font-black font-mono text-white">${p.career_war.toFixed(1)}</div>
          </div>
          <div class="bg-slate-950/85 p-2 rounded-xl border border-amber-500/20">
            <div class="text-[9px] font-bold uppercase text-slate-400">7-Yr Peak</div>
            <div class="text-base font-black font-mono text-sky-300">${p.peak7_war.toFixed(1)}</div>
          </div>
          <div class="bg-slate-950/85 p-2 rounded-xl border border-amber-400/45">
            <div class="text-[9px] font-bold uppercase text-amber-300">JAWS Score</div>
            <div class="text-base font-black font-mono text-amber-300">${p.jaws.toFixed(1)}</div>
          </div>
          <div class="bg-slate-950/85 p-2 rounded-xl border border-amber-500/20">
            <div class="text-[9px] font-bold uppercase text-slate-400">HOF Monitor</div>
            <div class="text-base font-black font-mono ${p.hof_monitor >= 100 ? 'text-emerald-400' : 'text-white'}">${p.hof_monitor}</div>
          </div>
        </div>

        <!-- Black Ink, Gray Ink & Positional Standard Strip -->
        <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono bg-slate-950/70 px-3 py-1.5 rounded-lg border border-slate-800 mb-2.5">
          <span><b class="text-white">Black Ink:</b> <span class="text-amber-300">${p.black_ink_score}</span> (${p.black_ink_titles}× #1)</span>
          <span><b class="text-slate-300">Gray Ink:</b> <span class="text-slate-200">${p.gray_ink_score}</span> (${p.gray_ink_top10} Top-10)</span>
          <span class="${jawsDelta >= 0 ? 'text-emerald-400' : 'text-slate-400'}">${jawsDelta >= 0 ? '+' : ''}${jawsDelta.toFixed(1)} vs ${p.position} Std</span>
        </div>

        <!-- Awards & Team Stints -->
        ${awardBadges.length ? `
          <div class="flex flex-wrap gap-1 mb-2">
            ${awardBadges.map(b => `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-400/40"><i class="bi bi-trophy-fill mr-1"></i>${b}</span>`).join("")}
          </div>
        ` : ''}
        ${stintsHtml ? `<div class="flex flex-wrap gap-1 mb-2.5">${stintsHtml}</div>` : ''}
      </div>

      <!-- Bronze Plaque Inscription -->
      <div class="hof-bronze-inscription p-3 text-[11px] text-amber-100/90 leading-relaxed font-serif">
        ${p.plaque_text}
      </div>
    </div>
  `;
}

function renderHofSubView(container) {
  const data = AppState.hofData;
  if (!data || data.error) {
    container.innerHTML = `<div class="glass-card p-8 text-center text-rose-400">${(data && data.error) || 'Failed to load Hall of Fame Hub'}</div>`;
    return;
  }

  const subTab = AppState.hofSubTab || "plaques";
  const posFilter = AppState.hofPosFilter || "ALL";
  const q = (AppState.hofSearch || "").trim().toLowerCase();

  const filterPl = p => {
    if (posFilter !== "ALL" && p.position !== posFilter) return false;
    if (q && !p.name.toLowerCase().includes(q) && !(p.primary_team?.full_name || "").toLowerCase().includes(q)) return false;
    return true;
  };

  const inductees = (data.inductees || []).filter(filterPl);
  const retiredBallot = (data.retired_ballot || []).filter(filterPl);
  const activeTrack = (data.active_track || []).filter(filterPl);
  const overallJaws = (data.jaws_overall_leaders || []).filter(filterPl);
  const posJaws = data.positional_jaws || [];
  const classes = data.induction_classes || [];

  const avgHofJaws = inductees.length
    ? (inductees.reduce((acc, x) => acc + Number(x.jaws || 0), 0) / inductees.length).toFixed(1)
    : "54.5";

  let subHtml = "";

  if (subTab === "plaques") {
    if (data.total_inductees > 0) {
      subHtml = `
        <div class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 uw:grid-cols-4 gap-5">
          ${inductees.map(p => renderHofPlaqueCard(p, false)).join("")}
        </div>
      `;
    } else {
      // Young league with 0 official inductees yet: showcase Inaugural Class / All-Time JAWS Legends
      const inauguralPool = overallJaws.slice(0, 24);
      subHtml = `
        <div class="space-y-4">
          <div class="glass-card p-4 border border-amber-400/40 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div class="text-xs font-black uppercase tracking-wider text-amber-300"><i class="bi bi-stars mr-1"></i>Inaugural Hall of Fame Class Preview & All-Time JAWS Legends</div>
              <div class="text-xs text-slate-200 mt-0.5">
                This league has <b>0 officially inducted Hall of Famers</b> in <code>players.hall_of_fame</code> so far (young league history). Below are the projected Cooperstown Plaques for the league's all-time JAWS, Black Ink & HOF Monitor leaders!
              </div>
            </div>
            <button onclick="setHofOption('hofSubTab','ballot')" class="px-3.5 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-black shrink-0">View Retired Ballot (${retiredBallot.length})</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 uw:grid-cols-4 gap-5">
            ${inauguralPool.map(p => renderHofPlaqueCard(p, true)).join("")}
          </div>
        </div>
      `;
    }
  } else if (subTab === "jaws_pos") {
    subHtml = `
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 uw:grid-cols-4 gap-5">
        ${posJaws.map(pos => `
          <div class="glass-card p-5 border-t-4 border-t-amber-400 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div>
                  <span class="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black font-mono text-sm mr-2">${pos.position}</span>
                  <span class="text-sm font-black text-white uppercase">JAWS Benchmark</span>
                </div>
                <span class="text-xs font-mono text-slate-400">${pos.hof_count} Inducted</span>
              </div>

              <div class="grid grid-cols-3 gap-2 text-center mb-4 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                <div>
                  <div class="text-[9px] uppercase text-slate-400 font-bold">Std Career WAR</div>
                  <div class="text-sm font-black font-mono text-white">${pos.std_career_war.toFixed(1)}</div>
                </div>
                <div>
                  <div class="text-[9px] uppercase text-slate-400 font-bold">Std 7-Yr Peak</div>
                  <div class="text-sm font-black font-mono text-sky-300">${pos.std_peak7_war.toFixed(1)}</div>
                </div>
                <div>
                  <div class="text-[9px] uppercase text-amber-300 font-bold">Std JAWS</div>
                  <div class="text-sm font-black font-mono text-amber-300">${pos.std_jaws.toFixed(1)}</div>
                </div>
              </div>

              <div class="space-y-1.5">
                ${(pos.leaders || []).map((pl, idx) => `
                  <div onclick="openPlayerModal(${pl.player_id})" class="px-2.5 py-1.5 rounded-lg bg-slate-900/75 hover:bg-slate-800 cursor-pointer transition flex items-center justify-between text-xs">
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="w-4 font-mono text-slate-400 font-bold">${idx + 1}.</span>
                      <img src="${teamLogoUrl(pl.primary_team?.logo)}" class="w-4 h-4 object-contain shrink-0">
                      <span class="font-bold text-white truncate">${pl.name}</span>
                      ${pl.is_hof ? `<span class="px-1 py-0.2 rounded text-[8px] font-black bg-amber-400 text-slate-950">HOF</span>` : (pl.retired ? '' : `<span class="px-1 py-0.2 rounded text-[8px] font-bold bg-emerald-500/20 text-emerald-300">ACT</span>`)}
                    </div>
                    <div class="font-mono text-right shrink-0 ml-2">
                      <span class="font-black text-amber-300">${pl.jaws.toFixed(1)}</span>
                      <span class="text-[10px] text-slate-400 ml-1">(${pl.career_war.toFixed(0)}/${pl.peak7_war.toFixed(0)})</span>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  } else if (subTab === "classes") {
    if (!classes.length) {
      subHtml = `<div class="glass-card p-8 text-center text-slate-400">No official induction classes recorded yet in this save. Check the <b>Retired Ballot</b> or <b>Active Future HOF Watchlist</b>!</div>`;
    } else {
      subHtml = `
        <div class="space-y-4">
          ${classes.map(cls => `
            <div class="glass-card p-5 border-l-4 border-l-amber-400">
              <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                <h3 class="text-lg font-black text-amber-300 uppercase font-mono"><i class="bi bi-bank2 mr-2"></i>Hall of Fame Class of ${cls.year}</h3>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40">${cls.count} Inductee${cls.count > 1 ? 's' : ''}</span>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 uw:grid-cols-4 gap-4">
                ${cls.members.map(m => renderHofPlaqueCard(m, false)).join("")}
              </div>
            </div>
          `).join("")}
        </div>
      `;
    }
  } else {
    // Retired Ballot or Active Watchlist Table + Cards
    const isBallot = subTab === "ballot";
    const list = isBallot ? retiredBallot : activeTrack;
    const title = isBallot
      ? "Retired Hall of Fame Ballot & Veterans Committee Candidates"
      : "Active Players on Cooperstown Hall of Fame Trajectory";

    subHtml = `
      <div class="space-y-5">
        <div class="glass-card p-5">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800">
            <h3 class="text-base font-black text-white uppercase"><i class="bi bi-stars text-amber-400 mr-1.5"></i>${title} (${list.length})</h3>
            <span class="text-xs font-mono text-slate-400">Ranked by JAWS (Career WAR + 7-Yr Peak WAR) & Bill James HOF Monitor</span>
          </div>
          <div class="overflow-x-auto max-h-[68vh]">
            <table class="saber-table">
              <thead>
                <tr>
                  <th>#</th><th>Player</th><th>Primary Team</th><th>Pos</th><th>Years</th>
                  <th>Career WAR</th><th>7-Yr Peak</th><th>JAWS</th><th>Pos Std</th><th>vs Std</th>
                  <th>Black Ink</th><th>Gray Ink</th><th>HOF Monitor</th><th>HOF Standards</th>
                  <th>Career Headline</th><th>Cooperstown Verdict</th>
                </tr>
              </thead>
              <tbody>
                ${list.map((p, i) => `
                  <tr onclick="openPlayerModal(${p.player_id})" class="cursor-pointer">
                    <td class="font-mono text-slate-400">${i + 1}</td>
                    <td>
                      <div class="flex items-center gap-2">
                        <img src="${playerPicUrl(p.player_id)}" class="w-6 h-8 rounded object-cover bg-slate-900" onerror="this.style.display='none'">
                        <span class="font-bold text-white">${p.name}</span>
                        ${!p.retired ? `<span class="text-[10px] font-mono text-emerald-400">(Age ${p.age})</span>` : ''}
                      </div>
                    </td>
                    <td><div class="flex items-center gap-1.5"><img src="${teamLogoUrl(p.primary_team?.logo)}" class="w-4 h-4 object-contain"><span>${p.primary_team?.abbr || ''}</span></div></td>
                    <td class="font-bold text-amber-300">${p.position}</td>
                    <td class="font-mono text-xs text-slate-300">${p.years_span} (${p.seasons} yr)</td>
                    <td class="font-mono font-bold text-white">${p.career_war.toFixed(1)}</td>
                    <td class="font-mono text-sky-300">${p.peak7_war.toFixed(1)}</td>
                    <td class="font-mono font-black text-amber-300 text-sm">${p.jaws.toFixed(1)}</td>
                    <td class="font-mono text-slate-400">${p.pos_jaws_std.toFixed(1)}</td>
                    <td class="font-mono ${p.jaws_vs_std >= 0 ? 'text-emerald-400 font-bold' : 'text-slate-400'}">${p.jaws_vs_std >= 0 ? '+' : ''}${p.jaws_vs_std.toFixed(1)}</td>
                    <td class="font-mono text-amber-200">${p.black_ink_score} (${p.black_ink_titles}×)</td>
                    <td class="font-mono text-slate-300">${p.gray_ink_score} (${p.gray_ink_top10})</td>
                    <td class="font-mono font-bold ${p.hof_monitor >= 100 ? 'text-emerald-400' : 'text-white'}">${p.hof_monitor}</td>
                    <td class="font-mono">${p.hof_standards}</td>
                    <td class="font-mono text-xs text-slate-200">${p.stats?.headline || ''}</td>
                    <td>
                      <span class="px-2 py-0.5 rounded text-[10px] font-black ${
                        p.hof_tier === 'First-Ballot Lock' ? 'bg-amber-400 text-slate-950' :
                        (p.hof_tier === 'Strong HOF Case' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40' :
                        (p.hof_tier === 'Borderline / VC' ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40' : 'bg-slate-800 text-slate-300'))
                      }">${p.hof_tier} (${p.hof_prob}%)</span>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="animate-view space-y-5">
      <!-- Cooperstown Museum Header -->
      <div class="glass-card p-6 border-l-4 border-l-amber-400 bg-gradient-to-r from-amber-500/10 via-slate-950 to-slate-950">
        <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-amber-400 text-slate-950">
                <i class="bi bi-bank2 mr-1"></i> Cooperstown Hall of Fame & JAWS Museum
              </span>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-900 text-amber-300 border border-amber-500/30">
                ${data.league_name} • ${data.total_inductees} Official Inductees • ${classes.length} Classes
              </span>
            </div>
            <h2 class="text-2xl sm:text-4xl font-black text-white tracking-tight">Hall of Fame Plaques, Positional JAWS & Ballot Tracker</h2>
            <p class="text-xs text-slate-300 mt-1">
              Powered by Jay Jaffe's <b>JAWS</b> (Career WAR + 7-Year Peak WAR) and Bill James' <b>Black Ink</b>, <b>Gray Ink</b>, <b>HOF Monitor</b> & <b>HOF Standards</b>.
            </p>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center shrink-0">
            <div class="bg-slate-950/85 px-4 py-2.5 rounded-xl border border-amber-500/30">
              <div class="text-[10px] font-bold uppercase text-amber-300">Inducted HOFers</div>
              <div class="text-2xl font-black font-mono text-white">${data.total_inductees}</div>
            </div>
            <div class="bg-slate-950/85 px-4 py-2.5 rounded-xl border border-slate-800">
              <div class="text-[10px] font-bold uppercase text-slate-400">Avg HOF JAWS</div>
              <div class="text-2xl font-black font-mono text-amber-300">${avgHofJaws}</div>
            </div>
            <div class="bg-slate-950/85 px-4 py-2.5 rounded-xl border border-slate-800">
              <div class="text-[10px] font-bold uppercase text-slate-400">Retired Ballot</div>
              <div class="text-2xl font-black font-mono text-sky-300">${(data.retired_ballot || []).length}</div>
            </div>
            <div class="bg-slate-950/85 px-4 py-2.5 rounded-xl border border-slate-800">
              <div class="text-[10px] font-bold uppercase text-slate-400">Active Watchlist</div>
              <div class="text-2xl font-black font-mono text-emerald-400">${(data.active_track || []).length}</div>
            </div>
          </div>
        </div>

        <!-- Sub-Tab & Position Filter Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-slate-800/80">
          <div class="flex flex-wrap items-center gap-1.5">
            <button onclick="setHofOption('hofSubTab','plaques')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase transition ${subTab === 'plaques' ? 'bg-amber-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
              <i class="bi bi-award-fill mr-1"></i> Cooperstown Plaques (${data.total_inductees || overallJaws.slice(0, 24).length})
            </button>
            <button onclick="setHofOption('hofSubTab','jaws_pos')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase transition ${subTab === 'jaws_pos' ? 'bg-sky-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
              <i class="bi bi-bar-chart-steps mr-1"></i> Positional JAWS Standards (11 Pos)
            </button>
            <button onclick="setHofOption('hofSubTab','classes')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase transition ${subTab === 'classes' ? 'bg-emerald-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
              <i class="bi bi-calendar3 mr-1"></i> Induction Classes (${classes.length})
            </button>
            <button onclick="setHofOption('hofSubTab','ballot')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase transition ${subTab === 'ballot' ? 'bg-purple-400 text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
              <i class="bi bi-check2-square mr-1"></i> Retired Ballot Tracker (${retiredBallot.length})
            </button>
            <button onclick="setHofOption('hofSubTab','active_watch')" class="px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase transition ${subTab === 'active_watch' ? 'bg-white text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'}">
              <i class="bi bi-graph-up-arrow mr-1"></i> Active Future HOF Watch (${activeTrack.length})
            </button>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <select onchange="setHofOption('hofPosFilter', this.value)" class="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white">
              <option value="ALL" ${posFilter === 'ALL' ? 'selected' : ''}>All Positions</option>
              ${["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "SP", "RP"].map(pos => `<option value="${pos}" ${posFilter === pos ? 'selected' : ''}>${pos}</option>`).join("")}
            </select>
            <input type="text" value="${AppState.hofSearch || ''}" oninput="setHofOption('hofSearch', this.value)" placeholder="Filter HOF by player/team..." class="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono w-48" />
          </div>
        </div>
      </div>

      ${subHtml}
    </div>
  `;

  initSortableTables(container);
}

// ============================================================================
// INTERACTIVE SETUP & FUNCTIONALITY VERIFICATION WIZARD
// ============================================================================
AppState.setupWizardStep = 1; // 1: Diagnostics & Self-Test | 2: OOTP Paths | 3: Saves & Demo | 4: Desktop & Finish
AppState.setupVerificationReport = null;

window.openSetupWizardModal = async function(step = null) {
  if (step) AppState.setupWizardStep = step;
  const modal = document.getElementById("setup-wizard-modal");
  const body = document.getElementById("setup-wizard-body");
  if (!modal || !body) return;
  modal.classList.remove("hidden");
  body.innerHTML = `
    <div class="p-8 text-center">
      <div class="spinner-border text-amber-400 mb-3" role="status"></div>
      <div class="text-xs font-bold text-white">Inspecting Python Environment, OOTP 27 Paths & SQLite Databases...</div>
    </div>
  `;
  try {
    AppState.setupStatus = await fetchJSON("/api/setup/status");
    renderSetupWizardBody();
  } catch (err) {
    body.innerHTML = `<div class="p-6 text-rose-400 text-xs font-mono">Failed to load setup status: ${err.message}</div>`;
  }
};

window.closeSetupWizardModal = function() {
  document.getElementById("setup-wizard-modal")?.classList.add("hidden");
};

window.setSetupWizardStep = function(stepNum) {
  AppState.setupWizardStep = stepNum;
  renderSetupWizardBody();
};

function renderSetupWizardBody() {
  const body = document.getElementById("setup-wizard-body");
  if (!body || !AppState.setupStatus) return;

  const st = AppState.setupStatus;
  const env = st.environment || {};
  const saves = st.saves || [];
  const step = AppState.setupWizardStep || 1;
  const ver = AppState.setupVerificationReport;

  const stepsMeta = [
    { num: 1, title: "1. System & Self-Test", icon: "bi-shield-check" },
    { num: 2, title: "2. OOTP 27 Paths", icon: "bi-folder2-open" },
    { num: 3, title: "3. Saves & Demo League", icon: "bi-hdd-stack" },
    { num: 4, title: "4. Desktop & Launch", icon: "bi-rocket-takeoff-fill" },
  ];

  const stepperHtml = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
      ${stepsMeta.map(sm => {
        const isCur = sm.num === step;
        return `
          <button onclick="setSetupWizardStep(${sm.num})" class="px-3 py-2.5 rounded-xl border text-left transition flex items-center gap-2.5 ${
            isCur
              ? "bg-amber-400 text-slate-950 border-amber-300 font-black shadow-lg"
              : "bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-600 font-bold"
          }">
            <i class="bi ${sm.icon} text-base"></i>
            <span class="text-xs truncate">${sm.title}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;

  let contentHtml = "";

  if (step === 1) {
    contentHtml = `
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <div class="text-[10px] font-bold uppercase text-slate-400">Python Runtime</div>
            <div class="text-lg font-black font-mono ${env.python_ok ? "text-emerald-400" : "text-rose-400"} mt-0.5">
              Python ${env.python_version || "?"}
            </div>
            <div class="text-[11px] text-slate-400 truncate mt-0.5">${env.platform || ""}</div>
          </div>
          <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <div class="text-[10px] font-bold uppercase text-slate-400">SQLite & Storage</div>
            <div class="text-lg font-black font-mono ${env.data_writable ? "text-emerald-400" : "text-rose-400"} mt-0.5">
              SQLite ${env.sqlite_version || ""}
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">${env.disk_free_gb || 0} GB Free • ${env.data_writable ? "Writable" : "Read-Only"}</div>
          </div>
          <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <div class="text-[10px] font-bold uppercase text-slate-400">Discovered Saves</div>
            <div class="text-lg font-black font-mono ${st.has_ready_save ? "text-emerald-400" : "text-amber-300"} mt-0.5">
              ${st.counts?.ready_full || 0} Ready / ${st.counts?.total_saves || 0} Total
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">Active: ${st.active_save || "None"}</div>
          </div>
          <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
            <div class="text-[10px] font-bold uppercase text-slate-400">ASGI Dependencies</div>
            <div class="text-lg font-black font-mono ${env.all_packages_ok ? "text-emerald-400" : "text-rose-400"} mt-0.5">
              ${(env.packages || []).filter(p => p.installed).length}/${(env.packages || []).length} Installed
            </div>
            <div class="text-[11px] text-slate-400 mt-0.5">Port ${env.port || 8080} Active</div>
          </div>
        </div>

        <!-- Installed Packages Row -->
        <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <div class="text-xs font-extrabold uppercase tracking-wider text-white mb-2.5">
            <i class="bi bi-box-seam text-amber-400 mr-1.5"></i> Required Python Packages & Versions
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            ${(env.packages || []).map(pkg => `
              <div class="bg-slate-950 border ${pkg.installed ? "border-emerald-500/30" : "border-rose-500/40"} rounded-lg p-2.5">
                <div class="flex items-center justify-between">
                  <span class="font-mono font-bold text-xs text-white">${pkg.name}</span>
                  <i class="bi ${pkg.installed ? "bi-check-circle-fill text-emerald-400" : "bi-x-circle-fill text-rose-400"} text-xs"></i>
                </div>
                <div class="text-[11px] font-mono text-slate-400 mt-0.5">v${pkg.version}</div>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- 8-Point Functionality Self-Test -->
        <div class="bg-slate-900/90 border border-amber-400/30 rounded-xl p-4 space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div class="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                <i class="bi bi-activity mr-1"></i> 8-Point End-to-End Functionality Verification Suite
              </div>
              <p class="text-[11px] text-slate-400 mb-0">
                Tests SQLite ingestion, Standings, Team Hub, Sabermetrics, Statcast 3D Spray Coordinates, Cooperstown HOF JAWS, Evolution Hub, and BNN Almanacs.
              </p>
            </div>
            <button onclick="runSetupVerificationSuite()" class="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider shrink-0 transition">
              <i class="bi bi-play-circle-fill mr-1"></i> Run Full Self-Test Now
            </button>
          </div>

          <div id="setup-verification-results">
            ${ver ? renderVerificationReportHtml(ver) : `
              <div class="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 text-center">
                Click <b>Run Full Self-Test Now</b> to execute all 8 subsystem diagnostics against your active save (<code>${st.active_save}</code>).
              </div>
            `}
          </div>
        </div>

        <div class="flex justify-between items-center pt-2">
          <span class="text-[11px] text-slate-400">Step 1 of 4 • Environment & Functionality Diagnostics</span>
          <button onclick="setSetupWizardStep(2)" class="px-4 py-2 rounded-xl bg-white hover:bg-slate-200 text-slate-950 font-black text-xs uppercase transition">
            Next: Configure OOTP Paths <i class="bi bi-arrow-right ml-1"></i>
          </button>
        </div>
      </div>
    `;
  } else if (step === 2) {
    contentHtml = `
      <div class="space-y-4">
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <div class="text-xs font-extrabold uppercase tracking-wider text-amber-300">
            <i class="bi bi-folder-check mr-1.5"></i> Primary OOTP Baseball Saved Games Directory
          </div>
          <p class="text-xs text-slate-300 mb-1">
            Point the suite to your <code>OOTP Baseball 27\\saved_games</code> folder (or directly to any <code>.lg</code> save directory).
          </p>
          <div class="flex flex-col sm:flex-row gap-2">
            <input id="setup-saved-games-input" type="text" value="${st.saved_games_dir || ""}" placeholder="C:\\Users\\YourName\\Documents\\Out of the Park Developments\\OOTP Baseball 27\\saved_games" class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white" />
            <button onclick="browseOotpFolder()" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-600 text-xs font-bold shrink-0 transition">
              <i class="bi bi-folder2-open mr-1"></i> Browse Folder...
            </button>
            <button onclick="saveSetupFolderPath()" class="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shrink-0 transition">
              <i class="bi bi-check2-circle mr-1"></i> Save & Scan Path
            </button>
          </div>
          <div class="flex items-center gap-2 text-[11px]">
            <span class="px-2 py-0.5 rounded font-mono font-bold ${st.saved_games_dir_exists ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30" : "bg-rose-500/20 text-rose-300 border border-rose-400/30"}">
              ${st.saved_games_dir_exists ? "DIRECTORY FOUND ON DISK" : "DIRECTORY NOT FOUND"}
            </span>
            <span class="text-slate-400">${saves.length} save folder(s) detected</span>
          </div>
        </div>

        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-2.5">
          <div class="text-xs font-extrabold uppercase tracking-wider text-white">
            <i class="bi bi-search text-sky-400 mr-1.5"></i> Auto-Detected Candidate OOTP Locations on This PC
          </div>
          <div class="space-y-1.5">
            ${(st.candidate_dirs || []).map(cd => `
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950 border ${cd.is_active ? "border-amber-400/50" : "border-slate-800"} rounded-xl p-2.5 text-xs">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-white">${cd.label}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono ${cd.exists ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}">
                      ${cd.exists ? `${cd.lg_count} .lg save(s)` : "Not Found"}
                    </span>
                  </div>
                  <div class="text-[11px] font-mono text-slate-400 truncate mt-0.5">${cd.path}</div>
                </div>
                <button onclick="applyCandidateOotpDir(${JSON.stringify(cd.path).replace(/"/g, '&quot;')})" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 text-[11px] font-bold shrink-0">
                  Use This Path
                </button>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="flex justify-between items-center pt-2">
          <button onclick="setSetupWizardStep(1)" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition">
            <i class="bi bi-arrow-left mr-1"></i> Back
          </button>
          <button onclick="setSetupWizardStep(3)" class="px-4 py-2 rounded-xl bg-white hover:bg-slate-200 text-slate-950 font-black text-xs uppercase transition">
            Next: Saves & Demo League <i class="bi bi-arrow-right ml-1"></i>
          </button>
        </div>
      </div>
    `;
  } else if (step === 3) {
    contentHtml = `
      <div class="space-y-4">
        <!-- Demo Save Generator Banner (Ensures 100% Out-of-the-Box Functionality) -->
        <div class="bg-gradient-to-r from-emerald-500/15 via-slate-900 to-slate-900 border border-emerald-400/40 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-400 text-slate-950">Instant Functionality Guarantee</span>
              <span class="text-xs font-extrabold text-white">No OOTP CSV Exports Yet? Load the Bundled Demo League!</span>
            </div>
            <p class="text-xs text-slate-300 mt-1 mb-0">
              Generates a complete 16-Team MLB + 16-Team AAA sample save (<code>OOTP27_Demo_League.lg</code>) with 480+ players, 2025–2026 dumps, 1,400+ Statcast spray events, and Cooperstown HOF legends so every tab works immediately.
            </p>
          </div>
          <button onclick="generateAndLoadDemoSave()" class="px-4 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs uppercase tracking-wider shrink-0 transition shadow-lg">
            <i class="bi bi-lightning-charge-fill mr-1"></i> Generate & Activate Demo League
          </button>
        </div>

        <!-- Discovered Saves Table -->
        <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div class="text-xs font-extrabold uppercase tracking-wider text-white">
              <i class="bi bi-hdd-stack text-amber-400 mr-1.5"></i> Discovered OOTP Save Directories (${saves.length})
            </div>
            <span class="text-[11px] text-slate-400">Select any save to ingest & set as active</span>
          </div>

          ${saves.length === 0 ? `
            <div class="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-400">
              No <code>.lg</code> saves found in the current directory yet. Click <b>Generate & Activate Demo League</b> above or configure your OOTP 27 folder in Step 2.
            </div>
          ` : `
            <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
              ${saves.map(s => {
                const badgeCls = s.readiness === "ready_full"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40"
                  : (s.readiness === "ready_html_only" ? "bg-amber-500/20 text-amber-300 border-amber-400/40" : "bg-slate-800 text-slate-400 border-slate-700");
                return `
                  <div class="flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-slate-950 border ${s.is_active ? "border-amber-400/60" : "border-slate-800"} rounded-xl p-3 text-xs">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-black text-white text-sm">${s.save_name}</span>
                        ${s.is_active ? `<span class="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black uppercase">Active</span>` : ""}
                        <span class="px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${badgeCls}">${s.readiness_label}</span>
                      </div>
                      <div class="text-[11px] font-mono text-slate-400 truncate mt-1">
                        ${s.primary_league_abbr || "MLB"} • Season ${s.season_year || 2026} • ${s.teams_count || 0} MLB Teams • SQLite DB: ${s.db_ready ? `${s.db_size_mb} MB` : "Not built yet"}
                      </div>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <button onclick="selectAndVerifySaveInWizard('${s.save_slug}', true)" class="px-3 py-1.5 rounded-lg ${s.is_active ? "bg-amber-400 text-slate-950 font-black" : "bg-slate-800 hover:bg-slate-700 text-white font-bold border border-slate-600"} text-xs transition">
                        <i class="bi bi-database-fill-check mr-1"></i> ${s.is_active ? "Re-Sync & Verify" : "Ingest & Activate"}
                      </button>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          `}
        </div>

        <!-- How to Export CSVs in OOTP 27 -->
        <div class="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
          <div class="text-xs font-extrabold uppercase tracking-wider text-sky-300 mb-2.5">
            <i class="bi bi-info-circle-fill mr-1"></i> How to Export CSV Data from OOTP Baseball 27 for Your Own Saves
          </div>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            ${(st.export_guide || []).map(g => `
              <div class="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs">
                <div class="font-extrabold text-white mb-1"><i class="bi ${g.icon} text-amber-400 mr-1"></i> ${g.step}. ${g.title}</div>
                <div class="text-[11px] text-slate-400 leading-relaxed">${g.detail}</div>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="flex justify-between items-center pt-2">
          <button onclick="setSetupWizardStep(2)" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition">
            <i class="bi bi-arrow-left mr-1"></i> Back
          </button>
          <button onclick="setSetupWizardStep(4)" class="px-4 py-2 rounded-xl bg-white hover:bg-slate-200 text-slate-950 font-black text-xs uppercase transition">
            Next: Desktop Shortcut & Finish <i class="bi bi-arrow-right ml-1"></i>
          </button>
        </div>
      </div>
    `;
  } else if (step === 4) {
    contentHtml = `
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
            <div class="text-xs font-extrabold uppercase tracking-wider text-sky-300">
              <i class="bi bi-display mr-1.5"></i> Windows Desktop Shortcut & Standalone App Launcher
            </div>
            <p class="text-xs text-slate-300">
              Generate a one-click Desktop shortcut (<code>OOTP 27 Analytics & Hosting Hub.lnk</code>) with a custom baseball diamond icon that boots the server in the background and opens Edge/Chrome in borderless standalone app mode.
            </p>
            <div class="text-[11px] font-mono text-slate-400">
              Status: <span class="${env.shortcut_exists ? "text-emerald-400 font-bold" : "text-amber-300"}">${env.shortcut_exists ? "Shortcut Present on Desktop" : "Not Created Yet"}</span>
            </div>
            <button onclick="createDesktopShortcutFromWizard()" class="w-full py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-black text-xs uppercase tracking-wider transition">
              <i class="bi bi-window-desktop mr-1.5"></i> Create / Update Desktop Shortcut
            </button>
          </div>

          <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
            <div class="text-xs font-extrabold uppercase tracking-wider text-emerald-400">
              <i class="bi bi-check2-all mr-1.5"></i> Complete Setup & Launch Command Suite
            </div>
            <p class="text-xs text-slate-300">
              Your configuration is saved to <code>data/user_config.json</code>. You can re-open this Setup & Verification Wizard anytime from the top header bar or by running <code>Setup_Wizard.bat</code>.
            </p>
            <div class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-[11px] font-mono text-slate-300">
              Active Save: <b class="text-white">${st.active_save}</b> • Ready Saves: <b class="text-emerald-400">${st.counts?.ready_full || 0}</b>
            </div>
            <button onclick="finishSetupWizard()" class="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider transition shadow-lg">
              <i class="bi bi-rocket-takeoff-fill mr-1.5"></i> Finish Setup & Open Dashboard
            </button>
          </div>
        </div>

        <div class="flex justify-between items-center pt-2">
          <button onclick="setSetupWizardStep(3)" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition">
            <i class="bi bi-arrow-left mr-1"></i> Back
          </button>
          <button onclick="finishSetupWizard()" class="px-5 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs uppercase transition">
            Done <i class="bi bi-check-lg ml-1"></i>
          </button>
        </div>
      </div>
    `;
  }

  body.innerHTML = stepperHtml + contentHtml;
}

function renderVerificationReportHtml(ver) {
  const badgeColor = ver.overall_status === "healthy"
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40"
    : (ver.overall_status === "warning" ? "bg-amber-500/20 text-amber-300 border-amber-400/40" : "bg-rose-500/20 text-rose-300 border-rose-400/40");
  return `
    <div class="space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-950 px-3.5 py-2 rounded-lg border border-slate-800 text-xs">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded border text-[10px] font-black uppercase ${badgeColor}">
            ${ver.overall_status.toUpperCase()} (${ver.passed}/${ver.total} PASSED)
          </span>
          <span class="text-slate-300 font-mono">Save: <b>${ver.save_slug}</b></span>
        </div>
        <span class="text-[11px] font-mono text-slate-400">Total Time: ${ver.total_duration_ms} ms • ${ver.timestamp}</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        ${(ver.checks || []).map(c => {
          const ic = c.status === "pass"
            ? "bi-check-circle-fill text-emerald-400"
            : (c.status === "warn" ? "bi-exclamation-triangle-fill text-amber-400" : "bi-x-circle-fill text-rose-400");
          return `
            <div class="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="font-bold text-white flex items-center gap-1.5">
                  <i class="bi ${ic}"></i> <span>${c.name}</span>
                </div>
                <div class="text-[11px] text-slate-400 mt-0.5 truncate" title="${c.detail}">${c.detail}</div>
              </div>
              <span class="text-[10px] font-mono text-slate-400 shrink-0">${c.duration_ms}ms</span>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

window.runSetupVerificationSuite = async function() {
  const resContainer = document.getElementById("setup-verification-results");
  if (resContainer) {
    resContainer.innerHTML = `
      <div class="bg-slate-950 border border-slate-800 rounded-lg p-4 text-center text-xs text-amber-300">
        <span class="spinner-border spinner-border-sm mr-2"></span> Running 8-point functionality verification suite against <b>${AppState.activeSave}</b>...
      </div>
    `;
  }
  try {
    const ver = await fetchJSON("/api/setup/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ save_slug: AppState.activeSave }),
    });
    AppState.setupVerificationReport = ver;
    if (resContainer) resContainer.innerHTML = renderVerificationReportHtml(ver);
  } catch (err) {
    if (resContainer) {
      resContainer.innerHTML = `<div class="p-3 text-xs text-rose-400 font-mono">Verification failed: ${err.message}</div>`;
    }
  }
};

window.browseOotpFolder = async function() {
  const input = document.getElementById("setup-saved-games-input");
  const curVal = input ? input.value.trim() : "";
  try {
    const res = await fetchJSON("/api/setup/browse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initial_dir: curVal }),
    });
    if (res.selected && res.path && input) {
      input.value = res.path;
      await saveSetupFolderPath();
    }
  } catch (err) {
    alert(`Could not open native folder dialog: ${err.message}`);
  }
};

window.applyCandidateOotpDir = async function(pathStr) {
  const input = document.getElementById("setup-saved-games-input");
  if (input) input.value = pathStr;
  await saveSetupFolderPath();
};

window.saveSetupFolderPath = async function() {
  const input = document.getElementById("setup-saved-games-input");
  if (!input) return;
  const rawPath = input.value.trim();
  showLoading("Updating OOTP saved_games path & scanning for saves...");
  try {
    const updated = await fetchJSON("/api/setup/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saved_games_dir: rawPath }),
    });
    AppState.setupStatus = updated;
    AppState.saves = updated.saves || [];
    renderHeaderControls();
    renderSetupWizardBody();
  } finally {
    hideLoading();
  }
};

window.selectAndVerifySaveInWizard = async function(saveSlug, forceSync = false) {
  showLoading(`Ingesting save '${saveSlug}' into SQLite & verifying...`);
  try {
    await onSaveChanged(saveSlug, forceSync);
    AppState.setupStatus = await fetchJSON("/api/setup/status");
    AppState.setupVerificationReport = await fetchJSON("/api/setup/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ save_slug: saveSlug }),
    });
    renderSetupWizardBody();
  } finally {
    hideLoading();
  }
};

window.generateAndLoadDemoSave = async function() {
  showLoading("Generating OOTP27_Demo_League.lg (16 MLB Teams, 480+ Players, 1,400+ Statcast Events) & Building SQLite DB...");
  try {
    const res = await fetchJSON("/api/setup/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ save_name: "OOTP27_Demo_League" }),
    });
    if (res.save_slug) {
      await onSaveChanged(res.save_slug, false);
      AppState.setupStatus = await fetchJSON("/api/setup/status");
      AppState.setupVerificationReport = await fetchJSON("/api/setup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ save_slug: res.save_slug }),
      });
      AppState.setupWizardStep = 1;
      renderSetupWizardBody();
    }
  } finally {
    hideLoading();
  }
};

window.createDesktopShortcutFromWizard = async function() {
  showLoading("Creating Desktop Shortcut & Custom Baseball Diamond Icon...");
  try {
    const res = await fetchJSON("/api/setup/shortcut", { method: "POST" });
    AppState.setupStatus = await fetchJSON("/api/setup/status");
    renderSetupWizardBody();
    if (res.ok) {
      alert(`Desktop Shortcut created at:\n${res.shortcut_path}`);
    } else {
      alert(`Shortcut notice: ${res.error || res.output || "Unknown error"}`);
    }
  } finally {
    hideLoading();
  }
};

window.finishSetupWizard = async function() {
  try {
    await fetchJSON("/api/setup/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setup_completed: true,
        default_save_slug: AppState.activeSave,
      }),
    });
  } catch (e) {}
  closeSetupWizardModal();
};

/* ============================================================================
 * 12. BRAND NEW LANDING PAGE — EDITORIAL NEWSPAPER FRONT PAGE ("THE CHRONICLE")
 * ============================================================================ */
window.setNewspaperHeadlineMode = function(modeId) {
  AppState.frontPageHeadlineMode = modeId || "auto";
  const container = document.getElementById("main-view-container");
  if (container && AppState.activeTab === "frontpage") {
    renderFrontPageTab(container);
  }
};

window.toggleNewspaperPaperTheme = function() {
  AppState.frontPagePaperTheme = AppState.frontPagePaperTheme === "light" ? "dark" : "light";
  const container = document.getElementById("main-view-container");
  if (container && AppState.activeTab === "frontpage") {
    renderFrontPageTab(container);
  }
};

window.jumpToGameReplayFromFrontPage = async function(gameId) {
  if (gameId && typeof openGameReplayModal === "function") {
    openGameReplayModal(gameId);
  } else {
    await switchTab("gamelogs");
  }
};

async function renderFrontPageTab(container) {
  if (!AppState.frontPageData) {
    showLoading("Typesetting Broadsheet Front Page & Headlines...");
    try {
      const params = new URLSearchParams({ save: AppState.activeSave });
      if (AppState.activeLeagueId) params.set("league_id", AppState.activeLeagueId);
      if (AppState.activeYear) params.set("year", AppState.activeYear);
      AppState.frontPageData = await fetchJSON(`/api/frontpage?${params.toString()}`);
    } finally {
      hideLoading();
    }
  }

  const fp = AppState.frontPageData || {};
  const mast = fp.masthead || {};
  const headlines = fp.headlines || [];
  const mode = AppState.frontPageHeadlineMode || "auto";
  const activeHead = (mode !== "auto" && headlines.find(h => h.id === mode)) || fp.primary_headline || headlines[0] || {
    id: "matchup",
    kicker: "CHAMPIONSHIP EDITION",
    headline: "Senators and Reds set for World Series Matchup",
    subhead: "Top clubs collide on the grandest stage.",
    byline: "By BNN National Desk",
    badge: "FRONT PAGE LEAD",
    hero_teams: [],
    paragraphs: [],
  };

  const standingsGroups = fp.standings_groups || [];
  const wildCards = fp.wild_cards || [];
  const bracket = fp.playoff_bracket || {};
  const hottestTeams = fp.hottest_teams || [];
  const coldTeams = fp.cold_teams || [];
  const activeStreaks = fp.active_streaks || [];
  const wireStories = fp.wire_stories || [];
  const leaders = fp.leaders || {};
  const recentGames = fp.recent_games || [];
  const isLightPaper = AppState.frontPagePaperTheme === "light";

  // Build Hero Teams Banner inside the Lead Story
  const heroTeams = activeHead.hero_teams || [];
  const heroTeamsHtml = heroTeams.length >= 2 ? `
    <div class="np-box my-4 p-4 rounded-xl bg-slate-900/85 border border-amber-500/35 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div onclick="switchTeamAndGo(${heroTeams[0].team_id})" class="flex items-center gap-3 cursor-pointer group">
        <img src="${teamLogoUrl(heroTeams[0].logo_file_name)}" class="w-14 h-14 object-contain rounded-xl bg-slate-950/90 p-1.5 border border-slate-700 group-hover:border-amber-400 transition" alt="">
        <div>
          <div class="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">CONTENDER / PENNANT WINNER</div>
          <div class="text-base font-black text-white np-ink group-hover:text-amber-400 transition">${heroTeams[0].full_name}</div>
          <div class="text-xs font-mono text-slate-300 np-muted">${heroTeams[0].record_str} (${fmtAvg(heroTeams[0].pct)}) • L10: <b>${heroTeams[0].l10_str || '7-3'}</b> • ${Number(heroTeams[0].total_war || 0).toFixed(1)} WAR</div>
        </div>
      </div>
      <div class="text-center px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-400/40">
        <div class="text-[10px] font-mono uppercase tracking-widest text-amber-300 font-extrabold">${bracket.championship_series?.round_name || 'HEAD-TO-HEAD'}</div>
        <div class="text-lg font-black font-mono text-white np-ink">
          ${bracket.championship_series && (bracket.championship_series.result0 || bracket.championship_series.result1)
            ? `${bracket.championship_series.result0} — ${bracket.championship_series.result1}`
            : `VS`}
        </div>
        <div class="text-[9.5px] font-mono text-slate-400 np-muted">Best of ${bracket.championship_series?.best_of || 7}</div>
      </div>
      <div onclick="switchTeamAndGo(${heroTeams[1].team_id})" class="flex items-center gap-3 sm:flex-row-reverse sm:text-right cursor-pointer group">
        <img src="${teamLogoUrl(heroTeams[1].logo_file_name)}" class="w-14 h-14 object-contain rounded-xl bg-slate-950/90 p-1.5 border border-slate-700 group-hover:border-amber-400 transition" alt="">
        <div>
          <div class="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-bold">CONTENDER / PENNANT WINNER</div>
          <div class="text-base font-black text-white np-ink group-hover:text-sky-400 transition">${heroTeams[1].full_name}</div>
          <div class="text-xs font-mono text-slate-300 np-muted">${heroTeams[1].record_str} (${fmtAvg(heroTeams[1].pct)}) • L10: <b>${heroTeams[1].l10_str || '7-3'}</b> • ${Number(heroTeams[1].total_war || 0).toFixed(1)} WAR</div>
        </div>
      </div>
    </div>
  ` : (heroTeams.length === 1 ? `
    <div onclick="switchTeamAndGo(${heroTeams[0].team_id})" class="np-box my-4 p-4 rounded-xl bg-slate-900/85 border border-amber-500/35 flex flex-wrap items-center justify-between gap-4 cursor-pointer group">
      <div class="flex items-center gap-3.5">
        <img src="${teamLogoUrl(heroTeams[0].logo_file_name)}" class="w-14 h-14 object-contain rounded-xl bg-slate-950/90 p-1.5 border border-slate-700 group-hover:border-amber-400 transition" alt="">
        <div>
          <div class="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold">${activeHead.badge || 'FEATURED FRANCHISE'}</div>
          <div class="text-lg font-black text-white np-ink group-hover:text-amber-400 transition">${heroTeams[0].full_name} (${heroTeams[0].abbr})</div>
          <div class="text-xs font-mono text-slate-300 np-muted">Season: <b>${heroTeams[0].record_str}</b> (${fmtAvg(heroTeams[0].pct)}) • Last 10: <b class="text-emerald-400">${heroTeams[0].l10_str || '7-3'}</b> • Streak: <b>${heroTeams[0].streak_str || 'W3'}</b></div>
        </div>
      </div>
      <div class="flex items-center gap-4 font-mono text-xs">
        <div class="text-center">
          <div class="text-[10px] text-slate-400 np-muted">RUN DIFF</div>
          <div class="font-black text-sm ${(heroTeams[0].run_diff || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${(heroTeams[0].run_diff || 0) >= 0 ? '+' : ''}${heroTeams[0].run_diff || 0}</div>
        </div>
        <div class="text-center">
          <div class="text-[10px] text-slate-400 np-muted">PYTH W-L</div>
          <div class="font-bold text-white np-ink">${heroTeams[0].pyth_w || 0}-${heroTeams[0].pyth_l || 0}</div>
        </div>
        <div class="text-center">
          <div class="text-[10px] text-slate-400 np-muted">TEAM WAR</div>
          <div class="font-black text-sky-400 text-sm">${Number(heroTeams[0].total_war || 0).toFixed(1)}</div>
        </div>
      </div>
    </div>
  ` : "");

  // Secondary Column 2 Story: "On Fire! Last-10 Surge & Pennant Fever"
  const hotClub = hottestTeams[0] || heroTeams[0] || {};
  const secondHot = hottestTeams[1] || hotClub;
  const tightestRace = standingsGroups.slice().sort((a, b) => (a.lead_gb || 99) - (b.lead_gb || 99))[0] || standingsGroups[0];

  // Agate Standings Tables (Right Column Rail)
  const agateStandingsHtml = standingsGroups.map(grp => `
    <div class="np-box rounded-lg bg-slate-950/65 border border-slate-800/90 overflow-hidden mb-3">
      <div class="px-2.5 py-1.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between">
        <span class="font-mono font-extrabold text-[11px] uppercase tracking-wider text-amber-300">${grp.title}</span>
        <span class="font-mono text-[9.5px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">${grp.race_status}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="agate-table">
          <thead>
            <tr>
              <th class="text-left">Club</th>
              <th class="text-right">W-L</th>
              <th class="text-right">PCT</th>
              <th class="text-right">GB</th>
              <th class="text-right" title="Record in Last 10 Games">L10</th>
              <th class="text-right">Strk</th>
              <th class="text-right">RD</th>
              <th class="text-right" title="Magic / Elimination Number">M#</th>
            </tr>
          </thead>
          <tbody>
            ${(grp.teams || []).map((t, i) => {
              const l10W = Number(t.l10_w || 0);
              const l10Cls = l10W >= 7 ? "text-emerald-400 font-bold" : (l10W <= 3 ? "text-rose-400" : "text-slate-200");
              const mStr = t.magic_str || "-";
              const mCls = mStr === "CLINCHED" ? "text-amber-300 font-black" : (mStr === "ELIM" ? "text-slate-500" : "text-sky-300");
              return `
                <tr onclick="switchTeamAndGo(${t.team_id})" class="cursor-pointer">
                  <td class="font-bold">
                    <div class="flex items-center gap-1.5">
                      <span class="text-slate-500 text-[10px] w-3">${i + 1}</span>
                      <img src="${teamLogoUrl(t.logo_file_name)}" class="w-4 h-4 object-contain" alt="">
                      <span class="text-white np-ink hover:text-amber-400">${t.nickname || t.name}</span>
                      <span class="text-[9.5px] text-slate-400 np-muted">(${t.abbr})</span>
                    </div>
                  </td>
                  <td class="text-right font-bold text-white np-ink">${t.record_str}</td>
                  <td class="text-right text-sky-300 font-semibold">${fmtAvg(t.pct)}</td>
                  <td class="text-right text-slate-400 np-muted">${t.gb === 0 ? "—" : t.gb.toFixed(1)}</td>
                  <td class="text-right ${l10Cls}">${t.l10_str || "5-5"}</td>
                  <td class="text-right ${t.streak > 0 ? 'text-emerald-400' : 'text-rose-400'}">${t.streak_str}</td>
                  <td class="text-right ${t.run_diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${t.run_diff >= 0 ? '+' : ''}${t.run_diff}</td>
                  <td class="text-right ${mCls}">${mStr}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `).join("");

  // Postseason Series / Bracket Mini-Agate inside Lead Column
  const bracketRounds = bracket.rounds || [];
  const bracketMiniHtml = bracketRounds.length ? `
    <div class="np-box mt-4 p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/80">
      <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
        <div class="flex items-center gap-2">
          <i class="bi bi-diagram-3-fill text-amber-400"></i>
          <span class="font-mono text-xs font-black uppercase tracking-wider text-white np-ink">
            ${bracket.is_projected ? 'Projected Postseason Bracket Snapshot' : `${fp.selected_year} Official Postseason Bracket`}
          </span>
        </div>
        <button onclick="switchTab('stretch')" class="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-[10.5px] font-mono font-bold transition">
          Open Full Bracket on "The Stretch" &rarr;
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        ${bracketRounds.flatMap(r => r.series || []).slice(0, 6).map(s => `
          <div class="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs font-mono">
            <div class="min-w-0">
              <div class="text-[9.5px] text-amber-300 uppercase font-bold truncate">${s.round_name} • ${s.status_label}</div>
              <div class="flex items-center gap-2 mt-1">
                <img src="${teamLogoUrl(s.team0?.logo_file_name)}" class="w-4 h-4 object-contain" alt="">
                <span class="${s.winner_id === s.team0?.team_id ? 'font-black text-emerald-400' : 'text-white np-ink'}">${s.team0?.abbr || 'TBD'}</span>
                <span class="text-slate-500">vs</span>
                <img src="${teamLogoUrl(s.team1?.logo_file_name)}" class="w-4 h-4 object-contain" alt="">
                <span class="${s.winner_id === s.team1?.team_id ? 'font-black text-emerald-400' : 'text-white np-ink'}">${s.team1?.abbr || 'TBD'}</span>
              </div>
            </div>
            <div class="text-right shrink-0 ml-2">
              <div class="text-sm font-black text-white np-ink">${s.result0} - ${s.result1}</div>
              <div class="text-[9.5px] text-slate-400">Best of ${s.best_of}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  ` : "";

  container.innerHTML = `
    <div class="animate-view space-y-4">
      <!-- Interactive Headline Experimentation & Press Room Bar -->
      <div class="glass-card p-3 border border-amber-500/35 flex flex-wrap items-center justify-between gap-2.5">
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-[11px] font-mono font-extrabold uppercase tracking-wider text-amber-300 mr-1 flex items-center gap-1.5">
            <i class="bi bi-megaphone-fill"></i> Press Room Headline Desk:
          </span>
          <button onclick="setNewspaperHeadlineMode('auto')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition ${mode === 'auto' ? 'bg-amber-400 text-slate-950 font-black shadow' : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'}">
            Auto (Live State)
          </button>
          ${headlines.map(h => `
            <button onclick="setNewspaperHeadlineMode('${h.id}')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition ${mode === h.id ? 'bg-amber-400 text-slate-950 font-black shadow' : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-700'}" title="${h.headline}">
              ${h.id === 'matchup' ? 'World Series Matchup' : (h.id === 'champions' ? 'World Champs!' : (h.id === 'phillies_fire' ? 'Phillies 7-3 L10!' : (h.id === 'hot_streak' ? 'Hottest L10 Streak' : 'MVP Showcase')))}
            </button>
          `).join("")}
        </div>
        <div class="flex items-center gap-2">
          <button onclick="toggleNewspaperPaperTheme()" class="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-200 border border-slate-700 text-xs font-mono font-bold transition flex items-center gap-1.5">
            <i class="bi ${isLightPaper ? 'bi-moon-stars-fill text-sky-400' : 'bi-journal-richtext text-amber-300'}"></i>
            ${isLightPaper ? 'Dark Broadsheet Ink' : 'Classic Warm Newsprint'}
          </button>
          <button onclick="switchTab('stretch')" class="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-400/40 text-xs font-bold transition flex items-center gap-1">
            <i class="bi bi-flag-fill"></i> The Stretch
          </button>
          <button onclick="switchTab('world')" class="px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/40 text-xs font-bold transition flex items-center gap-1">
            <i class="bi bi-globe-americas"></i> World Dashboard
          </button>
        </div>
      </div>

      <!-- Broadsheet Front Page Sheet -->
      <div class="newspaper-sheet ${isLightPaper ? 'newsprint-light' : ''} p-4 sm:p-6 lg:p-8">
        <!-- Broadsheet Masthead with Left & Right Ears -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center pb-3">
          <!-- Left Ear: Run Environment & Weather Report -->
          <div class="lg:col-span-3 np-box p-2.5 rounded-lg border border-slate-700/70 bg-slate-900/50 text-xs font-mono">
            <div class="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 mb-0.5">LEAGUE RUN ENVIRONMENT</div>
            <div class="text-white np-ink font-bold leading-snug">${mast.environment_note || 'Slash .260/.330/.420'}</div>
            <div class="text-[10px] text-slate-400 np-muted mt-0.5">OOTP 27 Official Sabermetric Bureau</div>
          </div>

          <!-- Center Newspaper Title Flag -->
          <div class="lg:col-span-6 text-center">
            <div class="text-[10px] font-mono uppercase tracking-[0.25em] text-amber-400 font-bold mb-1">${mast.edition_badge || 'SPECIAL BROADSHEET EDITION'}</div>
            <h1 class="newspaper-masthead-title text-3xl sm:text-5xl uw:text-6xl text-white np-ink tracking-tight">
              ${mast.paper_title || 'THE BASEBALL CHRONICLE'}
            </h1>
            <div class="newspaper-subhead text-xs sm:text-sm text-slate-300 np-muted mt-1">
              ${mast.sub_motto || '“All The Diamond News, Sabermetrics & Postseason Drama Fit To Print”'}
            </div>
          </div>

          <!-- Right Ear: Featured Final Score / Late Wire -->
          <div class="lg:col-span-3 np-box p-2.5 rounded-lg border border-slate-700/70 bg-slate-900/50 text-xs font-mono">
            ${mast.featured_final ? `
              <div class="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 mb-0.5">
                <span>LATEST FINAL BOX</span>
                <span>${mast.featured_final.date || ''}</span>
              </div>
              <div onclick="jumpToGameReplayFromFrontPage(${mast.featured_final.game_id})" class="font-black text-white np-ink hover:text-amber-400 cursor-pointer transition">
                ${mast.featured_final.away_abbr} ${mast.featured_final.away_runs}, ${mast.featured_final.home_abbr} ${mast.featured_final.home_runs}
                ${mast.featured_final.innings > 9 ? `(${mast.featured_final.innings} Inn)` : '(Final)'}
              </div>
              <div class="text-[10px] text-slate-400 np-muted mt-0.5">Click score for Pitch-by-Pitch Replay &rarr;</div>
            ` : `
              <div class="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">BNN WIRE SERVICE</div>
              <div class="font-bold text-white np-ink">All Standings & Box Scores Verified</div>
            `}
          </div>
        </div>

        <!-- Double Rule & Dateline Strip -->
        <div class="newspaper-double-rule my-1"></div>
        <div class="py-1.5 px-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono font-bold uppercase tracking-wider text-slate-300 np-muted">
          <span>${mast.volume_str || 'VOL. I • NO. 162'}</span>
          <span class="text-white np-ink font-black">${mast.dateline_date || `SEASON ${fp.selected_year}`}</span>
          <span>${mast.price_str || 'FINAL EDITION • 25¢'}</span>
        </div>
        <div class="newspaper-double-rule my-1 mb-5"></div>

        <!-- Banner Headline Deck (Above the Fold) -->
        <div class="text-center max-w-5xl mx-auto mb-6 pb-5 border-b-2 border-slate-700/80">
          <div class="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 font-mono text-[11px] font-extrabold uppercase tracking-widest mb-2">
            <i class="bi bi-stars"></i> ${activeHead.kicker}
          </div>
          <h2 class="newspaper-banner-headline text-3xl sm:text-5xl lg:text-6xl text-white np-ink my-1.5">
            “${activeHead.headline}”
          </h2>
          <p class="newspaper-subhead text-base sm:text-xl text-slate-200 np-muted max-w-4xl mx-auto mt-2 mb-0">
            ${activeHead.subhead}
          </p>
          <div class="mt-2.5 text-[11px] font-mono uppercase tracking-wider text-slate-400 np-muted">
            ${activeHead.byline}
          </div>
        </div>

        <!-- Main 12-Column Newspaper Broadsheet Body -->
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">

          <!-- LEFT & CENTER EDITORIAL COLUMNS (Cols 1-7 on XL) -->
          <div class="xl:col-span-7 space-y-6 xl:border-r xl:border-slate-700/70 xl:pr-6">

            <!-- Primary Lead Story Column -->
            <article>
              ${heroTeamsHtml}
              <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mt-3">
                ${(activeHead.paragraphs || []).map((para, idx) => `
                  <p class="newspaper-body-copy ${idx === 0 ? 'newspaper-dropcap' : ''} text-slate-200 np-ink mb-0">
                    ${para}
                  </p>
                `).join("")}
              </div>
              ${bracketMiniHtml}
            </article>

            <div class="newspaper-thin-rule my-4"></div>

            <!-- Secondary 2-Column Editorial Feature: "Last-10 Surge & Pennant Race Column" + "Active Player Streaks & Wire" -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

              <!-- Column A: Red-Hot Clubs & Tightest Division Race -->
              <div class="space-y-4">
                <div>
                  <div class="text-[10px] font-mono font-extrabold uppercase tracking-widest text-rose-400 mb-1">
                    PENNANT FEVER & MOMENTUM WATCH
                  </div>
                  <h3 class="font-serif font-black text-xl text-white np-ink leading-tight mb-2">
                    ${hotClub.nickname || hotClub.name || 'Contenders'} On Fire! ${hotClub.l10_str || '8-2'} in Last Ten as Stretch Run Intensifies
                  </h3>
                  <p class="newspaper-body-copy text-slate-300 np-ink text-sm mb-3">
                    Momentum across ${fp.active_league?.name || 'the league'} has swung dramatically over the past two weeks.
                    The <b>${hotClub.full_name || 'league leaders'}</b> (${hotClub.record_str || ''}) have ripped off a
                    <b>${hotClub.l10_str || '8-2'}</b> mark over their last ten games (${hotClub.l10_seq || 'WWWWWLWWWW'}),
                    while <b>${secondHot.full_name || 'rival contenders'}</b> have posted a <b>${secondHot.l10_str || '7-3'}</b> surge.
                    ${tightestRace ? `Meanwhile, the <b>${tightestRace.title}</b> race stands at a <b>${tightestRace.lead_gb} GB</b> margin (${tightestRace.race_status}).` : ''}
                  </p>
                </div>

                <!-- Hottest & Coldest Last-10 Agate Strip -->
                <div class="np-box p-3 rounded-xl bg-slate-900/75 border border-slate-800">
                  <div class="text-[10.5px] font-mono font-extrabold uppercase tracking-wider text-emerald-400 mb-2 flex items-center justify-between">
                    <span><i class="bi bi-fire mr-1"></i> Hottest Clubs (Last 10 Games)</span>
                    <span>L10 • DIFF • STRK</span>
                  </div>
                  <div class="space-y-1.5">
                    ${hottestTeams.slice(0, 5).map(t => `
                      <div onclick="switchTeamAndGo(${t.team_id})" class="flex items-center justify-between text-xs font-mono py-1 px-1.5 rounded hover:bg-slate-800/60 cursor-pointer transition">
                        <div class="flex items-center gap-2 truncate">
                          <img src="${teamLogoUrl(t.logo_file_name)}" class="w-4 h-4 object-contain" alt="">
                          <span class="font-bold text-white np-ink truncate">${t.full_name}</span>
                          <span class="text-[10px] text-slate-400">(${t.record_str})</span>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          <span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-black">${t.l10_str}</span>
                          <span class="text-slate-300 w-8 text-right">${(t.l10_run_diff || 0) >= 0 ? '+' : ''}${t.l10_run_diff || 0}</span>
                          <span class="text-amber-300 w-7 text-right">${t.streak_str}</span>
                        </div>
                      </div>
                    `).join("")}
                  </div>
                </div>

                <!-- Recent Final Box Scores Agate -->
                <div class="np-box p-3 rounded-xl bg-slate-900/75 border border-slate-800">
                  <div class="text-[10.5px] font-mono font-extrabold uppercase tracking-wider text-sky-400 mb-2 flex items-center justify-between">
                    <span><i class="bi bi-card-checklist mr-1"></i> Latest Box Score Finals</span>
                    <button onclick="switchTab('gamelogs')" class="text-[10px] text-amber-300 hover:underline">Replay Hub &rarr;</button>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    ${recentGames.slice(0, 8).map(g => `
                      <div onclick="jumpToGameReplayFromFrontPage(${g.game_id})" class="p-1.5 rounded bg-slate-950/75 border border-slate-800/90 hover:border-sky-400/50 cursor-pointer flex items-center justify-between text-[11px] font-mono transition">
                        <div>
                          <span class="${g.away_runs > g.home_runs ? 'font-black text-white np-ink' : 'text-slate-400'}">${g.away_abbr} ${g.away_runs}</span>
                          <span class="text-slate-600 mx-1">@</span>
                          <span class="${g.home_runs > g.away_runs ? 'font-black text-white np-ink' : 'text-slate-400'}">${g.home_abbr} ${g.home_runs}</span>
                        </div>
                        <span class="text-[9.5px] text-slate-500">${g.date || ''}</span>
                      </div>
                    `).join("")}
                  </div>
                </div>
              </div>

              <!-- Column B: BNN Wire Dispatches & Active Player Streaks -->
              <div class="space-y-4">
                <div>
                  <div class="text-[10px] font-mono font-extrabold uppercase tracking-widest text-amber-400 mb-1">
                    DIAMOND WIRE & STREAK TRACKER
                  </div>
                  <h3 class="font-serif font-black text-xl text-white np-ink leading-tight mb-2">
                    Around the Horn: Headlines, Hot Bats & Front-Office Dispatches
                  </h3>
                </div>

                ${activeStreaks.length ? `
                  <div class="np-box p-3 rounded-xl bg-slate-900/75 border border-slate-800">
                    <div class="text-[10.5px] font-mono font-extrabold uppercase tracking-wider text-amber-300 mb-2">
                      <i class="bi bi-lightning-charge-fill mr-1"></i> Active Player Streaks
                    </div>
                    <div class="space-y-1.5">
                      ${activeStreaks.slice(0, 5).map(st => `
                        <div onclick="openPlayerModal(${st.player_id})" class="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-slate-800/60 cursor-pointer transition">
                          <div class="flex items-center gap-2 min-w-0">
                            <img src="${playerPicUrl(st.player_id)}" class="w-6 h-7 object-cover rounded border border-slate-700" alt="">
                            <div class="truncate">
                              <div class="font-bold text-white np-ink truncate">${st.player_name} <span class="text-[10px] font-mono text-slate-400">(${st.team_abbr})</span></div>
                              <div class="text-[10px] text-slate-400 np-muted">${st.streak_name}</div>
                            </div>
                          </div>
                          <span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 font-mono font-black text-xs shrink-0">
                            ${st.value} G
                          </span>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                ` : ""}

                <div class="space-y-2.5">
                  ${wireStories.slice(0, 5).map(ws => `
                    <div class="np-box p-3 rounded-xl bg-slate-900/65 border border-slate-800/90">
                      <div class="flex items-center justify-between text-[9.5px] font-mono uppercase tracking-wider text-sky-400 mb-1">
                        <span class="font-extrabold">${ws.category} • ${ws.team_abbr}</span>
                        <span class="text-slate-400">${ws.date || ''}</span>
                      </div>
                      <div ${ws.player_id ? `onclick="openPlayerModal(${ws.player_id})"` : (ws.team_id ? `onclick="switchTeamAndGo(${ws.team_id})"` : '')}
                           class="font-serif font-bold text-sm text-white np-ink hover:text-amber-400 cursor-pointer leading-snug mb-1">
                        ${ws.headline}
                      </div>
                      <p class="text-xs text-slate-300 np-muted leading-relaxed mb-0 line-clamp-3">
                        ${ws.body}
                      </p>
                    </div>
                  `).join("")}
                </div>
              </div>

            </div>
          </div>

          <!-- RIGHT AGATE STANDINGS & LEADERS RAIL (Cols 8-12 on XL) -->
          <div class="xl:col-span-5 space-y-4">
            <div class="flex items-center justify-between border-b-2 border-amber-400/60 pb-1.5">
              <div>
                <div class="text-[10px] font-mono font-extrabold uppercase tracking-widest text-amber-400">OFFICIAL LEAGUE TABLE & AGATE</div>
                <h3 class="font-serif font-black text-lg text-white np-ink mb-0">${fp.active_league?.name || 'League'} Standings (${fp.selected_year})</h3>
              </div>
              <button onclick="switchTab('overview')" class="text-[11px] font-mono text-sky-400 hover:underline">
                Full Pythagorean Matrix &rarr;
              </button>
            </div>

            ${agateStandingsHtml}

            <!-- Front Page League Leaders Agate Box -->
            <div class="np-box rounded-xl bg-slate-950/75 border border-slate-800 p-3.5">
              <div class="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
                <span class="font-mono text-xs font-black uppercase tracking-wider text-amber-300">
                  <i class="bi bi-award-fill mr-1"></i> ${fp.selected_year} League Leaders Agate
                </span>
                <button onclick="switchTab('leaders')" class="text-[10.5px] font-mono text-sky-400 hover:underline">All Leaders &rarr;</button>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <div class="text-[10px] uppercase font-extrabold text-slate-400 mb-1">Batting WAR Leaders</div>
                  ${(leaders.bat_war || []).slice(0, 4).map((p, i) => `
                    <div onclick="openPlayerModal(${p.player_id})" class="flex items-center justify-between py-1 border-b border-slate-800/60 hover:text-amber-300 cursor-pointer">
                      <span class="truncate text-white np-ink">${i + 1}. ${p.name} <span class="text-slate-500">(${p.team_abbr})</span></span>
                      <span class="font-black text-sky-400 ml-2">${Number(p.war || 0).toFixed(1)}</span>
                    </div>
                  `).join("")}
                </div>
                <div>
                  <div class="text-[10px] uppercase font-extrabold text-slate-400 mb-1">Pitching WAR Leaders</div>
                  ${(leaders.pit_war || []).slice(0, 4).map((p, i) => `
                    <div onclick="openPlayerModal(${p.player_id})" class="flex items-center justify-between py-1 border-b border-slate-800/60 hover:text-amber-300 cursor-pointer">
                      <span class="truncate text-white np-ink">${i + 1}. ${p.name} <span class="text-slate-500">(${p.team_abbr})</span></span>
                      <span class="font-black text-emerald-400 ml-2">${Number(p.war || 0).toFixed(1)}</span>
                    </div>
                  `).join("")}
                </div>
                <div>
                  <div class="text-[10px] uppercase font-extrabold text-slate-400 mb-1">Home Run Kings</div>
                  ${(leaders.bat_hr || []).slice(0, 4).map((p, i) => `
                    <div onclick="openPlayerModal(${p.player_id})" class="flex items-center justify-between py-1 border-b border-slate-800/60 hover:text-amber-300 cursor-pointer">
                      <span class="truncate text-white np-ink">${i + 1}. ${p.name} <span class="text-slate-500">(${p.team_abbr})</span></span>
                      <span class="font-black text-amber-300 ml-2">${p.hr} HR</span>
                    </div>
                  `).join("")}
                </div>
                <div>
                  <div class="text-[10px] uppercase font-extrabold text-slate-400 mb-1">ERA / FIP Leaders</div>
                  ${(leaders.pit_fip || []).slice(0, 4).map((p, i) => `
                    <div onclick="openPlayerModal(${p.player_id})" class="flex items-center justify-between py-1 border-b border-slate-800/60 hover:text-amber-300 cursor-pointer">
                      <span class="truncate text-white np-ink">${i + 1}. ${p.name} <span class="text-slate-500">(${p.team_abbr})</span></span>
                      <span class="font-black text-rose-300 ml-2">${Number(p.era || 0).toFixed(2)}</span>
                    </div>
                  `).join("")}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================================
 * 13. "THE STRETCH" SCREEN — PENNANT RACES, WILD CARD CUTLINES & PLAYOFF BRACKETS
 * ============================================================================ */
window.toggleStretchLeagueSelection = async function(lid, mode = "toggle") {
  const numId = Number(lid);
  if (mode === "single") {
    AppState.stretchLeagueIds = [numId];
  } else if (mode === "all_top") {
    const lgs = (AppState.overview && AppState.overview.leagues) || [];
    const topIds = lgs.filter(l => l.level === 1).map(l => l.league_id);
    AppState.stretchLeagueIds = topIds.length ? topIds : lgs.slice(0, 4).map(l => l.league_id);
  } else if (mode === "all") {
    const lgs = (AppState.overview && AppState.overview.leagues) || [];
    AppState.stretchLeagueIds = lgs.slice(0, 8).map(l => l.league_id);
  } else {
    const cur = new Set(AppState.stretchLeagueIds || []);
    if (cur.has(numId)) {
      if (cur.size > 1) cur.delete(numId);
    } else {
      cur.add(numId);
    }
    AppState.stretchLeagueIds = Array.from(cur);
  }
  AppState.stretchData = null;
  const container = document.getElementById("main-view-container");
  if (container) await renderStretchTab(container);
};

async function renderStretchTab(container) {
  if (!AppState.stretchLeagueIds || !AppState.stretchLeagueIds.length) {
    AppState.stretchLeagueIds = [AppState.activeLeagueId || 100];
  }
  if (!AppState.stretchData) {
    showLoading("Computing Pennant Races, Magic Numbers & Playoff Brackets...");
    try {
      const params = new URLSearchParams({
        save: AppState.activeSave,
        league_ids: AppState.stretchLeagueIds.join(","),
      });
      if (AppState.activeLeagueId) params.set("league_id", AppState.activeLeagueId);
      if (AppState.activeYear) params.set("year", AppState.activeYear);
      AppState.stretchData = await fetchJSON(`/api/stretch?${params.toString()}`);
    } finally {
      hideLoading();
    }
  }

  const st = AppState.stretchData || {};
  const allLeagues = st.leagues || (AppState.overview && AppState.overview.leagues) || [];
  const packages = st.league_packages || [];
  const selectedSet = new Set(st.selected_league_ids || AppState.stretchLeagueIds);

  const renderSingleLeagueStretchHtml = (pkg, pkgIdx) => {
    const lg = pkg.league || {};
    const bracket = pkg.playoff_bracket || {};
    const rounds = bracket.rounds || [];
    const divRaces = pkg.division_races || [];
    const wildCards = pkg.wild_cards || [];
    const trajectories = pkg.trajectories || [];
    const canvasId = `stretch-worm-chart-${lg.league_id}-${pkgIdx}`;

    // 1. Playoff Bracket Tree HTML
    const bracketHtml = rounds.length ? `
      <div class="glass-card p-5 border border-amber-500/35 mb-6">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5 mb-4">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 text-lg">
              <i class="bi bi-diagram-3-fill"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-black uppercase tracking-wider text-white mb-0">
                  ${lg.name} (${lg.abbr}) — ${bracket.is_projected ? 'Projected Playoff Bracket (If Season Ended Today)' : `${pkg.season_year} Official Postseason Bracket`}
                </h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold ${bracket.is_projected ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40' : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'}">
                  ${pkg.phase_badge}
                </span>
              </div>
              <p class="text-xs text-slate-400 mb-0 mt-0.5">
                Format: ${bracket.playoff_mode || 'Bracket'} • Click any team to open Franchise Hub or click series games to inspect box scores
              </p>
            </div>
          </div>
          ${bracket.champion ? `
            <div onclick="switchTeamAndGo(${bracket.champion.team_id})" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/25 to-yellow-500/15 border border-amber-400/60 flex items-center gap-2.5 cursor-pointer hover:scale-[1.02] transition">
              <img src="${teamLogoUrl(bracket.champion.logo_file_name)}" class="w-8 h-8 object-contain" alt="">
              <div>
                <div class="text-[9.5px] font-mono uppercase tracking-widest text-amber-300 font-black">🏆 ${pkg.season_year} LEAGUE CHAMPION</div>
                <div class="text-sm font-black text-white">${bracket.champion.full_name} (${bracket.champion.record_str})</div>
              </div>
            </div>
          ` : ""}
        </div>

        <div class="bracket-tree-scroll">
          ${rounds.map((r, rIdx) => {
            const isFinalRound = rIdx === rounds.length - 1;
            return `
              <div class="bracket-round-col">
                <div class="px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 mb-3 flex items-center justify-between">
                  <span class="font-mono text-xs font-black uppercase tracking-wider ${isFinalRound ? 'text-amber-300' : 'text-sky-300'}">
                    ${isFinalRound ? '<i class="bi bi-trophy-fill mr-1"></i>' : ''}${r.round_name}
                  </span>
                  <span class="text-[10px] font-mono text-slate-400">Best of ${r.best_of}</span>
                </div>
                <div class="bracket-round-matches">
                  ${(r.series || []).map(s => {
                    const t0 = s.team0 || {};
                    const t1 = s.team1 || {};
                    const w0 = s.winner_id && s.winner_id === t0.team_id;
                    const w1 = s.winner_id && s.winner_id === t1.team_id;
                    const winsNeeded = s.wins_needed || Math.floor((s.best_of || 7) / 2) + 1;
                    const statusBadgeCls = s.status_badge === "FINAL"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : (s.status_badge === "LIVE" ? "bg-rose-500/25 text-rose-300 border-rose-400/50 animate-pulse" : "bg-slate-800 text-slate-300 border-slate-700");
                    return `
                      <div class="bracket-series-card ${isFinalRound ? 'championship-card' : ''} p-3.5">
                        <div class="flex items-center justify-between text-[10px] font-mono mb-2 pb-1.5 border-b border-slate-800/80">
                          <span class="px-1.5 py-0.5 rounded border font-extrabold ${statusBadgeCls}">${s.status_badge}</span>
                          <span class="text-slate-300 font-bold">${s.status_label}</span>
                        </div>

                        <!-- Team 0 Row -->
                        <div onclick="${t0.team_id ? `switchTeamAndGo(${t0.team_id})` : ''}" class="flex items-center justify-between py-1.5 px-2 rounded-lg ${w0 ? 'bg-emerald-500/15 border border-emerald-500/35' : 'hover:bg-slate-800/60'} cursor-pointer transition mb-1">
                          <div class="flex items-center gap-2 min-w-0">
                            <img src="${teamLogoUrl(t0.logo_file_name)}" class="w-6 h-6 object-contain shrink-0" alt="">
                            <div class="truncate">
                              <div class="text-xs font-extrabold ${w0 ? 'text-emerald-300' : 'text-white'} truncate">
                                ${t0.full_name || 'TBD'} ${w0 ? '✓' : ''}
                              </div>
                              <div class="text-[10px] font-mono text-slate-400">${t0.record_str || ''} ${t0.seed_label ? `• ${t0.seed_label}` : ''}</div>
                            </div>
                          </div>
                          <div class="flex items-center gap-2 shrink-0">
                            <div class="flex gap-0.5">
                              ${Array.from({ length: winsNeeded }, (_, i) => `
                                <span class="w-2 h-2 rounded-full ${i < s.result0 ? 'bg-amber-400' : 'bg-slate-800 border border-slate-700'}"></span>
                              `).join("")}
                            </div>
                            <span class="font-mono text-base font-black ${s.result0 >= s.result1 ? 'text-white' : 'text-slate-400'} w-4 text-right">${s.result0}</span>
                          </div>
                        </div>

                        <!-- Team 1 Row -->
                        <div onclick="${t1.team_id ? `switchTeamAndGo(${t1.team_id})` : ''}" class="flex items-center justify-between py-1.5 px-2 rounded-lg ${w1 ? 'bg-emerald-500/15 border border-emerald-500/35' : 'hover:bg-slate-800/60'} cursor-pointer transition">
                          <div class="flex items-center gap-2 min-w-0">
                            <img src="${teamLogoUrl(t1.logo_file_name)}" class="w-6 h-6 object-contain shrink-0" alt="">
                            <div class="truncate">
                              <div class="text-xs font-extrabold ${w1 ? 'text-emerald-300' : 'text-white'} truncate">
                                ${t1.full_name || 'TBD'} ${w1 ? '✓' : ''}
                              </div>
                              <div class="text-[10px] font-mono text-slate-400">${t1.record_str || ''} ${t1.seed_label ? `• ${t1.seed_label}` : ''}</div>
                            </div>
                          </div>
                          <div class="flex items-center gap-2 shrink-0">
                            <div class="flex gap-0.5">
                              ${Array.from({ length: winsNeeded }, (_, i) => `
                                <span class="w-2 h-2 rounded-full ${i < s.result1 ? 'bg-amber-400' : 'bg-slate-800 border border-slate-700'}"></span>
                              `).join("")}
                            </div>
                            <span class="font-mono text-base font-black ${s.result1 >= s.result0 ? 'text-white' : 'text-slate-400'} w-4 text-right">${s.result1}</span>
                          </div>
                        </div>

                        <!-- Series Game Scores Strip (if played) -->
                        ${(s.games && s.games.length) ? `
                          <div class="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap gap-1">
                            ${s.games.map((g, gi) => `
                              <span onclick="jumpToGameReplayFromFrontPage(${g.game_id})"
                                    title="Click to replay Game ${gi + 1} (${g.date})"
                                    class="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 hover:border-amber-400 text-[9.5px] font-mono text-slate-300 cursor-pointer transition">
                                G${gi + 1}: <b>${g.winner_abbr}</b> ${Math.max(g.away_runs, g.home_runs)}-${Math.min(g.away_runs, g.home_runs)}
                              </span>
                            `).join("")}
                          </div>
                        ` : ""}
                      </div>
                    `;
                  }).join("")}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    ` : "";

    // 2. Division Pennant Race Cards
    const divCardsHtml = divRaces.map(dr => {
      const badgeCls = dr.race_status === "DEAD HEAT"
        ? "bg-rose-500/20 text-rose-300 border-rose-400/50"
        : (dr.race_status === "DOWN TO THE WIRE"
            ? "bg-amber-500/20 text-amber-300 border-amber-400/50"
            : (dr.race_status === "CLINCHED" ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/50" : "bg-sky-500/20 text-sky-300 border-sky-400/40"));
      return `
        <div class="glass-card overflow-hidden border border-slate-800">
          <div class="px-4 py-3 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <i class="bi bi-flag-fill text-rose-400"></i>
                <h4 class="font-black text-sm uppercase tracking-wider text-white mb-0">${dr.title} Pennant Race</h4>
              </div>
              <div class="text-[11px] text-slate-400 mt-0.5">
                Leader: <b class="text-white">${dr.leader?.full_name || '—'}</b> (${dr.leader?.record_str || ''})
                ${dr.runner_up ? `• Chaser: <b class="text-slate-200">${dr.runner_up.full_name}</b> (${dr.lead_gb} GB)` : ''}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <div class="text-right hidden sm:block">
                <div class="text-[9.5px] font-mono text-slate-400 uppercase">RACE TENSION</div>
                <div class="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                  <div class="h-full bg-gradient-to-r from-sky-400 via-amber-400 to-rose-500" style="width:${dr.closeness_score || 50}%"></div>
                </div>
              </div>
              <span class="px-2.5 py-1 rounded-lg border text-[10px] font-mono font-extrabold ${badgeCls}">
                ${dr.race_status}
              </span>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="saber-table">
              <thead>
                <tr>
                  <th class="text-left">Club</th>
                  <th class="text-right">W-L</th>
                  <th class="text-right">PCT</th>
                  <th class="text-right">GB</th>
                  <th class="text-right" title="Division Magic / Elimination Number">Magic#</th>
                  <th class="text-right">L10</th>
                  <th class="text-right">Strk</th>
                  <th class="text-right">RD</th>
                  <th class="text-right">Pyth</th>
                  <th class="text-right">Playoff%</th>
                </tr>
              </thead>
              <tbody>
                ${(dr.teams || []).map((t, idx) => {
                  const mStr = t.magic_str || "-";
                  const mCls = mStr === "CLINCHED" ? "text-amber-300 font-black" : (mStr === "ELIM" ? "text-slate-500" : "text-sky-300 font-bold");
                  const l10W = Number(t.l10_w || 0);
                  const l10Cls = l10W >= 7 ? "text-emerald-400 font-bold" : (l10W <= 3 ? "text-rose-400" : "text-slate-200");
                  return `
                    <tr onclick="switchTeamAndGo(${t.team_id})" class="cursor-pointer ${idx === 0 ? 'bg-amber-500/5' : ''}">
                      <td class="font-bold">
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-mono text-slate-500 w-3">${idx + 1}</span>
                          <img src="${teamLogoUrl(t.logo_file_name)}" class="w-5 h-5 object-contain" alt="">
                          <span class="text-white hover:text-amber-300 transition">${t.full_name}</span>
                          <span class="text-[10px] font-mono text-slate-400">(${t.abbr})</span>
                        </div>
                      </td>
                      <td class="text-right font-mono font-bold text-white">${t.record_str}</td>
                      <td class="text-right font-mono text-sky-300 font-bold">${fmtAvg(t.pct)}</td>
                      <td class="text-right font-mono ${t.gb === 0 ? 'text-amber-300 font-bold' : 'text-slate-300'}">${t.gb === 0 ? 'LEAD' : t.gb.toFixed(1)}</td>
                      <td class="text-right font-mono text-xs ${mCls}">${mStr}</td>
                      <td class="text-right font-mono text-xs ${l10Cls}">${t.l10_str || '5-5'}</td>
                      <td class="text-right font-mono text-xs ${t.streak > 0 ? 'text-emerald-400' : 'text-rose-400'}">${t.streak_str}</td>
                      <td class="text-right font-mono ${t.run_diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${t.run_diff >= 0 ? '+' : ''}${t.run_diff}</td>
                      <td class="text-right font-mono text-slate-300">${t.pyth_w}-${t.pyth_l}</td>
                      <td class="text-right font-mono font-bold text-sky-400">${Number(t.playoff_prob || 0).toFixed(0)}%</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join("");

    // 3. Wild Card Bubble & Momentum Trajectory Row
    const wcHtml = wildCards.map(wc => `
      <div class="glass-card overflow-hidden border border-slate-800">
        <div class="px-4 py-2.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <i class="bi bi-Scissors text-amber-400"></i>
            <span class="font-extrabold text-xs uppercase tracking-wider text-white">${wc.sub_league_name} Wild Card & Cutline Tracker</span>
          </div>
          <span class="text-[10px] font-mono text-amber-300">Top ${wc.wc_spots} Non-Div Winners Qualify</span>
        </div>
        <div class="overflow-x-auto">
          <table class="saber-table">
            <thead>
              <tr>
                <th class="text-left">Status</th>
                <th class="text-left">Club</th>
                <th class="text-right">W-L</th>
                <th class="text-right">PCT</th>
                <th class="text-right">WC GB</th>
                <th class="text-right">L10</th>
                <th class="text-right">RD</th>
              </tr>
            </thead>
            <tbody>
              ${(wc.standings || []).slice(0, 8).map((t, idx) => {
                const isCutlineRow = idx === wc.wc_spots - 1;
                return `
                  <tr onclick="switchTeamAndGo(${t.team_id})" class="cursor-pointer ${ isCutlineRow ? 'border-b-2 border-dashed border-amber-400' : '' }">
                    <td>
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-extrabold ${t.in_wc_spot ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'}">
                        ${t.wc_status}
                      </span>
                    </td>
                    <td class="font-bold">
                      <div class="flex items-center gap-2">
                        <img src="${teamLogoUrl(t.logo_file_name)}" class="w-4 h-4 object-contain" alt="">
                        <span class="text-white">${t.full_name}</span>
                      </div>
                    </td>
                    <td class="text-right font-mono font-bold text-white">${t.record_str}</td>
                    <td class="text-right font-mono text-sky-300">${fmtAvg(t.pct)}</td>
                    <td class="text-right font-mono font-bold ${t.in_wc_spot ? 'text-emerald-400' : 'text-amber-300'}">${t.wc_gb_str}</td>
                    <td class="text-right font-mono text-xs">${t.l10_str || '5-5'}</td>
                    <td class="text-right font-mono ${t.run_diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${t.run_diff >= 0 ? '+' : ''}${t.run_diff}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `).join("");

    return `
      <section class="space-y-5 pb-8 border-b border-slate-800/80 last:border-b-0">
        <!-- League Stretch Header Banner -->
        <div class="glass-card p-4 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-700/80 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span class="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-300 font-mono text-xs font-black">
              ${lg.level_label || `Level ${lg.level || 1}`}
            </span>
            <div>
              <h2 class="text-lg sm:text-xl font-black text-white tracking-tight mb-0">
                ${lg.name} (${lg.abbr}) — ${pkg.season_year} Stretch & Postseason Center
              </h2>
              <div class="text-xs text-slate-400 font-mono">
                Schedule Progress: <b class="text-white">${pkg.games_played_avg} / ${pkg.scheduled_games} G (${pkg.pct_complete}%)</b> • ${pkg.phase_badge}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-36 sm:w-48">
              <div class="flex justify-between text-[10px] font-mono text-slate-300 mb-1">
                <span>SEASON PROGRESS</span>
                <span class="font-bold text-amber-300">${pkg.pct_complete}%</span>
              </div>
              <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-sky-400 via-amber-400 to-emerald-400" style="width:${pkg.pct_complete}%"></div>
              </div>
            </div>
          </div>
        </div>

        ${bracketHtml}

        <!-- Division Pennant Races Grid -->
        <div class="grid grid-cols-1 ${divRaces.length > 1 ? 'xl:grid-cols-2' : ''} gap-5">
          ${divCardsHtml}
        </div>

        <!-- Wild Card Bubble + Momentum Worm Chart -->
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div class="xl:col-span-6 space-y-4">
            ${wcHtml}
          </div>
          <div class="xl:col-span-6 glass-card p-4 border border-slate-800">
            <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
              <div>
                <h4 class="font-extrabold text-xs uppercase tracking-wider text-white mb-0">
                  <i class="bi bi-graph-up text-amber-400 mr-1.5"></i> Pennant Race Momentum Worm (Games Above / Below .500)
                </h4>
                <div class="text-[11px] text-slate-400">Cumulative season trajectory across top contenders in ${lg.abbr}</div>
              </div>
              <span class="text-[10px] font-mono text-slate-400">${pkg.season_year}</span>
            </div>
            <div class="h-[300px] w-full">
              <canvas id="${canvasId}"></canvas>
            </div>
          </div>
        </div>
      </section>
    `;
  };

  container.innerHTML = `
    <div class="animate-view space-y-6">
      <!-- Top Multi-League Selector Bar for "The Stretch" -->
      <div class="glass-card p-4 border border-rose-500/35 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <i class="bi bi-flag-fill text-rose-400"></i>
            <h2 class="text-base font-black uppercase tracking-wider text-white mb-0">
              “The Stretch” — Multi-League Pennant Races, Magic Numbers & Playoff Brackets
            </h2>
          </div>
          <p class="text-xs text-slate-400 mb-0 mt-0.5">
            Toggle one or multiple leagues below to compare division races, wild-card cutlines, and live or projected postseason brackets side-by-side.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <button onclick="toggleStretchLeagueSelection(${AppState.activeLeagueId || (allLeagues[0] && allLeagues[0].league_id) || 100}, 'single')"
                  class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold transition">
            Active League Only
          </button>
          ${allLeagues.length > 1 ? `
            <button onclick="toggleStretchLeagueSelection(0, 'all')"
                    class="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-xs font-bold transition">
              Compare Multiple Leagues (${Math.min(8, allLeagues.length)})
            </button>
          ` : ""}
        </div>
      </div>

      ${allLeagues.length > 1 ? `
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-[11px] font-mono uppercase text-slate-400 font-bold mr-1">Select Leagues:</span>
          ${allLeagues.map(l => {
            const isSel = selectedSet.has(l.league_id);
            return `
              <button onclick="toggleStretchLeagueSelection(${l.league_id}, 'toggle')"
                      class="px-3 py-1 rounded-xl text-xs font-mono font-bold transition flex items-center gap-1.5 ${isSel ? 'bg-rose-500 text-white shadow-lg border border-rose-300' : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'}">
                <span>${l.abbr}</span>
                <span class="text-[10px] opacity-80">(${l.name})</span>
              </button>
            `;
          }).join("")}
        </div>
      ` : ""}

      <div class="space-y-8">
        ${packages.map((pkg, idx) => renderSingleLeagueStretchHtml(pkg, idx)).join("")}
      </div>
    </div>
  `;

  // Render Momentum Trajectory Worm Charts
  packages.forEach((pkg, idx) => {
    const lg = pkg.league || {};
    const canvasId = `stretch-worm-chart-${lg.league_id}-${idx}`;
    if (typeof renderStretchTrajectoryChart === "function") {
      renderStretchTrajectoryChart(canvasId, pkg.trajectories || []);
    }
  });
}

/* ============================================================================
 * 14. ASSOCIATION / WORLD DASHBOARD — HOLISTIC ECOSYSTEM & AFFILIATE PYRAMID
 * ============================================================================ */
window.setWorldTalentChartMode = function(mode) {
  AppState.worldTalentMode = mode;
  if (AppState.worldData && typeof renderWorldTalentChart === "function") {
    renderWorldTalentChart("world-talent-chart", AppState.worldData.talent_distribution, mode);
  }
  document.querySelectorAll("[data-world-talent-btn]").forEach(btn => {
    const active = btn.getAttribute("data-world-talent-btn") === mode;
    btn.classList.toggle("bg-amber-400", active);
    btn.classList.toggle("text-slate-950", active);
    btn.classList.toggle("bg-slate-900", !active);
    btn.classList.toggle("text-slate-300", !active);
  });
};

window.filterWorldOrgs = function(query) {
  AppState.worldOrgSearch = String(query || "").trim().toLowerCase();
  const cards = document.querySelectorAll("[data-org-card]");
  cards.forEach(c => {
    const hay = (c.getAttribute("data-org-haystack") || "").toLowerCase();
    c.classList.toggle("hidden", Boolean(AppState.worldOrgSearch && !hay.includes(AppState.worldOrgSearch)));
  });
};

window.jumpToLeagueStretch = async function(lid) {
  AppState.stretchLeagueIds = [Number(lid)];
  AppState.stretchData = null;
  await switchTab("stretch");
};

async function renderWorldDashboardTab(container) {
  if (!AppState.worldData) {
    showLoading("Synthesizing Holistic Association & World Ecosystem Dashboard...");
    try {
      const params = new URLSearchParams({ save: AppState.activeSave });
      if (AppState.activeYear) params.set("year", AppState.activeYear);
      AppState.worldData = await fetchJSON(`/api/world_dashboard?${params.toString()}`);
    } finally {
      hideLoading();
    }
  }

  const wd = AppState.worldData || {};
  const kpis = wd.world_kpis || {};
  const leaguesEco = wd.leagues_ecosystem || [];
  const orgPyramid = wd.organizational_pyramid || [];
  const talentDist = wd.talent_distribution || wd.visuals?.talent_distribution || {};
  const nationsPipe = wd.nations_pipeline || wd.visuals?.nations_pipeline || [];
  const finQuad = wd.financial_quadrant || wd.visuals?.financial_quadrant || [];
  const histTrends = Array.isArray(wd.historical_trends) ? wd.historical_trends : [];
  const wLeaders = wd.world_leaders || {};
  const topOrg = orgPyramid[0] || null;

  container.innerHTML = `
    <div class="animate-view space-y-6">

      <!-- Association / World Hero Banner & Macro KPIs -->
      <div class="glass-card p-5 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-sky-500/35">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
          <div class="flex items-center gap-3.5">
            <div class="w-11 h-11 rounded-2xl bg-sky-500/20 border border-sky-400/50 flex items-center justify-center text-sky-300 text-2xl shadow-lg">
              <i class="bi bi-globe-americas"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-lg sm:text-2xl font-black tracking-tight text-white mb-0">
                  Association & World Ecosystem Command Center (${wd.selected_year || ''})
                </h2>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-sky-500/20 text-sky-300 border border-sky-400/40">
                  ${kpis.total_leagues || 1} LEAGUES • ${kpis.total_teams || 0} CLUBS
                </span>
              </div>
              <p class="text-xs text-slate-400 mb-0 mt-0.5">
                Holistic cross-league analytics, organizational affiliate pyramids (MLB &rarr; Rookie), global player talent/age distributions, international pipelines & financial quadrants.
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="switchTab('frontpage')" class="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 text-xs font-bold transition">
              <i class="bi bi-newspaper mr-1"></i> Front Page Gazette
            </button>
            <button onclick="switchTab('stretch')" class="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-400/40 text-xs font-bold transition">
              <i class="bi bi-flag-fill mr-1"></i> The Stretch
            </button>
          </div>
        </div>

        <!-- 6 Macro World KPI Cards -->
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <div class="text-[10px] font-mono uppercase text-slate-400 font-bold">ASSOCIATION SCALE</div>
            <div class="text-xl font-black text-white font-mono mt-0.5">${kpis.total_leagues || 1} Lgs / ${kpis.total_teams || 0} Clubs</div>
            <div class="text-[10.5px] text-sky-400 font-mono mt-0.5">${Number(kpis.total_games_logged || 0).toLocaleString()} Games Logged</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <div class="text-[10px] font-mono uppercase text-slate-400 font-bold">WORLD PLAYER POOL</div>
            <div class="text-xl font-black text-emerald-400 font-mono mt-0.5">${Number(kpis.active_players || 0).toLocaleString()}</div>
            <div class="text-[10.5px] text-slate-300 font-mono mt-0.5">${Number(kpis.rostered_players || 0).toLocaleString()} Rostered • ${Number(kpis.free_agents || 0).toLocaleString()} FA</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <div class="text-[10px] font-mono uppercase text-slate-400 font-bold">ELITE STARS & PROSPECTS</div>
            <div class="text-xl font-black text-amber-300 font-mono mt-0.5">${kpis.elite_stars_60plus || 0} Stars (60+)</div>
            <div class="text-[10.5px] text-slate-300 font-mono mt-0.5">${Number(kpis.u24_prospects || 0).toLocaleString()} U-24 Prospects • Avg Age ${kpis.avg_world_age || 25.5}</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <div class="text-[10px] font-mono uppercase text-slate-400 font-bold">GLOBAL RUN ENVIRONMENT</div>
            <div class="text-xl font-black text-white font-mono mt-0.5">${fmtAvg(kpis.world_avg)}/${fmtAvg(kpis.world_obp)}/${fmtAvg(kpis.world_slg)}</div>
            <div class="text-[10.5px] text-rose-300 font-mono mt-0.5">${Number(kpis.world_era || 4.15).toFixed(2)} World ERA • ${Number(kpis.world_hr || 0).toLocaleString()} HRs</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
            <div class="text-[10px] font-mono uppercase text-slate-400 font-bold">WORLD ECONOMY</div>
            <div class="text-xl font-black text-sky-300 font-mono mt-0.5">${fmtMoney(kpis.total_world_payroll)}</div>
            <div class="text-[10.5px] text-slate-300 font-mono mt-0.5">Avg ${fmtMoney(kpis.avg_team_payroll)} • Max ${fmtMoney(kpis.max_team_payroll)}</div>
          </div>
          <div class="p-3 rounded-xl bg-slate-900/90 border border-amber-500/35">
            <div class="text-[10px] font-mono uppercase text-amber-300 font-bold">#1 ORG POWER INDEX</div>
            <div class="text-lg font-black text-white truncate mt-0.5">${topOrg ? topOrg.parent_name : '—'}</div>
            <div class="text-[10.5px] text-amber-300 font-mono mt-0.5">
              ${topOrg ? `Index ${topOrg.org_power_index} • Org ${fmtAvg(topOrg.org_pct)} (${topOrg.affiliate_count} Aff)` : 'Single-Level Save'}
            </div>
          </div>
        </div>
      </div>

      <!-- 4 High-Level World Analysis Visuals (2x2 Chart.js Grid) -->
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-5">

        <!-- Visual 1: League Ecosystem / Historical Environment -->
        <div class="xl:col-span-6 glass-card p-4 border border-slate-800">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <div>
              <h3 class="font-extrabold text-xs uppercase tracking-wider text-white mb-0">
                <i class="bi bi-bar-chart-line-fill text-sky-400 mr-1.5"></i>
                ${leaguesEco.length > 1 ? 'Association Multi-League Offense (OPS) vs. Pitching (ERA)' : 'World Historical Scoring & ERA Macro Trend'}
              </h3>
              <p class="text-[11px] text-slate-400 mb-0">Comparing run environments across all active leagues & levels</p>
            </div>
            <span class="text-[10px] font-mono text-sky-400">${leaguesEco.length} Leagues</span>
          </div>
          <div class="h-[290px] w-full">
            <canvas id="world-ecosystem-chart"></canvas>
          </div>
        </div>

        <!-- Visual 2: Global Player Talent & Age Distribution -->
        <div class="xl:col-span-6 glass-card p-4 border border-slate-800">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <div>
              <h3 class="font-extrabold text-xs uppercase tracking-wider text-white mb-0">
                <i class="bi bi-people-fill text-amber-400 mr-1.5"></i> World Player Talent Pyramid & Age Curve
              </h3>
              <p class="text-[11px] text-slate-400 mb-0">20–80 Scouting Scale distribution & demographic aging curve across ${Number(kpis.active_players || 0).toLocaleString()} players</p>
            </div>
            <div class="flex items-center gap-1">
              <button data-world-talent-btn="tiers" onclick="setWorldTalentChartMode('tiers')" class="px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-amber-400 text-slate-950">
                20-80 Tiers
              </button>
              <button data-world-talent-btn="ages" onclick="setWorldTalentChartMode('ages')" class="px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-slate-900 text-slate-300 border border-slate-700">
                Age Curve
              </button>
            </div>
          </div>
          <div class="h-[290px] w-full">
            <canvas id="world-talent-chart"></canvas>
          </div>
        </div>

        <!-- Visual 3: Financial Power vs. On-Field Dominance Quadrant -->
        <div class="xl:col-span-6 glass-card p-4 border border-slate-800">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <div>
              <h3 class="font-extrabold text-xs uppercase tracking-wider text-white mb-0">
                <i class="bi bi-cash-coin text-emerald-400 mr-1.5"></i> Financial Power (Payroll/Budget) vs. On-Field Win% Quadrant
              </h3>
              <p class="text-[11px] text-slate-400 mb-0">Classifies clubs into Juggernauts, Moneyball Contenders, Rebuilders & Underachievers</p>
            </div>
            <span class="text-[10px] font-mono text-emerald-400">Hover dots for club details</span>
          </div>
          <div class="h-[290px] w-full">
            <canvas id="world-financial-chart"></canvas>
          </div>
        </div>

        <!-- Visual 4: International Talent Pipeline -->
        <div class="xl:col-span-6 glass-card p-4 border border-slate-800">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <div>
              <h3 class="font-extrabold text-xs uppercase tracking-wider text-white mb-0">
                <i class="bi bi-flag-fill text-emerald-400 mr-1.5"></i> Global International Talent Pipeline (Top Nations)
              </h3>
              <p class="text-[11px] text-slate-400 mb-0">Player origins and 60+ OVR star production across the game world</p>
            </div>
            <span class="text-[10px] font-mono text-slate-400">Top ${nationsPipe.length} Countries</span>
          </div>
          <div class="h-[290px] w-full">
            <canvas id="world-nations-chart"></canvas>
          </div>
        </div>

      </div>

      <!-- All-Leagues Association Ecosystem Table -->
      <div class="glass-card overflow-hidden border border-slate-800">
        <div class="px-4 py-3 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <i class="bi bi-diagram-2-fill text-sky-400"></i>
            <h3 class="font-extrabold text-sm uppercase tracking-wider text-white mb-0">
              All-Leagues Association Ecosystem Matrix (${leaguesEco.length} Leagues)
            </h3>
          </div>
          <span class="text-xs text-slate-400">Click any league to switch context or inspect its Pennant Race on "The Stretch"</span>
        </div>
        <div class="overflow-x-auto">
          <table class="saber-table">
            <thead>
              <tr>
                <th class="text-left">Level</th>
                <th class="text-left">League Name</th>
                <th class="text-right">Teams</th>
                <th class="text-right">Players</th>
                <th class="text-right">Games</th>
                <th class="text-right">Slash (AVG/OBP/SLG)</th>
                <th class="text-right">OPS</th>
                <th class="text-right">ERA</th>
                <th class="text-right">Total HR</th>
                <th class="text-right">Avg Payroll</th>
                <th class="text-left">Current Leader / Champion</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${leaguesEco.map(l => `
                <tr class="hover:bg-slate-800/50">
                  <td>
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${l.level === 1 ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40' : 'bg-slate-800 text-slate-300'}">
                      ${l.level_label}
                    </span>
                  </td>
                  <td class="font-bold">
                    <div class="flex items-center gap-2">
                      <span class="text-white">${l.name}</span>
                      <span class="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-[10px]">${l.abbr}</span>
                    </div>
                  </td>
                  <td class="text-right font-mono text-white font-bold">${l.teams_count}</td>
                  <td class="text-right font-mono text-slate-300">${Number(l.rostered_players || 0).toLocaleString()}</td>
                  <td class="text-right font-mono text-slate-300">${Number(l.games_played || 0).toLocaleString()}</td>
                  <td class="text-right font-mono text-slate-200">${fmtAvg(l.league_avg)}/${fmtAvg(l.league_obp)}/${fmtAvg(l.league_slg)}</td>
                  <td class="text-right font-mono font-bold text-sky-300">${fmtAvg(l.league_ops)}</td>
                  <td class="text-right font-mono font-bold text-amber-300">${Number(l.league_era || 0).toFixed(2)}</td>
                  <td class="text-right font-mono text-emerald-400">${Number(l.total_hr || 0).toLocaleString()}</td>
                  <td class="text-right font-mono text-slate-300">${fmtMoney(l.avg_payroll)}</td>
                  <td>
                    ${l.leader_team ? `
                      <div onclick="onLeagueChanged(${l.league_id})" class="flex items-center gap-2 cursor-pointer">
                        <img src="${teamLogoUrl(l.leader_team.logo_file_name)}" class="w-5 h-5 object-contain" alt="">
                        <span class="font-bold text-white hover:text-amber-300">${l.leader_team.full_name}</span>
                        <span class="font-mono text-xs text-emerald-400">(${l.leader_team.record_str})</span>
                      </div>
                    ` : '<span class="text-slate-500">—</span>'}
                  </td>
                  <td class="text-right">
                    <div class="inline-flex items-center gap-1.5">
                      <button onclick="onLeagueChanged(${l.league_id})" class="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/40 text-[10px] font-mono font-bold">
                        Select
                      </button>
                      <button onclick="jumpToLeagueStretch(${l.league_id})" class="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-400/40 text-[10px] font-mono font-bold">
                        Stretch
                      </button>
                    </div>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Organizational Pyramid & Minor-League Affiliate Explorer -->
      <div class="glass-card p-5 border border-slate-800">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5 mb-4">
          <div>
            <div class="flex items-center gap-2">
              <i class="bi bi-building-fill-check text-amber-400"></i>
              <h3 class="font-extrabold text-sm uppercase tracking-wider text-white mb-0">
                Organizational Power Pyramid & Minor-League Affiliate Chains (${orgPyramid.length} Franchises)
              </h3>
            </div>
            <p class="text-xs text-slate-400 mb-0 mt-0.5">
              Ranks every parent organization by composite Organization Power Index (MLB Win% + Farm System Win% across AAA/AA/A/Rookie + U-24 Prospect Depth + Team WAR).
            </p>
          </div>
          <div class="flex items-center bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
            <i class="bi bi-search text-slate-400 text-xs mr-2"></i>
            <input type="text" placeholder="Filter Organizations or Affiliates..." oninput="filterWorldOrgs(this.value)" class="bg-transparent text-xs text-white focus:outline-none w-56 font-mono" />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4 max-h-[680px] overflow-y-auto pr-1">
          ${orgPyramid.map((org, idx) => {
            const affs = org.affiliates || [];
            const hay = `${org.parent_name} ${org.parent_abbr} ${affs.map(a => `${a.full_name} ${a.league_abbr}`).join(" ")}`;
            return `
              <div data-org-card data-org-haystack="${hay.replace(/"/g, '&quot;')}"
                   class="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-400/50 transition flex flex-col justify-between">
                <div>
                  <div class="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800">
                    <div onclick="switchTeamAndGo(${org.parent_team_id})" class="flex items-center gap-2.5 min-w-0 cursor-pointer group">
                      <span class="w-6 h-6 rounded-lg ${idx < 3 ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300'} font-mono text-xs font-black flex items-center justify-center shrink-0">
                        ${idx + 1}
                      </span>
                      <img src="${teamLogoUrl(org.logo_file_name)}" class="w-8 h-8 object-contain shrink-0" alt="">
                      <div class="truncate">
                        <div class="text-sm font-black text-white group-hover:text-amber-300 transition truncate">${org.parent_name}</div>
                        <div class="text-[10.5px] font-mono text-slate-400">
                          ${org.league_abbr} • <b>${org.parent_record}</b> (${fmtAvg(org.parent_pct)}) • ${org.parent_war} WAR
                        </div>
                      </div>
                    </div>
                    <div class="text-right shrink-0">
                      <div class="text-[9.5px] font-mono text-amber-300 uppercase font-bold">ORG INDEX</div>
                      <div class="text-base font-black font-mono text-white">${org.org_power_index.toFixed(1)}</div>
                    </div>
                  </div>

                  <div class="grid grid-cols-3 gap-2 text-center font-mono text-[11px] mb-3 bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                    <div>
                      <div class="text-[9.5px] text-slate-400">ORG RECORD</div>
                      <div class="font-bold text-sky-300">${org.org_w}-${org.org_l} (${fmtAvg(org.org_pct)})</div>
                    </div>
                    <div>
                      <div class="text-[9.5px] text-slate-400">U-24 PROSPECTS</div>
                      <div class="font-bold text-emerald-400">${org.farm_prospect_count} (Avg ${org.farm_top5_pot} POT)</div>
                    </div>
                    <div>
                      <div class="text-[9.5px] text-slate-400">PAYROLL</div>
                      <div class="font-bold text-slate-200">${fmtMoney(org.payroll)}</div>
                    </div>
                  </div>

                  ${affs.length ? `
                    <div class="space-y-1">
                      <div class="text-[9.5px] font-mono uppercase tracking-wider text-slate-400 font-bold mb-1">
                        Affiliate Farm Chain (${affs.length} Clubs)
                      </div>
                      ${affs.slice(0, 6).map(a => `
                        <div onclick="onLeagueChanged(${a.league_id})" class="flex items-center justify-between text-[11px] font-mono py-1 px-2 rounded bg-slate-950/60 hover:bg-slate-800/80 cursor-pointer transition">
                          <div class="flex items-center gap-1.5 truncate">
                            <span class="px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 text-[9.5px] font-bold w-11 text-center shrink-0">${a.level_short}</span>
                            <span class="text-slate-200 truncate">${a.full_name}</span>
                            <span class="text-[9.5px] text-slate-500">(${a.league_abbr})</span>
                          </div>
                          <span class="font-bold ${a.pct >= 0.500 ? 'text-emerald-400' : 'text-slate-400'} shrink-0 ml-2">${a.record_str}</span>
                        </div>
                      `).join("")}
                    </div>
                  ` : `<div class="text-[11px] text-slate-500 font-mono text-center py-2">Standalone Club (No Minor League Affiliates)</div>`}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>

      <!-- Global Pound-for-Pound Leaders & Top World Prospects -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <!-- Top World Batters -->
        <div class="glass-card p-4 border border-slate-800">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <h4 class="font-extrabold text-xs uppercase tracking-wider text-white mb-0">
              <i class="bi bi-trophy-fill text-amber-400 mr-1.5"></i> Global Batting WAR Leaders (All Leagues)
            </h4>
            <span class="text-[10px] font-mono text-slate-400">${wd.selected_year || ''}</span>
          </div>
          <div class="space-y-2">
            ${(wLeaders.batters || []).slice(0, 8).map((p, i) => `
              <div onclick="openPlayerModal(${p.player_id})" class="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-800/70 cursor-pointer transition text-xs">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="font-mono font-bold text-slate-500 w-4">${i + 1}</span>
                  <img src="${playerPicUrl(p.player_id)}" class="w-6 h-8 object-cover rounded border border-slate-700" alt="">
                  <div class="truncate">
                    <div class="font-bold text-white truncate">${p.name}</div>
                    <div class="text-[10px] font-mono text-slate-400">${p.league_abbr} • ${p.team_abbr} • ${p.position}</div>
                  </div>
                </div>
                <div class="text-right font-mono shrink-0">
                  <div class="font-black text-sky-400">${Number(p.war).toFixed(1)} WAR</div>
                  <div class="text-[10px] text-slate-400">${fmtAvg(p.avg)} • ${p.hr} HR</div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- Top World Pitchers -->
        <div class="glass-card p-4 border border-slate-800">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <h4 class="font-extrabold text-xs uppercase tracking-wider text-white mb-0">
              <i class="bi bi-lightning-fill text-emerald-400 mr-1.5"></i> Global Pitching WAR Leaders (All Leagues)
            </h4>
            <span class="text-[10px] font-mono text-slate-400">${wd.selected_year || ''}</span>
          </div>
          <div class="space-y-2">
            ${(wLeaders.pitchers || []).slice(0, 8).map((p, i) => `
              <div onclick="openPlayerModal(${p.player_id})" class="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-800/70 cursor-pointer transition text-xs">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="font-mono font-bold text-slate-500 w-4">${i + 1}</span>
                  <img src="${playerPicUrl(p.player_id)}" class="w-6 h-8 object-cover rounded border border-slate-700" alt="">
                  <div class="truncate">
                    <div class="font-bold text-white truncate">${p.name}</div>
                    <div class="text-[10px] font-mono text-slate-400">${p.league_abbr} • ${p.team_abbr} • ${p.ip} IP</div>
                  </div>
                </div>
                <div class="text-right font-mono shrink-0">
                  <div class="font-black text-emerald-400">${Number(p.war).toFixed(1)} WAR</div>
                  <div class="text-[10px] text-slate-400">${Number(p.era).toFixed(2)} ERA • ${p.k} K</div>
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- Top World U-24 Prospects -->
        <div class="glass-card p-4 border border-slate-800">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <h4 class="font-extrabold text-xs uppercase tracking-wider text-white mb-0">
              <i class="bi bi-stars text-purple-400 mr-1.5"></i> Top World U-24 Prospects (20–80 Scale)
            </h4>
            <span class="text-[10px] font-mono text-slate-400">OVR / POT</span>
          </div>
          <div class="space-y-2">
            ${(wLeaders.prospects || []).slice(0, 8).map((p, i) => `
              <div onclick="openPlayerModal(${p.player_id})" class="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-800/70 cursor-pointer transition text-xs">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="font-mono font-bold text-slate-500 w-4">${i + 1}</span>
                  <img src="${playerPicUrl(p.player_id)}" class="w-6 h-8 object-cover rounded border border-slate-700" alt="">
                  <div class="truncate">
                    <div class="font-bold text-white truncate">${p.name} <span class="text-[10px] text-slate-400">(Age ${p.age})</span></div>
                    <div class="text-[10px] font-mono text-slate-400">${p.league_abbr} • ${p.team_abbr} • ${p.position}</div>
                  </div>
                </div>
                <div class="text-right font-mono shrink-0">
                  ${rtgBadge(p.oa, p.pot)}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>

    </div>
  `;

  // Render the 4 Chart.js Visuals on the World Dashboard
  if (typeof renderWorldEcosystemChart === "function") {
    renderWorldEcosystemChart("world-ecosystem-chart", leaguesEco, histTrends);
  }
  if (typeof renderWorldTalentChart === "function") {
    renderWorldTalentChart("world-talent-chart", talentDist, AppState.worldTalentMode || "tiers");
  }
  if (typeof renderWorldFinancialQuadrantChart === "function") {
    renderWorldFinancialQuadrantChart("world-financial-chart", finQuad);
  }
  if (typeof renderWorldNationsChart === "function") {
    renderWorldNationsChart("world-nations-chart", nationsPipe);
  }
}

document.addEventListener("DOMContentLoaded", initApp);


