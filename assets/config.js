/* ==========================================================================
   CONFIGURATION — le seul fichier à modifier après le déploiement
   ==========================================================================

   1. Déploie le script Google Apps Script (voir apps-script/Code.gs et le
      README), récupère l'URL de l'application web, qui ressemble à :
         https://script.google.com/macros/s/AKfycbx..../exec
   2. Colle-la ci-dessous, à la place de COLLER_ICI.
   3. Commit + push : GitHub Pages se met à jour tout seul en ~1 minute.

   Le mot de passe coach n'est PAS dans ce fichier : il est vérifié côté
   Google (propriété de script), donc invisible dans le dépôt public.
   ========================================================================== */

const CONFIG = {

  // URL de l'application web Apps Script (se termine par /exec)
  URL_API: "https://script.google.com/macros/s/AKfycbwks1orZIo_2QCV0fqDoroXPlBsfsnKNgx-8dy2rBPj1cwBt99hemmJoUTM-FF4p1DF3g/exec",

  // Types de séance proposés (l'ordre est celui affiché)
  TYPES_SEANCE: [
    "Seuil",
    "Run & renfo",
    "Allure spécifique",
    "Sortie longue",
    "Fractionné court",
    "Autre"
  ],

  // Réponses possibles à « j'ai pu tenir les allures prévues »
  ALLURES: ["Oui", "En partie", "Non"],

  // Bornes du « sweet spot » ACWR affichées sur les graphiques.
  // À lire comme un repère de discussion, pas comme un seuil de décision.
  ACWR_BAS: 0.80,
  ACWR_HAUT: 1.30,

  // Nombre de jours d'historique nécessaires avant d'afficher un ACWR.
  // En dessous, la charge chronique n'a pas de sens.
  JOURS_MINI_ACWR: 21,

  VERSION: "1.0"
};
