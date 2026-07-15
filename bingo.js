let bingoSettings = {size:4, reward:"50 € pour le premier Bingo", tasks:["3 recos prises dans la journée", "2 abos dans une démo groupée", "Faire une blague dans un call", "6 abos dans la journée"], active:false};
let hadBingo = false; // pour ne lancer les confettis qu'au moment du bingo

function bingoActive(){ return !!bingoSettings.active; }

// Affiche soit la grille (partie en cours), soit l'écran d'attente
function renderBingoAvailability(){
  const active = bingoActive();
  const wait = $("bingoWait");
  if(!wait) return;
  wait.classList.toggle("hidden", active);
  $("bingoPlay").classList.toggle("hidden", !active);
  $("resetMyBingo").classList.toggle("hidden", !active);
  $("bingoWaitTxt").textContent = admin
    ? "Règle la taille, le gain et les missions dans le panneau, puis lance la partie 🚀"
    : "L'admin prépare la prochaine partie... reste connecté(e) 🔥";
  $("bingoSpinner").classList.toggle("hidden", admin); // roue d'attente pour les joueurs
  $("launchBingo").classList.toggle("hidden", active);
  $("endBingo").classList.toggle("hidden", !active);
  $("bingoLiveChip").textContent = active ? "🟢 Partie en cours" : "💤 Aucune partie";
  if(!active){
    $("statDone").textContent = "0";
    $("statLeft").textContent = "0";
    $("statRank").textContent = "🐣";
    $("statRankLabel").textContent = "Rookie";
    $("bingoBar").style.width = "0%";
  }
  if(typeof updateGameStatus === "function") updateGameStatus();
}

async function loadBingoSettings(){
  let {data, error} = await sb.from("game_state").select("data").eq("id", "bingo_settings").eq("workspace_id", WS()).maybeSingle();
  if(error) return;
  if(data) bingoSettings = data.data;
  renderBingoSettings();
}

function renderBingoSettings(){
  $("bingoSize").value = bingoSettings.size || 4;
  $("bingoReward").value = bingoSettings.reward || "50 € pour le premier Bingo";
  $("bingoTasks").value = (bingoSettings.tasks || []).join("\n");
  $("rewardTxt").textContent = "🏆 " + (bingoSettings.reward || "50 € pour le premier Bingo");
  renderBingoLayout();
  renderBingoAvailability();
}

// --- Disposition des cases (l'admin choisit la mission de chaque case) ---

function bingoTasksFromUI(){
  return $("bingoTasks").value.split("\n").map(x => x.trim()).filter(Boolean);
}

function bingoLayoutFromUI(){
  return [...document.querySelectorAll("#bingoLayout select")].map(s => s.value);
}

function renderBingoLayout(){
  const box = $("bingoLayout");
  if(!box) return;
  const ordered = bingoSettings.ordered === true; // par défaut : grille UNIQUE par joueur
  if($("bingoOrderMode")) $("bingoOrderMode").textContent = ordered
    ? "📋 Grille identique pour tous (ordre défini)"
    : "🎲 Grille mélangée par joueur";
  box.classList.toggle("hidden", !ordered);
  if(!ordered) return;

  const n = +$("bingoSize").value || bingoSettings.size || 4;
  const tasks = bingoTasksFromUI();
  const layout = bingoSettings.layout || [];
  box.style.gridTemplateColumns = `repeat(${n},1fr)`;
  box.innerHTML = "";
  for(let i = 0; i < n * n; i++){
    const sel = document.createElement("select");
    sel.title = `Case ${i + 1}`;
    tasks.forEach(t => {
      const o = document.createElement("option");
      o.value = t; o.textContent = t;
      sel.appendChild(o);
    });
    // pré-remplissage : disposition sauvegardée, sinon les missions dans l'ordre
    const pre = (layout[i] && tasks.includes(layout[i])) ? layout[i] : (tasks[i % (tasks.length || 1)] || "");
    sel.value = pre;
    sel.onchange = () => { bingoSettings.layout = bingoLayoutFromUI(); };
    box.appendChild(sel);
  }
  bingoSettings.layout = bingoLayoutFromUI();
}

async function loadBingo(player){
  let {data} = await sb.from("bingo_cards").select("data").eq("player", player).eq("workspace_id", WS()).maybeSingle();
  if(data) renderBingo(data.data);
}

