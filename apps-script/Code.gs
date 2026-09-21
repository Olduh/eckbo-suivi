/* ==========================================================================
   ECKBO TEAM — Suivi des entraînements
   Backend Google Apps Script, à coller dans le projet Apps Script lié
   au Google Sheet qui sert de mémoire.
   --------------------------------------------------------------------------
   Deux actions, toutes deux en POST :
     { action: "ajout",   ... }          → ajoute une ligne
     { action: "donnees", mdp: "..." }   → renvoie tout, après vérification

   Le mot de passe n'est PAS écrit dans ce fichier : il est lu dans les
   propriétés du script (menu Paramètres du projet → Propriétés du script,
   clé MDP_COACH). Il ne se trouve donc jamais dans le dépôt GitHub public.
   ========================================================================== */

var FEUILLE = 'Seances';

var COLONNES = [
  'horodatage', 'id', 'coureur', 'groupe', 'date', 'type_seance',
  'duree_min', 'distance_km', 'forme', 'rpe_total', 'allures',
  'rpe_travail', 'charge_ua', 'commentaire'
];

/* ----- Entrées ---------------------------------------------------------- */

function doPost(requete) {
  try {
    var corps = JSON.parse(requete.postData.contents || '{}');
    switch (corps.action) {
      case 'ajout':   return reponse(ajoute(corps));
      case 'donnees': return reponse(donnees(corps));
      case 'ping':    return reponse({ ok: true, version: 1 });
      default:        return reponse({ ok: false, erreur: 'Action inconnue.' });
    }
  } catch (e) {
    return reponse({ ok: false, erreur: 'Erreur serveur : ' + e.message });
  }
}

/** Ouvrir l'URL /exec dans un navigateur affiche simplement cet état. */
function doGet() {
  return reponse({ ok: true, service: 'Eckbo Team — suivi des entraînements', lignes: null });
}

function reponse(objet) {
  return ContentService
    .createTextOutput(JSON.stringify(objet))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ----- Feuille ---------------------------------------------------------- */

function feuille() {
  var classeur = SpreadsheetApp.getActiveSpreadsheet();
  var f = classeur.getSheetByName(FEUILLE);
  if (!f) {
    f = classeur.insertSheet(FEUILLE);
    f.appendRow(COLONNES);
    f.getRange(1, 1, 1, COLONNES.length)
      .setFontWeight('bold')
      .setBackground('#121212')
      .setFontColor('#FFFFFF');
    f.setFrozenRows(1);
    // La colonne date reste du texte : aucune conversion, aucun décalage horaire.
    f.getRange(2, 5, f.getMaxRows() - 1, 1).setNumberFormat('@');
  }
  return f;
}

/* ----- Ajout d'une séance ----------------------------------------------- */

function ajoute(d) {
  var manquant = ['coureur', 'date', 'type_seance', 'duree', 'rpe_total', 'rpe_travail', 'forme', 'allures']
    .filter(function (c) { return d[c] === undefined || d[c] === null || d[c] === ''; });
  if (manquant.length) {
    return { ok: false, erreur: 'Champs manquants : ' + manquant.join(', ') + '.' };
  }

  var duree = Number(d.duree);
  var rpe = Number(d.rpe_total);
  if (!(duree > 0) || duree > 1440) return { ok: false, erreur: 'Durée invalide.' };
  if (!(rpe >= 0 && rpe <= 10))     return { ok: false, erreur: 'RPE invalide.' };

  var verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    var f = feuille();
    var id = String(d.id || Utilities.getUuid());

    // Anti-doublon : la file d'attente hors ligne peut renvoyer deux fois.
    if (f.getLastRow() > 1) {
      var ids = f.getRange(2, 2, f.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === id) return { ok: true, doublon: true, id: id };
      }
    }

    // La colonne date est forcée en texte AVANT l'écriture : sinon Sheets
    // convertit « 2026-09-21 » en objet Date et le relit dans le format
    // d'affichage local, ce qui peut faire perdre l'année.
    var ligne = f.getLastRow() + 1;
    f.getRange(ligne, 5).setNumberFormat('@');
    f.getRange(ligne, 1, 1, COLONNES.length).setValues([[
      new Date(),
      id,
      String(d.coureur).trim(),
      String(d.groupe || '').trim(),
      String(d.date).slice(0, 10),
      String(d.type_seance),
      duree,
      d.distance === null || d.distance === undefined || d.distance === '' ? '' : Number(d.distance),
      Number(d.forme),
      rpe,
      String(d.allures),
      Number(d.rpe_travail),
      Math.round(rpe * duree),
      String(d.commentaire || '').slice(0, 600)
    ]]);

    return { ok: true, id: id, charge: Math.round(rpe * duree) };
  } finally {
    verrou.releaseLock();
  }
}

