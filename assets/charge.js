/* ==========================================================================
   MOTEUR DE CALCUL DE LA CHARGE D'ENTRAÎNEMENT
   --------------------------------------------------------------------------
   Conventions retenues (explicitées pour que rien ne soit implicite) :

   • Charge d'une séance (UA, « unités arbitraires ») = RPE total (0-10)
     × durée totale en minutes.  Méthode sRPE, Foster 1998/2001.

   • Charge aiguë (j)      = somme des charges des 7 derniers jours, jour j inclus.
   • Charge chronique (j)  = somme des charges des 28 derniers jours / 4,
     donc exprimée sur la même échelle hebdomadaire que la charge aiguë.
   • ACWR glissant         = charge aiguë / charge chronique.

   • ACWR exponentiel (EWMA, Williams 2017) : λ = 2 / (N + 1),
     EWMA(j) = charge(j) × λ + EWMA(j−1) × (1 − λ), avec N = 7 puis N = 28.
     Plus réactif et moins sujet à l'effet « fenêtre » que le glissant ;
     les deux sont affichés côte à côte.

   • Monotonie (Foster)    = moyenne des charges quotidiennes sur 7 jours
     / écart-type de ces mêmes 7 valeurs (jours de repos comptés comme 0,
     écart-type d'échantillon, n−1).
   • Contrainte (strain)   = charge hebdomadaire totale × monotonie.

   Limite structurelle à garder en tête : tous ces indices supposent que la
   totalité de l'entraînement est déclarée. Une charge chronique sous-estimée
   (séances solo non saisies) gonfle mécaniquement l'ACWR. D'où l'affichage
   systématique du nombre de séances déclarées sur la fenêtre.
   ========================================================================== */