// Rejoint la partie en cours : récupère sa grille, ou en crée une
async function openBingo(){
  renderBingoAvailability();
  let p = currentPlayer;
  if(!p || !bingoActive()) return;
  $("bingoName").textContent = p;

  let {data} = await sb.from("bingo_cards").select("data").eq("player", p).eq("workspace_id", WS()).maybeSingle();
  if(data){
    renderBingo(data.data);
  } else {
    let card = createBingoCard();
    await sb.from("bingo_cards").insert({player:p, data:card, workspace_id:WS()});
    renderBingo(card);
  }
}

function createBingoCard(){
  let size = bingoSettings.size || 4;
  // Grille identique pour tous : on suit la disposition définie par l'admin
  const layout = bingoSettings.layout || [];
  if(bingoSettings.ordered === true && layout.length === size * size){
    return {size, reward:bingoSettings.reward, cells:layout.map(t => ({t, checked:false}))};
  }
  // Sinon : mélange propre à chaque joueur
  let tasks = shuffle(bingoSettings.tasks || []).slice(0, size * size);
  return {size, reward:bingoSettings.reward, cells:tasks.map(t => ({t, checked:false}))};
}

function renderBingo(card){
  $("bingoName").textContent = currentPlayer || "...";
  $("rewardTxt").textContent = "🏆 " + (card.reward || bingoSettings.reward);
  let n = card.size || 4;
  let b = $("bingoBoard");
  b.style.gridTemplateColumns = `repeat(${n},1fr)`;
  b.innerHTML = "";

  card.cells.forEach((it) => {
    let c = document.createElement("button");
    c.className = "bingoCell";
    c.innerHTML = `<span class="cellTxt">${esc(it.t)}</span><span class="tick">✓</span>`;
    if(it.checked) c.classList.add("checked");
    c.onclick = async () => {
      // Bascule en place (pas de re-render complet → animations fluides)
      it.checked = !it.checked;
      c.classList.toggle("checked", it.checked);
      if(it.checked){
        c.classList.remove("pop");
        void c.offsetWidth; // relance l'animation
        c.classList.add("pop");
      }
      updateBingoStats(card);
      checkBingo(n);
      await sb.from("bingo_cards").upsert({player:currentPlayer, data:card, workspace_id:WS(), updated_at:new Date().toISOString()});
    };
    b.appendChild(c);
  });
  updateBingoStats(card);
  checkBingo(n);
}

// Met à jour les compteurs, le rang et la barre de progression du panneau
function updateBingoStats(card){
  const cells = card.cells || [];
  const total = cells.length;
  const done = cells.filter(c => c.checked).length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const r = rankFor(pct, hasBingoCard(card));
  $("statDone").textContent = done;
  $("statLeft").textContent = total - done;
  $("statRank").textContent = r.e;
  $("statRankLabel").textContent = r.l;
  $("bingoBar").style.width = pct + "%";
}

function checkBingo(n){
  let c = [...document.querySelectorAll(".bingoCell")];
  c.forEach(x => x.classList.remove("win"));
  let lines = [];
  for(let r = 0; r < n; r++) lines.push([...Array(n)].map((_, i) => r * n + i));
  for(let col = 0; col < n; col++) lines.push([...Array(n)].map((_, i) => i * n + col));
  lines.push([...Array(n)].map((_, i) => i * n + i));
  lines.push([...Array(n)].map((_, i) => i * n + n - 1 - i));

  for(let l of lines){
    if(l.every(i => c[i]?.classList.contains("checked"))){
      l.forEach(i => c[i].classList.add("win"));
      $("bingoMsg").textContent = "🎉 BINGOOOOOO !!!";
      if(!hadBingo){
        confetti();
        recordBingoWin(); // victoire comptabilisée au classement
      }
      hadBingo = true;
      return;
    }
  }
  hadBingo = false;
  const done = document.querySelectorAll(".bingoCell.checked").length;
  const total = c.length || 1;
  if(done === 0) $("bingoMsg").textContent = "🔥 Coche ta première mission pour lancer la partie !";
  else if(done / total < .5) $("bingoMsg").textContent = "💪 C'est parti, continue comme ça !";
  else $("bingoMsg").textContent = "⚡ Ça chauffe, le Bingo se rapproche !";
}

