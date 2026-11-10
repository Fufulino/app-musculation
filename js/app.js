// ============================================================
// Carnet de charge — application principale (vanilla JS, sans framework)
// ============================================================

const root = document.getElementById("app");
let activeCharts = [];

const state = {
  profile: null,              // prénom de l'utilisateur actif
  users: [],                  // liste des utilisateurs (écran « Qui s'entraîne ? »)
  loading: true,
  accessGranted: false,
  groups: [],
  sessions: [],
  goals: [],
  weights: [],
  tab: "seances",             // seances | stats
  nav: { screen: "home" },    // home | group | session (+ groupId / sessionId)
  statsGroupId: null,
  statsExercise: null,
  sheet: null,                // { kind, ...payload }
  authError: null,
  flash: null,
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Mémoire de l'appareil (profil choisi, code d'accès déjà saisi). Sans effet si le stockage est bloqué. */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignoré */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignoré */ } },
};

function showError(err) {
  console.error(err);
  state.flash = { type: "error", text: err?.message || String(err) };
  render();
  setTimeout(() => { state.flash = null; render(); }, 4500);
}

// ============================================================
// Chargement des données
// ============================================================

async function loadAllData() {
  const [groups, sessions, goals, weights] = await Promise.all([
    DB.fetchGroups(), DB.fetchSessions(), DB.fetchGoals(), DB.fetchWeights(),
  ]);
  state.groups = groups;
  state.sessions = sessions;
  state.goals = goals;
  state.weights = weights;
}

function group(id) { return state.groups.find((g) => g.id === id); }
function session(id) { return state.sessions.find((s) => s.id === id); }
function sessionsOf(groupId) {
  return state.sessions.filter((s) => s.group_id === groupId).sort((a, b) => b.date.localeCompare(a.date));
}
function lastBodyWeight() {
  return state.weights.length ? state.weights[state.weights.length - 1].weight : 70;
}

// ============================================================
// Persistance d'une séance modifiée
// ============================================================

async function persistSession(s, fields) {
  Object.assign(s, fields);
  try {
    await DB.updateSession(s.id, fields);
  } catch (e) {
    showError(e);
  }
}

// ============================================================
// Rendu principal
// ============================================================

function render() {
  activeCharts.forEach((c) => c.destroy());
  activeCharts = [];

  if (state.loading) {
    root.innerHTML = `<div class="center-screen"><div class="spinner"></div></div>`;
    return;
  }
  if (!state.profile) {
    if (!state.accessGranted) {
      root.innerHTML = renderAccessCode();
      attachAccessCodeHandler();
    } else {
      root.innerHTML = renderPicker();
      attachPickerHandlers();
    }
    return;
  }

  root.innerHTML = `
    ${state.flash ? `<div class="flash flash-${state.flash.type}">${esc(state.flash.text)}</div>` : ""}
    <div class="screen">${renderTabContent()}</div>
    ${renderTabBar()}
    ${state.sheet ? renderSheet() : ""}
  `;

  if (state.tab === "stats") mountStatsCharts();
}

function renderTabBar() {
  const tabs = [
    { key: "seances", icon: "🏋️", label: "Séances" },
    { key: "stats", icon: "📈", label: "Stats" },
  ];
  return `<nav class="tabbar">
    ${tabs.map((t) => `
      <button data-action="tab" data-tab="${t.key}" class="${state.tab === t.key ? "on" : ""}">
        <span class="ic">${t.icon}</span>${t.label}
      </button>`).join("")}
  </nav>`;
}

function renderTabContent() {
  if (state.tab === "seances") return renderSeances();
  if (state.tab === "stats") return renderStats();
  return "";
}

// ============================================================
// AUTHENTIFICATION
// ============================================================

function renderAccessCode() {
  return `<div class="auth-wrap"><h1 class="disp title" style="text-align:center;margin-bottom:4px;">🏋️ Carnet de charge</h1>
    <p class="subtitle" style="text-align:center;">Entre le code d'accès</p>
    ${state.authError ? `<div class="flash flash-error">${esc(state.authError)}</div>` : ""}
    <form id="access-form" class="card" style="margin:0 16px;"><label class="field-label">Code</label>
      <input class="text-input" type="password" name="accessCode" required autofocus />
      <button class="btn" style="margin-top:16px;" type="submit">Accéder</button></form></div>`;
}

function attachAccessCodeHandler() {
  document.getElementById("access-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get("accessCode");
    if (code !== "cytech") {
      state.authError = "Code incorrect.";
      render();
      return;
    }
    state.authError = null;
    state.accessGranted = true;
    store.set("carnet:access", "1");
    showPicker();
  });
}

/** Messages d'erreur lisibles pour l'écran « Qui s'entraîne ? » */
function userErrorFr(err) {
  const m = String(err?.message || err || "");
  const code = err?.code || "";
  if (code === "23505" || /duplicate key|already exists/i.test(m)) return "Ce prénom existe déjà : touche-le dans la liste.";
  if (code === "PGRST205" || /app_users/.test(m) && /not find|does not exist/i.test(m))
    return "La liste des utilisateurs n'existe pas encore dans Supabase : lance le fichier supabase-complet.sql (SQL Editor → Run), puis recharge la page.";
  if (/row-level security|permission denied|42501/i.test(m))
    return "Supabase refuse l'accès : lance le fichier supabase-complet.sql (SQL Editor → Run), puis recharge la page.";
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "Connexion impossible : vérifie ta connexion internet.";
  return m;
}

