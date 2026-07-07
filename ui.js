let authLanded = false; // a-t-on déjà placé l'utilisateur sur sa page d'accueil ?

function showPage(p){
  document.querySelectorAll(".page").forEach(e => e.classList.add("hidden"));
  const el = $(p);
  if(el) el.classList.remove("hidden");
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.page === p));
  if(p === "admin"){ loadUsers(); loadPlayers(); }
  if(p === "board"){ loadLeaderboard(); }
  if(p === "battleship"){ loadBattleship(); }
}
window.showPage = showPage;

// Reflète l'état de connexion (Google) + le rôle admin dans toute l'UI.
function renderAuth(){
  const loggedIn = !!currentUser;

  // Déconnecté → la landing est le héros de la page, on masque l'en-tête (doublon)
  document.querySelector(".hero").classList.toggle("hidden", !loggedIn);

  // En-tête : bouton connexion vs bloc utilisateur + déconnexion
  $("loginBtn").classList.toggle("hidden", loggedIn);
  $("logoutBtn").classList.toggle("hidden", !loggedIn);
  $("userBox").classList.toggle("hidden", !loggedIn);

  // Bouton "vue joueur" (uniquement pour un vrai admin, pour tester)
  const vt = $("viewToggle");
  if(vt){
    vt.classList.toggle("hidden", !realAdmin);
    vt.textContent = viewAsPlayer ? "👑 Repasser admin" : "👀 Vue joueur";
    vt.classList.toggle("testOn", viewAsPlayer);
  }

  if(loggedIn){
    $("userName").textContent = currentPlayer;
    const avatar = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || "";
    const img = $("userAvatar");
    if(avatar){ img.src = avatar; img.style.display = "block"; }
    else { img.removeAttribute("src"); img.style.display = "none"; }
    $("adminBadge").classList.toggle("hidden", !admin);
    const tag = $("playerTagName");
    if(tag) tag.textContent = currentPlayer;
  }

  // Onglets visibles seulement une fois connecté
  $("tabs").classList.toggle("hidden", !loggedIn);
  // Options réservées à l'admin
  document.querySelectorAll(".adminOnly").forEach(e => e.classList.toggle("hidden", !admin));

  // Texte d'ambiance
  $("modeText").textContent = !loggedIn
    ? "🔓 Connecte-toi avec Google pour entrer dans la partie."
    : (admin
        ? "👑 Mode admin — tu pilotes les jeux en direct."
        : "🎮 Prêt(e) à jouer ? Choisis ton défi et fais monter le score !");

  // Les vues de jeu dépendent du rôle (joueur/admin) → re-rendu
  if(typeof renderBingoAvailability === "function") renderBingoAvailability();
  if(typeof renderWho === "function" && sb) renderWho();

  // Aiguillage de page — atterrissage une seule fois par connexion
  if(!loggedIn){
    authLanded = false;
    showPage("gate");
  } else if(!authLanded){
    authLanded = true;
    // Admin → Dashboard admin ; joueur → Classement
    showPage(admin ? "admin" : "board");
  }
}

function bindUiEvents(){
  $("loginBtn").onclick = signInWithGoogle;
  $("googleLogin").onclick = signInWithGoogle;
  $("logoutBtn").onclick = signOutUser;
  $("viewToggle").onclick = () => {
    setViewAsPlayer(!viewAsPlayer);
    authLanded = false;              // ré-atterrit sur la page adaptée au rôle
    renderAuth();
    if(sb) loadBattleship();         // recharge les vues dépendantes du rôle
  };
  document.querySelectorAll(".tab").forEach(b => b.onclick = () => showPage(b.dataset.page));

  // Sous-onglets du dashboard admin
  document.querySelectorAll(".subtab").forEach(b => b.onclick = () => {
    document.querySelectorAll(".subtab").forEach(x => x.classList.toggle("active", x === b));
    document.querySelectorAll(".subpage").forEach(p => p.classList.add("hidden"));
    $(b.dataset.sub).classList.remove("hidden");
    if(b.dataset.sub === "adminUsers") loadUsers();
    else if(b.dataset.sub === "adminBingos") loadPlayers();
    else if(b.dataset.sub === "adminHistory") loadHistory();
  });
}
