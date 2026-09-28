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

## Les langues (étape 18)

Les deux écrans suivent la langue de l'espace (ADR 0047) : le titre, les phrases de l'écran, le
bouton et le lien se lisent dans les cinq langues. **Le texte des conditions, lui, reste en
français** : c'est un texte juridique, relu en français, que chacun accepte tel quel. Dans les
quatre autres langues, une phrase en tête le dit, par exemple
`For now, this text only exists in French.` ; le texte porte `lang="fr" dir="ltr"`, et se lit de
gauche à droite même dans l'espace en arabe.

Le lien des conditions au pied d'une page publique passe la langue de cette page, `?lang=de` par
exemple : `/conditions` s'ouvre alors dans cette langue, sans rien retenir.

La date s'écrit `JJ.MM.AAAA` sur les deux écrans, dans l'en-tête du texte comme dans la version.

## `/conditions`

**Titre de la page** : `Conditions d'utilisation | jadwal`.

Le document, en entier, tel qu'il est écrit :

1. Titre de niveau 1 : `Conditions d'utilisation`.
2. `Ce texte s'adresse aux organisations qui publient leur programme avec ce service. […]`
3. `Dernière mise à jour : <date>.`, la date écrite en tête du document, par exemple
   `26.09.2026`.
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
   - Après un envoi de `Ne pas accepter et quitter l'organisation` (étape 20), et là seulement : la
     demande de confirmation ou le refus, décrits plus bas.
2. Pourquoi l'écran s'affiche :
   `Avant d'entrer dans l'espace de <organisation>, lisez les conditions d'utilisation et
acceptez-les. Elles disent ce que le service conserve, combien de temps, et ce que l'exploitant peut
voir.` Devant un nom qui commence par une voyelle, « de » s'élide : `l'espace d'Organisation
d'essai` (relevé D8 du 27.09.2026, règle de `deDevant` dans `apps/web/src/lib/i18n.ts` : jamais
   devant un « h », et devant un « y » seulement quand une consonne le suit).
3. La version : `Version du <date>`, la même date, par exemple `Version du 26.09.2026`, puis
   `Si le texte change, cet écran vous demandera de nouveau votre accord.`
4. Pour une personne membre de plusieurs organisations, ou qui a une invitation qui court encore
   (étape 18), et pour elle seule : le lien `Choisir une autre organisation`, vers
   `/organisations`. Il vient avant le texte : qui voulait entrer dans une autre organisation n'a
   pas à parcourir tout le document pour le trouver.
5. Le document en entier, sans son titre, que le titre de la page reprend déjà : il commence à
   `Ce texte s'adresse aux organisations […]`.
6. Le bouton, seul dans son formulaire : `J'accepte les conditions d'utilisation`.
7. Sous le bouton :
   `Tant que vous ne les avez pas acceptées, l'espace de <organisation> reste fermé.`, avec la même
   élision.
8. Depuis l'étape 20, un second formulaire, au bouton secondaire, blanc et bordé de gris :
   `Ne pas accepter et quitter l'organisation`. Il porte l'organisation que l'écran nomme, dans un
   champ caché.

### L'en-tête, pendant ce temps

La navigation de l'espace (`À venir`, `Cours`, `Partager`…) **n'est pas affichée** : chacun de ses
liens ramènerait ici. Restent la marque `jadwal`, le choix de la langue, l'adresse de la personne et
le bouton `Se déconnecter`. Pour qui a plusieurs organisations, ou une invitation qui court encore,
le lien `Choisir une autre organisation` est donc le seul chemin vers une autre. `/organisations`
ne passe pas par la porte de l'espace ; le choix fait, c'est la porte de l'autre organisation qui
s'applique.

Ailleurs dans l'espace, la navigation se termine par `Changer d'organisation`, vers
`/organisations`, pour toute personne membre de plusieurs organisations, éditeurs compris. Il vaut
aussi pour une personne d'une seule organisation qui a une invitation en attente, pas encore échue :
c'est sur `/organisations` qu'elle l'accepte. Une personne d'une seule organisation sans invitation
qui court ne le voit pas ; depuis l'étape 19, elle trouve à sa place `Vos organisations`, vers le
même écran, où elle peut quitter son organisation. Le super-admin entré par ses pouvoirs garde le
seul lien de sa bannière, invitation ou non. Ce lien part avec la navigation sur cet écran, qui a
déjà le sien. L'écran `Membres` ne le porte plus : il se montrait aussi à qui n'avait qu'une
organisation et rien à choisir.

### Ce que fait le bouton qui accepte

Il enregistre une ligne : l'organisation, la personne, la version (`2026-09-26` pour le texte du
26.09.2026). Le moment est posé par la base de données, pas par l'application. Puis il
renvoie vers `/`, l'accueil de l'espace. Son action est nommée, `?/accepter`, depuis que l'écran en
a une seconde.

Un second envoi du même formulaire n'ajoute rien et ne lève rien.

Quand le texte change de version, c'est-à-dire quand sa date de mise à jour change, chacun repasse
par cet écran à sa prochaine entrée.

### Ne pas accepter, et quitter l'organisation (étape 20)

Le bouton `Ne pas accepter et quitter l'organisation` fait le départ de « Vos organisations », par le
même chemin (`apps/web/src/routes/organisations/leave.server.ts`, ADR 0044) :

- **Le premier envoi ne fait rien partir.** L'écran revient avec, en haut, après le titre et avant
  le texte des conditions, une demande annoncée (`role="alert"`), encadrée de rouge :
  `Vous allez quitter cette organisation :` et son nom, puis `Son espace ne vous sera plus ouvert.
Pour y revenir, il faudra qu'une personne responsable vous invite de nouveau.`, le bouton rouge
  `Confirmer le départ` et le lien `Rester dans l'organisation`, qui ramène à cet écran sans rien
  envoyer. Rien n'est accepté non plus.
- **Confirmé, le départ** supprime l'adhésion, et avec elle ses acceptations des conditions dans
  cette organisation. Le journal le consigne, signé de la personne (`member.leave`) ; le refus des
  conditions, lui, n'est écrit nulle part. La session ne désigne plus l'organisation, et la personne
  arrive sur « Vos organisations », avec l'encadré du départ (`responsables-coquille.md`). Qui a une
  autre organisation la garde.
- **La seule personne responsable ne part pas.** Dès le premier envoi, et de même si l'autre
  responsable part entre les deux envois, l'écran dit au même endroit (`role="alert"`) :
  `Vous êtes la seule personne responsable de cette organisation :` et son nom, puis
  `Une organisation garde toujours au moins une personne responsable. Pour la quitter, acceptez
d'abord les conditions, puis, dans l'écran Membres, donnez le rôle de responsable à un autre membre
ou invitez une personne comme responsable.` La phrase de « Vos organisations » dit « ouvrez-la »,
  ce qui la ramènerait ici.
- **Un formulaire trafiqué**, qui nomme une organisation dont la personne n'est pas membre ou aucun
  identifiant lisible : `Vous n'êtes pas membre de cette organisation.`, au même endroit, et rien ne
  change.
- **Une personne qui a déjà accepté** est renvoyée vers `/`, sans que rien ne soit supprimé.

## Les titres manquants, relevés par axe

- `/connexion` : `Se connecter | jadwal`, et sous le formulaire le lien
  `Lire les conditions d'utilisation`.
- `/organisations` : `Vos organisations | jadwal`.
