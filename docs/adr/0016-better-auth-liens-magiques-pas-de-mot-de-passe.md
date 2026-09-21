# ADR 0016 : Better Auth, liens magiques, pas de mot de passe

## Contexte

L'ADR 0006 avait décidé la connexion : « Better Auth, qui fournit le lien magique, les
organisations, les invitations, les rôles et la limitation de débit. » La décision datait de
l'étape 0, avant que la bibliothèque n'ait été essayée contre notre schéma.

L'étape 3 l'a essayée. Sept sujets ont été vérifiés contre la documentation officielle et rejoués
dans des projets jetables, chacun avec sa propre base PostgreSQL. Ce qui suit corrige l'ADR 0006 sur
un point, et le confirme sur tout le reste.

## Décision

### Ce que Better Auth fait

- **Les sessions et les liens magiques.** Le plugin tient l'usage unique par une consommation
  atomique, traite un jeton expiré comme un jeton inconnu, et rend la même erreur dans les deux cas.
  Surtout, la demande d'un lien **ne consulte jamais la table des comptes** : l'indistinguabilité
  d'une adresse connue et d'une adresse inconnue est structurelle, pas ajoutée après coup.
- **La limitation de débit**, avec son compteur en base, donc partagé entre toutes les instances.

### Trois réglages dont le défaut est dangereux

| Réglage             | Défaut               | Ce que nous posons |
| ------------------- | -------------------- | ------------------ |
| durée du lien       | 300 secondes         | 900 secondes       |
| stockage du jeton   | en clair             | haché (SHA-256)    |
| limitation de débit | production seulement | toujours           |

Le premier est une gêne, le deuxième est un défaut de sécurité : sans `storeToken: "hashed"`, le
jeton d'un lien encore valide est lisible dans la base par quiconque la lit. Un quatrième réglage,
`verification.storeIdentifier: "hashed"`, est posé à la racine : il couvre tout jeton de vérification
à venir, même si quelqu'un oublie l'option du plugin.

### Ce que Better Auth ne fait pas ici : les organisations

**Le plugin d'organisation n'est pas utilisé.** Les organisations, les adhésions, les rôles et les
invitations restent dans notre schéma, sous notre isolation, écrits par notre code. Quatre raisons,
toutes mesurées :

1. **Ses requêtes sont incompatibles avec notre isolation.** Accepter une invitation lit
   l'invitation, compte les membres et lit l'organisation à un moment où la personne n'est membre de
   rien : aucun contexte d'organisation ne peut être posé. Sous sécurité au niveau des lignes forcée,
   l'essai a rendu zéro ligne à chaque étape et refusé l'écriture de l'adhésion. La seule façon de
   le faire fonctionner serait un rôle porteur de `BYPASSRLS` — c'est-à-dire précisément ce que
   l'ADR 0013 nomme comme le seul moyen de contourner l'isolation.
2. **Ses trois rôles par défaut ne peuvent pas être supprimés.** Les rôles personnalisés s'ajoutent
   aux siens au lieu de les remplacer : une invitation au rôle `owner`, qui n'existe pas chez nous,
   est acceptée, puis échoue à l'acceptation contre notre contrainte, en renvoyant au client la
   requête SQL et ses paramètres.
3. **Son invitation révèle l'existence d'un compte par le temps de réponse.** Le chemin « compte
   existant » exécute une requête de plus ; mesure sur quatre-vingts itérations de chaque : +7 % de
   latence médiane. Aucune option ne l'égalise.
4. **Il faudrait de toute façon écrire une couche devant lui** pour valider les rôles, neutraliser
   les messages qui distinguent les cas, et répondre en temps constant. Autant écrire la moitié qui
   compte, et garder notre isolation intacte.

### Un rôle de connexion à part

Les quatre tables de Better Auth — comptes, sessions, vérifications, limitation — ne portent pas
d'organisation, et il n'y a rien à y cloisonner par organisation. Leur politique **borne le rôle**
et non la ligne : seul `jadwal_auth` les touche. Le rôle applicatif ne reçoit **aucun droit** sur les
sessions, les comptes liés et les vérifications. Un jeton de session ne lui est pas seulement
invisible, il lui est inaccessible, et la tentative échoue sur un refus de droit avant que la moindre
ligne soit examinée.

