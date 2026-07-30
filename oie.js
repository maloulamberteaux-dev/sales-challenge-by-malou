// 🪿 Jeu de l'Oie — plateau secret côté serveur (RPC oie_launch / oie_roll)

let oie = {live:false, cells:50, reward:"40 €", arrival:"overshoot", fog:true, density:0.4, started_at:""};
let oieCells = [];        // cases spéciales publiques : {cell, effect|null}
let oiePlayers = [];      // {email,name,avatar,pos,rolls,reco,skip,mult,jackpots,finished_at,place}
let oieEvents = [];       // fil partagé
let oieRolling = false;

const OIE_EFFECTS = {
  turbo:   {e:"🚀", n:"Turbo",          d:"Avance de 3 cases"},
  bonus:   {e:"⭐", n:"Bonus",           d:"Gagne un lancer bonus"},
  slow:    {e:"🐌", n:"Ralentissement",  d:"Recule de 2 cases"},
  sprint:  {e:"🔥", n:"Sprint",          d:"Le joueur en tête recule d'1 case"},
  jackpot: {e:"💎", n:"Jackpot",         d:"Ticket de tombola / point bonus"},
  cafe:    {e:"🧊", n:"Pause café",      d:"Passe ton prochain lancer"},
  mult:    {e:"🎯", n:"Multiplicateur",  d:"Ton prochain lancer compte double"},
  restart: {e:"💣", n:"Retour départ",   d:"Retour à la case 1 (rare)"},
  gift:    {e:"🎁", n:"Cadeau",          d:"Avance jusqu'à la prochaine case Bonus"},
  swap:    {e:"🤝", n:"Coup de pouce",   d:"Échange avec le joueur juste devant"},
};

const oieSleep = ms => new Promise(r => setTimeout(r, ms));
function oieCols(){ return window.innerWidth < 600 ? 6 : 10; }
function oieMe(){ const e=(currentUser?.email||"").toLowerCase(); return oiePlayers.find(p => (p.email||"").toLowerCase()===e); }
function oieInitial(name){ return (String(name||"?").trim()[0]||"?").toUpperCase(); }
function oieColor(email){ // couleur stable par email
  const C=["#ff2e9f","#7b2cff","#12b981","#f59e0b","#3b82f6","#ef4444","#e11d8f","#0ea5a3"];
  let h=0; for(const c of String(email||"")) h=(h*31+c.charCodeAt(0))>>>0; return C[h%C.length];
}

// Rechargement déclenché par le temps réel — ignoré pendant MON animation de lancer
function oieOnRealtime(){ if(oieRolling) return; loadOie(); }

async function loadOie(){
  if(!sb) return;
  try {
    const st = await sb.from("game_state").select("data").eq("id","oie").eq("workspace_id", WS()).maybeSingle();
    oie = st.data?.data || {live:false, cells:50, reward:"40 €", arrival:"overshoot", fog:true, density:0.4, started_at:""};
    const [c, p, ev] = await Promise.all([
      sb.from("oie_cells").select("*").eq("workspace_id", WS()),
      sb.from("oie_players").select("*").eq("workspace_id", WS()),
      sb.from("oie_events").select("*").eq("workspace_id", WS()).order("id", {ascending:false}).limit(50),
    ]);
    if(p.error){ // tables pas encore créées
      const board = $("oieBoard"); if(board) board.innerHTML = "<p class='emptyBoard'>⚠️ Tables du Jeu de l'Oie absentes — lance le SQL de setup (supabase-oie.sql).</p>";
      return;
    }
    oieCells = c.data || [];
    oiePlayers = (p.data || []).filter(r => !isExcludedEmail(r.email));
    oieEvents = ev.data || [];
  } catch(err){ console.error(err); return; }
  renderOie();
}

