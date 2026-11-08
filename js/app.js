/* ERAM website: reads data/tests.json and data/epXX.json, renders the board, detail view and comparison. */
"use strict";

const LINKS = {
  youtube: "https://www.youtube.com/@AskERAM",
  github: "https://github.com/merchant-of-eram/eram-tests"
};

const LABEL = { gold: "Gold", fools: "Fool's Gold", ore: "Raw Ore", queued: "In the queue" };
const FILTERS = ["all", "gold", "fools", "ore", "queued"];
const COLORS = {
  gold: "#f0cf7a", sand: "#cdb58a", dim: "#7a6e59", muted: "#a8997d",
  line: "#342d23", emerald: "#34d58e", rust: "#d0693f"
};

const state = { tests: [], filter: "all", query: "", sort: "new", cache: new Map(), charts: [] };

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function safeUrl(u) {
  if (!u) return "";
  const s = String(u).trim();
  return /^(https?:\/\/|data\/|\.\/)/i.test(s) ? s : "";
}
const pad = (n) => String(n).padStart(2, "0");
const isTested = (t) => t.verdict && t.verdict !== "queued";

async function getJSON(url) {
  if (state.cache.has(url)) return state.cache.get(url);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const data = await res.json();
  state.cache.set(url, data);
  return data;
}

/* ---------- links, footer, typing line ---------- */
document.querySelectorAll("a.yt").forEach((a) => { a.href = LINKS.youtube; a.target = "_blank"; a.rel = "noopener"; });
document.querySelectorAll("a.gh").forEach((a) => { a.href = LINKS.github; a.target = "_blank"; a.rel = "noopener"; });
$("#yr").textContent = new Date().getFullYear();

(function typer() {
  const el = $("#typed");
  const lines = ["> map received. digging...", "> fees included. losses kept.", "> verdict logged."];
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = lines[0]; return; }
  let li = 0, ci = 0, del = false;
  (function tick() {
    const s = lines[li];
    el.textContent = s.slice(0, ci);
    if (!del && ci < s.length) { ci++; setTimeout(tick, 55); }
    else if (!del) { del = true; setTimeout(tick, 1800); }
    else if (ci > 0) { ci--; setTimeout(tick, 25); }
    else { del = false; li = (li + 1) % lines.length; setTimeout(tick, 350); }
  })();
})();

/* ---------- board ---------- */
function renderCounts() {
  const n = (v) => state.tests.filter((t) => t.verdict === v).length;
  const items = [
    ["Tested", state.tests.filter(isTested).length, ""],
    ["Gold", n("gold"), "c-gold"], ["Fool's Gold", n("fools"), "c-fools"],
    ["Raw Ore", n("ore"), "c-ore"], ["In the queue", n("queued"), "c-queued"]
  ];
  $("#counts").innerHTML = items.map(([l, v, c]) => `<div class="count ${c}"><b>${v}</b><span>${l}</span></div>`).join("");
}

function renderFilters() {
  $("#filters").innerHTML = FILTERS.map((k) =>
    `<button class="chip" type="button" data-f="${k}" aria-pressed="${k === state.filter}">${k === "all" ? "All" : LABEL[k]}</button>`).join("");
  document.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => {
    state.filter = b.dataset.f; renderFilters(); renderBoard();
  }));
}

function sorted(list) {
  const net = (t) => (typeof t.net_pct === "number" ? t.net_pct : null);
  const byNet = (dir) => (a, b) => {
    const x = net(a), y = net(b);
    if (x === null && y === null) return b.ep - a.ep;
    if (x === null) return 1;
    if (y === null) return -1;
    return dir * (y - x);
  };
  const fns = { new: (a, b) => b.ep - a.ep, old: (a, b) => a.ep - b.ep, best: byNet(1), worst: byNet(-1) };
  return [...list].sort(fns[state.sort] || fns.new);
}

