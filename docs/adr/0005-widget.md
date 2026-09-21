# ADR 0005 : Widget

> **Révisé le 2026-09-21, à l'étape 6.** La décision d'origine — un composant qui redessine les
> trois vues dans la page de la mosquée — est remplacée par celle-ci : **le widget pose un cadre qui
> affiche la page publique**. Le texte d'origine est conservé plus bas, sous « Ce qui a été décidé en
> 2026-09-19 », parce qu'un ADR qu'on réécrit sans laisser de trace n'apprend rien à personne.

## Contexte de la révision

À l'étape 0, le widget était le premier des quatre débouchés du cadrage et rien n'existait à côté :
il fallait bien qu'il dessine quelque chose. À l'étape 5, la page publique est livrée — trois vues,
quatre langues, filtres par public, dix kilo-octets, aucun JavaScript, aucune ressource d'un autre
domaine, et `frame-ancestors` déjà ouvert pour `/m/**`.

Redessiner les mêmes vues dans le widget reviendrait alors à écrire une seconde fois ce qui existe.

## Décision

**Le widget pose un cadre vers la page publique, et lui donne la hauteur de son contenu.**

`<jadwal-widget org="...">` insère une `<iframe>` vers `/m/<identifiant>[/<langue>]?embed=1`, écoute
un message qui annonce la hauteur, et ajuste le cadre. Il ne dessine aucune vue, ne lit aucune
donnée, n'écrit rien nulle part.

### Pourquoi, et l'ordre des raisons compte

1. **Le confinement.** C'est la raison décisive, et ce n'est pas celle qu'on cite en premier
   d'habitude. Injecter notre HTML dans la page de la mosquée le ferait tourner dans **son** origine :
   une faute d'échappement chez nous deviendrait une injection chez elle. Un cadre enferme toute
   erreur dans notre origine. Une page publique affiche du texte saisi par des responsables ; tôt ou
   tard, une faute d'échappement arrivera, et il faut qu'elle reste chez nous.
2. **Une seule implémentation.** Deux rendus des mêmes vues divergent, c'est une certitude et non un
   risque. Ce que voit le visiteur du site de la mosquée est exactement ce que voient les tests de
   l'étape 5.
3. **Le poids.** Le fichier est chargé sur le site de chaque mosquée. Le widget de l'étape 0, un
   composant Svelte 5 **vide** qui affichait deux mots, pesait 12,48 Kio gzip : c'était le moteur de
   rendu, pas le composant. Celui-ci pèse **1,71 Kio gzip**, mesurés, parce qu'il n'a plus rien à
   rendre — et il est donc écrit en TypeScript pur, sans dépendance à l'exécution.

### Ce que cela coûte, et il faut le dire

- **Le contenu n'est pas indexé sur le domaine de la mosquée.** Un moteur de recherche rattache le
  contenu d'un cadre à l'adresse de son `src`, pas à la page qui l'accueille. La mosquée garde un
  lien visible vers `/m/<identifiant>`, qui est indexable et qui porte les liens entre langues
  (ADR 0029). Pour un programme de cours, dont les visiteurs arrivent par un message WhatsApp, une
  bio Instagram ou un QR code imprimé, c'est un coût faible — mais c'en est un.
- **Rien n'est hérité à travers un cadre** : ni la police du site, ni ses couleurs, ni son thème
  sombre. Le programme s'affiche comme une carte posée sur la page, pas comme une greffe. L'écran
  « Partager » le dit en une phrase au responsable, plutôt que de le lui laisser découvrir.
- **L'historique du navigateur.** Une navigation ordinaire dans un cadre ajoute une entrée à
  l'historique du **site hôte** : mesuré sur Chrome 153, trois clics dans le widget et le bouton
  « précédent » du visiteur ne sort plus de la page de la mosquée. C'est le défaut le plus reproché
  aux intégrations par cadre. Le mode intégré navigue donc **par remplacement** (`location.replace`),
  ce qui n'ajoute rien — au prix assumé de ne plus avoir de « précédent » à l'intérieur du widget.
- **Une ancre interne ne fait rien** dans un cadre dimensionné à son contenu : il n'y a plus rien à
  faire défiler à l'intérieur, et le navigateur ne fait pas défiler la page hôte. Les pages
  publiques n'ont aujourd'hui aucun lien d'ancre ; il ne faut pas en ajouter.
