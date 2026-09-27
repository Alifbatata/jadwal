# ADR 0021 : Espace des responsables — structure et vocabulaire

## Contexte

Le cadrage promet « une seule saisie » pour quatre sorties. L'espace des responsables est cette
saisie. Il est utilisé depuis un téléphone, souvent sur place, par deux ou trois personnes qui ne
sont pas des informaticiennes et qui ne s'en serviront qu'une fois par semaine — parfois moins.

Trois choses en découlent, et elles décident de tout le reste : les mots doivent être ceux de
l'organisation, pas ceux de la base ; ce qui est fréquent doit être à un geste ; et rien ne doit
dépendre de JavaScript, parce qu'un réseau de sous-sol n'est pas un réseau de bureau.

## Décision

### Cinq écrans, dans cet ordre

| Écran        | Ce qu'on y fait                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| **À venir**  | les sept prochains jours ; annuler, déplacer, rétablir une séance                 |
| **Cours**    | la liste avec le rythme en clair ; créer, modifier, poser une pause               |
| **Partager** | le lien public, le programme de la semaine en texte, le code à coller, un QR code |
| **Membres**  | inviter, retirer, changer un rôle (`org_admin`)                                   |
| **Réglages** | nom, fuseau, couleur, langues, salles, formule d'accueil (`org_admin`)            |

**À venir est l'accueil**, et non la liste des cours. Ce qu'on vient faire un mardi soir, c'est
annuler la séance de demain, pas relire la fiche d'un cours.

### Le vocabulaire

Celui de l'organisation : « séance » et non « occurrence », « cours » et non « événement »,
« public » et non « audience », « Maghrib » et non « `prayer` `anchor` ». Le rythme s'affiche en
phrase — « chaque semaine, le lundi et mercredi », « le dernier samedi du mois » — et jamais en
règle de récurrence.

### Ce que l'écran ne calcule pas

**Tous les aperçus viennent de `@jadwal/core`** : les sept prochains jours, le résumé qui se met à
jour pendant la saisie, les prochaines dates. Refaire l'arithmétique dans l'interface donnerait deux
vérités, et celle de l'écran serait la moins testée. Un test compare, pour les mêmes données, ce que
l'écran affiche à ce que `expandOccurrences` calcule.

### Ce que le responsable ne saisit jamais

Les identifiants. Ils sont produits par le système, en UUID v7 (ADR 0014), et les contraintes d'`UID`
de l'étape 1 — pas d'espace, pas de virgule, jamais un identifiant qui finit par une date — ne
remontent donc jamais jusqu'à lui.

### Les gestes fréquents

- **Annuler** demande une confirmation qui rappelle, en toutes lettres, que le cours continue les
  autres semaines. C'est la confusion la plus probable, et elle se corrige par une phrase.
- **Déplacer** propose toute date à partir d'aujourd'hui, plus tôt ou plus tard que la date prévue,
  et une heure. Un déplacement qui ne change ni la date ni l'heure d'une séance de l'écran est
  refusé. Le même jour à une autre heure, la carte et le message disent un changement d'heure, et
  non de date.
- **Annuler** et **Déplacer** ne visent qu'une séance encore prévue telle quelle. Une page restée
  ouverte qui envoie la carte d'une séance annulée ou déplacée depuis est refusée : rien n'est écrit,
  et l'écran rendu est à jour.
- **Rétablir** défait l'un comme l'autre.
- Après une annulation ou un déplacement, **le message prêt à coller s'affiche**. C'est ce que les
  responsables font déjà à la main, dans WhatsApp.

> **Révisé le 2026-09-26, à l'étape 18 (retour A2).** Déplacer proposait les six jours qui suivent
> la séance, et un changement plus lointain passait pour un changement de rythme. Les essais de
> l'étape 18 ont montré le défaut : une séance ne pouvait être ni avancée, ni reportée de deux
> semaines, et un changement de rythme n'est pas fait pour un seul jour. Le champ « Nouvelle date »
> accepte désormais toute date à partir d'aujourd'hui, dans le fuseau de l'organisation, sans limite
> vers l'avant. C'est l'action qui refuse une date passée, et non le seul champ du navigateur, qu'un
> formulaire envoyé à la main contourne.
>
> Le champ s'ouvre sur la date et l'heure prévues, pour que changer seulement l'heure reste un geste
> simple. En contrepartie, l'action refuse un déplacement qui ne change ni la date ni l'heure, avec
> une phrase qui dit de choisir une autre date ou une autre heure. L'accepter écrivait une exception
> vers la séance elle-même : la séance s'affichait deux fois le même jour, et le message prêt à
> coller annonçait un déplacement du mercredi au même mercredi, à la même heure. L'heure prévue est
> celle que calcule `@jadwal/core` pour ce jour-là, et non une valeur renvoyée par le formulaire. Le
> même jour à une autre heure reste un déplacement, comme le même jour pour une séance affichée sans
> heure, qui en reçoit une.

