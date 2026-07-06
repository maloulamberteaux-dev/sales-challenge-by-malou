async function init(){
  bindUiEvents();
  bindWhoEvents();
  bindBingoEvents();
  mode();

  let params = new URLSearchParams(location.search);
  let p = params.get("player") || getSavedPlayer() || "";
  $("playerName").value = p;
  $("bingoPlayer").value = p;

  await initSupabase();

  if(params.get("game") === "bingo"){
    showPage("bingo");
    if(p) openBingo();
  } else {
    showPage("home");
  }
}

init();
