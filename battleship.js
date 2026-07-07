// 🚢 Touché-coulé — bateaux protégés côté serveur (fonction bs_fire)

let bs = {live:false, grid:10, reward:"10 €", started_at:"", ships_total:0};
let bsShots = [];          // tirs (public)
let bsTorp = [];           // torpilles par joueur (public)
let bsShipsAdmin = [];     // bateaux (chargés uniquement si admin)
let bsPlayersMap = {};     // email -> {name, avatar} pour les badges tireurs
let bsDraft = new Set();   // cases dessinées par l'admin (préparation)
let bsDraftDirty = false;  // l'admin est en train de dessiner ?
let bsPaint = null;        // stroke en cours {mode:"add"|"del"} pendant le glisser

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
  bsPlayersMap = {};
  ((await sb.from("players").select("email,name,avatar")).data || []).forEach(p => {
    bsPlayersMap[(p.email || "").toLowerCase()] = {name:p.name, avatar:p.avatar};
  });
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

// Classes de forme "coque" : aplatit les coins du côté des cases connectées
function bsShapeClasses(cell, set, n){
  const cls = [];
  const r = Math.floor(cell / n), c = cell % n;
  if(r > 0 && set.has(cell - n)) cls.push("cUp");
  if(r < n - 1 && set.has(cell + n)) cls.push("cDown");
  if(c > 0 && set.has(cell - 1)) cls.push("cLeft");
  if(c < n - 1 && set.has(cell + 1)) cls.push("cRight");
  return cls;
}

// Badge avatar du tireur (photo Google ou initiale)
function bsShooterBadge(shot){
  const p = bsPlayersMap[(shot.by_email || "").toLowerCase()];
  const name = shot.by_name || p?.name || "";
  if(p?.avatar) return `<img class="bsAv" src="${esc(p.avatar)}" alt="" title="${esc(name)}"/>`;
  if(name) return `<span class="bsAv txt" title="${esc(name)}">${esc(name[0].toUpperCase())}</span>`;
  return "";
}