function card(t) {
  const stats = t.stats ? `<dl class="stats">${Object.entries(t.stats).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "";
  const video = safeUrl(t.video), code = safeUrl(t.code);
  const links = [
    video ? `<a class="btn btn-gold btn-sm" href="${esc(video)}" target="_blank" rel="noopener">Watch</a>` : "",
    code ? `<a class="btn btn-ghost btn-sm" href="${esc(code)}" target="_blank" rel="noopener">Code</a>` : ""
  ].join("");
  return `<article class="card v-${esc(t.verdict)}" data-ep="${Number(t.ep)}" tabindex="0" aria-label="Episode ${Number(t.ep)}: ${esc(t.claim)}. Open details">
    <div class="top"><span class="ep">EPISODE ${pad(t.ep)}</span><span class="stamp ${esc(t.verdict)}">${esc(LABEL[t.verdict] || t.verdict)}</span></div>
    <p class="claim">${esc(t.claim)}</p>
    ${t.summary ? `<p class="summary">${esc(t.summary)}</p>` : ""}
    ${stats}
    ${links ? `<div class="links">${links}</div>` : ""}
    <span class="more" aria-hidden="true">${isTested(t) ? "Open results →" : "Open test plan →"}</span>
  </article>`;
}

function renderBoard() {
  const q = state.query.trim().toLowerCase();
  const list = sorted(state.tests.filter((t) =>
    (state.filter === "all" || t.verdict === state.filter) &&
    (!q || `${t.claim} ${t.summary || ""}`.toLowerCase().includes(q))));
  const board = $("#board");
  board.innerHTML = list.length ? list.map(card).join("")
    : `<div class="empty">No matching tests${state.filter !== "all" ? ` with the stamp ${esc(LABEL[state.filter])}` : ""}.</div>`;
  board.querySelectorAll(".card").forEach((el) => {
    const open = (e) => { if (e.target.closest("a")) return; location.hash = `ep${el.dataset.ep}`; };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); } });
  });
}

$("#q").addEventListener("input", (e) => { state.query = e.target.value; renderBoard(); });
$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderBoard(); });

/* ---------- charts ---------- */
if (window.Chart) {
  Chart.defaults.color = COLORS.muted;
  Chart.defaults.borderColor = COLORS.line;
  Chart.defaults.font.family = '"IBM Plex Sans", system-ui, sans-serif';
  Chart.defaults.plugins.legend.labels.boxWidth = 14;
}
function destroyCharts() { state.charts.forEach((c) => c.destroy()); state.charts = []; }
function fmt(v, unit) {
  if (typeof v !== "number") return String(v);
  const s = (v > 0 ? "+" : "") + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return unit === "$" ? s.replace(/^([+-]?)/, "$1$") : `${s}${unit || ""}`;
}
function signColors(values) { return values.map((v) => (v >= 0 ? COLORS.emerald : COLORS.rust)); }

function lineChart(canvas, eq) {
  const ds = [];
  if (eq.strategy) ds.push({ label: "Strategy", data: eq.strategy, borderColor: COLORS.gold, borderWidth: 2.2 });
  if (eq.buy_hold) ds.push({ label: "Buy and hold", data: eq.buy_hold, borderColor: COLORS.sand, borderWidth: 1.5 });
  if (eq.random) ds.push({ label: "Random entries", data: eq.random, borderColor: COLORS.dim, borderWidth: 1.5, borderDash: [5, 4] });
  ds.forEach((d) => Object.assign(d, { pointRadius: 0, tension: 0.15, fill: false }));
  return new Chart(canvas, {
    type: "line",
    data: { labels: eq.dates, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 7, maxRotation: 0 }, grid: { display: false } },
        y: { title: { display: !!eq.unit_label, text: eq.unit_label } }
      },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 2 })}` } } }
    }
  });
}

function barChart(canvas, labels, values, unit, horizontal) {
  return new Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [{ data: values, backgroundColor: signColors(values), borderRadius: 3, maxBarThickness: 28 }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? "y" : "x",
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt(horizontal ? c.parsed.x : c.parsed.y, unit) } } },
      scales: horizontal
        ? { x: { ticks: { callback: (v) => fmt(v, unit) } }, y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } } }
        : { y: { ticks: { callback: (v) => fmt(v, unit) } }, x: { grid: { display: false } } }
    }
  });
}

/* ---------- detail view ---------- */
const dialog = $("#detail");

