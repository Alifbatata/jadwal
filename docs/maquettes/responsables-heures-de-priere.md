# L'écran Heures de prière

Décrit après le code, à l'étape 18 (retours C1, C2, et B1, D2, A3 pour cet écran). Textes :
`apps/web/src/lib/i18n/prayers.ts`, dans les cinq langues. La marche à suivre écrite pour une
personne responsable est dans `docs/CALENDRIER-PRIERES.md`.

**Lien** : `/prieres`, sous le nom `Heures de prière` dans la navigation. Réservé à la personne
responsable, et seulement si le module est allumé ; sinon, 404 (ADR 0042).

Avant l'étape 18, l'écran empilait en français cinq sections (état, calcul, tableau servi, périodes,
import) et demandait une « source que vous déclarez ». Il pose maintenant **une seule question**.

## Structure, de haut en bas

1. Titre de niveau 1 : `Heures de prière`, puis `Les heures de prière donnent l'heure des cours qui
suivent une prière, par exemple « 15 min après Maghrib ». Réglez-les une fois : le service les tient
à jour chaque jour.`
2. **Vos heures aujourd'hui** : une ou deux phrases, selon le cas.
   - `Vos heures sont calculées pour cette localité :` et la localité, ou
     `Vos heures sont calculées pour la position que vous avez donnée.` ;
   - `Votre fichier importé donne les heures jusqu'au 31.12.2026.`, puis
     `Ensuite, le calcul les donne.` ou ce qu'il faut faire quand plus rien ne suit ;
   - `Vous avez saisi 2 périodes à la main : les jours qu'elles couvrent, leurs heures passent avant
celles du fichier et du calcul.` ;
   - sans rien de réglé : `Aucune heure de prière n'est réglée. Les cours qui suivent une prière
s'affichent sans heure, par exemple « Après Maghrib ». Répondez à la question ci-dessous.`
3. **La question** : `D'où viennent vos heures de prière ?`, trois réponses, chacune avec son aide :
   - `Calculées pour votre localité` : `Le service calcule les heures de chaque jour d'après la
position de votre localité. C'est le plus simple.`
   - `Importées depuis un fichier` : `Vous avez le calendrier de votre mosquée ou de votre
fédération dans un fichier, une ligne par jour.`
   - `Saisies à la main` : `Vous recopiez les heures de votre panneau, pour quelques semaines ou pour
toute l'année.`

   Sous le groupe : `Si plusieurs sources donnent une heure pour le même jour, la saisie à la main
passe avant le fichier, et le fichier avant le calcul.` Sans JavaScript, un bouton `Continuer` ;
   avec, la réponse s'affiche sans recharger.

4. **La réponse choisie** : ce qu'elle demande, puis l'aperçu des sept prochains jours, puis le
   bouton qui enregistre (voir plus bas).
5. **L'iqama (facultatif)**, sous le calcul et sous le fichier : `L'iqama est l'heure où la prière
est appelée dans la salle. Si vous en avez une, réglez-la ici : un cours « après Maghrib » suivra
l'iqama.` Les mêmes périodes que la saisie à la main, avec les heures affichées repliées sous
   `Remplacer aussi les heures affichées`.
6. **Ce que voit le public les sept prochains jours** : les jours datés (`samedi 26.09.2026`), sous
   chaque heure sa provenance (`saisie`, `importée`, `calculée`), l'iqama, et `Jumu'a` le vendredi,
   avec l'heure des sessions publiées seulement, comme la page publique, À venir et Partager (ADR 0033) : jusqu'à l'étape 19, une session en brouillon s'y ajoutait.

## Calculées pour votre localité

- Le groupe `Votre localité`, le champ `Nom ou NPA de la localité`, avec l'aide `Par exemple
Bienne, Lugano ou 2502. La liste officielle des localités suisses est dans le service : aucun autre
site n'est interrogé.` En arabe, une ligne de plus dit de taper le NPA ou le nom en lettres latines.
- Le bouton `Chercher`, puis `N localités trouvées.`, `Aucune localité ne correspond. Vérifiez
l'orthographe, ou tapez le NPA.` ou `Tapez au moins deux lettres ou deux chiffres.` Avec
  JavaScript, la liste se remplit pendant la frappe, par une route de l'espace réservée aux mêmes
  personnes (`/prieres/localites`).
