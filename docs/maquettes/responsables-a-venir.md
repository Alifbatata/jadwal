# L'écran À venir

Décrit après le code, à l'étape 18 (retours A1, A2, D1, et B1, D2, A3 pour cet écran), et repris à
l'étape 19 (relecture D4 et décisions du chef de projet). Textes :
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

Le titre, sa marque (`annulée`, `déplacée`, `date exceptionnelle`, `nouvelle heure`), l'heure, la
salle, l'intervenant et le public, dans la langue de l'écran. Le titre est celui de la langue de
l'écran quand le cours y est traduit, sinon celui de sa langue source (étape 19) : `Abendkurs` sur
un écran allemand, `Cours du soir` sur un écran italien sans traduction italienne. Une session du
vendredi qui porte le nom proposé par le service prend le nom de la prière dans la langue de
l'écran. Un cours en brouillon s'affiche aussi, avec la marque `brouillon` : il n'est ni sur la
page publique ni dans le programme de la semaine. Une session du vendredi en brouillon s'affiche à
sa propre heure, mais ne donne pas la sienne au Dhuhr : un cours prévu après le Dhuhr a sur sa
carte l'heure de la page publique et du programme de la semaine, et un déplacement le même jour
l'annonce « au lieu de » cette heure-là (étape 19, relecture de D4). Une séance déplacée dit
`Déplacée au mardi 29.09.2026 à 18:00` ; sa nouvelle date dit
`Prévue à l'origine le lundi 28.09.2026`. Déplacée le même jour à une autre heure, la carte
d'arrivée porte `nouvelle heure` et `Prévue à l'origine : 19:00 – 20:30`.

**Les options sont fermées** (retour A1). Chaque carte a un repli `Annuler ou déplacer`, fermé au
chargement, avec ou sans JavaScript, qui n'ouvre que sa carte. Le bouton d'annulation n'existe que
derrière lui : on n'annule plus une séance sans avoir ouvert ses options. Dedans :

- `Seule cette séance est annulée : le cours continue les autres semaines. Vous pourrez la rétablir
ensuite.` et le bouton `Annuler cette séance` ;
- le cadre `Déplacer cette séance` (retour A2) :
  - `Nouvelle date`, le calendrier du navigateur, à partir d'aujourd'hui et jusqu'au 31.12.2100, la
    dernière date que l'action accepte (étape 19 ; il n'avait pas de limite avant), avec
    l'aide `À partir d'aujourd'hui, samedi 26.09.2026, plus tôt ou plus tard que la date prévue.` ;
  - `Heure de début`, avec l'aide `Exemple : 19:30` ;
  - le bouton `Déplacer la séance`. Le formulaire envoie aussi, sans le montrer, l'heure que la
    carte affichait.

Une séance annulée ou déplacée a le bouton `Rétablir la séance`, suivi de `Cela défait le
changement : la séance retrouve sa date et son heure habituelles.` La carte `date exceptionnelle`
l'a aussi (étape 19) : elle envoie la date prévue de la séance, que la carte de départ ne montre pas
toujours, puisqu'une séance peut être avancée de loin. Une séance qui n'a changé que d'heure, le
même jour, garde un seul bouton, sur la carte de son heure prévue. Le formulaire envoie aussi, sans
le montrer, ce que la carte montrait : l'annulation ou le déplacement lui-même, par son identifiant,
et pour un déplacement sa date et son heure d'arrivée (étape 19, lot 2). Une carte restée ouverte
pendant qu'une autre personne rétablissait la séance puis la changeait de nouveau n'efface plus ce
changement, même quand il ressemble au premier, une annulation refaite par exemple : elle reçoit le
refus d'une carte périmée, plus bas.

## Après un geste

Un titre qui dit ce qui s'est passé : `La séance est annulée.`, `La séance est déplacée.`,
`La séance est rétablie.` Après une annulation ou un déplacement : `Un message à envoyer à votre
communauté, par exemple dans WhatsApp. Il est écrit dans chaque langue de votre page publique, la
langue du cours d'abord : ouvrez une langue, puis copiez son texte.`, puis un repli par langue que
l'organisation publie, le premier ouvert, chacun avec sa zone `Message à copier`. Le titre du cours y
est traduit quand il l'est. Un déplacement le même jour se dit comme un changement d'heure, la date
une seule fois : `Le cours « Cours du soir » du mardi 29.09.2026 commence à 20:30 au lieu de
19:00.` Une session du vendredi a ses propres mots (étape 19) : `« Prière du vendredi » : la prière
du vendredi 02.10.2026 est annulée.`, puis `Les autres prières du vendredi ont lieu comme
d'habitude.`, et de même pour un déplacement ou un changement d'heure.

Les erreurs d'un déplacement s'affichent dans la carte concernée, rouverte, au-dessus des champs, et
la saisie est gardée :

