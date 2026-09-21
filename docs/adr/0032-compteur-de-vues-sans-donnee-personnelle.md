# ADR 0032 : Compteur de vues sans donnée personnelle

## Contexte

Un responsable de mosquée veut savoir si son programme est lu, et surtout si le widget qu'il a collé
sur le site de la mosquée fonctionne encore. C'est une question légitime, et c'est la seule que le
produit ait besoin de trancher.

Les réponses habituelles — une mesure d'audience, même « respectueuse de la vie privée » — reposent
toutes sur quelque chose que nous avons promis de ne pas garder : une adresse IP, un cookie, un
identifiant de visiteur, une provenance, une empreinte de navigateur. L'ADR 0009 et
`docs/CONDITIONS.md` disent qu'un visiteur ne laisse aucune donnée personnelle. Une mesure d'audience
qui ferait autrement démentirait ces deux textes.

## Décision

Un compteur quotidien par organisation et par type, et **rien d'autre**.

### Ce qui est écrit

Une table à quatre colonnes, et seulement quatre :

| colonne           | ce qu'elle porte                     |
| ----------------- | ------------------------------------ |
| `organization_id` | la mosquée                           |
| `day`             | la date **locale de l'organisation** |
| `kind`            | `page`, `embed` ou `feed`            |
| `count`           | un nombre                            |

Pas de colonne d'horodatage — **pas même un `created_at`**. Il donnerait l'heure de la première vue
du jour, et dans une mosquée de quartier, l'heure exacte à laquelle une personne a lu la page.
`packages/db/test/page-view.test.ts` vérifie la liste des colonnes : une colonne ajoutée par
inadvertance ferait échouer la suite.

Le jour est la date locale de l'organisation, et non la date UTC : sinon la soirée du vendredi d'une
mosquée de Bienne tomberait au samedi une partie de l'année.

### Ce qui est lu, puis jeté

L'agent utilisateur, pour écarter les robots connus, et deux en-têtes de pré-chargement, pour ne pas
compter une page que personne n'a encore ouverte. Aucune de ces valeurs ne sort de la requête, et
aucune n'en dérive quoi que ce soit de persistant.

`apps/web/tests/vues.test.ts` le prouve autrement qu'en le lisant dans le code : il envoie des
requêtes dont chaque en-tête porte un marqueur unique — provenance, agent, cookie, adresse, langue —
puis relit **toutes les colonnes de toutes les tables** à la recherche de ces marqueurs. Le balayage
passe par `to_jsonb(t.*)`, donc une colonne ajoutée demain y entre sans qu'on y pense.

### Les trois types, et ce qu'ils valent

- **`page`** : la page publique, ouverte directement.
- **`embed`** : la même page dans un cadre. Le juge est `Sec-Fetch-Dest`, que le navigateur pose et
  que JavaScript ne peut pas écrire ; le paramètre `embed=1` reste le repli pour un cadre posé à la
  main dans un navigateur ancien.
- **`feed`** : les relevés d'un flux agenda. Ce ne sont **pas** des personnes : un agenda relève tout
  seul, plusieurs fois par jour. L'écran le dit.

### Ce que le compteur ne mesure pas — question fermée

Les visiteurs servis par un cache. Les pages publiques portent `max-age=120` et une journée de
`stale-while-revalidate` ; un cache partagé peut donc servir la même réponse à un nombre illimité de
personnes sans que le serveur l'apprenne. **Le compteur est un minorant**, et les écrans le disent au
lieu de laisser croire à une mesure.

La question « faut-il faire mieux ? » est tranchée à l'étape 8 : **non**. Retirer le cache pour mieux
compter coûterait du temps de chargement à des visiteurs réels, pour un chiffre. La liste de robots
tenue à la main et la méthode de calcul par défaut sont fermées de la même façon, et pour la même
raison : ce qu'elles coûtent à améliorer dépasse ce qu'elles rapporteraient.

