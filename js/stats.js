// ============================================================
// Calculs statistiques — pur JS, sans dépendance.
// Reprend exactement la logique validée dans le prototype et la
// version Swift : 1RM Epley, poids effectif (corps/poulie + lest),
// historiques par exercice, comparaison de séries.
// ============================================================

const EQUIPS = [
  { key: "barre", label: "Barre" },
  { key: "halteres", label: "Haltères" },
  { key: "machine", label: "Machine" },
  { key: "poulie", label: "Poulie" },
  { key: "pdc", label: "Poids du corps" },
];
const equipLabel = (k) => EQUIPS.find((e) => e.key === k)?.label ?? "Barre";
const hasLest = (equip) => equip === "pdc" || equip === "poulie";
const weightLabel = (equip) =>
  equip === "pdc" ? "Corps (kg)" : equip === "poulie" ? "Poulie (kg)" : "Poids (kg)";

const FEELS = [
  { key: "facile", label: "Facile", val: 1, color: "#4ADE80" },
  { key: "moyen", label: "Moyen", val: 2, color: "#FFB020" },
  { key: "dur", label: "Dur", val: 3, color: "#F87171" },
];
const feelInfo = (k) => FEELS.find((f) => f.key === k);

/** Conversion sûre d'un champ potentiellement en cours de saisie (chaîne, virgule, vide) */
function num(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** 1RM estimé (formule d'Epley) */
function epley(weight, reps) {
  return reps > 0 ? weight * (1 + reps / 30) : 0;
}

/** Poids effectif d'une série/dégressif : base + lest si l'équipement en a un */
function effW(withLest, s) {
  return withLest ? num(s.weight) + num(s.lest) : num(s.weight);
}

function setVolume(s, withLest) {
  const drops = s.drops || [];
  return (
    effW(withLest, s) * num(s.reps) +
    drops.reduce((a, d) => a + effW(withLest, d) * num(d.reps), 0)
  );
}

function sessionVolume(session) {
  const entries = session.entries || [];
  return entries.reduce(
    (a, e) => a + (e.sets || []).reduce((b, s) => b + setVolume(s, hasLest(e.equip)), 0),
    0
  );
}

/** Historique (1RM, poids max, volume) d'un exercice à travers les séances d'un groupe */
function exerciseHistory(sessions, exerciseName) {
  return sessions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((session) => {
      const entry = (session.entries || []).find((e) => e.exercise === exerciseName);
      if (!entry || !entry.sets || entry.sets.length === 0) return null;
      const withLest = hasLest(entry.equip);
      const best1RM = Math.max(...entry.sets.map((s) => epley(effW(withLest, s), num(s.reps))));
      const maxW = Math.max(...entry.sets.map((s) => effW(withLest, s)));
      const vol = entry.sets.reduce((a, s) => a + setVolume(s, withLest), 0);
      return { date: session.date, best1RM: Math.round(best1RM * 10) / 10, maxW, vol };
    })
    .filter(Boolean);
}

/** Historique de la n-ième série (0-based) d'un exercice à travers les séances */
function nthSetHistory(sessions, exerciseName, n) {
  return sessions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((session) => {
      const entry = (session.entries || []).find((e) => e.exercise === exerciseName);
      const s = entry?.sets?.[n];
      if (!s) return null;
      const w = effW(hasLest(entry.equip), s);
      return { date: session.date, poids: w, reps: num(s.reps), e1rm: epley(w, num(s.reps)) };
    })
    .filter(Boolean);
}

/** Séries d'un exercice au sein d'une séance donnée (comparaison intra-séance) */
function intraSessionSets(session, exerciseName) {
  const entry = (session.entries || []).find((e) => e.exercise === exerciseName);
  if (!entry) return [];
  const withLest = hasLest(entry.equip);
  return entry.sets.map((s, i) => ({
    index: i + 1,
    weight: effW(withLest, s),
    reps: num(s.reps),
  }));
}

/** Nombre max de séries jamais faites sur un exercice, dans une liste de séances */
function maxSetCount(sessions, exerciseName) {
  return sessions.reduce((max, session) => {
    const entry = (session.entries || []).find((e) => e.exercise === exerciseName);
    return entry ? Math.max(max, entry.sets.length) : max;
  }, 0);
}

/** Meilleure série (par 1RM estimé) sur un exercice, toutes séances/groupes fournis confondus */
function bestSetForExercise(sessions, exerciseName) {
  let best = null;
  sessions.forEach((session) => {
    (session.entries || []).forEach((entry) => {
      if (entry.exercise !== exerciseName) return;
      const withLest = hasLest(entry.equip);
      (entry.sets || []).forEach((s) => {
        const w = effW(withLest, s);
        const r = num(s.reps);
        const e1 = epley(w, r);
        if (!best || e1 > best.e1rm) best = { weight: w, reps: r, e1rm: e1 };
      });
    });
  });
  return best;
}

/** Tous les noms d'exercices rencontrés dans une liste de séances */
function allExerciseNames(sessions) {
  const names = new Set();
  sessions.forEach((s) => (s.entries || []).forEach((e) => names.add(e.exercise)));
  return [...names];
}

function fmtDate(iso) {
  return new Date(iso + "T12:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
function fmtDateLong(iso) {
  return new Date(iso + "T12:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });
}
function plateColor(w) {
  const half = w / 2;
  if (half >= 25) return "#D64545";
  if (half >= 20) return "#3E7CC0";
  if (half >= 15) return "#D9B93F";
  if (half >= 10) return "#4CAF6E";
  return "#8B9096";
}
function kg(v) {
  const r = Math.round(v * 10) / 10;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}