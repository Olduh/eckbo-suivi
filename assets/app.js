/* ==========================================================================
   APPLICATION — saisie coureur + espace coach
   ========================================================================== */

(() => {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  const CLE_NOM     = 'eckbo_nom';
  const CLE_GROUPE  = 'eckbo_groupe';
  const CLE_FILE    = 'eckbo_file_attente';
  const CLE_MDP     = 'eckbo_mdp_coach';

  const stock = {
    lire(c)     { try { return localStorage.getItem(c); } catch (e) { return null; } },
    ecrire(c, v){ try { localStorage.setItem(c, v); } catch (e) {} },
    effacer(c)  { try { localStorage.removeItem(c); } catch (e) {} }
  };

  /* ======================================================================
     Réseau
     ====================================================================== */

  /**
   * Apps Script n'accepte pas de requête pré-contrôlée (CORS preflight) :
   * on envoie donc du texte brut, ce qui en fait une « requête simple ».
   */
  async function appelApi(charge) {
    if (!CONFIG.URL_API || CONFIG.URL_API === 'COLLER_ICI') {
      throw new Error('Le site n\'est pas encore relié au Google Sheet (URL_API manquante dans assets/config.js).');
    }
    const r = await fetch(CONFIG.URL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(charge),
      redirect: 'follow'
    });
    if (!r.ok) throw new Error('Le serveur a répondu ' + r.status + '.');
    const t = await r.text();
    let j;
    try { j = JSON.parse(t); }
    catch (e) { throw new Error('Réponse inattendue du serveur.'); }
    if (!j.ok) throw new Error(j.erreur || 'Erreur inconnue côté serveur.');
    return j;
  }

  /* ======================================================================
     Messages
     ====================================================================== */

  function message(type, html, zone) {
    const cible = zone || $('#zone-messages');
    const d = document.createElement('div');
    d.className = 'message ' + type;
    d.innerHTML = html;
    cible.innerHTML = '';
    cible.appendChild(d);
    return d;
  }

  function videMessages(zone) { (zone || $('#zone-messages')).innerHTML = ''; }

  /* ======================================================================
     Échelle visuelle analogique
     ====================================================================== */

  function creeEvs(hote) {
    const nom = hote.dataset.evs;
    const libelles = (hote.dataset.libelles || '').split('|');
    const champ = $('#' + nom);
    let valeur = null;   // 0–100, continu

    hote.innerHTML =
      '<div class="evs-valeur">' +
        '<span class="evs-chiffre vide">—</span>' +
        '<span class="evs-libelle">glisse ou touche la barre</span>' +
      '</div>' +
      '<div class="evs-piste" data-actif="0" role="slider" tabindex="0" ' +
           'aria-valuemin="0" aria-valuemax="10" aria-label="Échelle de 0 à 10">' +
        '<div class="evs-rail"></div>' +
        '<div class="evs-masque"></div>' +
        '<div class="evs-graduations">' + '<i></i>'.repeat(11) + '</div>' +
        '<div class="evs-curseur"></div>' +
      '</div>' +
      '<div class="evs-bornes"><span>0 · ' + hote.dataset.min + '</span><span>' + hote.dataset.max + ' · 10</span></div>';

    const piste   = $('.evs-piste', hote);
    const chiffre = $('.evs-chiffre', hote);
    const libelle = $('.evs-libelle', hote);
    const curseur = $('.evs-curseur', hote);
    const masque  = $('.evs-masque', hote);

    function affiche() {
      if (valeur === null) return;
      const sur10 = valeur / 10;
      piste.dataset.actif = '1';
      chiffre.classList.remove('vide');
      chiffre.textContent = sur10.toFixed(1).replace('.', ',');
      libelle.textContent = libelles[Math.round(sur10)] || '';
      const l = piste.clientWidth;
      curseur.style.left = (valeur / 100 * l) + 'px';
      masque.style.width = ((100 - valeur) / 100 * l) + 'px';
      piste.setAttribute('aria-valuenow', sur10.toFixed(1));
      champ.value = sur10.toFixed(1);
    }

    function depuisEvenement(ev) {
      const r = piste.getBoundingClientRect();
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      valeur = Math.max(0, Math.min(100, (x / r.width) * 100));
      affiche();
    }

    let actif = false;
    piste.addEventListener('pointerdown', ev => {
      actif = true;
      piste.setPointerCapture(ev.pointerId);
      depuisEvenement(ev);
      ev.preventDefault();
    });
    piste.addEventListener('pointermove', ev => { if (actif) depuisEvenement(ev); });
    piste.addEventListener('pointerup',     () => { actif = false; });
    piste.addEventListener('pointercancel', () => { actif = false; });

    piste.addEventListener('keydown', ev => {
      const pas = ev.shiftKey ? 10 : 5;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp')   { valeur = Math.min(100, (valeur || 0) + pas); affiche(); ev.preventDefault(); }
      if (ev.key === 'ArrowLeft'  || ev.key === 'ArrowDown') { valeur = Math.max(0,   (valeur || 0) - pas); affiche(); ev.preventDefault(); }
    });

    window.addEventListener('resize', () => { if (valeur !== null) affiche(); });

    return {
      nom,
      get valeur() { return valeur === null ? null : +(valeur / 10).toFixed(1); },
      reinitialise() {
        valeur = null;
        champ.value = '';
        piste.dataset.actif = '0';
        chiffre.classList.add('vide');
        chiffre.textContent = '—';
        libelle.textContent = 'glisse ou touche la barre';
        masque.style.width = '100%';
        piste.removeAttribute('aria-valuenow');
      },
      hote
    };
  }

  /* ======================================================================
     Groupes de boutons
     ====================================================================== */

  function creeChoix(conteneur, valeurs, champ) {
    conteneur.innerHTML = '';
    valeurs.forEach(v => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = v;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        $$('button', conteneur).forEach(x => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        champ.value = v;
      });
      conteneur.appendChild(b);
    });
    return {
      reinitialise() {
        $$('button', conteneur).forEach(x => x.setAttribute('aria-pressed', 'false'));
        champ.value = '';
      }
    };
  }

  /* ======================================================================
     Onglets
     ====================================================================== */

  function initOnglets() {
    const paires = [['#tab-saisie', '#page-saisie'], ['#tab-coach', '#page-coach']];
    paires.forEach(([to, po]) => {
      $(to).addEventListener('click', () => {
        paires.forEach(([t, p]) => {
          const actif = t === to;
          $(t).setAttribute('aria-selected', actif ? 'true' : 'false');
          $(p).classList.toggle('active', actif);
        });
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
    });
  }

  /* ======================================================================
     FORMULAIRE DE SAISIE
     ====================================================================== */

  let evs = {}, choixType, choixAllures;

  function initSaisie() {
    // Liste des coureurs
    const sel = $('#coureur');
    MEMBRES.forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
    const memo = stock.lire(CLE_NOM);
    if (memo && MEMBRES.includes(memo)) {
      sel.value = memo;
      $('#aide-nom').textContent = 'Ce n\'est pas toi ? Change simplement le nom ci-dessus.';
    }
    sel.addEventListener('change', () => stock.ecrire(CLE_NOM, sel.value));

    const grp = $('#groupe');
    const memoG = stock.lire(CLE_GROUPE);
    if (memoG) grp.value = memoG;
    grp.addEventListener('change', () => stock.ecrire(CLE_GROUPE, grp.value));

    // Date du jour par défaut
    const a = new Date();
    $('#date').value = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}`;
    $('#date').max = $('#date').value;

    // Choix
    choixType    = creeChoix($('#choix-type'),    CONFIG.TYPES_SEANCE, $('#type_seance'));
    choixAllures = creeChoix($('#choix-allures'), CONFIG.ALLURES,      $('#allures'));

    // Échelles
    $$('[data-evs]').forEach(h => { const c = creeEvs(h); evs[c.nom] = c; });

    // Incréments de durée
    $$('.duree-ligne .pas').forEach(b => b.addEventListener('click', () => {
      const i = $('#duree');
      const v = parseInt(i.value || '60', 10) + parseInt(b.dataset.pas, 10);
      i.value = Math.max(5, Math.min(600, v));
    }));

    $('#formulaire').addEventListener('submit', envoie);
    $('#nouvelle-saisie').addEventListener('click', reinitialiseFormulaire);

    videFileAttente();
  }

  /** Identifiant unique : évite qu'une séance remise en file parte deux fois. */
  function identifiant() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /** Accepte indifféremment la virgule et le point : sur un clavier français,
      c'est la virgule qui tombe sous le pouce. */
  function nombre(texte) {
    const t = String(texte === null || texte === undefined ? '' : texte).trim().replace(',', '.');
    if (t === '') return null;
    const v = parseFloat(t);
    return isNaN(v) ? NaN : v;
  }

  function collecte() {
    return {
      action: 'ajout',
      id: identifiant(),
      coureur: $('#coureur').value.trim(),
      groupe: $('#groupe').value,
      date: $('#date').value,
      type_seance: $('#type_seance').value,
      duree: nombre($('#duree').value),
      distance: nombre($('#distance').value),
      forme: evs.forme.valeur,
      rpe_total: evs.rpe_total.valeur,
      allures: $('#allures').value,
      rpe_travail: evs.rpe_travail.valeur,
      commentaire: $('#commentaire').value.trim()
    };
  }

  function valide(d) {
    if (!d.coureur)                       return 'Choisis ton nom dans la liste.';
    if (!d.date)                          return 'Indique la date de la séance.';
    if (!d.type_seance)                   return 'Sélectionne le type de séance.';
    if (!d.duree || d.duree <= 0)         return 'Indique la durée de la séance, en minutes.';
    if (d.duree > 1440)                   return 'La durée saisie dépasse 24 h : il doit y avoir une erreur.';
    if (d.distance !== null && (isNaN(d.distance) || d.distance < 0)) return 'La distance ne semble pas valide.';
    if (d.forme === null)                 return 'Place le curseur sur l\'échelle de forme.';
    if (d.rpe_total === null)             return 'Place le curseur sur l\'échelle de difficulté de la séance.';
    if (!d.allures)                       return 'Réponds à la question sur les allures.';
    if (d.rpe_travail === null)           return 'Place le curseur sur l\'échelle de difficulté de la partie travail.';
    return null;
  }

  async function envoie(ev) {
    ev.preventDefault();
    videMessages();

    const d = collecte();
    const erreur = valide(d);
    if (erreur) {
      message('erreur', erreur);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const bouton = $('#bouton-envoi');
    bouton.disabled = true;
    bouton.innerHTML = '<span class="chargement"></span>Envoi…';

    try {
      await appelApi(d);
      afficheConfirmation(d, true);
    } catch (e) {
      // Rien n'est perdu : la séance part dans la file d'attente locale.
      empile(d);
      afficheConfirmation(d, false, e.message);
    } finally {
      bouton.disabled = false;
      bouton.textContent = 'Envoyer ma séance';
    }
  }

  function afficheConfirmation(d, enLigne, raison) {
    $('#formulaire').style.display = 'none';
    $('#confirmation').style.display = 'block';
    $('#confirmation-texte').textContent = enLigne
      ? 'Ta séance est bien arrivée chez le coach.'
      : 'Réseau indisponible : ta séance est gardée sur ce téléphone et partira toute seule à la prochaine ouverture du site.';

    const charge = Math.round(d.rpe_total * d.duree);
    $('#recap').innerHTML = [
      ['Coureur', d.coureur],
      ['Séance', d.type_seance],
      ['Durée', d.duree + ' min' + (d.distance ? ' · ' + String(d.distance).replace('.', ',') + ' km' : '')],
      ['RPE séance', String(d.rpe_total).replace('.', ',') + ' / 10'],
      ['Charge', charge + ' UA']
    ].map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');

    if (!enLigne && raison) {
      message('attente', '<b>Mise en attente.</b> ' + raison, $('#zone-messages'));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function reinitialiseFormulaire() {
    $('#confirmation').style.display = 'none';
    $('#formulaire').style.display = 'block';
    videMessages();
    choixType.reinitialise();
    choixAllures.reinitialise();
    Object.values(evs).forEach(c => c.reinitialise());
    $('#duree').value = '';
    $('#distance').value = '';
    $('#commentaire').value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ----- File d'attente hors ligne --------------------------------------- */

  function empile(d) {
    let f = [];
    try { f = JSON.parse(stock.lire(CLE_FILE) || '[]'); } catch (e) {}
    f.push(d);
    stock.ecrire(CLE_FILE, JSON.stringify(f));
  }

  async function videFileAttente() {
    let f = [];
    try { f = JSON.parse(stock.lire(CLE_FILE) || '[]'); } catch (e) { return; }
    if (!f.length) return;

    const restantes = [];
    for (const d of f) {
      try { await appelApi(d); }
      catch (e) { restantes.push(d); }
    }
    if (restantes.length) {
      stock.ecrire(CLE_FILE, JSON.stringify(restantes));
      message('attente', `${restantes.length} séance(s) encore en attente d'envoi : garde ce site ouvert quelques secondes quand tu auras du réseau.`);
    } else {
      stock.effacer(CLE_FILE);
      message('ok', `${f.length} séance(s) mise(s) en attente ont bien été envoyées.`);
      setTimeout(videMessages, 6000);
    }
  }

  /* ======================================================================
     ESPACE COACH
     ====================================================================== */

  let donneesCoach = null;
  let motDePasse = null;

  function initCoach() {
    $('#formulaire-connexion').addEventListener('submit', async ev => {
      ev.preventDefault();
      await connecte($('#motdepasse').value);
    });
    $('#rafraichir').addEventListener('click', () => charge(true));
    $('#export-csv').addEventListener('click', exporteCsv);
    $('#selection-coureur').addEventListener('change', rendu);
    $('#filtre-groupe').addEventListener('change', () => { remplitSelection(); rendu(); });

    const memo = stock.lire(CLE_MDP);
    if (memo) { motDePasse = memo; connecte(memo, true); }
  }

  async function connecte(mdp, silencieux) {
    const zone = $('#message-connexion');
    const b = $('#bouton-connexion');
    if (!mdp) { message('erreur', 'Saisis le mot de passe.', zone); return; }
    b.disabled = true; b.innerHTML = '<span class="chargement"></span>Vérification…';
    try {
      const r = await appelApi({ action: 'donnees', mdp });
      motDePasse = mdp;
      stock.ecrire(CLE_MDP, mdp);
      donneesCoach = normalise(r.lignes || []);
      $('#connexion').style.display = 'none';
      $('#tableau-bord').style.display = 'block';
      remplitSelection();
      rendu();
    } catch (e) {
      stock.effacer(CLE_MDP);
      if (!silencieux) message('erreur', e.message, zone);
    } finally {
      b.disabled = false; b.textContent = 'Entrer';
    }
  }

  async function charge(forcer) {
    if (!motDePasse) return;
    const z = $('#zone-coach');
    if (forcer) z.innerHTML = '<p class="vide">Chargement…</p>';
    try {
      const r = await appelApi({ action: 'donnees', mdp: motDePasse });
      donneesCoach = normalise(r.lignes || []);
      remplitSelection();
      rendu();
    } catch (e) {
      z.innerHTML = `<div class="message erreur">${e.message}</div>`;
    }
  }

  function normalise(lignes) {
    ecartees = 0;
    return lignes.map(l => {
      const d = Charge.versDate(l.date);
      const duree = parseFloat(l.duree) || 0;
      const rpeTotal = l.rpe_total === '' || l.rpe_total === null ? null : parseFloat(l.rpe_total);
      return {
        horodatage: l.horodatage,
        coureur: (l.coureur || '').trim(),
        groupe: (l.groupe || '').trim(),
        date: l.date,
        dateObj: d,
        type: l.type_seance || '',
        duree,
        distance: l.distance === '' || l.distance === null ? null : parseFloat(l.distance),
        forme: l.forme === '' || l.forme === null ? null : parseFloat(l.forme),
        rpeTotal,
        allures: l.allures || '',
        rpeTravail: l.rpe_travail === '' || l.rpe_travail === null ? null : parseFloat(l.rpe_travail),
        commentaire: l.commentaire || '',
        charge: (rpeTotal !== null ? rpeTotal : 0) * duree
      };
    }).filter(l => l.coureur && plausible(l.dateObj));
  }

  /**
   * Garde-fou : une date mal relue côté serveur (année perdue, format exotique)
   * atterrirait silencieusement en 2001 et fausserait toutes les charges.
   * Mieux vaut écarter la ligne et le dire que l'intégrer sans le dire.
   */
  let ecartees = 0;
  function plausible(d) {
    if (!d || isNaN(d.getTime())) { ecartees++; return false; }
    const an = d.getFullYear();
    const demain = Charge.ajouteJours(Charge.versDate(new Date()), 1);
    if (an < 2020 || d > demain) { ecartees++; return false; }
    return true;
  }

  function coureursFiltres() {
    const g = $('#filtre-groupe').value;
    const vus = new Map();
    (donneesCoach || []).forEach(l => {
      if (g && l.groupe !== g) return;
      if (!vus.has(l.coureur)) vus.set(l.coureur, []);
      vus.get(l.coureur).push(l);
    });
    return vus;
  }

  function remplitSelection() {
    const sel = $('#selection-coureur');
    const courant = sel.value;
    sel.innerHTML = '<option value="__groupe__">▸ Vue d\'ensemble du groupe</option>';
    [...coureursFiltres().keys()].sort((a, b) => a.localeCompare(b, 'fr')).forEach(n => {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      sel.appendChild(o);
    });
    if ([...sel.options].some(o => o.value === courant)) sel.value = courant;
  }

  function rendu() {
    const z = $('#zone-coach');
    z.innerHTML = '';
    if (!donneesCoach || !donneesCoach.length) {
      z.innerHTML = '<p class="vide">Aucune séance enregistrée pour le moment.</p>';
      return;
    }
    if (ecartees) {
      z.insertAdjacentHTML('beforeend',
        `<div class="message erreur">${ecartees} ligne(s) du Sheet ont une date inexploitable et ont été écartées du calcul. À vérifier dans l'onglet <em>Seances</em>.</div>`);
    }
    const choix = $('#selection-coureur').value;
    if (choix === '__groupe__') rendGroupe(z); else rendCoureur(z, choix);
  }

  /* ----- Vue d'ensemble --------------------------------------------------- */

  function rendGroupe(z) {
    const parCoureur = coureursFiltres();
    const lignes = [...parCoureur.entries()].map(([nom, ses]) => {
      const s = Charge.situation(ses);
      return { nom, s, groupe: ses[ses.length - 1].groupe };
    });

    // Les situations qui appellent un regard remontent en tête de liste.
    const rang = (x) => {
      if (!x.s || !x.s.historiqueSuffisant) return 3;
      const a = x.s.acwrEwma;
      if (a === null) return 3;
      if (a > 1.50 || a < 0.60) return 0;
      if (a > CONFIG.ACWR_HAUT || a < CONFIG.ACWR_BAS) return 1;
      return 2;
    };
    lignes.sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom, 'fr'));

    const totalSeances = [...parCoureur.values()].reduce((a, s) => a + s.length, 0);
    const actifs7 = lignes.filter(l => l.s && l.s.seances7 > 0).length;
    const vigilance = lignes.filter(l => rang(l) <= 1).length;

    z.insertAdjacentHTML('beforeend', `
      <div class="stats">
        <div class="stat"><div class="valeur">${parCoureur.size}</div><div class="etiquette">Coureurs suivis</div></div>
        <div class="stat"><div class="valeur">${actifs7}</div><div class="etiquette">Actifs sur 7 j</div></div>
        <div class="stat"><div class="valeur ${vigilance ? 'v-ambre' : 'v-vert'}">${vigilance}</div><div class="etiquette">Hors zone habituelle</div></div>
        <div class="stat"><div class="valeur">${totalSeances}</div><div class="etiquette">Séances saisies</div></div>
      </div>`);

    z.insertAdjacentHTML('beforeend', '<div class="titre-section">Situation de chacun · touche une ligne pour la fiche détaillée</div>');

    const boite = document.createElement('div');
    boite.className = 'carte compacte';
    boite.style.padding = '0';
    boite.innerHTML = `
      <div class="tableau-boite">
        <table>
          <thead><tr>
            <th>Coureur</th><th class="num">ACWR</th><th>Lecture</th>
            <th class="num">Charge 7 j</th><th class="num">Séances 28 j</th><th class="num">Dernière</th>
          </tr></thead>
          <tbody>${lignes.map(l => ligneGroupe(l)).join('')}</tbody>
        </table>
      </div>`;
    z.appendChild(boite);

    $$('tr.ligne-coureur', boite).forEach(tr => tr.addEventListener('click', () => {
      $('#selection-coureur').value = tr.dataset.nom;
      rendu();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));

    z.insertAdjacentHTML('beforeend', `
      <p class="aide" style="margin-top:14px">
        L'ACWR affiché est la version exponentielle (EWMA). Il n'a de sens que si les coureurs
        déclarent <em>toutes</em> leurs séances, y compris celles faites seuls : une charge chronique
        sous-estimée gonfle mécaniquement le rapport. La colonne « Séances 28 j » est là pour juger
        de cette fiabilité avant de lire l'ACWR.
      </p>`);
  }

  function ligneGroupe(l) {
    const s = l.s;
    if (!s) return '';
    const insuffisant = !s.historiqueSuffisant || s.acwrEwma === null;
    const st = insuffisant ? { classe: 'gris', texte: 'Historique trop court' } : Charge.statutAcwr(s.acwrEwma);
    const jours = s.derniereSeance ? Charge.ecartJours(s.derniereSeance, Charge.versDate(new Date())) : null;
    return `<tr class="ligne-coureur" data-nom="${l.nom}">
      <td><b>${l.nom}</b>${l.groupe ? ` <span class="pastille p-gris">${l.groupe}</span>` : ''}</td>
      <td class="num"><b class="v-${st.classe}">${insuffisant ? '—' : s.acwrEwma.toFixed(2)}</b></td>
      <td><span class="pastille p-${st.classe}">${st.texte}</span></td>
      <td class="num">${Math.round(s.chargeAigue).toLocaleString('fr-FR')}</td>
      <td class="num">${s.seances28}</td>
      <td class="num">${jours === null ? '—' : jours === 0 ? "aujourd'hui" : 'il y a ' + jours + ' j'}</td>
    </tr>`;
  }

  /* ----- Fiche individuelle ---------------------------------------------- */

  function rendCoureur(z, nom) {
    const ses = (donneesCoach || []).filter(l => l.coureur === nom)
      .sort((a, b) => a.dateObj - b.dateObj);
    if (!ses.length) { z.innerHTML = '<p class="vide">Aucune séance pour ce coureur.</p>'; return; }

    const s = Charge.situation(ses);
    const stAcwr = s.historiqueSuffisant ? Charge.statutAcwr(s.acwrEwma) : { classe: 'gris', texte: 'Historique trop court' };
    const stMono = Charge.statutMonotonie(s.monotonie);

    z.insertAdjacentHTML('beforeend', `
      <div class="stats">
        <div class="stat">
          <div class="valeur v-${stAcwr.classe}">${s.acwrEwma !== null && s.historiqueSuffisant ? s.acwrEwma.toFixed(2) : '—'}</div>
          <div class="etiquette">ACWR (EWMA)</div>
          <div class="note">${stAcwr.texte}${s.acwr !== null && s.historiqueSuffisant ? ' · glissant ' + s.acwr.toFixed(2) : ''}</div>
        </div>
        <div class="stat">
          <div class="valeur">${Math.round(s.chargeAigue).toLocaleString('fr-FR')}</div>
          <div class="etiquette">Charge 7 j (UA)</div>
          <div class="note">chronique ${Math.round(s.chargeChronique).toLocaleString('fr-FR')} UA</div>
        </div>
        <div class="stat">
          <div class="valeur v-${stMono.classe}">${s.monotonie !== null ? s.monotonie.toFixed(2) : '—'}</div>
          <div class="etiquette">Monotonie</div>
          <div class="note">${stMono.texte}${s.contrainte !== null ? ' · contrainte ' + Math.round(s.contrainte).toLocaleString('fr-FR') : ''}</div>
        </div>
        <div class="stat">
          <div class="valeur">${s.seances7}<span style="font-size:.9rem;color:#6B6B6B"> / ${s.seances28}</span></div>
          <div class="etiquette">Séances 7 j / 28 j</div>
          <div class="note">${s.km7 ? s.km7.toFixed(1).replace('.', ',') + ' km sur 7 j' : '—'}</div>
        </div>
      </div>`);

    const bloc = (titre, aide) => {
      z.insertAdjacentHTML('beforeend', `<div class="titre-section">${titre}</div>`);
      const c = document.createElement('div');
      c.className = 'carte';
      z.appendChild(c);
      const g = document.createElement('div');
      c.appendChild(g);
      if (aide) c.insertAdjacentHTML('beforeend', `<p class="aide">${aide}</p>`);
      return g;
    };

    Graphiques.chargeHebdo(
      bloc('Charge par semaine', 'Charge = RPE de la séance entière × durée en minutes (méthode sRPE).'),
      Charge.semainesCompletes(ses));

    Graphiques.chargeAigueChronique(
      bloc('Charge aiguë et charge chronique',
        'La charge chronique est ramenée à l\'échelle hebdomadaire (28 j ÷ 4) pour être comparable à la charge aiguë.'),
      s.serie);

    Graphiques.acwr(
      bloc('Rapport charge aiguë / charge chronique',
        'La bande verte est un repère de conversation, pas un seuil de décision : la valeur prédictive de l\'ACWR pris isolément est discutée dans la littérature. À croiser avec le ressenti, la monotonie et les commentaires.'),
      s.serie);

    Graphiques.rpe(
      bloc('RPE séance et RPE partie travail',
        'Un écart qui se resserre séance après séance signale souvent un échauffement ou un retour au calme qui coûtent déjà cher.'),
      ses);

    // Tableau des séances, les plus récentes d'abord
    const ordonnees = ses.slice().reverse();
    const PAQUET = 20;
    let affichees = Math.min(PAQUET, ordonnees.length);

    z.insertAdjacentHTML('beforeend',
      `<div class="titre-section">Séances déclarées (${ordonnees.length})</div>`);
    const boite = document.createElement('div');
    boite.className = 'carte compacte';
    boite.style.padding = '0';
    z.appendChild(boite);

    const rangee = l => `
      <tr>
        <td>${l.dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>
        <td>${echappe(l.type)}</td>
        <td class="num">${l.duree || '—'}</td>
        <td class="num">${l.distance !== null ? String(l.distance).replace('.', ',') : '—'}</td>
        <td class="num">${l.forme !== null ? String(l.forme).replace('.', ',') : '—'}</td>
        <td class="num">${l.rpeTotal !== null ? String(l.rpeTotal).replace('.', ',') : '—'}</td>
        <td class="num">${l.rpeTravail !== null ? String(l.rpeTravail).replace('.', ',') : '—'}</td>
        <td>${echappe(l.allures)}</td>
        <td class="num"><b>${Math.round(l.charge).toLocaleString('fr-FR')}</b></td>
        <td class="comm">${echappe(l.commentaire)}</td>
      </tr>`;

    const dessineTableau = () => {
      const reste = ordonnees.length - affichees;
      boite.innerHTML = `
        <div class="tableau-boite">
          <table>
            <thead><tr>
              <th>Date</th><th>Type</th><th class="num">min</th><th class="num">km</th>
              <th class="num">Forme</th><th class="num">RPE</th><th class="num">RPE trav.</th>
              <th>Allures</th><th class="num">Charge</th><th>Commentaire</th>
            </tr></thead>
            <tbody>${ordonnees.slice(0, affichees).map(rangee).join('')}</tbody>
          </table>
        </div>` +
        (reste > 0
          ? `<div style="padding:11px;text-align:center">
               <button type="button" class="bouton-secondaire" id="plus-seances">
                 Afficher ${Math.min(PAQUET, reste)} séance${reste > 1 ? 's' : ''} de plus (${reste} restante${reste > 1 ? 's' : ''})
               </button>
             </div>`
          : '');
      const b = $('#plus-seances', boite);
      if (b) b.addEventListener('click', () => { affichees += PAQUET; dessineTableau(); });
    };
    dessineTableau();
  }

  function echappe(s) {
    return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  /* ----- Export ----------------------------------------------------------- */

  function exporteCsv() {
    if (!donneesCoach || !donneesCoach.length) return;
    const choix = $('#selection-coureur').value;
    const g = $('#filtre-groupe').value;
    const lignes = donneesCoach.filter(l =>
      (choix === '__groupe__' || l.coureur === choix) && (!g || l.groupe === g));

    const entetes = ['coureur', 'groupe', 'date', 'type', 'duree_min', 'distance_km',
      'forme', 'rpe_total', 'allures_tenues', 'rpe_travail', 'charge_ua', 'commentaire'];
    const cellule = v => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
    const csv = '﻿' + [entetes.join(';')].concat(
      lignes.sort((a, b) => a.dateObj - b.dateObj || a.coureur.localeCompare(b.coureur, 'fr')).map(l =>
        [l.coureur, l.groupe, l.date, l.type, l.duree, l.distance, l.forme, l.rpeTotal,
         l.allures, l.rpeTravail, Math.round(l.charge), l.commentaire].map(cellule).join(';'))
    ).join('\r\n');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `eckbo-suivi-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ======================================================================
     Démarrage
     ====================================================================== */

  document.addEventListener('DOMContentLoaded', () => {
    $('#version').textContent = 'v' + CONFIG.VERSION;
    initOnglets();
    initSaisie();
    initCoach();
  });

})();
