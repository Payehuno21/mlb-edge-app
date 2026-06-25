import { useState, useMemo, useEffect, useCallback } from "react";
import { RefreshCw, ChevronDown, ChevronUp, AlertCircle, Trophy, Info, Pencil, CheckCircle2, Flame } from "lucide-react";

// ---------------------------------------------------------------------------
// MLB EDGE — v5
// - Sin abridores (no afectaban el cálculo; se quitan por completo de la UI)
// - Momios en formato DECIMAL en toda la app
// - Mercado F5 (primeras 5 entradas): ML, RL, Total — modelo independiente
// - Run Line dinámico: el modelo decide quién es favorito (-1.5) y quién
//   es desvalido (+1.5), sin asumir que siempre es el local. Hay un botón
//   para invertir manualmente si el mercado real difiere del modelo.
// - Layout denso tipo terminal: filas tabulares, momios decimales inline.
// ---------------------------------------------------------------------------
const DATA_JSON_URL = "https://raw.githubusercontent.com/Payehuno21/mlb-edge-data/main/data.json";

const TEAM_COLORS = {
  ARI:"#A71930", ATL:"#13274F", BAL:"#DF4601", BOS:"#BD3039", CHC:"#0E3386",
  CWS:"#27251F", CIN:"#C6011F", CLE:"#00385D", COL:"#33006F", DET:"#0C2340",
  HOU:"#EB6E1F", KC:"#004687", LAA:"#BA0021", LAD:"#005A9C", MIA:"#00A3E0",
  MIL:"#12284B", MIN:"#002B5C", NYM:"#FF5910", NYY:"#0C2340", OAK:"#003831",
  ATH:"#003831", PHI:"#E81828", PIT:"#FDB827", SD:"#2F241D", SF:"#FD5A1E",
  SEA:"#0C2C56", STL:"#C41E3A", TB:"#8FBCE6", TEX:"#003278", TOR:"#134A8E",
  WSH:"#AB0003"
};

const TEAMS_FALLBACK = [
  { abbr: "TB",  name: "Tampa Bay Rays",          winPct: 0.643, elo: 1586 },
  { abbr: "NYY", name: "New York Yankees",        winPct: 0.610, elo: 1566 },
  { abbr: "TOR", name: "Toronto Blue Jays",       winPct: 0.483, elo: 1490 },
  { abbr: "BAL", name: "Baltimore Orioles",       winPct: 0.467, elo: 1480 },
  { abbr: "BOS", name: "Boston Red Sox",          winPct: 0.431, elo: 1459 },
  { abbr: "CLE", name: "Cleveland Guardians",     winPct: 0.557, elo: 1534 },
  { abbr: "CWS", name: "Chicago White Sox",       winPct: 0.542, elo: 1525 },
  { abbr: "MIN", name: "Minnesota Twins",         winPct: 0.450, elo: 1470 },
  { abbr: "KC",  name: "Kansas City Royals",      winPct: 0.373, elo: 1424 },
  { abbr: "DET", name: "Detroit Tigers",          winPct: 0.367, elo: 1420 },
  { abbr: "SEA", name: "Seattle Mariners",        winPct: 0.517, elo: 1510 },
  { abbr: "ATH", name: "Athletics",               winPct: 0.475, elo: 1485 },
  { abbr: "TEX", name: "Texas Rangers",           winPct: 0.475, elo: 1485 },
  { abbr: "HOU", name: "Houston Astros",          winPct: 0.443, elo: 1466 },
  { abbr: "LAA", name: "Los Angeles Angels",      winPct: 0.383, elo: 1430 },
  { abbr: "ATL", name: "Atlanta Braves",          winPct: 0.667, elo: 1600 },
  { abbr: "WSH", name: "Washington Nationals",    winPct: 0.517, elo: 1510 },
  { abbr: "PHI", name: "Philadelphia Phillies",   winPct: 0.508, elo: 1505 },
  { abbr: "NYM", name: "New York Mets",           winPct: 0.441, elo: 1465 },
  { abbr: "MIA", name: "Miami Marlins",           winPct: 0.433, elo: 1460 },
  { abbr: "MIL", name: "Milwaukee Brewers",       winPct: 0.625, elo: 1575 },
  { abbr: "STL", name: "St. Louis Cardinals",     winPct: 0.544, elo: 1526 },
  { abbr: "PIT", name: "Pittsburgh Pirates",      winPct: 0.533, elo: 1520 },
  { abbr: "CHC", name: "Chicago Cubs",            winPct: 0.533, elo: 1520 },
  { abbr: "CIN", name: "Cincinnati Reds",         winPct: 0.517, elo: 1510 },
  { abbr: "LAD", name: "Los Angeles Dodgers",     winPct: 0.644, elo: 1586 },
  { abbr: "SD",  name: "San Diego Padres",        winPct: 0.552, elo: 1531 },
  { abbr: "ARI", name: "Arizona Diamondbacks",    winPct: 0.534, elo: 1520 },
  { abbr: "SF",  name: "San Francisco Giants",    winPct: 0.390, elo: 1434 },
  { abbr: "COL", name: "Colorado Rockies",        winPct: 0.367, elo: 1420 },
].sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// FETCH del pipeline autónomo
// ---------------------------------------------------------------------------
async function fetchPipelineData(url) {
  if (!url) return null;
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (networkErr) {
    throw new Error(`Fallo de red/CORS: ${networkErr.message || networkErr}`);
  }
  if (!res.ok) throw new Error(`GitHub respondió HTTP ${res.status}`);
  try {
    return await res.json();
  } catch (parseErr) {
    throw new Error(`JSON inválido: ${parseErr.message || parseErr}`);
  }
}