// serpentin : index -> {row,col}
function oieRC(i, cols){ const row=Math.floor(i/cols); const col=(row%2===0)?(i%cols):(cols-1-(i%cols)); return {row,col}; }
// spline lisse (Catmull-Rom → Bézier)
function oieSmoothPath(pts){
  if(pts.length<2) return pts.length?`M${pts[0][0]} ${pts[0][1]}`:"";
  let d=`M${pts[0][0].toFixed(3)} ${pts[0][1].toFixed(3)}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||p2;
    const c1x=p1[0]+(p2[0]-p0[0])/6, c1y=p1[1]+(p2[1]-p0[1])/6;
    const c2x=p2[0]-(p3[0]-p1[0])/6, c2y=p2[1]-(p3[1]-p1[1])/6;
    d+=` C${c1x.toFixed(3)} ${c1y.toFixed(3)}, ${c2x.toFixed(3)} ${c2y.toFixed(3)}, ${p2[0].toFixed(3)} ${p2[1].toFixed(3)}`;
  }
  return d;
}

function renderOie(){
  const showWait = !oie.live && !admin;
  if($("oieWait")) $("oieWait").classList.toggle("hidden", !showWait);
  if($("oiePlay")) $("oiePlay").classList.toggle("hidden", showWait);

  if($("oiePlayerName")) $("oiePlayerName").textContent = currentPlayer;
  if($("oieRewardChip")) $("oieRewardChip").textContent = "🏆 " + (oie.reward || "40 €");
  if($("oieTitle")) $("oieTitle").textContent = oie.live ? `🪿 Course en cours — ${oie.cells} cases` : "🪿 Plateau";

  // stats du joueur
  const me = oieMe();
  const order = [...oiePlayers].sort((a,b)=>b.pos-a.pos);
  if($("oiePos")) $("oiePos").textContent = me ? me.pos+1 : "–";
  if($("oieRolls")) $("oieRolls").innerHTML = me ? `${me.rolls}${me.reco?` <span style="color:var(--pink)">+${me.reco}🔁</span>`:""}` : "0";
  if($("oieRank")) $("oieRank").textContent = (oie.live && me) ? `${order.indexOf(me)+1}/${oiePlayers.length}` : "–";
  const rb = $("oieRollBtn");
  if(rb){
    const canRoll = !!(oie.live && me && !me.finished_at && (me.rolls>0 || me.reco>0) && !oieRolling);
    rb.disabled = !canRoll;
    rb.textContent = (me && me.reco>0) ? "🎲 Lancer 2 dés (reco)" : "🎲 Lancer le dé";
    rb.classList.toggle("hidden", admin && !oie.live); // en prépa admin, pas de bouton joueur
  }

  // message d'état
  const msg = $("oieMsg");
  if(msg && !msg.dataset.flash){
    msg.textContent = !oie.live
      ? (admin ? "⚙️ Configure puis lance une partie" : "⏳ En attente du lancement…")
      : (me && me.finished_at) ? "🏁 Tu as terminé la course, bravo !"
      : (me && (me.rolls>0||me.reco>0)) ? "🎲 À toi de jouer — lance le dé !"
      : "🟢 Partie en cours";
  }

  // panneau admin
  if($("oieLiveChip")) $("oieLiveChip").textContent = oie.live ? "🟢 Partie en cours" : "⚙️ En préparation";
  if($("oieSettings")) $("oieSettings").classList.toggle("hidden", !!oie.live);
  if($("oieStop")) $("oieStop").classList.toggle("hidden", !oie.live);
  if($("oieCells") && document.activeElement!==$("oieCells")) $("oieCells").value = oie.cells;
  if($("oieReward") && document.activeElement!==$("oieReward")) $("oieReward").value = oie.reward;
  if($("oieArrival")) $("oieArrival").value = oie.arrival;
  if($("oieFog")) $("oieFog").checked = oie.fog !== false;
  if(admin && oie.live) oieRenderDistribute();
  if($("oieDistribute")) $("oieDistribute").classList.toggle("hidden", !(admin && oie.live));

  renderOieBoard();
  renderOieFeed();
  renderOieLegend();
  if(typeof updateGameStatus === "function") updateGameStatus();
}

function renderOieBoard(){
  const b = $("oieBoard"); if(!b) return;
  if(!oie.live && !admin){ b.innerHTML = ""; return; }
  const cols = oieCols();
  const n = oie.cells || 50, rows = Math.ceil(n/cols);
  const cellW = 100/cols, cellH = 100/rows, A = 0.18;
  const cellMap = {}; oieCells.forEach(c => cellMap[c.cell] = c.effect); // effect null = ❓
  const specialSet = new Set(oieCells.map(c => c.cell));
  const tokensAt = {}; oiePlayers.forEach(p => { (tokensAt[p.pos] = tokensAt[p.pos]||[]).push(p); });
  const meEmail = (currentUser?.email||"").toLowerCase();

  const cen=[]; for(let i=0;i<n;i++){ const {row,col}=oieRC(i,cols); cen.push([col+0.5, row+0.5 + A*Math.sin(i*0.9)]); }
  const d = oieSmoothPath(cen);

  let cells="";
  for(let i=0;i<n;i++){
    const {row,col}=oieRC(i,cols);
    const cy=cen[i][1];
    let cls="oieCell", face="";
    if(i===0){ cls+=" start"; face="🪿"; }
    else if(i===n-1){ cls+=" end"; face="🏆"; }
    else if(specialSet.has(i)){
      const eff = cellMap[i];
      if(eff){ cls+=" special"; face=(OIE_EFFECTS[eff]||{}).e || "❓"; }
      else { cls+=" mystery"; face="❓"; }
    }
    const toks = tokensAt[i] ? `<div class="oieTokens">${tokensAt[i].map(p=>`<div class="oieTok${(p.email||"").toLowerCase()===meEmail?" mine":""}" style="background:${oieColor(p.email)}" title="${esc(p.name)}">${p.finished_at?"🏁":esc(oieInitial(p.name))}</div>`).join("")}</div>` : "";
    cells += `<div class="${cls}" style="left:${(col*cellW).toFixed(3)}%;top:${((cy-0.5)/rows*100).toFixed(3)}%;width:${cellW.toFixed(3)}%;height:${cellH.toFixed(3)}%">
      <div class="oieDot"><span class="cnum">${i+1}</span>${face?`<span class="cface">${face}</span>`:""}</div>${toks}</div>`;
  }

  b.innerHTML = `<div class="oieField" style="aspect-ratio:${cols} / ${rows}">
    <svg class="oieRoad" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="none">
      <path d="${d}" fill="none" stroke="#ffffff" stroke-width="0.72" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${d}" fill="none" stroke="#ffdcf1" stroke-width="0.56" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${d}" fill="none" stroke="#ff86c9" stroke-width="0.07" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0.26 0.32"/>
    </svg>${cells}</div>`;
}

function renderOieFeed(){
  const f = $("oieFeed"); if(!f) return;
  f.innerHTML = oieEvents.length
    ? oieEvents.map(e => `<div class="fRow">${esc(e.text)}</div>`).join("")
    : `<div class="fRow" style="opacity:.6">La partie n'a pas encore commencé…</div>`;
}