const Charge = (() => {

  const JOUR_MS = 86400000;

  /* ----- Dates ----------------------------------------------------------- */

  function versDate(valeur) {
    if (valeur instanceof Date) return new Date(valeur.getFullYear(), valeur.getMonth(), valeur.getDate());
    const s = String(valeur).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(s);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function cle(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const j = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${m}-${j}`;
  }

  function ajouteJours(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  }

  function ecartJours(a, b) {
    return Math.round((b - a) / JOUR_MS);
  }

  function formateJour(date) {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  /** Lundi de la semaine contenant `date`. */
  function lundi(date) {
    const j = (date.getDay() + 6) % 7;        // 0 = lundi
    return ajouteJours(date, -j);
  }

  /* ----- Séries journalières --------------------------------------------- */

  /**
   * Construit la série continue jour par jour, du premier entraînement
   * déclaré jusqu'à `dateFin` (par défaut aujourd'hui). Les jours sans
   * séance valent 0 : c'est indispensable, sinon la monotonie et les
   * moyennes sont fausses.
   */
  function serieJournaliere(seances, dateFin) {
    if (!seances.length) return [];
    const parJour = new Map();
    let premier = null;

    seances.forEach(s => {
      const d = versDate(s.date);
      if (!d) return;
      const k = cle(d);
      parJour.set(k, (parJour.get(k) || 0) + (s.charge || 0));
      if (!premier || d < premier) premier = d;
    });
    if (!premier) return [];

    const fin = dateFin ? versDate(dateFin) : versDate(new Date());
    const n = Math.max(0, ecartJours(premier, fin));
    const serie = [];
    for (let i = 0; i <= n; i++) {
      const d = ajouteJours(premier, i);
      serie.push({ date: d, cle: cle(d), charge: parJour.get(cle(d)) || 0 });
    }
    return serie;
  }

  /* ----- Indices --------------------------------------------------------- */

  function sommeFenetre(serie, i, taille) {
    let t = 0;
    for (let k = Math.max(0, i - taille + 1); k <= i; k++) t += serie[k].charge;
    return t;
  }

  function ecartTypeEchantillon(valeurs) {
    const n = valeurs.length;
    if (n < 2) return 0;
    const moy = valeurs.reduce((a, b) => a + b, 0) / n;
    const v = valeurs.reduce((a, b) => a + (b - moy) ** 2, 0) / (n - 1);
    return Math.sqrt(v);
  }

  /**
   * Enrichit la série avec, pour chaque jour :
   * aigue, chronique, acwr, ewmaAigue, ewmaChronique, acwrEwma,
   * monotonie, contrainte, joursHistorique.
   */
  function indices(serie) {
    const LA = 2 / (7 + 1);
    const LC = 2 / (28 + 1);
    let ea = null, ec = null;

    return serie.map((jour, i) => {
      const aigue = sommeFenetre(serie, i, 7);
      const chronique = sommeFenetre(serie, i, 28) / 4;

      ea = (ea === null) ? jour.charge : jour.charge * LA + ea * (1 - LA);
      ec = (ec === null) ? jour.charge : jour.charge * LC + ec * (1 - LC);

      const derniers7 = serie.slice(Math.max(0, i - 6), i + 1).map(d => d.charge);
      const moy7 = derniers7.reduce((a, b) => a + b, 0) / derniers7.length;
      const et7 = ecartTypeEchantillon(derniers7);
      const mono = (et7 > 0 && derniers7.length >= 7) ? moy7 / et7 : null;

      return Object.assign({}, jour, {
        joursHistorique: i + 1,
        aigue,
        chronique,
        acwr: chronique > 0 ? aigue / chronique : null,
        ewmaAigue: ea,
        ewmaChronique: ec,
        acwrEwma: ec > 0 ? ea / ec : null,
        monotonie: mono,
        contrainte: mono !== null ? aigue * mono : null
      });
    });
  }

  /* ----- Agrégation hebdomadaire ----------------------------------------- */

  /** Charges cumulées par semaine civile (lundi → dimanche). */
  function parSemaine(seances) {
    const carte = new Map();
    seances.forEach(s => {
      const d = versDate(s.date);
      if (!d) return;
      const l = lundi(d);
      const k = cle(l);
      if (!carte.has(k)) carte.set(k, { debut: l, charge: 0, km: 0, minutes: 0, seances: 0 });
      const e = carte.get(k);
      e.charge += s.charge || 0;
      e.km += s.distance || 0;
      e.minutes += s.duree || 0;
      e.seances += 1;
    });
    return [...carte.values()].sort((a, b) => a.debut - b.debut);
  }

  /** Complète les semaines sans aucune séance, sinon le graphique ment. */
  function semainesCompletes(seances, dateFin) {
    const base = parSemaine(seances);
    if (!base.length) return [];
    const fin = lundi(dateFin ? versDate(dateFin) : versDate(new Date()));
    const carte = new Map(base.map(s => [cle(s.debut), s]));
    const out = [];
    let cur = base[0].debut;
    while (cur <= fin) {
      out.push(carte.get(cle(cur)) || { debut: cur, charge: 0, km: 0, minutes: 0, seances: 0 });
      cur = ajouteJours(cur, 7);
    }
    return out;
  }

  /* ----- Lecture des indices --------------------------------------------- */

  /**
   * Situation du jour pour un coureur.
   * Retourne null si aucune séance déclarée.
   */
  function situation(seances, dateFin) {
    const serie = indices(serieJournaliere(seances, dateFin));
    if (!serie.length) return null;
    const dernier = serie[serie.length - 1];

    const fin = dateFin ? versDate(dateFin) : versDate(new Date());
    const dans = (jours) => seances.filter(s => {
      const d = versDate(s.date);
      return d && ecartJours(d, fin) >= 0 && ecartJours(d, fin) < jours;
    });

    const s7 = dans(7), s28 = dans(28);
    const assez = dernier.joursHistorique >= CONFIG.JOURS_MINI_ACWR;

    return {
      serie,
      jour: dernier,
      historiqueSuffisant: assez,
      acwr: assez ? dernier.acwr : null,
      acwrEwma: assez ? dernier.acwrEwma : null,
      chargeAigue: dernier.aigue,
      chargeChronique: dernier.chronique,
      monotonie: dernier.monotonie,
      contrainte: dernier.contrainte,
      seances7: s7.length,
      seances28: s28.length,
      km7: s7.reduce((a, s) => a + (s.distance || 0), 0),
      minutes7: s7.reduce((a, s) => a + (s.duree || 0), 0),
      derniereSeance: seances.length
        ? seances.map(s => versDate(s.date)).filter(Boolean).sort((a, b) => b - a)[0]
        : null
    };
  }

  /** Code couleur d'un ACWR. Repère de discussion, jamais un verdict. */
  function statutAcwr(acwr) {
    if (acwr === null || acwr === undefined || !isFinite(acwr)) return { classe: 'gris', texte: '—' };
    if (acwr < 0.60) return { classe: 'rouge', texte: 'Sous-charge marquée' };
    if (acwr < CONFIG.ACWR_BAS) return { classe: 'ambre', texte: 'Sous-charge' };
    if (acwr <= CONFIG.ACWR_HAUT) return { classe: 'vert', texte: 'Zone habituelle' };
    if (acwr <= 1.50) return { classe: 'ambre', texte: 'Montée rapide' };
    return { classe: 'rouge', texte: 'Pic de charge' };
  }

  function statutMonotonie(m) {
    if (m === null || m === undefined || !isFinite(m)) return { classe: 'gris', texte: '—' };
    if (m < 1.5) return { classe: 'vert', texte: 'Variée' };
    if (m < 2.0) return { classe: 'ambre', texte: 'Peu variée' };
    return { classe: 'rouge', texte: 'Monotone' };
  }

  return {
    versDate, cle, ajouteJours, ecartJours, formateJour, lundi,
    serieJournaliere, indices, parSemaine, semainesCompletes,
    situation, statutAcwr, statutMonotonie
  };
})();
