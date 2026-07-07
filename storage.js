let currentUser = null;   // objet user Supabase (session Google)
let currentPlayer = "";   // nom d'affichage servant d'identité de jeu
let admin = false;        // admin EFFECTIF (peut être bridé par le mode "vue joueur")
let realAdmin = false;    // vrai statut admin (email dans window.ADMIN_EMAILS)
let viewAsPlayer = localStorage.getItem("viewAsPlayer") === "1"; // test : admin qui se voit en joueur
let excludedNames = new Set(); // noms d'affichage des comptes de test (rempli au démarrage)
let adminNames = new Set();    // noms d'affichage des admins (hors classement)

function isAdminEmail(email){
  return (window.ADMIN_EMAILS || []).map(e => String(e).toLowerCase()).includes(String(email || "").toLowerCase());
}
function isAdminName(name){ return adminNames.has(name); }
// Ne figure PAS dans les classements / gains : admin ou compte de test
function isNonCompeting(name){ return excludedNames.has(name) || adminNames.has(name); }

// Bascule "voir en tant que joueur" (seulement pour un vrai admin, propre à ce navigateur)
function setViewAsPlayer(v){
  viewAsPlayer = v;
  if(v) localStorage.setItem("viewAsPlayer", "1"); else localStorage.removeItem("viewAsPlayer");
  admin = realAdmin && !viewAsPlayer;
}

// Comptes de test : exclus des listes joueurs / vainqueurs / classements
function isExcludedEmail(email){
  return (window.EXCLUDED_EMAILS || []).map(e => String(e).toLowerCase()).includes(String(email || "").toLowerCase());
}
function isExcludedName(name){
  return excludedNames.has(name);
}

// Met à jour l'état (user / joueur / admin) à partir d'une session Supabase.
function applySession(session){
  currentUser = session?.user || null;
  if(currentUser){
    const meta = currentUser.user_metadata || {};
    currentPlayer = (meta.full_name || meta.name || currentUser.email || "").trim();
    const email = (currentUser.email || "").toLowerCase();
    const allow = (window.ADMIN_EMAILS || []).map(e => String(e).toLowerCase());
    realAdmin = allow.includes(email);
    admin = realAdmin && !viewAsPlayer;   // en mode "vue joueur", on se bride volontairement
  } else {
    currentPlayer = "";
    realAdmin = false;
    admin = false;
  }
}