function renderOieLegend(){
  const l = $("oieLegend"); if(!l) return;
  l.innerHTML = Object.values(OIE_EFFECTS).map(e => `<span class="chip legChip">${e.e} ${e.n}<span class="legTip"><b>${e.e} ${esc(e.n)}</b>${esc(e.d)}</span></span>`).join("");
}

function oieFlash(txt){
  const m = $("oieMsg"); if(!m) return;
  m.textContent = txt; m.dataset.flash = "1";
  clearTimeout(oieFlash._t); oieFlash._t = setTimeout(()=>{ delete m.dataset.flash; renderOie(); }, 2800);
}

// ---------- Pop-up de lancer ----------
function oieAnimateRoll(name, tag, diceVals){
  return new Promise(res => {
    const faces="⚀⚁⚂⚃⚄⚅";
    const modal=$("oieDiceModal"), wrap=$("oieDiceWrap"), who=$("oieDiceWho"), result=$("oieDiceResult"), go=$("oieDiceContinue"), small=$("oieDie");
    const count = diceVals.length;
    who.innerHTML = (name?`<b>${esc(name)}</b> `:"") + (count>1?"lance 2 dés":"lance le dé") + (tag?` <span style="color:var(--pink)">${tag}</span>`:"") + " …";
    result.textContent=""; result.classList.remove("show");
    go.classList.add("hidden"); go.onclick=null; modal.onclick=null;
    wrap.classList.toggle("two", count>1);
    wrap.innerHTML = diceVals.map(()=>`<div class="bigDie tumbling">🎲</div>`).join("");
    modal.classList.remove("hidden");
    if(small) small.classList.add("rolling");
    const dice=[...wrap.children];
    let ticks=0;
    const iv=setInterval(()=>{
      dice.forEach(dd => dd.textContent = faces[Math.floor(Math.random()*6)]);
      if(++ticks>10){
        clearInterval(iv);
        diceVals.forEach((v,idx)=>{ dice[idx].textContent = faces[v-1]; dice[idx].classList.remove("tumbling"); });
        const total = diceVals.reduce((a,b)=>a+b,0);
        result.textContent = count>1 ? `🎲 ${diceVals.join(" + ")} = ${total} !` : `🎲 ${total} !`;
        result.classList.add("show");
        if(small){ small.textContent = faces[diceVals[diceVals.length-1]-1]; small.classList.remove("rolling"); }
        let done=false;
        const close=e=>{ if(done) return; if(e && e.target.closest && e.target.closest(".diceCard") && e.target!==go) return; done=true; modal.onclick=null; go.onclick=null; modal.classList.add("hidden"); res(); };
        go.classList.remove("hidden"); go.onclick=close; modal.onclick=close;
      }
    },60);
  });
}