function renderBattleship(){
  if(bsPaint) return; // ne pas re-rendre en plein coup de pinceau
  const n = bs.grid || 10;
  const inPrep = admin && !bs.live;
  const shotMap = {}; bsShots.forEach(s => shotMap[s.cell] = s);
  const adminShipSet = admin ? new Set(bsShipsAdmin.flatMap(s => s.cells || [])) : null;

  // Cases par bateau coulé (pour dessiner des coques connectées)
  const sunkByShip = {};
  bsShots.forEach(s => { if(s.sunk && s.ship_id != null){ (sunkByShip[s.ship_id] = sunkByShip[s.ship_id] || new Set()).add(s.cell); } });
  const sunkCellShip = {};
  Object.entries(sunkByShip).forEach(([id, set]) => set.forEach(c => sunkCellShip[c] = set));

  // Stats visibles par tous
  const hits = bsShots.filter(s => s.hit).length;
  const miss = bsShots.length - hits;
  const sunkCount = Object.keys(sunkByShip).length;
  const totalShips = admin ? (bsShipsAdmin.length || bs.ships_total || 0) : (bs.ships_total || 0);
  if($("bsTorpCount")) $("bsTorpCount").textContent = bsMyTorp();
  if($("bsHits")) $("bsHits").textContent = hits;
  if($("bsMiss")) $("bsMiss").textContent = miss;
  if($("bsShipsLeft")) $("bsShipsLeft").textContent = totalShips ? Math.max(0, totalShips - sunkCount) : "?";
  if($("bsFleetBar")) $("bsFleetBar").style.width = totalShips ? Math.round(sunkCount / totalShips * 100) + "%" : "0%";
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
    board.classList.toggle("prep", inPrep);
    board.innerHTML = "";
    for(let i = 0; i < n * n; i++){
      const c = document.createElement("button");
      c.className = "bsCell";
      c.dataset.cell = i;
      if(inPrep){
        if(bsDraft.has(i)) c.classList.add("ship", ...bsShapeClasses(i, bsDraft, n));
      } else {
        const shot = shotMap[i];
        if(shot){
          if(shot.hit){
            if(shot.sunk){
              c.classList.add("sunk", ...bsShapeClasses(i, sunkCellShip[i] || new Set(), n));
              c.innerHTML = `<span class="bsIco">🔥</span>` + bsShooterBadge(shot);
            } else {
              c.classList.add("hit");
              c.innerHTML = `<span class="bsIco">🎯</span>` + bsShooterBadge(shot);
            }
          } else {
            c.classList.add("miss");
            c.innerHTML = `<span class="bsIco">•</span>` + bsShooterBadge(shot);
          }
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
    if(inPrep){ bsBindPaint(board, n); bsUpdateShipPreview(); }
    else { board.onpointerdown = board.onpointermove = board.onpointerup = board.onpointercancel = null; board.style.touchAction = ""; }
  }

  // Message d'état
  if($("bsMsg") && !$("bsMsg").dataset.sticky){
    if(inPrep) $("bsMsg").textContent = "🎨 Reste appuyé et glisse sur la grille pour dessiner tes bateaux.";
    else if(showWait) $("bsMsg").textContent = "";
    else if(bsMyTorp() > 0) $("bsMsg").textContent = `🚀 Tu as ${bsMyTorp()} torpille(s) — vise un bateau !`;
    else $("bsMsg").textContent = "🚀 Pas de torpille — vends un abo pour en gagner une !";
  }
}

// --- Dessin des bateaux au glisser (pointeur maintenu) ---
function bsBindPaint(board, n){
  board.style.touchAction = "none"; // pas de scroll pendant le dessin
  board.onpointerdown = e => {
    const cell = e.target.closest(".bsCell");
    if(!cell) return;
    e.preventDefault();
    const i = +cell.dataset.cell;
    bsPaint = { mode: bsDraft.has(i) ? "del" : "add" }; // repasser sur un bateau = gommer
    bsPaintCell(i, n);
    try { board.setPointerCapture(e.pointerId); } catch {}
  };
  board.onpointermove = e => {
    if(!bsPaint) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el && el.closest ? el.closest(".bsCell") : null;
    if(cell && cell.parentElement === board) bsPaintCell(+cell.dataset.cell, n);
  };
  const end = () => { if(bsPaint){ bsPaint = null; bsUpdateShipPreview(); } };
  board.onpointerup = end;
  board.onpointercancel = end;
}

function bsPaintCell(i, n){
  bsDraftDirty = true;
  if(bsPaint.mode === "add") bsDraft.add(i); else bsDraft.delete(i);
  // Met à jour les classes en place (pas de re-render → fluide sous le doigt)
  const board = $("bsBoard");
  [...board.children].forEach((el, idx) => {
    el.classList.remove("ship", "cUp", "cDown", "cLeft", "cRight");
    if(bsDraft.has(idx)) el.classList.add("ship", ...bsShapeClasses(idx, bsDraft, n));
  });
}

// Aperçu de la flotte : mini-silhouette de chaque bateau détecté
function bsUpdateShipPreview(){
  const box = $("bsShipPreview");
  if(!box) return;
  const n = bs.grid || 10;
  const groups = bsGroups([...bsDraft], n);
  if(!groups.length){
    box.innerHTML = `<span class="empty">Aucun bateau pour l'instant — dessine sur la grille 🎨</span>`;
    return;
  }
  box.innerHTML = groups.map((g, gi) => {
    const rows = g.map(c => Math.floor(c / n)), cols = g.map(c => c % n);
    const r0 = Math.min(...rows), c0 = Math.min(...cols);
    const h = Math.max(...rows) - r0 + 1, w = Math.max(...cols) - c0 + 1;
    const set = new Set(g.map(c => (Math.floor(c / n) - r0) * w + (c % n - c0)));
    let cellsHtml = "";
    for(let i = 0; i < w * h; i++) cellsHtml += `<span class="miniCell${set.has(i) ? " on" : ""}"></span>`;
    return `<div class="miniShip">
      <div class="miniShipGrid" style="grid-template-columns:repeat(${w},10px)">${cellsHtml}</div>
      <span>🚢 ${g.length} case${g.length > 1 ? "s" : ""}</span>
    </div>`;
  }).join("");
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
