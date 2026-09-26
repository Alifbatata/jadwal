# Maquettes

Une description écran par écran, écrite **avant** le code, pour que l'exploitant puisse comparer ce
qui a été livré à ce qui avait été décrit. C'est la référence qui manquait à l'étape 4, où le rapport
a dû reconnaître qu'aucune maquette n'était comparable.

Ces fichiers ne sont pas des captures d'écran : ce sont des descriptions. Structure, ordre des
éléments, **libellés exacts en français**, comportements. Un désaccord entre un de ces fichiers et
le code est un défaut — de l'un ou de l'autre, et il faut trancher, pas contourner.

## Écrans publics (étape 5)

| Fichier                    | Écran                                                      |
| -------------------------- | ---------------------------------------------------------- |
| `public-semaine.md`        | la vue Semaine, page d'accueil publique d'une organisation |
| `public-tous-les-cours.md` | la vue Tous les cours, groupés par rythme                  |
| `public-mois.md`           | la vue Mois : grille, puis liste du jour choisi            |
| `public-cours.md`          | la page d'un cours, à son propre lien                      |
| `public-agenda.md`         | la page d'abonnement au flux agenda                        |

## Le widget (étape 6)

| Fichier     | Écran                                                     |
| ----------- | --------------------------------------------------------- |
| `widget.md` | le widget, la vue intégrée `?embed=1`, et la page d'essai |

## La prière du vendredi (étape 8)

| Fichier                    | Écran                                                          |
| -------------------------- | -------------------------------------------------------------- |
| `public-vendredi.md`       | le bloc en haut de la page publique, et la place dans les vues |
| `responsables-vendredi.md` | l'écran des responsables, distinct de la liste des cours       |

## Les conditions d'utilisation (étape 16)

| Fichier                      | Écran                                                                    |
| ---------------------------- | ------------------------------------------------------------------------ |
| `responsables-conditions.md` | la page des conditions, ouverte à tous, et l'écran qui les fait accepter |

## Les écrans récrits à l'étape 18

À l'étape 18, les retours des tests du chef de projet ont récrit l'espace des responsables : chaque
écran dit ce qu'il fait, chaque champ a un libellé clair, une aide et un exemple, et tout se lit
dans cinq langues. Ces descriptions-ci ont été écrites **après** le code, d'après les dictionnaires
de chaque écran (`apps/web/src/lib/i18n/`) et les écrans rendus. Elles citent le français ; les
quatre autres langues disent la même chose.

| Fichier                            | Écran                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `public-prieres.md`                | l'onglet Prières de la page publique, quand le module est allumé              |
| `responsables-coquille.md`         | la coquille, le choix de la langue, la connexion, les organisations, l'erreur |
| `responsables-a-venir.md`          | l'écran À venir : les sept prochains jours, annuler, déplacer, messages       |
| `responsables-cours.md`            | la liste des cours, les pauses, et le formulaire d'un cours avec son résumé   |
| `responsables-heures-de-priere.md` | l'écran Heures de prière : une question, trois réponses                       |
| `responsables-partager.md`         | l'écran Partager : l'adresse, le message, le QR code, les codes à coller      |
| `responsables-membres.md`          | l'écran Membres : les membres, les invitations, ce que chaque rôle permet     |
| `responsables-reglages.md`         | l'écran Réglages : nom, fuseau, couleur, langues, salles, heures de prière    |
| `super-admin.md`                   | la console du super-admin et l'écran de la passkey                            |

`public-agenda.md`, `public-cours.md`, `widget.md` et `responsables-vendredi.md` ont été mis à
jour à la même étape.

## Conventions communes à tous les écrans publics

### Ce qui ne change jamais

- **Aucun JavaScript.** Tout se lit et se manipule en HTML : les détails se déplient avec
  `<details>`, les vues et les filtres sont des liens. Une page publique qui aurait besoin d'un
  script serait un défaut de conception, pas une fonctionnalité.
- **Aucune ressource d'un autre domaine** : pas de police distante, pas d'image distante, pas de
  script distant. Le texte s'affiche avec les polices du système. Depuis l'étape 18, deux liens
  mènent ailleurs, vers Google Agenda et Outlook, sur la page d'abonnement et la page d'un cours ;
  ce sont des liens que le visiteur choisit de suivre, rien n'est chargé (ADR 0048).
- **Aucun cookie, aucun traceur.** Un visiteur ne laisse rien.
- **Texte brut.** Rien de ce qu'un responsable a saisi n'est interprété comme du HTML.
- **Les dates s'écrivent `JJ.MM.AAAA`**, précédées du nom du jour quand il aide :
  `samedi 26.09.2026`, `Samstag, 26.09.2026`, `Saturday 26.09.2026`. Seuls les mois de la vue Mois
  gardent leur nom.

### L'en-tête, identique sur toutes les vues

1. Le **nom de l'organisation**, en titre de niveau 1.
2. Les **vues**, dans cet ordre, la vue courante marquée : `Semaine`, `Tous les cours`, `Mois`, et
   `Prières` quand le module des heures de prière est allumé (voir `public-prieres.md`). Les
   lecteurs d'écran entendent le nom de la liste, `Affichage`.
