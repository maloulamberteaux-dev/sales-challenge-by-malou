let who = {subs:0, goal:37, grid:10, blur:18, blurEnabled:false, reward:"20 €", hidden:[], clue:"💡 Indice : pas encore dévoilé", answer:"", image:"", live:false, winner:"", startedAt:""};
// 🔒 Anti-triche : l'original et la réponse restent dans who_secret (table admin-only).
// who.image (public) = composite généré par l'admin avec UNIQUEMENT les pixels révélés.
let whoSecret = {image:"", answer:""};
let lastWinnerSeen = null; // pour ne fêter le vainqueur qu'une fois

async function loadWho(){
  let {data, error} = await sb.from("game_state").select("data").eq("id", "who").eq("workspace_id", WS()).maybeSingle();
  if(error){
    console.error(error);
    $("syncStatus").textContent = "⚠️ Lance le SQL Supabase d’abord";
    return;
  }
  if(data?.data){
    who = data.data;
    if(!who.reward) who.reward = "20 €"; // rétro-compat : anciennes parties sans récompense
  } else {
    await saveWho();
  }
  lastWinnerSeen = who.winner || ""; // pas de confettis pour une victoire passée
  renderWho();
}

// Charge les secrets (photo originale + réponse) — ne renvoie des données qu'aux admins (RLS)
async function loadWhoSecret(){
  if(!admin || !sb) return;
  const {data} = await sb.from("who_secret").select("*").eq("id", "who").eq("workspace_id", WS()).maybeSingle();
  whoSecret = data ? {image:data.image || "", answer:data.answer || ""} : {image:"", answer:""};
  renderWho();
}

async function saveWhoSecret(){
  if(!admin || !sb) return;
  const {error} = await sb.from("who_secret").upsert({id:"who", workspace_id:WS(), image:whoSecret.image, answer:whoSecret.answer});
  if(error){ console.error(error); alert("Sauvegarde secrète impossible : " + error.message); }
}

async function saveWho(){
  // L'admin régénère le composite public avant chaque sauvegarde
  if(admin && whoSecret.image){
    who.image = await whoBuildComposite();
  }
  const ok = await saveGame("who", who);
  renderWho();
  return ok;
}

function whoLoadImg(src){
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Image illisible"));
    i.src = src;
  });
}