> **Révisé le 2026-09-26, à l'étape 18 (relecture du lot 4).** Le refus ne tenait pas sur tous les
> chemins. Une page restée ouverte, par Retour, dans un autre onglet ou chez une autre personne,
> montrait encore la carte d'une séance déjà déplacée ou annulée. Envoyée sans changement, cette
> carte écrivait un déplacement de la séance vers elle-même, qui écrasait le premier ; une
> annulation devenait de la même façon un déplacement. Annuler et Déplacer n'écrivent donc plus que
> pour une séance qui n'a encore ni annulation ni déplacement ce jour-là. Sinon, l'action répond que
> la séance a changé depuis l'ouverture de la page, que rien n'a été enregistré et que le programme
> affiché est à jour, puisque la page est rendue de nouveau. L'heure prévue qui sert à refuser un
> déplacement sans changement est celle des sept jours de l'écran, les seuls que ses cartes
> proposent : un formulaire fabriqué à la main pour une séance plus lointaine n'est pas comparé.
>
> Un déplacement le même jour à une autre heure se disait comme un changement de date : la carte
> d'arrivée portait « date exceptionnelle » et « Prévue à l'origine » suivi du même jour, et le
> message répétait la date. La carte porte maintenant « nouvelle heure » et l'heure prévue, et le
> message ne donne la date qu'une fois, avec la nouvelle heure et celle d'avant.

### Le JavaScript améliore, il n'est jamais nécessaire

