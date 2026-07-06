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
}

async function loadBingoSettings(){
  let {data, error} = await sb.from("game_state").select("data").eq("id", "bingo_settings").single();
  if(error) return;
  if(data) bingoSettings = data.data;
  renderBingoSettings();
}

function renderBingoSettings(){
  $("bingoSize").value = bingoSettings.size || 4;
  $("bingoReward").value = bingoSettings.reward || "50 € pour le premier Bingo";
  $("bingoTasks").value = (bingoSettings.tasks || []).join("\n");
  $("rewardTxt").textContent = "🏆 " + (bingoSettings.reward || "50 € pour le premier Bingo");
  renderBingoAvailability();
}

async function loadBingo(player){
  let {data} = await sb.from("bingo_cards").select("data").eq("player", player).maybeSingle();
  if(data) renderBingo(data.data);
}

// Rejoint la partie en cours : récupère sa grille, ou en crée une
async function openBingo(){
  renderBingoAvailability();
  let p = currentPlayer;
  if(!p || !bingoActive()) return;
  $("bingoName").textContent = p;

  let {data} = await sb.from("bingo_cards").select("data").eq("player", p).maybeSingle();
  if(data){
    renderBingo(data.data);
  } else {
    let card = createBingoCard();
    await sb.from("bingo_cards").insert({player:p, data:card});
    renderBingo(card);
  }
}

function createBingoCard(){
  let size = bingoSettings.size || 4;
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
      await sb.from("bingo_cards").upsert({player:currentPlayer, data:card, updated_at:new Date().toISOString()});
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
  const round = bingoSettings.startedAt || "";
  await sb.from("results").upsert({game:"bingo", player:currentPlayer, round}, {ignoreDuplicates:true});
}

// --- Listes admin ---

// Grilles bingo de tous les joueurs, triées par progression
async function loadPlayers(){
  if(!sb) return;
  let {data} = await sb.from("bingo_cards").select("player,data").order("updated_at", {ascending:false});
  let rows = (data || []).map(r => {
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

// Utilisateurs connectés (table players, remplie à chaque connexion Google)
async function loadUsers(){
  if(!sb) return;
  let {data, error} = await sb.from("players").select("*").order("last_seen", {ascending:false});
  if(error){
    $("usersList").innerHTML = "<p>⚠️ Table <b>players</b> absente — lance le SQL de setup.</p>";
    return;
  }
  $("usersList").innerHTML = (data || []).map(u => `
    <div class="playerCard">
      ${u.avatar ? `<img src="${esc(u.avatar)}" class="pAvatar" alt=""/>` : `<div class="pAvatar fallback">${esc((u.name || "?")[0].toUpperCase())}</div>`}
      <div class="pInfo">
        <strong>${esc(u.name || u.email)}</strong>
        <small>${esc(u.email)}</small>
        <small>🕐 ${timeAgo(u.last_seen)}</small>
      </div>
      ${u.is_admin ? '<span class="badge">👑</span>' : ''}
    </div>`).join("") || "<p>Personne ne s'est encore connecté 💤</p>";
}

function bindBingoEvents(){
  // Sauvegarde les réglages sans toucher à l'état de la partie
  $("saveBingoSettings").onclick = async () => {
    bingoSettings = {
      ...bingoSettings,
      size:+$("bingoSize").value,
      reward:$("bingoReward").value,
      tasks:$("bingoTasks").value.split("\n").map(x => x.trim()).filter(Boolean)
    };
    await saveGame("bingo_settings", bingoSettings);
    renderBingoSettings();
  };

  // Lance une nouvelle partie : grilles fraîches pour tout le monde
  $("launchBingo").onclick = async () => {
    if(!confirm("Lancer une nouvelle partie ? Les grilles de tout le monde seront réinitialisées.")) return;
    bingoSettings = {
      size:+$("bingoSize").value,
      reward:$("bingoReward").value,
      tasks:$("bingoTasks").value.split("\n").map(x => x.trim()).filter(Boolean),
      active:true,
      startedAt:new Date().toISOString()
    };
    await sb.from("bingo_cards").delete().neq("player", "");
    await saveGame("bingo_settings", bingoSettings);
    renderBingoSettings();
    if(currentPlayer) await openBingo();
    loadPlayers();
  };

  // Termine la partie en cours (les grilles restent visibles dans le dashboard)
  $("endBingo").onclick = async () => {
    if(!confirm("Terminer la partie en cours ?")) return;
    bingoSettings.active = false;
    await saveGame("bingo_settings", bingoSettings);
    renderBingoAvailability();
  };

  $("resetMyBingo").onclick = async () => {
    if(!currentPlayer || !bingoActive()) return;
    await sb.from("bingo_cards").delete().eq("player", currentPlayer);
    await openBingo();
  };
}
