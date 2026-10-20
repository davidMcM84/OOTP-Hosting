// OOTP 27 Interactive Statcast SVG Ballpark Spray Chart, Graphical Depth Chart & Chart.js Visualizers

window._chartInstances = window._chartInstances || {};

function destroyChart(id) {
  if (window._chartInstances[id]) {
    try { window._chartInstances[id].destroy(); } catch (e) {}
    delete window._chartInstances[id];
  }
}

function rtgBadge(val, showPot) {
  const v = Number(val) || 20;
  let cls = "rtg-20";
  if (v >= 75) cls = "rtg-80";
  else if (v >= 65) cls = "rtg-70";
  else if (v >= 55) cls = "rtg-60";
  else if (v >= 45) cls = "rtg-50";
  else if (v >= 35) cls = "rtg-40";
  const potStr = showPot && showPot > v ? `<span class="text-[10px] opacity-75 ml-0.5">/${showPot}</span>` : "";
  return `<span class="rtg-badge ${cls}">${v}${potStr}</span>`;
}

function savantColor(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 50));
  if (p >= 90) return "#ef4444";
  if (p >= 75) return "#f97316";
  if (p >= 60) return "#fb923c";
  if (p >= 41) return "#64748b";
  if (p >= 25) return "#38bdf8";
  return "#2563eb";
}

