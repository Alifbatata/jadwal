# ADR 0021 : Espace des responsables — structure et vocabulaire

## Contexte

Le cadrage promet « une seule saisie » pour quatre sorties. L'espace des responsables est cette
saisie. Il est utilisé depuis un téléphone, souvent à la mosquée, par deux ou trois personnes qui ne
sont pas des informaticiennes et qui ne s'en serviront qu'une fois par semaine — parfois moins.

Trois choses en découlent, et elles décident de tout le reste : les mots doivent être ceux de la
mosquée, pas ceux de la base ; ce qui est fréquent doit être à un geste ; et rien ne doit dépendre
de JavaScript, parce qu'un réseau de sous-sol de mosquée n'est pas un réseau de bureau.

## Décision

### Cinq écrans, dans cet ordre

| Écran        | Ce qu'on y fait                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| **À venir**  | les sept prochains jours ; annuler, déplacer, rétablir une séance                 |
| **Cours**    | la liste avec le rythme en clair ; créer, modifier, poser une pause               |
| **Partager** | le lien public, le programme de la semaine en texte, le code à coller, un QR code |
| **Membres**  | inviter, retirer, changer un rôle (`org_admin`)                                   |
| **Réglages** | nom, fuseau, couleur, langues, salles, formule d'accueil (`org_admin`)            |

**À venir est l'accueil**, et non la liste des cours. Ce qu'on vient faire un mardi soir, c'est
annuler la séance de demain, pas relire la fiche d'un cours.

### Le vocabulaire

Celui de la mosquée : « séance » et non « occurrence », « cours » et non « événement », « public »
et non « audience », « Maghrib » et non « prayer anchor ». Le rythme s'affiche en phrase — « chaque
semaine, le lundi et mercredi », « le dernier samedi du mois » — et jamais en règle de récurrence.

### Ce que l'écran ne calcule pas

**Tous les aperçus viennent de `@jadwal/core`** : les sept prochains jours, le résumé qui se met à
jour pendant la saisie, les prochaines dates. Refaire l'arithmétique dans l'interface donnerait deux
vérités, et celle de l'écran serait la moins testée. Un test compare, pour les mêmes données, ce que
l'écran affiche à ce que `expandOccurrences` calcule.

### Ce que le responsable ne saisit jamais

Les identifiants. Ils sont produits par le système, en UUID v7 (ADR 0014), et les contraintes d'UID
de l'étape 1 — pas d'espace, pas de virgule, jamais un identifiant qui finit par une date — ne
remontent donc jamais jusqu'à lui.

### Les gestes fréquents

- **Annuler** demande une confirmation qui rappelle, en toutes lettres, que le cours continue les
  autres semaines. C'est la confusion la plus probable, et elle se corrige par une phrase.
- **Déplacer** propose les six jours qui suivent et une heure. Au-delà, c'est un changement de
  rythme, pas un déplacement.
- **Rétablir** défait l'un comme l'autre.
- Après une annulation ou un déplacement, **le message prêt à coller s'affiche**. C'est ce que les
  responsables font déjà à la main, dans WhatsApp.

### Le JavaScript améliore, il n'est jamais nécessaire

Toutes les écritures passent par des form actions. Sans JavaScript : les onglets de langue sont
tous dépliés, les blocs « annuler ou déplacer » sont tous ouverts, le résumé affiche l'état
enregistré au lieu de suivre la frappe. Rien ne manque. Les tests postent des formulaires
`application/x-www-form-urlencoded` avec `accept: text/html`, ce qui est exactement le chemin d'un
navigateur sans JavaScript.

**Une seule exception**, et elle est bornée : l'écran de passkey du super-admin. WebAuthn est une
API du navigateur ; il n'existe pas de formulaire qui crée une passkey. L'écran le dit au lieu de
présenter un bouton inerte.

### Texte brut, partout

Aucun HTML saisi n'est jamais rendu. Svelte échappe ce qu'il affiche, et un test envoie des charges
habituelles dans chaque champ puis relit les pages pour vérifier qu'elles sortent en texte.

### Performance et accessibilité

- L'écran d'accueil tient en **cinq requêtes** — réglages, cours, exceptions, pauses, heures de
  prière — quel que soit le nombre de cours. Jamais une requête par cours.
- Tout est rendu côté serveur.
- Cibles tactiles d'au moins 44 pixels, libellés reliés à leurs champs, erreurs annoncées
  (`role="alert"`), navigation au clavier complète.

### Traductions

Les textes sont saisis dans la langue source de l'organisation. Les traductions sont facultatives :
un onglet par langue activée, vide par défaut, et **aucune traduction automatique** ici. La
pré-traduction validée par le responsable est dans la feuille de route, pas dans la V1.

## Conséquences

- Un responsable peut, depuis un téléphone, créer les cours de sa mosquée, en annuler un, en
  déplacer un autre, poser une pause et copier le message de la semaine.
- L'interface ne peut pas afficher une séance que le cœur n'aurait pas calculée, ni en manquer une :
  c'est le même code qui répond aux quatre sorties du cadrage.
- Le résumé pendant la saisie est un confort. Il disparaît sans JavaScript, et le formulaire
  fonctionne quand même.
- Les pauses sont sur l'écran des cours parce que c'est là qu'on a la liste sous les yeux : une
  pause vise un cours, ou toute la mosquée.
- L'écran **Partager** montre déjà le lien public et le code à coller, marqués « à venir » tant que
  les étapes 5 et 6 ne sont pas faites. Dire qu'une chose n'existe pas encore vaut mieux que de
  laisser croire qu'elle marche.

## Statut

Accepté, 2026-09-20. Étape 4 de la feuille de route (espace des responsables). Les numéros 0022 et
0023 restent libres.
