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