function renderSavantPercentileSliders(percentiles) {
  if (!percentiles || !percentiles.length) {
    return `<div class="text-slate-400 text-xs py-4 text-center">No percentile data available for this player yet.</div>`;
  }
  return percentiles.map(item => {
    const c = savantColor(item.pct);
    return `
      <div class="mb-3">
        <div class="flex justify-between items-center text-xs mb-1">
          <span class="font-semibold text-slate-200">${item.label}</span>
          <span class="font-mono text-slate-300 font-bold">${item.value}</span>
        </div>
        <div class="savant-bar-track">
          <div class="savant-bar-fill" style="width:${item.pct}%; background: linear-gradient(90deg, #1e293b 0%, ${c} 100%);"></div>
          <div class="savant-bubble" style="left:${item.pct}%; background:${c};">${item.pct}</div>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Renders an interactive SVG Ballpark Spray Chart with real stadium dimensions from parks.csv,
 * including an "All Stadiums" Multi-Park Wall Overlay mode and live Game Replay play highlighting.
 */
function renderBallparkSpraySVG(containerId, sprayData, opts = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const park = (sprayData && sprayData.park) || {
    name: "League Stadium",
    distances: [330, 368, 388, 405, 388, 368, 330],
    wall_heights: [8, 8, 8, 8, 8, 8, 8],
    avg: 1.0,
    hr: 1.0,
  };
  const isAllStadiums = Boolean(park.is_all_stadiums || park.park_id === -1);
  const overlayParks = park.overlay_parks || (sprayData && sprayData.parks) || [];
  const dists = park.distances || [330, 368, 388, 405, 388, 368, 330];
  const minDists = park.min_distances || dists;
  const maxDists = park.max_distances || dists;
  const heights = park.wall_heights || [8, 8, 8, 8, 8, 8, 8];
  const points = ((sprayData && sprayData.points) || []).filter(p => p.is_bip && p.distance_ft > 0);
  const colorMode = opts.colorMode || "result"; // 'result' | 'ev' | 'dong'
  const highlightStepIndex = opts.highlightStepIndex || null;

  const W = 620;
  const H = 540;
  const cx = W / 2;
  const cy = 468;
  const scale = 0.94; // 1 foot = 0.94 SVG units

  function polarToXY(angleDeg, distFt) {
    const rad = (angleDeg * Math.PI) / 180.0;
    const r = distFt * scale;
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
  }

  // 7 outfield wall anchor angles: -45, -30, -15, 0, +15, +30, +45
  const wallAngles = [-45, -30, -15, 0, 15, 30, 45];
  const outerBoundDists = isAllStadiums ? maxDists : dists;
  const wallCoords = wallAngles.map((ang, i) => polarToXY(ang, outerBoundDists[i] || 360));
  const avgWallCoords = wallAngles.map((ang, i) => polarToXY(ang, dists[i] || 360));
  const trackCoords = wallAngles.map((ang, i) => polarToXY(ang, Math.max(250, (dists[i] || 360) - 18)));

  const wallPolyPoints = [[cx, cy], ...wallCoords, [cx, cy]].map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const trackPolyPoints = [[cx, cy], ...trackCoords, [cx, cy]].map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const wallPathD = "M " + avgWallCoords.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ");

  // Multi-Park Wall Contours when "All Stadiums" is selected
  let multiParkWallsSvg = "";
  if (isAllStadiums && overlayParks.length > 0) {
    const minCoords = wallAngles.map((ang, i) => polarToXY(ang, minDists[i] || 320));
    const maxCoords = wallAngles.map((ang, i) => polarToXY(ang, maxDists[i] || 410));
    const bandPoints = [...maxCoords, ...minCoords.slice().reverse()].map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    multiParkWallsSvg += `<polygon points="${bandPoints}" fill="rgba(56, 189, 248, 0.12)" stroke="none" />`;

    overlayParks.forEach((op, pIdx) => {
      const pDists = op.distances || dists;
      const pCoords = wallAngles.map((ang, i) => polarToXY(ang, pDists[i] || 360));
      const pPath = "M " + pCoords.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ");
      const hue = Math.round((pIdx * 137.5) % 360);
      const strokeColor = `hsla(${hue}, 85%, 65%, 0.45)`;
      multiParkWallsSvg += `
        <path d="${pPath}" fill="none" stroke="${strokeColor}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="hover:stroke-white hover:stroke-[3px] transition-all cursor-pointer">
          <title>${op.name} (${pDists.join("' / ")}')</title>
        </path>
      `;
    });
  }

  // Infield diamond coordinates (90ft bases)
  const [b1x, b1y] = polarToXY(45, 90);
  const [b2x, b2y] = polarToXY(0, 127.3);
  const [b3x, b3y] = polarToXY(-45, 90);
  const [mx, my] = polarToXY(0, 60.5);
  const [ifArcL_x, ifArcL_y] = polarToXY(-45, 155);
  const [ifArcC_x, ifArcC_y] = polarToXY(0, 162);
  const [ifArcR_x, ifArcR_y] = polarToXY(45, 155);

  // Distance labels along the outfield wall
  const wallLabelsSvg = wallAngles.map((ang, i) => {
    const labelDist = (outerBoundDists[i] || 360) + 18;
    const [lx, ly] = polarToXY(ang, labelDist);
    const hFt = heights[i] || 8;
    if (isAllStadiums) {
      return `
        <g>
          <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" fill="#38bdf8" font-size="9.5" font-weight="800" font-family="monospace">${minDists[i]}'–${maxDists[i]}'</text>
          <text x="${lx.toFixed(1)}" y="${(ly + 11).toFixed(1)}" text-anchor="middle" fill="#94a3b8" font-size="8.5" font-family="monospace">Avg ${dists[i]}'</text>
        </g>
      `;
    }
    return `
      <g>
        <text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" fill="#94a3b8" font-size="10.5" font-weight="700" font-family="monospace">${dists[i]}'</text>
        <text x="${lx.toFixed(1)}" y="${(ly + 11).toFixed(1)}" text-anchor="middle" fill="#475569" font-size="8.5" font-family="monospace">(${hFt}' wall)</text>
      </g>
    `;
  }).join("");

  // Plot batted ball dots
  let highlightRingSvg = "";
  const dotsSvg = points.map((pt, idx) => {
    const [px, py] = polarToXY(pt.angle_deg, pt.distance_ft);
    let fill = pt.color || "#38bdf8";
    const totalP = pt.total_parks || overlayParks.length || 1;
    const dongCnt = pt.dong_parks_count || 0;

    if (colorMode === "ev") {
      if (pt.exit_velo >= 105) fill = "#ec4899";
      else if (pt.exit_velo >= 95) fill = "#f97316";
      else if (pt.exit_velo >= 85) fill = "#eab308";
      else fill = "#38bdf8";
    } else if (colorMode === "dong") {
      if (isAllStadiums) {
        if (dongCnt === totalP && totalP > 0) fill = "#ec4899"; // No-Doubter (All Parks)
        else if (dongCnt >= Math.ceil(totalP / 2)) fill = "#a855f7"; // Majority of Parks
        else if (dongCnt >= 1) fill = "#f59e0b"; // Unicorn HR (1+ Parks)
        else fill = pt.is_hit ? "#22c55e" : "#475569";
      } else {
        fill = pt.would_it_dong ? "#ec4899" : (pt.is_hit ? "#22c55e" : "#475569");
      }
    }

    const isHighlighted = highlightStepIndex && pt.step_index === highlightStepIndex;
    const radius = isHighlighted ? 8.5 : (pt.result === "HR" ? 6.0 : (pt.is_barrel ? 5.5 : (pt.is_hit ? 4.6 : 3.6)));
    const stroke = isHighlighted ? "#ffffff" : (pt.is_barrel ? "#fde047" : (pt.result === "HR" ? "#ffffff" : "#0f172a"));
    const strokeW = isHighlighted ? 2.8 : (pt.is_barrel || pt.result === "HR" ? 1.8 : 1.0);
    const opacity = isHighlighted ? 1.0 : (pt.is_hit ? 0.94 : 0.62);

    if (isHighlighted) {
      highlightRingSvg = `
        <g>
          <line x1="${cx}" y1="${cy}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="${fill}" stroke-width="2.2" stroke-dasharray="5 3" opacity="0.85" />
          <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="15" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0.9">
            <animate attributeName="r" values="8;18;8" dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.95;0.2;0.95" dur="1.4s" repeatCount="indefinite" />
          </circle>
        </g>
      `;
    }

    return `<circle class="spray-dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" opacity="${opacity}" data-idx="${idx}" />`;
  }).join("");

  // Range rings (200ft, 300ft, 400ft)
  const ringsSvg = [200, 300, 400].map(ft => {
    const [rxL, ryL] = polarToXY(-45, ft);
    const [rxR, ryR] = polarToXY(45, ft);
    const r = ft * scale;
    return `<path d="M ${rxL.toFixed(1)} ${ryL.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${rxR.toFixed(1)} ${ryR.toFixed(1)}" fill="none" stroke="rgba(148,163,184,0.13)" stroke-dasharray="4 4" stroke-width="1"/>`;
  }).join("");

  const [foulL_x, foulL_y] = polarToXY(-45, (outerBoundDists[0] || 330) + 5);
  const [foulR_x, foulR_y] = polarToXY(45, (outerBoundDists[6] || 330) + 5);

  el.innerHTML = `
    <div class="relative select-none">
      <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto max-h-[520px] uw:max-h-[600px] mx-auto drop-shadow-2xl">
        <defs>
          <radialGradient id="turfGrad_${containerId}" cx="50%" cy="82%" r="75%">
            <stop offset="0%" stop-color="#14532d" />
            <stop offset="55%" stop-color="#064e3b" />
            <stop offset="100%" stop-color="#022c22" />
          </radialGradient>
          <linearGradient id="dirtGrad_${containerId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#78350f" />
            <stop offset="100%" stop-color="#451a03" />
          </linearGradient>
        </defs>

        <!-- Warning Track Polygon -->
        <polygon points="${wallPolyPoints}" fill="#451a03" opacity="0.78" />

        <!-- Outfield Grass Polygon -->
        <polygon points="${trackPolyPoints}" fill="url(#turfGrad_${containerId})" />

        <!-- Mowed Grass Stripes -->
        ${[-37.5, -22.5, -7.5, 7.5, 22.5, 37.5].map(a => {
          const [sx, sy] = polarToXY(a, 380);
          return `<line x1="${cx}" y1="${cy}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}" stroke="rgba(255,255,255,0.03)" stroke-width="14" />`;
        }).join("")}

        <!-- Distance Rings -->
        ${ringsSvg}

        <!-- Infield Dirt Cutout -->
        <path d="M ${cx} ${cy} L ${ifArcL_x.toFixed(1)} ${ifArcL_y.toFixed(1)} Q ${ifArcC_x.toFixed(1)} ${(ifArcC_y - 24).toFixed(1)} ${ifArcR_x.toFixed(1)} ${ifArcR_y.toFixed(1)} Z" fill="url(#dirtGrad_${containerId})" opacity="0.88" />

        <!-- Infield Grass Diamond -->
        <polygon points="${cx},${cy - 8} ${b1x.toFixed(1)},${b1y.toFixed(1)} ${b2x.toFixed(1)},${b2y.toFixed(1)} ${b3x.toFixed(1)},${b3y.toFixed(1)}" fill="#15803d" stroke="#a16207" stroke-width="1.5" />

        <!-- Foul Lines -->
        <line x1="${cx}" y1="${cy}" x2="${foulL_x.toFixed(1)}" y2="${foulL_y.toFixed(1)}" stroke="rgba(248,250,252,0.55)" stroke-width="1.6" />
        <line x1="${cx}" y1="${cy}" x2="${foulR_x.toFixed(1)}" y2="${foulR_y.toFixed(1)}" stroke="rgba(248,250,252,0.55)" stroke-width="1.6" />

        <!-- Multi-Park Outfield Wall Overlay (when All Stadiums is active) -->
        ${multiParkWallsSvg}

        <!-- Primary / Average Outfield Fence Wall -->
        <path d="${wallPathD}" fill="none" stroke="#38bdf8" stroke-width="${isAllStadiums ? '2.5' : '3.5'}" ${isAllStadiums ? 'stroke-dasharray="6 4"' : ''} stroke-linecap="round" stroke-linejoin="round" />

        <!-- Wall Distance & Height Labels -->
        ${wallLabelsSvg}

        <!-- Bases & Pitcher's Mound -->
        <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="8" fill="#92400e" stroke="#f8fafc" stroke-width="1" />
        <rect x="${(b1x - 4).toFixed(1)}" y="${(b1y - 4).toFixed(1)}" width="8" height="8" fill="#ffffff" transform="rotate(45 ${b1x.toFixed(1)} ${b1y.toFixed(1)})" />
        <rect x="${(b2x - 4).toFixed(1)}" y="${(b2y - 4).toFixed(1)}" width="8" height="8" fill="#ffffff" transform="rotate(45 ${b2x.toFixed(1)} ${b2y.toFixed(1)})" />
        <rect x="${(b3x - 4).toFixed(1)}" y="${(b3y - 4).toFixed(1)}" width="8" height="8" fill="#ffffff" transform="rotate(45 ${b3x.toFixed(1)} ${b3y.toFixed(1)})" />
        <polygon points="${cx},${cy + 4} ${cx - 6},${cy - 2} ${cx - 6},${cy - 8} ${cx + 6},${cy - 8} ${cx + 6},${cy - 2}" fill="#ffffff" />

        <!-- Highlighted Play Trajectory & Pulse Ring -->
        ${highlightRingSvg}

        <!-- Plotted Batted Balls -->
        <g id="dots_${containerId}">
          ${dotsSvg}
        </g>

        <!-- Park Header Watermark -->
        <text x="${cx}" y="22" text-anchor="middle" fill="#e2e8f0" font-size="12.5" font-weight="800" letter-spacing="0.06em">${park.name.toUpperCase()} (PF: AVG ${park.avg || '1.000'} | HR ${park.hr || '1.000'})</text>
      </svg>
    </div>
  `;

  // Wire up interactive dot hover/click inspector
  const dotEls = el.querySelectorAll(".spray-dot");
  const inspectorEl = document.getElementById(opts.inspectorId || "spray-at-bat-inspector");
  dotEls.forEach(dot => {
    const handleSelect = () => {
      const idx = Number(dot.getAttribute("data-idx"));
      const pt = points[idx];
      if (!pt || !inspectorEl) return;
      const dongCnt = pt.dong_parks_count || 0;
      const totParks = pt.total_parks || overlayParks.length || 1;
      const dongBadge = dongCnt > 0
        ? `<span class="ml-1.5 px-2 py-0.5 rounded text-[11px] font-extrabold ${dongCnt === totParks ? 'bg-pink-500/25 text-pink-300 border border-pink-400/60' : 'bg-purple-500/25 text-purple-300 border border-purple-400/60'}">HR IN ${dongCnt}/${totParks} PARKS</span>`
        : (pt.distance_ft >= 300 ? `<span class="ml-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">0/${totParks} PARKS</span>` : "");

      inspectorEl.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-700/70 pb-2 mb-2">
          <div class="flex flex-wrap items-center gap-1">
            <span class="px-2 py-0.5 rounded text-xs font-extrabold" style="background:${pt.color}25; color:${pt.color}; border:1px solid ${pt.color}80;">${pt.result_label.toUpperCase()}</span>
            ${pt.is_barrel ? `<span class="px-2 py-0.5 rounded text-[11px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-400/50"><i class="bi bi-fire"></i> BARREL</span>` : ""}
            ${dongBadge}
          </div>
          <span class="text-xs text-slate-400 font-mono">${pt.date || ''} • ${pt.inning_label || ('Inn ' + pt.inning)} (${pt.outs} Out)</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs mb-2.5">
          <div class="bg-slate-900/70 p-2 rounded-lg border border-slate-800">
            <div class="text-[10px] text-slate-400 uppercase">Batter (${pt.bats})</div>
            <button onclick="openPlayerModal(${pt.player_id})" class="font-bold text-sky-400 hover:underline text-left truncate block w-full">${pt.batter_name}</button>
          </div>
          <div class="bg-slate-900/70 p-2 rounded-lg border border-slate-800">
            <div class="text-[10px] text-slate-400 uppercase">Pitcher (${pt.throws})</div>
            <button onclick="openPlayerModal(${pt.opponent_id})" class="font-bold text-emerald-400 hover:underline text-left truncate block w-full">${pt.pitcher_name}</button>
          </div>
        </div>
        <div class="grid grid-cols-4 gap-1.5 text-center bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 text-xs">
          <div><div class="text-[10px] text-slate-400">Exit Velo</div><div class="font-extrabold text-white font-mono">${pt.exit_velo} <span class="text-[10px] font-normal text-slate-400">mph</span></div></div>
          <div><div class="text-[10px] text-slate-400">Launch Ang</div><div class="font-extrabold text-white font-mono">${pt.launch_angle}°</div></div>
          <div><div class="text-[10px] text-slate-400">Distance</div><div class="font-extrabold text-sky-300 font-mono">${pt.distance_ft} <span class="text-[10px] font-normal text-slate-400">ft</span></div></div>
          <div><div class="text-[10px] text-slate-400">xwOBA</div><div class="font-extrabold text-amber-300 font-mono">${pt.xwoba.toFixed(3)}</div></div>
        </div>
        ${dongCnt > 0 && pt.dong_park_names && pt.dong_park_names.length ? `
          <div class="mt-2 text-[10px] text-slate-400 bg-slate-900/60 px-2.5 py-1.5 rounded border border-slate-800/80 truncate">
            <span class="text-pink-400 font-bold">Clears Fence In:</span> ${pt.dong_park_names.join(", ")}${dongCnt > pt.dong_park_names.length ? ` +${dongCnt - pt.dong_park_names.length} more` : ""}
          </div>
        ` : ""}
        <div class="flex justify-between items-center mt-2.5 text-[11px] text-slate-400">
          <span>Count: <b class="text-slate-200">${pt.count}</b> | Zone: <b class="text-slate-200">${pt.zone_code} (${pt.direction})</b></span>
          ${pt.game_id ? `<button onclick="openGameReplayModal(${pt.game_id})" class="text-sky-400 hover:text-sky-300 font-semibold"><i class="bi bi-play-circle"></i> Game #${pt.game_id} Replay</button>` : ""}
        </div>
      `;
    };
    dot.addEventListener("mouseenter", handleSelect);
    dot.addEventListener("click", handleSelect);
  });

  // Auto-populate inspector with highlighted step or hardest hit ball initially
  if (points.length && inspectorEl && !inspectorEl.dataset.initialized) {
    let bestIdx = 0;
    if (highlightStepIndex) {
      const found = points.findIndex(p => p.step_index === highlightStepIndex);
      if (found >= 0) bestIdx = found;
    } else {
      bestIdx = points.reduce((bestI, cur, i, arr) => (cur.exit_velo > arr[bestI].exit_velo ? i : bestI), 0);
    }
    const targetDot = el.querySelector(`.spray-dot[data-idx="${bestIdx}"]`);
    if (targetDot) targetDot.dispatchEvent(new Event("mouseenter"));
  }
}

/**
 * Renders an Interactive Graphical Baseball Diamond Depth Chart for the Team Dashboard
 */
function renderGraphicalDepthChartDiamond(containerId, depthChartData, selectedPos = "SS") {
  const el = document.getElementById(containerId);
  if (!el || !depthChartData || !depthChartData.positions) return;

  const positions = depthChartData.positions;
  const rotation = depthChartData.rotation || [];
  const ace = rotation[0] || null;
  const spSum = depthChartData.sp_summary || { grade: "B", color: "#38bdf8", unit_war: 0, fip: 4.00 };

  // Coordinates (% of container width/height) for the 9 fielding positions + SP mound card
  const diamondCoords = [
    { pos: "CF", left: "50%", top: "13%" },
    { pos: "LF", left: "19%", top: "24%" },
    { pos: "RF", left: "81%", top: "24%" },
    { pos: "SS", left: "35%", top: "44%" },
    { pos: "2B", left: "65%", top: "44%" },
    { pos: "3B", left: "18%", top: "59%" },
    { pos: "1B", left: "82%", top: "59%" },
    { pos: "C",  left: "50%", top: "86%" },
    { pos: "DH", left: "16%", top: "84%" },
  ];

  const cardsHtml = diamondCoords.map(coord => {
    const node = positions[coord.pos] || {};
    const st = node.starter;
    const bk = (node.backups && node.backups[0]) || null;
    const isSel = selectedPos === coord.pos;
    const borderCol = node.color || "#38bdf8";

    return `
      <div onclick="selectDepthChartUnit('${coord.pos}')"
           style="left:${coord.left}; top:${coord.top}; transform:translate(-50%, -50%); border-color:${isSel ? '#ffffff' : borderCol};"
           class="absolute z-20 w-[148px] sm:w-[162px] rounded-xl bg-slate-950/92 backdrop-blur-md border-2 p-2 shadow-2xl cursor-pointer transition-all hover:scale-105 ${isSel ? 'ring-2 ring-sky-400/80 shadow-sky-500/25' : ''}">
        <div class="flex items-center justify-between border-b border-slate-800 pb-1 mb-1">
          <div class="flex items-center gap-1.5">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider bg-slate-800 text-white">${coord.pos}</span>
            <span class="text-[10px] font-mono text-slate-400">${node.unit_war >= 0 ? '+' : ''}${node.unit_war ?? 0} WAR</span>
          </div>
          <span class="px-1.5 py-0.2 rounded text-[10px] font-black" style="background:${borderCol}25; color:${borderCol}; border:1px solid ${borderCol}70;">${node.grade || 'B'}</span>
        </div>
        ${st ? `
          <div class="truncate font-extrabold text-xs text-white hover:text-sky-300" onclick="event.stopPropagation(); openPlayerModal(${st.player_id});" title="${st.name}">
            ${st.name} <span class="text-[10px] font-normal text-slate-400">(${st.bats})</span>
          </div>
          <div class="flex items-center justify-between text-[10px] mt-0.5">
            <span class="font-mono text-sky-300 font-bold">${st.wrc_plus} wRC+</span>
            <span class="font-mono text-slate-300">${Number(st.avg).toFixed(3)} / ${st.hr} HR</span>
          </div>
          <div class="flex items-center justify-between text-[10px] mt-1 pt-1 border-t border-slate-800/80 text-slate-400 truncate">
            <span class="truncate" title="${bk ? bk.name : 'No backup'}">2nd: <b class="text-slate-300">${bk ? bk.name.split(' ').slice(-1)[0] : '—'}</b></span>
            <span class="font-mono text-[9px] px-1 rounded bg-slate-900 text-amber-300">OVR ${st.oa}</span>
          </div>
        ` : `<div class="text-xs text-slate-500 py-2 text-center">Vacant</div>`}
      </div>
    `;
  }).join("");

  // Central Pitcher Mound Card (SP1 Ace)
  const moundCardHtml = `
    <div onclick="selectDepthChartUnit('SP')"
         style="left:50%; top:62%; transform:translate(-50%, -50%); border-color:${selectedPos === 'SP' ? '#ffffff' : spSum.color};"
         class="absolute z-20 w-[148px] sm:w-[162px] rounded-xl bg-slate-950/92 backdrop-blur-md border-2 p-2 shadow-2xl cursor-pointer transition-all hover:scale-105 ${selectedPos === 'SP' ? 'ring-2 ring-sky-400/80' : ''}">
      <div class="flex items-center justify-between border-b border-slate-800 pb-1 mb-1">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-400/40">SP ACE</span>
        <span class="px-1.5 py-0.2 rounded text-[10px] font-black" style="background:${spSum.color}25; color:${spSum.color}; border:1px solid ${spSum.color}70;">${spSum.grade}</span>
      </div>
      ${ace ? `
        <div class="truncate font-extrabold text-xs text-white hover:text-sky-300" onclick="event.stopPropagation(); openPlayerModal(${ace.player_id});">
          ${ace.name} <span class="text-[10px] font-normal text-slate-400">(${ace.throws})</span>
        </div>
        <div class="flex items-center justify-between text-[10px] mt-0.5">
          <span class="font-mono text-emerald-300 font-bold">${Number(ace.era).toFixed(2)} ERA</span>
          <span class="font-mono text-slate-300">${Number(ace.fip).toFixed(2)} FIP</span>
        </div>
        <div class="flex items-center justify-between text-[10px] mt-1 pt-1 border-t border-slate-800/80 text-slate-400">
          <span>Rot WAR: <b class="text-white">${spSum.unit_war}</b></span>
          <span class="font-mono text-[9px] px-1 rounded bg-slate-900 text-amber-300">OVR ${ace.oa}</span>
        </div>
      ` : `<div class="text-xs text-slate-500 py-1 text-center">No Starter</div>`}
    </div>
  `;

  el.innerHTML = `
    <div class="relative w-full h-[590px] rounded-2xl overflow-hidden border border-slate-800/90 bg-slate-950 select-none">
      <!-- Stadium Turf & Infield SVG Backdrop -->
      <svg viewBox="0 0 700 600" preserveAspectRatio="xMidYMid slice" class="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="dcTurf" cx="50%" cy="85%" r="80%">
            <stop offset="0%" stop-color="#15803d" stop-opacity="0.45"/>
            <stop offset="55%" stop-color="#064e3b" stop-opacity="0.38"/>
            <stop offset="100%" stop-color="#020617" stop-opacity="0.95"/>
          </radialGradient>
        </defs>
        <rect width="700" height="600" fill="url(#dcTurf)" />
        <!-- Outfield Arc -->
        <path d="M 60 220 Q 350 -40 640 220 L 350 510 Z" fill="rgba(20, 83, 45, 0.32)" stroke="rgba(56, 189, 248, 0.45)" stroke-width="3" />
        <!-- Infield Dirt Diamond -->
        <path d="M 350 510 L 185 345 Q 350 215 515 345 Z" fill="rgba(120, 53, 15, 0.36)" stroke="rgba(180, 83, 9, 0.45)" stroke-width="1.5" />
        <!-- Basepaths -->
        <polygon points="350,505 470,385 350,265 230,385" fill="rgba(21, 128, 61, 0.35)" stroke="rgba(248, 250, 252, 0.45)" stroke-width="2" />
        <!-- Foul Lines -->
        <line x1="350" y1="510" x2="60" y2="220" stroke="rgba(248,250,252,0.3)" stroke-width="1.5" stroke-dasharray="4 4" />
        <line x1="350" y1="510" x2="640" y2="220" stroke="rgba(248,250,252,0.3)" stroke-width="1.5" stroke-dasharray="4 4" />
        <!-- Pitcher's Mound -->
        <circle cx="350" cy="385" r="16" fill="rgba(146, 64, 14, 0.65)" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
      </svg>

      <!-- Top Overlay Legend -->
      <div class="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between z-10 pointer-events-none">
        <span class="px-2.5 py-1 rounded-lg bg-slate-950/85 border border-slate-800 text-[11px] font-bold text-slate-300">
          <i class="bi bi-diagram-3-fill text-sky-400 mr-1"></i> Interactive Diamond Depth Chart (Click any position to inspect unit depth)
        </span>
        <div class="flex items-center gap-2 bg-slate-950/85 border border-slate-800 px-2.5 py-1 rounded-lg text-[10px] font-bold">
          <span class="text-emerald-400">● A+/A Elite</span>
          <span class="text-sky-400">● B+/B Solid</span>
          <span class="text-amber-400">● C Depth</span>
          <span class="text-rose-400">● D Upgrade</span>
        </div>
      </div>

      <!-- Positioned Player Depth Cards -->
      ${cardsHtml}
      ${moundCardHtml}
    </div>
  `;
}

/**
 * Renders Positional Strengths vs. League Average Bar Chart (WAR Advantage / Percentile)
 */
function renderPositionalStrengthsChart(canvasId, units) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined" || !units || !units.length) return;

  const labels = units.map(u => u.position);
  const diffs = units.map(u => u.war_diff);
  const colors = units.map(u => u.color || (u.war_diff >= 0 ? "#10b981" : "#f43f5e"));

  window._chartInstances[canvasId] = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "WAR vs. League Avg at Position",
          data: diffs,
          backgroundColor: colors.map(c => c + "cc"),
          borderColor: colors,
          borderWidth: 1.5,
          borderRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const u = units[ctx.dataIndex];
              const sign = u.war_diff >= 0 ? "+" : "";
              return `${u.label || u.name} (${u.grade}): ${u.unit_war ?? u.team_war} WAR vs Lg Avg ${u.lg_avg_war} WAR (${sign}${u.war_diff} WAR, ${u.percentile}th pct)`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(95, 96, 98, 0.2)" },
          ticks: { color: "#dbdbdb", font: { weight: "700", size: 11 } },
        },
        y: {
          title: { display: true, text: "Net WAR vs. League Average", color: "#999999", font: { size: 11 } },
          grid: { color: "rgba(95, 96, 98, 0.25)" },
          ticks: { color: "#999999" },
        },
      },
    },
  });
}

/**
 * Renders Live Game Win Probability Curve up to the current replay step
 */
function renderGameWinProbChart(canvasId, atBats, currentStepIdx, awayAbbr, homeAbbr) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined" || !atBats || !atBats.length) return;

  const maxStep = currentStepIdx != null ? currentStepIdx : atBats.length;
  const labels = ["Start", ...atBats.map(ab => `${ab.half === 'Top' ? 'T' : 'B'}${ab.inning}`)];
  const fullData = [50.0, ...atBats.map(ab => Number(ab.home_win_prob ?? 50))];
  const activeData = fullData.map((v, idx) => (idx <= maxStep ? v : null));

  window._chartInstances[canvasId] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${homeAbbr} Win Probability %`,
          data: activeData,
          borderColor: "#dbdbdb",
          backgroundColor: "rgba(219, 219, 219, 0.16)",
          fill: true,
          tension: 0.25,
          pointRadius: ctx => (ctx.dataIndex === maxStep ? 5 : 0),
          pointBackgroundColor: "#dbdbdb",
          borderWidth: 2.5,
        },
        {
          label: "Full Game Trajectory",
          data: fullData,
          borderColor: "rgba(95, 96, 98, 0.45)",
          borderDash: [3, 3],
          fill: false,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 1.2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 180 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const wp = Number(ctx.raw || 50).toFixed(1);
              return `${homeAbbr} Win Prob: ${wp}% (${awayAbbr}: ${(100 - wp).toFixed(1)}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#999999", maxTicksLimit: 10, font: { size: 10 } },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: "rgba(95, 96, 98, 0.22)" },
          ticks: {
            color: "#999999",
            font: { size: 10 },
            callback: v => (v === 100 ? homeAbbr : v === 0 ? awayAbbr : v === 50 ? "50%" : ""),
          },
        },
      },
    },
  });
}

/**
 * Renders Exit Velocity vs Launch Angle Scatter Plot with Barrel Zone shading
 */
function renderEVLAScatterChart(canvasId, points) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;

  const bip = (points || []).filter(p => p.is_bip && p.exit_velo > 0).slice(0, 600);
  const hrPts = bip.filter(p => p.result === "HR").map(p => ({ x: p.launch_angle, y: p.exit_velo, label: `${p.batter_name} HR (${p.distance_ft}ft)` }));
  const xbhPts = bip.filter(p => p.result === "2B" || p.result === "3B").map(p => ({ x: p.launch_angle, y: p.exit_velo, label: `${p.batter_name} ${p.result}` }));
  const singlePts = bip.filter(p => p.result === "1B").map(p => ({ x: p.launch_angle, y: p.exit_velo, label: `${p.batter_name} 1B` }));
  const outPts = bip.filter(p => !p.is_hit).map(p => ({ x: p.launch_angle, y: p.exit_velo, label: `${p.batter_name} Out` }));

  window._chartInstances[canvasId] = new Chart(canvas.getContext("2d"), {
    type: "scatter",
    data: {
      datasets: [
        { label: "Home Run", data: hrPts, backgroundColor: "#ec4899", borderColor: "#dbdbdb", borderWidth: 1, pointRadius: 5.5 },
        { label: "2B / 3B", data: xbhPts, backgroundColor: "#eab308", pointRadius: 4.5 },
        { label: "Single", data: singlePts, backgroundColor: "#22c55e", pointRadius: 4.0 },
        { label: "Out in Play", data: outPts, backgroundColor: "rgba(153, 153, 153, 0.42)", pointRadius: 3.0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#dbdbdb", font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.raw.label || ctx.dataset.label}: EV ${ctx.raw.y} mph, LA ${ctx.raw.x}°`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Launch Angle (Degrees) — Sweet Spot: 8° to 32°", color: "#999999", font: { size: 11 } },
          min: -60,
          max: 75,
          grid: { color: "rgba(95, 96, 98, 0.22)" },
          ticks: { color: "#999999" },
        },
        y: {
          title: { display: true, text: "Exit Velocity (MPH) — Barrel Threshold: 98+ mph", color: "#999999", font: { size: 11 } },
          min: 55,
          max: 124,
          grid: { color: "rgba(95, 96, 98, 0.22)" },
          ticks: { color: "#999999" },
        },
      },
    },
  });
}

