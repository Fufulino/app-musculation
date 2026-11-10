# Carnet de charge 🏋️

Un carnet d'entraînement pour suivre ses progrès à la musculation : on note ses
séances (exercices, poids, répétitions, dégressifs) et l'app calcule les
statistiques de progression. Le site fonctionne dans le navigateur (téléphone ou
ordinateur) et les données sont enregistrées en ligne : on retrouve ses séances
sur tous ses appareils.

## Comment ça marche

### 1. Entrer dans l'app
- À la première ouverture, on tape le **code d'accès**.
- On touche ensuite son **prénom** dans la liste « Qui s'entraîne ? ».
  Pour s'ajouter, on tape son prénom en bas de la liste puis **Ajouter et entrer**.
- Pas de mot de passe : l'appareil retient le code et le prénom.
  Le bouton **👤 Prénom · changer** (en haut de l'accueil) permet de changer d'utilisateur.
- Chaque prénom a ses propres données, que les autres ne voient pas dans l'app.

### 2. Les groupes de séances
Un groupe rassemble les séances du même type : *Dos*, *Jambes*, *Pecs*…
- **+ Ajouter un groupe** : nom + emoji (au choix dans la grille, ou n'importe quel emoji tapé à la main).
- L'accueil affiche pour chaque groupe la date et le volume de la dernière séance.
- On peut modifier un groupe, ou le supprimer (ses séances sont supprimées avec).

### 3. Les séances
Dans un groupe, **+ Nouvelle séance** propose :
- de **reprendre une séance précédente** (exercices et charges pré-remplis, pratique pour
  refaire la même séance et battre ses chiffres) ;
- ou de **partir d'une séance vide**.

On peut modifier la **date** de la séance, et noter son **ressenti** (Facile / Moyen / Dur).

### 4. Les exercices et les séries
**+ Ajouter un exercice** : on choisit un exercice déjà utilisé (son historique s'affiche)
ou on en crée un nouveau, avec son **matériel** :

| Matériel | Poids saisi |
|---|---|
| Barre, Haltères, Machine | le poids soulevé |
| Poulie | le poids de la poulie **+ un lest** |
| Poids du corps | pré-rempli avec ta dernière pesée **+ un lest** |

Le **lest** peut être positif (charge ajoutée) ou **négatif** (aide, ex. tractions assistées).
Le poids effectif = poids de base + lest.

Chaque exercice est un petit tableau façon Excel : une ligne par série avec
**n° de série, poids, répétitions**.
- **+ Ajouter une série** / supprimer une série.
- **Dégressif** : bouton pour ajouter autant de dégressifs que voulu à une série
  (on baisse le poids et on continue). On peut aussi les retirer.
- Les poids acceptent les virgules, les répétitions sont des nombres entiers.
- Chaque exercice a sa propre **difficulté** (Facile / Moyen / Dur).

### 5. Les statistiques
L'onglet **Stats** montre, pour chaque exercice :
- le **1RM estimé** (formule d'Epley : poids × (1 + reps / 30)), c'est-à-dire la charge
  maximale théorique sur 1 répétition ;
- le **volume par séance** (poids × répétitions, dégressifs inclus) ;
- le **poids maximum** soulevé ;
- la **comparaison des séries** :
  - *Même séance* : série par série au sein d'une séance (une baisse nette entre la 1re et
    la dernière série indique la fatigue accumulée) ;
  - *Entre séances* : la n-ième série de chaque séance, pour voir si on progresse.

On peut ouvrir les stats d'un groupe entier ou d'un seul exercice depuis une séance.

---

## Mise en place (une seule fois)

### A. Supabase
Supabase est la base de données en ligne qui stocke les séances.
1. Crée un projet sur supabase.com (plan Free).
2. **SQL Editor → New query**, colle le fichier `supabase-complet.sql` (fourni à part,
   pas dans ce dossier), clique **Run** (« Success »). Il crée les tables et ouvre l'accès
   sans compte. Le relancer ne casse rien.
3. Mets l'**URL du projet** et la **clé publique** (`sb_publishable_…`) dans `js/config.js`.
   Ne mets jamais la clé *secret* ou *service_role*.

### B. GitHub Pages
1. github.com/new → nom (ex. `carnet-de-charge`) → **Public** → **Create repository**.
2. **uploading an existing file** → glisse `index.html`, `css` et `js` (le contenu du
   dossier, pas le dossier lui-même) → **Commit changes**.
3. **Settings → Pages** → *Deploy from a branch* → `main` / `(root)` → **Save**.
4. Après 1 à 2 minutes, l'adresse apparaît en haut de la page Pages
   (`https://ton-compte.github.io/carnet-de-charge/`).

Pour mettre à jour : **Add file → Upload files**, dépose les fichiers modifiés et valide.

## À savoir (sécurité)
Sans mot de passe, n'importe qui qui connaît l'adresse du site et le code d'accès peut
ouvrir les données de n'importe quel prénom. Le code est écrit dans `js/app.js` et la clé
publique dans `js/config.js` : quelqu'un de motivé peut donc aussi lire ou modifier les
données directement. C'est acceptable pour un carnet d'entraînement entre amis, pas pour
des données sensibles. Le code d'accès se change dans `js/app.js` (cherche `cytech`).

## Structure
```
index.html        page unique
css/style.css     thème sombre
js/config.js      identifiants Supabase
js/supabase.js    lecture/écriture des données (utilisateurs, groupes, séances…)
js/stats.js       calculs : 1RM (Epley), historiques, comparaisons
js/app.js         écrans et logique
```