# Vue Mois

Une grille, puis la liste du jour choisi. C'est la vue qui répond à « et le 12 octobre, il y a quoi ? »
— une question qu'on se pose une fois, en regardant un calendrier.

**Lien** : `?vue=mois`, avec le mois dans la requête (`?mois=2026-10`) et le jour choisi
(`?jour=2026-10-12`). Sans mois, le mois courant ; sans jour, aucun jour n'est ouvert.

## Structure, de haut en bas

1. **L'en-tête commun**.
2. **La barre de mois**, sur une ligne : `‹ Septembre 2026` · **Octobre 2026** · `Novembre 2026 ›`.
   Les deux extrémités sont des liens ; le mois courant ne l'est pas. La navigation est bornée à
   douze mois en arrière et douze mois en avant.
3. **La grille**, une ligne par semaine, du lundi au dimanche.
   - En-tête de colonnes : `lun`, `mar`, `mer`, `jeu`, `ven`, `sam`, `dim`.
   - Chaque case porte le numéro du jour. Un jour qui a au moins une séance porte en plus **un
     compte** : `3 séances`, `1 séance`. Un jour sans séance ne porte rien.
   - Un jour avec séances est un lien vers lui-même (`?jour=…`) ; un jour sans séance n'est pas un
     lien.
   - Le jour courant est marqué, même s'il n'a pas de séance.
   - Les cases des jours qui n'appartiennent pas au mois affiché restent vides.
4. **La liste du jour choisi**, sous la grille, si un jour est choisi :
   - Titre de niveau 2 : `lundi 12 octobre`.
   - Les séances du jour, dans la forme commune décrite dans `README.md`.
5. **Le pied commun**.

## Ce que la grille ne fait pas

Elle n'affiche pas les titres des cours dans les cases. Sur un téléphone, sept colonnes ne laissent
pas la place d'un mot lisible ; un compte se lit, un titre tronqué ne se lit pas.

## Quand il n'y a rien

- Mois sans aucune séance : sous la grille, `Aucune séance ce mois-ci.`
- Jour choisi sans séance : ce cas n'arrive pas, puisqu'un jour sans séance n'est pas un lien. Si
  l'adresse est tapée à la main : `Aucune séance ce jour-là.`

## Comportements

- Changer de mois oublie le jour choisi.
- Le filtre par public s'applique à la grille **et** à la liste : les comptes des cases reflètent le
  filtre, sans quoi ils mentiraient.
- Le titre du navigateur est `<Nom de l'organisation> — Octobre 2026`.
