# L'écran À venir

Décrit après le code, à l'étape 18 (retours A1, A2, D1, et B1, D2, A3 pour cet écran). Textes :
`apps/web/src/lib/i18n/upcoming.ts`, dans les cinq langues.

**Lien** : `/`, l'accueil de l'espace, ouvert à l'éditeur comme à la personne responsable.

## Structure, de haut en bas

1. Titre de niveau 1 : `À venir`, le nom du lien de la navigation.
2. `Les séances des sept prochains jours, jour par jour. Si une séance n'a pas lieu ou change de
date, ouvrez « Annuler ou déplacer » sous son titre.`
3. La période : `Du samedi 26.09.2026 au vendredi 02.10.2026`.
4. **Ce qui demande une décision**, avant le programme, seulement quand c'est le cas :
   - des séances sans heure : `Une séance de la semaine s'affiche sans heure, parce que son heure
dépend d'une prière.` (ou `2 séances de la semaine s'affichent sans heure…`), puis
     `Les heures de prière ne sont pas encore réglées.` ou `Les heures de prière enregistrées ne
couvrent pas encore toute la semaine.` Une personne responsable a le lien
     `Régler les heures de prière` ; un éditeur lit
     `La personne responsable de votre organisation peut les régler.` ;
   - la fin d'un calendrier importé, moins de trente jours avant : `Votre calendrier de prières
importé s'arrête le mercredi 30.09.2026, dans 4 jours.` (avec une forme pour aujourd'hui, demain,
     et un calendrier déjà terminé), puis ce qui suit, et le lien `Importer la suite du calendrier`
     pour une personne responsable ;
   - le programme qui ne s'affiche plus sur le site de l'organisation : `Votre programme ne semble
plus s'afficher sur votre site : personne ne l'y a vu depuis sept jours, alors que c'était le cas
avant. Vérifiez la page de votre site sur laquelle vous avez collé le code.`, et le lien
     `Revoir le code à coller`. Le mot « widget » n'apparaît plus.
5. **Un bloc par jour**, puis une carte par séance (voir plus bas).
6. **Le programme de la semaine**, prêt à coller.
7. **Combien votre programme a été vu.**

Sans séance : `Aucune séance dans les sept prochains jours.` et le lien `Créer un cours`.

## Une séance

Le titre, sa marque (`annulée`, `déplacée`, `date exceptionnelle`), l'heure, la salle,
l'intervenant et le public, dans la langue de l'écran. Une séance déplacée dit
`Déplacée au mardi 29.09.2026 à 18:00` ; sa nouvelle date dit
`Prévue à l'origine le lundi 28.09.2026`.

**Les options sont fermées** (retour A1). Chaque carte a un repli `Annuler ou déplacer`, fermé au
chargement, avec ou sans JavaScript, qui n'ouvre que sa carte. Le bouton d'annulation n'existe que
derrière lui : on n'annule plus une séance sans avoir ouvert ses options. Dedans :

- `Seule cette séance est annulée : le cours continue les autres semaines. Vous pourrez la rétablir
ensuite.` et le bouton `Annuler cette séance` ;
- le cadre `Déplacer cette séance` (retour A2) :
  - `Nouvelle date`, le calendrier du navigateur, à partir d'aujourd'hui et sans limite, avec
    l'aide `À partir d'aujourd'hui, samedi 26.09.2026, plus tôt ou plus tard que la date prévue.` ;
  - `Heure de début`, avec l'aide `Exemple : 19:30` ;
  - le bouton `Déplacer la séance`.

Une séance annulée ou déplacée a le bouton `Rétablir la séance`, suivi de `Cela défait le
changement : la séance retrouve sa date et son heure habituelles.`

## Après un geste

Un titre qui dit ce qui s'est passé : `La séance est annulée.`, `La séance est déplacée.`,
`La séance est rétablie.` Après une annulation ou un déplacement : `Un message à envoyer à votre
communauté, par exemple dans WhatsApp. Il est écrit dans chaque langue de votre page publique, la
langue du cours d'abord : ouvrez une langue, puis copiez son texte.`, puis un repli par langue que
l'organisation publie, le premier ouvert, chacun avec sa zone `Message à copier`. Le titre du cours y
est traduit quand il l'est.

Les erreurs s'affichent dans la carte concernée, rouverte, au-dessus des champs, et la saisie est
gardée :

- `Cette date est déjà passée. Choisissez une date à partir d'aujourd'hui.`
- `Cette date n'a pas pu être lue. Choisissez-la dans le calendrier du champ « Nouvelle date ».`
- `Cette heure n'a pas pu être lue. Écrivez les heures et les minutes, par exemple 19:30.`
- `Cette séance n'existe plus. Rechargez la page pour voir le programme à jour.`

## Le programme de la semaine

Titre `Le programme de la semaine`, puis `Le programme des sept prochains jours, prêt à copier dans
WhatsApp. Il est écrit dans chaque langue de votre page publique, la langue par défaut d'abord :
ouvrez une langue, puis copiez son texte.` Un repli par langue publiée, le premier ouvert, avec sa
zone `Programme de la semaine`.

## Combien votre programme a été vu

Un tableau : `Où`, `7 derniers jours`, `30 derniers jours`, et trois lignes, `Page publique`,
`Programme intégré à votre site`, `Agendas abonnés`. Puis : `Chaque jour, seul un nombre par type
est gardé : aucune adresse, aucune provenance, aucun visiteur. Les robots connus ne sont pas
comptés. Ces nombres sont un minimum […]`

## Ce qui reste à reprendre

Relevé par la relecture de l'étape 18, non corrigé à la fin de l'étape :

- ouvrir les options puis toucher `Déplacer la séance` sans rien changer enregistre un déplacement
  vers la même date et la même heure, puisque les champs sont préremplis ;
- deux cartes peuvent être ouvertes en même temps ;
- le programme de la semaine d'À venir compte aussi les cours en brouillon, celui de Partager non ;
- une carte `date exceptionnelle` n'a pas de `Rétablir`, alors qu'une séance peut maintenant être
  déplacée loin de sa date.
