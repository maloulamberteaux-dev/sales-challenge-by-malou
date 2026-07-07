let sb = null;

async function initSupabase(){
  if(!window.SUPABASE_URL || window.SUPABASE_URL.includes("COLLE_ICI") || !window.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY.includes("COLLE_ICI")){
    $("syncStatus").textContent = "⚠️ Config Supabase manquante";
    return;
  }

  sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  // Données de jeu partagées (accessibles connecté ou non)
  await loadExcludedNames();
  await loadWho();
  await loadBingoSettings();
  await loadBattleship();
  await loadPlayers();
  updateGameStatus();

  // Réagit aux connexions / déconnexions Google
  sb.auth.onAuthStateChange((_event, session) => handleSession(session));
  const { data } = await sb.auth.getSession();
  await handleSession(data.session);

  sb.channel("game_state_changes").on("postgres_changes", {event:"*", schema:"public", table:"game_state"}, payload => {
    if(payload.new.id === "who"){
      who = payload.new.data;
      renderWho();
    }
    if(payload.new.id === "bingo_settings"){
      bingoSettings = payload.new.data;
      renderBingoSettings();
      // Partie lancée → chaque joueur connecté la rejoint (grille créée si besoin)
      if(currentPlayer && bingoActive()) openBingo();
    }
    if(payload.new.id === "battleship"){
      bs = payload.new.data;
      loadBattleship();
    }
  }).subscribe();

  // Touché-coulé : tirs et torpilles en temps réel
  sb.channel("bs_changes")
    .on("postgres_changes", {event:"*", schema:"public", table:"bs_shots"}, () => loadBattleship())
    .on("postgres_changes", {event:"*", schema:"public", table:"bs_torpedoes"}, () => loadBattleship())
    .subscribe();

  sb.channel("bingo_cards_changes").on("postgres_changes", {event:"*", schema:"public", table:"bingo_cards"}, payload => {
    // Ma grille supprimée (nouvelle partie) → j'en récupère une fraîche
    if(payload.eventType === "DELETE" && payload.old?.player === currentPlayer && bingoActive()){
      openBingo();
    }
    if(payload.new?.player === currentPlayer) renderBingo(payload.new.data);
    loadPlayers();
  }).subscribe();
}

// Applique une session (ou son absence) à toute l'app.
async function handleSession(session){
  applySession(session);
  renderAuth();
  if(currentPlayer){
    $("bingoName").textContent = currentPlayer;
    upsertPlayerProfile(); // trace la connexion dans la table players (non bloquant)
    await openBingo();
  }
  if(sb) loadBattleship(); // recharge avec le bon rôle (admin voit ses bateaux)
  if(sb) loadWhoSecret();  // secrets du Qui suis-je (réponse + photo originale, admin-only)
}

// Résout les noms d'affichage des comptes de test (pour filtrer les listes name-based)
async function loadExcludedNames(){
  const emails = (window.EXCLUDED_EMAILS || []).map(e => String(e).toLowerCase());
  if(!emails.length) return;
  const {data} = await sb.from("players").select("name,email");
  excludedNames = new Set((data || []).filter(p => emails.includes(String(p.email || "").toLowerCase())).map(p => p.name));
}

// Enregistre/actualise le profil du joueur connecté (pour l'onglet Utilisateurs de l'admin)
async function upsertPlayerProfile(){
  if(!sb || !currentUser?.email) return;
  await sb.from("players").upsert({
    email: currentUser.email.toLowerCase(),
    name: currentPlayer,
    avatar: currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || "",
    is_admin: admin,
    last_seen: new Date().toISOString()
  });
}

async function signInWithGoogle(){
  if(!sb){ alert("Connexion au serveur en cours, réessaie dans un instant."); return; }
  const redirectTo = location.origin + location.pathname;
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if(error){
    console.error(error);
    alert("Connexion Google impossible : " + error.message);
  }
}

async function signOutUser(){
  if(sb) await sb.auth.signOut();
  await handleSession(null);
}

async function saveGame(id, data){
  if(!sb){
    $("syncStatus").textContent = "⚠️ Connexion Supabase absente";
    return false;
  }
  const {error} = await sb.from("game_state").upsert({id, data, updated_at: new Date().toISOString()});
  if(error){
    console.error(error);
    $("syncStatus").textContent = "⚠️ Sauvegarde impossible";
    alert("Sauvegarde impossible : " + error.message);
    return false;
  }
  if(typeof updateGameStatus === "function") updateGameStatus();
  return true;
}
