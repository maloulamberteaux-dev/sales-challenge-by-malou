let currentUser = null;   // objet user Supabase (session Google)
let currentPlayer = "";   // nom d'affichage servant d'identité de jeu
let admin = false;        // true si l'email est dans window.ADMIN_EMAILS
let excludedNames = new Set(); // noms d'affichage des comptes de test (rempli au démarrage)

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
    admin = allow.includes(email);
  } else {
    currentPlayer = "";
    admin = false;
  }
}