- La liste `Choisissez votre localité`, puis `Localité choisie : 2502 Biel/Bienne (BE). Sa
position : latitude 47.1421, longitude 7.2481.`, ou `Localité enregistrée :` une fois enregistrée.
  Le serveur relit la position dans la liste. La localité enregistrée reste dans la liste, en tête ;
  quand une recherche ne la rend pas, son nom est suivi de `localité enregistrée` (ou
  `localité choisie`), et le message ne la compte pas : `Büe` donne `1 localité trouvée.` au-dessus
  de Bienne, puis de Büetigen.
- La dernière case de la liste : `Hors de Suisse : utiliser la position donnée plus bas`. Elle est
  cochée quand aucune localité n'est choisie. Sans JavaScript, on ne décoche pas une case : pour
  passer d'une localité enregistrée à une position hors de Suisse, on coche celle-ci à sa place, ou
  l'on tape simplement la position, et le serveur la coche lui-même (étape 19). Avec JavaScript,
  taper une position la coche pendant la frappe, et la cocher ouvre le repli du même nom. Un clic
  sur la localité la reprend.
- Près du choix : `Liste officielle des localités : Office fédéral de topographie swisstopo,
version du 01.09.2026.` (ADR 0043, addendum).
- Le repli `Hors de Suisse` : `Votre organisation n'est pas en Suisse ? Donnez sa position en degrés
décimaux. […] Une position tapée ici remplace la localité choisie dans la liste plus haut : l'écran
choisit alors « Hors de Suisse ».`, `Latitude`, `Longitude`, et `Exemple : latitude 48.8566 et
longitude 2.3522 pour Paris.` Une localité envoyée avec deux autres nombres, ni sa position ni
  celle qui est enregistrée, s'efface devant eux : c'est la position tapée qui compte, avec les
  contrôles de « Hors de Suisse », et l'écran revient avec cette case cochée et le repli ouvert.
  Jusqu'à l'étape 19, le serveur gardait la localité et demandait de choisir « Hors de Suisse ».
- Avec JavaScript, les replis restent ouverts pendant la frappe, et un repli que la personne ferme
  reste fermé. Jusqu'au lot 6 de l'étape 18, chaque touche dans Latitude ou Longitude refermait
  `Hors de Suisse`, et une lettre dans la recherche refermait `Méthode de calcul`.
- Le repli `Méthode de calcul, école et ajustements (facultatif)` : `Méthode de calcul`, avec les
  méthodes par leur nom (`Ligue islamique mondiale`…) et l'aide qui dit qu'elle fixe le Fajr et
  l'Isha ; `École pour l'heure de l'Asr` ; `Règle pour les nuits courtes de l'été`, avec la règle
  habituelle pour la position ; `Ajustement par prière, en minutes`, avec `Exemple : 2 retarde la
prière de deux minutes, -2 l'avance de deux minutes.`
- `Voir l'aperçu`, puis `Aperçu des sept prochains jours`, `Calculé avec ce que vous venez de
choisir, sans rien enregistrer. Comparez avec le panneau de votre organisation, puis enregistrez.`
  La marque `le lendemain` pour une Isha après minuit. Puis `Enregistrer`.

## Importées depuis un fichier

- `Un fichier CSV, une ligne par jour : une colonne pour la date, et une pour chacune des cinq
prières. […] Taille acceptée : 512 Ko.`
- Un tableau `Exemple` d'une ligne, puis le repli `Le format en détail` : les noms de colonnes, les
  dates (`21.09.2026, 21/09/2026 ou 21-9-2026`), les heures, le fuseau, les encodages.
