# ADR 0027 : Pages publiques — langues, liens et confidentialité

## Contexte

La page publique d'une organisation est le lien qu'elle met dans sa bio Instagram, dans son groupe
WhatsApp et sur ses autres fiches en ligne. Elle est ouverte sur un téléphone, souvent sur un
réseau mobile, par quelqu'un qui veut savoir s'il y a cours ce soir.

Le cadrage en fixe le contenu (trois vues, filtres par public, détail déplié sur place) et
l'ADR 0007 les langues (`fr`, de, `it`, `ar`, l'arabe en RTL complet avec des chiffres latins).
L'ADR 0009 fixe le reste : aucun cookie, aucun traceur, aucune donnée personnelle côté public.

Trois questions restaient ouvertes : où mettre la langue, combien de JavaScript, et jusqu'où ouvrir
la politique de cadre pour qu'une organisation puisse intégrer sa page dans son propre site.

## Décision

### La langue est dans le chemin

`/m/<identifiant>` dans la langue par défaut de l'organisation, `/m/<identifiant>/<langue>` pour les
autres. Jamais un cookie, jamais une détection silencieuse sur l'en-tête du navigateur.

Une langue par lien, partageable telle quelle : quand quelqu'un envoie la page à sa mère qui lit
l'arabe, c'est la version arabe qui s'ouvre. Des liens croisés `hreflang` relient les versions pour
les moteurs de recherche.

Le contenu suit sa propre règle : la traduction si elle existe, sinon la langue source, **sans
mention d'échec**. Un visiteur n'a pas à savoir qu'une traduction manque.

### Aucun JavaScript

`csr = false` sur toutes les routes publiques : SvelteKit n'envoie alors aucun script.

Ce n'est pas une contrainte subie. En listant ce que du JavaScript aurait amélioré — déplier un
détail, changer de vue, filtrer par public — il ne reste rien que HTML ne fasse déjà : `<details>`
pour le premier, des liens pour les deux autres. En ajouter aurait coûté des octets, un nonce, et
une promesse de confidentialité plus difficile à tenir, pour un gain nul.

C'est aussi ce qui rend l'objectif du prompt — moins de cinquante kilo-octets pour une première
visite — atteignable sans discuter : **dix kilo-octets**, police comprise, sur les données de
démonstration.

> **Amendement du 2026-09-21, à l'étape 6.** « Aucun JavaScript » devient « aucun JavaScript, sauf
> en mode intégré ». Quand la page est affichée dans le cadre du widget — et seulement alors, par le
> paramètre `?embed=1` —, elle charge **un** fichier de notre propre origine, qui fait deux choses et
> pas une de plus : annoncer sa hauteur au cadre, et naviguer par remplacement pour ne pas empiler
> d'entrées dans l'historique du site de l'organisation. Aucune des deux ne peut se faire
> autrement : aucune plateforme ne dimensionne un cadre d'un autre domaine, et une navigation
> ordinaire dans un cadre est mesurément ajoutée à l'historique du haut. La page **non** intégrée
> n'a toujours aucun script, et un test l'affirme toujours. Les raisons sont dans l'ADR 0005 révisé.

### Rien d'un autre domaine, y compris les polices

Le texte s'affiche avec les polices du système. Aucune police n'est téléchargée, ce qui est à la
fois plus rapide et exactement la promesse du cadrage : pas une requête ne part vers un autre
domaine. Un test analyse le HTML servi et échoue à la moindre URL externe.

Les pages publiques ne lisent même pas le cookie de session : la route ne consulte pas Better Auth
du tout. C'est structurel plutôt que promis — il n'y a rien à oublier de ne pas lire.

> **Amendement du 2026-09-26, à l'étape 18.** Trois choses changent, et la langue n'en fait pas
> partie : elle reste dans le chemin, jamais devinée, et le côté public ne lit pas les cookies de
> langue de l'espace (ADR 0047). Les langues sont cinq, l'anglais britannique compris (ADR 0007).
> La page d'abonnement et la page d'un cours choisissent le bouton d'agenda selon l'appareil, lu
> dans les en-têtes `Sec-CH-UA-Platform` et `User-Agent`, et leur réponse le dit par `Vary`
> (ADR 0048) : l'appareil ne décide que du bouton montré en premier, et le choix complet reste à un
> lien. Enfin, ces deux pages portent des liens vers Google Agenda et Outlook, que le visiteur
> choisit de suivre, dans un nouvel onglet. La page ne charge toujours rien d'un autre domaine, et le
> test n'admet un lien vers ailleurs que pour ces deux services.

