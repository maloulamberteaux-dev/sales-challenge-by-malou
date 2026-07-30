// 🏢 Workspaces : onboarding, validation des membres, gestion, super admin

let allWorkspaces = [];

async function loadWorkspaces(){
  const { data } = await sb.from("workspaces").select("*").order("name");
  allWorkspaces = data || [];
  return allWorkspaces;
}

// Un membre non-super qui n'a pas de workspace actif doit passer par l'onboarding
function needsOnboarding(){
  return !!currentUser && !superAdmin && !(currentWorkspace && memberStatus === "active");
}

// --- Onboarding (rejoindre / créer une équipe) ---
async function renderOnboarding(){
  await loadWorkspaces();
  const choice = $("onbChoice"), pending = $("onbPending");
  const hasReq = memberStatus === "pending" && requestedWorkspace;
  choice.classList.toggle("hidden", !!hasReq);
  pending.classList.toggle("hidden", !hasReq);

  if(hasReq){
    const ws = allWorkspaces.find(w => w.id === requestedWorkspace);
    $("onbPendingTxt").innerHTML = `Ta demande pour rejoindre <b>${esc(ws?.name || "l'équipe")}</b> a été envoyée.<br>Un team leader va te valider — tu recevras l'accès automatiquement.`;
    return;
  }
  const sel = $("onbWorkspaceSelect");
  sel.innerHTML = allWorkspaces.length
    ? allWorkspaces.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join("")
    : `<option value="">Aucune équipe pour l'instant</option>`;
  $("onbJoin").disabled = !allWorkspaces.length;
}

async function requestJoin(){
  const wsId = $("onbWorkspaceSelect").value;
  if(!wsId) return;
  await sb.from("players").update({ requested_workspace_id: wsId, status: "pending", workspace_id: null }).eq("email", currentUser.email.toLowerCase());
  await resolveMember();
  renderAuth();
}

async function createWorkspace(){
  const name = $("onbTeamName").value.trim();
  if(!name){ alert("Donne un nom à ton équipe 🙂"); return; }
  const { data, error } = await sb.from("workspaces").insert({ name }).select().single();
  if(error){ alert("Création impossible : " + error.message); return; }
  await sb.from("players").update({ workspace_id: data.id, role: "admin", status: "active", requested_workspace_id: null }).eq("email", currentUser.email.toLowerCase());
  await resolveMember();
  authLanded = false;
  renderAuth();
  await enterWorkspaceData();
}

async function cancelRequest(){
  await sb.from("players").update({ requested_workspace_id: null }).eq("email", currentUser.email.toLowerCase());
  await resolveMember();
  renderAuth();
}

// --- Admin : membres à valider ---
async function loadPending(){
  if(!sb || !currentWorkspace || !admin){ updatePendingBadge(0); return; }
  const { data } = await sb.from("players").select("*").eq("requested_workspace_id", currentWorkspace).eq("status", "pending");
  const list = data || [];
  updatePendingBadge(list.length);
  const box = $("pendingList");
  if(!box) return;
  box.innerHTML = list.length ? list.map(u => `
    <div class="playerCard">
      ${u.avatar ? `<img src="${esc(u.avatar)}" class="pAvatar" alt=""/>` : `<span class="pAvatar fallback">${esc((u.name || "?")[0].toUpperCase())}</span>`}
      <div class="pInfo"><div class="pName"><span class="nm">${esc(u.name || u.email)}</span></div><small>${esc(u.email)}</small></div>
      <div class="uActions">
        <button class="small" data-ok="${esc(u.email)}">✅ Accepter</button>
        <button class="small ghost" data-no="${esc(u.email)}">✖ Refuser</button>
      </div>
    </div>`).join("") : "<p class='emptyBoard'>Aucune demande en attente 👌</p>";
  box.querySelectorAll("button[data-ok]").forEach(b => b.onclick = () => approveMember(b.dataset.ok));
  box.querySelectorAll("button[data-no]").forEach(b => b.onclick = () => rejectMember(b.dataset.no));
}

function updatePendingBadge(n){
  const b = $("pendingBadge");
  if(b){ b.textContent = n; b.classList.toggle("hidden", !n); }
  const t = document.querySelector('.subtab[data-sub="adminPending"]');
  if(t) t.classList.toggle("hasPending", n > 0);
}

async function approveMember(email){
  await sb.from("players").update({ workspace_id: currentWorkspace, requested_workspace_id: null, status: "active" }).eq("email", email);
  loadPending(); if(typeof loadUsers === "function") loadUsers(); loadExcludedNames();
}
async function rejectMember(email){
  if(!confirm("Refuser cette demande ?")) return;
  await sb.from("players").update({ requested_workspace_id: null }).eq("email", email);
  loadPending();
}

