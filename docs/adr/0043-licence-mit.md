# ADR 0043 : jadwal passe sous licence MIT

> Cette décision **remplace l'ADR 0001**, qui plaçait le dépôt sous `AGPL-3.0-or-later` avec le widget
> en MIT. L'ADR 0001 n'est pas réécrit : ce qu'il a décidé, il l'a décidé, et ses raisons valaient
> pour son moment.

## Contexte

L'ADR 0001 avait deux licences pour une seule raison : le widget est un script que les sites des
organisations collent chez eux, et l'AGPL aurait fait douter quiconque le colle. Le reste du dépôt
restait sous AGPL parce que, en 2026-09-19, la question posée était « comment empêcher qu'un tiers
exploite le service sans rendre ses modifications ».

Un an d'usage ne s'est pas écoulé, mais deux faits ont changé la question.

**Le premier est que la double licence coûte à chaque fichier.** Deux textes, deux en-têtes, deux
phrases à écrire dans le `README`, dans le `CONTRIBUTING`, dans le cadrage, dans le manifeste de
chaque paquet. Chaque fois que la frontière bouge, elle bouge à six endroits, et elle a déjà
bougé une fois, à l'étape 6, quand le widget a cessé de rendre les vues.

**Le second est que l'AGPL n'a jamais eu le rôle qu'on lui prêtait ici.** Ce qui protège le projet
n'est pas la réciprocité : c'est le CLA. C'est lui qui permet à l'auteur de proposer le service sous
d'autres conditions à des organisations payantes pour financer un service qui reste gratuit, et il
continue de jouer ce rôle, mot pour mot, sous MIT.

## La question

Garder deux licences pour une raison qui n'en a plus qu'une moitié ? Ou une seule, permissive, au
prix de la réciprocité ?

## Décision

**MIT pour tout le dépôt, widget compris.**

`LICENSE` porte le texte MIT exact publié par SPDX, en anglais, avec le même titulaire et la même
année que l'avis précédent. `packages/widget/LICENSE` en garde une copie, parce que ce paquet se lit
seul par qui colle le script sur son site.

### Ce que nous abandonnons, et c'est réel

Quiconque peut désormais faire tourner une version modifiée de jadwal en service réseau sans en
proposer le code. L'AGPL l'interdisait, MIT l'autorise. Ce n'est pas un détail, et la décision est
prise en le sachant.

Trois raisons de l'accepter. Le produit s'adresse à des associations, des écoles et des clubs, pas à
des hébergeurs ; le scénario redouté demande à quelqu'un de vouloir exploiter un service gratuit. Le
CLA, lui, garde intact ce qui finance le projet. Et une licence permissive lève le dernier doute de
l'organisation qui hésite à installer chez elle.

### Ce que cela a demandé avant d'être possible

**L'image de production ne devait plus contenir de code à réciprocité.** Ce n'était pas le cas :
elle portait `lightningcss`, sous MPL-2.0.

La MPL n'interdisait rien. C'est une réciprocité **par fichier** : elle laisse distribuer l'ensemble
sous d'autres conditions, et n'oblige qu'à garder ouverts les fichiers MPL modifiés. Mais annoncer
« ce dépôt est sous MIT » pendant que l'image embarque du MPL est une phrase qu'un lecteur attentif
relève, et il a raison de la relever.

La cause était un accident d'empaquetage, mesuré à l'étape 13 : `better-auth` déclare
`@sveltejs/kit`, `svelte`, `vitest` et `drizzle-kit` en **pairs facultatifs**, pnpm les résout depuis
ce que le dépôt contient déjà, et l'arête entre dans la fermeture de production. `vite` arrive avec
eux, et `vite` tire `lightningcss`. L'image portait ainsi un cadre de tests, deux compilateurs et un
empaqueteur : 193 paquets, 237 Mio, dont rien n'est chargé à l'exécution.

