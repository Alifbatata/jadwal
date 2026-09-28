# Les textes de l'espace des responsables

Ce dossier range les textes des écrans de l'espace des responsables et du super-admin, dans les
cinq langues du service : français, allemand de Suisse, italien, anglais britannique et arabe, de
droite à gauche. Les pages publiques ont les leurs dans `../i18n.ts`.

## Le contrat

- Un fichier par écran, qui exporte un objet `Translations<T>` (voir `space.ts`) : une clé par
  langue, `fr`, `de`, `it`, `en` et `ar`, et dans chacune les mêmes textes. TypeScript refuse de
  compiler si une langue manque, si une clé manque dans une langue, ou si une langue en porte une de
  trop.
- `common.ts` porte ce que plusieurs écrans partagent : la navigation, les boutons de la coquille, la
  bannière du super-admin, le choix de la langue, les rôles et les erreurs communes. Un chantier ne le
  modifie pas pour ajouter ses propres textes : il les range dans son fichier.
- `formatting.ts` porte les formes dont `../format.ts` a besoin : rythme, horaire, durée, publics.
- `language.ts` dit d'où vient la langue d'un écran, dans cet ordre : la langue demandée par
  l'adresse (`?lang=`), celle du compte, celle retenue sur ce navigateur par le choix de la langue,
  celle du navigateur, et le français. Il dit aussi ce que devient un choix fait avant la connexion :
  il devient la langue du compte à la connexion, même si le compte en avait une ; ensuite, le compte
  fait foi (`languageForTheAccount`).

## Ajouter les textes d'un écran

1. Créer `src/lib/i18n/<écran>.ts` sur le modèle de `sign-in.ts` : une interface qui décrit les
   textes d'une langue, puis l'objet des cinq langues. Le nom du fichier et les identifiants sont en
   anglais : `members.ts`, `membersTexts`.
2. Dans la page, lire la langue dans les données de la coquille, sans rien charger d'autre :

   ```svelte
   <script lang="ts">
   	import { membersTexts } from '$lib/i18n/members.js';

   	let { data } = $props();
   	const text = $derived(membersTexts[data.language]);
   </script>

   <h1>{text.title}</h1>
   ```

   `data.language` est posé par `routes/+layout.server.ts` pour chaque écran de l'espace, erreurs
   comprises (`page.data.language` dans `+error.svelte`).

3. Dans un chargement ou une action, la langue est `locals.langue`, que `hooks.server.ts` pose
   avant tout le reste. Une action rend le nom d'une erreur, jamais sa phrase :
   `fail(400, { error: 'notMember' })`, et la page l'écrit dans sa langue.
4. Rien d'autre à modifier. Le correcteur (`pnpm orthographe`), le contrôle de style
   (`node scripts/controle-style.mjs`) et `dictionaries.test.ts` prennent tous les fichiers de ce
   dossier par motif. Les deux premiers ne lisent que les fichiers suivis : un fichier nouveau doit
   être ajouté (`git add`) pour être relu.

## Ce qui existe déjà, à ne pas traduire une seconde fois

- `../i18n.ts` : le nom de chaque langue écrit dans cette langue (`NOM_DE_LANGUE`), les jours, les
  mois, les publics, le lien des conditions (`terms`), et les dates : `numericDate` écrit
  `26.09.2026`, et `longDate` y ajoute le nom du jour. Une date ne s'écrit pas ailleurs, et aucune
  ne s'affiche comme la base l'écrit.
- `../public/affichage.ts` : les noms des prières et des langues d'enseignement, les listes
  (`joindre`), et la place d'un cours par rapport à sa prière, « 15 min avant Maghrib » compris.
- `../format.ts` : chaque fonction prend la langue en dernier paramètre, par exemple
  `describeTiming(timing, data.language)`. Sans langue, elle rend le français d'avant l'étape 18, mot
  pour mot.
- `space.ts` : `plural(langue, nombre, formes)` accorde un mot à un nombre, les six formes de l'arabe
  comprises. Le nombre reste en chiffres latins.
- Les courriels ont leurs textes dans `../server/mail/messages.ts`, et partent dans la langue de la
  requête (`../server/mail/language.ts`).

## Écrire les textes

- Des phrases courtes, que comprend une personne qui ne connaît rien au service. Chaque champ et
  chaque bouton a un libellé clair, une phrase d'aide quand ce n'est pas évident, et un exemple
  quand il en faut un.
- Allemand de Suisse : `ss`, jamais la lettre eszett, et le vouvoiement. Italien : le tutoiement,
  comme la page publique. Anglais britannique : `programme`, `organisation`, `cancelled`. Arabe :
  chiffres latins (ADR 0007).
- Pas de tiret cadratin, et aucun des mots que refuse `scripts/controle-style.mjs`. Une adresse
  d'exemple s'écrit sur `example.org`, jamais sur un domaine qui peut appartenir à quelqu'un
  (`exemple.ch`) : le même contrôle le refuse, comme `dictionaries.test.ts`.
- Chaque texte se range sous la clé de sa langue : le correcteur relit ce qui est sous `de:` en
  allemand. Pas de ternaire sur la langue, et aucun code de langue écrit dans un texte : le correcteur
  le lirait comme un mot.
- Un nom d'organisation ou une adresse électronique va dans `<bdi>` : il garde son sens au milieu
  d'une phrase arabe.
- En français, « de » devant un nom d'organisation ou de cours passe par `deDevant` de `../i18n.ts`,
  qui rend « d’ » devant une voyelle : `l’espace d’Organisation d’essai`. Jamais devant un « h », et
  devant un « y » seulement quand une consonne le suit. Un texte qui écrit « de » en dur devant un
  nom se trompera un jour sur deux.

## L'arabe, de droite à gauche

`hooks.server.ts` écrit `lang` et `dir` sur `<html>`. Dans les feuilles de style, des propriétés logiques
(`margin-inline-start`, `padding-inline-end`, `border-inline-start`, `text-align: start`), jamais
`left` ni `right`. Un texte qui reste en français, comme les conditions, porte `lang="fr"` et
`dir="ltr"`.

## Éprouver un écran

`tests/textes-lus.ts` donne trois fonctions : `visibleText`, le texte qu'une personne lit,
`textSegments`, ses morceaux, et `frenchLeft`, les phrases françaises restées telles quelles dans une
autre langue. `tests/espace-en-cinq-langues.test.ts` montre comment servir un écran dans chaque
langue : par le cookie du choix avant la connexion, par la langue du compte après.
`tests/choix-de-la-langue.test.ts` suit un navigateur qui garde ses cookies d'une réponse à l'autre,
pour éprouver ce que devient un choix à la connexion.

Un contrôle qui ne peut pas tomber ne prouve rien. Chercher une date `2026-09-26` sur un écran qui
n'affiche aucune date passe avant comme après la traduction : c'est un garde-fou pour la suite, pas
la preuve du travail fait. Chaque test ajouté est montré en échec avant la correction ; s'il porte
sur un comportement déjà juste, par un mutant posé le temps d'un passage, puis retiré.