// --- Admin : gestion des membres (promotion / retrait) ---
async function setMemberRole(email, role){
  await sb.from("players").update({ role }).eq("email", email);
  if(typeof loadUsers === "function") loadUsers();
  loadExcludedNames();
}
async function removeMember(email){
  if(!confirm("Retirer ce membre de l'équipe ?")) return;
  await sb.from("players").update({ workspace_id: null, status: "pending", requested_workspace_id: null }).eq("email", email);
  if(typeof loadUsers === "function") loadUsers();
}

// Ajout direct d'un membre par email (pré-autorisé : actif dès sa connexion)
async function inviteMember(){
  const email = ($("inviteEmail").value || "").trim().toLowerCase();
  if(!email.includes("@") || email.length < 5){ alert("Entre une adresse email valide 🙂"); return; }
  const { data: existing } = await sb.from("players").select("email,workspace_id,status").eq("email", email).maybeSingle();
  if(existing){
    if(existing.workspace_id === currentWorkspace && existing.status === "active"){ alert("Ce membre est déjà dans l'équipe."); return; }
    await sb.from("players").update({ workspace_id: currentWorkspace, status: "active", requested_workspace_id: null }).eq("email", email);
  } else {
    await sb.from("players").insert({ email, name: email.split("@")[0], workspace_id: currentWorkspace, status: "active", role: "member" });
  }
  $("inviteEmail").value = "";
  if(typeof loadUsers === "function") loadUsers();
}

// --- Super admin : sélecteur d'équipe + vue d'ensemble ---
async function renderWorkspaceSwitcher(){
  const wrap = $("wsSwitcher");
  if(!wrap) return;
  wrap.classList.toggle("hidden", !superAdmin || !currentUser);
  if(!superAdmin || !currentUser) return;
  await loadWorkspaces();
  const sel = $("wsSelect");
  sel.innerHTML = allWorkspaces.map(w => `<option value="${w.id}"${w.id === currentWorkspace ? " selected" : ""}>${esc(w.name)}</option>`).join("");
}

async function switchWorkspace(id){
  if(!id || id === currentWorkspace) return;
  currentWorkspace = id;
  authLanded = false;
  renderAuth();
  await enterWorkspaceData();
}

// Le super admin crée une équipe (et peut assigner un team leader par email)
async function superCreateWorkspace(){
  const name = ($("newWsName").value || "").trim();
  if(!name){ alert("Donne un nom à l'équipe 🙂"); return; }
  const { data: ws, error } = await sb.from("workspaces").insert({ name }).select().single();
  if(error){ alert("Création impossible : " + error.message); return; }
  const leader = ($("newWsLeader").value || "").trim().toLowerCase();
  if(leader && leader.includes("@")){
    const { data: ex } = await sb.from("players").select("email").eq("email", leader).maybeSingle();
    if(ex) await sb.from("players").update({ workspace_id: ws.id, role: "admin", status: "active", requested_workspace_id: null }).eq("email", leader);
    else await sb.from("players").insert({ email: leader, name: leader.split("@")[0], workspace_id: ws.id, role: "admin", status: "active" });
  }
  $("newWsName").value = ""; $("newWsLeader").value = "";
  await loadWorkspaces();
  renderWorkspaceSwitcher();
  loadWorkspacesOverview();
  alert(`Équipe « ${name} » créée ✅` + (leader ? `\nTeam leader : ${leader}` : "\nPense à lui assigner un team leader."));
}

async function loadWorkspacesOverview(){
  if(!sb || !superAdmin) return;
  await loadWorkspaces();
  const members = (await sb.from("players").select("workspace_id,role,status")).data || [];
  const box = $("wsOverview");
  if(!box) return;
  box.innerHTML = allWorkspaces.map(w => {
    const mine = members.filter(m => m.workspace_id === w.id && m.status === "active");
    const admins = mine.filter(m => m.role === "admin").length;
    const pend = members.filter(m => m.requested_workspace_id === w.id).length;
    return `<div class="playerCard">
      <span class="rank">🏢</span>
      <div class="pInfo"><div class="pName"><span class="nm">${esc(w.name)}</span>${w.id === currentWorkspace ? "<span class='roleChip adm'>vue actuelle</span>" : ""}</div>
        <small>${mine.length} membre(s) · ${admins} admin(s)${pend ? " · " + pend + " en attente" : ""}</small></div>
      <div class="uActions"><button class="small${w.id === currentWorkspace ? " ghost" : ""}" data-ws="${w.id}">${w.id === currentWorkspace ? "Actuel" : "Voir"}</button></div>
    </div>`;
  }).join("") || "<p class='emptyBoard'>Aucune équipe.</p>";
  box.querySelectorAll("button[data-ws]").forEach(b => b.onclick = () => switchWorkspace(b.dataset.ws));
}

