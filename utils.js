const $ = id => document.getElementById(id);

function shuffle(a){
  return [...a].sort(() => Math.random() - .5);
}

// Échappe le HTML (noms, missions... tout ce qui vient des données)
function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

// "il y a 5 min", "à l'instant"...
function timeAgo(iso){
  if(!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if(s < 60) return "à l'instant";
  if(s < 3600) return `il y a ${Math.floor(s/60)} min`;
  if(s < 86400) return `il y a ${Math.floor(s/3600)} h`;
  return `il y a ${Math.floor(s/86400)} j`;
}

// Rang gamifié selon la progression
function rankFor(pct, win){
  if(win) return {e:"👑", l:"Légende"};
  if(pct >= 75) return {e:"🚀", l:"Machine"};
  if(pct >= 50) return {e:"💪", l:"Closer"};
  if(pct >= 25) return {e:"🔥", l:"Chasseur"};
  if(pct > 0) return {e:"⚡", l:"Lancé(e)"};
  return {e:"🐣", l:"Rookie"};
}

// Une carte bingo a-t-elle une ligne/colonne/diagonale complète ?
function hasBingoCard(card){
  const n = card?.size || 4, cells = card?.cells || [];
  const ck = i => !!cells[i]?.checked;
  for(let r = 0; r < n; r++) if([...Array(n)].every((_, c) => ck(r * n + c))) return true;
  for(let c = 0; c < n; c++) if([...Array(n)].every((_, r) => ck(r * n + c))) return true;
  if([...Array(n)].every((_, i) => ck(i * n + i))) return true;
  if([...Array(n)].every((_, i) => ck(i * n + n - 1 - i))) return true;
  return false;
}

function confetti(){
  for(let i = 0; i < 120; i++){
    let c = document.createElement("div");
    let size = 8 + Math.random() * 8;
    c.style.cssText = `position:fixed;top:-12px;left:${Math.random()*100}vw;width:${size}px;height:${size*1.3}px;border-radius:3px;background:${["#ff4fb8","#7b2cff","#ffd65a","#4fd8ff"][Math.floor(Math.random()*4)]};z-index:99;animation:fall ${1.2+Math.random()*.9}s linear forwards`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2200);
  }
}

let st = document.createElement("style");
st.innerHTML = "@keyframes fall{to{transform:translateY(105vh) rotate(520deg);opacity:.15}}";
document.head.appendChild(st);


function fileToCompressedDataUrl(file, maxSize = 900, quality = 0.82){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire l’image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image invalide."));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
