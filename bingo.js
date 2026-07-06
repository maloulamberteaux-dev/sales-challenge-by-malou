let bingoSettings = {size:4, reward:"50 € pour le premier Bingo", tasks:["3 recos prises dans la journée", "2 abos dans une démo groupée", "Faire une blague dans un call", "6 abos dans la journée"]};

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
  $("rewardTxt").textContent = bingoSettings.reward || "50 € pour le premier Bingo";
}

async function loadBingo(player){
  let {data} = await sb.from("bingo_cards").select("data").eq("player", player).maybeSingle();
  if(data) renderBingo(data.data);
}

async function openBingo(){
  let p = currentPlayer;
  if(!p) return;
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
  $("rewardTxt").textContent = card.reward || bingoSettings.reward;
  let n = card.size || 4;
  let b = $("bingoBoard");
  b.style.gridTemplateColumns = `repeat(${n},1fr)`;
  b.innerHTML = "";

  card.cells.forEach((it) => {
    let c = document.createElement("button");
    c.className = "bingoCell";
    c.textContent = it.t;
    if(it.checked) c.classList.add("checked");
    c.onclick = async () => {
      it.checked = !it.checked;
      await sb.from("bingo_cards").upsert({player:currentPlayer, data:card, updated_at:new Date().toISOString()});
      renderBingo(card);
    };
    b.appendChild(c);
  });
  checkBingo(n);
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
      confetti();
      return;
    }
  }
  $("bingoMsg").textContent = "🔥 Continue, chaque mission te rapproche du Bingo !";
}

async function loadPlayers(){
  if(!sb) return;
  let {data} = await sb.from("bingo_cards").select("player,data").order("updated_at", {ascending:false});
  $("adminPlayers").innerHTML = (data || []).map(row => {
    let total = row.data.cells?.length || 0;
    let done = row.data.cells?.filter(c => c.checked).length || 0;
    return `<div class="playerCard">💜 ${row.player}<br>${done}/${total} cases cochées</div>`;
  }).join("") || "Aucun joueur pour l’instant.";
}

function bindBingoEvents(){
  $("saveBingoSettings").onclick = async () => {
    bingoSettings = {
      size:+$("bingoSize").value,
      reward:$("bingoReward").value,
      tasks:$("bingoTasks").value.split("\n").map(x => x.trim()).filter(Boolean)
    };
    await saveGame("bingo_settings", bingoSettings);
  };
  $("resetMyBingo").onclick = async () => {
    if(!currentPlayer) return;
    await sb.from("bingo_cards").delete().eq("player", currentPlayer);
    await openBingo();
  };
}
