# Eckbo Team — Suivi des entraînements

Site statique hébergé sur GitHub Pages, adossé à un Google Sheet qui sert de
mémoire. Les coureurs déclarent leur séance en une vingtaine de secondes ;
les coachs consultent la charge, l'ACWR et les commentaires derrière un mot
de passe.

```
index.html              page unique, deux onglets (saisie / coach)
assets/membres.js       liste des coureurs — le seul fichier à éditer au quotidien
assets/config.js        URL du backend et réglages — à remplir une fois
assets/charge.js        calcul des charges, ACWR, monotonie
assets/graphiques.js    graphiques SVG, sans dépendance externe
assets/app.js           interface
assets/styles.css       charte Eckbo (vert du maillot, noir, blanc)
apps-script/Code.gs     backend à coller dans Google Apps Script
```

---

## 1. Créer le Google Sheet

1. Sur [sheets.new](https://sheets.new), crée un classeur nommé par exemple
   **Eckbo — Suivi entraînements**.
2. Menu **Extensions → Apps Script**.
3. Supprime le contenu de `Code.gs` et colle l'intégralité de
   `apps-script/Code.gs` de ce dépôt. Enregistre (Ctrl/Cmd + S).
4. Dans la liste des fonctions, choisis `initialisation` puis **▶ Exécuter**.
   Google demande une autorisation : accepte (« Paramètres avancées » →
   « Accéder à … »). L'onglet `Seances` est créé avec ses en-têtes.

### Changer le mot de passe coach

Par défaut il vaut `EckPass`. Pour le modifier :
**⚙ Paramètres du projet → Propriétés du script → Ajouter une propriété**,
clé `MDP_COACH`, valeur au choix. Il n'apparaît jamais dans le dépôt GitHub.

## 2. Déployer le backend

1. Dans l'éditeur Apps Script : **Déployer → Nouveau déploiement**.
2. Type : **Application web**.
3. Exécuter en tant que : **moi**. Qui a accès : **Tout le monde**.
   (Indispensable : les coureurs ne sont pas connectés à un compte Google.
   L'URL seule ne donne accès à rien en lecture — le mot de passe est vérifié
   côté serveur.)
4. **Déployer**, puis copie l'URL qui se termine par `/exec`.

> À chaque modification de `Code.gs`, il faut **Déployer → Gérer les
> déploiements → ✏️ → Version : nouvelle version**. Sans cela, l'ancienne
> version continue de tourner.

## 3. Publier le site sur GitHub

1. Crée un dépôt, par exemple `eckbo-suivi` (public ou privé, GitHub Pages
   fonctionne avec les deux sur un compte gratuit pour les dépôts publics).
2. Dépose tout le contenu de ce dossier à la racine du dépôt.
3. Ouvre `assets/config.js` et remplace `COLLER_ICI` par l'URL `/exec`
   copiée à l'étape 2.
4. **Settings → Pages → Source : Deploy from a branch**, branche `main`,
   dossier `/ (root)`. Enregistre.
5. Une minute plus tard le site est en ligne sur
   `https://<ton-compte>.github.io/eckbo-suivi/`.

## 4. Diffuser aux coureurs

Génère un QR code de l'URL (par exemple sur `qr.io` ou via l'appareil photo
d'un iPhone) et colle-le sur la feuille de présence. Conseille aux coureurs
d'ajouter la page à l'écran d'accueil : sur iPhone **Partager → Sur l'écran
d'accueil**, sur Android **⋮ → Ajouter à l'écran d'accueil**. Le site se
comporte alors comme une application.

---

## Utilisation au quotidien

### Ajouter ou retirer un coureur

Édite `assets/membres.js`, commit. GitHub Pages se met à jour tout seul en
une minute environ. Rien à toucher côté Google.

### Ce qui est mémorisé sur le téléphone du coureur

Le nom et le groupe, pour que la saisie suivante ne demande plus que les
chiffres de la séance. Rien d'autre n'est stocké localement, sauf une séance
envoyée sans réseau : elle est gardée et repart automatiquement à la
prochaine ouverture du site.

### Espace coach

Onglet **Espace coach**, mot de passe, puis :

- **Vue d'ensemble du groupe** — un tableau trié par ordre d'urgence :
  les ACWR sortis de la zone habituelle remontent en tête. Une ligne = un
  coureur, toucher la ligne ouvre sa fiche.
- **Fiche individuelle** — charge hebdomadaire, charges aiguë et chronique,
  ACWR (glissant et exponentiel), RPE séance vs RPE partie travail, et le
  détail de toutes les séances avec les commentaires.
- **CSV** exporte ce qui est affiché (le groupe filtré, ou le coureur
  sélectionné) pour un traitement à part.

---

## Ce que valent les indicateurs

| Indicateur | Définition retenue |
|---|---|
| Charge d'une séance | RPE total (0–10) × durée totale en minutes — méthode sRPE (Foster) |
| Charge aiguë | somme des charges des 7 derniers jours |
| Charge chronique | somme des 28 derniers jours ÷ 4, donc à l'échelle d'une semaine |
| ACWR glissant | charge aiguë ÷ charge chronique |
| ACWR exponentiel | rapport de deux moyennes mobiles exponentielles, λ = 2/(N+1), N = 7 et 28 (Williams 2017) |
| Monotonie | moyenne des charges quotidiennes sur 7 j ÷ leur écart-type, jours de repos comptés comme 0 |
| Contrainte | charge hebdomadaire × monotonie |

Trois réserves, à garder en tête avant d'agir sur un chiffre :

1. **L'ACWR ne vaut que si tout est déclaré.** Une séance solo non saisie
   sous-estime la charge chronique et gonfle mécaniquement le rapport. La
   colonne « Séances 28 j » est là pour jauger cette fiabilité avant de lire
   l'ACWR. En dessous de 21 jours d'historique, aucun ACWR n'est affiché.
2. **La bande 0,8–1,3 est un repère de conversation, pas un seuil de
   décision.** La valeur prédictive de l'ACWR pris isolément est discutée
   dans la littérature ; il se lit avec le ressenti, la monotonie et les
   commentaires, jamais seul.
3. **Le RPE se recueille à distance de la séance** — idéalement une
   trentaine de minutes après, pas dans l'essoufflement de la dernière
   ligne droite, sous peine de mesurer le dernier bloc plutôt que la séance.

## Sur la sécurité du mot de passe

Le mot de passe est vérifié côté Google, jamais dans le code du site : il
n'est donc pas lisible dans le dépôt. La comparaison est faite à temps
constant. Cela dit, un mot de passe unique partagé entre coachs protège d'un
curieux, pas d'un attaquant déterminé, et les données restent des données
personnelles : ne diffuse l'URL du site qu'aux membres, et le mot de passe
qu'à toi, Greg et Max.

## Dépannage

| Symptôme | Cause la plus probable |
|---|---|
| « Le site n'est pas encore relié au Google Sheet » | `URL_API` est resté à `COLLER_ICI` dans `assets/config.js` |
| « Le serveur a répondu 401/403 » | le déploiement Apps Script n'est pas en accès « Tout le monde » |
| Une modification de `Code.gs` reste sans effet | il faut créer une **nouvelle version** du déploiement |
| Une séance n'apparaît pas | elle est peut-être en file d'attente sur le téléphone du coureur : qu'il rouvre le site avec du réseau |
| Les graphiques restent vides | moins de 21 jours d'historique pour ce coureur, ou aucune séance déclarée |
