// 🚢 Touché-coulé — bateaux protégés côté serveur (fonction bs_fire)

let bs = {live:false, grid:10, reward:"10 €", started_at:"", ships_total:0};
let bsShots = [];          // tirs (public)
let bsTorp = [];           // torpilles par joueur (public)
let bsShipsAdmin = [];     // bateaux (chargés uniquement si admin)
let bsDraft = new Set();   // cases dessinées par l'admin (préparation)
let bsDraftDirty = false;  // l'admin est en train de dessiner ?

function bsMyTorp(){
  const e = (currentUser?.email || "").toLowerCase();
  return bsTorp.find(t => (t.email || "").toLowerCase() === e)?.count || 0;
}

async function loadBattleship(){
  if(!sb) return;
  const st = await sb.from("game_state").select("data").eq("id", "battleship").maybeSingle();
  bs = st.data?.data || {live:false, grid:10, reward:"10 €", started_at:"", ships_total:0};
  bsShots = (await sb.from("bs_shots").select("*")).data || [];
  bsTorp  = (await sb.from("bs_torpedoes").select("*")).data || [];
  if(admin){
    bsShipsAdmin = (await sb.from("bs_ships").select("*")).data || [];
    if(!bsDraftDirty) bsDraft = new Set(bsShipsAdmin.flatMap(s => s.cells || []));
  } else {
    bsShipsAdmin = [];
  }
  renderBattleship();
}

// Regroupe les cases dessinées en bateaux (groupes orthogonalement connectés)
function bsGroups(cells, n){
  const set = new Set(cells), seen = new Set(), groups = [];
  for(const start of cells){
    if(seen.has(start)) continue;
    const group = [], stack = [start];
    seen.add(start);
    while(stack.length){
      const c = stack.pop();
      group.push(c);
      const r = Math.floor(c / n), col = c % n;
      const neigh = [];
      if(r > 0) neigh.push(c - n);
      if(r < n - 1) neigh.push(c + n);
      if(col > 0) neigh.push(c - 1);
      if(col < n - 1) neigh.push(c + 1);
      for(const nb of neigh) if(set.has(nb) && !seen.has(nb)){ seen.add(nb); stack.push(nb); }
    }
    groups.push(group.sort((a, b) => a - b));
  }
  return groups;
}

function renderBattleship(){
  const n = bs.grid || 10;
  const finished = false;
  const inPrep = admin && !bs.live;
  const shotMap = {}; bsShots.forEach(s => shotMap[s.cell] = s);
  const adminShipSet = admin ? new Set(bsShipsAdmin.flatMap(s => s.cells || [])) : null;

  // Compteurs / bandeaux
  const sunkCount = admin ? bsShipsAdmin.filter(s => s.sunk).length : bsShots.filter(s => s.sunk).length; // approx joueur
  const hits = bsShots.filter(s => s.hit).length;
  if($("bsTorpCount")) $("bsTorpCount").textContent = bsMyTorp();
  if($("bsHits")) $("bsHits").textContent = hits;
  if($("bsShipsLeft")) $("bsShipsLeft").textContent = admin ? Math.max(0, (bs.ships_total || bsShipsAdmin.length) - sunkCount) : (bs.ships_total || "?");
  if($("bsRewardStat")) $("bsRewardStat").textContent = bs.reward || "10 €";
  if($("bsRewardChip")) $("bsRewardChip").textContent = "🏆 " + (bs.reward || "10 €") + " le coup fatal";

  // Panneaux admin : préparation (dessin/réglages) vs partie (distribution/actions)
  if($("bsSettings")) $("bsSettings").classList.toggle("hidden", !!bs.live);
  if($("bsActions")) $("bsActions").classList.toggle("hidden", !bs.live);
  if(admin && bs.live) bsRenderDistribute();
  if($("bsLiveChip")) $("bsLiveChip").textContent = bs.live ? "🟢 Bataille en cours" : "⚙️ En préparation";
  if($("bsGrid")) $("bsGrid").value = String(n);
  if($("bsReward") && document.activeElement !== $("bsReward")) $("bsReward").value = bs.reward || "10 €";

  // Zone d'attente pour les joueurs tant que rien n'est lancé
  const showWait = !bs.live && !admin;
  if($("bsWait")) $("bsWait").classList.toggle("hidden", !showWait);
  if($("bsPlay")) $("bsPlay").classList.toggle("hidden", showWait);

  // Grille
  const board = $("bsBoard");
  if(board && !showWait){
    board.style.gridTemplateColumns = `repeat(${n},1fr)`;
    board.innerHTML = "";
    for(let i = 0; i < n * n; i++){
      const c = document.createElement("button");
      c.className = "bsCell";
      c.dataset.cell = i;
      if(inPrep){
        if(bsDraft.has(i)) c.classList.add("ship");
        c.onclick = () => bsToggleDraft(i);
      } else {
        const shot = shotMap[i];
        if(shot){
          if(shot.hit){ c.classList.add(shot.sunk ? "sunk" : "hit"); c.textContent = shot.sunk ? "🔥" : "🎯"; }
          else { c.classList.add("miss"); c.textContent = "•"; }
          c.disabled = true;
          if(shot.by_name) c.title = shot.by_name;
        } else {
          if(admin && adminShipSet && adminShipSet.has(i)) c.classList.add("ship-faint"); // l'admin voit ses bateaux
          c.onclick = () => bsFire(i);
          c.disabled = !(bs.live && bsMyTorp() > 0);
        }
      }
      board.appendChild(c);
    }
  }

  // Message d'état
  if($("bsMsg") && !$("bsMsg").dataset.sticky){
    if(inPrep) $("bsMsg").textContent = "🎨 Clique les cases pour dessiner tes bateaux, puis enregistre-les.";
    else if(showWait) $("bsMsg").textContent = "";
    else if(bsMyTorp() > 0) $("bsMsg").textContent = `🚀 Tu as ${bsMyTorp()} torpille(s) — vise un bateau !`;
    else $("bsMsg").textContent = "🚀 Pas de torpille — vends un abo pour en gagner une !";
  }
}

