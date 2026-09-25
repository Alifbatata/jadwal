# Liste des localités suisses : source, conditions, mention

`localities.csv` est tiré du **Répertoire officiel des localités avec le code postal et le
périmètre** (Amtliches Ortschaftenverzeichnis mit Postleitzahl und Perimeter), établi et publié par
l'**Office fédéral de topographie swisstopo**. Version du **01.09.2026**.

Source : Office fédéral de topographie swisstopo.

Le serveur l'embarque pour une seule chose : une personne responsable choisit la localité de son
organisation par son nom ou son NPA, et le calcul des heures de prière reçoit sa position. Aucun
service extérieur n'est appelé, ni au moment du choix ni plus tard.

## D'où vient le fichier

| Quoi                     | Où                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Page du produit          | https://www.swisstopo.admin.ch/fr/repertoire-officiel-des-localites                                                                     |
| Jeu sur opendata.swiss   | https://opendata.swiss/de/dataset/amtliches-ortschaftenverzeichnis-mit-postleitzahl-und-perimeter                                       |
| Collection STAC          | https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo-vd.ortschaftenverzeichnis_plz                                            |
| Fichier téléchargé       | https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_2056.csv.zip |
| Description des colonnes | « Information sur le produit », janvier 2026, lien depuis la page du produit                                                            |
| Formules de conversion   | https://www.swisstopo.admin.ch/dam/fr/sd-web/KLRCX9XIdXDu/ch1903wgs84-FR.pdf                                                            |
| Conditions d'utilisation | https://www.swisstopo.admin.ch/fr/conditions-utilisation-geodonnees-et-geoservices-gratuit                                              |

Le fichier téléchargé est le CSV en MN95 (EPSG:2056), daté du 01.09.2026 par la collection STAC. Son
empreinte SHA-256 est
`d4f0da3e8e66f775d6af1d860b8fdbfb703956da5c8c82356295c9617601bf73`, la même que celle que la
collection publie (`1220d4f0da3e…`, au format multihash). Le CSV qu'il contient,
`AMTOVZ_CSV_LV95.csv`, compte 5 718 lignes ; le fichier produit en garde 4 073.

Seul le fichier produit est dans le dépôt. Le fichier téléchargé n'y est pas : l'adresse et
l'empreinte ci-dessus suffisent à le retrouver.

## Les conditions d'utilisation

Les géodonnées gratuites de swisstopo sont régies par ses « Conditions d'utilisation des
géodonnées et géoservices gratuits (OGD) », version du 01.03.2021. Leur point 2 dit :

> Les géodonnées et les géoservices gratuits de swisstopo peuvent être utilisés, distribués et
> rendus accessibles. […] ils peuvent être enrichis et transformés et être également utilisés à des
> fins commerciales.
>
> Une indication de la source est obligatoire.

La mention doit figurer sur toute représentation et toute publication, numérique ou sur papier, et
aussi quand les données sont transmises. Les conditions en donnent six formes, au choix :
« Bundesamt für Landestopografie swisstopo », « Office fédéral de topographie swisstopo »,
« Ufficio federale di topografia swisstopo », « Uffizi federal da topografia swisstopo »,
« Federal Office of Topography swisstopo » et « ©swisstopo ».

opendata.swiss classe chaque ressource de ce jeu en « Utilisation libre », qui recommande
d'indiquer la source (auteur, titre et lien vers le jeu de données). jadwal suit la règle la plus
stricte des deux, celle de swisstopo, qui est le fournisseur des données.

Embarquer la liste transformée dans le dépôt public et dans l'image de production est donc permis,
à la seule condition de citer la source. **Ce fichier n'est pas sous la licence MIT du dépôt** : il
reste soumis aux conditions de swisstopo, qui en permettent la redistribution.

## Où la source est citée

- **Dans le fichier lui-même** : ses lignes d'en-tête (`#`) nomment la liste, sa version, la
  source, l'adresse du téléchargement et celle des conditions. `scripts/localites-suisses.mjs` les
  écrit à chaque génération.
- **Dans l'image de production** : `scripts/licences-tierces.mjs` recopie ces lignes dans
  `LICENCES-TIERCES.md`, section « Données tierces », dès que le serveur construit contient la
  liste. C'est la transmission dont parlent les conditions.
- **Sur l'écran où l'on choisit la localité** : `LOCALITIES_SOURCE.credit` donne la mention dans
  chaque langue de l'espace, sous l'une des formes que swisstopo accepte (`©swisstopo` pour
  l'arabe, qui n'a pas de forme à lui). L'écran doit l'afficher à côté du choix.

## Ce que le fichier produit contient

Une ligne par localité et NPA : le NPA, le nom officiel de la localité, la commune, le canton, la
latitude et la longitude.

- Une localité à cheval sur plusieurs communes a une ligne par commune dans la source. Le fichier
  garde celle de la commune qui a le plus d'adresses (colonne `Adressenanteil`), avec son point.
- Le point est, selon la description du produit, « un point quelconque à l'intérieur du périmètre
  de la localité ou du code postal ». Il tombe dans la localité, pas forcément en son centre : à
  l'échelle d'une heure de prière, qui ne bouge que d'une minute pour une vingtaine de kilomètres
  d'est en ouest, la différence ne se voit pas.
- La position est convertie de MN95 en WGS84 par les formules approchées de swisstopo (`lv95.ts`),
  précises au mètre près, puis arrondie à 4 décimales (une dizaine de mètres).
- Le répertoire couvre aussi le Liechtenstein, dont les localités n'ont pas de canton dans la
  source ; le fichier leur donne le code `FL`.

## Refaire la liste

swisstopo publie une version le premier jour de chaque mois. Les localités changent peu : une mise
à jour par an suffit, ou quand une fusion de communes fait parler d'elle.

1. Télécharger le CSV en MN95 depuis la collection STAC (adresse ci-dessus), et relever sa date
   (`datetime` de l'objet `ortschaftenverzeichnis_plz`) et son empreinte (`file:checksum`).
2. Vérifier l'empreinte : `Get-FileHash` sous Windows, `sha256sum` sous Linux.
3. Décompresser : `Expand-Archive` sous Windows, `unzip` sous Linux.
4. Engendrer :

   ```
   node scripts/localites-suisses.mjs AMTOVZ_CSV_LV95/AMTOVZ_CSV_LV95.csv 2026-09-01
   ```

5. Relire le diff de `localities.csv`, mettre à jour la version, l'empreinte et les nombres de ce
   fichier, puis lancer `node scripts/eprouver-localites-suisses.mjs` et les tests de `apps/web`.

Le script refuse un fichier dont les colonnes ont changé, dont une ligne est amputée, ou dont les
points ne sont pas du MN95 en Suisse (le CSV en WGS84 a les mêmes colonnes) : il s'arrête sans rien
écrire.