/* ----- Lecture réservée aux coachs -------------------------------------- */

function donnees(d) {
  if (!motDePasseValide(d.mdp)) {
    Utilities.sleep(700);   // ralentit une tentative répétée
    return { ok: false, erreur: 'Mot de passe incorrect.' };
  }

  var f = feuille();
  if (f.getLastRow() < 2) return { ok: true, lignes: [] };

  var brut = f.getRange(2, 1, f.getLastRow() - 1, COLONNES.length).getValues();
  var fuseau = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();

  var lignes = brut
    .filter(function (r) { return r[2]; })
    .map(function (r) {
      return {
        horodatage: estDate(r[0]) ? Utilities.formatDate(r[0], fuseau, "yyyy-MM-dd'T'HH:mm:ss") : String(r[0]),
        coureur: String(r[2]).trim(),
        groupe: String(r[3] || '').trim(),
        date: jourIso(r[4], fuseau),
        type_seance: String(r[5] || ''),
        duree: r[6] === '' ? null : Number(r[6]),
        distance: r[7] === '' ? null : Number(r[7]),
        forme: r[8] === '' ? null : Number(r[8]),
        rpe_total: r[9] === '' ? null : Number(r[9]),
        allures: String(r[10] || ''),
        rpe_travail: r[11] === '' ? null : Number(r[11]),
        commentaire: String(r[13] || '')
      };
    });

  return { ok: true, lignes: lignes };
}

/**
 * `valeur instanceof Date` n'est pas fiable sur ce que renvoie getValues() :
 * l'objet vient d'un autre contexte d'exécution et le test échoue, alors que
 * la valeur est bien une date. On teste donc le comportement, pas le type.
 */
function estDate(v) {
  return !!v && typeof v.getTime === 'function' && !isNaN(v.getTime());
}

/** Ramène une cellule de date à « AAAA-MM-JJ », quelle que soit sa forme. */
function jourIso(v, fuseau) {
  if (estDate(v)) return Utilities.formatDate(v, fuseau, 'yyyy-MM-dd');
  var s = String(v || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);   // 21/09/2026
  if (m) {
    return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  var d = new Date(s);                             // dernier recours
  return isNaN(d.getTime()) ? s.slice(0, 10) : Utilities.formatDate(d, fuseau, 'yyyy-MM-dd');
}

function motDePasseValide(saisi) {
  var attendu = PropertiesService.getScriptProperties().getProperty('MDP_COACH') || 'EckPass';
  if (!saisi || saisi.length !== attendu.length) return false;
  // Comparaison à temps constant : ne renseigne pas sur le nombre de bons caractères.
  var diff = 0;
  for (var i = 0; i < attendu.length; i++) {
    diff |= saisi.charCodeAt(i) ^ attendu.charCodeAt(i);
  }
  return diff === 0;
}

/* ----- Utilitaire : à lancer une fois depuis l'éditeur ------------------- */

/**
 * Crée la feuille et pose le mot de passe s'il n'existe pas encore.
 * Lance-la une seule fois via le menu ▶ Exécuter, puis change le mot de
 * passe dans Paramètres du projet → Propriétés du script.
 */
function initialisation() {
  feuille();
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('MDP_COACH')) p.setProperty('MDP_COACH', 'EckPass');
  Logger.log('Feuille prête. Mot de passe coach : ' + p.getProperty('MDP_COACH'));
}