/**
 * Renders Team Profile Radar Chart
 */
function renderTeamRadarChart(canvasId, team, allTeams) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined" || !team) return;

  const pctRank = (val, key, invert = false) => {
    const arr = (allTeams || []).map(t => Number(t[key]) || 0).sort((a, b) => a - b);
    if (!arr.length) return 50;
    const pos = (arr.filter(v => v <= val).length / arr.length) * 100;
    return Math.round(invert ? 110 - pos : pos);
  };

  const dataVals = [
    pctRank(team.wrc_plus, "wrc_plus"),
    pctRank(team.hr, "hr"),
    pctRank(team.sb, "sb"),
    pctRank(team.era, "era", true),
    pctRank(team.fip, "fip", true),
    pctRank(team.zr, "zr"),
  ];

  window._chartInstances[canvasId] = new Chart(canvas.getContext("2d"), {
    type: "radar",
    data: {
      labels: ["Offense (wRC+)", "Power (HR)", "Speed (SB)", "Run Prevention (ERA)", "Pitching (FIP)", "Defense (ZR)"],
      datasets: [
        {
          label: `${team.abbr} Percentile`,
          data: dataVals,
          backgroundColor: "rgba(219, 219, 219, 0.22)",
          borderColor: "#dbdbdb",
          pointBackgroundColor: "#dbdbdb",
          borderWidth: 2,
        },
        {
          label: "League Average",
          data: [50, 50, 50, 50, 50, 50],
          backgroundColor: "rgba(95, 96, 98, 0.14)",
          borderColor: "rgba(153, 153, 153, 0.55)",
          borderDash: [4, 4],
          borderWidth: 1.5,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          angleLines: { color: "rgba(95, 96, 98, 0.3)" },
          grid: { color: "rgba(95, 96, 98, 0.3)" },
          pointLabels: { color: "#dbdbdb", font: { size: 11, weight: "600" } },
          ticks: { display: false },
        },
      },
      plugins: {
        legend: { labels: { color: "#dbdbdb", font: { size: 11 } } },
      },
    },
  });
}

