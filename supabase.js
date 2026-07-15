let sb = null;

// Workspace courant (équipe) — toutes les requêtes sont filtrées dessus
function WS(){ return currentWorkspace; }
function avatarOf(u){ return u?.user_metadata?.avatar_url || u?.user_metadata?.picture || ""; }

async function initSupabase(){
  if(!window.SUPABASE_URL || window.SUPABASE_URL.includes("COLLE_ICI") || !window.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY.includes("COLLE_ICI")){
    $("syncStatus").textContent = "⚠️ Config Supabase manquante";
    return;
  }

  sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  // Temps réel (filtré par workspace dans les handlers)
  sb.channel("game_state_changes").on("postgres_changes", {event:"*", schema:"public", table:"game_state"}, payload => {
    if(payload.new?.workspace_id !== currentWorkspace) return;
    if(payload.new.id === "who"){ who = payload.new.data; renderWho(); }
    if(payload.new.id === "bingo_settings"){
      bingoSettings = payload.new.data;
      renderBingoSettings();
      if(currentPlayer && bingoActive()) openBingo();
    }
    if(payload.new.id === "battleship"){ bs = payload.new.data; loadBattleship(); }
  }).subscribe();

  sb.channel("bs_changes")
    .on("postgres_changes", {event:"*", schema:"public", table:"bs_shots"}, p => { if(p.new?.workspace_id === currentWorkspace || p.old) loadBattleship(); })
    .on("postgres_changes", {event:"*", schema:"public", table:"bs_torpedoes"}, p => { if(p.new?.workspace_id === currentWorkspace || p.old) loadBattleship(); })
    .subscribe();

  sb.channel("bingo_cards_changes").on("postgres_changes", {event:"*", schema:"public", table:"bingo_cards"}, payload => {
    const wsOk = (payload.new?.workspace_id ?? payload.old?.workspace_id) === currentWorkspace;
    if(!wsOk) return;
    if(payload.eventType === "DELETE" && payload.old?.player === currentPlayer && bingoActive()) openBingo();
    if(payload.new?.player === currentPlayer) renderBingo(payload.new.data);
    loadPlayers();
  }).subscribe();

  // Membres : demandes d'assignation en temps réel (pour l'admin)
  sb.channel("players_changes").on("postgres_changes", {event:"*", schema:"public", table:"players"}, () => {
    if(admin && typeof loadPending === "function") loadPending();
  }).subscribe();

  // Réagit aux connexions / déconnexions Google
  sb.auth.onAuthStateChange((_event, session) => handleSession(session));
  const { data } = await sb.auth.getSession();
  await handleSession(data.session);
}

// Applique une session : identité → workspace/rôle → chargement des jeux du workspace
async function handleSession(session){
  applySession(session);
  if(currentUser) await resolveMember();
  else applyMember(null);
  // Super admin sans workspace assigné → il entre dans le premier
  if(superAdmin && currentUser && !currentWorkspace){
    await loadWorkspaces();
    currentWorkspace = allWorkspaces[0]?.id || null;
  }
  renderAuth();
  if(currentUser && currentWorkspace) await enterWorkspaceData();
  else updateGameStatus();
}

// Charge toutes les données du workspace courant (jeux, membres, classements)
async function enterWorkspaceData(){
  if(!sb || !currentWorkspace) return;
  $("bingoName").textContent = currentPlayer;
  await loadExcludedNames();
  await loadWho();
  await loadBingoSettings();
  await loadBattleship();
  await loadPlayers();
  await loadWhoSecret();
  await openBingo();
  updateGameStatus();
}

// Fiche membre : workspace + rôle + statut. Crée une fiche "en attente" si nouveau.
async function resolveMember(){
  const email = currentUser.email.toLowerCase();
  let { data } = await sb.from("players").select("*").eq("email", email).maybeSingle();
  if(!data){
    // Nouveau : en attente, SANS workspace (on force null pour ignorer le défaut WS#1)
    const row = { email, name: currentPlayer, avatar: avatarOf(currentUser), role: "member", status: "pending", workspace_id: null, last_seen: new Date().toISOString() };
    await sb.from("players").insert(row);
    data = row;
  } else {
    // MAJ légère du profil, sans toucher au rôle / workspace / statut
    await sb.from("players").update({ name: currentPlayer, avatar: avatarOf(currentUser), last_seen: new Date().toISOString() }).eq("email", email);
  }
  applyMember(data);
}

// Admins de MON workspace + super admins → hors classement ; comptes de test exclus
async function loadExcludedNames(){
  const { data } = await sb.from("players").select("name,email,role,workspace_id");
  const players = data || [];
  const excl = (window.EXCLUDED_EMAILS || []).map(e => String(e).toLowerCase());
  const supers = (window.SUPER_ADMIN_EMAILS || []).map(e => String(e).toLowerCase());
  excludedNames = new Set(players.filter(p => excl.includes(String(p.email || "").toLowerCase())).map(p => p.name));
  adminNames = new Set(players.filter(p =>
    supers.includes(String(p.email || "").toLowerCase()) ||
    (p.role === "admin" && p.workspace_id === currentWorkspace)
  ).map(p => p.name));
}

async function signInWithGoogle(){
  if(!sb){ alert("Connexion au serveur en cours, réessaie dans un instant."); return; }
  const redirectTo = location.origin + location.pathname;
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if(error){ console.error(error); alert("Connexion Google impossible : " + error.message); }
}

async function signOutUser(){
  if(sb) await sb.auth.signOut();
  await handleSession(null);
}

async function saveGame(id, data){
  if(!sb){ $("syncStatus").textContent = "⚠️ Connexion Supabase absente"; return false; }
  const {error} = await sb.from("game_state").upsert({id, workspace_id: WS(), data, updated_at: new Date().toISOString()});
  if(error){
    console.error(error);
    $("syncStatus").textContent = "⚠️ Sauvegarde impossible";
    alert("Sauvegarde impossible : " + error.message);
    return false;
  }
  if(typeof updateGameStatus === "function") updateGameStatus();
  return true;
}
