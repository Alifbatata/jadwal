# L'onglet Prières de la page publique

Décrit après le code, à l'étape 18 (retour C4). Un visiteur cherchait les heures de prière
elles-mêmes, et ne les trouvait qu'à travers les cours qui les suivent. L'onglet les donne, pour
aujourd'hui et pour la semaine (ADR 0042, addendum du 2026-09-26).

**Lien** : `?vue=prieres` sur la page de l'organisation, dans chaque langue. Il n'existe que si le
module des heures de prière est allumé ; sinon, `?vue=prieres` montre la vue Semaine, et l'en-tête
n'a que trois onglets.

## Structure, de haut en bas

1. **L'en-tête commun**, avec le quatrième onglet marqué : `Prières` (`Gebetszeiten`, `Preghiere`,
   `Prayer times`, `مواقيت الصلاة`). Ni filtres par public, ni bloc du vendredi du haut : les
   filtres ne s'appliquent pas aux heures, et l'onglet donne lui-même les sessions du vendredi.
2. **Une phrase d'aide** : `L'adhan est l'appel à la prière. L'iqama est l'heure à laquelle elle
commence dans la salle.`
3. **Aujourd'hui**, titre de niveau 2 : `Aujourd'hui, samedi 26.09.2026`. Un tableau de trois
   colonnes, `Prière`, `Adhan`, `Iqama`, une ligne par prière, avec son nom dans la langue de la page
   (`Maghrib`, `المغرب`).
   - Sans iqama réglée, la case montre un tiret, et les lecteurs d'écran entendent
     `Aucune iqama fixée`.
   - Un vendredi où l'organisation a des sessions, la case de l'iqama du Dhuhr dit
     `Prière du vendredi : 12:30 et 13:45`.
4. **Les sept prochains jours**, titre de niveau 2, puis deux phrases d'aide :
   `Dans chaque case, l'heure de l'adhan, et en dessous celle de l'iqama quand elle est fixée.` et,
   s'il y a un vendredi dans la semaine, `Le vendredi, la case du Dhuhr donne les heures de la
prière du vendredi.` Puis un tableau : une ligne par jour (`samedi 26.09.2026`), une colonne par
   prière. Le jour même est en gras et porte `aria-current`. Chaque heure dit aux lecteurs d'écran
   si c'est l'adhan, l'iqama ou la prière du vendredi. Sur un téléphone, le tableau défile dans son
   cadre ; la page, jamais.
5. **Prière du vendredi**, titre de niveau 2, quand l'organisation a des sessions :
   `Elle remplace le Dhuhr chaque vendredi.`, puis une ligne par session : l'heure,
   `sermon en arabe et français`, la salle.
6. **Le pied commun**.

Sans heure publiée : `Les heures de prière ne sont pas encore publiées.`

## D'où viennent les heures

De la même requête que celle qui place les cours ancrés sur une prière : la saisie à la main, puis
le fichier importé, puis le calcul (ADR 0004). L'onglet ne peut donc pas dire une autre heure que le
programme.

## Comportements

- Le titre du navigateur est `<Nom de l'organisation> | Heures de prière`.
- Aucun script, aucune ressource d'un autre domaine, comme partout côté public.
- Dans le cadre du widget, l'onglet est là aussi, et s'ouvre en mode intégré.
- **Limite connue à la fin de l'étape 18** : l'onglet place les sessions du vendredi d'après leur
  rythme habituel, sans lire les annulations ni les déplacements de ce vendredi-là. La vue Semaine,
  elle, montre une session annulée comme annulée.