### Le cadre est ouvert, pour ces routes et pour elles seules

`frame-ancestors *` sur `/m/**`, `frame-ancestors 'none'` partout ailleurs.

**Ce que cela ouvre** : n'importe quel site peut afficher la page d'une organisation dans une
`iframe`. C'est précisément l'usage voulu, et il ne demande aucune inscription préalable d'un domaine
chez nous — une organisation colle son programme sur son propre site sans nous écrire.

**Ce que cela n'ouvre pas** : la page n'a ni cookie, ni session, ni formulaire, ni action. Il n'y a
donc rien à détourner par un clic mal placé, et rien qu'un cadre puisse faire qu'un visiteur ne
puisse déjà faire en tapant l'adresse. Une instance qui voudrait restreindre cette ouverture le peut
par `JADWAL_EMBED_ORIGINS`.

### La maquette est écrite avant le code

`docs/maquettes/` porte une description écran par écran : structure, ordre des éléments, libellés
exacts en français, comportements. C'est la référence qui manquait à l'étape 4, où le rapport a dû
reconnaître qu'aucune maquette n'était comparable. Un désaccord entre ces fichiers et le code est un
défaut de l'un ou de l'autre, et il faut trancher.

### Ce que les écrans disent quand il n'y a rien

Quatre phrases distinctes, et la distinction compte : une semaine vide **à cause d'une pause nomme
la pause**. « Aucune séance cette semaine » pendant les vacances scolaires laisse croire à un oubli
de saisie ; « Pas de cours cette semaine : vacances scolaires » répond à la question avant qu'elle
soit posée. Sans motif saisi, la page dit qu'une pause est en cours sans en inventer la raison.

Un cours ancré sur une prière dont l'heure n'est pas connue affiche « Après Maghrib », sans heure et
**sans mention d'un réglage manquant** : c'est l'affaire des responsables, pas celle d'un visiteur.

## Conséquences

- La page se lit sur un téléphone en réseau lent, et elle se lit entièrement sans JavaScript.
- Elle s'intègre dans le site d'une organisation sans configuration de notre côté.
- Elle est indexable : c'est la seule partie du service qui ne porte pas `noindex`.
- Une page par cours existe pour le partage et pour les moteurs, avec ses métadonnées produites côté
  serveur — et échappées comme le reste : une apostrophe dans un titre ne doit pas plus casser une
  balise `meta` qu'un paragraphe.
- Ce que nous perdons en n'ayant aucun JavaScript : un changement de vue recharge la page. Sur une
  page de dix kilo-octets servie depuis le même hôte, c'est imperceptible ; le jour où ce ne le
  serait plus, la décision se rediscutera.
- La vue Mois n'affiche pas les titres dans les cases, seulement un compte. Sept colonnes sur un
  téléphone ne laissent pas la place d'un mot lisible, et un titre tronqué ne se lit pas.

## Addendum du 27.09.2026

Les décisions du chef de projet sur les langues des pages publiques.

- **Les aperçus de partage disent une langue et un pays.** `og:locale` vaut `fr_CH`, `de_CH`,
  `it_CH`, `en_GB` ou `ar_AR`, et non plus `fr` ou `ar`, que le protocole Open Graph ne connaît pas.
  Chaque autre langue que l'organisation publie a sa balise `og:locale:alternate`. La table est
  `LOCALE_DE_PARTAGE`, dans `apps/web/src/lib/i18n.ts`.
- **Trois liens vers des services d'agenda, et non plus deux.** Le choix complet propose aussi
  Outlook pour les comptes de travail ou d'école, `outlook.office.com` (ADR 0048, addendum du même
  jour) : le test admet ces trois domaines pour un lien `<a>` vers ailleurs, et aucune ressource.

## Statut

Accepté, 2026-09-20. Étape 5 de la feuille de route. Met en œuvre les ADR 0007 (langues) et 0009
(vie privée) du côté public. Amendé le 2026-09-21 (le script du mode intégré) et le 2026-09-26
(cinq langues, l'agenda selon l'appareil, deux liens vers des services d'agenda). Complété le
27.09.2026 (addendum ci-dessus).
