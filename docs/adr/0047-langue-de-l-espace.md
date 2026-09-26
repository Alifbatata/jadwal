# ADR 0047 : la langue de l'espace des responsables

- Statut : accepté
- Date : 2026-09-26
- Complète : [0007](0007-langues-et-traductions.md), [0046](0046-editeur-et-responsable-dans-la-base.md)
- Respecte : [0017](0017-invitation-sans-fuite-d-information.md), [0027](0027-pages-publiques.md)

## Contexte

Jusqu'à l'étape 18, l'espace des responsables, le super-admin et les courriels parlaient français,
et rien d'autre. Les tests du chef de projet ont demandé qu'ils parlent les cinq langues du service
(ADR 0007, addendum du 2026-09-26). Il faut donc décider comment un écran de l'espace choisit sa
langue, comment la personne en change, où ce choix est retenu, et dans quelle langue part un
courriel.

Quatre contraintes, déjà posées ailleurs :

- **Le côté public ne lit aucun cookie** et porte sa langue dans son adresse (ADR 0027). Un lien
  public se partage, et il doit s'ouvrir dans la langue de celui qui l'envoie.
- **Aucun chemin d'envoi ne cherche un compte par son adresse** (ADR 0017), ni par le contenu, ni
  par le temps de réponse.
- **Le service ne garde aucune donnée personnelle de plus** qu'il n'en faut (ADR 0009, ADR 0041).
- **Tout marche sans JavaScript**, hors l'enregistrement d'une passkey.

L'espace n'a pas les raisons du côté public de mettre la langue dans l'adresse : personne ne
partage le lien d'un écran de l'espace, et doubler chaque route d'un segment de langue coûterait
cher pour rien.

## Décision

### D'où vient la langue d'un écran

Le serveur la calcule avant tout chargement (`languageOfTheSpace` dans `apps/web/src/hooks.server.ts`,
`spaceLanguage` dans `apps/web/src/lib/i18n/language.ts`), dans cet ordre :

1. `?lang=`, pour la seule page demandée, sans rien retenir. C'est le lien des conditions au pied
   d'une page publique : `/conditions` s'ouvre dans la langue que le visiteur lisait.
2. La langue du compte de la personne connectée (ADR 0046, migration 0060).
3. Le cookie `jadwal_language`, posé par un choix fait dans le formulaire.
4. La meilleure des cinq langues que le navigateur demande (`Accept-Language`) : le poids `q`
   décide, puis l'ordre ; seule la langue principale compte (`de-CH` donne l'allemand).
5. Le français.

Une valeur hors des cinq langues ne compte pas, d'où qu'elle vienne. La langue est écrite sur
`<html lang dir>`, et chaque écran la reçoit par ses données. Le côté public ne passe pas par ici :
il garde la langue de son adresse, et ne lit aucun cookie.

### Comment la personne en change

Un formulaire en tête de chaque écran de l'espace, `POST /langue`, sans JavaScript. Chaque langue y
est écrite dans sa langue (`Français`, `Deutsch`, `Italiano`, `English`, `العربية`), et la langue en
cours est marquée.

- **Connectée**, la personne change la langue de son compte, et le cookie avec elle.
- **Pas encore connectée**, elle pose le cookie `jadwal_language`, et un second cookie,
  `jadwal_language_pending`, qui dit que ce choix attend d'être donné au compte.
- Le formulaire revient sur l'écran d'où il part, sans `?lang=`. Le chemin de retour est vérifié
  deux fois, à l'arrivée et après sa normalisation, et tout ce qui ne reste pas sur le service
  renvoie à l'accueil (`returnPath`). Un envoi depuis un autre site est refusé par SvelteKit. Un
  `GET /langue`, tapé à la main, renvoie à l'accueil.

### Le compte retient la langue

- À sa première requête connectée, un compte **sans langue** reçoit celle que la personne voyait :
  son choix sur ce navigateur, sinon celle de son navigateur, sinon le français. Ses courriels et
  ses autres appareils la gardent ensuite.
- **Un choix fait avant la connexion devient la langue du compte**, même si le compte en avait une :
  c'est la dernière chose que la personne a dite, sur l'écran même de la connexion.
- **Ensuite, le compte fait foi.** Un cookie resté sur un navigateur ne défait pas un changement fait
  depuis sur un autre appareil.
- Une écriture qui échoue ne fait pas échouer la page : la langue n'est qu'une préférence, et le
  cookie d'attente reste, pour une nouvelle tentative à la requête suivante.

### Le choix fait avant la connexion part avec le lien

Quand la personne demande un lien depuis le navigateur qui garde son choix en attente, l'adresse de
retour du lien porte la langue choisie : `/organisations?language=de` (`signInCallback`, dans
`apps/web/src/lib/i18n/language.ts`). La vérification du lien l'écrit sur le compte que le jeton
désigne (`apps/web/src/lib/server/auth.ts`), dans le navigateur qui ouvre le lien, que ce soit
celui de la demande ou l'application de messagerie d'un téléphone. Un cookie de langue sans choix
en attente ne part pas, puisqu'il peut dater d'un choix que la personne a défait depuis, ailleurs.

Le paramètre `language` ne compte qu'à ce moment-là. Seul un lien valide ouvre une session neuve, et
son jeton, secret et à usage unique, désigne le compte : une adresse qui porte ce paramètre, posée
sur un autre site, ne change ni la page ni le compte. Aucun écran ne le lit ensuite, et le
formulaire de langue le retire de son chemin de retour. Il reste visible dans l'adresse de l'écran
d'arrivée.