/**
 * Renders Multi-Year League Evolution & Run Environment Chart
 */
function renderLeagueEvolutionChart(canvasId, yearByYear) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined" || !yearByYear || !yearByYear.length) return;

  const chron = [...yearByYear].sort((a, b) => a.year - b.year);
  const labels = chron.map(y => String(y.year));
  const teamsData = chron.map(y => Number(y.teams_count || 0));
  const eraData = chron.map(y => Number(y.league_era || 0));
  const opsData = chron.map(y => Math.round(Number(y.league_ops || 0) * 1000));

  window._chartInstances[canvasId] = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Active Franchises (Teams)",
          data: teamsData,
          backgroundColor: "rgba(219, 219, 219, 0.22)",
          borderColor: "#dbdbdb",
          borderWidth: 1.5,
          borderRadius: 4,
          yAxisID: "yTeams",
        },
        {
          type: "line",
          label: "League ERA",
          data: eraData,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.15)",
          borderWidth: 2.2,
          tension: 0.25,
          pointRadius: 3,
          yAxisID: "yEra",
        },
        {
          type: "line",
          label: "League OPS (x1000)",
          data: opsData,
          borderColor: "#10b981",
          borderDash: [4, 3],
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 2.5,
          yAxisID: "yOps",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#dbdbdb", font: { size: 11 } } },
      },
      scales: {
        x: {
          grid: { color: "rgba(95, 96, 98, 0.2)" },
          ticks: { color: "#dbdbdb", font: { size: 10, weight: "700" } },
        },
        yTeams: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Teams", color: "#dbdbdb", font: { size: 10 } },
          grid: { color: "rgba(95, 96, 98, 0.22)" },
          ticks: { color: "#dbdbdb", precision: 0 },
        },
        yEra: {
          type: "linear",
          position: "right",
          title: { display: true, text: "ERA", color: "#f59e0b", font: { size: 10 } },
          grid: { drawOnChartArea: false },
          ticks: { color: "#f59e0b" },
        },
        yOps: {
          type: "linear",
          position: "right",
          display: false,
        },
      },
    },
  });
}

