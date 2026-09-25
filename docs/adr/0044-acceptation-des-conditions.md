# 0044 : l'acceptation des conditions d'utilisation

- Statut : accepté
- Date : 2026-09-22
- Complète : [0013](0013-isolation-par-rls-et-contexte-par-transaction.md),
  [0020](0020-retention-du-journal-d-audit.md), [0025](0025-super-admin-pouvoirs-complets.md),
  [0041](0041-ce-que-la-base-garde-vraiment-d-une-personne.md)

## Contexte

Il n'existe aucun contrat signé avec chaque organisation. `docs/CONDITIONS.md` était publié dans le
dépôt, mais le service ne le montrait nulle part et ne demandait à personne de l'accepter. Rien ne
disait donc qui avait lu quelle version du texte.

Trois questions à trancher : qui accepte (l'organisation, ou chaque personne qui a accès à son
espace), ce qui est gardé, et combien de temps.

## Décision

**Chaque personne accepte, organisation par organisation.** Une table `terms_acceptance` porte
l'organisation, la personne, la version et le moment. Elle est rattachée à l'adhésion par une clé
étrangère en cascade : quand la personne quitte l'organisation, quand son compte est supprimé ou
quand l'organisation est supprimée, son acceptation part avec elle, sans purge à écrire.

**Insertion seule, moment posé par la base.** Le rôle applicatif lit et insère ses propres lignes,
et rien d'autre : ni modification ni suppression. L'insertion lui est accordée colonne par colonne,
sans `accepted_at`, que la base remplit elle-même (`default now()`) : une valeur fournie par
l'application est refusée, comme pour le journal (ADR 0020). L'application écrit donc l'insertion
en SQL brut ; le constructeur de Drizzle nomme la colonne, et la base le refuse.

**Le moment posé par la base est le début de la transaction.** `now()` rend l'heure à laquelle la
transaction s'est ouverte, pas celle de l'écriture : c'est le même procédé, et la même limite, que
pour le journal d'audit (ADR 0020). Une transaction de l'application dure le temps d'une requête,
et l'écart est de cet ordre. Un rôle applicatif compromis qui garderait une transaction ouverte
daterait l'acceptation plus tôt que l'écriture, mais jamais d'avant l'ouverture de sa transaction.

**La version est la date de mise à jour du texte, écrite en ISO** (`2026-09-22`). C'est déjà ce que
le pied du PDF appelle la version. Changer la date du texte, c'est en publier une nouvelle version,
et **le service demande à nouveau l'accord de chacun** à sa prochaine entrée dans l'espace.

**Une seule porte.** Le contrôle vit dans `mustBeInOrganisation`, par où passent toutes les pages et
toutes les actions de l'espace des responsables. Tant que la personne n'a pas accepté la version en
cours, elle est renvoyée vers `/conditions/accepter`, qui montre le texte entier et un bouton.
**Tous les rôles y passent**, éditeurs compris : ce sont eux aussi qui publient.

**Le super-admin en est exempté**, avec ses pouvoirs comme sans eux, et même si son compte est
membre d'une organisation : c'est l'exploitant, et c'est lui qui propose ce texte.

**Le texte se lit avant tout compte.** La page `/conditions` est ouverte à tous, sans session et
sans JavaScript, et reste `noindex`. Trois liens y mènent : sous le formulaire de connexion, dans le
pied de chaque page de l'espace des responsables, et dans le pied de la page publique d'une
organisation. Ce dernier est écrit dans la langue de la page, mais les conditions n'existent qu'en
français, et le lien le dit par `hreflang`. Il s'ouvre toujours dans un nouvel onglet : la page des
conditions refuse d'être encadrée, et la page publique vit souvent dans un cadre, celui du widget ou
celui qu'une organisation pose à la main.

**Le texte vient du fichier du dépôt, à la construction.** `apps/web/src/lib/server/conditions.ts`
importe `docs/CONDITIONS.md` et le rend avec le module du PDF (`apps/web/src/lib/conditions/
rendu.js`) : ce que le juriste a lu est, au caractère près, ce que les organisations acceptent. La
version en découle, et une date illisible lève une erreur plutôt que d'inventer une version.
L'image de production reçoit ce seul fichier de `docs/` (`.dockerignore`) : sans lui, elle ne se
construit pas.

## Conséquences

- Une lecture de plus chaque fois que le contexte est relu, sous le contexte de l'organisation et de
  la personne : deux fois par page de l'espace, pour la coquille et pour la page. Le super-admin ne
  la paie pas.
- Pendant que l'acceptation manque, la coquille masque la navigation de l'espace : chacun de ses
  liens ramènerait au même écran. Une personne membre de plusieurs organisations perdrait alors
  tout chemin vers les autres : pour elle seule, l'écran porte avant le texte un lien « Choisir une
  autre organisation », vers `/organisations`. Cette page ne passe pas par la porte ; le choix
  fait, c'est la porte de l'autre organisation qui s'applique.
- La clé vers l'adhésion ne dit à personne qui a accepté. Elle se vérifie aussi quand la personne
  ou l'organisation d'une adhésion change, et le nom de la contrainte dans l'erreur le dirait : le
  rôle applicatif ne modifie donc d'une adhésion que le rôle et sa date (migration 0053, voir
  l'addendum de l'ADR 0013). Le super-admin le peut encore, mais il lit déjà les acceptations de
  l'organisation où il est entré. La clé reste `no action` à la modification : avec `cascade`,
  l'acceptation suivrait l'adhésion vers une personne qui n'a rien accepté.
- La preuve d'une acceptation ne survit pas à l'adhésion. Si une organisation retire une personne,
  la base ne garde plus son acceptation ; les sauvegardes chiffrées la gardent 182 jours au plus.
  C'est la question posée au juriste (point 10).

## Ce qui n'est pas fait

- **Aucune copie n'est envoyée par courriel.** Le service n'envoie de courriel que pour la connexion
  et les invitations.
- **Aucune écriture au journal des modifications.** Le journal est gardé vingt-quatre mois : une
  acceptation qui y serait écrite survivrait à l'adhésion, et la phrase « effacée avec l'adhésion »
  de `docs/CONDITIONS.md` deviendrait fausse.
- **Pas d'acceptation au nom de l'organisation.** Chaque personne n'accepte que pour elle-même.