Dans l'autre sens, `jadwal_auth` écrit dans la table des comptes, qui est une table du métier. Ses
droits y sont bornés **colonne par colonne** : l'adresse, le nom, le drapeau de vérification,
l'image et l'horodatage. Jamais `is_super_admin`, que l'application relit à chaque requête pour
ouvrir l'administration. Une politique dit quelles lignes ; il fallait un droit pour dire quelles
colonnes.

### Les passkeys, ajoutées à l'étape 4

`@better-auth/passkey` (paquet séparé de `better-auth`, même version) fournit l'enregistrement et
l'authentification WebAuthn. Sa table `passkey` vit dans notre schéma, sous le rôle de connexion,
comme les sessions. Elle ne sert qu'aux **pouvoirs de super-admin** : les ouvrir à tous serait une
fonctionnalité de plus à tenir, sans besoin établi. L'ADR 0025 dit pourquoi elle est obligatoire
pour eux, et comment l'amorçage et le secours fonctionnent.

Le plugin expose ses vrais points d'entrée sous `/passkey/…` ; `addPasskey` et `signIn.passkey` sont
des enveloppes côté client. Ce sont les premiers que notre code garde, avant que Better Auth ne les
voie : un écran ne protège rien, seule la route protège.

### Le reste

- **Aucun mot de passe**, nulle part. La colonne que Better Auth exige reste vide.
- **Session de trente jours**, renouvelée à l'usage au-delà d'un jour, cookie signé, `HttpOnly`,
  `SameSite=Lax`, `Secure` dès que l'origine est en HTTPS. Le cache de session en cookie est
  **désactivé** : il masquerait une révocation jusqu'à son expiration, et il empêcherait le plafond
  de douze heures d'une session de super-admin de mordre à chaque requête (ADR 0025).
- **Identifiants en UUID v7 produits par l'application**, comme partout ailleurs (ADR 0014).
- **Aucune télémétrie.** Elle est désactivée par défaut, et nous le posons explicitement : une
  variable d'environnement suffirait sinon à la rallumer.
- **Aucune migration automatique.** Better Auth n'exécute aucun ordre de définition ; son outil de
  génération n'a servi qu'une fois, comme référence, et le schéma vit dans nos fichiers versionnés.

## Conséquences

- L'isolation reste entière : rien de ce qui touche à une organisation ne passe par une bibliothèque
  tierce.
- Nous portons le code des invitations et des rôles. C'est le prix, et c'est aussi ce qui permet de
  tenir la garantie de l'ADR 0017, qu'aucun plugin ne tenait.
- L'adaptateur vérifie en mémoire que notre schéma porte bien les colonnes qu'il attend, et lève au
  démarrage sinon. Deux colonnes n'ont pas d'usage chez nous — la vérification d'adresse et l'image
  de profil — et existent parce qu'il les exige.
- Une mise à jour de Better Auth qui ajouterait une colonne se verrait au démarrage, pas en
  production : c'est un filet, à surveiller en intégration continue.
- L'origine publique ne doit pas porter de chemin. Si elle en porte un, la bibliothèque abandonne son
  chemin de base, les liens produits pointent à côté, et toutes ses routes répondent que l'origine
  est invalide. Le code refuse de démarrer dans ce cas plutôt que de le découvrir en production.

## Statut

Accepté, 2026-09-20. Étape 3 de la feuille de route. Corrige l'ADR 0006 sur un point : Better Auth
fournit la connexion et la limitation de débit, mais ni les organisations, ni les invitations, ni les
rôles.

Révisé à l'étape 4 sur deux points : les courriels ne partent plus par AWS SES mais par SMTP
(ADR 0024), et les passkeys s'ajoutent aux liens magiques pour les seuls pouvoirs de super-admin
(ADR 0025).
