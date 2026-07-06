const ADMIN_PASSWORD = "malou";
const $ = id => document.getElementById(id);

function shuffle(a){
  return [...a].sort(() => Math.random() - .5);
}

function confetti(){
  for(let i = 0; i < 90; i++){
    let c = document.createElement("div");
    c.style.cssText = `position:fixed;top:-10px;left:${Math.random()*100}vw;width:10px;height:14px;background:${["#ff4fb8","#7b2cff","#ffd65a"][Math.floor(Math.random()*3)]};z-index:99;animation:fall 1.4s linear forwards`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1600);
  }
}

let st = document.createElement("style");
st.innerHTML = "@keyframes fall{to{transform:translateY(105vh) rotate(500deg);opacity:.2}}";
document.head.appendChild(st);