Il ne mesure pas non plus les robots qu'il ne reconnaît pas. La liste est courte, tenue à la main :
mesurée contre le jeu `crawler-user-agents`, elle reconnaît 73,6 % de ses instances et aucune des
seize chaînes de vrais navigateurs qui ont servi de contrôle. Les 26 % manqués sont la queue du
catalogue. Une dépendance de mille cinq cents expressions régulières coûterait plus cher qu'elle ne
rapporterait, et il faudrait la réévaluer chaque semaine.

### « Votre widget ne semble plus s'afficher »

L'écran d'accueil prévient quand le mode intégré **avait** des vues et n'en a plus depuis sept jours.
La condition « avait des vues » n'est pas un détail : sans elle, la mention s'afficherait chez toutes
les mosquées qui n'ont jamais collé le widget.

Et même ainsi, elle ne peut pas distinguer un widget cassé d'un widget retiré volontairement : le
service n'a aucun signal pour cela, puisqu'il ne lit ni `Referer` ni domaine déclaré. L'écran dit
donc les deux possibilités plutôt que d'affirmer la mauvaise.

### Écrit par le rôle du visiteur, sans lui donner la table

L'incrément a lieu dans la requête qu'il compte, sous le rôle public, en une seule instruction.
Deux instances qui comptent en même temps ne peuvent pas se perdre l'une l'autre, et **rien n'est
gardé en mémoire au-delà de la requête** : il n'y a ni file d'attente, ni tampon, ni vidage différé.

**Révision de l'étape 8.** Jusque-là, le rôle public avait `SELECT`, `INSERT` et `UPDATE` sur la
table, parce qu'un `count = count + 1` lit avant d'écrire. La lecture était bornée par une politique,
mais elle restait une lecture, et elle portait sur **toutes** les organisations actives : une mosquée
pouvait en théorie lire les chiffres d'une autre. Aucune donnée personnelle n'était en jeu — la table
n'en contient pas — mais c'était une question ouverte, et elle est fermée.

L'incrément passe désormais par `jadwal.count_view(organisation, jour, type)`, une fonction
`SECURITY DEFINER` du propriétaire, au `search_path` figé, qui ne sait faire qu'une chose : ses trois
arguments ne laissent choisir ni la valeur ajoutée, qui vaut toujours un, ni la table, ni la colonne.
Le rôle public reçoit `EXECUTE` dessus et **plus aucun droit** sur la table : son `select` échoue sur
un droit absent, avant qu'une ligne soit examinée, exactement comme sur le journal d'audit.

Deux détails qui ont demandé une mesure plutôt qu'une supposition. Le drapeau d'entretien est levé
dans le corps de la fonction, puis remis dans l'état où il était : il ne peut pas l'être dans la
clause `SET` de la fonction, PostgreSQL refusant d'y nommer un paramètre personnalisé à un rôle non
superutilisateur. Et l'existence de l'organisation n'est pas vérifiée dans la fonction : la clé
étrangère s'en charge, et elle le fait mieux qu'une condition qu'on pourrait oublier.

Les responsables **lisent** leurs chiffres et ne les écrivent jamais : un compteur n'est pas une
donnée qu'on saisit, et la base le garantit plutôt que de faire confiance aux écrans. Le super-admin
non plus — ce qui exige un retrait explicite, la boucle générique de la migration 0034 accordant les
quatre opérations sur toute table portant `organization_id`.

La table est en `fillfactor = 70` : la ligne du jour est mise à jour des milliers de fois, et laisser
de la place libre sur chaque page permet la mise à jour « HOT », sans nouvelle entrée d'index et sans
`VACUUM`. La condition est qu'aucune colonne indexée ne change : `count` n'est dans aucun index, et
ne doit jamais y entrer.

### Rétention : vingt-cinq mois

Portée par une politique de suppression, comme les deux journaux, et non par le code de la procédure
de purge. Vingt-cinq mois est le plafond que la CNIL retient pour une mesure d'audience exemptée de
consentement ; nous sommes en deçà de ce régime — rien n'est déposé sur le terminal — mais s'aligner
sur lui évite d'avoir à argumenter, et deux ans permettent de comparer une rentrée à la précédente.

