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

// Skin du bateau selon sa taille
function bsSkinInfo(len){
  if(len >= 5) return {name:"Porte-avions", emoji:"🛳️"};
  if(len === 4) return {name:"Croiseur", emoji:"🚢"};
  if(len === 3) return {name:"Sous-marin", emoji:"🫧"};
  if(len === 2) return {name:"Vedette", emoji:"🚤"};
  return {name:"Canot", emoji:"🛟"};
}

// Dessin SVG vue de dessus (horizontal, proue à droite) — skin par taille
function bsBoatSVG(len, wreck){
  const W = len * 100;
  const P = wreck
    ? {hull:"#6d1220", deck:"#8a2033", det:"#450a13", lite:"#ff9d9d", line:"#ffb3b3"}
    : {hull:"#4b5a6b", deck:"#66788c", det:"#2f3a47", lite:"#aebfd2", line:"#d7e1ec"};
  const hull = `<path d="M 12 50 Q 12 24 44 22 L ${W-54} 22 Q ${W-10} 34 ${W-10} 50 Q ${W-10} 66 ${W-54} 78 L 44 78 Q 12 76 12 50 Z" fill="${P.hull}" stroke="${P.det}" stroke-width="4"/>`;
  let deck = "";
  if(len === 1){ // Canot
    deck = `<ellipse cx="50" cy="50" rx="24" ry="14" fill="${P.deck}" stroke="${P.det}" stroke-width="3"/>
            <rect x="40" y="46" width="20" height="8" rx="4" fill="${P.det}"/>`;
  } else if(len === 2){ // Vedette
    deck = `<path d="M 56 34 L 112 34 L 130 50 L 112 66 L 56 66 Z" fill="${P.deck}" stroke="${P.det}" stroke-width="3"/>
            <rect x="66" y="42" width="28" height="16" rx="4" fill="${P.lite}"/>`;
  } else if(len === 3){ // Sous-marin
    deck = `<rect x="${W/2-30}" y="30" width="60" height="26" rx="11" fill="${P.deck}" stroke="${P.det}" stroke-width="3"/>
            <rect x="${W/2-4}" y="14" width="8" height="20" rx="3" fill="${P.det}"/>
            <circle cx="58" cy="50" r="6" fill="${P.lite}"/>
            <circle cx="${W-72}" cy="50" r="6" fill="${P.lite}"/>`;
  } else if(len === 4){ // Croiseur (2 tourelles + passerelle)
    deck = `<rect x="118" y="36" width="80" height="28" rx="8" fill="${P.deck}" stroke="${P.det}" stroke-width="3"/>
            <rect x="140" y="22" width="12" height="16" rx="3" fill="${P.det}"/>
            <circle cx="66" cy="50" r="15" fill="${P.deck}" stroke="${P.det}" stroke-width="3"/>
            <rect x="66" y="45" width="38" height="10" rx="5" fill="${P.det}"/>
            <circle cx="${W-84}" cy="50" r="15" fill="${P.deck}" stroke="${P.det}" stroke-width="3"/>
            <rect x="${W-84}" y="45" width="38" height="10" rx="5" fill="${P.det}"/>`;
  } else { // Porte-avions (piste + îlot)
    deck = `<line x1="34" y1="50" x2="${W-26}" y2="50" stroke="${P.line}" stroke-width="5" stroke-dasharray="18 13"/>
            <rect x="${Math.round(W*0.6)}" y="22" width="50" height="20" rx="5" fill="${P.deck}" stroke="${P.det}" stroke-width="3"/>
            <rect x="${Math.round(W*0.6)+32}" y="12" width="9" height="14" rx="3" fill="${P.det}"/>`;
  }
  return `<svg viewBox="0 0 ${W} 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${hull}${deck}</svg>`;
}

// Plans de skins : uniquement les bateaux en LIGNE droite (sinon repli sur les coques simples)
function bsSkinPlan(groups, n){
  const plans = [], covered = new Set();
  groups.forEach(g => {
    const rows = g.map(c => Math.floor(c / n)), cols = g.map(c => c % n);
    const r0 = Math.min(...rows), c0 = Math.min(...cols);
    const h = Math.max(...rows) - r0 + 1, w = Math.max(...cols) - c0 + 1;
    const L = Math.max(w, h);
    if(!((w === 1 || h === 1) && g.length === L)) return; // forme libre → pas de skin
    g.forEach(c => covered.add(c));
    plans.push({r0, c0, w, h, L});
  });
  return {plans, covered};
}

