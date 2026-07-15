// 📜 Historique des parties terminées (dashboard admin)

let historyCache = [];

async function loadHistory(){
  if(!sb) return;
  const {data, error} = await sb.from("game_history").select("*").eq("workspace_id", WS()).order("ended_at", {ascending:false});
  if(error){
    $("historyList").innerHTML = "<p>⚠️ Table <b>game_history</b> absente — lance le SQL de setup.</p>";
    return;
  }
  historyCache = data || [];
  $("historyDetail").classList.add("hidden");
  $("historyList").classList.remove("hidden");

  if(!historyCache.length){
    $("historyList").innerHTML = "<p class='emptyBoard'>Aucune partie terminée pour l'instant 🎬</p>";
    return;
  }
  const META = {
    bingo: {icon:"💜", name:"Bingo Commercial"},
    who: {icon:"🎭", name:"Qui suis-je ?"},
    battleship: {icon:"🚢", name:"Touché-coulé"}
  };
  $("historyList").innerHTML = historyCache.map((h, i) => {
    const icon = (META[h.game] || META.who).icon;
    const name = (META[h.game] || META.who).name;
    const when = fmtDate(h.ended_at);
    const sub = h.game === "bingo" ? `${h.data?.players || 0} joueur(s)`
      : h.game === "battleship" ? `${(h.data?.ships || []).filter(s => s.sunk).length}/${(h.data?.ships || []).length} bateaux coulés`
      : `${h.data?.reveal_pct ?? 0}% dévoilé`;
    const win = h.winner ? `🏆 ${esc(h.winner)}` : "sans vainqueur";
    return `<div class="playerCard histItem" data-i="${i}">
      <span class="rank">${icon}</span>
      <div class="pInfo">
        <strong>${name}</strong>
        <small>${when} · ${win}</small>
        <small>${sub}</small>
      </div>
      <span class="chip">Voir ›</span>
    </div>`;
  }).join("");
  document.querySelectorAll(".histItem").forEach(el => el.onclick = () => showHistoryDetail(+el.dataset.i));
}

function fmtDate(iso){
  if(!iso) return "";
  try { return new Date(iso).toLocaleString("fr-FR", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"}); }
  catch { return iso; }
}

function showHistoryDetail(i){
  const h = historyCache[i];
  if(!h) return;
  const box = $("historyDetail");
  const when = fmtDate(h.ended_at);
  let inner = `<button class="ghost small" id="histBack">‹ Retour à l'historique</button>`;

  if(h.game === "bingo"){
    const sboard = h.data?.scoreboard || [];
    const medals = ["🥇", "🥈", "🥉"];
    inner += `<h3>💜 Bingo Commercial <small class="histWhen">${when}</small></h3>
      <div class="histTags">
        <span class="chip">🏆 ${esc(h.data?.reward || "Gain")}</span>
        <span class="chip">👥 ${h.data?.players || 0} joueur(s)</span>
        <span class="chip">${h.winner ? "🏅 " + esc(h.winner) : "Pas de bingo"}</span>
      </div>
      <div class="boardList">` +
      (sboard.length ? sboard.map((s, idx) => `
        <div class="rankRow${idx === 0 && s.win ? " top" : ""}">
          <span class="medal">${s.win ? (medals[idx] || "🏅") : "▫️"}</span>
          <strong>${esc(s.player)}</strong>
          <span class="wins">${s.done}/${s.total} · ${s.pct}%</span>
        </div>`).join("") : "<p>Aucun joueur sur cette partie.</p>") +
      `</div>`;
  } else if(h.game === "battleship"){
    const d = h.data || {};
    const ships = d.ships || [];
    inner += `<h3>🚢 Touché-coulé <small class="histWhen">${when}</small></h3>
      <div class="histTags">
        <span class="chip">🏆 ${esc(d.reward || "10 €")} le coup fatal</span>
        <span class="chip">🎯 ${d.hits || 0}/${d.shots || 0} tirs au but</span>
        <span class="chip">🚢 ${ships.filter(s => s.sunk).length}/${ships.length} coulés</span>
      </div>
      <div class="boardList">` +
      (ships.length ? ships.map(s => `
        <div class="rankRow${s.sunk ? " top" : ""}">
          <span class="medal">${s.sunk ? "🔥" : "🚢"}</span>
          <strong>${esc(s.name)}</strong>
          <span class="wins">${s.sunk ? "coulé par " + esc(s.sunk_by || "?") : "a survécu"}</span>
        </div>`).join("") : "<p>Aucun bateau.</p>") +
      `</div>`;
  } else {
    const d = h.data || {};
    inner += `<h3>🎭 Qui suis-je ? <small class="histWhen">${when}</small></h3>
      <div class="whoDetail">
        <div class="whoPhotoWrap">
          ${d.image ? `<img src="${esc(d.image)}" class="histPhoto" alt="photo mystère"/>` : `<div class="histPhoto empty">Pas de photo</div>`}
        </div>
        <div class="whoDetailStats">
          <div class="statRow">
            <div class="stat"><span>${d.reveal_pct ?? 0}%</span><label>dévoilé 🔍</label></div>
            <div class="stat"><span>${d.subs ?? 0}/${d.goal ?? "?"}</span><label>abos 💸</label></div>
            <div class="stat"><span>${d.grid ?? "?"}²</span><label>cases</label></div>
          </div>
          <div class="histTags">
            <span class="chip">${h.winner ? "🏆 " + esc(h.winner) : "Sans vainqueur"}</span>
            ${d.answer ? `<span class="chip">🕵️ Réponse : ${esc(d.answer)}</span>` : ""}
          </div>
          ${d.clue ? `<p class="rules">${esc(d.clue)}</p>` : ""}
        </div>
      </div>`;
  }

  box.innerHTML = inner;
  box.classList.remove("hidden");
  $("historyList").classList.add("hidden");
  $("histBack").onclick = () => {
    box.classList.add("hidden");
    $("historyList").classList.remove("hidden");
  };
}
