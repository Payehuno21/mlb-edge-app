import { useState, useMemo, useEffect, useCallback } from "react";
import { Flame, RefreshCw, ChevronDown, ChevronUp, Zap, Target, AlertCircle, Trophy, Info, ClipboardPaste, Pencil, Database, CheckCircle2 } from "lucide-react";

// ---------------------------------------------------------------------------
// MLB EDGE — v3: pipeline autónomo vía GitHub Actions.
// Un script Python corre solo cada día en GitHub Actions, jala MLB Stats API
// (calendario, abridores, equipos, top bateadores) y publica data.json en
// el repo. Esta app lee ese JSON directo (raw.githubusercontent.com sí
// permite CORS), sin proxies inestables y sin que el usuario meta nada
// manualmente salvo los momios.
//
// CONFIGURACIÓN ÚNICA REQUERIDA: pega aquí la URL raw de tu data.json
// después de crear el repo en GitHub. Ejemplo:
// "https://raw.githubusercontent.com/tuusuario/mlb-edge-data/main/data.json"
// ---------------------------------------------------------------------------
const DATA_JSON_URL = "https://raw.githubusercontent.com/Payehuno21/mlb-edge-data/main/data.json"; // ← pega aquí tu URL una sola vez

const TEAM_COLORS = {
  ARI:"#A71930", ATL:"#13274F", BAL:"#DF4601", BOS:"#BD3039", CHC:"#0E3386",
  CWS:"#27251F", CIN:"#C6011F", CLE:"#00385D", COL:"#33006F", DET:"#0C2340",
  HOU:"#EB6E1F", KC:"#004687", LAA:"#BA0021", LAD:"#005A9C", MIA:"#00A3E0",
  MIL:"#12284B", MIN:"#002B5C", NYM:"#FF5910", NYY:"#0C2340", OAK:"#003831",
  ATH:"#003831", PHI:"#E81828", PIT:"#FDB827", SD:"#2F241D", SF:"#FD5A1E",
  SEA:"#0C2C56", STL:"#C41E3A", TB:"#8FBCE6", TEX:"#003278", TOR:"#134A8E",
  WSH:"#AB0003"
};

// Fallback estático — se usa SOLO si DATA_JSON_URL está vacío o el fetch falla.
// Derivado de standings MLB.com al 1-jun-2026, por si necesitas la app antes
// de terminar el setup de GitHub Actions.
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
// FETCH del pipeline autónomo (GitHub Actions → data.json)
// ---------------------------------------------------------------------------
async function fetchPipelineData(url) {
  if (!url) return null;
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (networkErr) {
    // Esto captura fallos de red/CORS/DNS — fetch nunca llega a responder.
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
    id: t.id,
    abbr: t.abbr,
    name: t.name,
    winPct: t.winPct,
    homeWinPct: t.homeWinPct,
    awayWinPct: t.awayWinPct,
    last10: t.last10,
    elo: t.elo,
    runsPerGame: t.runsPerGame,
    staffEra: t.staffEra,
    topPowerHitter: t.topPowerHitter,
    topContactHitter: t.topContactHitter,
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
      home,
      away,
      homeStarterAuto: g.homeStarter,
      awayStarterAuto: g.awayStarter,
    };
  }).filter(Boolean);
}


function fmtOdds(n) {
  if (n === "" || n === null || n === undefined) return "";
  const v = Number(n);
  if (Number.isNaN(v)) return n;
  return v > 0 ? `+${v}` : `${v}`;
}

function impliedProb(american) {
  const a = Number(american);
  if (Number.isNaN(a) || a === 0) return null;
  if (a > 0) return 100 / (a + 100);
  return -a / (-a + 100);
}

function americanToDecimal(american) {
  const a = Number(american);
  if (Number.isNaN(a) || a === 0) return null;
  return a > 0 ? 1 + a / 100 : 1 + 100 / -a;
}

function edgePct(modelProb, american) {
  const imp = impliedProb(american);
  if (imp === null || modelProb === null) return null;
  return (modelProb - imp) * 100;
}

function edgeTier(edge) {
  if (edge === null || edge === undefined || Number.isNaN(edge)) return null;
  if (edge >= 6) return { label: "BET", color: "#39FF7A", glow: true };
  if (edge >= 2.5) return { label: "LEAN", color: "#FFB319", glow: false };
  if (edge > -2.5) return { label: "PASS", color: "#6B7280", glow: false };
  return { label: "FADE", color: "#FF4655", glow: false };
}

function kellyFraction(modelProb, american, fractionalMultiplier = 0.25) {
  const dec = americanToDecimal(american);
  if (dec === null || modelProb === null) return null;
  const b = dec - 1;
  const p = modelProb;
  const q = 1 - p;
  const fullKelly = (b * p - q) / b;
  if (fullKelly <= 0) return 0;
  return fullKelly * fractionalMultiplier;
}

// ---------------------------------------------------------------------------
// BITÁCORA — registro de apuestas reales en localStorage del navegador.
// Solo entran aquí las apuestas que el usuario marca explícitamente con
// el botón "Apostar"; el modelo nunca registra nada por su cuenta.
// ---------------------------------------------------------------------------
const LOG_STORAGE_KEY = "mlbEdgeBetLog_v1";

