# 0054 : relire la page publique sans réseau

- Statut : accepté
- Date : 2026-11-26
- Amende : [0027](0027-pages-publiques.md) (« Aucun JavaScript »)
- Met en œuvre : [0053](0053-le-web-d-abord-la-coque-en-dernier.md)

## Contexte

L'ADR 0053 fait de la page publique d'une organisation son application : elle s'installe depuis le
navigateur, et elle doit rester lisible quand le réseau manque. Une salle de prière est souvent en
sous-sol, et c'est là qu'on ouvre le programme.

Un navigateur ne relit une page sans réseau que si un travailleur de service la lui rend. Et un
travailleur de service ne s'installe que par un script de la page. Or l'ADR 0027 dit les pages
publiques sans aucun JavaScript, sauf dans le cadre du widget.

Lu dans la documentation de SvelteKit le 26 novembre 2026 : le fichier `src/service-worker` est
construit en un seul fichier, servi à la racine du site, et SvelteKit l'enregistre de lui-même
depuis son script de démarrage. Les pages publiques n'ont pas ce script (`csr = false`) ; l'espace
des responsables, lui, l'a.

## Décision

### Un travailleur de service, pour les pages publiques seulement

La portée du travailleur est `/m/`. L'espace des responsables, la connexion et l'API n'y sont pas :
aucun travailleur ne se tient jamais devant eux.

L'enregistrement automatique de SvelteKit est coupé. Sans cela, le travailleur serait enregistré
dans l'espace des responsables, pour le site entier, et jamais sur les pages publiques.

### Un script, et un seul, sur la page publique hors cadre

« Aucun JavaScript » devient : **un fichier de notre propre origine, qui enregistre le travailleur
et ne fait rien d'autre**. Ni requête, ni mesure, ni stockage, ni rien qui change l'affichage. La
page se lit entièrement sans lui : un navigateur qui le bloque, ou qui refuse le travailleur,
affiche la même page qu'avant.

C'est un fichier et non du code en ligne, pour la raison de l'ADR 0005 : sur une page sans script
de SvelteKit, aucun nonce n'existe, et la politique de sécurité du contenu n'autorise que les
fichiers de notre origine.

Il n'est pas chargé dans le cadre du widget, ni sur une page d'erreur. Chargé dans un cadre posé à
la main, il ne fait rien.

### Le réseau d'abord, toujours

Tant que le serveur répond, le travailleur ne change rien à ce que la page affiche. Il passe la
requête au serveur, rend sa réponse, et en garde une copie.

La copie ne sert que dans trois cas : le réseau manque, le serveur ne répond pas en cinq secondes,
ou il répond par une panne (un code 500 ou plus). Une page introuvable reste introuvable.

Le travailleur demande toujours la page au serveur, sans passer par le cache du navigateur. Mesuré
dans Chrome : sans cela, le navigateur rend lui-même une page périmée quand le réseau manque, et
personne ne sait que c'est une copie.

### Une copie se dit copie

Chaque page porte, caché, un paragraphe : `Pas de réseau : voici la copie gardée le 26.11.2026 à
14:05.`, dans sa langue. Quand le travailleur rend une copie, il montre ce paragraphe et y écrit le
jour et l'heure où ce navigateur l'a gardée. La page n'a pas besoin de script pour cela.

Une vue « Aujourd'hui » gardée la veille montre la veille : la mention, en tête, est ce qui évite
de s'y tromper.

### Ce qui est gardé, et ce qui ne l'est pas

- Gardé : les pages publiques **ouvertes sur ce navigateur**, quarante au plus, leurs feuilles de
  style et les icônes. Rien n'est téléchargé d'avance.
- Jamais gardé : l'API, les flux agenda, l'espace des responsables, le cadre du widget, une page
  d'erreur, une redirection.

Tout ce qui est gardé est public : ces pages ne lisent ni session ni cookie (ADR 0027). La copie
reste sur l'appareil du visiteur ; le serveur n'en sait rien.

## Conséquences

- Six vérifications exigeaient « aucun script » sur une page publique. Elles demandent maintenant
  « ce fichier-là, et lui seul ». Les pages d'erreur et le cadre du widget n'ont pas changé.
- Seules les pages déjà ouvertes se relisent. Un onglet jamais visité ne s'ouvre pas sans réseau :
  le navigateur affiche son erreur ordinaire.
- Une personne dont le navigateur a installé le travailleur interroge le serveur à chaque
  ouverture, là où le cache du navigateur lui rendait la page pendant une à cinq minutes. Une
  correction d'un responsable se voit donc tout de suite. Le compteur de vues (ADR 0032) compte ces
  ouvertures : il reste un minorant.
- Le serveur reçoit ces requêtes du travailleur et non de la page : il n'y lit plus qu'il s'agit
  d'une navigation. Le compteur de vues n'en dépend pas pour une page ouverte hors cadre.
- Un navigateur qui ne sait pas charger un travailleur écrit en module ne l'installe pas, et garde
  la page d'avant, sans lecture hors réseau.
- Retirer un jour le travailleur demandera d'en publier un dernier qui se désinscrit : un fichier
  simplement supprimé laisserait l'ancien en place chez ceux qui l'ont.
- La page publique reste sans cookie, sans mesure d'audience et sans ressource d'un autre domaine.