`ignoredOptionalDependencies` n'y suffit pas, et c'est mesuré : ce réglage refuse d'**installer** un
pair facultatif absent, il ne refuse pas d'en lier un présent.

`scripts/elaguer-arbre-de-production.mjs` ne garde donc que ce qu'un `import` résolu par Node peut
atteindre, en descendant de `package.json` en `package.json` et en ne suivant jamais un pair. Il
reste **60 paquets et 73 Mio**, et aucune licence à réciprocité : 47 MIT, 4 Apache-2.0, 2 `0BSD`,
1 BSD-3-Clause, 1 MIT-0, 1 Unlicense.

**Ce n'est pas une analyse statique des imports**, et un module chargé par un nom calculé lui
échapperait. C'est pourquoi `scripts/eprouver-image.mjs` construit l'image, lève une base, joue les
rôles et les migrations avec les scripts de l'image, lance son serveur et l'interroge. L'élagage
n'est pas cru sur parole.

### L'avis des licences tierces

MIT, BSD et Apache demandent toutes la même chose : conserver l'avis de copyright et le texte de la
licence. Le regroupement de SvelteKit retire les commentaires du code ; sans rien, ces avis
disparaîtraient de ce qui est distribué.

`LICENCES-TIERCES.md` est **engendré** à la construction, sur le contenu réel de l'image et non sur
l'arbre du poste, et livré dans l'image. Il recopie le texte entier de chaque licence, le `NOTICE`
quand il existe, et — pour une licence à réciprocité par fichier, s'il en revenait une — le lien vers
le code source.

### Ce qui reste dans l'image, et qu'on garde

`better-auth` emporte six adaptateurs de base de données dont un seul sert : `Prisma`, `Mongo`,
`Kysely`, mémoire et les autres restent, alors que jadwal parle à PostgreSQL par Drizzle.

Ce sont des dépendances **ordinaires** de `better-auth`, pas des pairs facultatifs : l'élagage
les garde, et il a raison. Les retirer demanderait de décider qu'on sait mieux que le paquet ce
dont il a besoin, et de le décider à nouveau à chaque mise à jour. **Ils restent.** Ce qu'ils coûtent est
du disque, et il se compte en mégaoctets ; ce que coûterait une liste d'exceptions à tenir se
compte en pannes.

## Conséquences

- Une seule licence, une seule phrase à écrire, une frontière de moins à tenir.
- L'image passe de 237 Mio à environ 73 Mio, et de 193 paquets à 60. C'est du disque, mais c'est
  surtout de la surface d'attaque en moins : un compilateur dans une image de production est un
  outil offert à qui y entre.
- Le `Dockerfile` porte l'étiquette OCI `org.opencontainers.image.licenses`, parce qu'elle décrit le
  contenu de l'image ; la CI garde `source` et `revision`, qui décrivent la construction.
- L'historique git garde ses commits sous AGPL. Ils restent exacts pour leur date, et ils ne sont
  pas réécrits.

## Addendum du 2026-09-26 : une exception, la liste des localités suisses

Depuis l'étape 18, l'écran des heures de prière laisse une personne responsable choisir la localité
de son organisation par son nom ou son code postal. La liste vient du **Répertoire officiel des
localités avec le code postal et le périmètre**, de l'Office fédéral de topographie swisstopo. Elle
est dans le dépôt, réduite à ce qui sert, dans `apps/web/src/lib/server/localites/localities.csv`,
et le serveur l'embarque : aucun service extérieur n'est appelé, ni au moment du choix ni plus tard.

**Ce fichier n'est pas sous MIT, et ses données ne sont pas à Voltia.** Il reste soumis aux
conditions d'utilisation des données géographiques gratuites de swisstopo (version du 1er mars
2021), qui permettent de l'utiliser, de le transformer et de le redistribuer, même à des fins commerciales, à
une condition : citer la source, sur toute représentation et quand les données sont transmises.
La licence a été vérifiée avant d'embarquer la liste ; l'adresse des conditions, l'empreinte du
fichier téléchargé et la marche à suivre pour le refaire sont dans le `README.md` de ce dossier.