/**
 * 16. Interactive SVG Geographic Expansion & Realignment Workshop Map
 * Plots active league franchises, division links, candidate market pins (color-coded by IRL level),
 * selected expansion targets with rivalry distance vectors, and centroid shift.
 */
function renderExpansionWorkshopMapSVG(containerId, opts = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const activeTeams = opts.activeTeams || [];
  const candidates = opts.candidates || [];
  const selectedIds = new Set((opts.selectedMarketIds || []).map(Number));
  const customIdentities = opts.customIdentities || {};
  const zoomMode = opts.zoomMode || "auto"; // "auto" | "footprint" | "continental"
  const showDivisionLines = opts.showDivisionLines !== false;
  const showCandidatePins = opts.showCandidatePins !== false;
  const blueprintDivisions = opts.blueprintDivisions || null;

  const selectedCandidates = candidates.filter(c => selectedIds.has(Number(c.city_id)));
  const topCandidates = candidates.slice(0, 28);

  // Collect points to compute bounding box
  let boundPts = [];
  if (zoomMode === "footprint") {
    boundPts = [
      ...activeTeams.filter(t => t.lat && t.lon),
      ...selectedCandidates.filter(c => c.lat && c.lon),
    ];
  } else if (zoomMode === "continental") {
    boundPts = [
      ...activeTeams.filter(t => t.lat && t.lon),
      ...candidates.slice(0, 45).filter(c => c.lat && c.lon),
    ];
  } else {
    // Auto: active teams + selected candidates + top 14 candidates
    boundPts = [
      ...activeTeams.filter(t => t.lat && t.lon),
      ...selectedCandidates.filter(c => c.lat && c.lon),
      ...candidates.slice(0, 14).filter(c => c.lat && c.lon),
    ];
  }

  if (!boundPts.length) {
    el.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">No geographic coordinates available for map projection.</div>`;
    return;
  }

  let minLat = Math.min(...boundPts.map(p => Number(p.lat)));
  let maxLat = Math.max(...boundPts.map(p => Number(p.lat)));
  let minLon = Math.min(...boundPts.map(p => Number(p.lon)));
  let maxLon = Math.max(...boundPts.map(p => Number(p.lon)));

  const latSpan = Math.max(1.8, maxLat - minLat);
  const lonSpan = Math.max(2.6, maxLon - minLon);
  minLat -= latSpan * 0.16;
  maxLat += latSpan * 0.16;
  minLon -= lonSpan * 0.16;
  maxLon += lonSpan * 0.16;

  const W = 880;
  const H = 460;
  const padX = 48;
  const padY = 38;

  const projX = (lon) => {
    const clamped = Math.max(minLon, Math.min(maxLon, Number(lon)));
    return padX + ((clamped - minLon) / (maxLon - minLon)) * (W - padX * 2);
  };
  const projY = (lat) => {
    const clamped = Math.max(minLat, Math.min(maxLat, Number(lat)));
    return H - padY - ((clamped - minLat) / (maxLat - minLat)) * (H - padY * 2);
  };

  const divPalette = ["#38bdf8", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#6366f1", "#f97316"];
  const divNames = [...new Set(activeTeams.map(t => t.division_name || "Division"))];
  const divColorMap = {};
  divNames.forEach((dn, i) => {
    divColorMap[dn] = divPalette[i % divPalette.length];
  });

  // Grid lines
  let gridSvg = "";
  const latSteps = 4;
  const lonSteps = 6;
  for (let i = 0; i <= latSteps; i++) {
    const lVal = minLat + (i / latSteps) * (maxLat - minLat);
    const y = projY(lVal);
    gridSvg += `
      <line x1="${padX}" y1="${y}" x2="${W - padX}" y2="${y}" stroke="rgba(148,163,184,0.12)" stroke-dasharray="3,5" />
      <text x="${padX - 6}" y="${y + 3}" text-anchor="end" fill="#64748b" font-family="monospace" font-size="9">${lVal.toFixed(1)}°N</text>
    `;
  }
  for (let j = 0; j <= lonSteps; j++) {
    const lnVal = minLon + (j / lonSteps) * (maxLon - minLon);
    const x = projX(lnVal);
    gridSvg += `
      <line x1="${x}" y1="${padY}" x2="${x}" y2="${H - padY}" stroke="rgba(148,163,184,0.12)" stroke-dasharray="3,5" />
      <text x="${x}" y="${H - 12}" text-anchor="middle" fill="#64748b" font-family="monospace" font-size="9">${Math.abs(lnVal).toFixed(1)}°W</text>
    `;
  }

  // Division or Blueprint Pod connection lines
  let linksSvg = "";
  if (showDivisionLines) {
    if (Array.isArray(blueprintDivisions) && blueprintDivisions.length) {
      blueprintDivisions.forEach((pod, idx) => {
        const col = divPalette[idx % divPalette.length];
        const pts = (pod.teams || []).filter(t => t.lat && t.lon);
        for (let i = 0; i < pts.length - 1; i++) {
          const x1 = projX(pts[i].lon);
          const y1 = projY(pts[i].lat);
          const x2 = projX(pts[i + 1].lon);
          const y2 = projY(pts[i + 1].lat);
          linksSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.6" stroke-opacity="0.45" />`;
        }
      });
    } else {
      divNames.forEach((dn) => {
        const col = divColorMap[dn];
        const dTeams = activeTeams.filter(t => (t.division_name || "Division") === dn && t.lat && t.lon);
        for (let i = 0; i < dTeams.length - 1; i++) {
          const x1 = projX(dTeams[i].lon);
          const y1 = projY(dTeams[i].lat);
          const x2 = projX(dTeams[i + 1].lon);
          const y2 = projY(dTeams[i + 1].lat);
          linksSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.4" stroke-opacity="0.35" />`;
        }
      });
    }
  }

  // Rivalry vectors from Selected Expansion Markets to their nearest active club
  let rivalrySvg = "";
  selectedCandidates.forEach(c => {
    if (!c.lat || !c.lon) return;
    let nearest = null;
    let bestD = 999999;
    activeTeams.forEach(t => {
      if (!t.lat || !t.lon) return;
      const d = Math.hypot(t.lat - c.lat, t.lon - c.lon);
      if (d < bestD) {
        bestD = d;
        nearest = t;
      }
    });
    if (nearest) {
      const x1 = projX(c.lon);
      const y1 = projY(c.lat);
      const x2 = projX(nearest.lon);
      const y2 = projY(nearest.lat);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      rivalrySvg += `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#10b981" stroke-width="2" stroke-dasharray="5,4" stroke-opacity="0.85" />
        <rect x="${mx - 24}" y="${my - 8}" width="48" height="15" rx="4" fill="#090d16" stroke="#10b981" stroke-width="1" opacity="0.92" />
        <text x="${mx}" y="${my + 3}" text-anchor="middle" fill="#6ee7b7" font-family="monospace" font-weight="700" font-size="8.5">${Math.round(c.nearest_team_miles || 0)} mi</text>
      `;
    }
  });

  // Candidate market pins (unselected)
  let candPinsSvg = "";
  if (showCandidatePins) {
    topCandidates.forEach((c, idx) => {
      if (selectedIds.has(Number(c.city_id))) return;
      if (!c.lat || !c.lon) return;
      if (c.lat < minLat || c.lat > maxLat || c.lon < minLon || c.lon > maxLon) return;
      const x = projX(c.lon);
      const y = projY(c.lat);
      const hasIrl = Boolean(c.has_irl_counterpart);
      const pinCol = hasIrl ? "#fbbf24" : "#94a3b8";
      const showLabel = idx < 10;
      const titleStr = `${c.city}, ${c.state} (Score ${c.computed_score || c.market_score}) • ${c.irl_summary_badge || 'Untapped'} • Click to toggle expansion target`;
      candPinsSvg += `
        <g class="cursor-pointer" onclick="toggleWorkshopExpansionCity(${c.city_id})">
          <title>${titleStr.replace(/"/g, '&quot;')}</title>
          <circle cx="${x}" cy="${y}" r="5.5" fill="#090d16" stroke="${pinCol}" stroke-width="1.8" opacity="0.9" />
          <circle cx="${x}" cy="${y}" r="2.2" fill="${pinCol}" />
          ${showLabel ? `<text x="${x + 8}" y="${y + 3}" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="9.5" font-weight="600" opacity="0.82">${c.city}</text>` : ""}
        </g>
      `;
    });
  }

  // Active League Franchise Nodes
  let activeNodesSvg = "";
  activeTeams.forEach((t) => {
    if (!t.lat || !t.lon) return;
    const x = projX(t.lon);
    const y = projY(t.lat);
    const col = divColorMap[t.division_name || "Division"] || "#38bdf8";
    const tTitle = `${t.full_name} (${t.abbr}) — ${t.city}, ${t.state} • ${t.division_name || ''}`;
    activeNodesSvg += `
      <g class="cursor-pointer" onclick="switchTeamAndGo(${t.team_id})">
        <title>${tTitle.replace(/"/g, '&quot;')}</title>
        <circle cx="${x}" cy="${y}" r="9.5" fill="#0f172a" stroke="${col}" stroke-width="2.4" />
        <text x="${x}" y="${y + 3}" text-anchor="middle" fill="#f8fafc" font-family="monospace" font-weight="800" font-size="7.8">${(t.abbr || 'TM').slice(0, 3)}</text>
      </g>
    `;
  });

  // Selected Expansion Target Nodes
  let selectedNodesSvg = "";
  selectedCandidates.forEach((c) => {
    if (!c.lat || !c.lon) return;
    const x = projX(c.lon);
    const y = projY(c.lat);
    const cust = customIdentities[c.city_id] || {};
    const abbr = (cust.abbr || c.suggested_abbr || c.city.slice(0, 3)).toUpperCase();
    const nick = cust.nickname || c.suggested_nickname || "Royals";
    const sTitle = `SELECTED EXPANSION TARGET: ${c.city} ${nick} (${abbr}) • ${c.irl_summary_badge} • Click to remove`;
    selectedNodesSvg += `
      <g class="cursor-pointer" onclick="toggleWorkshopExpansionCity(${c.city_id})">
        <title>${sTitle.replace(/"/g, '&quot;')}</title>
        <circle cx="${x}" cy="${y}" r="16" fill="rgba(16,185,129,0.16)" stroke="#10b981" stroke-width="1.2" stroke-dasharray="3,2" />
        <circle cx="${x}" cy="${y}" r="11.5" fill="#064e3b" stroke="#34d399" stroke-width="2.6" />
        <text x="${x}" y="${y + 3}" text-anchor="middle" fill="#ecfdf5" font-family="monospace" font-weight="900" font-size="8.2">${abbr.slice(0, 3)}</text>
        <rect x="${x - 42}" y="${y - 27}" width="84" height="13" rx="4" fill="#064e3b" stroke="#10b981" stroke-width="1" />
        <text x="${x}" y="${y - 18}" text-anchor="middle" fill="#a7f3d0" font-family="system-ui,sans-serif" font-weight="800" font-size="8.5">+ ${c.city}</text>
      </g>
    `;
  });

  // Centroids (Current vs Post-Expansion)
  let centroidSvg = "";
  if (activeTeams.length) {
    const curLat = activeTeams.reduce((s, t) => s + Number(t.lat || 0), 0) / activeTeams.length;
    const curLon = activeTeams.reduce((s, t) => s + Number(t.lon || 0), 0) / activeTeams.length;
    const cx = projX(curLon);
    const cy = projY(curLat);
    centroidSvg += `
      <g>
        <title>Current League Geographic Centroid (${curLat.toFixed(2)}°N, ${curLon.toFixed(2)}°W)</title>
        <circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="#f43f5e" stroke-width="1.8" />
        <line x1="${cx - 7}" y1="${cy}" x2="${cx + 7}" y2="${cy}" stroke="#f43f5e" stroke-width="1.5" />
        <line x1="${cx}" y1="${cy - 7}" x2="${cx}" y2="${cy + 7}" stroke="#f43f5e" stroke-width="1.5" />
      </g>
    `;
    if (selectedCandidates.length) {
      const allPts = [...activeTeams, ...selectedCandidates];
      const newLat = allPts.reduce((s, t) => s + Number(t.lat || 0), 0) / allPts.length;
      const newLon = allPts.reduce((s, t) => s + Number(t.lon || 0), 0) / allPts.length;
      const nx = projX(newLon);
      const ny = projY(newLat);
      centroidSvg += `
        <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#fbbf24" stroke-width="1.6" stroke-dasharray="2,2" />
        <circle cx="${nx}" cy="${ny}" r="5.5" fill="none" stroke="#fbbf24" stroke-width="2" />
      `;
    }
  }

  // Legend overlay
  const divLegendItems = divNames.slice(0, 6).map(dn => `
    <span class="inline-flex items-center gap-1 text-[10px] font-mono text-slate-300">
      <span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${divColorMap[dn]}"></span>${dn}
    </span>
  `).join("");

  el.innerHTML = `
    <div class="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950/95">
      <svg viewBox="0 0 ${W} ${H}" class="w-full h-auto block select-none">
        <defs>
          <radialGradient id="evoMapBg" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stop-color="#0f172a" />
            <stop offset="100%" stop-color="#050811" />
          </radialGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#evoMapBg)" />
        ${gridSvg}
        ${linksSvg}
        ${rivalrySvg}
        ${candPinsSvg}
        ${activeNodesSvg}
        ${selectedNodesSvg}
        ${centroidSvg}
      </svg>
      <div class="px-3.5 py-2 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
        <div class="flex flex-wrap items-center gap-3">
          <span class="inline-flex items-center gap-1 text-emerald-300 font-bold"><span class="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>Selected Expansion (${selectedCandidates.length})</span>
          <span class="inline-flex items-center gap-1 text-amber-300"><span class="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>IRL MLB/MiLB Candidate Pin</span>
          <span class="inline-flex items-center gap-1 text-slate-400"><span class="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>Untapped Candidate Pin</span>
          <span class="inline-flex items-center gap-1 text-rose-400">⊕ Centroid</span>
        </div>
        <div class="flex flex-wrap items-center gap-2.5">
          ${divLegendItems}
        </div>
      </div>
    </div>
  `;
}

/**
 * 17. Positional Supply vs Demand Diagnostic Chart (League Health Tab)
 */
function renderPositionalSupplyChart(canvasId, positionalSupply) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !Array.isArray(positionalSupply) || !positionalSupply.length) return;

  const labels = positionalSupply.map(p => p.position);
  const regsPerTeam = positionalSupply.map(p => Number(p.regulars_per_team || 0));
  const starsCount = positionalSupply.map(p => Number(p.star_count || 0));
  const prospectsCount = positionalSupply.map(p => Number(p.prospect_count || 0));

  window._chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Viable Regulars / Team (45+ OVR)",
          data: regsPerTeam,
          backgroundColor: positionalSupply.map(p => p.status === "Bottleneck" ? "rgba(244, 63, 94, 0.72)" : (p.status === "Surplus" ? "rgba(16, 185, 129, 0.72)" : "rgba(56, 189, 248, 0.72)")),
          borderColor: positionalSupply.map(p => p.status === "Bottleneck" ? "#f43f5e" : (p.status === "Surplus" ? "#10b981" : "#38bdf8")),
          borderWidth: 1.5,
          borderRadius: 5,
          yAxisID: "yRegs",
        },
        {
          type: "line",
          label: "U-24 Prospects (45+ POT)",
          data: prospectsCount,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.2)",
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 3,
          yAxisID: "yCount",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#dbdbdb", font: { size: 10, weight: "700" } } },
      },
      scales: {
        x: {
          grid: { color: "rgba(95, 96, 98, 0.18)" },
          ticks: { color: "#dbdbdb", font: { size: 10, weight: "700" } },
        },
        yRegs: {
          type: "linear",
          position: "left",
          title: { display: true, text: "Regulars / Club", color: "#38bdf8", font: { size: 10 } },
          grid: { color: "rgba(95, 96, 98, 0.2)" },
          ticks: { color: "#dbdbdb" },
        },
        yCount: {
          type: "linear",
          position: "right",
          title: { display: true, text: "U-24 Prospects", color: "#f59e0b", font: { size: 10 } },
          grid: { drawOnChartArea: false },
          ticks: { color: "#f59e0b", precision: 0 },
        },
      },
    },
  });
}

