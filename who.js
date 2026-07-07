let who = {subs:0, goal:37, grid:10, blur:18, hidden:[], clue:"💡 Indice : pas encore dévoilé", answer:"", image:"", live:false, winner:"", startedAt:""};
let lastWinnerSeen = null; // pour ne fêter le vainqueur qu'une fois

async function loadWho(){
  let {data, error} = await sb.from("game_state").select("data").eq("id", "who").maybeSingle();
  if(error){
    console.error(error);
    $("syncStatus").textContent = "⚠️ Lance le SQL Supabase d’abord";
    return;
  }
  if(data?.data){
    who = data.data;
  } else {
    await saveWho();
  }
  lastWinnerSeen = who.winner || ""; // pas de confettis pour une victoire passée
  renderWho();
}

async function saveWho(){
  const ok = await saveGame("who", who);
  renderWho();
  return ok;
}

// Construit (ou réutilise) les tuiles — la réutilisation permet l'animation CSS de révélation
function buildTiles(){
  let n = +who.grid || 10;
  let t = $("tiles");
  let total = n * n;
  who.hidden = who.hidden?.length === total ? who.hidden : Array(total).fill(false);

  if(t.children.length !== total){
    t.innerHTML = "";
    t.style.gridTemplateColumns = `repeat(${n},1fr)`;
    t.style.gridTemplateRows = `repeat(${n},1fr)`;
    for(let i = 0; i < total; i++){
      let d = document.createElement("div");
      d.className = "tile";
      d.onclick = async () => {
        if(!admin) return;
        who.hidden[i] = !who.hidden[i];
        await saveWho();
      };
      t.appendChild(d);
    }
  }
  [...t.children].forEach((d, i) => d.classList.toggle("off", !!who.hidden[i]));
}

function renderWho(){
  let n = +who.grid || 10;
  let total = n * n;
  who.hidden = who.hidden?.length === total ? who.hidden : Array(total).fill(false);
  const revealed = who.hidden.filter(Boolean).length;
  const pct = Math.round(revealed / total * 100);
  const finished = !!who.winner && !who.live;
  // Les joueurs voient la photo quand la partie est lancée ou terminée ; l'admin voit tout
  const canSee = admin || !!who.live || finished;

  $("whoGoal").value = who.goal || 37;
  $("whoGrid").value = n;
  $("whoAnswer").value = who.answer || "";
  $("answerBox").textContent = who.answer || "Réponse masquée";
  $("subs").textContent = who.subs || 0;
  $("goalText").textContent = who.goal || 37;
  $("whoRevealed").textContent = canSee ? (finished ? "💯" : pct + "%") : "🔒";
  $("bar").style.width = Math.min(100, (who.subs || 0) / (who.goal || 37) * 100) + "%";
  $("clue").textContent = canSee ? (who.clue || "💡 Indice : pas encore dévoilé") : "💡 Indice : pas encore dévoilé";

  // Chip d'état + bouton lancer/arrêter (panneau admin)
  $("whoLiveChip").textContent = who.live ? "🟢 Partie en cours" : (finished ? "🏁 Terminée" : "⚙️ En préparation");
  $("toggleLive").textContent = who.live ? "🛑 Arrêter la partie" : "🚀 Lancer la partie";
  $("pickWinnerBtn").classList.toggle("hidden", !who.live && !finished);

  if(who.image && canSee){
    $("whoImg").src = who.image;
    $("whoImg").style.display = "block";
    // Partie terminée → photo entièrement révélée
    $("tiles").style.display = finished ? "none" : "grid";
    $("whoImg").style.filter = finished ? "blur(0px)" : `blur(${who.blur ?? 18}px)`;
    $("placeholder").style.display = "none";
  } else {
    $("whoImg").removeAttribute("src");
    $("whoImg").style.display = "none";
    $("tiles").style.display = "none";
    $("placeholder").style.display = "block";
    if(!canSee){
      // Joueur en attente → roue animée
      $("placeholder").innerHTML = `<div class="spinner"><span>🎭</span></div><div>L'admin prépare la partie mystère...<br>reste connecté(e) !</div>`;
    } else {
      $("placeholder").textContent = admin
        ? "📸 Ajoute une photo mystère pour préparer la partie"
        : "📸 La photo mystère arrive... prépare-toi !";
    }
  }

  // Message d'ambiance selon la progression / le vainqueur
  if(finished){
    $("whoMsg").textContent = `🏆 ${who.winner} a gagné !` + (who.answer ? ` C'était ${who.answer} !` : "");
  }
  else if(!canSee) $("whoMsg").textContent = "⏳ En attente du lancement — reste connecté(e) !";
  else if(!who.image) $("whoMsg").textContent = "🕵️ Le jeu va commencer, ouvre l'œil !";
  else if(pct === 0) $("whoMsg").textContent = "🔒 Photo 100% mystère... à vos ventes !";
  else if(pct < 40) $("whoMsg").textContent = `🔍 ${pct}% dévoilé — une petite idée ?`;
  else if(pct < 80) $("whoMsg").textContent = `👀 ${pct}% dévoilé — ça se précise !`;
  else $("whoMsg").textContent = `🚨 ${pct}% dévoilé — quelqu'un a la réponse ?!`;

  // 🎉 Confettis pour tout le monde quand un vainqueur est désigné
  if(lastWinnerSeen !== null && who.winner && who.winner !== lastWinnerSeen) confetti();
  lastWinnerSeen = who.winner || "";

  buildTiles();
}

