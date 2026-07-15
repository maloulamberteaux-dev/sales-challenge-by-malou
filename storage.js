let currentUser = null;      // objet user Supabase (session Google)
let currentPlayer = "";      // nom d'affichage servant d'identité de jeu
let currentWorkspace = null; // uuid du workspace (équipe) du user connecté
let memberRole = "member";   // rôle dans son workspace : 'admin' | 'member'
let memberStatus = "none";   // 'active' | 'pending' | 'none' (pas encore de fiche)
let requestedWorkspace = null; // workspace demandé (en attente de validation)
let superAdmin = false;      // Safir : accès à tous les workspaces
let admin = false;           // admin EFFECTIF (super admin OU rôle admin), bridé par "vue joueur"
let realAdmin = false;       // avant bridage "vue joueur"
let viewAsPlayer = localStorage.getItem("viewAsPlayer") === "1";
let excludedNames = new Set(); // noms d'affichage des comptes de test
let adminNames = new Set();    // noms d'affichage des admins/super admins (hors classement)

function isSuperAdminEmail(email){
  return (window.SUPER_ADMIN_EMAILS || []).map(e => String(e).toLowerCase()).includes(String(email || "").toLowerCase());
}
// Le user connecté est-il admin (rôle ou super admin), indépendamment de "vue joueur" ?
function isMeAdmin(){ return superAdmin || memberRole === "admin"; }

function isAdminName(name){ return adminNames.has(name); }
function isNonCompeting(name){ return excludedNames.has(name) || adminNames.has(name); }

// Comptes de test : exclus des listes joueurs / vainqueurs / classements
function isExcludedEmail(email){
  return (window.EXCLUDED_EMAILS || []).map(e => String(e).toLowerCase()).includes(String(email || "").toLowerCase());
}
function isExcludedName(name){ return excludedNames.has(name); }

function recomputeAdmin(){
  realAdmin = superAdmin || memberRole === "admin";
  admin = realAdmin && !viewAsPlayer;
}

// Bascule "voir en tant que joueur" (propre à ce navigateur)
function setViewAsPlayer(v){
  viewAsPlayer = v;
  if(v) localStorage.setItem("viewAsPlayer", "1"); else localStorage.removeItem("viewAsPlayer");
  recomputeAdmin();
}

// Session Google → identité + statut super admin
function applySession(session){
  currentUser = session?.user || null;
  if(currentUser){
    const meta = currentUser.user_metadata || {};
    currentPlayer = (meta.full_name || meta.name || currentUser.email || "").trim();
    superAdmin = isSuperAdminEmail(currentUser.email);
  } else {
    currentPlayer = ""; superAdmin = false;
    currentWorkspace = null; memberRole = "member"; memberStatus = "none";
  }
  recomputeAdmin();
}

// Fiche membre résolue depuis la base → workspace + rôle + statut
function applyMember(member){
  if(member){
    currentWorkspace = member.workspace_id || null;
    memberRole = member.role || "member";
    memberStatus = member.status || "active";
    requestedWorkspace = member.requested_workspace_id || null;
  } else {
    currentWorkspace = null; memberRole = "member"; memberStatus = "none"; requestedWorkspace = null;
  }
  recomputeAdmin();
}