- `Cette date est déjà passée. Choisissez une date à partir d'aujourd'hui.`
- `Cette date n'a pas pu être lue. Choisissez-la dans le calendrier du champ « Nouvelle date ».` :
  une date illisible, impossible, ou hors des années 1970 à 2100, que seul un formulaire écrit à la
  main envoie (l'an 0000 donnait une erreur 500, étape 19). Le calendrier du champ s'arrête au
  31.12.2100 : il proposait le 31.12.2101, et cette phrase disait alors de choisir dans le
  calendrier une date qui venait d'y être choisie.
- `Cette heure n'a pas pu être lue. Écrivez les heures et les minutes, par exemple 19:30.`
- `La séance est déjà prévue à cette date et à cette heure. Choisissez une autre date ou une autre
heure.` : un déplacement qui ne change rien est refusé.
- `L'heure de la séance « Cours du soir » du mardi 29.09.2026 a changé depuis l'ouverture de la
page. Rien n'a été enregistré. Sa nouvelle heure est écrite sous son titre : vérifiez la date et
l'heure choisies, puis recommencez.` : l'heure du cours a changé dans sa fiche pendant que la page
  restait ouverte, et la carte envoie l'ancienne.

Les refus qui ne désignent plus aucune carte s'affichent en haut de l'écran. Le titre, saisi par
une personne, y est isolé comme sur la carte (`<bdi>`, ADR 0007) : sur un écran arabe, un titre
latin qui finit par une ponctuation, `Tafsir (2)`, se lisait `(Tafsir (2`. Ceux d'une carte périmée
(409) nomment la séance, par son titre, dans la langue de l'écran quand le cours y est traduit, et
par sa date (étape 19) :

- `La séance « Cercle de lecture » du lundi 28.09.2026 a changé depuis l'ouverture de la page :
elle a déjà été annulée ou déplacée. Rien n'a été enregistré. Le programme ci-dessous est à jour.` :
  une carte restée ouverte (touche Retour, second onglet, autre personne) sur une séance annulée ou
  déplacée depuis n'écrit plus rien, qu'on touche `Annuler cette séance` ou `Déplacer la séance`.
  Juste en dessous, la carte montre l'état réel. Deux déplacements envoyés au même instant n'en
  écrivent qu'un, et l'autre reçoit ce refus. `Rétablir la séance` le reçoit aussi quand sa carte
  montrait un autre changement que celui qui est en place : la séance a été rétablie puis annulée ou
  déplacée de nouveau ailleurs, même à l'identique, et ce nouveau changement reste (étape 19,
  lot 2 ; avant, il disparaissait).
- `La séance « Cercle de lecture » du lundi 28.09.2026 a déjà été annulée depuis l'ouverture de la
page. Rien n'a été enregistré. Si le message n'a pas encore été envoyé, il est prêt ci-dessous.` :
  la même séance annulée une seconde fois, par une autre personne ou depuis une page restée
  ouverte. Rien ne s'écrit, mais le titre `La séance est annulée.` et le message prêt à coller
  suivent, dans chaque langue publiée : la personne ne sait pas si la communauté a déjà été
  prévenue (étape 19).
- `La séance « Cercle de lecture » du lundi 28.09.2026 a déjà été rétablie depuis l'ouverture de la
page. Rien n'a été enregistré. Le programme ci-dessous est à jour.` : `Rétablir la séance` touché
  sur une page restée ouverte, après qu'une autre personne ou un autre onglet l'a déjà rétablie.
  Il n'y a plus rien à rétablir : rien ne s'écrit, pas même au journal, et la carte, de nouveau
  prévue, ne se rouvre pas (étape 19, relecture de D2).
- `Cette séance n'existe plus. La liste ci-dessous est à jour.` : la page renvoyée est déjà à jour,
  et, sans JavaScript, recharger renverrait le formulaire refusé (étape 19).
- `La date de cette séance n'a pas pu être lue. Rechargez la page, puis recommencez.` : de même
  pour la date de la séance visée, à l'annulation, au déplacement et au rétablissement.

## Le programme de la semaine

Titre `Le programme de la semaine`, puis `Le programme des sept prochains jours, prêt à copier dans
WhatsApp. Il est écrit dans chaque langue de votre page publique, la langue par défaut d'abord :
ouvrez une langue, puis copiez son texte.` Un repli par langue publiée, le premier ouvert, avec sa
zone `Programme de la semaine`. Une séance déplacée y porte `(date exceptionnelle)`, ou
`(nouvelle heure)` quand elle n'a changé que d'heure, le même jour. Une session du vendredi qui
porte le nom proposé par le service y prend le nom de la prière dans chaque langue.

C'est le message de l'écran Partager, mot pour mot (étape 19) : les cours publiés seulement. Un
cours en brouillon n'y est pas, et une session du vendredi en brouillon ne donne pas son heure à un
cours prévu après le Dhuhr, ici comme sur les cartes.

## Combien votre programme a été vu

Un tableau : `Où`, `7 derniers jours`, `30 derniers jours`, et trois lignes, `Page publique`,
`Programme intégré à votre site`, `Agendas abonnés`. Puis : `Chaque jour, seul un nombre par type
est gardé : aucune adresse, aucune provenance, aucun visiteur. Les robots connus ne sont pas
comptés. Ces nombres sont un minimum […]`

## Ce qui a été repris

Relevé par la relecture de l'étape 18, corrigé à l'étape 19 (D4) : le programme de la semaine
comptait aussi les cours en brouillon, une carte `date exceptionnelle` n'avait pas de `Rétablir`, et
`Cette séance n'existe plus` demandait de recharger une page déjà à jour. Relevé par la relecture
de D4 : la carte d'un cours prévu après le Dhuhr prenait l'heure d'une session du vendredi en
brouillon, que le programme de la semaine et la page publique ne prennent pas. Relevé au lot 1 de
l'étape 19, corrigé au lot 2 : `Rétablir la séance` n'envoyait pas ce que sa carte montrait, et
effaçait un changement fait ailleurs depuis l'ouverture de la page. Relevé par la relecture du
lot 2 : la carte n'envoyait que l'état montré, et une annulation refaite ailleurs, qui montre la
même chose que la première, s'effaçait encore ; elle envoie maintenant l'identifiant du changement.

Deux cartes peuvent être ouvertes en même temps : c'est la lecture retenue du retour A1, où une
carte n'ouvre que la sienne sans rien changer aux autres.
