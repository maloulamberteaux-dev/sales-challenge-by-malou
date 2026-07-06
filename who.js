let who = {subs:0, goal:37, grid:10, blur:18, hidden:[], clue:"💡 Indice : pas encore dévoilé", answer:"", image:""};

async function loadWho(){
  let {data, error} = await sb.from("game_state").select("data").eq("id", "who").single();
  if(error){
    $("syncStatus").textContent = "⚠️ Lance le SQL Supabase d’abord";
    return;
  }
  if(data) who = data.data;
  renderWho();
}

function buildTiles(){
  let n = +who.grid || 10;
  let t = $("tiles");
  t.innerHTML = "";
  t.style.gridTemplateColumns = `repeat(${n},1fr)`;
  t.style.gridTemplateRows = `repeat(${n},1fr)`;
  let total = n * n;
  who.hidden = who.hidden?.length === total ? who.hidden : Array(total).fill(false);

  for(let i = 0; i < total; i++){
    let d = document.createElement("div");
    d.className = "tile";
    if(who.hidden?.[i]) d.classList.add("off");
    d.onclick = async () => {
      if(!admin) return;
      who.hidden[i] = !who.hidden[i];
      await saveGame("who", who);
    };
    t.appendChild(d);
  }
}

function renderWho(){
  $("whoGoal").value = who.goal || 37;
  $("whoGrid").value = who.grid || 10;
  $("whoAnswer").value = who.answer || "";
  $("answerBox").textContent = who.answer || "Réponse masquée";
  $("subs").textContent = who.subs || 0;
  $("goalText").textContent = who.goal || 37;
  $("bar").style.width = Math.min(100, (who.subs || 0) / (who.goal || 37) * 100) + "%";
  $("clue").textContent = who.clue || "💡 Indice : pas encore dévoilé";

  if(who.image){
    $("whoImg").src = who.image;
    $("whoImg").style.display = "block";
    $("placeholder").style.display = "none";
  }
  $("whoImg").style.filter = `blur(${who.blur ?? 18}px)`;
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

function bindWhoEvents(){
  $("whoGrid").onchange = async () => {
    who.grid = +$("whoGrid").value;
    who.hidden = Array(who.grid * who.grid).fill(false);
    await saveGame("who", who);
  };
  $("whoGoal").oninput = async () => {
    who.goal = +$("whoGoal").value;
    await saveGame("who", who);
  };
  $("whoFile").onchange = e => {
    let f = e.target.files[0];
    if(!f) return;
    let r = new FileReader();
    r.onload = async ev => {
      who.image = ev.target.result;
      await saveGame("who", who);
    };
    r.readAsDataURL(f);
  };
  $("showClue").onclick = async () => {
    who.clue = "💡 Indice : " + ($("whoClueInput").value || "pas encore dévoilé");
    await saveGame("who", who);
  };
  $("toggleAnswer").onclick = () => $("answerBox").classList.toggle("visible");
  $("whoAnswer").oninput = async () => {
    who.answer = $("whoAnswer").value;
    await saveGame("who", who);
  };
  $("addSub").onclick = async () => {
    who.subs = (who.subs || 0) + 1;
    revealRandom();
    if(who.subs % 2 === 0) who.blur = Math.max(0, (who.blur ?? 18) - 1);
    await saveGame("who", who);
  };
  $("revealOne").onclick = async () => {
    revealRandom();
    await saveGame("who", who);
  };
  $("resetWho").onclick = async () => {
    who = {subs:0, goal:37, grid:10, blur:18, hidden:Array(100).fill(false), clue:"💡 Indice : pas encore dévoilé", answer:"", image:""};
    await saveGame("who", who);
  };
}
