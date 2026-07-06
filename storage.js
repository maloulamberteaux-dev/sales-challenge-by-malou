let admin = localStorage.getItem("malou_admin") === "1";
let currentPlayer = "";

function setAdmin(value){
  admin = value;
  if(value) localStorage.setItem("malou_admin", "1");
  else localStorage.removeItem("malou_admin");
}

function savePlayer(player){
  currentPlayer = player;
  localStorage.setItem("player", player);
}

function getSavedPlayer(){
  return localStorage.getItem("player") || "";
}
