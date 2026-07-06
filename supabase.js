let sb = null;

async function initSupabase(){
  if(!window.SUPABASE_URL || window.SUPABASE_URL.includes("COLLE_ICI") || !window.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY.includes("COLLE_ICI")){
    $("syncStatus").textContent = "⚠️ Config Supabase manquante";
    return;
  }

  sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  $("syncStatus").textContent = "✅ Connecté à Supabase";

  await loadWho();
  await loadBingoSettings();
  await loadPlayers();

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

async function saveGame(id, data){
  await sb.from("game_state").upsert({id, data, updated_at: new Date().toISOString()});
}
