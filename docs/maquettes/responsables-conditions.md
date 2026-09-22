# Les conditions d'utilisation, et leur acceptation

**Liens** : `/conditions`, ouverte à tous, et `/conditions/accepter`, où l'espace des responsables
renvoie toute personne qui n'a pas encore accepté la version en cours.

Deux écrans, un seul texte : `docs/CONDITIONS.md`, lu à la construction et mis en mots par le même
module que le PDF remis au juriste (`apps/web/src/lib/conditions/rendu.js`). Ce que le juriste a lu
est, au caractère près, ce que les organisations acceptent.

## Ce qui est commun aux deux écrans

- **La coquille de l'espace des responsables** : l'en-tête `jadwal`, et le pied décrit plus bas.
  Pas la coquille d'une page publique : ce texte est celui du service, pas celui d'une organisation.
- **Aucun JavaScript** (`csr = false`). Le formulaire d'acceptation est un vrai formulaire.
- **`noindex`**, comme tout ce qui n'est pas `/m/**`.
- **Aucune ressource d'un autre domaine.** Les polices sont celles du système.
- **Le texte, dans un composant partagé** (`apps/web/src/lib/conditions/Texte.svelte`), qui reprend
  la typographie du PDF, adaptée à l'écran :
  - le corps en `"Source Serif 4", Georgia, serif`, les titres et les en-têtes de tableau en
    `"Segoe UI", system-ui, sans-serif` ;
  - aligné à gauche, jamais justifié ;
  - l'apostrophe courbe, l'espace fine insécable devant `;`, `!` et `?`, l'espace insécable devant
    `:` et à l'intérieur des guillemets ;
  - les tableaux bordés, en-têtes sur fond gris clair ;
  - **sur un téléphone, un tableau défile de côté dans son cadre**, au lieu d'élargir la page. Le
    cadre prend le focus au clavier, et il porte un nom : `Tableau : <titre de la section>`.

## Le pied commun

Sous le contenu de chaque page de la coquille, connexion comprise :

```
Conditions d'utilisation
```

Un lien vers `/conditions`. Rien d'autre.

## `/conditions`

**Titre de la page** : `Conditions d'utilisation | jadwal`.

Le document, en entier, tel qu'il est écrit :

1. Titre de niveau 1 : `Conditions d'utilisation`.
2. `Ce texte s'adresse aux organisations qui publient leur programme avec ce service. […]`
3. `Dernière mise à jour : 22 septembre 2026.`
4. Les sections du document, en titres de niveau 2 et 3, dans son ordre.

Aucune session n'est demandée. Une personne connectée garde son en-tête habituel.

## `/conditions/accepter`

**Titre de la page** : `Conditions d'utilisation | jadwal`.

**Qui y arrive** : toute personne membre d'une organisation, responsable ou éditeur, qui entre dans
son espace sans avoir accepté la version en cours. Chaque page de l'espace, et chaque action, la
renvoie ici tant qu'elle n'a pas accepté. Le super-admin n'y passe jamais : c'est l'exploitant, et
c'est lui qui propose ce texte.

**Qui en est renvoyé** :

- sans session : vers `/connexion` ;
- sans organisation en contexte : vers `/organisations` ;
- une personne qui a déjà accepté cette version : vers `/`.

### Structure, de haut en bas

1. Titre de niveau 1 : `Conditions d'utilisation`.
2. Pourquoi l'écran s'affiche :
   `Avant d'entrer dans l'espace de <organisation>, lisez les conditions d'utilisation et
acceptez-les. Elles disent ce que le service conserve, combien de temps, et ce que l'exploitant peut
voir.`
3. La version : `Version du 22 septembre 2026`.
4. Pour une personne membre de plusieurs organisations, et pour elle seule : le lien
   `Choisir une autre organisation`, vers `/organisations`. Il vient avant le texte : qui voulait
   entrer dans une autre organisation n'a pas à parcourir tout le document pour le trouver.
5. Le document en entier, sans son titre, que le titre de la page reprend déjà : il commence à
   `Ce texte s'adresse aux organisations […]`.
6. Le bouton, seul dans son formulaire : `J'accepte les conditions d'utilisation`.
7. Sous le bouton :
   `Tant que vous ne les avez pas acceptées, l'espace de <organisation> reste fermé.`

### L'en-tête, pendant ce temps

La navigation de l'espace (`À venir`, `Cours`, `Partager`…) **n'est pas affichée** : chacun de ses
liens ramènerait ici. Restent la marque `jadwal`, l'adresse de la personne et le bouton
`Se déconnecter`. Pour qui a plusieurs organisations, le lien `Choisir une autre organisation` est
donc le seul chemin vers une autre. `/organisations` ne passe pas par la porte de l'espace ; le choix
fait, c'est la porte de l'autre organisation qui s'applique.

### Ce que fait le bouton

Il enregistre une ligne : l'organisation, la personne, la version (`2026-09-22`). Le moment est posé
par la base de données, pas par l'application. Puis il renvoie vers `/`, l'accueil de l'espace.

Un second envoi du même formulaire n'ajoute rien et ne lève rien.

Quand le texte change de version, c'est-à-dire quand sa date de mise à jour change, chacun repasse
par cet écran à sa prochaine entrée.

## Les titres manquants, relevés par axe

- `/connexion` : `Se connecter | jadwal`, et sous le formulaire le lien
  `Lire les conditions d'utilisation`.
- `/organisations` : `Vos organisations | jadwal`.