- **Un site peut bloquer le cadre** par sa propre politique de sécurité du contenu (`frame-src`), et
  cela n'a rien à voir avec l'autorisation du script (`script-src`). `docs/INTEGRATION.md` donne la
  ligne à ajouter, et le pied du widget porte en permanence un lien vers la page publique : quand le
  cadre ne s'affiche pas, il reste quelque chose d'utile.

### La hauteur, et le seul JavaScript d'une page publique

Aucune plateforme ne dimensionne un cadre d'un autre domaine ; `postMessage` reste la seule voie.
La page intégrée charge donc **un** script, et seulement quand `?embed=1` est présent.

- **Un fichier, jamais du code en ligne.** Sur une page `csr = false`, SvelteKit ne déclare aucun
  nonce dans l'en-tête de politique de sécurité du contenu — il n'en pose que pour les balises qu'il
  produit lui-même, et il n'en produit aucune. Un script en ligne y serait bloqué avec ou sans
  nonce. `script-src 'self'` autorise en revanche un fichier de la même origine, sans rien changer.
- **La mesure est la boîte de bordure de `<html>`**, par un `ResizeObserver`, et surtout pas
  `scrollHeight` : dans un cadre, `scrollHeight` vaut au moins la hauteur de la fenêtre, donc au
  moins ce que le parent vient d'imposer. Il ne redescend jamais, et le cadre garderait son vide
  après un changement de langue.
- **Le message part vers `'*'`**, parce que le domaine de la mosquée est inconnu et que la valeur
  par défaut le jetterait en silence. Ce qui part est un nombre de pixels, que quiconque voit le
  cadre connaît déjà.
- **Côté parent, trois vérifications, et rien d'autre n'est traité** : la fenêtre émettrice est
  celle de notre cadre (c'est elle qui fait tout le travail, et qui empêche deux widgets de se
  marcher dessus) ; l'origine est exactement celle du cadre, comparée par égalité stricte
  (`startsWith` accepterait `https://jadwal.example.evil.tld`) ; et la forme du message est le nom
  exact plus un nombre fini. La hauteur est ensuite bornée, et ignorée en deçà de deux pixels
  d'écart — sans quoi une page dont une longueur dépendrait de la hauteur de sa fenêtre bouclerait.
- **La page publique non intégrée ne bouge pas d'un octet de script.** Un test l'affirme toujours,
  et un second affirme que la page intégrée n'en a qu'un.

### Pas de `sandbox` sur le cadre, et pourquoi

Un `sandbox` protégerait le site de la mosquée contre notre propre page. Le scénario est étroit —
il suppose notre page compromise alors que notre script reste honnête — et le coût est réel :
`allow-same-origin` retiré, l'origine des messages devient `"null"` ; sans `allow-popups` ni
`allow-downloads`, les liens `webcal:` de la page d'abonnement échouent en silence, or c'est la
fonction pour laquelle cette page existe. À reprendre à l'étape 8, avec un essai sur vrai appareil.

### Ce que chaque paquet contient

- `packages/widget` (MIT) : la définition de l'élément, la pose du cadre, la réception de la
  hauteur, le pied et son lien. La licence MIT garde tout son sens : c'est ce fichier-là qu'un site
  colle.
- `apps/web` (AGPL-3.0-or-later) : la page publique, son mode intégré et le script d'annonce.

### Les adresses, et l'empreinte d'intégrité

- `/widget/jadwal-widget.js` : l'adresse ordinaire, qui reçoit les corrections sans que la mosquée
  touche à rien. **Aucune empreinte n'est publiée pour elle** : ce serait promettre qu'elle ne
  change jamais.
- `/widget/<empreinte>/jadwal-widget.js` : l'adresse versionnée, immuable, pour les sites qui
  exigent une empreinte d'intégrité. Le segment de version est une empreinte du contenu : il change
  exactement quand le fichier change, sans numéro à incrémenter et sans variable d'environnement à
  oublier. Une adresse qui n'a jamais été publiée répond `404`.
