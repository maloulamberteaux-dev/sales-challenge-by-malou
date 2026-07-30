let authLanded = false; // a-t-on déjà placé l'utilisateur sur sa page d'accueil ?

// Indique dans l'en-tête quelles parties sont en cours (à la place de "Synchronisé")
function updateGameStatus(){
  const el = $("syncStatus");
  if(!el) return;
  const live = [];
  if(typeof who !== "undefined" && who && who.live) live.push("🎭 Qui suis-je");
  if(typeof bingoSettings !== "undefined" && bingoSettings && bingoSettings.active) live.push("💜 Bingo");
  if(typeof bs !== "undefined" && bs && bs.live) live.push("🚢 Touché-coulé");
  if(typeof oie !== "undefined" && oie && oie.live) live.push("🪿 Jeu de l'Oie");
  el.textContent = live.length ? "🔴 En cours : " + live.join(" · ") : "💤 Aucune partie en cours";
  el.classList.toggle("statusLive", live.length > 0);
}

function showPage(p){
  document.querySelectorAll(".page").forEach(e => e.classList.add("hidden"));
  const el = $(p);
  if(el) el.classList.remove("hidden");
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.page === p));
  if(p === "admin"){ loadUsers(); loadPlayers(); }
  if(p === "board"){ loadLeaderboard(); }
  if(p === "battleship"){ loadBattleship(); }
  if(p === "oie"){ loadOie(); }
}
window.showPage = showPage;

// Reflète l'état (connexion / onboarding / workspace / rôle) dans toute l'UI.
function renderAuth(){
  const loggedIn = !!currentUser;
  const onboard = (typeof needsOnboarding === "function") && needsOnboarding();

  document.querySelector(".hero").classList.toggle("hidden", !loggedIn);
  $("loginBtn").classList.toggle("hidden", loggedIn);
  $("logoutBtn").classList.toggle("hidden", !loggedIn);
  $("userBox").classList.toggle("hidden", !loggedIn);

  const vt = $("viewToggle");
  if(vt){
    vt.classList.toggle("hidden", !realAdmin || onboard);
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

  // Sélecteur d'équipe (super admin) + éléments réservés au super admin
  if(typeof renderWorkspaceSwitcher === "function") renderWorkspaceSwitcher();
  document.querySelectorAll(".superOnly").forEach(e => e.classList.toggle("hidden", !superAdmin));

  // Onglets visibles une fois dans un workspace (pas pendant l'onboarding)
  $("tabs").classList.toggle("hidden", !loggedIn || onboard);
  document.querySelectorAll(".adminOnly").forEach(e => e.classList.toggle("hidden", !admin));

  $("modeText").textContent = !loggedIn
    ? "🔓 Connecte-toi avec Google pour entrer dans la partie."
    : onboard ? "👋 Choisis ou crée ton équipe pour commencer."
    : (admin ? "👑 Mode admin — tu pilotes les jeux en direct." : "🎮 Prêt(e) à jouer ? Choisis ton défi et fais monter le score !");

  if(typeof renderBingoAvailability === "function") renderBingoAvailability();
  if(typeof renderWho === "function" && sb) renderWho();
  if(admin && typeof loadPending === "function") loadPending();

  // Routage : gate → onboarding → app
  if(!loggedIn){
    authLanded = false;
    showPage("gate");
  } else if(onboard){
    authLanded = false;
    showPage("onboarding");
    if(typeof renderOnboarding === "function") renderOnboarding();
  } else if(!authLanded){
    authLanded = true;
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
    else if(b.dataset.sub === "adminPending") loadPending();
    else if(b.dataset.sub === "adminGains") loadGains();
    else if(b.dataset.sub === "adminBingos") loadPlayers();
    else if(b.dataset.sub === "adminHistory") loadHistory();
    else if(b.dataset.sub === "adminWorkspaces") loadWorkspacesOverview();
  });
}
