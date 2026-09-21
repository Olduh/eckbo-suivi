/* ==========================================================================
   GRAPHIQUES — SVG écrit à la main, sans aucune dépendance externe.
   --------------------------------------------------------------------------
   Choix graphiques :
   • Deux séries maximum par graphique, jamais deux axes verticaux.
   • Vert Eckbo foncé (#3B8A1C) et bleu (#1F5C99) : écart de teinte validé
     pour les deutéranopes/protanopes et contraste >= 3:1 sur fond blanc.
     Le vert vif du maillot (#5CC22E) reste à l'interface (boutons, accents) :
     en trait fin sur blanc il tombe à 2,2:1, donc illisible.
   • Traits 2 px, points >= 8 px cerclés de blanc, grille en filet 1 px,
     libellés en encre neutre — jamais de la couleur de la série.
   • Le SVG est redessiné à la largeur réelle du conteneur : le texte reste
     à sa taille en pixels, donc lisible sur un téléphone.
   ========================================================================== */

const Graphiques = (() => {

  const C = {
    s1: '#3B8A1C',   // série 1 — vert Eckbo
    s2: '#1F5C99',   // série 2 — bleu
    bande: '#EAF8E3',
    grille: '#E8E8E8',
    axe: '#C9C9C9',
    encre: '#121212',
    encreDouce: '#6B6B6B',
    surface: '#FFFFFF',
    alerte: '#D64545'
  };

  const NS = 'http://www.w3.org/2000/svg';

  /* ----- Petits utilitaires --------------------------------------------- */

  function e(nom, attrs) {
    const n = document.createElementNS(NS, nom);
    for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    return n;
  }

  function texte(x, y, contenu, attrs) {
    const t = e('text', Object.assign({
      x, y, fill: C.encreDouce, 'font-size': 11,
      'font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }, attrs || {}));
    t.textContent = contenu;
    return t;
  }

  function pasJoli(brut) {
    if (!(brut > 0)) return 1;
    const exp = Math.floor(Math.log10(brut));
    const f = brut / Math.pow(10, exp);
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * Math.pow(10, exp);
  }

  function graduations(min, max, cible) {
    if (max <= min) max = min + 1;
    const pas = pasJoli((max - min) / (cible || 4));
    const out = [];
    for (let v = Math.ceil(min / pas) * pas; v <= max + pas * 1e-9; v += pas) {
      out.push(Math.round(v * 1e6) / 1e6);
    }
    return out;
  }

  const fmt = (v, d) => (v === null || v === undefined || !isFinite(v))
    ? '—'
    : v.toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });

  /* ----- Infobulle partagée --------------------------------------------- */

  function infobulle(conteneur) {
    let b = conteneur.querySelector('.infobulle');
    if (!b) {
      b = document.createElement('div');
      b.className = 'infobulle';
      b.style.cssText = 'position:absolute;pointer-events:none;background:#121212;color:#fff;' +
        'font-size:12px;line-height:1.35;padding:7px 9px;border-radius:8px;opacity:0;' +
        'transition:opacity .12s;white-space:nowrap;z-index:5;box-shadow:0 3px 12px rgba(0,0,0,.28)';
      conteneur.appendChild(b);
    }
    return b;
  }

  function placeInfobulle(bulle, conteneur, x, y, html) {
    bulle.innerHTML = html;
    bulle.style.opacity = '1';
    const l = conteneur.clientWidth;
    const w = bulle.offsetWidth;
    let gx = x - w / 2;
    gx = Math.max(2, Math.min(gx, l - w - 2));
    bulle.style.left = gx + 'px';
    bulle.style.top = Math.max(0, y - bulle.offsetHeight - 10) + 'px';
  }

  function cacheInfobulle(conteneur) {
    const b = conteneur.querySelector('.infobulle');
    if (b) b.style.opacity = '0';
  }

  /* ----- Ossature commune ----------------------------------------------- */

  /**
   * Crée le SVG à la largeur réelle du conteneur et rebranche le tracé sur
   * les changements de taille (rotation du téléphone, ouverture du volet…).
   */
  function socle(conteneur, hauteur, dessine) {
    conteneur.style.position = 'relative';
    const rendre = () => {
      const largeur = Math.max(260, conteneur.clientWidth || 320);
      conteneur.querySelectorAll('svg').forEach(s => s.remove());
      const svg = e('svg', {
        class: 'graphique', width: '100%', height: hauteur,
        viewBox: `0 0 ${largeur} ${hauteur}`, preserveAspectRatio: 'none',
        role: 'img'
      });
      conteneur.insertBefore(svg, conteneur.firstChild);
      dessine(svg, largeur, hauteur);
    };
    rendre();
    if (conteneur._obs) conteneur._obs.disconnect();
    if (window.ResizeObserver) {
      let t = null;
      conteneur._obs = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(rendre, 120); });
      conteneur._obs.observe(conteneur);
    }
  }

  function grilleY(svg, ech, valeurs, x0, x1, suffixe) {
    valeurs.forEach(v => {
      const y = ech(v);
      svg.appendChild(e('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: C.grille, 'stroke-width': 1 }));
      svg.appendChild(texte(x0 - 6, y + 3.5, fmt(v, v % 1 ? 1 : 0) + (suffixe || ''),
        { 'text-anchor': 'end', 'font-size': 10 }));
    });
  }

  /* ======================================================================
     1 — CHARGE HEBDOMADAIRE (barres, une seule série)
     ====================================================================== */

  function chargeHebdo(conteneur, semaines, options) {
    const opt = options || {};
    const donnees = semaines.slice(-Math.min(semaines.length, opt.max || 16));
    if (!donnees.length) { conteneur.innerHTML = '<p class="vide">Pas encore de séance.</p>'; return; }

    socle(conteneur, 190, (svg, L, H) => {
      const mg = { h: 12, d: 10, b: 30, g: 44 };
      const x0 = mg.g, x1 = L - mg.d, y0 = mg.h, y1 = H - mg.b;
      const maxi = Math.max(10, ...donnees.map(d => d.charge));
      const grads = graduations(0, maxi, 3);
      const haut = Math.max(maxi, grads[grads.length - 1]);
      const Y = v => y1 - (v / haut) * (y1 - y0);

      grilleY(svg, Y, grads, x0, x1);
      svg.appendChild(e('line', { x1: x0, y1: y1, x2: x1, y2: y1, stroke: C.axe, 'stroke-width': 1 }));

      const bande = (x1 - x0) / donnees.length;
      const largeur = Math.max(4, Math.min(24, bande - 2));   // écart de surface de 2 px
      const bulle = infobulle(conteneur);

      // La semaine en cours est incomplète : pleine, sa barre se lirait comme
      // une chute de charge. Elle est donc dessinée en clair.
      const semaineEnCours = Charge.cle(Charge.lundi(Charge.versDate(new Date())));
      let partielle = false;

      donnees.forEach((d, i) => {
        const enCours = Charge.cle(d.debut) === semaineEnCours;
        if (enCours) partielle = true;
        const cx = x0 + bande * i + bande / 2;
        const h = Math.max(d.charge > 0 ? 2 : 0, (d.charge / haut) * (y1 - y0));
        const y = y1 - h;
        if (h > 0) {
          const r = Math.min(4, largeur / 2, h);
          // sommet arrondi (4 px), pied carré sur la ligne de base
          const chemin = `M${cx - largeur / 2},${y1} L${cx - largeur / 2},${y + r}` +
            ` Q${cx - largeur / 2},${y} ${cx - largeur / 2 + r},${y}` +
            ` L${cx + largeur / 2 - r},${y} Q${cx + largeur / 2},${y} ${cx + largeur / 2},${y + r}` +
            ` L${cx + largeur / 2},${y1} Z`;
          svg.appendChild(e('path', { d: chemin, fill: C.s1, opacity: enCours ? .38 : 1 }));
        }
        const zone = e('rect', {
          x: cx - bande / 2, y: y0, width: bande, height: y1 - y0,
          fill: 'transparent', style: 'cursor:pointer'
        });
        const survol = () => placeInfobulle(bulle, conteneur, cx, y,
          `<b>Semaine du ${d.debut.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</b><br>` +
          `${fmt(d.charge)} UA · ${d.seances} séance${d.seances > 1 ? 's' : ''}<br>` +
          `${fmt(d.km, 1)} km · ${fmt(d.minutes)} min`);
        zone.addEventListener('pointerenter', survol);
        zone.addEventListener('pointerdown', survol);
        zone.addEventListener('pointerleave', () => cacheInfobulle(conteneur));
        svg.appendChild(zone);

        const pasEtiquette = Math.ceil(donnees.length / 7);
        if (i % pasEtiquette === 0 || i === donnees.length - 1) {
          svg.appendChild(texte(cx, y1 + 15,
            d.debut.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
            { 'text-anchor': 'middle', 'font-size': 10 }));
        }
      });

      // Étiquette directe sur la dernière semaine complète : c'est la seule
      // valeur comparable aux précédentes.
      const iRef = partielle ? donnees.length - 2 : donnees.length - 1;
      const ref = donnees[iRef];
      if (ref && ref.charge > 0) {
        const cx = x0 + bande * iRef + bande / 2;
        const y = y1 - (ref.charge / haut) * (y1 - y0);
        svg.appendChild(texte(Math.max(x0 + 14, Math.min(cx, x1 - 16)), y - 7, fmt(ref.charge),
          { 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: C.encre,
            stroke: C.surface, 'stroke-width': 3.5, 'paint-order': 'stroke' }));
      }

      if (partielle) {
        conteneur.dataset.partielle = '1';
      } else {
        delete conteneur.dataset.partielle;
      }
    });

    if (conteneur.dataset.partielle) {
      conteneur.insertAdjacentHTML('beforeend',
        '<p class="aide" style="margin-top:6px">La barre claire est la semaine en cours, encore incomplète : elle n\'est pas comparable aux précédentes.</p>');
    }
  }

  /* ======================================================================
     2 — CHARGE AIGUË vs CHRONIQUE (deux lignes, même unité, un seul axe)
     ====================================================================== */

  function chargeAigueChronique(conteneur, serie, options) {
    const opt = options || {};
    const d = serie.slice(-Math.min(serie.length, opt.jours || 120));
    if (d.length < 2) { conteneur.innerHTML = '<p class="vide">Historique trop court pour ce graphique.</p>'; return; }

    socle(conteneur, 200, (svg, L, H) => {
      const mg = { h: 14, d: 12, b: 28, g: 46 };
      const x0 = mg.g, x1 = L - mg.d, y0 = mg.h, y1 = H - mg.b;
      const maxi = Math.max(10, ...d.map(p => Math.max(p.aigue, p.chronique)));
      const grads = graduations(0, maxi, 3);
      const haut = Math.max(maxi, grads[grads.length - 1]);
      const X = i => x0 + (i / (d.length - 1)) * (x1 - x0);
      const Y = v => y1 - (v / haut) * (y1 - y0);

      grilleY(svg, Y, grads, x0, x1);
      svg.appendChild(e('line', { x1: x0, y1: y1, x2: x1, y2: y1, stroke: C.axe, 'stroke-width': 1 }));

      const chemin = (cle) => d.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p[cle]).toFixed(1)).join(' ');

      // Lavis sous la charge aiguë (10 % d'opacité)
      svg.appendChild(e('path', {
        d: chemin('aigue') + ` L${X(d.length - 1).toFixed(1)},${y1} L${X(0).toFixed(1)},${y1} Z`,
        fill: C.s1, opacity: .10
      }));
      svg.appendChild(e('path', { d: chemin('chronique'), fill: 'none', stroke: C.s2, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      svg.appendChild(e('path', { d: chemin('aigue'), fill: 'none', stroke: C.s1, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

      // Points terminaux, cerclés de blanc
      [['aigue', C.s1], ['chronique', C.s2]].forEach(([k, col]) => {
        svg.appendChild(e('circle', {
          cx: X(d.length - 1), cy: Y(d[d.length - 1][k]), r: 4.5,
          fill: col, stroke: C.surface, 'stroke-width': 2
        }));
      });

      etiquettesDates(svg, d, X, y1);
      curseur(svg, conteneur, d, X, x0, x1, y0, y1, (p) =>
        `<b>${p.date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}</b><br>` +
        `Aiguë 7 j : ${fmt(p.aigue)} UA<br>Chronique 28 j : ${fmt(p.chronique)} UA` +
        (p.charge ? `<br>Séance du jour : ${fmt(p.charge)} UA` : ''));
    });

    legende(conteneur, [
      { couleur: C.s1, texte: 'Charge aiguë (7 j)' },
      { couleur: C.s2, texte: 'Charge chronique (28 j, ramenée à la semaine)' }
    ]);
  }

  /* ======================================================================
     3 — ACWR (bande de référence + deux modes de calcul)
     ====================================================================== */

  function acwr(conteneur, serie, options) {
    const opt = options || {};
    const brut = serie.slice(-Math.min(serie.length, opt.jours || 120));
    const d = brut.filter(p => p.joursHistorique >= CONFIG.JOURS_MINI_ACWR && p.acwr !== null);
    if (d.length < 2) {
      conteneur.innerHTML = '<p class="vide">Il faut au moins ' + CONFIG.JOURS_MINI_ACWR +
        ' jours de données déclarées avant qu\'un ACWR veuille dire quelque chose.</p>';
      return;
    }

    socle(conteneur, 195, (svg, L, H) => {
      const mg = { h: 14, d: 12, b: 28, g: 40 };
      const x0 = mg.g, x1 = L - mg.d, y0 = mg.h, y1 = H - mg.b;
      const maxi = Math.max(1.6, ...d.map(p => Math.max(p.acwr || 0, p.acwrEwma || 0))) * 1.08;
      const X = i => x0 + (i / (d.length - 1)) * (x1 - x0);
      const Y = v => y1 - (Math.min(v, maxi) / maxi) * (y1 - y0);

      // Bande de référence 0,8 – 1,3
      svg.appendChild(e('rect', {
        x: x0, y: Y(CONFIG.ACWR_HAUT), width: x1 - x0,
        height: Math.max(0, Y(CONFIG.ACWR_BAS) - Y(CONFIG.ACWR_HAUT)),
        fill: C.bande
      }));
      // Étiquette à gauche : à droite elle entrerait en collision avec la
      // valeur du jour, toujours placée en bout de ligne.
      svg.appendChild(texte(x0 + 4, Y(CONFIG.ACWR_HAUT) + 12, 'zone habituelle',
        { 'text-anchor': 'start', 'font-size': 9.5, fill: '#5E8A4A' }));

      grilleY(svg, Y, graduations(0, maxi, 4), x0, x1);
      svg.appendChild(e('line', { x1: x0, y1: Y(1), x2: x1, y2: Y(1), stroke: C.axe, 'stroke-width': 1 }));
      svg.appendChild(e('line', { x1: x0, y1: y1, x2: x1, y2: y1, stroke: C.axe, 'stroke-width': 1 }));

      const chemin = (cle) => d.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(p[cle]).toFixed(1)).join(' ');
      svg.appendChild(e('path', { d: chemin('acwr'), fill: 'none', stroke: C.s2, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      svg.appendChild(e('path', { d: chemin('acwrEwma'), fill: 'none', stroke: C.s1, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

      const fin = d[d.length - 1];
      [['acwr', C.s2], ['acwrEwma', C.s1]].forEach(([k, col]) => {
        svg.appendChild(e('circle', {
          cx: X(d.length - 1), cy: Y(fin[k]), r: 4.5,
          fill: col, stroke: C.surface, 'stroke-width': 2
        }));
      });
      svg.appendChild(texte(X(d.length - 1) - 8, Y(fin.acwrEwma) - 9, fin.acwrEwma.toFixed(2),
        { 'text-anchor': 'end', 'font-size': 11, 'font-weight': 700, fill: C.encre,
          stroke: C.surface, 'stroke-width': 3.5, 'paint-order': 'stroke' }));

      etiquettesDates(svg, d, X, y1);
      curseur(svg, conteneur, d, X, x0, x1, y0, y1, (p) =>
        `<b>${p.date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}</b><br>` +
        `ACWR glissant : ${p.acwr ? p.acwr.toFixed(2) : '—'}<br>` +
        `ACWR exponentiel : ${p.acwrEwma ? p.acwrEwma.toFixed(2) : '—'}`);
    });

    legende(conteneur, [
      { couleur: C.s1, texte: 'ACWR exponentiel (EWMA)' },
      { couleur: C.s2, texte: 'ACWR glissant 7/28' }
    ]);
  }

  /* ======================================================================
     4 — RPE TOTAL vs RPE TRAVAIL (nuage de points daté)
     ====================================================================== */

  function rpe(conteneur, seances, options) {
    const opt = options || {};
    const d = seances
      .filter(s => s.dateObj)
      .sort((a, b) => a.dateObj - b.dateObj)
      .slice(-Math.min(seances.length, opt.max || 40));
    if (!d.length) { conteneur.innerHTML = '<p class="vide">Pas encore de séance.</p>'; return; }

    socle(conteneur, 185, (svg, L, H) => {
      const mg = { h: 14, d: 14, b: 28, g: 32 };
      const x0 = mg.g, x1 = L - mg.d, y0 = mg.h, y1 = H - mg.b;
      const X = i => d.length === 1 ? (x0 + x1) / 2 : x0 + (i / (d.length - 1)) * (x1 - x0);
      const Y = v => y1 - (v / 10) * (y1 - y0);

      grilleY(svg, Y, [0, 2, 4, 6, 8, 10], x0, x1);
      svg.appendChild(e('line', { x1: x0, y1: y1, x2: x1, y2: y1, stroke: C.axe, 'stroke-width': 1 }));

      const ligne = (cle, col) => {
        const pts = d.map((p, i) => ({ i, v: p[cle] })).filter(p => p.v !== null && p.v !== undefined && isFinite(p.v));
        if (pts.length > 1) {
          svg.appendChild(e('path', {
            d: pts.map((p, k) => (k ? 'L' : 'M') + X(p.i).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' '),
            fill: 'none', stroke: col, 'stroke-width': 2, opacity: .45,
            'stroke-linejoin': 'round', 'stroke-linecap': 'round'
          }));
        }
        pts.forEach(p => svg.appendChild(e('circle', {
          cx: X(p.i), cy: Y(p.v), r: 4, fill: col, stroke: C.surface, 'stroke-width': 2
        })));
      };
      ligne('rpeTravail', C.s2);
      ligne('rpeTotal', C.s1);

      etiquettesDates(svg, d.map(s => ({ date: s.dateObj })), X, y1);

      const bulle = infobulle(conteneur);
      d.forEach((p, i) => {
        const zone = e('rect', {
          x: X(i) - (x1 - x0) / (2 * Math.max(1, d.length - 1)) || x0, y: y0,
          width: Math.max(14, (x1 - x0) / Math.max(1, d.length - 1)), height: y1 - y0,
          fill: 'transparent', style: 'cursor:pointer'
        });
        const montre = () => placeInfobulle(bulle, conteneur, X(i), Y(Math.max(p.rpeTotal || 0, p.rpeTravail || 0)),
          `<b>${p.dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} · ${p.type || ''}</b><br>` +
          `RPE séance : ${fmt(p.rpeTotal, 1)}<br>RPE travail : ${fmt(p.rpeTravail, 1)}<br>` +
          `${fmt(p.duree)} min · ${fmt(p.distance, 1)} km`);
        zone.addEventListener('pointerenter', montre);
        zone.addEventListener('pointerdown', montre);
        zone.addEventListener('pointerleave', () => cacheInfobulle(conteneur));
        svg.appendChild(zone);
      });
    });

    legende(conteneur, [
      { couleur: C.s1, texte: 'RPE séance entière', point: true },
      { couleur: C.s2, texte: 'RPE partie travail', point: true }
    ]);
  }

  /* ----- Éléments partagés ---------------------------------------------- */

  function etiquettesDates(svg, d, X, y1) {
    const pas = Math.max(1, Math.ceil(d.length / 5));
    d.forEach((p, i) => {
      if (i % pas === 0 || i === d.length - 1) {
        svg.appendChild(texte(X(i), y1 + 15,
          p.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
          { 'text-anchor': i === d.length - 1 ? 'end' : 'middle', 'font-size': 10 }));
      }
    });
  }

  function curseur(svg, conteneur, d, X, x0, x1, y0, y1, contenu) {
    const bulle = infobulle(conteneur);
    const trait = e('line', { x1: x0, y1: y0, x2: x0, y2: y1, stroke: C.encre, 'stroke-width': 1, opacity: 0 });
    svg.appendChild(trait);
    const zone = e('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: 'transparent', style: 'cursor:crosshair' });

    const bouge = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * (svg.viewBox.baseVal.width || r.width);
      const i = Math.max(0, Math.min(d.length - 1, Math.round(((px - x0) / (x1 - x0)) * (d.length - 1))));
      trait.setAttribute('x1', X(i)); trait.setAttribute('x2', X(i));
      trait.setAttribute('opacity', .18);
      placeInfobulle(bulle, conteneur, X(i), y0 + 4, contenu(d[i]));
    };
    zone.addEventListener('pointermove', bouge);
    zone.addEventListener('pointerdown', bouge);
    zone.addEventListener('pointerleave', () => { trait.setAttribute('opacity', 0); cacheInfobulle(conteneur); });
    svg.appendChild(zone);
  }

  function legende(conteneur, entrees) {
    conteneur.querySelectorAll('.legende').forEach(n => n.remove());
    const d = document.createElement('div');
    d.className = 'legende';
    d.innerHTML = entrees.map(x =>
      `<span><i class="${x.point ? 'pt' : ''}" style="background:${x.couleur}"></i>${x.texte}</span>`).join('');
    conteneur.appendChild(d);
  }

  return { chargeHebdo, chargeAigueChronique, acwr, rpe, COULEURS: C };
})();