**Le verrou de conservation (ADR 0030) ne s'applique pas au compteur**, et c'est délibéré. Ce verrou
gèle les traces de _ce que des personnes ont fait_, pour qu'un litige puisse s'appuyer dessus. Le
compteur ne décrit personne, et la durée annoncée dans `docs/CONDITIONS.md` vaut envers des visiteurs
qui ne sont partie à aucun litige.

## Ce que cette étape corrige : le limiteur de débit

En écrivant le paragraphe de `docs/CONDITIONS.md` qui promet qu'un visiteur ne laisse aucune donnée,
nous avons relu le limiteur de débit et trouvé le contraire. Depuis l'étape 5, la table `rate_limit`
portait deux sortes de clés **en clair** :

- `email:<adresse>|<chemin>`, posée par notre volet par adresse électronique ;
- `<adresse IP>|<chemin>`, posée par le limiteur intégré de Better Auth, dont le rangement en base
  écrit la clé telle quelle.

Aucune purge ne les effaçait. Une adresse IP et une adresse électronique sont l'une et l'autre des
données personnelles, et une ligne qu'on n'efface jamais les conserve indéfiniment.

Trois corrections, faites ici parce qu'on ne peut pas écrire honnêtement un document qui affirme le
contraire de ce que fait le code :

1. **Les clés sont condensées.** `HMAC-SHA256`, salé par le secret de session — déjà obligatoire en
   production et déjà partagé par toutes les instances. Le compteur n'a jamais besoin de savoir de
   qui il s'agit, seulement de reconnaître deux requêtes venues du même appelant.
2. **Le limiteur intégré passe par le nôtre.** `rateLimit.customStorage` de Better Auth reçoit notre
   implémentation : une seule instruction atomique, la même table, le même condensat, la même purge.
3. **Les lignes s'effacent.** La fenêtre la plus longue du service est d'une heure (les liens
   magiques) ; au-delà d'un jour, une ligne ne limite plus rien et n'est plus qu'une trace. Une
   politique de suppression la borne, et `jadwal.purge_rate_limit()` l'emporte.

Ce que le condensat protège, et ce qu'il ne protège pas : une base volée ne rend plus les adresses,
mais quelqu'un qui tient **aussi** le secret peut retrouver une adresse IPv4 en épuisant les quatre
milliards de possibilités. C'est la limite de tout condensat d'un ensemble petit, et c'est pourquoi la
purge à un jour compte autant que le hachage.

La migration qui efface les anciennes lignes le fait sous une politique temporaire, puis **vérifie**
dans la même transaction que la table est vide. Sans cette politique, le `DELETE` n'emportait rien du
tout et ne disait rien — le « 0 ligne » muet contre lequel l'ADR 0019 met en garde. Écrit d'abord
sans elle, ce fichier a effectivement laissé `public:127.0.0.1` en place lors de sa première
application ; c'est la relecture de la base après migration qui l'a montré.

## Conséquences

- Un responsable voit trois nombres sur sept et sur trente jours, et une mention quand son widget se
  tait. Il ne verra jamais de pages vues par personne, de provenance, ni de carte du monde : le
  service n'en a pas les données, et c'est le but.
- Les chiffres sont des minorants, et l'écran le dit. Une mosquée qui compare ses chiffres à ceux
  d'un autre outil trouvera les nôtres plus bas.
- Le cadre posé à la main dans `/partager` porte `referrerpolicy="no-referrer"`, comme celui que crée
  le widget : nous n'écrivons pas la provenance, mais une promesse se tient mieux quand la donnée
  n'arrive pas.
- Aucun consentement n'est requis : rien n'est déposé sur le terminal, et rien de ce qui est conservé
  ne se rapporte à une personne.

## Statut

Accepté, 2026-09-21 (étape 7) ; révisé le 2026-09-21 (étape 8) sur les droits du rôle public, et
trois questions ouvertes fermées. Complète l'ADR 0009 sur le point du limiteur de débit.
