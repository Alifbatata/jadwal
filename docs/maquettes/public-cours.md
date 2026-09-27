# Page d'un cours

Un cours a son propre lien pour deux raisons, et elles sont également importantes : c'est ce qu'on
partage dans un message (« regarde, c'est celui-là »), et c'est ce qu'un moteur de recherche
indexe.

**Lien** : `/m/<identifiant>/cours/<identifiant du cours>`, et
`/m/<identifiant>/<langue>/cours/<identifiant du cours>` dans les autres langues.

## Structure, de haut en bas

1. **Un fil d'Ariane**, sur une ligne : `<Nom de l'organisation> › Cours`. Le nom est un lien vers
   la vue Semaine, `Cours` un lien vers la vue Tous les cours.
2. **Le titre du cours**, en titre de niveau 1.
3. **La ligne de repères**, dans cet ordre, séparés par des points médians :
   le rythme en clair · l'horaire · le public.
4. **La description**, si elle existe, en paragraphes. Rien si elle est vide : pas de
   « Aucune description », qui ne dirait rien de plus que le blanc.
5. **Les précisions**, en liste de définitions, en sautant ce qui est vide :
   - `Lieu` : le nom de la salle.
   - `Intervenant` : le texte saisi.
   - `Enseigné en` : les langues d'enseignement, en toutes lettres.
   - `Dates` : `Du 01.09.2026 au 20.12.2026`, si le cours a une date de fin.
6. **Les prochaines séances**, titre de niveau 2 : au plus dix dates à venir, chacune avec son
   jour et sa date (`samedi 26.09.2026`) et son heure. Une séance annulée figure à sa date, barrée,
   avec la mention de la vue Semaine : `Annulé` pour un cours, `Annulée` pour une session du
   vendredi, accordée à la prière ; elle compte parmi les dix. La page ne la montrait pas jusqu'au
   lot 2 de l'étape 19 (27.09.2026) : ses prochaines dates ne gardaient que les séances qui ont
   lieu. Les prochaines séances de l'API n'en ont toujours pas (`docs/API.md`). Une séance déplacée
   figure à sa nouvelle date avec `Date exceptionnelle`.
   Déplacée le même jour à une autre heure, elle porte `Nouvelle heure`, puis l'heure d'avant,
   `Initialement à 19:30`, la même que la vue Semaine, y compris pour un cours placé après une
   prière (étape 18). Si aucune heure de prière ne couvre ce jour, l'heure d'avant n'est pas dite.
7. **Ajouter ce cours à mon agenda**, titre de niveau 2, à l'ancre `#agenda` (ADR 0028, ADR 0048).
   Dessous, le même bloc que la page d'abonnement, selon l'appareil, pour le flux de **ce** cours
   seul (voir `public-agenda.md`) : le bouton `Ajouter à mon calendrier` en `webcal:` sur un
   iPhone, un iPad ou un Mac ; `Ajouter à Google Agenda` sur Android ; le choix complet ailleurs.
   Outlook reçoit le nom `<Nom de l'organisation> – <Titre du cours>`, celui que porte le flux.
   Sur Android, la phrase de secours donne l'adresse courte de **cette** page, celle du cours
   (`Si Google Agenda ne propose rien sur votre téléphone, ouvrez cette page sur un ordinateur :`).
   Puis `Ou copiez cette adresse, qui ne porte que ce cours :` et l'adresse en `https:`, et
   `Une autre application ou un autre appareil ?` suivi du lien `Voir tous les choix`, vers
   `?appareil=tous#agenda`. La réponse porte
   `Vary: Sec-CH-UA-Platform, User-Agent`, sauf pour le choix complet.
8. **Deux liens** sur une ligne : `S'abonner à tout le programme`, vers la page d'abonnement, et
   `Retour au programme`, vers la vue Semaine.
9. **Le pied commun**.

## Métadonnées de partage

Produites côté serveur, dans la langue de la page :

- `<title>` : `<Titre du cours> | <Nom de l'organisation>`
- `og:title` : le titre du cours
- `og:description` : la description, coupée à 200 caractères sur un espace, ou à défaut la ligne de
  repères (rythme, horaire, public)
- `og:url` : le lien canonique de la page dans sa langue
- `og:locale` : la langue de la page et son pays, `fr_CH`, `de_CH`, `it_CH`, `en_GB` ou `ar_AR`
  (27.09.2026), et une balise `og:locale:alternate` pour chaque autre langue que l'organisation
  publie, dans l'ordre de l'interface. La page du programme et celle de l'abonnement font de même.
- `og:type` : `article`
- `og:site_name` : le nom de l'organisation

Aucune image : il n'y en a pas à mettre, et en inventer une ferait charger un fichier pour rien.
Le texte de ces métadonnées est échappé comme le reste — une apostrophe ou un chevron saisi dans un
titre ne doit pas plus casser une balise `meta` qu'un paragraphe.

## Comportements

- Un cours qui n'est pas publié, ou dont l'organisation est suspendue, répond comme un cours qui
  n'existe pas : même page, même code. Le lien ne dit pas s'il a existé.
- Les liens croisés entre langues pointent vers la même page du même cours.