function renderPicker() {
  const users = state.users.slice().sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  return `
  <div class="auth-wrap">
    <h1 class="disp title" style="text-align:center;margin-bottom:4px;">Qui s'entraîne ?</h1>
    <p class="subtitle" style="text-align:center;">Touche ton prénom, ou ajoute-toi à la liste</p>

    ${state.authError ? `<div class="flash flash-error">${esc(state.authError)}</div>` : ""}

    <div class="pad">
      ${users.map((u) => `
        <button class="row-btn" data-action="pick-user" data-name="${esc(u.name)}">
          <span style="font-size:18px;font-weight:700;">${esc(u.name)}</span><span class="chev">›</span>
        </button>`).join("")}
      ${users.length === 0 && !state.authError ? `<p class="muted" style="font-size:14px;">Personne pour l'instant — ajoute le premier prénom ci-dessous.</p>` : ""}
    </div>

    <form id="add-user-form" class="card" style="margin:12px 16px 0;">
      <label class="field-label" style="margin-top:0;">Nouvel utilisateur</label>
      <input class="text-input" type="text" name="newName" required maxlength="40" placeholder="Prénom" autocomplete="off" />
      <button class="btn" style="margin-top:12px;" type="submit">Ajouter et entrer</button>
    </form>
  </div>`;
}

function attachPickerHandlers() {
  const form = document.getElementById("add-user-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    form.querySelector('button[type="submit"]').disabled = true;
    await addUserAndEnter(new FormData(form).get("newName"));
  });
}

async function showPicker() {
  state.loading = true;
  render();
  try {
    state.users = await DB.fetchUsers();
  } catch (err) {
    state.users = [];
    state.authError = userErrorFr(err);
  }
  state.loading = false;
  render();
}

async function addUserAndEnter(rawName) {
  const name = String(rawName || "").replace(/\s+/g, " ").trim();
  if (!name) return;
  state.authError = null;
  if (state.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    state.authError = `« ${name} » existe déjà : touche-le dans la liste.`;
    render();
    return;
  }
  try {
    await DB.addUser(name);
    state.users.push({ name });
    await enterAs(name);
  } catch (err) {
    state.authError = userErrorFr(err);
    render();
  }
}

async function enterAs(name) {
  state.profile = name;
  window.ACTIVE_PROFILE = name;
  store.set("carnet:profile", name);
  state.authError = null;
  state.loading = true;
  render();
  try {
    await loadAllData();
  } catch (err) {
    showError(err);
  }
  state.loading = false;
  state.tab = "seances";
  state.nav = { screen: "home" };
  render();
}

function switchUser() {
  state.profile = null;
  window.ACTIVE_PROFILE = "";
  store.del("carnet:profile");
  state.groups = []; state.sessions = []; state.goals = []; state.weights = [];
  state.sheet = null;
  state.statsGroupId = null;
  state.statsExercise = null;
  showPicker();
}

function exerciseHistoryPreview(exerciseName) {
  if (!exerciseName) return `<p class="hint">Sélectionne un exercice pour voir son historique.</p>`;
  const history = exerciseHistory(state.sessions, exerciseName).slice().reverse();
  if (!history.length) return `<p class="hint">Aucun historique pour cet exercice.</p>`;
  const latest = history[0];
  return `<div class="card" style="margin:12px 0 0;padding:12px;background:var(--card2);">
    <div style="font-weight:700;margin-bottom:8px;">Historique de ${esc(exerciseName)}</div>
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <div class="stat-pill"><div class="pill-label">Dernier poids</div><div class="pill-val">${kg(latest.maxW)} kg</div></div>
      <div class="stat-pill"><div class="pill-label">Volume</div><div class="pill-val">${kg(latest.vol)} kg</div></div>
    </div>
    <div class="muted" style="font-size:12px;margin-bottom:4px;">Date · poids max · 1RM estimé</div>
    ${history.slice(0, 4).map((item) => `<div class="mono" style="display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid var(--line);font-size:12px;">
      <span>${fmtDate(item.date)}</span><span>${kg(item.maxW)} kg · ${kg(item.best1RM)} kg</span>
    </div>`).join("")}
    <button type="button" class="link" style="margin-top:8px;" data-action="history-stats" data-exercise="${esc(exerciseName)}">Voir les statistiques détaillées ›</button>
  </div>`;
}

// ============================================================
// ONGLET SÉANCES
// ============================================================

function renderSeances() {
  const { screen } = state.nav;
  if (screen === "group") return renderGroupScreen();
  if (screen === "session") return renderSessionScreen();
  if (screen === "exercise-history") return renderExerciseHistoryScreen();
  return renderHomeScreen();
}

function renderHomeScreen() {
  return `
    <div class="topbar">
      <h1 class="title disp">Carnet de charge</h1>
      <button class="link" style="margin-left:auto;" data-action="switch-user">👤 ${esc(state.profile)} · changer</button>
    </div>
    <p class="subtitle">Tes groupes de séances</p>
    <div class="pad">
      ${state.groups.map((g) => {
        const sessions = sessionsOf(g.id);
        const last = sessions[0];
        return `
        <div class="row-btn" data-action="nav-group" data-id="${g.id}">
          <div>
            <div style="font-size:18px;font-weight:700;">${esc(g.icon)} ${esc(g.name)}</div>
            <div class="muted" style="font-size:13px;margin-top:3px;">
              ${last ? `Dernière séance : ${fmtDate(last.date)} · ${kg(sessionVolume(last))} kg de volume`
                     : "Aucune séance"}
            </div>
          </div>
          <button class="link del" data-action="delete-group" data-id="${g.id}" title="Supprimer le groupe">✕</button>
        </div>`;
      }).join("")}
      <button class="btn-mini" style="width:100%;" data-action="sheet-open" data-sheet="newGroup">
        + Ajouter un groupe
      </button>
      ${state.groups.length === 0 ? `<p class="muted" style="font-size:14px;">Crée ton premier groupe (Dos, Jambes…) pour commencer.</p>` : ""}
    </div>
  `;
}

function renderGroupScreen() {
  const g = group(state.nav.groupId);
  if (!g) return renderHomeScreen();
  const sessions = sessionsOf(g.id);
  const exerciseMap = new Map();
  sessions.forEach((s) => (s.entries || []).forEach((entry) => {
    if (!exerciseMap.has(entry.exercise)) exerciseMap.set(entry.exercise, []);
    exerciseMap.get(entry.exercise).push({ session: s, entry });
  }));
  const exercises = [...exerciseMap.entries()].sort((a, b) => {
    const datesA = a[1].map((x) => x.session.date).sort();
    const datesB = b[1].map((x) => x.session.date).sort();
    const latestA = datesA[datesA.length - 1] || "";
    const latestB = datesB[datesB.length - 1] || "";
    return latestB.localeCompare(latestA);
  });
  return `
    <div class="topbar">
      <button class="back" data-action="nav-home">‹ Retour</button>
      <h1 class="title disp" style="font-size:26px;">${esc(g.icon)} ${esc(g.name)}</h1>
      <button class="link" style="margin-left:auto;font-size:16px;" data-action="sheet-open" data-sheet="editGroup" data-id="${g.id}">✏️</button>
    </div>
    <div class="pad" style="display:flex;gap:8px;margin-bottom:14px;">
      <button class="btn" style="flex:2;" data-action="sheet-open" data-sheet="newSession" data-id="${g.id}">+ Nouvelle séance</button>
      <button class="btn-ghost" style="flex:1;" data-action="goto-stats" data-group-id="${g.id}">📈 Stats</button>
    </div>
    <p class="subtitle">Exercices (${exercises.length})</p>
    <div class="pad">
      ${exercises.map(([exerciseName, records]) => {
        const latest = records.slice().sort((a, b) => b.session.date.localeCompare(a.session.date))[0];
        return `<button class="row-btn" data-action="nav-exercise-history" data-group-id="${g.id}" data-exercise="${esc(exerciseName)}">
          <div><div style="font-size:18px;font-weight:700;">${esc(exerciseName)}</div>
            <div class="muted" style="font-size:13px;margin-top:3px;">(${fmtDate(latest.session.date)}) · ${records.length} séance${records.length > 1 ? "s" : ""}</div>
          </div><span class="chev">›</span>
        </button>`;
      }).join("")}
      ${exercises.length === 0 ? `<p class="muted" style="font-size:14px;">Aucun exercice pour l'instant — lance ta première séance !</p>` : ""}
    </div>
  `;
}

function renderExerciseHistoryScreen() {
  const g = group(state.nav.groupId);
  const exerciseName = state.nav.exercise;
  if (!g || !exerciseName) return renderGroupScreen();
  const records = sessionsOf(g.id)
    .flatMap((s) => (s.entries || []).filter((entry) => entry.exercise === exerciseName).map((entry) => ({ session: s, entry })))
    .sort((a, b) => b.session.date.localeCompare(a.session.date));
  return `<div class="topbar"><button class="back" data-action="nav-group" data-id="${g.id}">‹ ${esc(g.name)}</button>
    <h1 class="title disp" style="font-size:26px;">${esc(exerciseName)}</h1></div>
    <p class="subtitle">Toutes les séries réalisées</p>
    <div class="pad">
      ${records.map(({ session: s, entry }) => `<div class="card" style="margin:0 0 12px;padding:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong>${fmtDateLong(s.date)}</strong>
          <button class="link" data-action="nav-session" data-id="${s.id}">Ouvrir ›</button>
        </div>
        <table class="log mono"><thead><tr><th>Série</th><th style="text-align:right;">Poids</th><th style="text-align:right;">Reps</th><th style="text-align:right;">Récup</th></tr></thead>
          <tbody>${(entry.sets || []).map((set, index) => `<tr><td>${index + 1}</td><td style="text-align:right;">${kg(effW(hasLest(entry.equip), set))} kg</td><td style="text-align:right;">${num(set.reps)}</td><td style="text-align:right;">${set.rest != null ? set.rest + " s" : "—"}</td></tr>
            ${(set.drops || []).map((drop, dropIndex) => `<tr><td class="drop-td">↳ dég. ${dropIndex + 1}</td><td style="text-align:right;">${kg(effW(hasLest(entry.equip), drop))} kg</td><td style="text-align:right;">${num(drop.reps)}</td><td></td></tr>`).join("")}`).join("")}</tbody>
        </table>
      </div>`).join("")}
      ${records.length === 0 ? `<p class="muted">Aucune série enregistrée.</p>` : ""}
    </div>`;
}

function renderSessionScreen() {
  const s = session(state.nav.sessionId);
  if (!s) return renderHomeScreen();
  const g = group(s.group_id);
  const entries = s.entries || [];

  return `
    <div class="topbar">
      <button class="back" data-action="nav-group" data-id="${g.id}">‹ ${esc(g.name)}</button>
    </div>
    <div class="pad" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px;">
      <h1 class="title disp" style="font-size:24px;text-transform:capitalize;">${fmtDateLong(s.date)}</h1>
      <input type="date" class="date-input" value="${s.date}" data-action="change-session-date" />
    </div>
    <p class="subtitle mono" style="margin-top:0;">${kg(sessionVolume(s))} kg de volume total</p>

    <div class="pad" style="margin-bottom:14px;">
      <div class="pill-label" style="margin-bottom:6px;">Ressenti de la séance</div>
      ${renderFeelPicker(s.feel, "session-feel")}
    </div>

    ${entries.map((entry) => renderExerciseCard(s, entry)).join("")}

    <div class="pad">
      <button class="btn-ghost" style="width:100%;" data-action="sheet-open" data-sheet="newExercise" data-id="${s.id}">
        + Ajouter un exercice
      </button>
    </div>
  `;
}

function renderFeelPicker(current, actionName) {
  return `<div class="seg">
    ${FEELS.map((f) => `
      <button data-action="${actionName}" data-feel="${f.key}"
        class="${current === f.key ? "on" : ""}" style="${current === f.key ? `color:${f.color}` : ""}">
        ${f.label}
      </button>`).join("")}
  </div>`;
}

function renderExerciseCard(s, entry) {
  const withLest = hasLest(entry.equip);
  return `
  <div class="card" data-entry="${entry.id}">
    <div class="exo-head">
      <h2 class="exo-name disp">${esc(entry.exercise)}</h2>
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="link" data-action="goto-stats" data-group-id="${s.group_id}" data-exercise="${esc(entry.exercise)}">Progrès ›</button>
        <button class="link del" data-action="remove-exercise" data-session="${s.id}" data-entry="${entry.id}">✕</button>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <span class="pill-label">Matériel</span>
      <select class="text-input" style="flex:1;padding:6px 10px;font-size:13px;"
        data-action="change-equip" data-session="${s.id}" data-entry="${entry.id}">
        ${EQUIPS.map((eq) => `<option value="${eq.key}" ${entry.equip === eq.key ? "selected" : ""}>${eq.label}</option>`).join("")}
      </select>
    </div>

    <table class="log mono">
      <thead><tr>
        <th>Série</th>
        <th style="text-align:right;">${weightLabel(entry.equip)}</th>
        ${withLest ? `<th style="text-align:right;">Lest ±</th>` : ""}
        <th style="text-align:right;">Reps</th>
        <th style="text-align:right;">Récup</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${entry.sets.map((set, i) => renderSetRow(s, entry, set, i)).join("")}
      </tbody>
    </table>

    <p class="hint">Récup = temps de repos après la série, en secondes (tape 90 ou 1:30).</p>
    ${withLest ? `<p class="hint">Lest positif = charge ajoutée · négatif = assistance. Poids compté : ${entry.equip === "pdc" ? "corps" : "poulie"} + lest.</p>` : ""}

    <div style="display:flex;align-items:center;gap:10px;margin-top:10px;">
      <span class="pill-label">Difficulté</span>
      <div style="flex:1;">${renderFeelPicker(entry.feel, "entry-feel").replace('class="seg"', `class="seg mini" data-session="${s.id}" data-entry="${entry.id}"`)}</div>
    </div>

    <button class="btn-mini" style="margin-top:10px;width:100%;" data-action="add-set" data-session="${s.id}" data-entry="${entry.id}">
      + Ajouter une série
    </button>
  </div>`;
}

function renderSetRow(s, entry, set, i) {
  const withLest = hasLest(entry.equip);
  const narrow = withLest ? ' class="cell-input mono narrow"' : ' class="cell-input mono"';
  const dropsHtml = (set.drops || []).map((d, j) => `
    <tr>
      <td class="drop-td">↳ dég.${j + 1}</td>
      <td style="text-align:right;"><input${narrow} type="text" inputmode="decimal" value="${d.weight ?? 0}"
        data-action="change-value" data-session="${s.id}" data-entry="${entry.id}" data-set="${set.id}" data-drop="${d.id}" data-field="weight" /></td>
      ${withLest ? `<td style="text-align:right;"><input class="cell-input mono narrow" type="text" inputmode="decimal" value="${d.lest ?? 0}"
        data-action="change-value" data-session="${s.id}" data-entry="${entry.id}" data-set="${set.id}" data-drop="${d.id}" data-field="lest" /></td>` : ""}
      <td style="text-align:right;"><input${narrow} type="text" inputmode="numeric" value="${d.reps ?? 0}"
        data-action="change-value" data-session="${s.id}" data-entry="${entry.id}" data-set="${set.id}" data-drop="${d.id}" data-field="reps" /></td>
      <td></td>
      <td style="text-align:right;"><button class="link del" data-action="remove-drop" data-session="${s.id}" data-entry="${entry.id}" data-set="${set.id}" data-drop="${d.id}">✕</button></td>
    </tr>`).join("");

  return `
    <tr>
      <td class="num"><span class="dot" style="background:${plateColor(effW(withLest, set))}"></span>${i + 1}</td>
      <td style="text-align:right;"><input${narrow} type="text" inputmode="decimal" value="${set.weight ?? 0}"
        data-action="change-value" data-session="${s.id}" data-entry="${entry.id}" data-set="${set.id}" data-field="weight" /></td>
      ${withLest ? `<td style="text-align:right;"><input class="cell-input mono narrow" type="text" inputmode="decimal" value="${set.lest ?? 0}"
        data-action="change-value" data-session="${s.id}" data-entry="${entry.id}" data-set="${set.id}" data-field="lest" /></td>` : ""}
      <td style="text-align:right;"><input${narrow} type="text" inputmode="numeric" value="${set.reps ?? 0}"
        data-action="change-value" data-session="${s.id}" data-entry="${entry.id}" data-set="${set.id}" data-field="reps" /></td>
      <td style="text-align:right;"><input class="cell-input mono narrow" type="text" inputmode="numeric" placeholder="—" value="${set.rest ?? ""}" title="Temps de récupération après la série, en secondes (ex : 90 ou 1:30)"
        data-action="change-value" data-session="${s.id}" data-entry="${entry.id}" data-set="${set.id}" data-field="rest" /></td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="link" title="Ajouter un dégressif" data-action="add-drop" data-session="${s.id}" data-entry="${entry.id}" data-set="${set.id}">↓</button>
        <button class="link del" title="Supprimer la série" data-action="remove-set" data-session="${s.id}" data-entry="${entry.id}" data-set="${set.id}">✕</button>
      </td>
    </tr>
    ${dropsHtml}
  `;
}

// ============================================================
// ONGLET STATISTIQUES
// ============================================================

function renderStats() {
  const groupsWithData = state.groups.filter((g) => sessionsOf(g.id).length > 0);
  if (groupsWithData.length === 0) {
    return `<div class="topbar"><h1 class="title disp">Statistiques</h1></div>
      <p class="subtitle">Enregistre au moins une séance pour voir tes progrès.</p>`;
  }
  const g = groupsWithData.find((x) => x.id === state.statsGroupId) || groupsWithData[0];
  const sessions = sessionsOf(g.id);
  const exercises = allExerciseNames(sessions);
  const exercise = exercises.includes(state.statsExercise) ? state.statsExercise : exercises[0];

  return `
    <div class="topbar"><h1 class="title disp">Statistiques</h1></div>
    <div class="pad chips">
      ${groupsWithData.map((x) => `
        <button class="chip ${x.id === g.id ? "on" : ""}" data-action="stats-group" data-id="${x.id}">${esc(x.icon)} ${esc(x.name)}</button>
      `).join("")}
    </div>
    <div class="pad chips">
      ${exercises.map((ex) => `
        <button class="chip ${ex === exercise ? "on" : ""}" data-action="stats-exercise" data-exercise="${esc(ex)}">${esc(ex)}</button>
      `).join("")}
    </div>
    <div class="pad" id="stats-body">
      ${exercise ? renderExerciseStats(g, sessions, exercise) : `<p class="muted">Pas encore de données.</p>`}
    </div>
  `;
}

function renderExerciseStats(g, sessions, exercise) {
  const history = exerciseHistory(sessions, exercise);
  if (history.length === 0) return `<p class="muted">Pas encore de données pour cet exercice.</p>`;
  const first = history[0], last = history[history.length - 1];
  const d1rm = last.best1RM - first.best1RM;
  const dvol = last.vol - first.vol;

  return `
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      ${statPill("1RM estimé", `${kg(last.best1RM)} kg`, d1rm)}
      ${statPill("Volume", `${kg(last.vol)} kg`, dvol)}
      ${statPill("Poids max", `${kg(last.maxW)} kg`, null)}
    </div>

    <div class="card">
      <div class="pill-label" style="margin-bottom:8px;">1RM estimé (Epley) — kg</div>
      <div class="chart-box"><canvas id="chart-1rm"></canvas></div>
    </div>

    ${renderSetComparison(g, sessions, exercise)}

    <div class="card">
      <div class="pill-label" style="margin-bottom:8px;">Volume par séance (dégressifs inclus) — kg</div>
      <div class="chart-box"><canvas id="chart-volume"></canvas></div>
    </div>
  `;
}

function statPill(label, value, delta) {
  const deltaHtml = delta && delta !== 0
    ? `<span class="${delta > 0 ? "delta-up" : "delta-down"}">${delta > 0 ? "▲" : "▼"} ${kg(Math.abs(delta))} kg</span>`
    : "";
  return `<div class="stat-pill">
    <div class="pill-label">${label}</div>
    <div class="pill-val mono">${esc(value)} ${deltaHtml}</div>
  </div>`;
}

function renderSetComparison(g, sessions, exercise) {
  const validSessions = sessions
    .filter((s) => (s.entries || []).some((e) => e.exercise === exercise && e.sets.length))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (validSessions.length === 0) return "";
  const maxSets = maxSetCount(sessions, exercise);
  const mode = state.compareMode || "intra";
  const sessIdx = state.compareSessionIdx || 0;
  const setN = state.compareSetN || 1;

  return `
  <div class="card" data-comparison data-group="${g.id}" data-exercise="${esc(exercise)}">
    <div class="pill-label" style="margin-bottom:10px;">Comparaison des séries</div>
    <div class="seg" style="margin-bottom:12px;">
      <button data-action="compare-mode" data-mode="intra" class="${mode === "intra" ? "on" : ""}">Même séance</button>
      <button data-action="compare-mode" data-mode="inter" class="${mode === "inter" ? "on" : ""}">Entre séances</button>
    </div>

    ${mode === "intra" ? `
      <select class="text-input" style="margin-bottom:10px;" data-action="compare-session">
        ${validSessions.map((s, i) => `<option value="${i}" ${i === sessIdx ? "selected" : ""}>Séance du ${fmtDate(s.date)}${i === 0 ? " (dernière)" : ""}</option>`).join("")}
      </select>
      <div class="chart-box"><canvas id="chart-compare"></canvas></div>
      <p class="hint">Une baisse marquée entre S1 et la dernière série indique la fatigue accumulée sur l'exercice.</p>
    ` : `
      <select class="text-input" style="margin-bottom:10px;" data-action="compare-setn">
        ${Array.from({ length: Math.max(1, maxSets) }, (_, i) => i + 1)
          .map((n) => `<option value="${n}" ${n === setN ? "selected" : ""}>Série n°${n}</option>`).join("")}
      </select>
      <div class="chart-box"><canvas id="chart-compare"></canvas></div>
      <p class="hint">Suivi de la série n°${setN} à travers les séances : si le poids ou les reps montent à effort égal, tu progresses.</p>
    `}
  </div>`;
}

function mountStatsCharts() {
  const groupsWithData = state.groups.filter((g) => sessionsOf(g.id).length > 0);
  if (groupsWithData.length === 0) return;
  const g = groupsWithData.find((x) => x.id === state.statsGroupId) || groupsWithData[0];
  const sessions = sessionsOf(g.id);
  const exercises = allExerciseNames(sessions);
  const exercise = exercises.includes(state.statsExercise) ? state.statsExercise : exercises[0];
  if (!exercise) return;
  const history = exerciseHistory(sessions, exercise);
  if (history.length === 0) return;

  const labels = history.map((h) => fmtDate(h.date));

  const c1 = document.getElementById("chart-1rm");
  if (c1) activeCharts.push(new Chart(c1, lineChartConfig(labels, "1RM", history.map((h) => h.best1RM), "#FFB020")));

  const cv = document.getElementById("chart-volume");
  if (cv) activeCharts.push(new Chart(cv, lineChartConfig(labels, "Volume", history.map((h) => h.vol), "#4ADE80")));

  mountComparisonChart(g, sessions, exercise);
}

function mountComparisonChart(g, sessions, exercise) {
  const canvas = document.getElementById("chart-compare");
  if (!canvas) return;
  const mode = state.compareMode || "intra";

  if (mode === "intra") {
    const validSessions = sessions
      .filter((s) => (s.entries || []).some((e) => e.exercise === exercise && e.sets.length))
      .sort((a, b) => b.date.localeCompare(a.date));
    const idx = Math.min(state.compareSessionIdx || 0, validSessions.length - 1);
    const data = intraSessionSets(validSessions[idx], exercise);
    activeCharts.push(new Chart(canvas, {
      type: "bar",
      data: {
        labels: data.map((d) => `S${d.index}`),
        datasets: [
          { label: "Poids (kg)", data: data.map((d) => d.weight), backgroundColor: "#FFB020" },
          { label: "Reps", data: data.map((d) => d.reps), backgroundColor: "#4ADE80" },
        ],
      },
      options: chartOptions(),
    }));
  } else {
    const maxSets = maxSetCount(sessions, exercise);
    const n = Math.min(state.compareSetN || 1, Math.max(1, maxSets));
    const data = nthSetHistory(sessions, exercise, n - 1);
    activeCharts.push(new Chart(canvas, {
      type: "line",
      data: {
        labels: data.map((d) => fmtDate(d.date)),
        datasets: [
          { label: "Poids (kg)", data: data.map((d) => d.poids), borderColor: "#FFB020", backgroundColor: "#FFB020", tension: 0.3 },
          { label: "Reps", data: data.map((d) => d.reps), borderColor: "#4ADE80", backgroundColor: "#4ADE80", tension: 0.3, borderDash: [4, 3], yAxisID: "y1" },
        ],
      },
      options: { ...chartOptions(), scales: { ...chartOptions().scales, y1: { position: "right", grid: { display: false }, ticks: { color: "#8B9096" } } } },
    }));
  }
}

function lineChartConfig(labels, label, data, color) {
  return {
    type: "line",
    data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: color, tension: 0.3, pointRadius: 4 }] },
    options: chartOptions(),
  };
}

function chartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#8B9096", boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: "#8B9096" }, grid: { color: "#2C3138" } },
      y: { ticks: { color: "#8B9096" }, grid: { color: "#2C3138" } },
    },
  };
}

// ============================================================
// ONGLET OBJECTIFS
// ============================================================

function renderObjectifs() {
  return `
    <div class="topbar"><h1 class="title disp">Objectifs</h1></div>
    <p class="subtitle">Ton poids cible par exercice, suivi automatiquement.</p>
    <div class="pad">
      <button class="btn" data-action="sheet-open" data-sheet="newGoal">+ Nouvel objectif</button>
    </div>
    ${state.goals.length === 0 ? `<p class="subtitle">Aucun objectif — fixe-toi un cap !</p>` : ""}
    <div class="pad">
      ${state.goals.map((goal) => renderGoalCard(goal)).join("")}
    </div>
  `;
}

function renderGoalCard(goal) {
  const best = bestSetForExercise(state.sessions, goal.exercise);
  const targetE1rm = epley(goal.target_weight, goal.target_reps || 1);
  const pct = best ? Math.min(100, Math.round((best.e1rm / targetE1rm) * 100)) : 0;
  const done = best && (goal.target_reps
    ? (best.weight >= goal.target_weight && best.reps >= goal.target_reps) || best.e1rm >= targetE1rm
    : best.weight >= goal.target_weight);

  return `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:baseline;">
      <div class="disp" style="font-weight:800;font-size:17px;">${done ? "🏆 " : ""}${esc(goal.exercise.toUpperCase())}</div>
      <div>
        <button class="link" data-action="sheet-open" data-sheet="editGoal" data-id="${goal.id}">Modifier</button>
        <button class="link del" data-action="delete-goal" data-id="${goal.id}">✕</button>
      </div>
    </div>
    <div class="mono" style="margin-top:6px;font-size:14px;">
      ${best ? `${kg(best.weight)} kg × ${best.reps}` : "—"}
      <span class="muted">/ ${kg(goal.target_weight)} kg${goal.target_reps ? ` × ${goal.target_reps}` : ""}</span>
      <span style="float:right;color:${done ? "var(--up)" : "var(--accent)"}">${pct} %</span>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${done ? "var(--up)" : "var(--accent)"}"></div></div>
    ${done
      ? `<p style="color:var(--up);font-size:12px;margin:8px 0 0;">Objectif atteint — vise plus haut !</p>`
      : best ? `<p class="hint">Meilleure série : ${kg(best.weight)} kg × ${best.reps} reps (1RM ≈ ${kg(best.e1rm)} kg, cible ≈ ${kg(targetE1rm)} kg).</p>` : ""}
  </div>`;
}

// ============================================================
// ONGLET FORME
// ============================================================

function renderForme() {
  const feelPoints = state.sessions
    .filter((s) => s.feel)
    .sort((a, b) => a.date.localeCompare(b.date));
  const weights = state.weights;
  const lastW = weights[weights.length - 1];
  const firstW = weights[0];
  const dW = lastW && firstW ? lastW.weight - firstW.weight : 0;

  return `
    <div class="topbar"><h1 class="title disp">Suivi de forme</h1></div>
    <div class="pad">
      <div class="card">
        <div class="pill-label" style="margin-bottom:8px;">Ressenti des séances (1 = facile · 3 = dur)</div>
        ${feelPoints.length === 0
          ? `<p class="hint">Indique le ressenti dans l'écran de séance pour voir la tendance ici.</p>`
          : `<canvas id="chart-feel" height="150"></canvas>
             <p class="hint">Plusieurs séances « dur » d'affilée alors que les charges stagnent peut signaler un besoin de récupération.</p>`}
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div class="pill-label">Poids corporel — kg</div>
          ${lastW ? `<span class="mono" style="font-size:14px;">${kg(lastW.weight)} kg
              ${dW !== 0 ? `<span class="${dW > 0 ? "delta-up" : "delta-down"}">${dW > 0 ? "▲" : "▼"} ${kg(Math.abs(dW))}</span>` : ""}
            </span>` : ""}
        </div>
        ${weights.length > 1 ? `<canvas id="chart-weight" height="150"></canvas>` : ""}
        <button class="btn-mini" style="width:100%;margin-top:10px;" data-action="sheet-open" data-sheet="newWeight">+ Ajouter une pesée</button>
        <div style="margin-top:10px;">
          ${weights.slice().reverse().slice(0, 5).map((w) => `
            <div class="mono" style="display:flex;justify-content:space-between;padding:6px 2px;border-bottom:1px solid var(--line);font-size:13px;">
              <button class="link muted" data-action="sheet-open" data-sheet="editWeight" data-id="${w.id}">${fmtDate(w.date)} ✎</button>
              <span>${kg(w.weight)} kg <button class="link del" data-action="delete-weight" data-id="${w.id}">✕</button></span>
            </div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function mountFormeCharts() {
  const feelPoints = state.sessions.filter((s) => s.feel).sort((a, b) => a.date.localeCompare(b.date));
  const cf = document.getElementById("chart-feel");
  if (cf && feelPoints.length) {
    activeCharts.push(new Chart(cf, {
      type: "line",
      data: {
        labels: feelPoints.map((p) => fmtDate(p.date)),
        datasets: [{
          label: "Ressenti", data: feelPoints.map((p) => feelInfo(p.feel).val),
          borderColor: "#F87171", backgroundColor: "#F87171", stepped: true, pointRadius: 4,
        }],
      },
      options: {
        ...chartOptions(),
        scales: {
          ...chartOptions().scales,
          y: { min: 0.5, max: 3.5, ticks: { color: "#8B9096", stepSize: 1, callback: (v) => ["", "Facile", "Moyen", "Dur"][v] || "" }, grid: { color: "#2C3138" } },
        },
      },
    }));
  }
  const cw = document.getElementById("chart-weight");
  if (cw && state.weights.length > 1) {
    activeCharts.push(new Chart(cw, lineChartConfig(
      state.weights.map((w) => fmtDate(w.date)), "Poids", state.weights.map((w) => w.weight), "#3E7CC0"
    )));
  }
}

// ============================================================
// FEUILLES (modales)
// ============================================================

const GROUP_EMOJIS = ["🏋️", "💪", "🦵", "🍑", "🏃", "🚴", "🏊", "🧗", "🤸", "🦾", "🔥", "⚡", "🎯", "🏷️"];

function renderSheet() {
  const k = state.sheet.kind;
  let body = "";
  let title = "";

  if (k === "newGroup" || k === "editGroup") {
    const editing = k === "editGroup";
    const g = editing ? group(state.sheet.id) : null;
    title = editing ? "Modifier le groupe" : "Nouveau groupe";
    body = `
      <label class="field-label">Nom du groupe</label>
      <input class="text-input" name="name" placeholder="Ex : Épaules" value="${g ? esc(g.name) : ""}" required />
      <label class="field-label">Icône</label>
      <div class="emoji-grid">
        ${GROUP_EMOJIS.map((em) => `<button type="button" class="emoji-btn ${g && g.icon === em ? "on" : ""}" data-emoji="${em}">${em}</button>`).join("")}
      </div>
      <label class="field-label">Ou tape n'importe quel emoji</label>
      <input class="text-input" name="customIcon" maxlength="4" placeholder="Ex : 🐗" value="${g && !GROUP_EMOJIS.includes(g.icon) ? esc(g.icon) : ""}" />
      <input type="hidden" name="icon" value="${g ? esc(g.icon) : "🏋️"}" />
      <button class="btn" style="margin-top:16px;" type="submit">${editing ? "Enregistrer" : "Créer le groupe"}</button>
    `;
  }

  if (k === "newSession") {
    const g = group(state.sheet.id);
    const sessions = sessionsOf(g.id);
    title = "Nouvelle séance";
    body = `
      ${sessions.length ? `<p class="hint" style="margin-bottom:12px;">Reprendre les exercices et charges d'une séance précédente :</p>` : ""}
      ${sessions.map((s, i) => `
        <button type="button" class="row-btn" data-action="create-session" data-group="${g.id}" data-source="${s.id}">
          <div>
            <div style="font-weight:700;text-transform:capitalize;">${fmtDateLong(s.date)}${i === 0 ? ` <span style="color:var(--accent);font-size:12px;">· dernière</span>` : ""}</div>
            <div class="muted" style="font-size:13px;">${(s.entries || []).map((e) => esc(e.exercise)).join(" · ")}</div>
          </div>
          <span class="chev">›</span>
        </button>`).join("")}
      <button type="button" class="btn-ghost" style="width:100%;" data-action="create-session" data-group="${g.id}" data-source="">
        Partir d'une séance vide
      </button>
    `;
  }

  if (k === "newExercise") {
    const knownExercises = allExerciseNames(state.sessions);
    const selectedExercise = state.sheet.exercise || "";
    title = "Nouvel exercice";
    body = `
      <label class="field-label">Exercice</label>
      <select class="text-input" name="existingExercise">
        <option value="">Choisir un exercice existant</option>
        ${knownExercises.map((ex) => `<option value="${esc(ex)}" ${selectedExercise === ex ? "selected" : ""}>${esc(ex)}</option>`).join("")}
      </select>
      <label class="field-label">Ou créer un exercice</label>
      <input class="text-input" name="name" placeholder="Ex : Curl haltères" value="${selectedExercise && !knownExercises.includes(selectedExercise) ? esc(selectedExercise) : ""}" />
      <div id="exercise-history-preview">${exerciseHistoryPreview(selectedExercise)}</div>
      <label class="field-label">Matériel</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px;" id="equip-picker">
        ${EQUIPS.map((eq, i) => `<button type="button" class="btn-ghost equip-choice ${i === 0 ? "on" : ""}" data-equip="${eq.key}">${eq.label}</button>`).join("")}
      </div>
      <input type="hidden" name="equip" value="barre" />
      <p class="hint" id="equip-hint"></p>
      <button class="btn" style="margin-top:16px;" type="submit">Ajouter à la séance</button>
    `;
  }

  if (k === "newGoal" || k === "editGoal") {
    const editing = k === "editGoal";
    const goal = editing ? state.goals.find((x) => x.id === state.sheet.id) : null;
    const exercises = allExerciseNames(state.sessions);
    title = editing ? "Modifier l'objectif" : "Nouvel objectif";
    body = `
      <label class="field-label">Exercice existant</label>
      <select class="text-input" name="exercise">
        ${exercises.map((ex) => `<option value="${esc(ex)}" ${goal && goal.exercise === ex ? "selected" : ""}>${esc(ex)}</option>`).join("")}
      </select>
      <label class="field-label">Ou un autre exercice (nom libre)</label>
      <input class="text-input" name="customExercise" placeholder="Nom libre (optionnel)" value="${goal && !exercises.includes(goal.exercise) ? esc(goal.exercise) : ""}" />
      <label class="field-label">Poids cible (kg)</label>
      <input class="text-input" name="targetWeight" inputmode="decimal" placeholder="Ex : 100" value="${goal ? goal.target_weight : ""}" required />
      <label class="field-label">Répétitions visées (optionnel)</label>
      <input class="text-input" name="targetReps" inputmode="numeric" placeholder="Ex : 8" value="${goal && goal.target_reps ? goal.target_reps : ""}" />
      <button class="btn" style="margin-top:16px;" type="submit">${editing ? "Enregistrer" : "Créer l'objectif"}</button>
    `;
  }

  if (k === "newWeight" || k === "editWeight") {
    const editing = k === "editWeight";
    const w = editing ? state.weights.find((x) => x.id === state.sheet.id) : null;
    title = editing ? "Modifier la pesée" : "Nouvelle pesée";
    body = `
      <label class="field-label">Date</label>
      <input type="date" class="text-input date-input" name="date" value="${w ? w.date : new Date().toISOString().slice(0, 10)}" />
      <label class="field-label">Poids corporel (kg)</label>
      <input class="text-input" name="weight" inputmode="decimal" placeholder="Ex : 75.4" value="${w ? w.weight : ""}" required />
      <button class="btn" style="margin-top:16px;" type="submit">Enregistrer</button>
    `;
  }

  return `
  <div class="overlay" data-action="sheet-close-bg">
    <div class="sheet" data-action="sheet-stop">
      <h2 class="disp" style="margin:0 0 4px;font-size:24px;text-transform:uppercase;">${title}</h2>
      <form id="sheet-form" data-kind="${k}">${body}</form>
    </div>
  </div>`;
}

// ============================================================
// GESTION DES ÉVÉNEMENTS (délégation)
// ============================================================

root.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) {
    // clic sur le fond de l'overlay → fermer la feuille
    if (e.target.closest(".overlay") && !e.target.closest(".sheet")) {
      state.sheet = null; render();
    }
    return;
  }
  const action = el.dataset.action;

  try {
    switch (action) {
      case "tab":
        state.tab = el.dataset.tab;
        if (state.tab === "seances") state.nav = { screen: "home" };
        render();
        break;

      case "switch-user":
        switchUser();
        break;

      case "pick-user":
        await enterAs(el.dataset.name);
        break;

      case "nav-home":
        state.nav = { screen: "home" };
        render();
        break;

      case "nav-group":
        state.nav = { screen: "group", groupId: el.dataset.id };
        render();
        break;

      case "nav-exercise-history":
        state.nav = {
          screen: "exercise-history",
          groupId: el.dataset.groupId,
          exercise: el.dataset.exercise,
        };
        render();
        break;

      case "nav-session":
        state.nav = { screen: "session", sessionId: el.dataset.id };
        render();
        break;

      case "goto-stats":
        state.tab = "stats";
        state.statsGroupId = el.dataset.groupId;
        state.statsExercise = el.dataset.exercise || null;
        render();
        break;

      case "stats-group":
        state.statsGroupId = el.dataset.id;
        state.statsExercise = null;
        render();
        break;

      case "stats-exercise":
        state.statsExercise = el.dataset.exercise;
        render();
        break;

      case "compare-mode":
        state.compareMode = el.dataset.mode;
        render();
        break;

      case "sheet-open":
        state.sheet = { kind: el.dataset.sheet, id: el.dataset.id };
        render();
        setTimeout(wireSheetExtras, 0);
        break;

      case "history-stats":
        state.sheet = null;
        state.tab = "stats";
        state.statsExercise = el.dataset.exercise;
        render();
        break;

      case "sheet-close-bg":
        state.sheet = null;
        render();
        break;

      case "create-session": {
        const groupId = el.dataset.group;
        const sourceId = el.dataset.source;
        const source = sourceId ? session(sourceId) : null;
        const entries = source
          ? source.entries.map((e) => ({
              ...e, id: uid(),
              sets: e.sets.map((s) => ({ ...s, id: uid(), drops: (s.drops || []).map((d) => ({ ...d, id: uid() })) })),
            }))
          : [];
        const today = new Date().toISOString().slice(0, 10);
        const newSession = await DB.createSession(groupId, today, entries);
        state.sessions.unshift(newSession);
        state.sheet = null;
        state.nav = { screen: "session", sessionId: newSession.id };
        render();
        break;
      }

      case "session-feel": {
        const s = session(state.nav.sessionId);
        const val = s.feel === el.dataset.feel ? null : el.dataset.feel;
        await persistSession(s, { feel: val });
        render();
        break;
      }

      case "entry-feel": {
        const seg = el.closest(".seg");
        const s = session(seg.dataset.session);
        const entry = s.entries.find((x) => x.id === seg.dataset.entry);
        entry.feel = entry.feel === el.dataset.feel ? null : el.dataset.feel;
        await persistSession(s, { entries: s.entries });
        render();
        break;
      }

      case "add-set": {
        const s = session(el.dataset.session);
        const entry = s.entries.find((x) => x.id === el.dataset.entry);
        const last = entry.sets[entry.sets.length - 1];
        const isPdc = entry.equip === "pdc";
        entry.sets.push({
          id: uid(),
          weight: last ? last.weight : (isPdc ? lastBodyWeight() : 20),
          lest: last ? (last.lest || 0) : 0,
          reps: last ? last.reps : 10,
          rest: last && last.rest != null ? last.rest : 90,
          drops: [],
        });
        await persistSession(s, { entries: s.entries });
        render();
        break;
      }

      case "remove-set": {
        const s = session(el.dataset.session);
        const entry = s.entries.find((x) => x.id === el.dataset.entry);
        entry.sets = entry.sets.filter((x) => x.id !== el.dataset.set);
        await persistSession(s, { entries: s.entries });
        render();
        break;
      }

      case "add-drop": {
        const s = session(el.dataset.session);
        const entry = s.entries.find((x) => x.id === el.dataset.entry);
        const set = entry.sets.find((x) => x.id === el.dataset.set);
        set.drops = set.drops || [];
        if (entry.equip === "pdc") {
          const baseLest = set.drops.length ? set.drops[set.drops.length - 1].lest : (set.lest || 0);
          set.drops.push({ id: uid(), weight: set.weight, lest: num(baseLest) - 5, reps: 8 });
        } else {
          const base = set.drops.length ? set.drops[set.drops.length - 1].weight : set.weight;
          const reduced = Math.max(0, Math.round((num(base) * 0.7) / 2.5) * 2.5);
          const lest = entry.equip === "poulie" ? (set.lest || 0) : 0;
          set.drops.push({ id: uid(), weight: reduced, lest, reps: 8 });
        }
        await persistSession(s, { entries: s.entries });
        render();
        break;
      }

      case "remove-drop": {
        const s = session(el.dataset.session);
        const entry = s.entries.find((x) => x.id === el.dataset.entry);
        const set = entry.sets.find((x) => x.id === el.dataset.set);
        set.drops = set.drops.filter((x) => x.id !== el.dataset.drop);
        await persistSession(s, { entries: s.entries });
        render();
        break;
      }

      case "remove-exercise": {
        if (!confirm("Supprimer cet exercice de la séance ?")) break;
        const s = session(el.dataset.session);
        s.entries = s.entries.filter((x) => x.id !== el.dataset.entry);
        await persistSession(s, { entries: s.entries });
        render();
        break;
      }

      case "delete-goal": {
        if (!confirm("Supprimer cet objectif ?")) break;
        await DB.deleteGoal(el.dataset.id);
        state.goals = state.goals.filter((g) => g.id !== el.dataset.id);
        render();
        break;
      }

      case "delete-group": {
        if (!confirm("Supprimer ce groupe et toutes ses séances ?")) break;
        await DB.deleteGroup(el.dataset.id);
        state.groups = state.groups.filter((g) => g.id !== el.dataset.id);
        state.sessions = state.sessions.filter((s) => s.group_id !== el.dataset.id);
        render();
        break;
      }

      case "delete-session": {
        if (!confirm("Supprimer cette séance ?")) break;
        await DB.deleteSession(el.dataset.id);
        state.sessions = state.sessions.filter((s) => s.id !== el.dataset.id);
        render();
        break;
      }

      case "delete-weight": {
        if (!confirm("Supprimer cette pesée ?")) break;
        await DB.deleteWeight(el.dataset.id);
        state.weights = state.weights.filter((w) => w.id !== el.dataset.id);
        render();
        break;
      }
    }
  } catch (err) {
    showError(err);
  }
});

root.addEventListener("change", async (e) => {
  const el = e.target.closest("[data-action]");
  if (e.target.name === "existingExercise" && state.sheet?.kind === "newExercise") {
    state.sheet.exercise = e.target.value;
    render();
    setTimeout(wireSheetExtras, 0);
    return;
  }
  if (!el) return;
  const action = el.dataset.action;

  try {
    if (action === "change-session-date") {
      const s = session(state.nav.sessionId);
      await persistSession(s, { date: el.value });
      render();
    }

    if (action === "change-equip") {
      const s = session(el.dataset.session);
      const entry = s.entries.find((x) => x.id === el.dataset.entry);
      entry.equip = el.value;
      await persistSession(s, { entries: s.entries });
      render();
    }

    if (action === "change-value") {
      const s = session(el.dataset.session);
      const entry = s.entries.find((x) => x.id === el.dataset.entry);
      const set = entry.sets.find((x) => x.id === el.dataset.set);
      const target = el.dataset.drop ? set.drops.find((d) => d.id === el.dataset.drop) : set;
      const field = el.dataset.field;
      if (field === "rest") target.rest = parseRest(el.value);
      else target[field] = field === "reps" ? Math.round(num(el.value)) : num(el.value);
      await persistSession(s, { entries: s.entries });
      render();
    }

    if (action === "compare-session") {
      state.compareSessionIdx = parseInt(el.value, 10);
      render();
    }

    if (action === "compare-setn") {
      state.compareSetN = parseInt(el.value, 10);
      render();
    }
  } catch (err) {
    showError(err);
  }
});

root.addEventListener("submit", async (e) => {
  const form = e.target.closest("#sheet-form");
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.kind;
  const fd = new FormData(form);

  try {
    if (kind === "newGroup" || kind === "editGroup") {
      const name = fd.get("name").trim();
      const custom = fd.get("customIcon").trim();
      const icon = custom || fd.get("icon") || "🏷️";
      if (!name) return;
      if (kind === "newGroup") {
        const g = await DB.createGroup(name, icon);
        state.groups.push(g);
      } else {
        const id = state.sheet.id;
        await DB.updateGroup(id, { name, icon });
        Object.assign(group(id), { name, icon });
      }
      state.sheet = null; render();
    }

    if (kind === "newExercise") {
      const name = (fd.get("name") || fd.get("existingExercise") || "").trim();
      const equip = fd.get("equip") || "barre";
      if (!name) return;
      const s = session(state.sheet.id);
      const isPdc = equip === "pdc";
      s.entries.push({
        id: uid(), exercise: name, equip, feel: null,
        sets: [{ id: uid(), weight: isPdc ? lastBodyWeight() : 20, lest: 0, reps: 10, rest: 90, drops: [] }],
      });
      await persistSession(s, { entries: s.entries });
      state.sheet = null; render();
    }

    if (kind === "newGoal" || kind === "editGoal") {
      const custom = fd.get("customExercise").trim();
      const exercise = custom || fd.get("exercise");
      const targetWeight = num(fd.get("targetWeight"));
      const targetReps = fd.get("targetReps") ? Math.round(num(fd.get("targetReps"))) : null;
      if (!exercise || !targetWeight) return;
      if (kind === "newGoal") {
        const g = await DB.createGoal(exercise, targetWeight, targetReps);
        state.goals.push(g);
      } else {
        const id = state.sheet.id;
        await DB.updateGoal(id, { exercise, target_weight: targetWeight, target_reps: targetReps });
        Object.assign(state.goals.find((g) => g.id === id), { exercise, target_weight: targetWeight, target_reps: targetReps });
      }
      state.sheet = null; render();
    }

    if (kind === "newWeight" || kind === "editWeight") {
      const date = fd.get("date");
      const weight = num(fd.get("weight"));
      if (!weight) return;
      if (kind === "newWeight") {
        const w = await DB.createWeight(date, weight);
        state.weights.push(w);
        state.weights.sort((a, b) => a.date.localeCompare(b.date));
      } else {
        const id = state.sheet.id;
        await DB.updateWeight(id, { date, weight });
        Object.assign(state.weights.find((w) => w.id === id), { date, weight });
        state.weights.sort((a, b) => a.date.localeCompare(b.date));
      }
      state.sheet = null; render();
    }
  } catch (err) {
    showError(err);
  }
});

/** Petites interactions internes à une feuille qui ne nécessitent pas de re-render complet */
function wireSheetExtras() {
  document.querySelectorAll(".emoji-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".emoji-btn").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      document.querySelector('input[name="icon"]').value = btn.dataset.emoji;
      document.querySelector('input[name="customIcon"]').value = "";
    });
  });
  document.querySelectorAll(".equip-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".equip-choice").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      document.querySelector('input[name="equip"]').value = btn.dataset.equip;
      const hint = document.getElementById("equip-hint");
      if (btn.dataset.equip === "pdc") hint.textContent = "Le poids sera pré-rempli avec ta dernière pesée, avec une colonne lest (± kg).";
      else if (btn.dataset.equip === "poulie") hint.textContent = "Une colonne lest (± kg) sera ajoutée en plus du poids de la poulie.";
      else hint.textContent = "";
    });
  });
}

// ============================================================
// DÉMARRAGE
// ============================================================

// Code d'accès et utilisateur sont mémorisés sur l'appareil : on rentre directement.
state.accessGranted = store.get("carnet:access") === "1";
const savedProfile = store.get("carnet:profile");
if (savedProfile) {
  state.accessGranted = true;
  enterAs(savedProfile);
} else if (state.accessGranted) {
  showPicker();
} else {
  state.loading = false;
  render();
}