function normalizeTeamsFromPipeline(payload) {
  if (!payload?.teams) return [];
  return payload.teams.map(t => ({
    id: t.id, abbr: t.abbr, name: t.name, winPct: t.winPct,
    homeWinPct: t.homeWinPct, awayWinPct: t.awayWinPct, last10: t.last10,
    elo: t.elo, runsPerGame: t.runsPerGame, staffEra: t.staffEra,
    topPowerHitter: t.topPowerHitter, topContactHitter: t.topContactHitter,
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeGamesFromPipeline(payload, teamsById) {
  if (!payload?.games) return [];
  return payload.games.map(g => {
    const home = teamsById[g.homeTeamId];
    const away = teamsById[g.awayTeamId];
    if (!home || !away) return null;
    const time = new Date(g.gameDate);
    return {
      gamePk: g.gamePk,
      timeLabel: time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      dateStr: g.gameDateStr ?? g.gameDate?.slice(0, 10),
      home, away,
    };
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Utilidades de momios — TODO en formato DECIMAL
// ---------------------------------------------------------------------------
function impliedProbDecimal(decOdds) {
  const d = Number(decOdds);
  if (!d || d <= 1) return null;
  return 1 / d;
}

function edgePct(modelProb, decOdds) {
  const imp = impliedProbDecimal(decOdds);
  if (imp === null || modelProb === null || modelProb === undefined) return null;
  return (modelProb - imp) * 100;
}

function edgeTier(edge) {
  if (edge === null || edge === undefined || Number.isNaN(edge)) return null;
  if (edge >= 6) return { label: "BET", color: "#39FF7A", glow: true };
  if (edge >= 2.5) return { label: "LEAN", color: "#FFB319", glow: false };
  if (edge > -2.5) return { label: "PASS", color: "#6B7280", glow: false };
  return { label: "FADE", color: "#FF4655", glow: false };
}

function kellyFraction(modelProb, decOdds, fractionalMultiplier = 0.25) {
  const d = Number(decOdds);
  if (!d || d <= 1 || modelProb === null || modelProb === undefined) return null;
  const b = d - 1;
  const p = modelProb;
  const q = 1 - p;
  const fullKelly = (b * p - q) / b;
  if (fullKelly <= 0) return 0;
  return fullKelly * fractionalMultiplier;
}

function eloWinProb(diff) {
  return 1 / (1 + Math.pow(10, -diff / 400));
}

// ---------------------------------------------------------------------------
// MERCADO SIN VIG (no-vig) — referencia independiente del modelo, inspirada
// en el patrón de jrey999/mlb-positive-ev: promedia la probabilidad implícita
// de varias casas para un mismo lado, y remueve el margen (vig) comparando
// contra el lado opuesto si está disponible.
// ---------------------------------------------------------------------------
function averageImpliedProb(oddsArray) {
  const probs = oddsArray.map(impliedProbDecimal).filter(p => p !== null);
  if (!probs.length) return null;
  return probs.reduce((s, p) => s + p, 0) / probs.length;
}

// Si tenemos probabilidad implícita promedio de AMBOS lados de un mercado de
// 2 resultados, removemos el vig normalizando para que sumen 100%.
function noVigProb(probSide, probOtherSide) {
  if (probSide === null) return null;
  if (probOtherSide === null) return probSide; // sin el otro lado, no se puede de-vigear
  const total = probSide + probOtherSide;
  if (total <= 0) return null;
  return probSide / total;
}

// (La función MarketCompare vive más abajo, en el bloque de UI reconstruido)

// ---------------------------------------------------------------------------
// MODELO — juego completo + F5 (primeras 5 entradas) como cálculo separado.
// ---------------------------------------------------------------------------
function buildModel(matchup) {
  const { home, away } = matchup;

  let diff = (home.elo + 24) - away.elo;

  const homeSplit = ((home.homeWinPct ?? home.winPct ?? 0.5) - 0.5) * 220;
  const awaySplit = ((away.awayWinPct ?? away.winPct ?? 0.5) - 0.5) * 220;
  diff += homeSplit - awaySplit;

  const formAdj = (((home.last10 ?? 5) - (away.last10 ?? 5)) / 10) * 70;
  diff += formAdj;

  const homeWinProb = eloWinProb(diff);

  const leagueAvgTotal = 8.6;
  const offenseFactor = ((home.runsPerGame ?? 4.3) + (away.runsPerGame ?? 4.3)) / 8.6;
  let projectedTotal = leagueAvgTotal * (0.55 * offenseFactor + 0.45);
  projectedTotal *= matchup.parkFactor ?? 1.0;

  const expectedMargin = (diff / 400) * 1.4;

  const homeIsFavorite = homeWinProb >= 0.5;
  // Probabilidad de que el FAVORITO cubra -1.5. Pendiente calibrada contra
  // referencias reales de mercado: favoritos moderados (55-65% ML) suelen
  // cotizar el RL -1.5 con momio positivo (cobertura ~35-40%), no 15-20%
  // como daba la pendiente anterior, demasiado agresiva.
  const favMinus1_5 = 1 / (1 + Math.exp(-(Math.abs(expectedMargin) - 1.5) / 2.5));
  const dogPlus1_5 = 1 - favMinus1_5;

  const f5Diff = diff * 0.62;
  const f5HomeWinProb = eloWinProb(f5Diff);
  const f5ExpectedMargin = (f5Diff / 400) * 1.4;
  const f5HomeIsFavorite = f5HomeWinProb >= 0.5;
  const f5FavMinus0_5 = 1 / (1 + Math.exp(-(Math.abs(f5ExpectedMargin) - 0.5) / 1.4));
  const f5DogPlus0_5 = 1 - f5FavMinus0_5;
  const f5ProjectedTotal = projectedTotal * 0.56;

  return {
    homeWinProb,
    awayWinProb: 1 - homeWinProb,
    projectedTotal: Math.round(projectedTotal * 10) / 10,
    homeIsFavorite,
    favMinus1_5,
    dogPlus1_5,
    f5: {
      homeWinProb: f5HomeWinProb,
      awayWinProb: 1 - f5HomeWinProb,
      projectedTotal: Math.round(f5ProjectedTotal * 10) / 10,
      homeIsFavorite: f5HomeIsFavorite,
      favMinus0_5: f5FavMinus0_5,
      dogPlus0_5: f5DogPlus0_5,
    },
  };
}

function suggestPropsFromPipeline(matchup) {
  const { home, away } = matchup;
  const props = [];
  if (home?.topPowerHitter?.hrRate != null) {
    const gameProb = 1 - Math.pow(1 - home.topPowerHitter.hrRate, 4.2);
    props.push({ type: "HR", player: home.topPowerHitter.name, note: `${(home.topPowerHitter.hrRate * 100).toFixed(1)}% HR/turno (${home.abbr})`, confidence: Math.min(gameProb * 100, 38) });
  }
  if (away?.topContactHitter?.avg != null) {
    const gameProb = 1 - Math.pow(1 - away.topContactHitter.avg, 4.0);
    props.push({ type: "1+ Hit", player: away.topContactHitter.name, note: `AVG ${away.topContactHitter.avg.toFixed(3)} (${away.abbr})`, confidence: Math.min(gameProb * 100, 88) });
  }
  return props.slice(0, 2);
}

// ---------------------------------------------------------------------------
// BITÁCORA
// ---------------------------------------------------------------------------
const LOG_STORAGE_KEY = "mlbEdgeBetLog_v2";

function loadBetLog() {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveBetLog(entries) {
  try { localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries)); }
  catch (e) { console.error("No se pudo guardar la bitácora:", e); }
}
function profitForEntry(entry) {
  if (!entry.result || entry.result === "pending") return 0;
  if (entry.result === "lost") return -Number(entry.stake || 0);
  if (entry.result === "push") return 0;
  const d = Number(entry.odds);
  if (!d) return 0;
  return Number(entry.stake || 0) * (d - 1);
}
function summarizeLog(entries) {
  const settled = entries.filter(e => e.result === "won" || e.result === "lost" || e.result === "push");
  const totalStaked = settled.reduce((s, e) => s + Number(e.stake || 0), 0);
  const totalProfit = settled.reduce((s, e) => s + profitForEntry(e), 0);
  const wins = settled.filter(e => e.result === "won").length;
  const losses = settled.filter(e => e.result === "lost").length;
  const decided = wins + losses;
  return {
    totalBets: entries.length,
    pending: entries.filter(e => !e.result || e.result === "pending").length,
    wins, losses,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    totalStaked, totalProfit,
    roi: totalStaked > 0 ? (totalProfit / totalStaked) * 100 : null,
  };
}

function parsePropsText(text) {
  if (!text?.trim()) return [];
  return text.split("\n").map(line => {
    const parts = line.split("|").map(p => p.trim());
    if (parts.length < 2) return null;
    const [player, type, conf] = parts;
    if (!player || !type) return null;
    return { player, type, confidence: conf ? Number(conf.replace("%", "")) : null };
  }).filter(Boolean).slice(0, 6);
}


// ---------------------------------------------------------------------------
// UI — componentes base
// ---------------------------------------------------------------------------
function EdgeMeter({ value }) {
  const clamped = Math.max(-25, Math.min(25, value ?? 0));
  const pct = ((clamped + 25) / 50) * 100;
  const positive = (value ?? 0) >= 0;
  return (
    <div className="h-[5px] w-full rounded-full bg-meter-track overflow-hidden relative">
      <div className="absolute left-1/2 top-0 h-full w-px bg-white/15" />
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{
          width: `${Math.abs(pct - 50)}%`,
          marginLeft: pct >= 50 ? "50%" : `${pct}%`,
          background: positive ? "#39FF7A" : "#FF4655",
        }}
      />
    </div>
  );
}

function TierChip({ edge, size = "sm" }) {
  const tier = edgeTier(edge);
  if (!tier) return null;
  const sizeClasses = size === "lg" ? "text-xs px-2.5 py-1" : "fs-9 px-1.5 py-0.5";
  return (
    <span
      className={`font-display font-bold uppercase tracking-wide rounded shrink-0 ${sizeClasses}`}
      style={{ color: tier.color, background: `${tier.color}1A`, boxShadow: tier.glow ? `0 0 6px ${tier.color}55` : "none" }}
    >
      {tier.label}
    </span>
  );
}

function OddsInput({ value, onChange, placeholder = "1.91" }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value.replace(",", "."))}
      placeholder={placeholder}
      className="w-[56px] bg-input ring-1 ring-white/10 focus-ring-green rounded px-1.5 py-1 text-center font-mono text-xs text-brand placeholder:text-white/20"
    />
  );
}

function TeamSelect({ value, onChange, exclude, label, teams }) {
  return (
    <div className="flex-1">
      <label className="fs-9 uppercase tracking-wider text-white/35 font-semibold block mb-1">{label}</label>
      <select
        value={value?.abbr ?? ""}
        onChange={(e) => onChange(teams.find(t => t.abbr === e.target.value) ?? null)}
        className="w-full bg-input ring-1 ring-white/10 focus-ring-green rounded-lg px-3 py-2.5 text-sm font-bold text-brand appearance-none"
      >
        <option value="">Equipo…</option>
        {teams.filter(t => t.abbr !== exclude).map(t => (
          <option key={t.abbr} value={t.abbr}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}

function BetRow({ label, prob, oddsValue, edge, onOddsChange, bankroll, onLog, logContext, dim, bothSidesFilled = true }) {
  const kelly = oddsValue ? kellyFraction(prob, oddsValue) : null;
  const stake = kelly && kelly > 0 && bankroll ? kelly * Number(bankroll) : null;
  const canLog = onLog && oddsValue;
  const showTier = oddsValue && bothSidesFilled;
  return (
    <div className={`grid items-center gap-2 ${dim ? "opacity-60" : ""}`} style={{ gridTemplateColumns: "52px 38px 56px 1fr 60px 44px 24px" }}>
      <span className="text-sm font-bold text-brand truncate">{label}</span>
      <span className="fs-10 font-mono text-white/40">{(prob * 100).toFixed(0)}%</span>
      <OddsInput value={oddsValue} onChange={onOddsChange} />
      <EdgeMeter value={showTier ? edge : null} />
      <div className="flex flex-col items-end leading-tight">
        {showTier ? (
          <>
            <span className={`fs-11 font-mono font-bold ${edge > 0 ? "text-green" : edge < 0 ? "text-red" : "text-white/30"}`}>
              {edge !== null && edge !== undefined && !Number.isNaN(edge) ? `${edge > 0 ? "+" : ""}${edge.toFixed(1)}%` : "—"}
            </span>
            <TierChip edge={edge} />
          </>
        ) : oddsValue ? (
          <span className="fs-9 text-white/25 italic text-right">falta el otro lado</span>
        ) : (
          <span className="fs-11 font-mono text-white/20">—</span>
        )}
      </div>
      <span className="fs-10 font-mono text-amber-300/80 text-right">{showTier && stake && stake > 0 ? `$${stake.toFixed(0)}` : ""}</span>
      {canLog ? (
        <button
          onClick={() => onLog({ ...logContext, label, prob, odds: oddsValue, edge, stake: stake ?? 0 })}
          title="Agregar a la bitácora"
          className="w-6 h-6 rounded-full bg-green-chip-10 ring-1 ring-green-30 text-green text-sm font-bold flex items-center justify-center active:scale-90 transition-transform justify-self-end"
        >
          +
        </button>
      ) : <span />}
    </div>
  );
}

function RunLineSection({ model, oddsKeyFav, oddsKeyDog, odds, setOdds, homeAbbr, awayAbbr, bankroll, onLog, logContext, line = 1.5 }) {
  const modelFavIsHome = model.homeIsFavorite;
  const inverted = !!odds.rlInverted;
  const favIsHome = inverted ? !modelFavIsHome : modelFavIsHome;

  const favAbbr = favIsHome ? homeAbbr : awayAbbr;
  const dogAbbr = favIsHome ? awayAbbr : homeAbbr;
  const favProb = model.favMinus1_5 ?? model.favMinus0_5;
  const dogProb = model.dogPlus1_5 ?? model.dogPlus0_5;

  const favEdge = edgePct(favProb, odds[oddsKeyFav]);
  const dogEdge = edgePct(dogProb, odds[oddsKeyDog]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="fs-10 uppercase tracking-wider text-white/35 font-semibold">Run line ±{line}</p>
        <button
          onClick={() => setOdds({ ...odds, rlInverted: !inverted })}
          className="fs-9 text-white/30 font-mono flex items-center gap-1"
          title="Invertir favorito/desvalido si el mercado real difiere del modelo"
        >
          ⇄ {inverted ? "invertido" : "modelo"}
        </button>
      </div>
      <div className="space-y-1.5">
        <BetRow label={`${favAbbr} -${line}`} prob={favProb} oddsValue={odds[oddsKeyFav]} edge={favEdge} onOddsChange={(v) => setOdds({ ...odds, [oddsKeyFav]: v })} bankroll={bankroll} onLog={onLog} logContext={{ ...logContext, market: `Run Line -${line}` }} bothSidesFilled={!!(odds[oddsKeyFav] && odds[oddsKeyDog])} />
        <BetRow label={`${dogAbbr} +${line}`} prob={dogProb} oddsValue={odds[oddsKeyDog]} edge={dogEdge} onOddsChange={(v) => setOdds({ ...odds, [oddsKeyDog]: v })} bankroll={bankroll} onLog={onLog} logContext={{ ...logContext, market: `Run Line +${line}` }} bothSidesFilled={!!(odds[oddsKeyFav] && odds[oddsKeyDog])} />
      </div>
    </div>
  );
}

function MarketCompare({ oddsA, oddsB, onChangeA, onChangeB, labelA, labelB }) {
  const probA = averageImpliedProb(oddsA.filter(Boolean));
  const probB = averageImpliedProb(oddsB.filter(Boolean));
  const fairA = noVigProb(probA, probB);
  const fairB = noVigProb(probB, probA);

  const renderInputs = (values, onChange) => (
    <div className="flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <OddsInput key={i} value={values[i]} onChange={(v) => onChange(i, v)} placeholder={i === 0 ? "1.91" : "—"} />
      ))}
    </div>
  );

  return (
    <div className="rounded-lg bg-white/[0.02] ring-1 ring-white/5 px-3 py-2.5 space-y-2">
      <p className="fs-9 uppercase tracking-wider text-white/30 font-semibold">Comparar casas (sin vig)</p>
      <div className="grid items-center gap-2" style={{ gridTemplateColumns: "48px 1fr 56px" }}>
        <span className="fs-10 font-bold text-white/60 truncate">{labelA}</span>
        {renderInputs(oddsA, onChangeA)}
        <span className="fs-10 font-mono text-amber-200 text-right">{fairA !== null ? `${(fairA * 100).toFixed(0)}%` : "—"}</span>
      </div>
      <div className="grid items-center gap-2" style={{ gridTemplateColumns: "48px 1fr 56px" }}>
        <span className="fs-10 font-bold text-white/60 truncate">{labelB}</span>
        {renderInputs(oddsB, onChangeB)}
        <span className="fs-10 font-mono text-amber-200 text-right">{fairB !== null ? `${(fairB * 100).toFixed(0)}%` : "—"}</span>
      </div>
      <p className="fs-9 text-white/25">% = probabilidad justa de mercado. Compárala con el % del modelo en cada fila.</p>
    </div>
  );
}

function PropsPanel({ value, onChange, autoProps, onLog, logContext, bankroll }) {
  const [editing, setEditing] = useState(false);
  const [propOdds, setPropOdds] = useState({});
  const parsedManual = useMemo(() => parsePropsText(value), [value]);
  const hasAuto = autoProps && autoProps.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="fs-10 uppercase tracking-wider text-white/35 font-semibold flex items-center gap-1.5"><Flame size={12}/> Props {hasAuto && <CheckCircle2 size={12} className="text-green" />}</p>
        {!hasAuto && (
          <button onClick={() => setEditing(!editing)} className="flex items-center gap-1 fs-9 text-white/40 font-semibold uppercase">
            <Pencil size={10} /> {editing ? "listo" : "pegar"}
          </button>
        )}
      </div>
      {hasAuto ? (
        <div className="space-y-1.5">
          {autoProps.map((p, i) => {
            const oddsVal = propOdds[i] ?? "";
            const stake = oddsVal && bankroll ? (kellyFraction(p.confidence / 100, oddsVal) ?? 0) * Number(bankroll) : null;
            return (
              <div key={i} className="grid items-center gap-2" style={{ gridTemplateColumns: "1fr 40px 56px 40px 24px" }}>
                <span className="text-sm font-bold text-brand truncate">{p.player} <span className="text-white/40 font-normal">· {p.type}</span></span>
                <span className="fs-10 font-mono text-amber-300 text-right">{p.confidence.toFixed(0)}%</span>
                <OddsInput value={oddsVal} onChange={(v) => setPropOdds({ ...propOdds, [i]: v })} />
                <span className="fs-10 font-mono text-amber-300/80 text-right">{stake && stake > 0 ? `$${stake.toFixed(0)}` : ""}</span>
                {onLog && oddsVal ? (
                  <button onClick={() => onLog({ ...logContext, market: "Prop", label: `${p.player} · ${p.type}`, prob: p.confidence / 100, odds: oddsVal, edge: null, stake: stake ?? 0 })} className="w-6 h-6 rounded-full bg-green-chip-10 ring-1 ring-green-30 text-green text-sm font-bold flex items-center justify-center justify-self-end">+</button>
                ) : <span />}
              </div>
            );
          })}
        </div>
      ) : editing ? (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"Jugador | Tipo | Confianza%\nAaron Judge | HR | 28"}
          rows={3}
          className="w-full bg-input ring-1 ring-white/10 focus-ring-green rounded-lg px-3 py-2 text-xs font-mono text-brand placeholder:text-white/20"
        />
      ) : parsedManual.length > 0 ? (
        <div className="space-y-1">
          {parsedManual.map((p, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm font-bold text-brand truncate">{p.player} <span className="text-white/40 font-normal">· {p.type}</span></span>
              {p.confidence !== null && !Number.isNaN(p.confidence) && <span className="fs-10 font-mono text-amber-300">{p.confidence}%</span>}
            </div>
          ))}
        </div>
      ) : (
        <p className="fs-10 text-white/30 leading-relaxed">Sin datos para este cruce. Pide a Claude props del partido y pégalas aquí.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MATCHUP CARD COMPACT — vive en la grilla principal, solo lo esencial
// ---------------------------------------------------------------------------
function MatchupCardCompact({ matchup, odds, onOpen, onRemove, teams, setMatchup }) {
  const ready = matchup.home && matchup.away;

  if (!ready) {
    return (
      <div className="rounded-xl bg-card ring-1 ring-white-06 p-4">
        <div className="flex gap-2 items-end">
          <TeamSelect label="Visitante" value={matchup.away} exclude={matchup.home?.abbr} onChange={(t) => setMatchup({ ...matchup, away: t })} teams={teams} />
          <span className="text-white/20 text-sm pb-2.5">@</span>
          <TeamSelect label="Local" value={matchup.home} exclude={matchup.away?.abbr} onChange={(t) => setMatchup({ ...matchup, home: t })} teams={teams} />
          <button onClick={onRemove} className="text-white/25 text-sm pb-2.5 px-1">✕</button>
        </div>
      </div>
    );
  }

  const model = buildModel(matchup);
  const bothMlFilled = !!(odds.mlHome && odds.mlAway);
  const mlHomeEdge = bothMlFilled ? edgePct(model.homeWinProb, odds.mlHome) : null;
  const mlAwayEdge = bothMlFilled ? edgePct(model.awayWinProb, odds.mlAway) : null;
  const bestEdge = [mlHomeEdge, mlAwayEdge].filter(e => e !== null && !Number.isNaN(e));
  const topEdge = bestEdge.length ? Math.max(...bestEdge) : null;
  const tier = edgeTier(topEdge);

  return (
    <button
      onClick={onOpen}
      className="rounded-xl bg-card ring-1 text-left p-4 transition-all hover:ring-white/20 relative group"
      style={{ boxShadow: tier?.label === "BET" ? "0 0 0 1px rgba(57,255,122,0.35) inset" : "0 0 0 1px rgba(255,255,255,0.06) inset" }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-2.5 right-2.5 text-white/20 hover:text-white/50 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
      >
        ✕
      </button>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: TEAM_COLORS[matchup.away.abbr] }} />
          <span className="font-display text-lg font-bold tracking-wide leading-none">{matchup.away.abbr} <span className="text-white/30">@</span> {matchup.home.abbr}</span>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: TEAM_COLORS[matchup.home.abbr] }} />
        </div>
        {tier && <TierChip edge={topEdge} />}
      </div>
      <p className="fs-10 font-mono text-white/30 mb-3">{matchup.timeLabel ?? ""} · Total proy. {model.projectedTotal.toFixed(1)}</p>
      <div className="space-y-1.5">
        <div className="grid items-center gap-2" style={{ gridTemplateColumns: "44px 1fr 50px" }}>
          <span className="text-sm font-bold text-brand">{matchup.away.abbr}</span>
          <EdgeMeter value={mlAwayEdge} />
          <span className="fs-11 font-mono text-white/50 text-right">{odds.mlAway ? Number(odds.mlAway).toFixed(2) : "—"}</span>
        </div>
        <div className="grid items-center gap-2" style={{ gridTemplateColumns: "44px 1fr 50px" }}>
          <span className="text-sm font-bold text-brand">{matchup.home.abbr}</span>
          <EdgeMeter value={mlHomeEdge} />
          <span className="fs-11 font-mono text-white/50 text-right">{odds.mlHome ? Number(odds.mlHome).toFixed(2) : "—"}</span>
        </div>
      </div>
      <p className="fs-9 text-white/25 mt-3 text-center">Click para ver RL · Total · F5 · props</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// MATCHUP DETAIL PANEL — panel lateral con el análisis completo del cruce
// ---------------------------------------------------------------------------
function MatchupDetailPanel({ matchup, setMatchup, odds, setOdds, onClose, bankroll, onAddToLog }) {
  const [f5Open, setF5Open] = useState(false);
  const model = buildModel(matchup);
  const autoProps = suggestPropsFromPipeline(matchup);
  const matchupLabel = `${matchup.away.abbr} @ ${matchup.home.abbr}`;
  const logContext = { matchup: matchupLabel };

  const mlHomeEdge = edgePct(model.homeWinProb, odds.mlHome);
  const mlAwayEdge = edgePct(model.awayWinProb, odds.mlAway);
  const totalDiff = odds.totalLine !== "" && odds.totalLine !== undefined ? model.projectedTotal - Number(odds.totalLine) : null;
  const overProb = totalDiff !== null ? 0.5 + Math.min(Math.max(totalDiff, 0) * 0.09, 0.30) : null;
  const underProb = totalDiff !== null ? 0.5 + Math.min(Math.max(-totalDiff, 0) * 0.09, 0.30) : null;
  const overEdge = overProb !== null ? edgePct(overProb, odds.over) : null;
  const underEdge = underProb !== null ? edgePct(underProb, odds.under) : null;

  const f5TotalDiff = odds.f5TotalLine !== "" && odds.f5TotalLine !== undefined ? model.f5.projectedTotal - Number(odds.f5TotalLine) : null;
  const f5OverProb = f5TotalDiff !== null ? 0.5 + Math.min(Math.max(f5TotalDiff, 0) * 0.12, 0.30) : null;
  const f5UnderProb = f5TotalDiff !== null ? 0.5 + Math.min(Math.max(-f5TotalDiff, 0) * 0.12, 0.30) : null;
  const f5OverEdge = f5OverProb !== null ? edgePct(f5OverProb, odds.f5Over) : null;
  const f5UnderEdge = f5UnderProb !== null ? edgePct(f5UnderProb, odds.f5Under) : null;
  const f5MlHomeEdge = edgePct(model.f5.homeWinProb, odds.f5MlHome);
  const f5MlAwayEdge = edgePct(model.f5.awayWinProb, odds.f5MlAway);

  return (
    <div className="fixed inset-0 z-30 flex justify-end" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div
        className="bg-app h-full overflow-y-auto"
        style={{ width: "min(480px, 100%)", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-header z-10 px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full" style={{ background: TEAM_COLORS[matchup.away.abbr] }} />
            <span className="font-display text-xl font-bold tracking-wide">{matchup.away.abbr} <span className="text-white/30">@</span> {matchup.home.abbr}</span>
            <span className="w-3 h-3 rounded-full" style={{ background: TEAM_COLORS[matchup.home.abbr] }} />
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none px-2">✕</button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="fs-10 uppercase tracking-wider text-white/35 font-semibold">Moneyline</p>
              <button onClick={() => setMatchup({ ...matchup, mlCompareOpen: !matchup.mlCompareOpen })} className="fs-9 text-white/30 font-mono">
                {matchup.mlCompareOpen ? "ocultar casas" : "+ comparar casas"}
              </button>
            </div>
            <div className="space-y-1.5">
              <BetRow label={matchup.away.abbr} prob={model.awayWinProb} oddsValue={odds.mlAway} edge={mlAwayEdge} onOddsChange={(v) => setOdds({ ...odds, mlAway: v })} bankroll={bankroll} onLog={onAddToLog} logContext={{ ...logContext, market: "Moneyline" }} bothSidesFilled={!!(odds.mlAway && odds.mlHome)} />
              <BetRow label={matchup.home.abbr} prob={model.homeWinProb} oddsValue={odds.mlHome} edge={mlHomeEdge} onOddsChange={(v) => setOdds({ ...odds, mlHome: v })} bankroll={bankroll} onLog={onAddToLog} logContext={{ ...logContext, market: "Moneyline" }} bothSidesFilled={!!(odds.mlAway && odds.mlHome)} />
            </div>
            {matchup.mlCompareOpen && (
              <div className="mt-2">
                <MarketCompare
                  labelA={matchup.away.abbr}
                  labelB={matchup.home.abbr}
                  oddsA={[odds.mlAwayBook1, odds.mlAwayBook2, odds.mlAwayBook3]}
                  oddsB={[odds.mlHomeBook1, odds.mlHomeBook2, odds.mlHomeBook3]}
                  onChangeA={(i, v) => setOdds({ ...odds, [`mlAwayBook${i + 1}`]: v })}
                  onChangeB={(i, v) => setOdds({ ...odds, [`mlHomeBook${i + 1}`]: v })}
                />
              </div>
            )}
          </div>

          <RunLineSection model={model} oddsKeyFav="rlFav" oddsKeyDog="rlDog" odds={odds} setOdds={setOdds} homeAbbr={matchup.home.abbr} awayAbbr={matchup.away.abbr} bankroll={bankroll} onLog={onAddToLog} logContext={logContext} line={1.5} />

          <div>
            <p className="fs-10 uppercase tracking-wider text-white/35 font-semibold mb-2">Total — modelo {model.projectedTotal.toFixed(1)}</p>
            <div className="flex items-center gap-2 mb-2">
              <span className="fs-10 text-white/40">Línea</span>
              <input type="text" inputMode="decimal" value={odds.totalLine ?? ""} onChange={(e) => setOdds({ ...odds, totalLine: e.target.value })} placeholder="8.5" className="w-16 bg-input ring-1 ring-white/10 focus-ring-green rounded px-1.5 py-1 text-center font-mono text-xs text-brand placeholder:text-white/20" />
            </div>
            <div className="space-y-1.5">
              <BetRow label="Over" prob={overProb ?? 0.5} oddsValue={odds.over} edge={overEdge} onOddsChange={(v) => setOdds({ ...odds, over: v })} bankroll={bankroll} onLog={onAddToLog} logContext={{ ...logContext, market: `Total ${odds.totalLine || ""}` }} bothSidesFilled={!!(odds.over && odds.under)} />
              <BetRow label="Under" prob={underProb ?? 0.5} oddsValue={odds.under} edge={underEdge} onOddsChange={(v) => setOdds({ ...odds, under: v })} bankroll={bankroll} onLog={onAddToLog} logContext={{ ...logContext, market: `Total ${odds.totalLine || ""}` }} bothSidesFilled={!!(odds.over && odds.under)} />
            </div>
          </div>

          <div className="rounded-lg bg-white/[0.02] ring-1 ring-white/5">
            <button onClick={() => setF5Open(!f5Open)} className="w-full flex items-center justify-between px-3 py-2.5">
              <span className="font-display fs-11 font-bold tracking-wide text-white/60">F5 · PRIMERAS 5 ENTRADAS</span>
              {f5Open ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
            </button>
            {f5Open && (
              <div className="px-3 pb-3 space-y-4">
                <div>
                  <p className="fs-10 uppercase tracking-wider text-white/35 font-semibold mb-2">Moneyline F5</p>
                  <div className="space-y-1.5">
                    <BetRow label={matchup.away.abbr} prob={model.f5.awayWinProb} oddsValue={odds.f5MlAway} edge={f5MlAwayEdge} onOddsChange={(v) => setOdds({ ...odds, f5MlAway: v })} bankroll={bankroll} onLog={onAddToLog} logContext={{ ...logContext, market: "ML F5" }} bothSidesFilled={!!(odds.f5MlAway && odds.f5MlHome)} />
                    <BetRow label={matchup.home.abbr} prob={model.f5.homeWinProb} oddsValue={odds.f5MlHome} edge={f5MlHomeEdge} onOddsChange={(v) => setOdds({ ...odds, f5MlHome: v })} bankroll={bankroll} onLog={onAddToLog} logContext={{ ...logContext, market: "ML F5" }} bothSidesFilled={!!(odds.f5MlAway && odds.f5MlHome)} />
                  </div>
                </div>
                <RunLineSection model={model.f5} oddsKeyFav="f5RlFav" oddsKeyDog="f5RlDog" odds={odds} setOdds={setOdds} homeAbbr={matchup.home.abbr} awayAbbr={matchup.away.abbr} bankroll={bankroll} onLog={onAddToLog} logContext={{ ...logContext, market: "RL F5" }} line={0.5} />
                <div>
                  <p className="fs-10 uppercase tracking-wider text-white/35 font-semibold mb-2">Total F5 — modelo {model.f5.projectedTotal.toFixed(1)}</p>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="fs-10 text-white/40">Línea</span>
                    <input type="text" inputMode="decimal" value={odds.f5TotalLine ?? ""} onChange={(e) => setOdds({ ...odds, f5TotalLine: e.target.value })} placeholder="4.5" className="w-16 bg-input ring-1 ring-white/10 focus-ring-green rounded px-1.5 py-1 text-center font-mono text-xs text-brand placeholder:text-white/20" />
                  </div>
                  <div className="space-y-1.5">
                    <BetRow label="Over" prob={f5OverProb ?? 0.5} oddsValue={odds.f5Over} edge={f5OverEdge} onOddsChange={(v) => setOdds({ ...odds, f5Over: v })} bankroll={bankroll} onLog={onAddToLog} logContext={{ ...logContext, market: `Total F5 ${odds.f5TotalLine || ""}` }} bothSidesFilled={!!(odds.f5Over && odds.f5Under)} />
                    <BetRow label="Under" prob={f5UnderProb ?? 0.5} oddsValue={odds.f5Under} edge={f5UnderEdge} onOddsChange={(v) => setOdds({ ...odds, f5Under: v })} bankroll={bankroll} onLog={onAddToLog} logContext={{ ...logContext, market: `Total F5 ${odds.f5TotalLine || ""}` }} bothSidesFilled={!!(odds.f5Over && odds.f5Under)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <PropsPanel value={matchup.propsText} onChange={(v) => setMatchup({ ...matchup, propsText: v })} autoProps={autoProps} onLog={onAddToLog} logContext={logContext} bankroll={bankroll} />

          <p className="fs-9 text-white/25 leading-relaxed pt-2 border-top-white-04">
            Momios en decimal. RL asigna -1.5/+1.5 según el favorito del modelo — usa ⇄ si el mercado real lo tiene invertido. El tier (BET/LEAN/FADE) y el monto de Kelly solo aparecen cuando metes el momio de <strong>ambos</strong> lados del mercado. BET ≥6% edge, LEAN ≥2.5%, FADE &lt;-2.5%.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PICK OF DAY — vive en el sidebar, tarjeta destacada más grande
// ---------------------------------------------------------------------------
function PickOfDay({ matchups, oddsMap, bankroll }) {
  const best = useMemo(() => {
    let top = null;
    for (const m of matchups) {
      if (!m.home || !m.away) continue;
      const model = buildModel(m);
      const odds = oddsMap[m.id] || {};
      const modelFavIsHome = model.homeIsFavorite;
      const inverted = !!odds.rlInverted;
      const favIsHome = inverted ? !modelFavIsHome : modelFavIsHome;
      const favAbbr = favIsHome ? m.home.abbr : m.away.abbr;
      const dogAbbr = favIsHome ? m.away.abbr : m.home.abbr;
      const matchupLabel = `${m.away.abbr} @ ${m.home.abbr}`;
      const candidates = [
        { label: `ML ${m.home.abbr}`, prob: model.homeWinProb, odd: odds.mlHome, matchup: matchupLabel, otherOdd: odds.mlAway },
        { label: `ML ${m.away.abbr}`, prob: model.awayWinProb, odd: odds.mlAway, matchup: matchupLabel, otherOdd: odds.mlHome },
        { label: `${favAbbr} -1.5`, prob: model.favMinus1_5, odd: odds.rlFav, matchup: matchupLabel, otherOdd: odds.rlDog },
        { label: `${dogAbbr} +1.5`, prob: model.dogPlus1_5, odd: odds.rlDog, matchup: matchupLabel, otherOdd: odds.rlFav },
      ];
      for (const c of candidates) {
        if (!c.odd || !c.otherOdd) continue; // requiere ambos lados del mercado, no solo uno
        const e = edgePct(c.prob, c.odd);
        if (e === null) continue;
        if (!top || e > top.edge) top = { ...c, edge: e };
      }
    }
    return top;
  }, [matchups, oddsMap]);

  if (!best) {
    return (
      <div className="rounded-xl bg-white-02 ring-1 ring-white/5 px-4 py-4 flex items-start gap-2.5">
        <AlertCircle size={16} className="text-white/30 shrink-0 mt-0.5" />
        <p className="text-sm text-white/40 leading-relaxed">Ingresa momios en algún cruce para ver el pick del día aquí.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl relative overflow-hidden ring-1 ring-amber-400/30 px-5 py-5 bg-amber-grad">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={15} className="text-amber-300" />
        <span className="font-display fs-10 uppercase tracking-widest font-bold text-amber-300/90">Pick del día</span>
      </div>
      <p className="font-display text-2xl font-bold text-brand leading-tight tracking-wide">{best.label}</p>
      <p className="text-sm text-white/40 mt-1">{best.matchup} · momio {Number(best.odd).toFixed(2)}</p>
      <div className="flex items-center gap-2.5 mt-3">
        <span className="text-3xl font-mono font-bold text-amber-300">+{best.edge.toFixed(1)}%</span>
        <TierChip edge={best.edge} size="lg" />
      </div>
      {(() => {
        const k = kellyFraction(best.prob, best.odd);
        const stake = k && k > 0 && bankroll ? k * Number(bankroll) : null;
        return stake ? (
          <p className="text-sm text-white/35 mt-3">¼ Kelly: <span className="text-amber-200 font-mono">${stake.toFixed(0)}</span> sobre ${Number(bankroll).toLocaleString()}</p>
        ) : null;
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BET LOG PANEL — resumen compacto en sidebar + lista completa al expandir
// ---------------------------------------------------------------------------
function ResultButton({ active, color, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="fs-9 font-bold uppercase tracking-wide px-2 py-1 rounded transition-all"
      style={{ color: active ? "#0A0E12" : color, background: active ? color : `${color}1A`, boxShadow: active ? "none" : `0 0 0 1px ${color}4D inset` }}
    >
      {children}
    </button>
  );
}

function BetLogPanel({ entries, setEntries }) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(() => summarizeLog(entries), [entries]);
  const updateEntry = (id, patch) => setEntries((prev) => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  const removeEntry = (id) => setEntries((prev) => prev.filter(e => e.id !== id));

  const exportLog = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mlb-edge-bitacora-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importLog = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (Array.isArray(imported)) setEntries(imported);
      } catch { alert("Archivo inválido."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="rounded-xl bg-card ring-1 ring-white-06 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-amber-300" />
          <span className="font-display text-sm font-bold tracking-wide">Bitácora</span>
        </div>
        <span className="fs-9 text-white/30 font-mono">{summary.totalBets}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-white-02 px-2.5 py-2 text-center">
          <p className="fs-9 text-white/35 uppercase">Balance</p>
          <p className={`text-sm font-mono font-bold mt-0.5 ${summary.totalProfit > 0 ? "text-green" : summary.totalProfit < 0 ? "text-red" : "text-brand"}`}>{summary.totalProfit > 0 ? "+" : ""}${summary.totalProfit.toFixed(0)}</p>
        </div>
        <div className="rounded-lg bg-white-02 px-2.5 py-2 text-center">
          <p className="fs-9 text-white/35 uppercase">ROI</p>
          <p className={`text-sm font-mono font-bold mt-0.5 ${summary.roi > 0 ? "text-green" : summary.roi < 0 ? "text-red" : "text-brand"}`}>{summary.roi !== null ? `${summary.roi > 0 ? "+" : ""}${summary.roi.toFixed(1)}%` : "—"}</p>
        </div>
      </div>
      <p className="fs-9 text-white/30 text-center mb-3">{summary.wins}G-{summary.losses}P · {summary.pending} pend.</p>
      <button onClick={() => setOpen(!open)} className="w-full fs-10 font-bold uppercase text-white/50 bg-white-02 ring-1 ring-white/10 rounded-lg py-2">
        {open ? "Ocultar detalle" : "Ver detalle"}
      </button>

      {open && (
        <div className="mt-3 space-y-2 max-h-96 overflow-y-auto pr-1">
          {entries.length === 0 ? (
            <p className="fs-10 text-white/30 leading-relaxed">Usa el botón <span className="text-green font-bold">+</span> junto a cualquier momio para registrar la apuesta.</p>
          ) : (
            [...entries].reverse().map((entry) => (
              <div key={entry.id} className="rounded-lg bg-white-02 px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-brand truncate">{entry.label}</p>
                    <p className="fs-9 text-white/40 truncate">{entry.matchup} · {entry.market} · {Number(entry.odds).toFixed(2)}</p>
                    <p className="fs-9 text-white/30">${Number(entry.stake).toFixed(0)} · {entry.date}</p>
                  </div>
                  <button onClick={() => removeEntry(entry.id)} className="text-white/25 fs-10 shrink-0">✕</button>
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                  <ResultButton active={!entry.result || entry.result === "pending"} color="#9CA3AF" onClick={() => updateEntry(entry.id, { result: "pending" })}>Pend</ResultButton>
                  <ResultButton active={entry.result === "won"} color="#39FF7A" onClick={() => updateEntry(entry.id, { result: "won" })}>Ganada</ResultButton>
                  <ResultButton active={entry.result === "lost"} color="#FF4655" onClick={() => updateEntry(entry.id, { result: "lost" })}>Perdida</ResultButton>
                  <ResultButton active={entry.result === "push"} color="#FFB319" onClick={() => updateEntry(entry.id, { result: "push" })}>Push</ResultButton>
                  {(entry.result === "won" || entry.result === "lost") && (
                    <span className={`fs-9 font-mono font-bold ml-auto ${profitForEntry(entry) >= 0 ? "text-green" : "text-red"}`}>{profitForEntry(entry) >= 0 ? "+" : ""}${profitForEntry(entry).toFixed(0)}</span>
                  )}
                </div>
              </div>
            ))
          )}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={exportLog} className="flex-1 fs-9 font-bold uppercase text-white/50 bg-white-02 ring-1 ring-white/10 rounded-lg py-1.5">Exportar</button>
            <label className="flex-1 fs-9 font-bold uppercase text-white/50 bg-white-02 ring-1 ring-white/10 rounded-lg py-1.5 text-center cursor-pointer">
              Importar
              <input type="file" accept="application/json" onChange={importLog} className="hidden" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN APP — layout de 2 paneles: sidebar fijo + grilla principal
// ---------------------------------------------------------------------------
let nextId = 1;
function emptyMatchup() {
  return { id: nextId++, home: null, away: null, propsText: "" };
}

export default function MLBEdge() {
  const [matchups, setMatchups] = useState([emptyMatchup()]);
  const [openId, setOpenId] = useState(null);
  const [oddsMap, setOddsMap] = useState({});
  const [bankroll, setBankroll] = useState("1000");
  const [betLog, setBetLog] = useState(() => loadBetLog());

  useEffect(() => { saveBetLog(betLog); }, [betLog]);

  const handleAddToLog = useCallback((bet) => {
    const entry = { id: `${Date.now()}-${Math.round(Math.random() * 1000)}`, date: new Date().toLocaleDateString(), result: "pending", ...bet };
    setBetLog((prev) => [...prev, entry]);
  }, []);

  const [pipelineStatus, setPipelineStatus] = useState(DATA_JSON_URL ? "loading" : "no-url");
  const [pipelineErrorMsg, setPipelineErrorMsg] = useState("");
  const [pipelineMeta, setPipelineMeta] = useState(null);
  const [teams, setTeams] = useState(TEAMS_FALLBACK);
  const [autoGames, setAutoGames] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarLoadedId, setCalendarLoadedId] = useState(null);

  const loadPipeline = useCallback(async () => {
    if (!DATA_JSON_URL) { setPipelineStatus("no-url"); return; }
    setPipelineStatus("loading");
    try {
      const payload = await fetchPipelineData(DATA_JSON_URL);
      const normTeams = normalizeTeamsFromPipeline(payload);
      if (!normTeams.length) throw new Error("El JSON no trae equipos.");
      const teamsById = Object.fromEntries(payload.teams.map(t => [t.id, normTeams.find(nt => nt.id === t.id)]));
      const normGames = normalizeGamesFromPipeline(payload, teamsById);
      const dates = payload.availableDates ?? [payload.date];
      setTeams(normTeams);
      setAutoGames(normGames);
      setAvailableDates(dates);
      setSelectedDate((prev) => prev && dates.includes(prev) ? prev : dates[0]);
      setPipelineMeta({ generatedAt: payload.generatedAt, date: payload.date });
      setPipelineStatus("ok");
    } catch (e) {
      console.error(e);
      setPipelineErrorMsg(e?.message || String(e));
      setPipelineStatus("error");
      setTeams(TEAMS_FALLBACK);
    }
  }, []);

  useEffect(() => { loadPipeline(); }, [loadPipeline]);

  const gamesForSelectedDate = useMemo(
    () => autoGames.filter(g => g.dateStr === selectedDate),
    [autoGames, selectedDate]
  );

  const loadCalendarForDate = (dateStr) => {
    const games = autoGames.filter(g => g.dateStr === dateStr);
    if (!games.length) return;
    setMatchups(games.map(g => ({ ...emptyMatchup(), home: g.home, away: g.away, timeLabel: g.timeLabel })));
    setCalendarLoadedId(dateStr);
  };

  const updateMatchup = (id, patch) => setMatchups((prev) => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  const setOddsForMatchup = (id, odds) => setOddsMap((prev) => ({ ...prev, [id]: odds }));
  const addMatchup = () => setMatchups((prev) => [...prev, emptyMatchup()]);
  const removeMatchup = (id) => setMatchups((prev) => prev.filter(m => m.id !== id));

  const openMatchup = matchups.find(m => m.id === openId);

  return (
    <div className="mlb-edge-root" style={{ minHeight: "100vh", background: "#0A0E12", color: "#F2F2F0", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Big+Shoulders:wght@700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        .font-display { font-family: 'Big Shoulders', sans-serif; text-transform: uppercase; }
        select option { background: #10141A; }
        .mlb-edge-root, .mlb-edge-root * { box-sizing: border-box; }
        .bg-app { background: #0A0E12; }
        .bg-card { background: #15191F; }
        .bg-input { background: #0F1318; }
        .bg-header { background: rgba(10,14,18,0.97); backdrop-filter: blur(8px); }
        .bg-green-chip-10 { background: rgba(57,255,122,0.10); }
        .bg-red-chip-10 { background: rgba(255,70,85,0.10); }
        .bg-amber-grad { background: linear-gradient(135deg, #1A1409, #0F0D08); }
        .bg-white-02 { background: rgba(255,255,255,0.03); }
        .bg-meter-track { background: #20252C; }
        .text-brand { color: #F2F2F0; }
        .text-green { color: #39FF7A; }
        .text-red { color: #FF4655; }
        .ring-white-06 { box-shadow: 0 0 0 1px rgba(255,255,255,0.08) inset; }
        .ring-green-30 { box-shadow: 0 0 0 1px rgba(57,255,122,0.3) inset; }
        .ring-red-30 { box-shadow: 0 0 0 1px rgba(255,70,85,0.3) inset; }
        .focus-ring-green:focus { box-shadow: 0 0 0 2px rgba(57,255,122,0.6) inset; outline: none; }
        .border-white-04 { border-bottom: 1px solid rgba(255,255,255,0.06); }
        .border-top-white-04 { border-top: 1px solid rgba(255,255,255,0.06); }
        .fs-9 { font-size: 10px; }
        .fs-10 { font-size: 11px; }
        .fs-11 { font-size: 12px; }
        .sidebar-col { width: 320px; }
        @media (max-width: 900px) {
          .layout-grid { grid-template-columns: 1fr !important; }
          .sidebar-col { width: 100% !important; }
        }
      `}</style>

      <div className="bg-header" style={{ position: "sticky", top: 0, zIndex: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide leading-none">MLB <span className="text-green">EDGE</span></h1>
            <p className="fs-10 text-white/35 mt-1 tracking-wide">TEMPORADA 2026 · PIPELINE AUTÓNOMO{autoGames.length > 0 ? ` · ${autoGames.length} JUEGOS CARGADOS` : ""}</p>
          </div>
          <div className="flex items-center gap-2.5">
            {pipelineStatus === "ok" && (
              <span className="fs-9 font-bold uppercase text-green bg-green-chip-10 ring-1 ring-green-30 px-3 py-1.5 rounded-full">● Pipeline activo</span>
            )}
            <button onClick={loadPipeline} className="p-2 rounded-full bg-white/[0.05] ring-1 ring-white/10 active:scale-90 transition-transform">
              <RefreshCw size={15} className={pipelineStatus === "loading" ? "animate-spin text-green" : "text-white/50"} />
            </button>
          </div>
        </div>
      </div>

      {pipelineStatus === "no-url" && (
        <div className="px-6 pt-4">
          <div className="rounded-xl bg-white-02 ring-1 ring-white/5 px-4 py-3 flex items-start gap-2.5">
            <Info size={15} className="text-white/30 mt-0.5 shrink-0" />
            <p className="text-sm text-white/35 leading-relaxed">Pipeline no configurado — edita <code className="text-white/50">DATA_JSON_URL</code>. Selección manual disponible abajo.</p>
          </div>
        </div>
      )}
      {pipelineStatus === "error" && (
        <div className="px-6 pt-4">
          <div className="rounded-xl bg-red-chip-10 ring-1 ring-red-30 px-4 py-3 flex items-start gap-2.5">
            <AlertCircle size={15} className="text-red mt-0.5 shrink-0" />
            <p className="text-sm text-white/50 leading-relaxed">No se pudo leer el pipeline. Usando respaldo.<br/><span className="text-red font-mono fs-9">Detalle: {pipelineErrorMsg}</span></p>
          </div>
        </div>
      )}
      {pipelineStatus === "ok" && availableDates.length > 0 && (
        <div className="px-6 pt-4 flex items-center gap-3 flex-wrap">
          <div className="flex gap-2">
            {availableDates.map((d, i) => {
              const dt = new Date(d + "T12:00:00");
              const label = i === 0 ? "Hoy" : i === 1 ? "Mañana" : dt.toLocaleDateString([], { weekday: "short", day: "numeric" });
              const count = autoGames.filter(g => g.dateStr === d).length;
              const active = selectedDate === d;
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`font-display fs-10 font-bold px-3.5 py-2 rounded-full transition-all ${active ? "text-green bg-green-chip-10 ring-1 ring-green-30" : "text-white/40 bg-white-02 ring-1 ring-white/10"}`}
                >
                  {label} · {count}
                </button>
              );
            })}
          </div>
          {gamesForSelectedDate.length > 0 && calendarLoadedId !== selectedDate && (
            <button onClick={() => loadCalendarForDate(selectedDate)} className="font-display fs-10 font-bold text-amber-300 bg-amber-400/10 ring-1 ring-amber-400/30 px-4 py-2 rounded-full">
              Cargar estos {gamesForSelectedDate.length} juegos
            </button>
          )}
        </div>
      )}

      <div className="px-6 py-5 layout-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "24px", alignItems: "start" }}>
        <div className="sidebar-col space-y-4" style={{ position: "sticky", top: "88px" }}>
          <div className="rounded-xl bg-card ring-1 ring-white-06 p-4">
            <div className="flex items-center justify-between">
              <span className="fs-10 uppercase tracking-wider text-white/40 font-semibold">Bankroll</span>
              <div className="flex items-center gap-1">
                <span className="text-sm font-mono text-white/40">$</span>
                <input type="text" inputMode="numeric" value={bankroll} onChange={(e) => setBankroll(e.target.value.replace(/[^0-9]/g, ""))} className="w-20 bg-input ring-1 ring-white/10 focus-ring-green rounded px-2 py-1 text-right font-mono text-sm text-brand" />
              </div>
            </div>
          </div>

          <PickOfDay matchups={matchups} oddsMap={oddsMap} bankroll={bankroll} />
          <BetLogPanel entries={betLog} setEntries={setBetLog} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="font-display text-base font-bold tracking-wide text-white/50">PARTIDOS</span>
            <span className="text-sm text-white/30">{matchups.filter(m => m.home && m.away).length} cargados</span>
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {matchups.map((m) => (
              <MatchupCardCompact
                key={m.id}
                matchup={m}
                odds={oddsMap[m.id] || {}}
                onOpen={() => setOpenId(m.id)}
                onRemove={() => removeMatchup(m.id)}
                teams={teams}
                setMatchup={(patch) => updateMatchup(m.id, patch)}
              />
            ))}
            <button onClick={addMatchup} className="rounded-xl ring-1 ring-dashed ring-white/15 text-white/40 text-sm font-semibold py-8 active:bg-white/[0.02]">
              + Agregar cruce
            </button>
          </div>

          <p className="fs-9 text-white/20 text-center pt-6 leading-relaxed">
            {pipelineStatus === "ok" ? "Datos generados automáticamente por GitHub Actions." : "Elo de respaldo — editable."}<br/>
            Herramienta de análisis, no garantiza resultados.
          </p>
        </div>
      </div>

      {openMatchup && (
        <MatchupDetailPanel
          matchup={openMatchup}
          setMatchup={(patch) => updateMatchup(openMatchup.id, patch)}
          odds={oddsMap[openMatchup.id] || {}}
          setOdds={(o) => setOddsForMatchup(openMatchup.id, o)}
          onClose={() => setOpenId(null)}
          bankroll={bankroll}
          onAddToLog={handleAddToLog}
        />
      )}
    </div>
  );
}
