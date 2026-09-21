# Jeux de référence d'`adhan`

Ces deux fichiers viennent du dépôt d'`adhan`, à la version que nous employons :

```
https://raw.githubusercontent.com/batoulapps/adhan-js/v4.4.6/Shared/Times/Doha-Qatar.json
https://raw.githubusercontent.com/batoulapps/adhan-js/v4.4.6/Shared/Times/London-MoonsightingCommittee.json
```

Ils sont **copiés** et non téléchargés au moment du test, pour trois raisons : le paquet npm ne les
contient pas (le tarball ne livre que `lib/`), un test qui sort sur le réseau n'est pas
reproductible, et la CI n'a aucune raison d'aller chercher un fichier ailleurs pour se prononcer.

`adhan` est sous licence **MIT**, copyright Batoul Apps ; la copie est donc permise, avis de
copyright conservé. L'URL ci-dessus porte le **tag** `v4.4.6` et non une branche : la branche par
défaut du dépôt est `develop`, et un fichier de référence qui bougerait sous nos pieds ne
référencerait plus rien.

Les deux ont été choisis pour ce qu'ils éprouvent :

| Fichier                            | Ce qu'il apporte                                                |
| ---------------------------------- | ---------------------------------------------------------------- |
| `Doha-Qatar.json`                  | méthode `Qatar` (Isha à intervalle fixe), école Shafi, sans heure d'été |
| `London-MoonsightingCommittee.json` | école Hanafi, 51,5° N, `Europe/London` avec heure d'été          |

Londres est le plus proche de notre cas : latitude élevée, changement d'heure, école hanafite.

`prayer.test.ts` les relit avec le **même** formateur `Intl` que le code de production : ce n'est
donc pas la bibliothèque qui est éprouvée, c'est la chaîne complète — date civile, instant, heure
locale dans un fuseau IANA.