/**
 * 18. "The Stretch" — Pennant Race Momentum Worm Chart (Games Above/Below .500)
 */
function renderStretchTrajectoryChart(canvasId, trajectories) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !Array.isArray(trajectories) || !trajectories.length) return;

  const palette = [
    "#f59e0b", "#38bdf8", "#10b981", "#f43f5e",
    "#a855f7", "#eab308", "#06b6d4", "#ec4899",
  ];
  const maxPts = Math.max(...trajectories.map(t => (t.points || []).length), 1);
  const labels = Array.from({ length: maxPts }, (_, i) => {
    const sample = trajectories[0]?.points?.[i];
    return sample ? `G${sample.g}` : `Pt ${i + 1}`;
  });

  const datasets = trajectories.slice(0, 8).map((tm, idx) => {
    const col = palette[idx % palette.length];
    return {
      label: `${tm.abbr} (${tm.record_str})`,
      data: (tm.points || []).map(p => p.above_500),
      borderColor: col,
      backgroundColor: col + "22",
      borderWidth: idx < 2 ? 3 : 2,
      pointRadius: 2,
      pointHoverRadius: 5,
      tension: 0.28,
      fill: false,
    };
  });

  window._chartInstances[canvasId] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          labels: { color: "#dbdbdb", font: { size: 10.5, weight: "700" }, boxWidth: 12 },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const v = Number(context.parsed.y || 0);
              return ` ${context.dataset.label}: ${v >= 0 ? "+" : ""}${v} games vs .500`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(95, 96, 98, 0.16)" },
          ticks: { color: "#999999", font: { size: 10 } },
        },
        y: {
          title: { display: true, text: "Games Above / Below .500", color: "#dbdbdb", font: { size: 10, weight: "700" } },
          grid: {
            color: (c) => (c.tick && c.tick.value === 0 ? "rgba(245, 158, 11, 0.55)" : "rgba(95, 96, 98, 0.18)"),
          },
          ticks: {
            color: "#dbdbdb",
            callback: (v) => (v > 0 ? `+${v}` : v),
          },
        },
      },
    },
  });
}