// Enregistre la victoire de la manche en cours (1 seule fois par joueur et par manche)
async function recordBingoWin(){
  if(!sb || !currentPlayer) return;
  if(isExcludedEmail(currentUser?.email) || isMeAdmin()) return; // admins / comptes de test : pas de victoire enregistrée
  const round = bingoSettings.startedAt || "";
  await sb.from("results").upsert({game:"bingo", player:currentPlayer, round, reward:bingoSettings.reward || "", workspace_id:WS()}, {ignoreDuplicates:true});
}

// Archive la partie bingo en cours (scoreboard complet) dans l'historique
async function archiveBingoGame(){
  if(!sb) return;
  const {data} = await sb.from("bingo_cards").select("player,data").eq("workspace_id", WS());
  if(!data || !data.length) return; // rien à archiver
  const scoreboard = data.map(r => {
    const cells = r.data.cells || [];
    const total = cells.length, done = cells.filter(c => c.checked).length;
    return {player:r.player, done, total, pct: total ? Math.round(done / total * 100) : 0, win: hasBingoCard(r.data)};
  }).sort((a, b) => (b.win - a.win) || (b.pct - a.pct));
  const winner = scoreboard.find(s => s.win)?.player || "";
  await sb.from("game_history").insert({
    game:"bingo",
    workspace_id: WS(),
    round: bingoSettings.startedAt || "",
    started_at: bingoSettings.startedAt || null,
    winner,
    data: {scoreboard, reward: bingoSettings.reward, size: bingoSettings.size, players: scoreboard.length}
  });
}

// --- Listes admin ---

// Grilles bingo de tous les joueurs, triées par progression
async function loadPlayers(){
  if(!sb) return;
  let {data} = await sb.from("bingo_cards").select("player,data").eq("workspace_id", WS()).order("updated_at", {ascending:false});
  let rows = (data || []).filter(r => !isExcludedName(r.player)).map(r => {
    const cells = r.data.cells || [];
    const total = cells.length, done = cells.filter(c => c.checked).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    return {player:r.player, total, done, pct, win:hasBingoCard(r.data)};
  }).sort((a, b) => (b.win - a.win) || (b.pct - a.pct));

  $("adminPlayers").innerHTML = rows.map(r => {
    const rk = rankFor(r.pct, r.win);
    return `<div class="playerCard">
      <div class="pInfo">
        <strong>${r.win ? "👑" : "💜"} ${esc(r.player)}</strong>
        <small>${r.done}/${r.total} missions · ${rk.l}</small>
        <div class="bar mini"><div style="width:${r.pct}%"></div></div>
      </div>
      <span class="rank">${rk.e}</span>
    </div>`;
  }).join("") || "<p>Aucune grille ouverte pour l'instant 💤</p>";
}

// --- Gestion des membres de l'équipe (admin) ---
let _usersCache = [];

async function loadUsers(){
  if(!sb) return;
  // Admins d'abord, puis par nom
  let {data, error} = await sb.from("players").select("*").eq("workspace_id", WS()).eq("status", "active").order("role").order("name");
  if(error){
    $("usersList").innerHTML = "<p>⚠️ Table <b>players</b> absente — lance le SQL de setup.</p>";
    return;
  }
  _usersCache = (data || []).filter(u => !isExcludedEmail(u.email));
  renderUsersList();
  // Alerte demandes en attente (raccourci vers l'onglet À valider)
  const { data: pend } = await sb.from("players").select("email").eq("requested_workspace_id", WS()).eq("status", "pending");
  const alertBox = $("usersPendingAlert");
  if(alertBox){
    const n = (pend || []).length;
    alertBox.classList.toggle("hidden", !n);
    alertBox.innerHTML = n ? `👋 <b>${n} demande(s)</b> en attente de validation. <button class="small" id="goPending">Voir</button>` : "";
    const go = $("goPending");
    if(go) go.onclick = () => document.querySelector('[data-sub="adminPending"]')?.click();
  }
}

