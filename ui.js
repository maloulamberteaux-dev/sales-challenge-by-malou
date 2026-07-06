function showPage(p){
  document.querySelectorAll(".page").forEach(e => e.classList.add("hidden"));
  $(p).classList.remove("hidden");
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.page === p));
}
window.showPage = showPage;

function mode(){
  document.querySelectorAll(".adminOnly").forEach(e => e.classList.toggle("hidden", !admin));
  $("loginBtn").classList.toggle("hidden", admin);
  $("logoutBtn").classList.toggle("hidden", !admin);
  $("modeText").textContent = admin ? "Mode admin — tu pilotes les jeux en direct." : "Vue joueur — tout se synchronise en direct.";
}

function bindUiEvents(){
  $("loginBtn").onclick = () => $("modal").classList.remove("hidden");
  $("cancelLogin").onclick = () => $("modal").classList.add("hidden");
  $("okLogin").onclick = () => {
    if($("pwd").value === ADMIN_PASSWORD){
      setAdmin(true);
      $("modal").classList.add("hidden");
      mode();
    } else {
      alert("Mot de passe incorrect");
    }
  };
  $("logoutBtn").onclick = () => {
    setAdmin(false);
    mode();
    showPage("home");
  };
  document.querySelectorAll(".tab").forEach(b => b.onclick = () => showPage(b.dataset.page));
}