// --- Super admin : gestion de TOUS les membres (déplacement entre équipes) ---
let _allMembersCache = [];

async function loadAllMembers(){
  if(!sb || !superAdmin) return;
  await loadWorkspaces();
  const { data } = await sb.from("players").select("*");
  _allMembersCache = (data || []).sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));
  renderAllMembers();
}

function renderAllMembers(){
  const box = $("allMembersList");
  if(!box) return;
  const wsName = {}; allWorkspaces.forEach(w => wsName[w.id] = w.name);
  const q = ($("allMembersSearch")?.value || "").toLowerCase().trim();
  const list = _allMembersCache.filter(u => {
    const team = wsName[u.workspace_id] || "";
    return !q || (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || team.toLowerCase().includes(q);
  });
  const managers = _allMembersCache.filter(u => u.role === "admin" && u.workspace_id).length;
  if($("allMembersSummary")) $("allMembersSummary").textContent = `👥 ${_allMembersCache.length} membre(s) · 🏢 ${allWorkspaces.length} équipe(s) · 👑 ${managers} manager(s)`;

  box.innerHTML = list.map(u => {
    const isAdm = u.role === "admin";
    const email = (u.email || "").toLowerCase();
    const opts = allWorkspaces.map(w => `<option value="${w.id}"${w.id === u.workspace_id ? " selected" : ""}>${esc(w.name)}</option>`).join("");
    const noTeam = !u.workspace_id ? `<option value="" selected>— sans équipe —</option>` : "";
    const pend = u.status === "pending"
      ? `<span class="roleChip">⏳ en attente${u.requested_workspace_id ? " → " + esc(wsName[u.requested_workspace_id] || "?") : ""}</span>` : "";
    return `<div class="playerCard">
      ${u.avatar ? `<img src="${esc(u.avatar)}" class="pAvatar" alt=""/>` : `<div class="pAvatar fallback">${esc((u.name || "?")[0].toUpperCase())}</div>`}
      <div class="pInfo">
        <div class="pName"><span class="nm">${esc(u.name || u.email)}</span><span class="roleChip ${isAdm ? "adm" : ""}">${isAdm ? "👑 Manager" : "Membre"}</span>${pend}</div>
        <small>${esc(u.email)}</small>
      </div>
      <div class="uActions">
        <label class="amTeam">🏢 <select data-move="${esc(email)}">${noTeam}${opts}</select></label>
        <button class="small ghost" data-role="${esc(email)}" data-to="${isAdm ? "member" : "admin"}">${isAdm ? "⬇️ Simple membre" : "👑 Nommer Manager"}</button>
        <button class="small ghost danger" data-del="${esc(email)}" title="Retirer de son équipe">🗑️</button>
      </div>
    </div>`;
  }).join("") || `<p class="emptyBoard">${q ? "Aucun membre ne correspond 🔍" : "Aucun membre."}</p>`;

  box.querySelectorAll("select[data-move]").forEach(s => s.onchange = () => moveMemberTo(s.dataset.move, s.value));
  box.querySelectorAll("button[data-role]").forEach(b => b.onclick = () => setMemberRoleGlobal(b.dataset.role, b.dataset.to));
  box.querySelectorAll("button[data-del]").forEach(b => b.onclick = () => removeMemberGlobal(b.dataset.del));
}

async function moveMemberTo(email, wsId){
  if(!wsId) return;
  await sb.from("players").update({ workspace_id: wsId, status: "active", requested_workspace_id: null }).eq("email", email);
  await loadAllMembers();
  if(typeof loadExcludedNames === "function") loadExcludedNames();
}
async function setMemberRoleGlobal(email, role){
  await sb.from("players").update({ role }).eq("email", email);
  await loadAllMembers();
  if(typeof loadExcludedNames === "function") loadExcludedNames();
}
async function removeMemberGlobal(email){
  if(!confirm("Retirer ce membre de son équipe ? Il devra redemander à rejoindre une équipe.")) return;
  await sb.from("players").update({ workspace_id: null, status: "pending", requested_workspace_id: null }).eq("email", email);
  await loadAllMembers();
}

function bindWorkspaceEvents(){
  $("onbJoin").onclick = requestJoin;
  $("onbCreate").onclick = createWorkspace;
  $("onbCancel").onclick = cancelRequest;
  $("wsSelect").onchange = () => switchWorkspace($("wsSelect").value);
  $("inviteBtn").onclick = inviteMember;
  $("inviteEmail").onkeydown = e => { if(e.key === "Enter") inviteMember(); };
  $("usersSearch").oninput = () => { if(typeof renderUsersList === "function") renderUsersList(); };
  $("newWsBtn").onclick = superCreateWorkspace;
  if($("allMembersSearch")) $("allMembersSearch").oninput = () => renderAllMembers();
}