- `Télécharger un modèle des soixante prochains jours`, avec son aide.
- `Votre fichier` (`Un fichier au format CSV, par exemple horaires-2027.csv.`), `Si les dates sont
écrites en chiffres seuls` (`Deviner (recommandé)` par défaut), `Année du fichier` et
  `Mois du fichier`, puis `Lire le fichier`.
- `Ce que nous avons lu dans ce fichier :` l'encodage et le séparateur, les jours
  (`365 jours, du 01.01.2027 au 31.12.2027.`), les jours manquants, les lignes refusées et ce qu'il
  faut vérifier, chacun dans la langue de l'écran, avec ses dates en `JJ.MM.AAAA`.
- `Aperçu : les sept prochains jours du fichier` (ou `les sept premiers jours du fichier`), puis
  `Rien n'est encore enregistré. […]` et `Enregistrer ces 365 jours`.
- `Retirer des jours importés` : `Premier jour à retirer`, `Dernier jour à retirer`,
  `Retirer ces jours`.

## Saisies à la main

- `Une période, c'est ce que vous affichez sur votre panneau pendant quelques semaines ou toute
l'année : un nom, des dates, et pour chaque prière l'heure affichée et l'heure de l'iqama. […]`,
  la règle des chevauchements, le lien vers les `sessions du vendredi`, et l'avertissement
  `Ramadan :` dans la langue de l'écran.
- Chaque période : `Du 01.11.2026 au 28.02.2027` ou `À partir du 01.11.2026, jusqu'à nouvel ordre`,
  un tableau `Prière`, `Heure affichée`, `Iqama` (`10 min après`), les boutons
  `Copier pour l'année suivante` et `Supprimer`, et le repli `Modifier cette période`. Une copie
  porte `dates à vérifier` jusqu'à ce qu'elle soit enregistrée.
- `Ajouter une période`, ouvert quand il n'y en a aucune : `Nom de la période` (`Exemple : Hiver
2027, ou Ramadan 2027.`), `Premier jour`, `Dernier jour` (`Laissez vide pour « jusqu'à nouvel
ordre ».`), `Heures affichées`, `Iqama` (`Heure fixe` ou `ou minutes après`, jamais les deux).
- `Voir l'aperçu`, puis `Aperçu des sept prochains jours avec cette période` et `Rien n'est encore
enregistré.` : la période est écrite, les jours relus, puis tout est annulé. Une période qui
  commence après les sept prochains jours montre ses sept premiers jours et le dit ; plus courte
  que sept jours, elle est montrée en entier, avec sa durée. Une période déjà terminée montre les
  sept prochains jours, qu'elle ne couvre pas, et le dit depuis l'étape 19 : `Cette période s'est
terminée le 28.08.2026 : elle ne change aucun des sept prochains jours, que l'aperçu montre.` Puis
  `Enregistrer cette période`. Le titre de l'aperçu est de niveau 4 sous le nom d'une période enregistrée, et de niveau 3 pour
  une nouvelle période, dont `Ajouter une période` n'est qu'un repli : sans aucune période, la page
  passait de h2 à h4 (axe, « heading-order », corrigé à l'étape 19, D5).

## Les messages

Les réussites et les erreurs sont dans la langue de l'écran, par exemple
`Cette localité n'est pas dans la liste. Cherchez-la de nouveau.`,
`Cette position n'est pas sur Terre : la latitude va de -90 à 90, la longitude de -180 à 180.`,
`Donnez le premier jour de la période.` Avant l'étape 18 :
`Donnez une date de début, au format AAAA-MM-JJ`.

## Ce qui reste à reprendre

Une saisie en écriture arabe ne trouve aucune localité, par choix : la liste n'a pas de noms arabes,
et l'écran arabe dit de taper le nom ou le NPA en lettres latines.