/**
 * 19. World Dashboard — Player Talent Tier & Age Distribution Chart
 */
function renderWorldTalentChart(canvasId, talentDist, mode = "tiers") {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !talentDist) return;

  if (mode === "ages" && Array.isArray(talentDist.age_brackets) && talentDist.age_brackets.length) {
    const rows = talentDist.age_brackets;
    window._chartInstances[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: rows.map(r => `Age ${r.bracket}`),
        datasets: [
          {
            label: "Active Players in Age Bracket",
            data: rows.map(r => r.count),
            backgroundColor: "rgba(56, 189, 248, 0.65)",
            borderColor: "#38bdf8",
            borderWidth: 1.5,
            borderRadius: 5,
            yAxisID: "yCount",
          },
          {
            type: "line",
            label: "Avg Potential (20-80 Scale)",
            data: rows.map(r => r.avg_pot),
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.2)",
            borderWidth: 2.5,
            pointRadius: 3.5,
            tension: 0.3,
            yAxisID: "yRating",
          },
          {
            type: "line",
            label: "Avg Overall (20-80 Scale)",
            data: rows.map(r => r.avg_ovr),
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.2)",
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.3,
            yAxisID: "yRating",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#dbdbdb", font: { size: 10, weight: "700" } } },
        },
        scales: {
          x: {
            grid: { color: "rgba(95, 96, 98, 0.16)" },
            ticks: { color: "#dbdbdb", font: { size: 10, weight: "700" } },
          },
          yCount: {
            position: "left",
            title: { display: true, text: "Player Count", color: "#38bdf8", font: { size: 10 } },
            grid: { color: "rgba(95, 96, 98, 0.18)" },
            ticks: { color: "#dbdbdb" },
          },
          yRating: {
            position: "right",
            min: 20,
            max: 80,
            title: { display: true, text: "20-80 Scouting Scale", color: "#f59e0b", font: { size: 10 } },
            grid: { drawOnChartArea: false },
            ticks: { color: "#f59e0b" },
          },
        },
      },
    });
    return;
  }

  const tiers = talentDist.ovr_tiers || [];
  const colors = ["#f59e0b", "#10b981", "#38bdf8", "#a855f7", "#64748b"];
  window._chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: tiers.map(t => t.tier),
      datasets: [
        {
          label: "World Player Population by Scouting Tier",
          data: tiers.map(t => t.count),
          backgroundColor: tiers.map((_, i) => (colors[i % colors.length]) + "bb"),
          borderColor: tiers.map((_, i) => colors[i % colors.length]),
          borderWidth: 1.5,
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#dbdbdb", font: { size: 10, weight: "700" } } },
      },
      scales: {
        x: {
          grid: { color: "rgba(95, 96, 98, 0.16)" },
          ticks: { color: "#dbdbdb", font: { size: 10, weight: "700" } },
        },
        y: {
          title: { display: true, text: "Active Players", color: "#dbdbdb", font: { size: 10 } },
          grid: { color: "rgba(95, 96, 98, 0.18)" },
          ticks: { color: "#dbdbdb" },
        },
      },
    },
  });
}

