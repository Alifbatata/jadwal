# ADR 0007 : Langues et traductions

## Contexte

`jadwal` publie le programme des cours d'une organisation à partir d'une seule saisie des
responsables, vers quatre sorties : widget, page publique, flux ICS et messages WhatsApp (voir
`docs/CADRAGE.md`).
Deux questions de langue se posent, distinctes l'une de l'autre :

- la langue de l'interface du côté public (libellés, navigation) ;
- la langue du contenu saisi par les responsables pour un cours, comme le titre et la description.

Le champ « langue(s) d'enseignement » d'un cours indique dans quelle(s) langue(s) le cours est
donné ; il ne relève pas du présent ADR.

La feuille de route place la page publique en 4 langues à l'étape 5 et renvoie la pré-traduction
automatique, validée par le responsable, à « plus tard », après l'étape 8. À l'étape 0, aucune
dépendance n'est ajoutée sans besoin immédiat.

## Décision

- L'interface du côté public est proposée en quatre langues : `fr`, `de`, `it` et `ar`.
- L'arabe est affiché en RTL complet, avec des chiffres latins.
- Chaque cours a une langue source obligatoire, dans laquelle son contenu est saisi.
- Les traductions du contenu dans les autres langues sont optionnelles.
- Lorsqu'une traduction manque dans la langue d'interface demandée, le contenu du cours est affiché
  dans sa langue source (repli).
- La page publique est livrée dans les quatre langues à l'étape 5 de la feuille de route.
- La pré-traduction automatique, validée par le responsable, est reportée à « plus tard » : elle ne
  fait pas partie des étapes 0 à 8.

## Conséquences

- Plus simple : un responsable peut publier un cours sans le traduire ; grâce au repli, un cours est
  toujours affichable dans chacune des quatre langues d'interface.
- Plus simple : aucune traduction automatique n'est intégrée en V1, donc aucune dépendance n'est
  ajoutée pour cela.
- Plus contraignant : l'interface publique est conçue pour le RTL complet dès le départ, et les
  nombres affichés en arabe (heures, dates) utilisent des chiffres latins.
- Plus contraignant : chaque cours porte sa langue source et ses éventuelles traductions ; leur
  stockage relève du schéma de base, qui arrive à l'étape 2.
- À accepter : une page peut mélanger la langue d'interface et la langue source d'un cours non
  traduit.
- Reporté : la pré-traduction automatique validée par le responsable, après l'étape 8.
- Non fixé ici : l'outillage de traduction ; aucune bibliothèque n'est retenue à l'étape 0.

## Addendum du 2026-09-26 : cinq langues, partout

Les tests du chef de projet, à l'étape 18, ont posé une règle : une personne qui ne connaît rien au
service doit tout comprendre seule, dans sa langue. Or l'interface publique parlait quatre langues,
et l'espace des responsables, le super-admin et les courriels n'en parlaient qu'une, le français.

**Cinq langues, et la même liste pour tout le service** : `fr`, `de`, `it`, `en`, `ar`, dans cet
ordre. L'anglais est l'anglais britannique (`programme`, `organisation`, `cancelled`). La liste
vaut pour la page publique, le widget, le flux agenda, les pages d'erreur, l'espace des
responsables, le super-admin, les courriels et les messages prêts à coller. Elle est écrite une
fois, `LANGUES` de `apps/web/src/lib/i18n.ts`. La base tient la même liste à deux endroits : les
langues qu'une organisation publie (`PUBLIC_LANGUAGES`, migration 0062) et la langue d'un compte
(`ACCOUNT_LANGUAGES`, migration 0060, ADR 0046).

**L'arabe se lit de droite à gauche, partout.** `<html lang dir>` suit la langue de chaque écran,
les marges sont des propriétés logiques (`margin-inline-start`), et ce qui reste de gauche à droite
le dit : une adresse électronique, une adresse web, un fuseau horaire, un code à coller. Un nom
saisi par une personne est isolé (`<bdi>`, `dir="auto"`), pour qu'un nom latin ne se retourne pas
dans une page arabe.

**Les chiffres restent latins dans les cinq langues**, l'arabe compris, comme la décision
d'origine le voulait pour le côté public. Seules les règles du pluriel viennent d'`Intl` ; jamais
l'écriture du nombre.

**Les dates lues par une personne s'écrivent `JJ.MM.AAAA`**, comme en Suisse, dans les cinq
langues : écrans, courriels, messages, page publique. Le nom du jour peut la précéder
(« samedi 26.09.2026 » ; l'allemand met une virgule après le jour). Deux fonctions les produisent,
`numericDate` et `longDate` de `apps/web/src/lib/i18n.ts` ; aucun écran n'écrit une date d'une
autre façon. L'API
publique et les flux agenda gardent `AAAA-MM-JJ` : ce sont des formats d'échange, pas des textes.

**Les textes de l'espace sont rangés par écran**, un dictionnaire par écran dans
`apps/web/src/lib/i18n/`, avec les cinq langues côte à côte. TypeScript refuse une langue ou une
clé qui manque. Un test refuse une phrase française restée dans une autre langue, un tiret
cadratin et un chiffre arabe oriental. La marche à suivre pour un écran nouveau est dans
`apps/web/src/lib/i18n/LISEZMOI.md`. Comment l'espace choisit sa langue est l'objet de
l'ADR 0047.

**Ce qui reste en français.** Les conditions d'utilisation : c'est un texte juridique, relu en
français, que chacun accepte tel quel. Dans les quatre autres langues, une phrase en tête dit que le
texte n'existe qu'en français pour le moment.

**Les messages prêts à coller** s'écrivent dans chacune des langues que l'organisation publie : ce
sont celles que lit sa communauté. Le programme de la semaine commence par la langue par défaut de
l'organisation ; une annulation ou un déplacement, par la langue source du cours. Un titre traduit
prend sa traduction, sinon il garde sa langue source, comme sur la page publique.

**Le correcteur relit les cinq langues**, l'anglais avec LanguageTool en anglais britannique
(`pnpm orthographe`).

### Conséquences

- Les ADR 0005, 0027, 0029, 0033 et 0042 comptaient quatre langues ; depuis l'étape 18, il y en a
  cinq. Pour une organisation qui publie l'anglais, son plan de site compte une entrée de plus par
  page, et chaque entrée une annotation `hreflang` de plus.
- Le widget a changé une fois pour accepter `lang="en"`, et sa version publiée avec lui.
- Une organisation active l'anglais depuis l'écran des réglages ; la base refuse toute langue hors
  des cinq.
- Tout texte nouveau de l'espace s'écrit dans les cinq langues, dans le dictionnaire de son écran.
  Les textes arabes, allemands et italiens écrits à l'étape 18 attendent encore la relecture d'un
  locuteur.

## Statut

Accepté, 2026-09-19. Étape 5 de la feuille de route (page publique en 4 langues) ; pré-traduction
automatique reportée à « plus tard ». Complété le 2026-09-26 : cinq langues pour tout le service,
dates `JJ.MM.AAAA`, conditions en français (voir l'addendum).