// Les skins sont posés en ABSOLU (calculés sur les cases réelles) → ils ne
// participent pas à la grille, donc n'entraînent aucun décalage des cases.
function bsAppendSkins(board, plans, kind, n){
  if(board.offsetParent === null || !board.offsetWidth) return; // grille masquée : au prochain rendu visible
  plans.forEach(p => {
    const first = board.querySelector(`.bsCell[data-cell="${p.r0 * n + p.c0}"]`);
    const last  = board.querySelector(`.bsCell[data-cell="${(p.r0 + p.h - 1) * n + (p.c0 + p.w - 1)}"]`);
    if(!first || !last) return;
    const left = first.offsetLeft, top = first.offsetTop;
    const w = (last.offsetLeft + last.offsetWidth) - left;
    const h = (last.offsetTop + last.offsetHeight) - top;
    const d = document.createElement("div");
    d.className = "bsSkin " + kind;
    d.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px`;
    d.innerHTML = bsBoatSVG(p.L, kind === "wreck");
    const s = d.firstElementChild;
    if(p.h > p.w && p.L > 1){ // bateau vertical : on pivote le skin horizontal
      s.setAttribute("style", `position:absolute;left:50%;top:50%;width:${h}px;height:${w}px;transform:translate(-50%,-50%) rotate(90deg)`);
    } else {
      s.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%");
    }
    board.appendChild(d);
  });
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

// 💰 Qui a coulé quoi : le tir fatal de chaque bateau coulé (dérivé des tirs publics)
function bsComputeWinners(){
  const byShip = {};
  bsShots.filter(s => s.hit && s.ship_id != null).forEach(s => {
    (byShip[s.ship_id] = byShip[s.ship_id] || []).push(s);
  });
  const winners = [];
  Object.values(byShip).forEach(shots => {
    if(!shots.some(s => s.sunk)) return; // pas encore coulé
    const fatal = shots.reduce((a, b) => new Date(a.fired_at || 0) > new Date(b.fired_at || 0) ? a : b);
    const name = fatal.by_name || "?";
    if(isNonCompeting(name)) return; // admins / comptes de test hors gains
    winners.push({name, email:(fatal.by_email || "").toLowerCase(), at:fatal.fired_at});
  });
  return winners.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
}

// Total des gains : "2 bateaux × 10 €" calculé si possible ("20 €")
function bsRewardTotal(count){
  const m = String(bs.reward || "").trim().match(/^(\d+[.,]?\d*)\s*(.*)$/);
  if(m){
    const total = parseFloat(m[1].replace(",", ".")) * count;
    return (Number.isInteger(total) ? total : total.toFixed(2)) + (m[2] ? " " + m[2] : "");
  }
  return count > 1 ? `${count} × ${bs.reward}` : (bs.reward || "");
}

function renderBsWinners(){
  const box = $("bsWinners");
  if(!box) return;
  const winners = bsComputeWinners();
  if(!winners.length){
    if(bs.live){
      box.classList.remove("hidden");
      box.innerHTML = `<div class="bsWinTitle">💰 Prime : ${esc(bs.reward || "10 €")} par bateau coulé — encore personne, à toi de jouer !</div>`;
    } else {
      box.classList.add("hidden");
    }
    return;
  }
  const per = {};
  winners.forEach(w => {
    const k = w.email || w.name;
    per[k] = per[k] || {name:w.name, email:w.email, count:0};
    per[k].count++;
  });
  const over = bsAllSunk();
  box.classList.remove("hidden");
  box.classList.toggle("finalBoard", over);
  const title = over ? "🏁 Partie terminée — Scoreboard final 🏆" : "💰 Gains de la partie";
  box.innerHTML = `<div class="bsWinTitle">${title}</div>` +
    Object.values(per).sort((a, b) => b.count - a.count).map(p => {
      const av = bsPlayersMap[p.email]?.avatar;
      const badge = av ? `<img src="${esc(av)}" class="pAvatar mini" alt=""/>` : `<span class="pAvatar fallback mini">${esc((p.name || "?")[0].toUpperCase())}</span>`;
      return `<div class="bsWinRow">${badge}<strong>${esc(p.name)}</strong><span class="bsWinShips">🔥 ${p.count} bateau${p.count > 1 ? "x" : ""}</span><span class="chip gold">${esc(bsRewardTotal(p.count))}</span></div>`;
    }).join("");
}

// Tous les bateaux sont-ils coulés ? (partie terminée)
function bsAllSunk(){
  const total = admin ? (bsShipsAdmin.length || bs.ships_total || 0) : (bs.ships_total || 0);
  if(!bs.live || !total) return false;
  const sunkShips = new Set(bsShots.filter(s => s.sunk && s.ship_id != null).map(s => s.ship_id));
  return sunkShips.size >= total;
}

// 🚀 Qui a des torpilles prêtes à tirer — visible par TOUS pendant la partie
function renderBsTorpBoard(){
  const box = $("bsTorpBoard");
  if(!box) return;
  if(!bs.live || bsAllSunk()){ box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");
  const holders = bsTorp
    .filter(t => (t.count || 0) > 0 && !isExcludedEmail(t.email))
    .sort((a, b) => b.count - a.count);
  if(!holders.length){
    box.innerHTML = `<div class="bsTorpTitle">🚀 Torpilles en jeu</div><div class="bsTorpEmpty">Personne n'a de torpille — vendez des abos ! 💸</div>`;
    return;
  }
  box.innerHTML = `<div class="bsTorpTitle">🚀 Torpilles disponibles</div>` + holders.map(t => {
    const p = bsPlayersMap[(t.email || "").toLowerCase()];
    const name = t.name || p?.name || t.email;
    const av = p?.avatar;
    const badge = av ? `<img src="${esc(av)}" class="pAvatar mini" alt=""/>` : `<span class="pAvatar fallback mini">${esc((name || "?")[0].toUpperCase())}</span>`;
    const me = (t.email || "").toLowerCase() === (currentUser?.email || "").toLowerCase();
    return `<div class="bsTorpRow${me ? " me" : ""}">${badge}<strong>${esc(name)}${me ? " (toi)" : ""}</strong><span class="chip">🚀 ${t.count}</span></div>`;
  }).join("");
}

function renderBattleship(){
  if(bsPaint) return; // ne pas re-rendre en plein coup de pinceau
  const n = bs.grid || 10;
  const inPrep = admin && !bs.live;
  const over = bsAllSunk(); // tous les bateaux coulés → partie figée sur le scoreboard
  const shotMap = {}; bsShots.forEach(s => shotMap[s.cell] = s);

  // Cases par bateau coulé (pour skins + coques connectées)
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
  // Hors partie : on n'affiche pas de stats fantômes
  if(!bs.live && !inPrep){
    if($("bsHits")) $("bsHits").textContent = "0";
    if($("bsMiss")) $("bsMiss").textContent = "0";
    if($("bsShipsLeft")) $("bsShipsLeft").textContent = "—";
    if($("bsFleetBar")) $("bsFleetBar").style.width = "0%";
  }

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

  // 💰 Gains + 🚀 torpilles en jeu (visibles par tous)
  renderBsWinners();
  renderBsTorpBoard();
  if(typeof updateGameStatus === "function") updateGameStatus();

  // Grille
  const board = $("bsBoard");
  if(board && !showWait){
    board.style.gridTemplateColumns = `repeat(${n},1fr)`;
    board.classList.toggle("prep", inPrep);
    board.innerHTML = "";

    // Skins : flotte en préparation / épaves coulées / flotte fantôme de l'admin en partie
    let draftPlan = {plans:[], covered:new Set()};
    let wreckPlan = {plans:[], covered:new Set()};
    let ghostPlan = {plans:[], covered:new Set()};
    if(inPrep) draftPlan = bsSkinPlan(bsGroups([...bsDraft], n), n);
    else {
      wreckPlan = bsSkinPlan(Object.values(sunkByShip).map(s => [...s]), n);
      if(admin){
        const aliveShips = bsShipsAdmin.filter(s => !s.sunk).map(s => s.cells || []);
        ghostPlan = bsSkinPlan(aliveShips, n);
      }
    }
    const adminShipSet = admin ? new Set(bsShipsAdmin.flatMap(s => s.cells || [])) : null;

    for(let i = 0; i < n * n; i++){
      const c = document.createElement("button");
      c.className = "bsCell";
      c.dataset.cell = i;
      if(inPrep){
        if(bsDraft.has(i)) c.classList.add(draftPlan.covered.has(i) ? "shipUnder" : "ship", ...(draftPlan.covered.has(i) ? [] : bsShapeClasses(i, bsDraft, n)));
      } else {
        const shot = shotMap[i];
        if(shot){
          if(shot.hit){
            if(shot.sunk){
              if(wreckPlan.covered.has(i)) c.classList.add("sunkUnder");
              else c.classList.add("sunk", ...bsShapeClasses(i, sunkCellShip[i] || new Set(), n));
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
          if(admin && adminShipSet && adminShipSet.has(i) && !ghostPlan.covered.has(i)) c.classList.add("ship-faint");
          c.onclick = () => bsFire(i);
          c.disabled = over || !(bs.live && bsMyTorp() > 0);
        }
      }
      board.appendChild(c);
    }
    bsAppendSkins(board, draftPlan.plans, "fleet", n);
    bsAppendSkins(board, wreckPlan.plans, "wreck", n);
    bsAppendSkins(board, ghostPlan.plans, "ghost", n);

    if(inPrep){ bsBindPaint(board, n); bsUpdateShipPreview(); }
    else { board.onpointerdown = board.onpointermove = board.onpointerup = board.onpointercancel = null; board.style.touchAction = ""; }
  }

  // Fin de partie : bouton "Clôturer" mis en avant pour l'admin
  if($("bsStop")){
    $("bsStop").classList.toggle("terminatePulse", over);
    $("bsStop").textContent = over ? "🏁 Clôturer la partie" : "🛑 Terminer la bataille";
  }

  // Message d'état
  if($("bsMsg") && !$("bsMsg").dataset.sticky){
    if(over) $("bsMsg").textContent = "🏁 Tous les bateaux coulés — partie terminée !";
    else if(inPrep) $("bsMsg").textContent = "🎨 Reste appuyé et glisse sur la grille pour dessiner tes bateaux.";
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
    // Pendant le trait : on retire les skins pour peindre sur les coques brutes
    board.querySelectorAll(".bsSkin").forEach(x => x.remove());
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
  const end = () => {
    if(bsPaint){
      bsPaint = null;
      renderBattleship(); // reconstruit la grille avec les skins de bateaux
    }
  };
  board.onpointerup = end;
  board.onpointercancel = end;
}

function bsPaintCell(i, n){
  bsDraftDirty = true;
  if(bsPaint.mode === "add") bsDraft.add(i); else bsDraft.delete(i);
  // Met à jour les classes en place (pas de re-render → fluide sous le doigt)
  document.querySelectorAll("#bsBoard .bsCell").forEach(el => {
    const idx = +el.dataset.cell;
    el.classList.remove("ship", "shipUnder", "cUp", "cDown", "cLeft", "cRight");
    if(bsDraft.has(idx)) el.classList.add("ship", ...bsShapeClasses(idx, bsDraft, n));
  });
}

// Aperçu de la flotte : mini-silhouette + skin de chaque bateau détecté
function bsUpdateShipPreview(){
  const box = $("bsShipPreview");
  if(!box) return;
  const n = bs.grid || 10;
  const groups = bsGroups([...bsDraft], n);
  if(!groups.length){
    box.innerHTML = `<span class="empty">Aucun bateau pour l'instant — dessine sur la grille 🎨</span>`;
    return;
  }
  box.innerHTML = groups.map(g => {
    const info = bsSkinInfo(g.length);
    const rows = g.map(c => Math.floor(c / n)), cols = g.map(c => c % n);
    const r0 = Math.min(...rows), c0 = Math.min(...cols);
    const h = Math.max(...rows) - r0 + 1, w = Math.max(...cols) - c0 + 1;
    const set = new Set(g.map(c => (Math.floor(c / n) - r0) * w + (c % n - c0)));
    let cellsHtml = "";
    for(let i = 0; i < w * h; i++) cellsHtml += `<span class="miniCell${set.has(i) ? " on" : ""}"></span>`;
    return `<div class="miniShip">
      <div class="miniShipGrid" style="grid-template-columns:repeat(${w},10px)">${cellsHtml}</div>
      <span>${info.emoji} ${info.name} · ${g.length}</span>
    </div>`;
  }).join("");
}

// 🔥 Tir d'un joueur : passe par la fonction serveur sécurisée
async function bsFire(cell){
  if(!bs.live || bsAllSunk()) return; // partie figée si tous les bateaux sont coulés
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
    const sunkCells = [...document.querySelectorAll(".bsCell.sunk, .bsCell.sunkUnder")];
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
    const counts = {};
    const rows = groups.map(cells => {
      const info = bsSkinInfo(cells.length);
      counts[info.name] = (counts[info.name] || 0) + 1;
      const name = counts[info.name] > 1 ? `${info.name} ${counts[info.name]}` : info.name;
      return { name, cells };
    });
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
  await bsArchive();                                    // sauvegarde dans l'historique d'abord
  await sb.from("bs_shots").delete().gte("cell", 0);    // puis on remet à zéro
  await sb.from("bs_torpedoes").delete().neq("email", "");
  await sb.from("bs_ships").update({ sunk:false, sunk_by:null }).gte("id", 0);
  bs = { ...bs, live:false, started_at:"", ships_total:0 };
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
    bs = { ...bs, grid: +$("bsGrid").value };
    bsDraft = new Set(); bsDraftDirty = true;      // la grille change → on repart d'une grille vierge
    await sb.from("bs_ships").delete().gte("id", 0);
    await saveGame("battleship", bs);              // persiste la taille (sinon loadBattleship l'écrase)
    await loadBattleship();
  };
}