La règle exacte, que les commentaires de `hooks.server.ts`, de `language.ts` et de
`connexion/+page.server.ts` redisent :

- **Le choix attend sur son navigateur**, sous son cookie d'attente, un an au plus.
- **Il part une seule fois**, au premier de ces deux moments :
  - la demande d'un lien sur ce navigateur, quel que soit le temps passé depuis le choix, et qu'un
    courriel parte ou non. Seule une adresse refusée pour sa forme, qui ne demande aucun lien, le
    laisse attendre ;
  - sinon, la première requête connectée sur ce navigateur, que la session s'y soit ouverte par une
    passkey, par un lien demandé sur un autre navigateur, ou après un choix refait une fois le lien
    demandé. Elle l'écrit sur le compte (`languageForTheAccount`).

  Le cookie d'attente est retiré à ce moment-là.

- **Une fois parti, il ne revient plus.** Un second lien, demandé sans nouveau choix, ne l'emporte
  pas, et une langue changée ensuite sur un autre appareil reste.
- **Tant qu'il attend, il passe devant une langue changée entre-temps ailleurs.** Choisir l'allemand
  ici sans demander de lien, passer à l'italien sur un autre appareil, puis se connecter ici jusqu'à
  un an plus tard rend l'allemand au compte.
- **Une demande freinée consomme aussi le choix.** Quand la limite par adresse retient le courriel,
  ou quand l'envoi échoue, le choix est retiré comme pour un lien parti. L'action ne sait pas si le
  courriel est parti, et sa réponse, cookies compris, doit rester la même pour toutes les adresses
  (ADR 0017) : garder le choix dans ce seul cas dirait qu'on a déjà demandé trois liens pour cette
  adresse dans l'heure.

### Les deux cookies

| Cookie                    | Contenu                              | Attributs                                                        |
| ------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `jadwal_language`         | le code de la langue, de `fr` à `ar` | `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS, un an, chemin `/` |
| `jadwal_language_pending` | `1`                                  | les mêmes                                                        |

Ils ne sont posés que par un choix fait dans le formulaire, jamais au premier passage. Ils ne
portent aucune donnée personnelle et ne servent à rien d'autre. Chaque réponse de l'espace porte
`Vary: Accept-Language, Cookie` : un cache qui l'ignorerait servirait l'allemand à qui a demandé
l'arabe.

### La langue des courriels

Un courriel part dans la langue de l'écran sur lequel le geste est fait, jamais dans celle d'un
compte lu par son adresse :

- **le lien de connexion**, dans la langue de l'écran de connexion d'où il est demandé ;
- **l'invitation**, dans la langue de l'écran de la personne qui invite, pour toute adresse.

Le serveur pose la langue de la requête dans un stockage de contexte, que le courriel lit au moment de
s'écrire (`mail/language.ts`, dans `apps/web/src/lib/server/`) : Better Auth écrit le lien sans voir
la requête. L'écran des membres passe aussi la langue en paramètre à l'invitation.

Le plan de l'étape voulait un courriel dans la langue du compte qui le reçoit. Pour le lien de
connexion comme pour l'invitation, lire cette langue demanderait de chercher un compte par son
adresse, ce que l'ADR 0017 interdit : c'est le point d'arrêt décrit dans son addendum du
2026-09-26.

## Conséquences

- Une personne retrouve sa langue sur tous ses appareils dès qu'elle est connectée, et la choisit
  avant de l'être.
- Un courriel peut partir dans une autre langue que celle du compte : un lien demandé depuis un
  navigateur réglé en français, sans choix fait, part en français. La personne voit la langue de
  l'écran d'où elle l'a demandé, ce qui se comprend.
- Un lien de connexion ouvert dans un autre navigateur que celui de la demande, ce qui est courant
  sur un téléphone, garde le choix fait avant la connexion : il voyage avec le lien.
- **Ce que la règle laisse, et qui reste ouvert.** Un choix fait sur un navigateur sans demander de
  lien peut, jusqu'à un an plus tard, remettre sa langue sur le compte par-dessus une langue changée
  depuis sur un autre appareil. Une demande freinée par la limite de débit consomme le choix, et le
  lien qui l'aurait porté n'existe pas. L'autre voie serait un repère côté serveur, la date du
  dernier changement de langue du compte : une colonne et une migration de plus. La question est
  posée dans `ETAT-PROJET.md`.
- Les deux cookies sont fonctionnels et posés sur demande. Faut-il les nommer dans
  `docs/CONDITIONS.md`, qui ne parle que des cookies de mesure d'audience ? La question revient au
  juriste.
- Le lien de connexion porte une chose de plus qu'avant l'étape 18, et une seule : la langue choisie
  avant la connexion, quand un choix attend. Sans choix en attente, son adresse de retour reste
  `/organisations`, sans rien d'autre.
- Un écran ajouté demande ses textes dans les cinq langues avant de compiler (ADR 0007).

## Statut

Accepté, 2026-09-26. Étape 18, retours D2 (l'espace en cinq langues) et D3 (la langue des
courriels). Révisé le même jour, à la fin de l'étape : le choix fait avant la connexion part avec le
lien de connexion, et la règle exacte de son départ est écrite.
