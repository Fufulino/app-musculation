// ============================================================
// Connexion à Supabase : accès aux données (sans compte ni mot de passe).
// Nécessite que config.js ait été renseigné et que le script
// CDN @supabase/supabase-js soit chargé avant ce fichier.
// Chaque ligne de donnée porte le prénom de l'utilisateur (profile_name).
// ============================================================

// Pas d'authentification : on ne garde aucune session dans le navigateur.
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const activeProfile = () => window.ACTIVE_PROFILE || "";

const DB = {
  // ---------- Utilisateurs ----------
  async fetchUsers() {
    const { data, error } = await sb.from("app_users").select("name").order("name");
    if (error) throw error;
    return data;
  },
  async addUser(name) {
    const { error } = await sb.from("app_users").insert({ name });
    if (error) throw error;
  },

  // ---------- Groupes ----------
  async fetchGroups() {
    const { data, error } = await sb.from("groups").select("*").eq("profile_name", activeProfile()).order("created_at");
    if (error) throw error;
    return data;
  },
  async createGroup(name, icon) {
    const { data, error } = await sb
      .from("groups")
      .insert({ name, icon, profile_name: activeProfile() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateGroup(id, fields) {
    const { error } = await sb.from("groups").update(fields).eq("id", id).eq("profile_name", activeProfile());
    if (error) throw error;
  },
  async deleteGroup(id) {
    const { error } = await sb.from("groups").delete().eq("id", id).eq("profile_name", activeProfile());
    if (error) throw error;
  },

  // ---------- Séances ----------
  async fetchSessions() {
    const { data, error } = await sb.from("sessions").select("*").eq("profile_name", activeProfile()).order("date", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createSession(groupId, date, entries) {
    const { data, error } = await sb
      .from("sessions")
      .insert({ group_id: groupId, date, entries: entries ?? [], profile_name: activeProfile() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  /** fields peut contenir { date, feel, entries } */
  async updateSession(id, fields) {
    const { error } = await sb.from("sessions").update(fields).eq("id", id).eq("profile_name", activeProfile());
    if (error) throw error;
  },
  async deleteSession(id) {
    const { error } = await sb.from("sessions").delete().eq("id", id).eq("profile_name", activeProfile());
    if (error) throw error;
  },

  // ---------- Objectifs ----------
  async fetchGoals() {
    const { data, error } = await sb.from("goals").select("*").eq("profile_name", activeProfile()).order("created_at");
    if (error) throw error;
    return data;
  },
  async createGoal(exercise, targetWeight, targetReps) {
    const { data, error } = await sb
      .from("goals")
      .insert({ exercise, target_weight: targetWeight, target_reps: targetReps, profile_name: activeProfile() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateGoal(id, fields) {
    const { error } = await sb.from("goals").update(fields).eq("id", id).eq("profile_name", activeProfile());
    if (error) throw error;
  },
  async deleteGoal(id) {
    const { error } = await sb.from("goals").delete().eq("id", id).eq("profile_name", activeProfile());
    if (error) throw error;
  },

  // ---------- Pesées ----------
  async fetchWeights() {
    const { data, error } = await sb.from("body_weights").select("*").eq("profile_name", activeProfile()).order("date");
    if (error) throw error;
    return data;
  },
  async createWeight(date, weight) {
    const { data, error } = await sb
      .from("body_weights")
      .insert({ date, weight, profile_name: activeProfile() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateWeight(id, fields) {
    const { error } = await sb.from("body_weights").update(fields).eq("id", id).eq("profile_name", activeProfile());
    if (error) throw error;
  },
  async deleteWeight(id) {
    const { error } = await sb.from("body_weights").delete().eq("id", id).eq("profile_name", activeProfile());
    if (error) throw error;
  },
};