- **Une version publiée est servie pour toujours** (précision de l'étape 7). La décision d'origine
  disait qu'une version « qui n'est plus la nôtre » répondait `404`, en jugeant que c'était le même
  résultat qu'une empreinte périmée. C'est faux, et la différence compte : une empreinte qui ne
  correspond plus donne un widget cassé sur le site d'une mosquée, que personne ne surveille, et qui
  ne se répare qu'en modifiant une page à la main. Retirer une version, c'est donc casser
  volontairement ce qu'on a demandé aux mosquées de coller.

  Chaque construction archive son fichier dans `packages/widget/published/<empreinte>/`, et le
  serveur sert tout ce qui s'y trouve en plus de la version courante. Le coût est de quelques
  kilo-octets par version. `apps/web/tests/widget.test.ts` lit ce dossier sur le disque et exige que
  **chaque** version archivée réponde encore : une version supprimée par mégarde fait échouer la
  suite, ce qu'un test écrit à la main ne ferait pas.

- `crossorigin="anonymous"` accompagne toujours `integrity`. Sans lui, l'empreinte ne dégrade pas :
  elle bloque le script à cent pour cent, et la cause ne se lit qu'en console. La réponse porte donc
  `Access-Control-Allow-Origin: *` et `Cross-Origin-Resource-Policy: cross-origin`.
- L'empreinte se produit à chaque publication par `pnpm --filter @jadwal/widget integrity`, et
  l'écran « Partager » affiche en permanence le code à coller, à jour.

### Ce qui ne change pas de la décision d'origine

- La balise est `<jadwal-widget org="...">`, avec Shadow DOM.
- La sortie est **un seul fichier**, sans aucune dépendance à l'exécution.
- Le widget ne rend aucun HTML saisi : il n'en rend aucun du tout.
- Une mention discrète figure en pied, avec un lien vers la page publique.
- `packages/widget` est sous licence MIT, avec son propre `LICENSE`.

### Ce qui change

- **Le cadre n'est plus le mode de secours, c'est le mode principal.** Le mode de secours est
  désormais le cadre **posé à la main**, sans script, pour un site qui refuse les scripts
  extérieurs ; sa hauteur est alors fixe.
- **Le widget ne reprend plus les trois vues ni les filtres** : il les demande à la page, par ses
  attributs `view` et `audience`.
- **Il n'est plus écrit en Svelte.** Voir la raison 3.
- **La couleur d'accent par organisation** reste au contrat de la page publique, pas du widget :
  c'est la page qui la porte, et le widget n'affiche rien qui puisse la prendre.

## Ce qui a été décidé en 2026-09-19 (remplacé)

- Le widget est la balise `<jadwal-widget org="...">`, un custom element compilé depuis Svelte 5,
  avec Shadow DOM.
- La sortie est un seul fichier JS, `dist/jadwal-widget.js`, utilisable avec une simple balise
  script, sans aucune dépendance à l'exécution.
- Le widget est servi à une URL versionnée, avec une empreinte SRI pour les sites stricts.
- L'iframe est le mode de secours.
- La couleur d'accent est définie par organisation.
- Le widget rend du texte brut uniquement : aucun HTML saisi n'est rendu.
- Le widget reprend les trois vues côté public : Semaine (par défaut), Tous les cours (groupés
  par rythme), Mois (grille, puis liste du jour choisi), ainsi que les filtres par public. Le
  détail d'un cours se déplie sur place, sans modale.
- Il n'y a pas de bibliothèque de calendrier : des listes et une grille CSS.
- Une mention discrète « Proposé gratuitement par ... » figure en pied.
- `packages/widget` est sous licence MIT.

## Conséquences

- Un site intègre le widget en collant une balise de script et l'élément ; la licence MIT lui évite
  tout doute sur ses obligations.
- Ce que voit le visiteur d'un site de mosquée est exactement ce que testent les 24 tests publics de
  l'étape 5 : il n'y a pas de second rendu à maintenir.
- La promesse « aucun JavaScript » de l'ADR 0027 devient « aucun JavaScript, sauf en mode intégré,
  où un cadre ne peut ni se dimensionner ni éviter de polluer l'historique autrement ». Cet ADR est
  amendé en conséquence.
- Le risque ouvert du cadrage — le bloc « Embed Code » du site Odoo de la première mosquée
  exécute-t-il un script extérieur ? — n'est pas levé, et il ne se lèvera qu'en essayant sur ce
  site. Les deux modes de pose sont livrés pour que la réponse, quelle qu'elle soit, ne bloque rien.
- L'ADR 0026 justifiait le CORS ouvert et la limitation de débit par « un widget en appelle trois
  par page ». Ce consommateur n'existe plus : le widget n'appelle plus l'API. Elle reste utile — une
  instance auto-hébergée, un site qui veut ses propres vues — mais son premier client a disparu.

## Statut

Révisé et accepté, 2026-09-21, étape 6 ; précisé le 2026-09-21 (étape 7) sur la conservation des
versions publiées. Remplace la décision du 2026-09-19. Amende l'ADR 0027 (pages publiques) et
complète l'ADR 0029 (référencement).