La source est citée à quatre endroits :

- **dans le fichier lui-même**, par ses lignes d'en-tête, que le générateur
  (`scripts/localites-suisses.mjs`) écrit à chaque fois ;
- **dans l'image de production** : `scripts/licences-tierces.mjs` recopie ces lignes dans
  `LICENCES-TIERCES.md`, sous « Données tierces », dès que le serveur construit contient la liste.
  C'est la transmission dont parlent les conditions ;
- **à l'écran, près du choix de la localité**, dans la langue de l'espace, sous l'une des formes
  que swisstopo accepte (`©swisstopo` pour l'arabe, qui n'a pas de forme à lui) ;
- **dans `README.md` et `COPYRIGHT`**, là où la licence du dépôt est donnée, avec la mention à
  reprendre : « Source : Office fédéral de topographie swisstopo ».

**Les déclarations de licence le disent aussi.** Le paquet qui contient la liste,
`apps/web/package.json`, déclare `MIT AND LicenseRef-swisstopo-OGD`, et l'étiquette OCI de l'image
porte la même expression (`Dockerfile`). La spécification OCI demande une expression SPDX ; les
conditions de swisstopo n'ont pas d'identifiant SPDX, d'où le préfixe `LicenseRef-`, dont `COPYRIGHT`
dit ce qu'il désigne. `scripts/eprouver-image.mjs` vérifie l'étiquette et la section « Données
tierces » de l'image construite. Le `package.json` de la racine, qui ne contient pas la liste, dit
toujours `MIT`.

Le reste de la décision ne change pas : tout le code, widget compris, est sous MIT.

## Addendum du 27.09.2026 : la liste une seule fois, sans carte de sources

La section « Données tierces » cite la source de la liste des localités, mais l'image la portait
trois fois : dans le serveur construit, dans la carte de sources de ce fichier, qui recopie le
source entier, et dans `.svelte-kit`, la sortie intermédiaire que `pnpm deploy` recopiait avec le
paquet. Le `Dockerfile` retire `.svelte-kit`, et l'élagage retire toutes les cartes de sources de
l'arbre déployé, 1 384 fichiers et 18,2 Mio au passage de l'étape 19 : aucune n'est lue à
l'exécution. `scripts/eprouver-image.mjs` vérifie qu'il n'en reste aucune, et que la liste n'est
plus dans l'image qu'une fois.

## Addendum du 27.09.2026 : pas de CLA, les contributions arrivent sous MIT

À l'étape 19, le chef de projet a décidé qu'il n'y aura pas d'accord de contribution. Une
contribution arrive sous la licence du dépôt, MIT, comme le code qu'elle modifie. La liste des
localités suisses reste l'exception : une contribution qui la touche reste sous les conditions de
swisstopo, comme la liste elle-même.

Ce que le CLA devait garder, la licence MIT le permet déjà à chacun, l'auteur compris : utiliser le
code, le modifier et le distribuer sous d'autres conditions, à la seule charge de garder l'avis de
droit d'auteur et le texte de la licence. Proposer le service sous d'autres conditions à des
organisations payantes, pour financer un service qui reste gratuit, ne demande donc aucun accord de
plus. Il n'y a ni texte à signer, ni outil de signature à choisir.

Le contexte et les raisons plus haut, qui comptaient sur le CLA, sont gardés tels qu'ils ont été
écrits. `CONTRIBUTING.md`, le `README` et le cadrage disent la règle d'aujourd'hui.

## Ce que cette décision ne dit pas

Elle ne disait rien du CLA, qui ne changeait pas ; l'addendum du 27.09.2026 l'abandonne. Elle ne
dit rien d'un changement de licence futur : une bascule de MIT vers une licence à réciprocité
serait possible pour le code à venir, jamais pour ce qui a déjà été publié.
