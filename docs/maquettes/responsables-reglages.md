# L'écran Réglages

Décrit après le code, à l'étape 18 (retours B1, D2, A3 pour cet écran). Textes :
`apps/web/src/lib/i18n/settings.ts`, dans les cinq langues.

**Lien** : `/reglages`, réservé à la personne responsable (ADR 0046).

## Structure, de haut en bas

1. Titre de niveau 1 : `Réglages`, puis `Ce que votre organisation montre au public : son nom, sa
couleur, ses langues et ses salles.`
2. **Le formulaire des réglages**, chaque champ avec son aide :
   - `Nom de l'organisation` : `Votre page publique l'affiche tout en haut.`
   - `Fuseau horaire` : une liste, la même que celle de la création d'une organisation au
     super-admin (avant : un champ de texte, « Nom IANA »). Le groupe `Europe` vient en tête, puis
     `Reste du monde`, avec des noms canoniques seulement, sans alias ni `Etc/`. La liste se lit de
     gauche à droite, même en arabe. Aide : `L'heure de vos cours en dépend. En Suisse, choisissez
Europe/Zurich.`, puis `Si la ville de l'organisation n'est pas dans la liste, choisissez une ville
qui a toujours la même heure qu'elle. Pour la plus grande partie de l'Europe : Europe/Zurich,
Europe/Paris ou Europe/Berlin.`
   - Un fuseau enregistré avant la liste, qu'elle ne propose pas (un alias, comme
     `Europe/Amsterdam`), vient en premier dans la liste, choisi, pour qu'enregistrer le reste des
     réglages ne le remplace pas sans le dire. L'aide ajoute alors `Votre fuseau actuel,
Europe/Amsterdam, ne fait pas partie de la liste. Il est gardé tant que vous n'en choisissez pas un
autre.` C'est vrai : le flux agenda écrit un alias au fuseau canonique vers lequel il pointe
     (`Europe/Brussels` pour `Europe/Amsterdam`), aux mêmes heures.
   - `Couleur de votre page` (avant : « Couleur d'accent »), un `Exemple de bouton`, puis
     `Contraste du texte sur cette couleur : 5,5 pour 1. Il se lit bien à partir de 4,5 pour 1.` et
     `Elle sert de fond sur votre page publique, dans le programme collé sur votre site et ici. […]`
   - `Formule d'accueil des messages` : `Les premiers mots des messages prêts à coller que vous
envoyez à votre communauté. Exemple : Assalamu alaykum`
   - `Langues de votre page publique` (avant : « Langues activées »), cinq cases, les noms des
     langues dans la langue de l'écran : `Votre page publique, et le programme collé sur votre site,
se lisent dans les langues cochées. Chaque visiteur choisit la sienne.` L'anglais est proposé
     depuis l'étape 18 ; la base refuse toute autre langue (migration 0062).
   - `Langue par défaut` : `La langue de votre page publique à la première visite. Elle doit faire
partie des langues cochées.`
   - Le bouton `Enregistrer`, puis `Réglages enregistrés.`
3. **Salles** : `Les salles de vos cours. Un cours peut indiquer sa salle, mais ce n'est pas
obligatoire.` Chaque salle, avec, si des cours l'utilisent, `2 cours utilisent cette salle ; ils
n'auront plus de salle si vous la supprimez.` (et la même phrase pour les prières du vendredi), et
   le bouton `Supprimer`. Puis `Nouvelle salle` (`Exemple : Grande salle`) et `Ajouter`. Après un
   geste : `Salle ajoutée.` ou `Salle supprimée.`
4. **Heures de prière** : `Les heures de prière sont activées.` ou `désactivées`, avec ce que cela
   change et ce qui reste si on les désactive, puis le bouton `Activer les heures de prière` ou
   `Désactiver les heures de prière` (avant : « Allumer le module »). Le mot « module » a disparu de
   l'écran.

## Supprimer une salle occupée

Le premier envoi ne supprime rien (avant l'étape 18, la salle partait au premier clic, et l'écran
renvoyait même une erreur 500) : l'écran montre une demande de confirmation, `Vous allez supprimer
cette salle : <nom>`, les phrases des cours et des prières du vendredi qui la perdront,
`Rien d'autre ne change dans votre programme.`, puis `Supprimer la salle` et `Garder la salle`. Une
salle libre part au premier envoi. La base ne vide ensuite que la salle de ces cours (migration
0061).

## Les messages

Toutes les erreurs disent quoi écrire, par exemple `Écrivez le nom de l'organisation.`,
`Choisissez le fuseau horaire dans la liste.`,
`La langue par défaut doit faire partie des langues cochées.`, et le refus de désactiver les heures
de prière : `L'heure de certains cours se règle sur une prière, ou une prière du vendredi existe.
Donnez à ces cours une heure fixe ou supprimez-les avant de désactiver les heures de prière.`

Après un refus, les champs gardent ce qui a été tapé, et non les valeurs enregistrées. Avec
JavaScript, changer la couleur ne défait pas le nom ni la formule d'accueil en cours de frappe. La
demande de confirmation d'une salle occupée s'affiche en haut, avec les messages, là où la page
revient après l'envoi.