// Anime le pion du joueur `email` de `from` à `to` (case par case)
async function oieHop(email, from, to){
  const me = oiePlayers.find(p => (p.email||"").toLowerCase()===(email||"").toLowerCase());
  if(!me) return;
  const last = oie.cells-1;
  to = Math.max(0, Math.min(last, to));
  const step = to>from ? 1 : -1;
  const dist = Math.abs(to-from);
  if(dist===0){ me.pos=to; renderOieBoard(); return; }
  const per = dist>12 ? 55 : 165;
  me.pos = from;
  while(me.pos !== to){
    me.pos += step;
    renderOieBoard();
    const cells=document.querySelectorAll('#oieBoard .oieCell'); if(cells[me.pos]) cells[me.pos].classList.add("pop","landed");
    await oieSleep(per);
  }
}

// ---------- Lancer (joueur) ----------
async function oieDoRoll(){
  const me = oieMe();
  if(!oie.live || !me || me.finished_at) return;
  if((me.rolls||0)<1 && (me.reco||0)<1){ oieFlash("⛔ Pas de lancer — vends un abo !"); return; }
  if(oieRolling) return;
  oieRolling = true; renderOie();
  try {
    const { data, error } = await sb.rpc("oie_roll");
    if(error){
      const code = (error.message||"").match(/(not_authenticated|no_workspace|game_not_live|not_in_game|already_finished|no_roll)/)?.[1];
      oieFlash("⛔ " + ({no_roll:"Plus de lancer !", already_finished:"Tu as déjà fini !", game_not_live:"Partie non lancée.", not_in_game:"Tu n'es pas sur le plateau.", not_authenticated:"Reconnecte-toi."}[code] || "Lancer impossible."));
      return;
    }
    if(data?.skipped){ await loadOie(); oieFlash("🧊 Pause café — lancer sauté."); return; }
    const reco = !!data.reco;
    await oieAnimateRoll(currentPlayer, reco ? "reco 🔁" : "", data.dice || [1]);
    // révèle immédiatement les cases touchées (brouillard)
    (data.reveals||[]).forEach(r => {
      const c = oieCells.find(x => x.cell===r.cell); if(c) c.effect = r.effect; else oieCells.push({cell:r.cell, effect:r.effect});
    });
    await oieHop((currentUser?.email||""), data.from, data.to);
    await loadOie();                        // resynchronise (sprint/swap sur les autres, fil)
    if(data.finished && data.place===1){ if(typeof confetti==="function") confetti(); if(typeof loadLeaderboard==="function") loadLeaderboard(); }
    if(data.bonus) oieFlash("⭐ Lancer bonus gagné — relance !");
  } catch(err){ console.error(err); oieFlash("⛔ Erreur réseau."); }
  finally { oieRolling = false; renderOie(); }
}