function bsToggleDraft(i){
  bsDraftDirty = true;
  if(bsDraft.has(i)) bsDraft.delete(i); else bsDraft.add(i);
  renderBattleship();
}

// 🔥 Tir d'un joueur : passe par la fonction serveur sécurisée
async function bsFire(cell){
  if(!bs.live) return;
  if(bsMyTorp() < 1){ bsFlash("🚀 Pas de torpille — vends un abo !"); return; }
  const { data, error } = await sb.rpc("bs_fire", { p_cell: cell });
  if(error){
    const code = (error.message || "").match(/(not_authenticated|no_torpedo|already_fired|game_not_live)/)?.[1];
    bsFlash("⛔ " + ({no_torpedo:"Plus de torpille !", already_fired:"Case déjà visée !", game_not_live:"Partie non lancée.", not_authenticated:"Reconnecte-toi."}[code] || "Tir impossible."));
    return;
  }
  await loadBattleship();
  bsAnimateResult(cell, data);
  if(data?.sunk){ confetti(); bsFlash(`🔥 ${data.by} COULE le ${data.ship} ! +${bs.reward} 🏆`); if(typeof loadLeaderboard === "function") loadLeaderboard(); }
  else if(data?.hit) bsFlash("🎯 Touché !");
  else bsFlash("💦 Raté... plouf !");
}

// Animations touché / coulé / raté sur la grille
function bsAnimateResult(cell, res){
  const board = $("bsBoard");
  const el = board ? board.querySelector(`.bsCell[data-cell="${cell}"]`) : null;
  if(res && res.sunk){
    if(board){ board.classList.remove("shakeHard"); void board.offsetWidth; board.classList.add("shakeHard"); }
    const sunkCells = [...document.querySelectorAll(".bsCell.sunk")];
    sunkCells.forEach((c, i) => { c.style.animationDelay = (i * 45) + "ms"; c.classList.add("boom"); });
    setTimeout(() => { sunkCells.forEach(c => { c.classList.remove("boom"); c.style.animationDelay = ""; }); if(board) board.classList.remove("shakeHard"); }, 1000);
  } else if(res && res.hit){
    if(board){ board.classList.remove("shake"); void board.offsetWidth; board.classList.add("shake"); setTimeout(() => board.classList.remove("shake"), 480); }
    if(el){ el.classList.add("boom"); setTimeout(() => el.classList.remove("boom"), 560); }
  } else if(el){
    el.classList.add("splash");
    setTimeout(() => el.classList.remove("splash"), 620);
  }
}

function bsFlash(txt){
  const m = $("bsMsg");
  if(!m) return;
  m.textContent = txt;
  m.dataset.sticky = "1";
  clearTimeout(bsFlash._t);
  bsFlash._t = setTimeout(() => { delete m.dataset.sticky; renderBattleship(); }, 3500);
}