function kvTable(obj) {
  return `<div class="tbl-wrap"><table class="kv"><tbody>${Object.entries(obj).map(([k, v]) =>
    `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table></div>`;
}

function metricsTable(metrics) {
  const tfs = Object.keys(metrics);
  const rows = [];
  tfs.forEach((tf) => Object.keys(metrics[tf]).forEach((k) => { if (!rows.includes(k)) rows.push(k); }));
  return `<div class="tbl-wrap"><table class="kv">
    <thead><tr><th scope="col">Measure</th>${tfs.map((tf) => `<th scope="col" style="text-align:right">${esc(tf)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr><th scope="row">${esc(r)}</th>${tfs.map((tf) => `<td class="num">${esc(metrics[tf][r] ?? "–")}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

async function openDetail(epNum) {
  const t = state.tests.find((x) => Number(x.ep) === epNum);
  if (!t) return;
  destroyCharts();
  $("#d-ep").textContent = `EPISODE ${pad(t.ep)}`;
  $("#d-stamp").innerHTML = `<span class="stamp ${esc(t.verdict)}">${esc(LABEL[t.verdict] || t.verdict)}</span>`;
  $("#d-title").textContent = `“${t.claim}”`;
  const body = $("#d-body");
  if (!dialog.open) dialog.showModal();

  if (!isTested(t) || !t.data) {
    body.innerHTML = `
      <div class="pending-note">&gt; claim received. test queued.<br>Results, charts and code appear here when the episode airs.</div>
      ${t.rules ? `<div class="d-sec"><h3>Locked test rules</h3>${kvTable(t.rules)}</div>` : ""}`;
    return;
  }

  body.innerHTML = `<div class="loading">Loading results…</div>`;
  let d;
  try { d = await getJSON(safeUrl(t.data)); }
  catch (err) { body.innerHTML = `<div class="load-error">Couldn't load ${esc(t.data)}. ${esc(err.message)}</div>`; return; }

  const video = safeUrl(d.video || t.video), code = safeUrl(d.code || t.code);
  body.innerHTML = `
    ${d.summary ? `<div class="d-sec"><p class="d-summary">${esc(d.summary)}</p></div>` : ""}
    <div class="d-actions">
      ${video ? `<a class="btn btn-gold btn-sm" href="${esc(video)}" target="_blank" rel="noopener">Watch the episode</a>` : ""}
      ${code ? `<a class="btn btn-ghost btn-sm" href="${esc(code)}" target="_blank" rel="noopener">Code on GitHub</a>` : ""}
      <a class="btn btn-ghost btn-sm" href="${esc(safeUrl(t.data))}" download>Download data (JSON)</a>
    </div>
    ${d.metrics ? `<div class="d-sec"><h3>Results</h3>${metricsTable(d.metrics)}</div>` : ""}
    <div class="d-sec"><h3>Charts</h3><div class="charts">
      ${d.equity ? `<div class="chart-box wide"><h4>Equity curve</h4><p class="cap">${esc(d.equity.caption || "Strategy against buy and hold and random entries, after fees.")}</p><div class="chart-area"><canvas id="c-eq" aria-label="Equity curve chart" role="img"></canvas></div></div>` : ""}
      ${d.per_coin ? `<div class="chart-box ${d.per_coin.length > 12 ? "wide" : ""}"><h4>Net result per coin</h4><p class="cap">Sorted best to worst.</p><div class="chart-area" style="${d.per_coin.length > 12 ? `height:${Math.max(320, d.per_coin.length * 22)}px` : ""}"><canvas id="c-coin" aria-label="Net result per coin chart" role="img"></canvas></div></div>` : ""}
      ${d.by_year ? `<div class="chart-box"><h4>Net result by period</h4><p class="cap">Does it hold across market phases?</p><div class="chart-area"><canvas id="c-year" aria-label="Net result by period chart" role="img"></canvas></div></div>` : ""}
    </div></div>
    ${d.rules ? `<div class="d-sec"><h3>Locked test rules</h3>${kvTable(d.rules)}</div>` : ""}
    ${d.limitations?.length ? `<div class="d-sec"><h3>Limitations</h3><ul class="limits">${d.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></div>` : ""}`;

  if (!window.Chart) return;
  const unit = d.pnl_unit || "%";
  if (d.equity) state.charts.push(lineChart($("#c-eq"), d.equity));
  if (d.per_coin) {
    const pc = [...d.per_coin].sort((a, b) => b.pnl - a.pnl);
    state.charts.push(barChart($("#c-coin"), pc.map((x) => x.symbol.replace(/USDT$/, "")), pc.map((x) => x.pnl), unit, pc.length > 12));
  }
  if (d.by_year) state.charts.push(barChart($("#c-year"), d.by_year.map((x) => x.label), d.by_year.map((x) => x.pnl), unit, false));
}

function closeDetail() {
  if (dialog.open) dialog.close();
}
dialog.addEventListener("close", () => {
  destroyCharts();
  if (/^#ep\d+$/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + "#verdicts");
});
$("#d-close").addEventListener("click", closeDetail);
dialog.addEventListener("click", (e) => { if (e.target === dialog) closeDetail(); });

function route() {
  const m = location.hash.match(/^#ep(\d+)$/);
  if (m) openDetail(Number(m[1])); else closeDetail();
}
window.addEventListener("hashchange", route);

/* ---------- compare ---------- */
async function renderCompare(aEp, bEp) {
  const box = $("#compare-box");
  const tested = state.tests.filter((t) => isTested(t) && t.data).sort((a, b) => a.ep - b.ep);
  if (tested.length < 2) {
    box.innerHTML = `<p class="sub" style="margin:0">Comparison opens once two claims have been stamped. ${tested.length === 1 ? "One down, one to go." : "The first verdict is on its way."}</p>`;
    return;
  }
  const a = tested.find((t) => t.ep === aEp) || tested[tested.length - 2];
  const b = tested.find((t) => t.ep === bEp) || tested[tested.length - 1];
  const opt = (sel) => tested.map((t) => `<option value="${t.ep}" ${t.ep === sel.ep ? "selected" : ""}>Ep ${pad(t.ep)}: ${esc(t.claim)}</option>`).join("");
  box.innerHTML = `
    <div class="pick">
      <label class="sr" for="cmp-a">First test</label><select class="select" id="cmp-a">${opt(a)}</select>
      <span class="vs">vs</span>
      <label class="sr" for="cmp-b">Second test</label><select class="select" id="cmp-b">${opt(b)}</select>
    </div>
    <div id="cmp-table"><div class="loading">Loading…</div></div>`;
  $("#cmp-a").addEventListener("change", (e) => renderCompare(Number(e.target.value), b.ep));
  $("#cmp-b").addEventListener("change", (e) => renderCompare(a.ep, Number(e.target.value)));

  try {
    const [da, db] = await Promise.all([getJSON(safeUrl(a.data)), getJSON(safeUrl(b.data))]);
    const tfOf = (d) => d.main_timeframe || Object.keys(d.metrics || {})[0];
    const ma = (da.metrics || {})[tfOf(da)] || {}, mb = (db.metrics || {})[tfOf(db)] || {};
    const rows = [...new Set([...Object.keys(ma), ...Object.keys(mb)])];
    $("#cmp-table").innerHTML = `<div class="tbl-wrap"><table class="kv">
      <thead><tr><th scope="col">Measure</th><th scope="col" style="text-align:right">Ep ${pad(a.ep)} (${esc(tfOf(da))})</th><th scope="col" style="text-align:right">Ep ${pad(b.ep)} (${esc(tfOf(db))})</th></tr></thead>
      <tbody>
        <tr><th scope="row">Verdict</th><td class="num"><span class="stamp ${esc(a.verdict)}">${esc(LABEL[a.verdict])}</span></td><td class="num"><span class="stamp ${esc(b.verdict)}">${esc(LABEL[b.verdict])}</span></td></tr>
        ${rows.map((r) => `<tr><th scope="row">${esc(r)}</th><td class="num">${esc(ma[r] ?? "–")}</td><td class="num">${esc(mb[r] ?? "–")}</td></tr>`).join("")}
      </tbody></table></div>`;
  } catch (err) {
    $("#cmp-table").innerHTML = `<div class="load-error">Couldn't load comparison data. ${esc(err.message)}</div>`;
  }
}

/* ---------- start ---------- */
(async function init() {
  try {
    const idx = await getJSON("data/tests.json");
    state.tests = (idx.tests || []).map((t) => ({ ...t, ep: Number(t.ep) }));
  } catch (err) {
    const hint = location.protocol === "file:" ? " Opened as a file? Run a local server instead: python -m http.server" : "";
    $("#board").innerHTML = `<div class="load-error">Couldn't load the verdict board.${esc(hint)}</div>`;
    $("#compare-box").innerHTML = "";
    return;
  }
  renderCounts(); renderFilters(); renderBoard(); renderCompare();
  route();
})();