/**
 * 20. World Dashboard — International Talent Pipeline Horizontal Bar Chart
 */
function renderWorldNationsChart(canvasId, nationsPipeline) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !Array.isArray(nationsPipeline) || !nationsPipeline.length) return;

  const topNations = nationsPipeline.slice(0, 10);
  window._chartInstances[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: topNations.map(n => `${n.abbr} • ${n.name}`),
      datasets: [
        {
          label: "Active Players",
          data: topNations.map(n => n.player_count),
          backgroundColor: "rgba(16, 185, 129, 0.72)",
          borderColor: "#10b981",
          borderWidth: 1.5,
          borderRadius: 5,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const row = topNations[c.dataIndex] || {};
              return ` ${row.player_count} players (${row.share_pct}% of world • ${row.elite_count} stars 60+ OVR)`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(95, 96, 98, 0.18)" },
          ticks: { color: "#dbdbdb", font: { size: 10 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#dbdbdb", font: { size: 10.5, weight: "700" } },
        },
      },
    },
  });
}

/**
 * 21. World Dashboard — Financial Power (Payroll $M) vs. On-Field Win% Quadrant Scatter
 */
function renderWorldFinancialQuadrantChart(canvasId, financialPoints) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx || !Array.isArray(financialPoints) || !financialPoints.length) return;

  const quadColors = {
    "Moneyball Contender": "#10b981",
    "Juggernaut": "#f59e0b",
    "Underachiever": "#f43f5e",
    "Rebuilding": "#38bdf8",
  };

  const groups = ["Moneyball Contender", "Juggernaut", "Underachiever", "Rebuilding"];
  const datasets = groups.map(qName => {
    const pts = financialPoints.filter(p => p.quadrant === qName);
    const col = quadColors[qName] || "#dbdbdb";
    return {
      label: qName,
      data: pts.map(p => ({
        x: p.payroll_m > 0 ? p.payroll_m : p.budget_m,
        y: Number((p.pct * 1000).toFixed(0)),
        raw: p,
      })),
      backgroundColor: col + "cc",
      borderColor: col,
      borderWidth: 1.5,
      pointRadius: 6,
      pointHoverRadius: 9,
    };
  }).filter(ds => ds.data.length > 0);

  window._chartInstances[canvasId] = new Chart(ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: { color: "#dbdbdb", font: { size: 10, weight: "700" }, boxWidth: 10 },
        },
        tooltip: {
          callbacks: {
            label: (c) => {
              const p = c.raw?.raw || {};
              return ` ${p.abbr} (${p.full_name}): .${String(Math.round((p.pct || 0) * 1000)).padStart(3, "0")} Win% • $${p.payroll_m || p.budget_m}M • ${p.total_war} WAR`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Club Payroll / Budget ($ Millions)", color: "#dbdbdb", font: { size: 10, weight: "700" } },
          grid: { color: "rgba(95, 96, 98, 0.18)" },
          ticks: {
            color: "#dbdbdb",
            callback: (v) => `$${v}M`,
          },
        },
        y: {
          title: { display: true, text: "Winning Percentage (pts)", color: "#dbdbdb", font: { size: 10, weight: "700" } },
          grid: {
            color: (c) => (c.tick && c.tick.value === 500 ? "rgba(245, 158, 11, 0.55)" : "rgba(95, 96, 98, 0.18)"),
          },
          ticks: {
            color: "#dbdbdb",
            callback: (v) => `.${String(v).padStart(3, "0")}`,
          },
        },
      },
    },
  });
}

/**
 * 22. World Dashboard — League Ecosystem Run Environment & Offense vs. ERA Chart
 */
function renderWorldEcosystemChart(canvasId, leaguesEcosystem, histTrends) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (Array.isArray(leaguesEcosystem) && leaguesEcosystem.length > 1) {
    const lgs = leaguesEcosystem.slice(0, 15);
    window._chartInstances[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: lgs.map(l => `${l.abbr} (Lvl ${l.level})`),
        datasets: [
          {
            label: "League OPS (x1000)",
            data: lgs.map(l => Math.round((l.league_ops || 0.720) * 1000)),
            backgroundColor: "rgba(56, 189, 248, 0.7)",
            borderColor: "#38bdf8",
            borderWidth: 1.5,
            borderRadius: 4,
            yAxisID: "yOps",
          },
          {
            type: "line",
            label: "League ERA",
            data: lgs.map(l => Number(l.league_era || 4.15)),
            borderColor: "#f43f5e",
            backgroundColor: "rgba(244, 63, 94, 0.2)",
            borderWidth: 2.5,
            pointRadius: 3.5,
            tension: 0.25,
            yAxisID: "yEra",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#dbdbdb", font: { size: 10, weight: "700" } } },
        },
        scales: {
          x: {
            grid: { color: "rgba(95, 96, 98, 0.16)" },
            ticks: { color: "#dbdbdb", font: { size: 10, weight: "700" } },
          },
          yOps: {
            position: "left",
            title: { display: true, text: "League OPS (pts)", color: "#38bdf8", font: { size: 10 } },
            grid: { color: "rgba(95, 96, 98, 0.18)" },
            ticks: { color: "#38bdf8", callback: (v) => `.${v}` },
          },
          yEra: {
            position: "right",
            title: { display: true, text: "League ERA", color: "#f43f5e", font: { size: 10 } },
            grid: { drawOnChartArea: false },
            ticks: { color: "#f43f5e" },
          },
        },
      },
    });
    return;
  }

  const rows = (histTrends && histTrends.length) ? histTrends : (leaguesEcosystem || []).map(l => ({
    year: l.season_year || 2026,
    rpg: Number(l.runs_per_game || ((l.league_era || 4.15) * 1.07).toFixed(2)),
    era: Number(l.league_era || 4.15),
  }));
  window._chartInstances[canvasId] = new Chart(ctx, {
    type: "line",
    data: {
      labels: rows.map(r => String(r.year)),
      datasets: [
        {
          label: "World Runs / Game",
          data: rows.map(r => r.rpg),
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.18)",
          borderWidth: 2.5,
          tension: 0.3,
          fill: true,
        },
        {
          label: "World League ERA",
          data: rows.map(r => r.era),
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.12)",
          borderWidth: 2,
          tension: 0.3,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#dbdbdb", font: { size: 10, weight: "700" } } },
      },
      scales: {
        x: {
          grid: { color: "rgba(95, 96, 98, 0.16)" },
          ticks: { color: "#dbdbdb", font: { size: 10 } },
        },
        y: {
          grid: { color: "rgba(95, 96, 98, 0.18)" },
          ticks: { color: "#dbdbdb" },
        },
      },
    },
  });
}