// --- Admin : préparation ---
async function bsSaveShips(){
  const n = bs.grid || 10;
  const groups = bsGroups([...bsDraft], n);
  await sb.from("bs_ships").delete().gte("id", 0);
  if(groups.length){
    const rows = groups.map((cells, idx) => ({ name: `Bateau ${idx + 1} (${cells.length})`, cells }));
    const { error } = await sb.from("bs_ships").insert(rows);
    if(error){ alert("Enregistrement impossible : " + error.message); return; }
  }
  bsDraftDirty = false;
  await loadBattleship();
  bsFlash(`💾 ${groups.length} bateau(x) enregistré(s) (${bsDraft.size} cases).`);
}

async function bsClearDraft(){
  bsDraft = new Set(); bsDraftDirty = true;
  await sb.from("bs_ships").delete().gte("id", 0);
  await loadBattleship();
  bsFlash("🗑️ Bateaux effacés.");
}

async function bsLaunch(){
  const ships = (await sb.from("bs_ships").select("id")).data || [];
  if(!ships.length){ alert("Dessine et enregistre au moins un bateau avant de lancer."); return; }
  if(!confirm("Lancer la bataille ? Les tirs et torpilles précédents seront remis à zéro.")) return;
  await sb.from("bs_shots").delete().gte("cell", 0);
  await sb.from("bs_torpedoes").delete().neq("email", "");
  await sb.from("bs_ships").update({ sunk:false, sunk_by:null }).gte("id", 0);
  bs = { ...bs, live:true, started_at:new Date().toISOString(), ships_total: ships.length, reward: ($("bsReward").value || "10 €") };
  await saveGame("battleship", bs);
  await loadBattleship();
}

async function bsStop(){
  if(!confirm("Terminer la bataille navale ?")) return;
  await bsArchive();
  bs.live = false;
  await saveGame("battleship", bs);
  await loadBattleship();
  if(typeof loadHistory === "function") loadHistory();
}

async function bsArchive(){
  const ships = (await sb.from("bs_ships").select("*")).data || [];
  const shots = (await sb.from("bs_shots").select("*")).data || [];
  const sunk = ships.filter(s => s.sunk);
  await sb.from("game_history").insert({
    game:"battleship",
    round: bs.started_at || "",
    started_at: bs.started_at || null,
    winner: [...new Set(sunk.map(s => s.sunk_by).filter(Boolean))].join(", "),
    data: {
      grid: bs.grid, reward: bs.reward,
      ships: ships.map(s => ({ name:s.name, size:(s.cells || []).length, sunk:s.sunk, sunk_by:s.sunk_by })),
      shots: shots.length, hits: shots.filter(s => s.hit).length
    }
  });
}

// --- Admin : distribution des torpilles (pendant la partie) ---
async function bsRenderDistribute(){
  if(!$("bsDistribute")) return;
  const players = (await sb.from("players").select("name,email,avatar").order("last_seen", {ascending:false})).data || [];
  const torpMap = {}; bsTorp.forEach(t => torpMap[(t.email || "").toLowerCase()] = t.count);
  // On inclut les comptes de test (marqués 🧪) pour pouvoir leur donner des torpilles en test
  $("bsDistribute").innerHTML = players.map(p => `
    <div class="distRow">
      <span class="distName">${esc(p.name || p.email)}${isExcludedEmail(p.email) ? " 🧪" : ""}</span>
      <span class="chip">🚀 ${torpMap[(p.email || "").toLowerCase()] || 0}</span>
      <button class="small" data-email="${esc((p.email || "").toLowerCase())}" data-name="${esc(p.name || p.email)}">+1</button>
    </div>`).join("") || "<p>Aucun joueur connecté 💤</p>";
  $("bsDistribute").querySelectorAll("button[data-email]").forEach(b => b.onclick = () => bsGrant(b.dataset.email, b.dataset.name));
}

async function bsGrant(email, name){
  const cur = bsTorp.find(t => (t.email || "").toLowerCase() === email)?.count || 0;
  const { error } = await sb.from("bs_torpedoes").upsert({ email, name, count: cur + 1 });
  if(error){ alert("Distribution impossible : " + error.message); return; }
  await loadBattleship();
  bsRenderDistribute();
}

function bindBattleshipEvents(){
  $("bsSaveShips").onclick = bsSaveShips;
  $("bsClear").onclick = bsClearDraft;
  $("bsLaunch").onclick = bsLaunch;
  $("bsStop").onclick = bsStop;
  $("bsGrid").onchange = async () => {
    bs.grid = +$("bsGrid").value;
    bsDraft = new Set(); bsDraftDirty = true;      // la grille change → on repart d'une grille vierge
    await sb.from("bs_ships").delete().gte("id", 0);
    await loadBattleship();
  };
}
