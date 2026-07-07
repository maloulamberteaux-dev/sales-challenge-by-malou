// 🏆 Classement — agrège les victoires enregistrées dans la table results

async function loadLeaderboard(){
  if(!sb) return;
  let {data, error} = await sb.from("results").select("game,player,won_at");
  if(error){
    $("boardWho").innerHTML = $("boardBingo").innerHTML = $("boardBattleship").innerHTML = "<p>⚠️ Table <b>results</b> absente — lance le SQL de setup.</p>";
    return;
  }
  const agg = {};
  (data || []).filter(r => !isExcludedName(r.player)).forEach(r => {
    const g = agg[r.game] || (agg[r.game] = {});
    g[r.player] = (g[r.player] || 0) + 1;
  });
  $("boardWho").innerHTML = renderBoard(agg.who);
  $("boardBingo").innerHTML = renderBoard(agg.bingo);
  $("boardBattleship").innerHTML = renderBoard(agg.battleship);
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
