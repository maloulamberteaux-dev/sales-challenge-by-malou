// 🏆 Classement — agrège les victoires enregistrées dans la table results

async function loadLeaderboard(){
  if(!sb) return;
  let {data, error} = await sb.from("results").select("game,player,won_at").eq("workspace_id", WS());
  if(error){
    $("boardWho").innerHTML = $("boardBingo").innerHTML = $("boardBattleship").innerHTML = "<p>⚠️ Table <b>results</b> absente — lance le SQL de setup.</p>";
    if($("boardOie")) $("boardOie").innerHTML = "";
    return;
  }
  const agg = {};
  (data || []).filter(r => !isNonCompeting(r.player)).forEach(r => {
    const g = agg[r.game] || (agg[r.game] = {});
    g[r.player] = (g[r.player] || 0) + 1;
  });
  $("boardWho").innerHTML = renderBoard(agg.who);
  $("boardBingo").innerHTML = renderBoard(agg.bingo);
  $("boardBattleship").innerHTML = renderBoard(agg.battleship);
  if($("boardOie")) $("boardOie").innerHTML = renderBoard(agg.oie);
}

// Extrait le montant numérique d'une récompense ("50 € pour..." -> 50)
function rewardAmount(str){
  const m = String(str || "").match(/(\d+[.,]?\d*)/);
  return m ? parseFloat(m[1].replace(",", ".")) : 0;
}
function fmtEuro(n){
  return (Number.isInteger(n) ? n : n.toFixed(2)) + " €";
}

const GAINS_GAMES = {
  who: {i:"🎭", n:"Qui suis-je"},
  bingo: {i:"💜", n:"Bingo"},
  battleship: {i:"🚢", n:"Touché-coulé (coup fatal)"},
  oie: {i:"🪿", n:"Jeu de l'Oie"}
};

// 💰 Suivi des gains (dashboard admin) : total par personne + journal détaillé
async function loadGains(){
  if(!sb) return;
  const {data, error} = await sb.from("results").select("*").eq("workspace_id", WS()).order("won_at", {ascending:false});
  if(error){ $("gainsTotals").innerHTML = "<p>⚠️ Table results absente.</p>"; return; }
  const rows = (data || []).filter(r => !isNonCompeting(r.player));

  // Avatars par nom (depuis la table players)
  const av = {};
  ((await sb.from("players").select("name,avatar").eq("workspace_id", WS())).data || []).forEach(p => { if(p.name) av[p.name] = p.avatar; });

  // Totaux par joueur : ce qui reste à payer vs déjà versé
  const per = {};
  rows.forEach(r => {
    per[r.player] = per[r.player] || {player:r.player, due:0, paid:0, count:0};
    const amt = rewardAmount(r.reward);
    if(r.paid) per[r.player].paid += amt; else per[r.player].due += amt;
    per[r.player].count++;
  });
  const totals = Object.values(per).sort((a, b) => b.due - a.due || (b.due + b.paid) - (a.due + a.paid));
  $("gainsTotals").innerHTML = totals.length ? totals.map(p => {
    const badge = av[p.player] ? `<img src="${esc(av[p.player])}" class="pAvatar mini" alt=""/>` : `<span class="pAvatar fallback mini">${esc((p.player || "?")[0].toUpperCase())}</span>`;
    const right = p.due > 0
      ? `<span class="chip gold">${fmtEuro(p.due)} à payer</span>`
      : `<span class="chip paidChip">✅ à jour</span>`;
    const sub = p.paid > 0 ? `${p.count} gain${p.count > 1 ? "s" : ""} · ${fmtEuro(p.paid)} versé${p.paid > 1 ? "s" : ""}` : `${p.count} gain${p.count > 1 ? "s" : ""}`;
    return `<div class="playerCard">${badge}
      <div class="pInfo"><strong>${esc(p.player)}</strong><small>${sub}</small></div>${right}</div>`;
  }).join("") : "<p class='emptyBoard'>Aucun gain pour l'instant 💤</p>";

  // Journal détaillé : chaque gain = une ligne + bouton payé/à payer
  $("gainsLedger").innerHTML = rows.map(r => {
    const g = GAINS_GAMES[r.game] || {i:"🎮", n:r.game};
    const when = fmtDate(r.won_at);
    const btn = r.paid
      ? `<button class="small paidBtn" data-g="${esc(r.game)}" data-p="${esc(r.player)}" data-r="${esc(r.round)}" data-paid="1">✅ Payé</button>`
      : `<button class="small ghost" data-g="${esc(r.game)}" data-p="${esc(r.player)}" data-r="${esc(r.round)}" data-paid="0">💸 Marquer payé</button>`;
    return `<div class="ledgerRow${r.paid ? " isPaid" : ""}">
      <span class="lgGame">${g.i}</span>
      <div class="lgInfo"><strong>${esc(r.player)}</strong><small>${g.n} · ${when}</small></div>
      <span class="chip">${esc(r.reward || "—")}</span>${btn}</div>`;
  }).join("") || "<p class='emptyBoard'>Aucun gain enregistré.</p>";

  $("gainsLedger").querySelectorAll("button[data-g]").forEach(b => b.onclick = () =>
    toggleGainPaid(b.dataset.g, b.dataset.p, b.dataset.r, b.dataset.paid !== "1"));
}

// Marque un gain comme payé (ou annule) — réservé aux admins (RLS)
async function toggleGainPaid(game, player, round, paid){
  const { error } = await sb.from("results")
    .update({ paid, paid_at: paid ? new Date().toISOString() : null })
    .eq("game", game).eq("player", player).eq("round", round).eq("workspace_id", WS());
  if(error){ alert("Mise à jour impossible : " + error.message); return; }
  loadGains();
}

function renderBoard(counts){
  const rows = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  if(!rows.length) return `<p class="emptyBoard">Pas encore de vainqueur — à vous de jouer ! 🎯</p>`;
  const medals = ["🥇", "🥈", "🥉"];
  return rows.map(([player, wins], i) => `
    <div class="rankRow${i === 0 ? " top" : ""}">
      <span class="medal">${medals[i] || "🏅"}</span>
      <strong>${esc(player)}</strong>
      <span class="wins">${wins} victoire${wins > 1 ? "s" : ""}</span>
    </div>`).join("");
}