function renderUsersList(){
  const q = ($("usersSearch")?.value || "").toLowerCase().trim();
  const list = _usersCache.filter(u => !q || (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q));
  const admins = _usersCache.filter(u => u.role === "admin").length;
  if($("usersSummary")) $("usersSummary").textContent = `👥 ${_usersCache.length} membre(s) · 👑 ${admins} admin(s)`;

  const me = (currentUser?.email || "").toLowerCase();
  $("usersList").innerHTML = list.map(u => {
    const isMe = (u.email || "").toLowerCase() === me;
    const isAdm = u.role === "admin";
    const roleChip = `<span class="roleChip ${isAdm ? "adm" : ""}">${isAdm ? "👑 Admin" : "Membre"}</span>`;
    const actions = (admin && !isMe) ? `<div class="uActions">
      <button class="small ghost" data-role="${esc(u.email)}" data-to="${isAdm ? "member" : "admin"}">${isAdm ? "⬇️ Rétrograder" : "👑 Promouvoir"}</button>
      <button class="small ghost danger" data-remove="${esc(u.email)}" title="Retirer de l'équipe">🗑️</button></div>` : "";
    return `<div class="playerCard userCard">
      ${u.avatar ? `<img src="${esc(u.avatar)}" class="pAvatar" alt=""/>` : `<div class="pAvatar fallback">${esc((u.name || "?")[0].toUpperCase())}</div>`}
      <div class="pInfo">
        <strong>${esc(u.name || u.email)}${isMe ? " (toi)" : ""} ${roleChip}</strong>
        <small>${esc(u.email)}</small>
        <small>🕐 ${timeAgo(u.last_seen)}</small>
      </div>
      ${actions}
    </div>`;
  }).join("") || `<p class="emptyBoard">${q ? "Aucun membre ne correspond 🔍" : "Personne dans l'équipe pour l'instant 💤"}</p>`;
  $("usersList").querySelectorAll("button[data-role]").forEach(b => b.onclick = () => setMemberRole(b.dataset.role, b.dataset.to));
  $("usersList").querySelectorAll("button[data-remove]").forEach(b => b.onclick = () => removeMember(b.dataset.remove));
}

function bindBingoEvents(){
  // Sauvegarde les réglages sans toucher à l'état de la partie
  $("saveBingoSettings").onclick = async () => {
    bingoSettings = {
      ...bingoSettings,
      size:+$("bingoSize").value,
      reward:$("bingoReward").value,
      tasks:bingoTasksFromUI(),
      ordered:bingoSettings.ordered === true,
      layout:bingoLayoutFromUI()
    };
    await saveGame("bingo_settings", bingoSettings);
    renderBingoSettings();
  };

  // Bascule : grille identique (ordre défini) / grille mélangée par joueur
  $("bingoOrderMode").onclick = () => {
    bingoSettings.ordered = !bingoSettings.ordered;
    renderBingoLayout();
  };
  $("bingoSize").onchange = () => renderBingoLayout();
  $("bingoTasks").oninput = () => {
    clearTimeout(bindBingoEvents._lt);
    bindBingoEvents._lt = setTimeout(renderBingoLayout, 400);
  };

  // Lance une nouvelle partie : grilles fraîches pour tout le monde
  $("launchBingo").onclick = async () => {
    if(!confirm("Lancer une nouvelle partie ? Les grilles de tout le monde seront réinitialisées.")) return;
    if(bingoActive()) await archiveBingoGame(); // sauvegarde la partie précédente
    bingoSettings = {
      size:+$("bingoSize").value,
      reward:$("bingoReward").value,
      tasks:bingoTasksFromUI(),
      ordered:bingoSettings.ordered === true,
      layout:bingoLayoutFromUI(),
      active:true,
      startedAt:new Date().toISOString()
    };
    await sb.from("bingo_cards").delete().eq("workspace_id", WS());
    await saveGame("bingo_settings", bingoSettings);
    renderBingoSettings();
    if(currentPlayer) await openBingo();
    loadPlayers();
  };

  // Termine la partie en cours (archivée dans l'historique)
  $("endBingo").onclick = async () => {
    if(!confirm("Terminer la partie en cours ?")) return;
    await archiveBingoGame();
    bingoSettings.active = false;
    await saveGame("bingo_settings", bingoSettings);
    renderBingoAvailability();
    if(typeof loadHistory === "function") loadHistory();
  };

  $("resetMyBingo").onclick = async () => {
    if(!currentPlayer || !bingoActive()) return;
    await sb.from("bingo_cards").delete().eq("player", currentPlayer).eq("workspace_id", WS());
    await openBingo();
  };
}