// ---------- Admin ----------
async function oieLaunch(){
  const cells = Math.max(12, Math.min(100, +($("oieCells").value) || 50));
  const reward = $("oieReward").value || "40 €";
  const arrival = $("oieArrival").value || "overshoot";
  const fog = $("oieFog").checked;
  const density = +($("oieDensity").value) || 0.4;
  if(!confirm("Lancer une nouvelle partie ? Le plateau et les positions précédentes seront réinitialisés.")) return;
  const { error } = await sb.rpc("oie_launch", { p_cells:cells, p_reward:reward, p_arrival:arrival, p_fog:fog, p_density:density });
  if(error){ alert("Lancement impossible : " + error.message); return; }
  oie = { live:true, cells, reward, arrival, fog, density, started_at:new Date().toISOString() };
  await saveGame("oie", oie);
  await loadOie();
}

async function oieRenderDistribute(){
  const box = $("oieDistribute"); if(!box) return;
  const players = (await sb.from("players").select("name,email,avatar").eq("workspace_id", WS()).eq("status","active").order("name")).data || [];
  const map = {}; oiePlayers.forEach(p => map[(p.email||"").toLowerCase()] = p);
  box.innerHTML = players.map(pl => {
    const key=(pl.email||"").toLowerCase(); const r=map[key]||{rolls:0,reco:0};
    return `<div class="distRow">
      <span class="distName">${esc(pl.name || pl.email)}${isExcludedEmail(pl.email)?" 🧪":""}</span>
      <span class="chip">🎲 ${r.rolls||0}${r.reco?` · 🔁${r.reco}`:""}</span>
      <button class="small ghost" data-abo="${esc(key)}">+abo</button>
      <button class="small" data-reco="${esc(key)}">+reco</button>
    </div>`;
  }).join("") || "<p>Aucun joueur actif 💤</p>";
  box.querySelectorAll("button[data-abo]").forEach(b => b.onclick = () => oieGrant(b.dataset.abo, "abo"));
  box.querySelectorAll("button[data-reco]").forEach(b => b.onclick = () => oieGrant(b.dataset.reco, "reco"));
}

async function oieGrant(email, type){
  const p = oiePlayers.find(x => (x.email||"").toLowerCase()===email);
  const cur = p ? (type==="abo"? (p.rolls||0) : (p.reco||0)) : 0;
  const patch = type==="abo" ? { rolls: cur+1 } : { reco: cur+1 };
  const { error } = await sb.from("oie_players").update(patch).eq("workspace_id", WS()).eq("email", email);
  if(error){ alert("Distribution impossible : " + error.message); return; }
  await loadOie();
}

async function oieStop(){
  if(!confirm("Terminer la partie du Jeu de l'Oie ?")) return;
  await oieArchive();
  oie = { ...oie, live:false };
  await saveGame("oie", oie);
  await loadOie();
  if(typeof loadHistory==="function") loadHistory();
}

async function oieArchive(){
  const standings = [...oiePlayers]
    .filter(p => !isNonCompeting(p.name))
    .sort((a,b) => (b.finished_at?1:0)-(a.finished_at?1:0) || (a.place||99)-(b.place||99) || b.pos-a.pos)
    .map(p => ({ player:p.name, pos:p.pos+1, place:p.place, finished: !!p.finished_at }));
  const winner = standings.find(s => s.place===1)?.player || "";
  await sb.from("game_history").insert({
    game:"oie", workspace_id: WS(), round: oie.started_at || "", started_at: oie.started_at || null,
    winner, data:{ cells:oie.cells, reward:oie.reward, arrival:oie.arrival, standings }
  });
}

function bindOieEvents(){
  if($("oieLaunch")) $("oieLaunch").onclick = oieLaunch;
  if($("oieStop")) $("oieStop").onclick = oieStop;
  if($("oieReset")) $("oieReset").onclick = oieStop;
  if($("oieRollBtn")) $("oieRollBtn").onclick = oieDoRoll;
  let _rz; window.addEventListener("resize", () => { clearTimeout(_rz); _rz=setTimeout(()=>{ if($("oieBoard")) renderOieBoard(); }, 150); });
}