function loadBetLog() {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBetLog(entries) {
  try {
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error("No se pudo guardar la bitácora en localStorage:", e);
  }
}

function profitForEntry(entry) {
  // Ganancia neta en $ si la apuesta resultó ganada; pérdida = -stake si perdida.
  if (entry.result === "pending" || !entry.result) return 0;
  if (entry.result === "lost") return -Number(entry.stake || 0);
  if (entry.result === "push") return 0;
  // won
  const dec = americanToDecimal(entry.odds);
  if (!dec) return 0;
  return Number(entry.stake || 0) * (dec - 1);
}

function summarizeLog(entries) {
  const settled = entries.filter(e => e.result === "won" || e.result === "lost" || e.result === "push");
  const totalStaked = settled.reduce((sum, e) => sum + Number(e.stake || 0), 0);
  const totalProfit = settled.reduce((sum, e) => sum + profitForEntry(e), 0);
  const wins = settled.filter(e => e.result === "won").length;
  const losses = settled.filter(e => e.result === "lost").length;
  const decided = wins + losses;
  return {
    totalBets: entries.length,
    pending: entries.filter(e => e.result === "pending" || !e.result).length,
    settled: settled.length,
    wins,
    losses,
    winRate: decided > 0 ? (wins / decided) * 100 : null,
    totalStaked,
    totalProfit,
    roi: totalStaked > 0 ? (totalProfit / totalStaked) * 100 : null,
  };
}

function eloWinProb(diff) {
  return 1 / (1 + Math.pow(10, -diff / 400));
}

// Props calculadas con datos reales del pipeline (HR/PA y AVG de temporada).
// Devuelve null si el matchup no trae datos de bateadores (ej. modo manual).
function suggestPropsFromPipeline(matchup) {
  const { home, away } = matchup;
  const props = [];

  if (home?.topPowerHitter?.hrRate != null) {
    const gameProb = 1 - Math.pow(1 - home.topPowerHitter.hrRate, 4.2);
    props.push({
      type: "HR",
      player: home.topPowerHitter.name,
      note: `${(home.topPowerHitter.hrRate * 100).toFixed(1)}% HR/turno esta temporada (${home.abbr})`,
      confidence: Math.min(gameProb * 100, 38),
    });
  }
  if (away?.topContactHitter?.avg != null) {
    const gameProb = 1 - Math.pow(1 - away.topContactHitter.avg, 4.0);
    props.push({
      type: "1+ Hit",
      player: away.topContactHitter.name,
      note: `AVG temporada ${away.topContactHitter.avg.toFixed(3)} (${away.abbr})`,
      confidence: Math.min(gameProb * 100, 88),
    });
  }
  const homeK9 = matchup.homeStarterAuto?.k9;
  const awayK9 = matchup.awayStarterAuto?.k9;
  if (homeK9 || awayK9) {
    const bestSP = (homeK9 ?? 0) >= (awayK9 ?? 0) ? matchup.homeStarterAuto : matchup.awayStarterAuto;
    if (bestSP?.k9) {
      const expectedIp = 5.7;
      const expectedK = (bestSP.k9 / 9) * expectedIp;
      props.push({
        type: "Ponches (K)",
        player: bestSP.name,
        note: `K/9 temporada: ${bestSP.k9.toFixed(1)} · IP esperadas ~${expectedIp}`,
        confidence: Math.min(bestSP.k9 * 6.2, 70),
        line: Math.round(expectedK * 2) / 2 - 0.5,
      });
    }
  }
  return props.slice(0, 3);
}

// ---------------------------------------------------------------------------
// MODELO — sin abridor numérico (solo Elo + splits + forma reciente, editables)
// ---------------------------------------------------------------------------
function buildModel(matchup) {
  const { home, away } = matchup;

  let diff = (home.elo + 24) - away.elo; // 24 = home field advantage en pts Elo

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
  const homeMinus1_5 = 1 / (1 + Math.exp(-(expectedMargin - 1.5) * 1.15));
  const awayPlus1_5 = 1 - homeMinus1_5;

  return {
    homeWinProb,
    awayWinProb: 1 - homeWinProb,
    projectedTotal: Math.round(projectedTotal * 10) / 10,
    homeMinus1_5,
    awayPlus1_5,
    eloDiff: diff,
  };
}

// ---------------------------------------------------------------------------
// UI Helpers
// ---------------------------------------------------------------------------
function EdgeMeter({ value }) {
  const clamped = Math.max(-25, Math.min(25, value ?? 0));
  const pct = ((clamped + 25) / 50) * 100;
  const positive = (value ?? 0) >= 0;
  return (
    <div className="w-full">
      <div className="h-2.5 w-full rounded-full bg-meter-track overflow-hidden relative ring-1 ring-white/5">
        <div className="absolute left-1/2 top-0 h-full w-px bg-white/15" />
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${Math.abs(pct - 50)}%`,
            marginLeft: pct >= 50 ? "50%" : `${pct}%`,
            background: positive
              ? "linear-gradient(90deg, #1FCC65, #39FF7A)"
              : "linear-gradient(90deg, #FF4655, #FF8A93)",
            boxShadow: positive ? "0 0 10px #39FF7A66" : "0 0 10px #FF465566",
          }}
        />
      </div>
    </div>
  );
}

function TierChip({ edge }) {
  const tier = edgeTier(edge);
  if (!tier) return null;
  return (
    <span
      className="fs-85 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
      style={{ color: tier.color, background: `${tier.color}1A`, boxShadow: tier.glow ? `0 0 8px ${tier.color}55` : "none" }}
    >
      {tier.label}
    </span>
  );
}

function OddsInput({ value, onChange, placeholder, wide }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${wide ? "w-20" : "w-72px"} bg-input ring-1 ring-white/10 focus-ring-green rounded-md px-2 py-1.5 text-center font-mono text-sm text-brand placeholder:text-white/20 transition-all`}
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
        <option value="">Selecciona equipo…</option>
        {teams.filter(t => t.abbr !== exclude).map(t => (
          <option key={t.abbr} value={t.abbr}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}

function BetRow({ label, prob, oddsValue, edge, onOddsChange, placeholder, bankroll, labelWidth = "w-9", onLog, logContext }) {
  const kelly = oddsValue ? kellyFraction(prob, oddsValue) : null;
  const stake = kelly && kelly > 0 && bankroll ? kelly * Number(bankroll) : null;
  const canLog = onLog && oddsValue;
  return (
    <div className="flex items-center gap-2.5">
      <span className={`text-xs font-bold ${labelWidth} text-brand shrink-0`}>{label}</span>
      <span className="fs-10 font-mono text-white/40 w-9 shrink-0">{(prob * 100).toFixed(0)}%</span>
      <OddsInput value={oddsValue} onChange={onOddsChange} placeholder={placeholder} />
      <div className="flex-1 minw-40px"><EdgeMeter value={edge} /></div>
      <div className="flex flex-col items-end shrink-0 w-14">
        <span className={`fs-11 font-mono font-bold ${edge > 0 ? "text-green" : edge < 0 ? "text-red" : "text-white/30"}`}>
          {edge !== null && edge !== undefined && !Number.isNaN(edge) ? `${edge > 0 ? "+" : ""}${edge.toFixed(1)}%` : "—"}
        </span>
        <TierChip edge={edge} />
      </div>
      {stake !== null && stake > 0 && (
        <span className="fs-9 font-mono text-amber-300/80 w-12 text-right shrink-0">${stake.toFixed(0)}</span>
      )}
      {canLog && (
        <button
          onClick={() => onLog({ ...logContext, label, prob, odds: oddsValue, edge, stake: stake ?? 0 })}
          title="Agregar a la bitácora"
          className="shrink-0 w-6 h-6 rounded-full bg-green-chip-10 ring-1 ring-green-30 text-green text-sm font-bold flex items-center justify-center active:scale-90 transition-transform"
        >
          +
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROPS PANEL — sin datos automáticos. El usuario pega lo que Claude le pasó
// por chat (búsqueda de proyecciones públicas) en un formato simple por línea:
// Nombre Jugador | TIPO | confianza%  (ej: "Aaron Judge | HR | 28")
// ---------------------------------------------------------------------------
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

function PropsPanel({ value, onChange, autoProps, onLog, logContext, bankroll }) {
  const [editing, setEditing] = useState(false);
  const [propOdds, setPropOdds] = useState({});
  const parsedManual = useMemo(() => parsePropsText(value), [value]);
  const hasAuto = autoProps && autoProps.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="fs-10 uppercase tracking-wider text-white/35 font-semibold flex items-center gap-1.5"><Flame size={11}/> Props sugeridas {hasAuto && <CheckCircle2 size={11} className="text-green" />}</p>
        {!hasAuto && (
          <button onClick={() => setEditing(!editing)} className="flex items-center gap-1 fs-9 text-white/40 font-semibold uppercase tracking-wide">
            <Pencil size={10} /> {editing ? "listo" : "pegar datos"}
          </button>
        )}
      </div>

      {hasAuto ? (
        <div className="grid gap-2">
          {autoProps.map((p, i) => {
            const oddsVal = propOdds[i] ?? "";
            const stake = oddsVal && bankroll ? (kellyFraction(p.confidence / 100, oddsVal) ?? 0) * Number(bankroll) : null;
            return (
              <div key={i} className="rounded-lg bg-white-025 ring-1 ring-white/5 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-brand truncate">{p.player} <span className="text-white/40 font-normal">· {p.type}{p.line ? ` ${p.line}+` : ""}</span></p>
                  <span className="fs-10 font-mono text-amber-300 shrink-0 ml-2">{p.confidence.toFixed(0)}%</span>
                </div>
                {onLog && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <OddsInput value={oddsVal} onChange={(v) => setPropOdds({ ...propOdds, [i]: v })} placeholder="-110" />
                    {stake !== null && stake > 0 && <span className="fs-9 font-mono text-amber-300/80">${stake.toFixed(0)}</span>}
                    {oddsVal && (
                      <button
                        onClick={() => onLog({ ...logContext, market: "Prop", label: `${p.player} · ${p.type}${p.line ? ` ${p.line}+` : ""}`, prob: p.confidence / 100, odds: oddsVal, edge: null, stake: stake ?? 0 })}
                        className="shrink-0 w-6 h-6 rounded-full bg-green-chip-10 ring-1 ring-green-30 text-green text-sm font-bold flex items-center justify-center active:scale-90 transition-transform ml-auto"
                      >
                        +
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <p className="fs-85 text-white/25 mt-0.5">Calculado con stats reales de temporada (pipeline automático)</p>
        </div>
      ) : editing ? (
        <div>
          <textarea
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={"Pega aquí lo que te paso por chat, una línea por prop:\nAaron Judge | HR | 28\nGunnar Henderson | 1+ Hit | 62"}
            rows={4}
            className="w-full bg-input ring-1 ring-white/10 focus-ring-green rounded-lg px-3 py-2 text-xs font-mono text-brand placeholder:text-white/20"
          />
          <p className="fs-9 text-white/25 mt-1.5 flex items-center gap-1"><ClipboardPaste size={10}/> Formato: Jugador | Tipo | Confianza% (una por línea)</p>
        </div>
      ) : parsedManual.length > 0 ? (
        <div className="grid gap-2">
          {parsedManual.map((p, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-white-025 ring-1 ring-white/5 px-3 py-2">
              <p className="text-xs font-bold text-brand truncate">{p.player} <span className="text-white/40 font-normal">· {p.type}</span></p>
              {p.confidence !== null && !Number.isNaN(p.confidence) && (
                <span className="fs-10 font-mono text-amber-300 shrink-0 ml-2">{p.confidence}%</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-white-02 ring-1 ring-white/5 px-3 py-3 flex items-start gap-2">
          <Info size={13} className="text-white/30 mt-0.5 shrink-0" />
          <p className="fs-10 text-white/35 leading-relaxed">Sin datos automáticos para este cruce todavía. Pídele a Claude en el chat: "dame props de hoy para [equipo] vs [equipo]" y pega el resultado con "pegar datos".</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MATCHUP CARD — selección manual de cruce + abridores (texto) + momios
// ---------------------------------------------------------------------------
function MatchupCard({ matchup, setMatchup, odds, setOdds, expanded, onToggle, bankroll, onRemove, teams, onAddToLog }) {
  const ready = matchup.home && matchup.away;
  const model = ready ? buildModel(matchup) : null;
  const autoProps = ready ? suggestPropsFromPipeline(matchup) : [];
  const matchupLabel = ready ? `${matchup.away.abbr} @ ${matchup.home.abbr}` : "";

  const mlHomeEdge = model ? edgePct(model.homeWinProb, odds.mlHome) : null;
  const mlAwayEdge = model ? edgePct(model.awayWinProb, odds.mlAway) : null;
  const totalDiff = model && odds.totalLine !== "" && odds.totalLine !== undefined ? model.projectedTotal - Number(odds.totalLine) : null;
  const overProb = totalDiff !== null ? 0.5 + Math.min(Math.max(totalDiff, 0) * 0.09, 0.30) : null;
  const underProb = totalDiff !== null ? 0.5 + Math.min(Math.max(-totalDiff, 0) * 0.09, 0.30) : null;
  const overEdge = overProb !== null ? edgePct(overProb, odds.over) : null;
  const underEdge = underProb !== null ? edgePct(underProb, odds.under) : null;
  const rlHomeEdge = model ? edgePct(model.homeMinus1_5, odds.rlHome) : null;
  const rlAwayEdge = model ? edgePct(model.awayPlus1_5, odds.rlAway) : null;

  const allEdges = model ? [
    mlHomeEdge, mlAwayEdge, overEdge, underEdge, rlHomeEdge, rlAwayEdge,
  ].filter(e => e !== null && !Number.isNaN(e)) : [];
  const bestEdge = allEdges.length ? Math.max(...allEdges) : null;

  return (
    <div className="rounded-2xl bg-card ring-1 ring-white-06 overflow-hidden">
      {/* Selectors */}
      <div className="px-4 pt-4 pb-3 flex gap-2 items-end">
        <TeamSelect label="Visitante" value={matchup.away} exclude={matchup.home?.abbr} onChange={(t) => setMatchup({ ...matchup, away: t })} teams={teams} />
        <span className="text-white/20 text-xs pb-2.5">@</span>
        <TeamSelect label="Local" value={matchup.home} exclude={matchup.away?.abbr} onChange={(t) => setMatchup({ ...matchup, home: t })} teams={teams} />
        <button onClick={onRemove} className="text-white/25 fs-10 pb-2.5 px-1 shrink-0">✕</button>
      </div>

      {!ready ? (
        <div className="px-4 pb-4">
          <p className="fs-10 text-white/30">Selecciona ambos equipos para activar el análisis.</p>
        </div>
      ) : (
        <>
          <button onClick={onToggle} className="w-full flex items-center justify-between px-4 pb-3 active:bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: TEAM_COLORS[matchup.away.abbr] }} />
              <span className="font-bold text-sm text-brand">{(model.awayWinProb * 100).toFixed(0)}% — {(model.homeWinProb * 100).toFixed(0)}%</span>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: TEAM_COLORS[matchup.home.abbr] }} />
              <span className="fs-11 text-white/30 font-mono">Total proy. {model.projectedTotal.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2">
              {bestEdge !== null && bestEdge > 3 && (
                <span className="flex items-center gap-1 fs-10 font-bold text-green bg-green-chip-10 ring-1 ring-green-30 px-2 py-0.5 rounded-full">
                  <Zap size={10} /> {bestEdge.toFixed(1)}%
                </span>
              )}
              {expanded ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
            </div>
          </button>

          {expanded && (
            <div className="border-t border-white-04 px-4 py-4 space-y-5 bg-black/10">
              {/* Abridores — autocompletados por el pipeline si hay datos; editable siempre */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "awayStarter", autoKey: "awayStarterAuto", lab: `Abridor ${matchup.away.abbr}` },
                  { key: "homeStarter", autoKey: "homeStarterAuto", lab: `Abridor ${matchup.home.abbr}` },
                ].map((x) => {
                  const auto = matchup[x.autoKey];
                  return (
                    <div key={x.key} className="rounded-xl bg-white-02 ring-1 ring-white/5 p-3">
                      <p className="fs-9 uppercase tracking-wider text-white/35 font-semibold mb-1 flex items-center gap-1">
                        {x.lab} {auto?.name && <CheckCircle2 size={10} className="text-green" />}
                      </p>
                      <input
                        type="text"
                        value={matchup[x.key] ?? auto?.name ?? ""}
                        onChange={(e) => setMatchup({ ...matchup, [x.key]: e.target.value })}
                        placeholder="Nombre del abridor"
                        className="w-full bg-transparent outline-none text-sm font-bold text-brand placeholder:text-white/20"
                      />
                      {auto?.era != null ? (
                        <div className="flex gap-2 mt-1 fs-9 font-mono text-white/40">
                          <span>ERA {auto.era}</span><span>WHIP {auto.whip ?? "—"}</span><span>K/9 {auto.k9 ?? "—"}</span>
                        </div>
                      ) : (
                        <p className="fs-85 text-white/25 mt-1">Informativo · no se usa en el cálculo de ML/RL/Total</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Elo editable */}
              <div className="grid grid-cols-2 gap-3">
                {[{ key: "away", t: matchup.away }, { key: "home", t: matchup.home }].map((x) => (
                  <div key={x.key} className="flex items-center justify-between rounded-lg bg-white-02 ring-1 ring-white/5 px-3 py-2">
                    <span className="fs-10 text-white/40 font-semibold">{x.t.abbr} Elo</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={matchup[`${x.key}EloOverride`] ?? x.t.elo}
                      onChange={(e) => setMatchup({ ...matchup, [`${x.key}EloOverride`]: e.target.value, [x.key]: { ...x.t, elo: Number(e.target.value) || x.t.elo } })}
                      className="w-14 bg-transparent outline-none text-right font-mono text-xs text-green"
                    />
                  </div>
                ))}
              </div>

              {/* ML */}
              <div>
                <p className="fs-10 uppercase tracking-wider text-white/35 font-semibold mb-2 flex items-center gap-1.5"><Target size={11}/> Moneyline</p>
                <div className="space-y-2.5">
                  <BetRow label={matchup.away.abbr} prob={model.awayWinProb} oddsValue={odds.mlAway} edge={mlAwayEdge} onOddsChange={(v) => setOdds({ ...odds, mlAway: v })} placeholder="-110" bankroll={bankroll} onLog={onAddToLog} logContext={{ matchup: matchupLabel, market: "Moneyline" }} />
                  <BetRow label={matchup.home.abbr} prob={model.homeWinProb} oddsValue={odds.mlHome} edge={mlHomeEdge} onOddsChange={(v) => setOdds({ ...odds, mlHome: v })} placeholder="-110" bankroll={bankroll} onLog={onAddToLog} logContext={{ matchup: matchupLabel, market: "Moneyline" }} />
                </div>
              </div>

              {/* Run line */}
              <div>
                <p className="fs-10 uppercase tracking-wider text-white/35 font-semibold mb-2">Run Line (±1.5)</p>
                <div className="space-y-2.5">
                  <BetRow label={`${matchup.home.abbr} -1.5`} labelWidth="w-16" prob={model.homeMinus1_5} oddsValue={odds.rlHome} edge={rlHomeEdge} onOddsChange={(v) => setOdds({ ...odds, rlHome: v })} placeholder="-110" bankroll={bankroll} onLog={onAddToLog} logContext={{ matchup: matchupLabel, market: "Run Line" }} />
                  <BetRow label={`${matchup.away.abbr} +1.5`} labelWidth="w-16" prob={model.awayPlus1_5} oddsValue={odds.rlAway} edge={rlAwayEdge} onOddsChange={(v) => setOdds({ ...odds, rlAway: v })} placeholder="-110" bankroll={bankroll} onLog={onAddToLog} logContext={{ matchup: matchupLabel, market: "Run Line" }} />
                </div>
              </div>

              {/* Total O/U */}
              <div>
                <p className="fs-10 uppercase tracking-wider text-white/35 font-semibold mb-2">Total (O/U) — Proyección modelo: <span className="text-brand font-mono">{model.projectedTotal.toFixed(1)}</span></p>
                <div className="flex items-center gap-3 mb-2.5">
                  <span className="text-xs font-bold w-9 text-brand">Línea</span>
                  <OddsInput value={odds.totalLine} onChange={(v) => setOdds({ ...odds, totalLine: v })} placeholder="8.5" />
                </div>
                <div className="space-y-2.5">
                  <BetRow label="Over" labelWidth="w-12" prob={overProb ?? 0.5} oddsValue={odds.over} edge={overEdge} onOddsChange={(v) => setOdds({ ...odds, over: v })} placeholder="-110" bankroll={bankroll} onLog={onAddToLog} logContext={{ matchup: matchupLabel, market: `Total ${odds.totalLine || ""}` }} />
                  <BetRow label="Under" labelWidth="w-12" prob={underProb ?? 0.5} oddsValue={odds.under} edge={underEdge} onOddsChange={(v) => setOdds({ ...odds, under: v })} placeholder="-110" bankroll={bankroll} onLog={onAddToLog} logContext={{ matchup: matchupLabel, market: `Total ${odds.totalLine || ""}` }} />
                </div>
              </div>

              <PropsPanel value={matchup.propsText} onChange={(v) => setMatchup({ ...matchup, propsText: v })} autoProps={autoProps} onLog={onAddToLog} logContext={{ matchup: matchupLabel }} bankroll={bankroll} />

              <p className="fs-9 text-white/25 leading-relaxed pt-1 border-t border-white-04">
                Modelo: Elo de equipo (editable) + splits local/visitante + forma reciente. Sin fetch en vivo — todo corre localmente. Tier BET ≥6% edge, LEAN ≥2.5%, PASS resto, FADE &lt;-2.5%. Monto sugerido = ¼ Kelly. Esto es análisis estadístico, no garantía de resultado.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PICK OF DAY
// ---------------------------------------------------------------------------
function PickOfDay({ matchups, oddsMap, bankroll }) {
  const best = useMemo(() => {
    let top = null;
    for (const m of matchups) {
      if (!m.home || !m.away) continue;
      const model = buildModel(m);
      const odds = oddsMap[m.id] || {};
      const candidates = [
        { label: `ML ${m.home.abbr}`, prob: model.homeWinProb, odd: odds.mlHome, matchup: `${m.away.abbr} @ ${m.home.abbr}` },
        { label: `ML ${m.away.abbr}`, prob: model.awayWinProb, odd: odds.mlAway, matchup: `${m.away.abbr} @ ${m.home.abbr}` },
        { label: `RL ${m.home.abbr} -1.5`, prob: model.homeMinus1_5, odd: odds.rlHome, matchup: `${m.away.abbr} @ ${m.home.abbr}` },
        { label: `RL ${m.away.abbr} +1.5`, prob: model.awayPlus1_5, odd: odds.rlAway, matchup: `${m.away.abbr} @ ${m.home.abbr}` },
      ];
      for (const c of candidates) {
        if (!c.odd) continue;
        const e = edgePct(c.prob, c.odd);
        if (e === null) continue;
        if (!top || e > top.edge) top = { ...c, edge: e };
      }
    }
    return top;
  }, [matchups, oddsMap]);

  if (!best) {
    return (
      <div className="rounded-2xl bg-white-02 ring-1 ring-white/5 px-4 py-5 flex items-center gap-3">
        <AlertCircle size={18} className="text-white/30 shrink-0" />
        <p className="text-xs text-white/40 leading-relaxed">Selecciona un cruce e ingresa momios para que el pick del día aparezca aquí.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl relative overflow-hidden ring-1 ring-amber-400/30 px-5 py-5" style={{ background: "linear-gradient(135deg, #1A1409, #0F0D08)" }}>
      <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-amber-400/10 blur-2xl" />
      <div className="flex items-center gap-2 mb-2">
        <Trophy size={14} className="text-amber-300" />
        <span className="fs-10 uppercase tracking-widest font-bold text-amber-300/90">Pick del día</span>
      </div>
      <p className="text-lg font-extrabold text-brand leading-tight">{best.label}</p>
      <p className="text-xs text-white/40 mt-0.5">{best.matchup} · momio {fmtOdds(best.odd)}</p>
      <div className="flex items-center gap-3 mt-3">
        <span className="text-2xl font-mono font-bold text-amber-300">+{best.edge.toFixed(1)}%</span>
        <TierChip edge={best.edge} />
      </div>
      {(() => {
        const k = kellyFraction(best.prob, best.odd);
        const stake = k && k > 0 && bankroll ? k * Number(bankroll) : null;
        return stake ? (
          <p className="fs-10 text-white/35 mt-2">Sugerencia ¼ Kelly: <span className="text-amber-200 font-mono">${stake.toFixed(0)}</span> sobre bankroll de ${Number(bankroll).toLocaleString()}</p>
        ) : (
          <p className="fs-10 text-white/35 mt-2">edge sobre línea ingresada</p>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// BET LOG PANEL — bitácora con resumen de balance y lista de apuestas
// ---------------------------------------------------------------------------
function ResultButton({ active, color, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="fs-9 font-bold uppercase tracking-wide px-2 py-1 rounded-md transition-all"
      style={{
        color: active ? "#0A0E12" : color,
        background: active ? color : `${color}1A`,
        boxShadow: active ? "none" : `0 0 0 1px ${color}4D inset`,
      }}
    >
      {children}
    </button>
  );
}

function BetLogPanel({ entries, setEntries, open, onToggle }) {
  const summary = useMemo(() => summarizeLog(entries), [entries]);

  const updateEntry = (id, patch) => {
    setEntries((prev) => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };
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
      } catch {
        alert("Archivo inválido — debe ser un JSON exportado desde esta misma app.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="rounded-2xl bg-card ring-1 ring-white-06 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3.5 active:bg-white/[0.02]">
        <div className="flex items-center gap-2.5">
          <Trophy size={14} className="text-amber-300" />
          <span className="text-sm font-bold text-brand">Bitácora</span>
          <span className="fs-9 text-white/30 font-mono">{summary.totalBets} registradas</span>
        </div>
        {open ? <ChevronUp size={16} className="text-white/40" /> : <ChevronDown size={16} className="text-white/40" />}
      </button>

      {open && (
        <div className="border-t border-white-04 px-4 py-4 space-y-4 bg-black/10">
          {/* Resumen */}
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg bg-white-02 ring-1 ring-white/5 px-2 py-2 text-center">
              <p className="fs-8 text-white/35 uppercase tracking-wide">Apostado</p>
              <p className="text-xs font-mono font-bold text-brand mt-0.5">${summary.totalStaked.toFixed(0)}</p>
            </div>
            <div className="rounded-lg bg-white-02 ring-1 ring-white/5 px-2 py-2 text-center">
              <p className="fs-8 text-white/35 uppercase tracking-wide">Balance</p>
              <p className={`text-xs font-mono font-bold mt-0.5 ${summary.totalProfit > 0 ? "text-green" : summary.totalProfit < 0 ? "text-red" : "text-brand"}`}>
                {summary.totalProfit > 0 ? "+" : ""}${summary.totalProfit.toFixed(0)}
              </p>
            </div>
            <div className="rounded-lg bg-white-02 ring-1 ring-white/5 px-2 py-2 text-center">
              <p className="fs-8 text-white/35 uppercase tracking-wide">ROI</p>
              <p className={`text-xs font-mono font-bold mt-0.5 ${summary.roi > 0 ? "text-green" : summary.roi < 0 ? "text-red" : "text-brand"}`}>
                {summary.roi !== null ? `${summary.roi > 0 ? "+" : ""}${summary.roi.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-white-02 ring-1 ring-white/5 px-2 py-2 text-center">
              <p className="fs-8 text-white/35 uppercase tracking-wide">Win rate</p>
              <p className="text-xs font-mono font-bold text-brand mt-0.5">{summary.winRate !== null ? `${summary.winRate.toFixed(0)}%` : "—"}</p>
            </div>
          </div>
          <p className="fs-8 text-white/25 text-center">{summary.wins}G - {summary.losses}P · {summary.pending} pendiente(s)</p>

          {/* Lista de apuestas */}
          {entries.length === 0 ? (
            <div className="rounded-lg bg-white-02 ring-1 ring-white/5 px-3 py-4 flex items-start gap-2">
              <Info size={13} className="text-white/30 mt-0.5 shrink-0" />
              <p className="fs-10 text-white/35 leading-relaxed">Todavía no hay apuestas registradas. Usa el botón <span className="text-green font-bold">+</span> junto a cualquier línea de momio para agregarla aquí.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...entries].reverse().map((entry) => (
                <div key={entry.id} className="rounded-lg bg-white-02 ring-1 ring-white/5 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-brand truncate">{entry.label}</p>
                      <p className="fs-9 text-white/40 truncate">{entry.matchup} · {entry.market} · momio {fmtOdds(entry.odds)}</p>
                      <p className="fs-9 text-white/30">Stake ${Number(entry.stake).toFixed(0)} · {entry.date}</p>
                    </div>
                    <button onClick={() => removeEntry(entry.id)} className="text-white/25 fs-10 shrink-0">✕</button>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <ResultButton active={entry.result === "pending" || !entry.result} color="#9CA3AF" onClick={() => updateEntry(entry.id, { result: "pending" })}>Pendiente</ResultButton>
                    <ResultButton active={entry.result === "won"} color="#39FF7A" onClick={() => updateEntry(entry.id, { result: "won" })}>Ganada</ResultButton>
                    <ResultButton active={entry.result === "lost"} color="#FF4655" onClick={() => updateEntry(entry.id, { result: "lost" })}>Perdida</ResultButton>
                    <ResultButton active={entry.result === "push"} color="#FFB319" onClick={() => updateEntry(entry.id, { result: "push" })}>Push</ResultButton>
                    {(entry.result === "won" || entry.result === "lost") && (
                      <span className={`fs-9 font-mono font-bold ml-auto ${profitForEntry(entry) >= 0 ? "text-green" : "text-red"}`}>
                        {profitForEntry(entry) >= 0 ? "+" : ""}${profitForEntry(entry).toFixed(0)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Export/Import */}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={exportLog} className="flex-1 fs-9 font-bold uppercase tracking-wide text-white/50 bg-white-02 ring-1 ring-white/10 rounded-lg py-2">
              Exportar respaldo
            </button>
            <label className="flex-1 fs-9 font-bold uppercase tracking-wide text-white/50 bg-white-02 ring-1 ring-white/10 rounded-lg py-2 text-center cursor-pointer">
              Importar
              <input type="file" accept="application/json" onChange={importLog} className="hidden" />
            </label>
          </div>
          <p className="fs-8 text-white/25 leading-relaxed">Se guarda automáticamente en este navegador (localStorage). Exporta seguido como respaldo — si limpias datos del navegador, se pierde lo no exportado.</p>
        </div>
      )}
    </div>
  );
}

let nextId = 1;

function emptyMatchup() {
  return { id: nextId++, home: null, away: null, homeStarter: "", awayStarter: "", propsText: "" };
}

export default function MLBEdge() {
  const [matchups, setMatchups] = useState([emptyMatchup()]);
  const [expandedId, setExpandedId] = useState(null);
  const [oddsMap, setOddsMap] = useState({});
  const [bankroll, setBankroll] = useState("1000");
  const [betLog, setBetLog] = useState(() => loadBetLog());
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => { saveBetLog(betLog); }, [betLog]);

  const handleAddToLog = useCallback((bet) => {
    const entry = {
      id: `${Date.now()}-${Math.round(Math.random() * 1000)}`,
      date: new Date().toLocaleDateString(),
      result: "pending",
      ...bet,
    };
    setBetLog((prev) => [...prev, entry]);
    setLogOpen(true);
  }, []);

  const [pipelineStatus, setPipelineStatus] = useState(DATA_JSON_URL ? "loading" : "no-url"); // loading | ok | error | no-url
  const [pipelineErrorMsg, setPipelineErrorMsg] = useState("");
  const [pipelineMeta, setPipelineMeta] = useState(null); // {generatedAt, date}
  const [teams, setTeams] = useState(TEAMS_FALLBACK);
  const [autoGames, setAutoGames] = useState([]);
  const [calendarLoadedId, setCalendarLoadedId] = useState(null);

  const loadPipeline = useCallback(async () => {
    if (!DATA_JSON_URL) {
      setPipelineStatus("no-url");
      return;
    }
    setPipelineStatus("loading");
    try {
      const payload = await fetchPipelineData(DATA_JSON_URL);
      const normTeams = normalizeTeamsFromPipeline(payload);
      if (!normTeams.length) throw new Error("El JSON no trae equipos.");
      const teamsById = Object.fromEntries(payload.teams.map(t => [t.id, normTeams.find(nt => nt.id === t.id)]));
      const normGames = normalizeGamesFromPipeline(payload, teamsById);
      setTeams(normTeams);
      setAutoGames(normGames);
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

  // Carga el calendario de hoy en una sola tarjeta por juego, una sola vez,
  // sin pisar cruces que el usuario ya esté editando manualmente.
  const loadTodaysCalendar = () => {
    if (!autoGames.length) return;
    const fromAuto = autoGames.map(g => ({
      ...emptyMatchup(),
      home: g.home,
      away: g.away,
      homeStarterAuto: g.homeStarterAuto,
      awayStarterAuto: g.awayStarterAuto,
      timeLabel: g.timeLabel,
    }));
    setMatchups(fromAuto);
    setCalendarLoadedId(pipelineMeta?.date ?? "loaded");
  };

  const updateMatchup = (id, patch) => {
    setMatchups((prev) => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  };
  const setOddsForMatchup = (id, odds) => setOddsMap((prev) => ({ ...prev, [id]: odds }));
  const addMatchup = () => setMatchups((prev) => [...prev, emptyMatchup()]);
  const removeMatchup = (id) => setMatchups((prev) => prev.filter(m => m.id !== id));

  return (
    <div className="mlb-edge-root" style={{ minHeight: "100vh", background: "#0A0E12", color: "#F2F2F0", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        .font-display { font-family: 'Oswald', sans-serif; }
        select option { background: #10141A; }

        .mlb-edge-root, .mlb-edge-root * { box-sizing: border-box; }

        .bg-app { background: #0A0E12; }
        .bg-card { background: #10141A; }
        .bg-input { background: #0F1318; }
        .bg-header { background: rgba(10,14,18,0.95); backdrop-filter: blur(8px); }
        .bg-green-soft { background: rgba(57,255,122,0.10); }
        .bg-green-chip { background: rgba(57,255,122,0.10); }
        .bg-red-soft { background: rgba(255,70,85,0.10); }
        .bg-amber-grad { background: linear-gradient(135deg, #1A1409, #0F0D08); }

        .text-brand { color: #F2F2F0; }
        .text-green { color: #39FF7A; }
        .text-red { color: #FF4655; }
        .text-amber { color: #FFB319; }

        .ring-card { box-shadow: 0 0 0 1px rgba(255,255,255,0.06) inset; }
        .ring-soft { box-shadow: 0 0 0 1px rgba(255,255,255,0.05) inset; }
        .ring-input { box-shadow: 0 0 0 1px rgba(255,255,255,0.10) inset; }
        .ring-input:focus { box-shadow: 0 0 0 2px rgba(57,255,122,0.6) inset; outline: none; }
        .ring-green { box-shadow: 0 0 0 1px rgba(57,255,122,0.3) inset; }
        .ring-red { box-shadow: 0 0 0 1px rgba(255,70,85,0.3) inset; }
        .ring-amber { box-shadow: 0 0 0 1px rgba(251,191,36,0.3) inset; }
        .bg-meter-track { background: #181D24; }
        .bg-green-chip-10 { background: rgba(57,255,122,0.10); }
        .bg-green-chip-06 { background: rgba(57,255,122,0.06); }
        .bg-red-chip-10 { background: rgba(255,70,85,0.10); }
        .ring-green-30 { box-shadow: 0 0 0 1px rgba(57,255,122,0.3) inset; }
        .ring-green-20 { box-shadow: 0 0 0 1px rgba(57,255,122,0.2) inset; }
        .ring-red-30 { box-shadow: 0 0 0 1px rgba(255,70,85,0.3) inset; }
        .focus-ring-green:focus { box-shadow: 0 0 0 2px rgba(57,255,122,0.6) inset; outline: none; }
        .bg-white-02 { background: rgba(255,255,255,0.02); }
        .bg-white-025 { background: rgba(255,255,255,0.025); }
        .bg-white-04 { background: rgba(255,255,255,0.04); }
        .border-white-04 { border-bottom: 1px solid rgba(255,255,255,0.04); }
        .border-top-white-04 { border-top: 1px solid rgba(255,255,255,0.04); }
        .ring-white-06 { box-shadow: 0 0 0 1px rgba(255,255,255,0.06) inset; }

        .fs-8 { font-size: 8px; }
        .fs-85 { font-size: 8.5px; }
        .fs-9 { font-size: 9px; }
        .fs-10 { font-size: 10px; }
        .fs-11 { font-size: 11px; }
        .w-72px { width: 72px; }
        .minw-40px { min-width: 40px; }
        .border-card { border-bottom: 1px solid rgba(255,255,255,0.06); }
      `}</style>

      <div className="bg-header" style={{ position: "sticky", top: 0, zIndex: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-wide uppercase leading-none">
                MLB <span className="text-green">EDGE</span>
              </h1>
              <p className="fs-10 text-white/35 mt-1 font-medium tracking-wide">Temporada 2026 · pipeline autónomo</p>
            </div>
            <button onClick={loadPipeline} className="p-2 rounded-full bg-white-04 ring-1 ring-white/10 active:scale-90 transition-transform">
              <RefreshCw size={15} className={pipelineStatus === "loading" ? "animate-spin text-green" : "text-white/50"} />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto pb-16">
        {/* Estado del pipeline */}
        {pipelineStatus === "no-url" && (
          <div className="rounded-2xl bg-white-02 ring-1 ring-white/5 px-4 py-3 flex items-start gap-2.5">
            <Database size={15} className="text-white/30 mt-0.5 shrink-0" />
            <p className="fs-10 text-white/35 leading-relaxed">Pipeline automático no configurado todavía. Edita <code className="text-white/50">DATA_JSON_URL</code> en el código con la URL de tu <code className="text-white/50">data.json</code> de GitHub. Mientras tanto, selecciona equipos manualmente abajo.</p>
          </div>
        )}
        {pipelineStatus === "error" && (
          <div className="rounded-2xl bg-red-chip-10 ring-1 ring-red-30 px-4 py-3 flex items-start gap-2.5">
            <AlertCircle size={15} className="text-red mt-0.5 shrink-0" />
            <p className="fs-10 text-white/50 leading-relaxed">No se pudo leer el pipeline. Usando datos de respaldo — selección manual sigue disponible.<br/><span className="text-red font-mono" style={{ fontSize: "9px" }}>Detalle: {pipelineErrorMsg}</span></p>
          </div>
        )}
        {pipelineStatus === "ok" && (
          <div className="rounded-2xl bg-green-chip-06 ring-1 ring-green-20 px-4 py-3 flex items-center justify-between gap-2.5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={15} className="text-green mt-0.5 shrink-0" />
              <p className="fs-10 text-white/50 leading-relaxed">Pipeline activo · datos del {pipelineMeta?.date} · {autoGames.length} juego(s) disponibles para hoy.</p>
            </div>
            {calendarLoadedId !== (pipelineMeta?.date ?? "loaded") && autoGames.length > 0 && (
              <button onClick={loadTodaysCalendar} className="shrink-0 fs-9 font-bold uppercase tracking-wide text-green bg-green-chip-10 ring-1 ring-green-30 px-2.5 py-1.5 rounded-full">
                Cargar calendario
              </button>
            )}
          </div>
        )}

        <div className="flex items-center justify-between rounded-2xl bg-white-02 ring-1 ring-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="fs-10 uppercase tracking-wider text-white/40 font-semibold">Bankroll</span>
            <span className="fs-9 text-white/25">para sugerencia de monto (¼ Kelly)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-white/40">$</span>
            <input
              type="text"
              inputMode="numeric"
              value={bankroll}
              onChange={(e) => setBankroll(e.target.value.replace(/[^0-9]/g, ""))}
              className="w-20 bg-input ring-1 ring-white/10 focus-ring-green rounded-md px-2 py-1 text-right font-mono text-xs text-brand"
            />
          </div>
        </div>

        <PickOfDay matchups={matchups} oddsMap={oddsMap} bankroll={bankroll} />

        <BetLogPanel entries={betLog} setEntries={setBetLog} open={logOpen} onToggle={() => setLogOpen(!logOpen)} />

        {matchups.map((m) => (
          <MatchupCard
            key={m.id}
            matchup={m}
            setMatchup={(patch) => updateMatchup(m.id, patch)}
            odds={oddsMap[m.id] || {}}
            setOdds={(o) => setOddsForMatchup(m.id, o)}
            expanded={expandedId === m.id}
            onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
            bankroll={bankroll}
            onRemove={() => removeMatchup(m.id)}
            teams={teams}
            onAddToLog={handleAddToLog}
          />
        ))}

        <button
          onClick={addMatchup}
          className="w-full rounded-2xl ring-1 ring-dashed ring-white/15 text-white/40 text-xs font-semibold py-3.5 active:bg-white/[0.02]"
        >
          + Agregar otro cruce
        </button>

        <p className="fs-9 text-white/20 text-center pt-4 leading-relaxed">
          {pipelineStatus === "ok"
            ? "Datos de equipos, abridores y props generados automáticamente cada día por GitHub Actions."
            : "Elo de respaldo derivado de standings MLB.com (corte 1-jun-2026). Editable por juego."}<br/>
          El modelo es una herramienta de análisis, no garantiza resultados. Apuesta con responsabilidad.
        </p>
      </div>
    </div>
  );
}