Toutes les écritures passent par des `form` actions. Sans JavaScript : les onglets de langue sont
tous dépliés, le résumé affiche l'état enregistré au lieu de suivre la frappe. Rien ne manque. Les
options d'une séance (« Annuler ou déplacer ») sont un élément `details` natif : fermées par
défaut, elles s'ouvrent et se ferment avec ou sans JavaScript, et n'ouvrent que leur carte
(révision de l'étape 18, retour A1 ; avant, elles étaient toutes ouvertes au chargement). Les tests
postent des formulaires `application/x-www-form-urlencoded` avec `accept: text/html`, ce qui est
exactement le chemin d'un navigateur sans JavaScript.

**Une seule exception**, et elle est bornée : l'écran de passkey du super-admin. WebAuthn est une
API du navigateur ; il n'existe pas de formulaire qui crée une passkey. L'écran le dit au lieu de
présenter un bouton inerte.

### Texte brut, partout

Aucun HTML saisi n'est jamais rendu. Svelte échappe ce qu'il affiche, et un test envoie des charges
habituelles dans chaque champ puis relit les pages pour vérifier qu'elles sortent en texte.

### Performance et accessibilité

- L'écran d'accueil tient en **cinq requêtes** — réglages, cours, exceptions, pauses, heures de
  prière — quel que soit le nombre de cours. Jamais une requête par cours.
- Tout est rendu côté serveur.
- Cibles tactiles d'au moins 44 pixels, libellés reliés à leurs champs, erreurs annoncées
  (`role="alert"`), navigation au clavier complète.

### Traductions

Les textes sont saisis dans la langue source de l'organisation. Les traductions sont facultatives :
un onglet par langue activée, vide par défaut, et **aucune traduction automatique** ici. La
pré-traduction validée par le responsable est dans la feuille de route, pas dans la V1.

## Conséquences

- Un responsable peut, depuis un téléphone, créer les cours de son organisation, en annuler un, en
  déplacer un autre, poser une pause et copier le message de la semaine.
- L'interface ne peut pas afficher une séance que le cœur n'aurait pas calculée, ni en manquer une :
  c'est le même code qui répond aux quatre sorties du cadrage.
- Le résumé pendant la saisie est un confort. Il disparaît sans JavaScript, et le formulaire
  fonctionne quand même.
- Les pauses sont sur l'écran des cours parce que c'est là qu'on a la liste sous les yeux : une
  pause vise un cours, ou toute l'organisation.
- L'écran **Partager** montre déjà le lien public et le code à coller, marqués « à venir » tant que
  les étapes 5 et 6 ne sont pas faites. Dire qu'une chose n'existe pas encore vaut mieux que de
  laisser croire qu'elle marche.

## Addendum du 27.09.2026 : ce que l'ADR ne disait pas, et la relecture d'« À venir » (étape 19)

### La carte envoie l'heure qu'elle montrait

Depuis la relecture du lot 5 de l'étape 18, le formulaire « Déplacer » d'une carte envoie, sans le
montrer, `plannedStart` : l'heure de la séance telle que la carte l'affichait, vide pour une séance
sans heure. Quand l'heure du cours a changé depuis dans sa fiche, la séance n'est plus prévue à
cette heure-là : l'action refuse la carte (`timeChanged`, 409), quelle que soit la date choisie, et
rien ne s'écrit. Sans ce refus, une carte renvoyée telle quelle déplaçait la séance à l'ancienne
heure, avec le message « commence à 19:00 au lieu de 20:00 ». La carte se rouvre sous la nouvelle
heure et propose l'heure actuelle, sauf une heure que la personne avait tapée. Un formulaire sans
ce champ, ou une séance hors des sept jours de l'écran, n'est pas comparé.

### Les refus de l'écran du vendredi

L'écran du vendredi (ADR 0033) suit la règle d'« À venir » pour une page restée ouverte : annuler
et déplacer n'écrivent que pour une session encore prévue telle quelle ce jour-là. Comme « À
venir », il refuse l'annulation d'un jour déjà passé. Il ne refuse pas, lui, un déplacement vers un
jour passé : sa liste de jours commence aujourd'hui, et seul un formulaire écrit à la main peut en
envoyer un d'avant. « À venir », dont le champ de date est libre, le refuse (`pastDate`).

Chaque refus a son nom, que l'écran écrit dans la langue de la personne. Ceux des gestes de « Ce
vendredi » et des boutons d'une session s'affichent en tête de l'écran :

| Refus            | Statut | Quand                                                                         |
| ---------------- | ------ | ----------------------------------------------------------------------------- |
| `changed`        | 409    | la session a déjà été annulée ou déplacée ce jour-là, ici ou sur À venir      |
| `timeChanged`    | 409    | l'heure de la session a changé depuis l'ouverture de la page                  |
| `unchanged`      | 400    | le déplacement vise le jour et l'heure où la session est déjà prévue          |
| `pastSession`    | 400    | l'annulation d'un jour déjà passé (étape 19, D2)                              |
| `sessionGone`    | 404    | la session n'existe pas, ou plus, ou l'identifiant est celui d'un cours       |
| `dateUnreadable` | 400    | une date illisible, impossible (un 30 février) ou hors des années 1970 à 2100 |
| `timeUnreadable` | 400    | une heure illisible ou impossible, 25:99 par exemple                          |

Ceux du formulaire d'une session, à l'ajout comme à la modification, restent dans ce formulaire,
avec la saisie :

| Refus                   | Statut | Quand                                                                          |
| ----------------------- | ------ | ------------------------------------------------------------------------------ |
| `titleTooLong`          | 400    | un titre de plus de 120 signes                                                 |
| `orderInvalid`          | 400    | un rang autre que la première, la deuxième ou la troisième session             |
| `timesMissing`          | 400    | une heure de début ou de fin absente, illisible ou impossible                  |
| `endBeforeStart`        | 400    | une heure de fin qui ne vient pas après l'heure de début                       |
| `sermonLanguageMissing` | 400    | aucune langue du sermon cochée parmi celles que l'écran propose                |
| `startDateMissing`      | 400    | une date « À partir du » absente, illisible, impossible ou hors de 1970 à 2100 |
| `endDateUnreadable`     | 400    | une date « Jusqu'au » illisible, impossible ou hors de 1970 à 2100             |
| `endDateBeforeStart`    | 400    | une date « Jusqu'au » qui vient avant la date « À partir du »                  |
| `roomGone`              | 400    | la salle choisie n'existe pas, ou plus, dans l'organisation (étape 19, D2)     |
| `orderTaken`            | 409    | à l'ajout, une session sans date de fin occupe déjà ce rang                    |

La modification d'une session supprimée entre-temps n'a plus de carte : sa réponse s'écrit en tête
de l'écran, `sessionGone` (404), ou, quand la saisie a aussi des erreurs, la phrase de
`sessionGone` suivie de ces erreurs (400).

Relevé à l'étape 18 et corrigé à l'étape 19 (D2) : annuler ne comparait pas la date au jour de
l'organisation, et acceptait un vendredi passé ; Rétablir, Publier et Supprimer répondaient « fait »
pour une session inconnue et l'écrivaient au journal ; un identifiant mal formé, une salle
supprimée entre-temps, un 30 février ou 25:99 atteignaient la base, qui répondait alors par une
erreur 500. Chaque geste vérifie désormais chaque identifiant, chaque date et chaque heure avant la
base, et un refus n'écrit rien, pas même au journal.

La relecture de D2 a trouvé ce que ces vérifications laissaient passer. `isIsoDate` suit le
calendrier de `@jadwal/core`, qui a un an 0000 (ADR 0012), et PostgreSQL n'en a pas : Rétablir,
Déplacer et Enregistrer répondaient encore à « 0000-01-01 » par une erreur 500, ici comme sur
« À venir ». La base range le 31.12.9999, mais le flux agenda calcule le lendemain d'une date de
fin, en l'an 10000, que le calcul refuse : une session publiée qui finissait ce jour-là faisait
tomber le flux de toute l'organisation. Une date envoyée aux deux écrans s'accepte désormais de 1970
à 2100, les années que couvrent les tests du calcul (`isSupportedDate`), et reçoit sinon la phrase
d'une date illisible. Le caractère nul (U+0000), qu'aucun clavier ne tape mais qu'un formulaire écrit
à la main peut envoyer, et que PostgreSQL refuse dans un texte, est retiré des champs de texte d'une
session au lieu de donner une erreur 500.

### À venir, après la relecture de l'étape 18 (D4)

- **Le programme de la semaine est celui de Partager** : les cours publiés seulement, lus comme
  Partager les lit. Retirer les brouillons des séances de l'écran ne suffisait pas : la dernière
  session du vendredi, même en brouillon, donnait son heure à un cours prévu après le Dhuhr. L'écran
  lit donc le programme une seconde fois, pour ses seuls cours publiés. Il tient toujours en un
  nombre fixe de requêtes, quel que soit le nombre de cours, mais ce nombre n'est plus cinq.
- **L'écran montre les brouillons**, et leur carte porte la marque `brouillon`.
- **Une carte « date exceptionnelle » a « Rétablir »**. Elle envoie la date prévue de la séance,
  celle que garde le changement, qui n'est pas toujours à l'écran : une séance peut être avancée
  de loin. Une séance qui n'a changé que d'heure garde un seul « Rétablir », sur la carte de son
  heure prévue, le même jour.
- **Le refus d'une carte périmée nomme la séance**, par son titre et sa date : `changed` et
  `timeChanged`, et `alreadyCancelled`, ci-dessous.
- **Une seconde annulation de la même séance**, par une autre personne ou depuis une page restée
  ouverte, n'écrit rien (409, `alreadyCancelled`) mais donne le message prêt à coller : la séance
  est annulée, et la personne ne sait pas si la communauté a déjà été prévenue. Une carte qui annule
  une séance déplacée depuis reste refusée sans message.
- **Une séance disparue** dit que la liste ci-dessous est à jour, au lieu de demander de recharger
  une page qui l'est déjà : sans JavaScript, recharger renverrait le formulaire refusé.
- **Le titre d'une carte suit la langue de l'écran** quand le cours y est traduit, sinon celui de sa
  langue source, comme avant ; une session du vendredi au nom proposé prend le nom de la prière
  dans cette langue. Les messages restent écrits dans chaque langue publiée, la langue source
  d'abord : la langue par défaut pour la semaine, celle du cours pour une annulation ou un
  déplacement.

## Statut

Accepté, 2026-09-20. Étape 4 de la feuille de route (espace des responsables). Les numéros 0022 et
0023 restent libres. Révisé le 2026-09-26 (étape 18) : une séance se déplace à toute date à partir
d'aujourd'hui, un déplacement qui ne change rien est refusé, les options d'une séance sont fermées
par défaut, une page restée ouverte ne défait pas un changement, et un déplacement le même jour se
dit comme un changement d'heure. Complété le 27.09.2026 (étape 19) : l'heure que la carte montrait,
les refus de l'écran du vendredi, les dates que les deux écrans acceptent, et la relecture
d'« À venir ».
