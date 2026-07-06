function showPage(p){
  document.querySelectorAll(".page").forEach(e => e.classList.add("hidden"));
  const el = $(p);
  if(el) el.classList.remove("hidden");
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.page === p));
  if(p === "admin"){ loadUsers(); loadPlayers(); }
}
window.showPage = showPage;

// Reflète l'état de connexion (Google) + le rôle admin dans toute l'UI.
function renderAuth(){
  const loggedIn = !!currentUser;

  // En-tête : bouton connexion vs bloc utilisateur + déconnexion
  $("loginBtn").classList.toggle("hidden", loggedIn);
  $("logoutBtn").classList.toggle("hidden", !loggedIn);
  $("userBox").classList.toggle("hidden", !loggedIn);

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

  // Aiguillage de page
  if(!loggedIn){
    showPage("gate");
  } else {
    const active = document.querySelector(".tab.active")?.dataset.page;
    showPage(active && active !== "gate" ? active : "bingo");
  }
}

function bindUiEvents(){
  $("loginBtn").onclick = signInWithGoogle;
  $("googleLogin").onclick = signInWithGoogle;
  $("logoutBtn").onclick = signOutUser;
  document.querySelectorAll(".tab").forEach(b => b.onclick = () => showPage(b.dataset.page));

  // Sous-onglets du dashboard admin
  document.querySelectorAll(".subtab").forEach(b => b.onclick = () => {
    document.querySelectorAll(".subtab").forEach(x => x.classList.toggle("active", x === b));
    document.querySelectorAll(".subpage").forEach(p => p.classList.add("hidden"));
    $(b.dataset.sub).classList.remove("hidden");
    if(b.dataset.sub === "adminUsers") loadUsers();
    else loadPlayers();
  });
}
