async function init(){
  bindUiEvents();
  bindWhoEvents();
  bindBingoEvents();
  renderAuth();          // état déconnecté par défaut (affiche l'écran de connexion)

  await initSupabase();  // récupère la session Google et aiguille l'affichage
}

init();
