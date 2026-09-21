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
   - `Du … au …` : les dates de début et de fin, si elles sont posées.
6. **Les prochaines séances**, titre de niveau 2 : au plus dix dates à venir, chacune avec son
   heure. Une séance annulée figure barrée avec la mention `Annulé` ; une séance déplacée figure à
   sa nouvelle date avec `Date exceptionnelle`.
7. **L'abonnement à ce seul cours** (ADR 0028), dans cet ordre :
   - un bouton `Ajouter ce cours à mon agenda`, en `webcal:`, vers le flux de **ce** cours ;
   - `Ou copiez cette adresse, qui ne porte que ce cours :` puis l'adresse en `https:`, en texte
     sélectionnable ;
   - deux liens sur une ligne : `S'abonner à tout le programme` — vers la page d'abonnement — et
     `Retour au programme` — vers la vue Semaine.
8. **Le pied commun**.

## Métadonnées de partage

Produites côté serveur, dans la langue de la page :

- `<title>` : `<Titre du cours> — <Nom de l'organisation>`
- `og:title` : le titre du cours
- `og:description` : la description, coupée à 200 caractères sur un espace, ou à défaut la ligne de
  repères (rythme, horaire, public)
- `og:url` : le lien canonique de la page dans sa langue
- `og:locale` : la langue de la page
- `og:type` : `article`
- `og:site_name` : le nom de l'organisation

Aucune image : il n'y en a pas à mettre, et en inventer une ferait charger un fichier pour rien.
Le texte de ces métadonnées est échappé comme le reste — une apostrophe ou un chevron saisi dans un
titre ne doit pas plus casser une balise `meta` qu'un paragraphe.

## Comportements

- Un cours qui n'est pas publié, ou dont l'organisation est suspendue, répond comme un cours qui
  n'existe pas : même page, même code. Le lien ne dit pas s'il a existé.
- Les liens croisés entre langues pointent vers la même page du même cours.
