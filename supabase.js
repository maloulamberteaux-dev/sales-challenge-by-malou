let sb = null;

async function initSupabase(){
  if(!window.SUPABASE_URL || window.SUPABASE_URL.includes("COLLE_ICI") || !window.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY.includes("COLLE_ICI")){
    $("syncStatus").textContent = "⚠️ Config Supabase manquante";
    return;
  }

  sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  $("syncStatus").textContent = "✅ En ligne — que la partie commence !";

  // Données de jeu partagées (accessibles connecté ou non)
  await loadWho();
  await loadBingoSettings();
  await loadPlayers();

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
      if(currentPlayer) loadBingo(currentPlayer);
    }
  }).subscribe();

  sb.channel("bingo_cards_changes").on("postgres_changes", {event:"*", schema:"public", table:"bingo_cards"}, payload => {
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
  $("syncStatus").textContent = "✅ Synchronisé";
  return true;
}