function revealRandom(){
  let n = +who.grid || 10;
  let total = n * n;
  who.hidden = who.hidden?.length === total ? who.hidden : Array(total).fill(false);
  let left = who.hidden.map((v, i) => !v ? i : null).filter(v => v !== null);
  if(left.length){
    who.hidden[left[Math.floor(Math.random() * left.length)]] = true;
  }
}

// 🏆 Désigne le vainqueur de la manche (clic sur un utilisateur) et termine la partie
async function designateWinner(name){
  if(!confirm(`Désigner ${name} comme vainqueur du Qui suis-je ?`)) return;
  const round = who.startedAt || new Date().toISOString();
  // Un seul vainqueur par manche : on remplace si l'admin change d'avis
  await sb.from("results").delete().eq("game", "who").eq("round", round);
  await sb.from("results").insert({game:"who", player:name, round});
  who.winner = name;
  who.live = false;
  $("winnerPick").classList.add("hidden");
  await saveWho();
}

// Liste cliquable des joueurs connectés pour choisir le vainqueur
async function renderWinnerPick(){
  const box = $("winnerPick");
  let {data, error} = await sb.from("players").select("name,avatar,email").order("last_seen", {ascending:false});
  if(error || !(data || []).length){
    box.innerHTML = "<p>Aucun joueur connecté pour l'instant 💤</p>";
    return;
  }
  box.innerHTML = "";
  data.forEach(u => {
    const el = document.createElement("div");
    el.className = "cand";
    el.innerHTML = `${u.avatar ? `<img src="${esc(u.avatar)}" alt=""/>` : `<span class="pAvatar fallback mini">${esc((u.name || "?")[0].toUpperCase())}</span>`}<span>${esc(u.name || u.email)}</span><span class="candGo">🏆</span>`;
    el.onclick = () => designateWinner(u.name || u.email);
    box.appendChild(el);
  });
}

function bindWhoEvents(){
  // Lancer / arrêter la partie (visible par tous les joueurs en direct)
  $("toggleLive").onclick = async () => {
    if(!who.live && !who.image){
      alert("Ajoute d'abord une photo mystère avant de lancer la partie 😉");
      return;
    }
    if(!who.live){
      // Nouvelle manche : repart de zéro si la précédente est terminée
      if(who.winner){
        who.subs = 0;
        who.blur = 18;
        who.hidden = Array((+who.grid || 10) * (+who.grid || 10)).fill(false);
        who.winner = "";
      }
      who.startedAt = new Date().toISOString();
      who.live = true;
    } else {
      who.live = false;
    }
    await saveWho();
  };
  $("pickWinnerBtn").onclick = async () => {
    const box = $("winnerPick");
    box.classList.toggle("hidden");
    if(!box.classList.contains("hidden")) await renderWinnerPick();
  };
  $("whoGrid").onchange = async () => {
    who.grid = +$("whoGrid").value;
    who.hidden = Array(who.grid * who.grid).fill(false);
    await saveWho();
  };
  $("whoGoal").oninput = async () => {
    who.goal = +$("whoGoal").value;
    await saveWho();
  };
  $("whoFile").onchange = async e => {
    let f = e.target.files[0];
    if(!f) return;
    try {
      $("syncStatus").textContent = "🔄 Compression de l’image...";
      who.image = await fileToCompressedDataUrl(f);
      who.hidden = Array((+who.grid || 10) * (+who.grid || 10)).fill(false);
      await saveWho();
    } catch(error) {
      console.error(error);
      alert(error.message || "Impossible de charger l’image.");
    }
  };
  $("showClue").onclick = async () => {
    who.clue = "💡 Indice : " + ($("whoClueInput").value || "pas encore dévoilé");
    await saveWho();
  };
  $("toggleAnswer").onclick = () => $("answerBox").classList.toggle("visible");
  $("whoAnswer").oninput = async () => {
    who.answer = $("whoAnswer").value;
    await saveWho();
  };
  $("addSub").onclick = async () => {
    who.subs = (who.subs || 0) + 1;
    revealRandom();
    if(who.subs % 2 === 0) who.blur = Math.max(0, (who.blur ?? 18) - 1);
    await saveWho();
  };
  $("revealOne").onclick = async () => {
    revealRandom();
    await saveWho();
  };
  $("resetWho").onclick = async () => {
    if(!confirm("Réinitialiser complètement le Qui suis-je ?")) return;
    who = {subs:0, goal:37, grid:10, blur:18, hidden:Array(100).fill(false), clue:"💡 Indice : pas encore dévoilé", answer:"", image:"", live:false, winner:"", startedAt:""};
    await saveWho();
  };
}