// Construit l'image publique : pixels révélés uniquement, flou incrusté si activé
async function whoBuildComposite(){
  try {
    if(!whoSecret.image) return who.image || "";
    const img = await whoLoadImg(whoSecret.image);
    const w = img.naturalWidth, h = img.naturalHeight;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    const finished = !!who.winner && !who.live;

    if(finished){ // fin de partie → photo entière et nette
      ctx.drawImage(img, 0, 0);
      return cv.toDataURL("image/jpeg", .82);
    }

    // Fond : image nette, ou floutée (flou INCRUSTÉ dans les pixels, pas du CSS contournable)
    const amt = who.blurEnabled ? Math.max(0, Math.round(20 * (1 - (who.subs || 0) / (who.goal || 37)))) : 0;
    if(amt > 0){
      ctx.filter = `blur(${amt}px)`;
      if(ctx.filter && ctx.filter !== "none"){
        ctx.drawImage(img, 0, 0);
        ctx.filter = "none";
      } else { // navigateur sans ctx.filter → pixelisation équivalente
        const tw = Math.max(1, Math.round(w / amt)), th = Math.max(1, Math.round(h / amt));
        const t = document.createElement("canvas");
        t.width = tw; t.height = th;
        t.getContext("2d").drawImage(img, 0, 0, tw, th);
        ctx.drawImage(t, 0, 0, tw, th, 0, 0, w, h);
      }
    } else {
      ctx.drawImage(img, 0, 0);
    }

    // Masque les cases non révélées (hidden[i] = true signifie révélée)
    const n = +who.grid || 10;
    const cw = w / n, ch = h / n;
    for(let i = 0; i < n * n; i++){
      if(who.hidden?.[i]) continue;
      const r = Math.floor(i / n), c = i % n;
      ctx.fillStyle = ((r + c) % 2 === 0) ? "#ff63c6" : "#884cff";
      ctx.fillRect(Math.floor(c * cw) - 1, Math.floor(r * ch) - 1, Math.ceil(cw) + 2, Math.ceil(ch) + 2);
    }
    return cv.toDataURL("image/jpeg", .82);
  } catch(e){
    console.error(e);
    return who.image || "";
  }
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
  const finished = !!who.winner && !who.live;
  const blurOn = !!who.blurEnabled;   // couche de flou (incrustée dans l'image publiée)
  const pct = total ? Math.round(revealed / total * 100) : 0;
  // Les joueurs voient la photo quand la partie est lancée ou terminée ; l'admin voit tout
  const canSee = admin || !!who.live || finished;

  $("whoGoal").value = who.goal || 37;
  if($("whoReward") && document.activeElement !== $("whoReward")) $("whoReward").value = who.reward || "";
  if($("whoRewardChip")) $("whoRewardChip").textContent = "🏆 " + (who.reward || "—");
  $("whoGrid").value = n;
  $("whoAnswer").value = whoSecret.answer || "";
  $("answerBox").textContent = whoSecret.answer || "Réponse masquée";
  $("subs").textContent = who.subs || 0;
  $("goalText").textContent = who.goal || 37;
  $("whoRevealed").textContent = canSee ? (finished ? "💯" : pct + "%") : "🔒";
  $("bar").style.width = Math.min(100, (who.subs || 0) / (who.goal || 37) * 100) + "%";
  $("clue").textContent = canSee ? (who.clue || "💡 Indice : pas encore dévoilé") : "💡 Indice : pas encore dévoilé";

  // Chip d'état + bouton lancer/arrêter (panneau admin)
  $("whoLiveChip").textContent = who.live ? "🟢 Partie en cours" : (finished ? "🏁 Terminée" : "⚙️ En préparation");
  $("toggleLive").textContent = who.live ? "🛑 Arrêter la partie" : "🚀 Lancer la partie";
  if($("toggleBlur")) $("toggleBlur").textContent = blurOn ? "🌫️ Flou : activé" : "🌫️ Flou : désactivé";
  // Pendant la partie : on masque les réglages, on ne montre que les actions
  if($("whoSettings")) $("whoSettings").classList.toggle("hidden", !!who.live);
  if($("whoActions")) $("whoActions").classList.toggle("hidden", !who.live);

  if(who.image && canSee){
    $("whoImg").src = who.image;                  // composite public (pixels révélés uniquement)
    $("whoImg").style.display = "block";
    $("whoImg").style.filter = "none";            // plus de flou CSS : tout est incrusté
    $("tiles").style.display = finished ? "none" : "grid";
    $("placeholder").style.display = "none";
  } else {
    $("whoImg").removeAttribute("src");
    $("whoImg").style.display = "none";
    $("tiles").style.display = "none";
    $("placeholder").style.display = "block";
    if(!canSee){
      // Joueur en attente → roue animée
      $("placeholder").innerHTML = `<div class="spinner"><span>🎭</span></div><div class="loadingDots">L'admin prépare la partie mystère</div>`;
    } else {
      $("placeholder").textContent = admin
        ? "📸 Ajoute une photo mystère pour préparer la partie"
        : "📸 La photo mystère arrive... prépare-toi !";
    }
  }

  // Message d'ambiance selon la progression / le vainqueur
  if(finished){
    $("whoMsg").textContent = `🏆 ${who.winner} gagne ${who.reward || ""} !`.replace(" !", "!") + (who.answer ? ` C'était ${who.answer} !` : "");
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
  if(typeof updateGameStatus === "function") updateGameStatus();
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
  await sb.from("results").delete().eq("game", "who").eq("round", round).eq("workspace_id", WS());
  await sb.from("results").insert({game:"who", player:name, round, reward:who.reward || "", workspace_id:WS()});
  who.winner = name;
  who.live = false;
  who.answer = whoSecret.answer || who.answer || ""; // la réponse n'est publiée qu'à la fin
  await archiveWhoGame(name, round);
  $("winnerPick").classList.add("hidden");
  await saveWho();
  if(typeof loadHistory === "function") loadHistory();
}

// Archive la manche Qui suis-je dans l'historique (photo, taux de reveal, gagnant...)
async function archiveWhoGame(winner, round){
  if(!sb) return;
  const n = +who.grid || 10, total = n * n;
  const revealed = (who.hidden || []).filter(Boolean).length;
  // Évite les doublons si l'admin re-désigne un vainqueur pour la même manche
  await sb.from("game_history").delete().eq("game", "who").eq("round", round || "").eq("workspace_id", WS());
  await sb.from("game_history").insert({
    game:"who",
    workspace_id: WS(),
    round: round || "",
    started_at: who.startedAt || null,
    winner,
    data: {
      image: whoSecret.image || who.image || "",
      reveal_pct: total ? Math.round(revealed / total * 100) : 0,
      revealed, total,
      subs: who.subs || 0,
      goal: who.goal || 0,
      grid: n,
      answer: whoSecret.answer || who.answer || "",
      clue: who.clue || ""
    }
  });
}

// Liste cliquable des joueurs connectés pour choisir le vainqueur
async function renderWinnerPick(){
  const box = $("winnerPick");
  let {data, error} = await sb.from("players").select("name,avatar,email,role").eq("workspace_id", WS()).eq("status", "active").order("last_seen", {ascending:false});
  const candidats = (data || []).filter(u => !isExcludedEmail(u.email) && u.role !== "admin");
  if(error || !candidats.length){
    box.innerHTML = "<p>Aucun joueur connecté pour l'instant 💤</p>";
    return;
  }
  box.innerHTML = "";
  candidats.forEach(u => {
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
    if(!who.live && !whoSecret.image && !who.image){
      alert("Ajoute d'abord une photo mystère avant de lancer la partie 😉");
      return;
    }
    if(!who.live){
      // Nouvelle manche : repart de zéro si la précédente est terminée
      if(who.winner){
        who.subs = 0;
        who.hidden = Array((+who.grid || 10) * (+who.grid || 10)).fill(false);
        who.winner = "";
      }
      who.answer = "";                 // la réponse reste secrète pendant la partie
      who.startedAt = new Date().toISOString();
      who.live = true;
    } else {
      who.live = false;
    }
    await saveWho();
  };
  $("toggleBlur").onclick = async () => {
    who.blurEnabled = !who.blurEnabled;
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
  $("whoReward").oninput = () => {
    who.reward = $("whoReward").value;
    if($("whoRewardChip")) $("whoRewardChip").textContent = "🏆 " + (who.reward || "—");
    clearTimeout(bindWhoEvents._rt);
    bindWhoEvents._rt = setTimeout(() => saveWho(), 500);
  };
  $("whoFile").onchange = async e => {
    let f = e.target.files[0];
    if(!f) return;
    try {
      $("syncStatus").textContent = "🔄 Compression de l’image...";
      whoSecret.image = await fileToCompressedDataUrl(f);   // 🔒 l'original part dans la table secrète
      await saveWhoSecret();
      who.hidden = Array((+who.grid || 10) * (+who.grid || 10)).fill(false);
      await saveWho();                                       // publie le composite (tout masqué)
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
  $("whoAnswer").oninput = () => {
    // 🔒 la réponse ne va QUE dans la table secrète (admin-only)
    whoSecret.answer = $("whoAnswer").value;
    $("answerBox").textContent = whoSecret.answer || "Réponse masquée";
    clearTimeout(bindWhoEvents._ansT);
    bindWhoEvents._ansT = setTimeout(saveWhoSecret, 600);
  };
  $("addSub").onclick = async () => {
    who.subs = (who.subs || 0) + 1;
    revealRandom();
    await saveWho();
  };
  $("revealOne").onclick = async () => {
    revealRandom();
    await saveWho();
  };
  $("resetWho").onclick = async () => {
    if(!confirm("Réinitialiser complètement le Qui suis-je ?")) return;
    who = {subs:0, goal:37, grid:10, blur:18, blurEnabled:who.blurEnabled, reward:who.reward || "20 €", hidden:Array(100).fill(false), clue:"💡 Indice : pas encore dévoilé", answer:"", image:"", live:false, winner:"", startedAt:""};
    whoSecret = {image:"", answer:""};
    await saveWhoSecret();
    await saveWho();
  };
}