3. Les **filtres par public**, dans cet ordre : `Tous`, `Enfants`, `Jeunes`, `Femmes`, `Adultes`,
   `Ouvert à tous`. Le filtre actif est marqué. Un filtre est un lien, jamais une case à cocher. Les
   lecteurs d'écran entendent `Filtrer par public`. Il n'y a pas de filtre sur l'onglet `Prières`.
4. Les **langues disponibles**, en toutes lettres : `Français`, `Deutsch`, `Italiano`, `English`,
   `العربية`, celles que l'organisation publie. La langue courante est marquée. Chaque langue est un
   lien vers la même vue dans cette langue.

### Le pied, identique partout

1. Une ligne, deux liens séparés par `·` :
   - `S'abonner au calendrier`, vers la page d'abonnement ;
   - `Conditions d'utilisation`, vers `/conditions?lang=<langue de la page>`. Le texte du lien suit
     la langue de la page (`Nutzungsbedingungen`, `Condizioni d'uso`, `Terms of use`,
     `شروط الاستخدام`), et la page des conditions s'ouvre dans cette langue, avec une phrase qui dit
     que le texte n'existe qu'en français ; le lien le dit aussi par `hreflang="fr"`. Il s'ouvre
     toujours dans un nouvel onglet : `/conditions` refuse d'être encadrée, et la page publique vit
     souvent dans un cadre, celui du widget ou celui qu'une organisation pose à la main. Le lien le
     dit aux lecteurs d'écran, et à eux seuls, par un texte caché aux yeux : son nom devient
     `Conditions d'utilisation (s'ouvre dans un nouvel onglet)`, et de même dans les quatre autres
     langues (`öffnet sich in einem neuen Tab`, `si apre in una nuova scheda`, `opens in a new tab`,
     `يُفتح في علامة تبويب جديدة`). À l'écran, rien ne change.
2. `Proposé gratuitement par jadwal, un service de Voltia`.
3. Rien d'autre. Pas de compteur, pas de logo.

### Comment une séance s'affiche

Toujours dans cet ordre, sur une ligne ou deux :

1. **L'heure**. Pour un cours à heure fixe : `19:00 – 20:30`. Pour un cours ancré sur une prière :
   `Après Maghrib`, `15 min après Maghrib` ou `10 min avant Maghrib` d'abord, puis l'heure entre
   parenthèses **si elle est connue**. Jamais de mention d'un réglage manquant : un visiteur n'a pas
   à connaître nos étapes.
2. **Le titre du cours**, qui est un lien vers la page du cours.
3. **Le public**, en un mot : `Enfants`, `Jeunes`, `Femmes`, `Adultes`, `Ouvert à tous`.
4. **La salle**, si elle est renseignée.
5. **L'intervenant**, s'il est renseigné.

Une séance **annulée** reste visible, son texte est barré, et elle porte la mention `Annulé`.
Une séance **déplacée** apparaît deux fois : barrée à sa date d'origine avec
`Déplacé au samedi 03.10.2026`, et à sa nouvelle date avec `Date exceptionnelle`. Déplacée le même
jour à une autre heure, elle est barrée avec `Déplacé à 20:30`, puis écrite à sa nouvelle heure avec
`Nouvelle heure` et `Initialement à 19:00` (étape 18).

### Une adresse qui ne mène nulle part

Une organisation inconnue ou suspendue, un cours qui n'est pas publié, une adresse qu'aucune page ne
connaît sous `/m/<identifiant>/` : tous rendent le même `404`, dans la langue de l'adresse, et sans
aucun script, même dans le cadre du widget. La langue est celle du segment de l'adresse. Sans
segment, c'est la langue par défaut de l'organisation pour un cours qu'elle ne publie pas, et le
français partout ailleurs : une adresse inventée ne coûte aucune lecture de la base. La page porte
un titre de niveau 1 et une phrase, rien d'autre :

| Langue | Titre                  | Phrase                          |
| ------ | ---------------------- | ------------------------------- |
| `fr`   | `Page introuvable`     | `Vérifiez l'adresse.`           |
| `de`   | `Seite nicht gefunden` | `Bitte prüfen Sie die Adresse.` |
| `it`   | `Pagina non trovata`   | `Controlla l'indirizzo.`        |
| `en`   | `Page not found`       | `Please check the address.`     |
| `ar`   | `الصفحة غير موجودة`    | `تحقّق من العنوان.`             |

Elle ne dit pas si l'organisation a existé.

### Les langues

Cinq langues depuis l'étape 18 : français, allemand de Suisse, italien, anglais britannique et
arabe (ADR 0007). L'arabe s'affiche en écriture de droite à gauche complète (`dir="rtl"`), avec des
**chiffres latins** : `19:00`, jamais `١٩:٠٠`. Le contenu d'un cours s'affiche dans la langue demandée si la
traduction existe, sinon dans sa langue source, **sans mention d'échec** : un visiteur n'a pas à
savoir qu'une traduction manque.

### Accessibilité

Même niveau qu'à l'étape 4 : cibles d'au moins 44 pixels, un seul titre de niveau 1 par page, une
hiérarchie de titres continue, chaque lien compréhensible hors de son contexte, contraste suffisant,
et la langue de la page déclarée sur `<html>`.
