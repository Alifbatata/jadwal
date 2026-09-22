# 0041 : ce que la base garde vraiment d'une personne

- Statut : accepté
- Date : 2026-09-22
- Complète : [0009](0009-vie-privee.md), [0017](0017-invitation-sans-fuite-d-information.md),
  [0020](0020-retention-du-journal-d-audit.md), [0036](0036-taches-periodiques-et-veille.md)

## Contexte

L'ADR 0009 affirme, et `docs/CONDITIONS.md` le répétait aux organisations, que **l'adresse
électronique est la seule donnée personnelle du service**. L'étape 13 a confronté cette phrase au
schéma, colonne par colonne. Elle était fausse, et de trois façons différentes.

**1. Chaque session gardait l'adresse IP et le navigateur.** `session.ip_address` et
`session.user_agent` sont écrits par Better Auth à la création de chaque session, sans que rien dans
notre code le demande ni le désactive. Ils n'étaient mentionnés dans aucun document. Pire : le
durcissement de l'étape 9, en déclarant les mandataires de confiance, a appris à Better Auth à
**résoudre la vraie adresse du visiteur** au lieu de retomber sur un seau partagé. Le durcissement a
rendu la donnée exacte.

**2. Rien n'effaçait une session.** Better Auth ne supprime une session expirée que lorsque son jeton
lui est représenté. Un navigateur qu'on ferme laisse sa ligne pour toujours, avec son adresse. Et
cette ligne fantôme bloquait `purge_orphan_accounts`, qui exige `NOT EXISTS (session)` : le compte
sans organisation qu'elle retenait ne partait jamais non plus. Les deux défauts se renforçaient.

**3. Un lien de connexion non cliqué gardait l'adresse en clair.** Le plugin de lien magique écrit
`JSON.stringify({ email, name })` dans `verification.value`. Les deux réglages que nous avions posés,
`storeToken: 'hashed'` et `storeIdentifier: 'hashed'`, ne couvrent que l'identifiant, jamais la
valeur. La ligne part à la consommation du lien ; un lien qu'on ne clique pas la laisse indéfiniment.

Et une invitation restée en attente au-delà de sa date n'était plus listée par l'écran des membres,
qui filtre sur `expires_at > now()` : plus personne ne pouvait l'annuler, et aucune purge ne la
visait. Son adresse restait pour toujours.

## Décision

**La liste des données personnelles est écrite, et le code la tient.**

Une session ne garde **ni adresse IP ni navigateur**. Un crochet de base de données les vide avant
l'écriture :

```ts
databaseHooks: {
	session: {
		create: {
			before: async (session) => ({ data: { ...session, ipAddress: '', userAgent: '' } });
		}
	}
}
```

Ce crochet plutôt que `advanced.ipAddress.disableIpTracking`, parce que cette option coupe la
résolution de l'adresse **partout**, y compris pour le limiteur de débit, qui retomberait sur un seau
partagé : tout le monde punirait tout le monde. Ici l'adresse est résolue, elle sert à compter les
abus le temps de la requête, et elle n'est pas rangée. Pour le navigateur il n'existe aucune option :
ce crochet est le seul levier.

**Trois purges de plus**, et une élargie (migration 0049) :

| Ce qui part                            | Quand                 | Comment                                                                      |
| -------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| les sessions expirées                  | dès l'expiration      | `purge_expired_sessions`, politique `expires_at < now()`                     |
| les vérifications expirées             | dès l'expiration      | `purge_expired_verifications`, même forme                                    |
| une invitation qui n'est plus en cours | 90 jours après sa fin | `purge_resolved_invitations`, élargie aux invitations en attente et expirées |

**Ces tables perdent leur politique de suppression d'entretien.** C'est la partie du travail qui ne
se devine pas : les politiques permissives se cumulent en OU (ADR 0013). Tant que
`session_owner_delete` existait, le propriétaire sous son drapeau d'entretien pouvait effacer
n'importe quelle session, et la purge, qui tourne justement sous ce drapeau, emportait **toutes** les
sessions au lieu des seules expirées. Un premier jet de la migration a fait exactement cela, et c'est
le test qui l'a montré. `session` et `verification` rejoignent donc `audit_log`, `admin_access_log` et
`rate_limit` : une seule porte de sortie, bornée.

**Ce que la base garde d'une personne, en entier** :

1. son adresse électronique, et son nom si elle l'a donné ;
2. le lien entre elle et une organisation ;
3. l'adresse d'une personne invitée, tant que l'invitation court ;
4. les entrées du journal des modifications qui la nomment ;
5. sa passkey, si elle en a enregistré une : clé publique et identifiant d'authentificateur ;
6. une empreinte de son adresse IP dans le compteur d'abus, calculée avec le secret de session.

Le nom d'un intervenant, écrit par une organisation dans un champ libre, est une donnée personnelle
de plus, publiée volontairement. `docs/CONDITIONS.md` le dit à l'endroit où l'organisation décide.

## Ce que cela ne fait pas

**L'empreinte du compteur d'abus n'est pas un anonymat.** C'est un HMAC-SHA256 salé par le secret de
session, ce qui la met hors de portée de qui vole une base. Mais le secret vit sur la même machine :
qui a les deux peut retrouver une adresse IPv4 en essayant les quatre milliards. Le régime est la
pseudonymisation, et `docs/CONDITIONS.md` l'écrit désormais en toutes lettres plutôt que de dire
« non réversible ».

**Le journal des modifications garde des adresses en clair** dans ses colonnes `before` et `after`,
24 mois, bien après la purge de l'invitation qui les a produites. C'est le prix de la traçabilité que
l'ADR 0015 et l'ADR 0020 ont choisie, et il est assumé.

## Alternatives écartées

**Supprimer les deux colonnes de `session`.** L'adaptateur de Better Auth écrit ces champs sans
condition : une colonne absente ferait échouer chaque connexion. Les vider est la seule forme qui
tienne sans forker la bibliothèque.

**Garder l'adresse quelques jours « pour la sécurité ».** C'est l'argument qui justifie toutes les
collectes. Le service a déjà un compteur d'abus, qui ne garde qu'une empreinte et l'efface en un à
deux jours ; une adresse en clair dans une table sans purge n'ajoutait rien à la sécurité, seulement
au risque.
