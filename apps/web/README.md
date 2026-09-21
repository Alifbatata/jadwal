# @jadwal/web

L'application SvelteKit de `jadwal` : la connexion (étape 3), l'espace des responsables (étape 4),
les pages publiques, l'API publique et le flux agenda (étape 5). Le widget arrive à l'étape 6.

## Principes

- **Aucun mot de passe.** La connexion se fait par un lien reçu par courriel, valable quinze minutes
  et utilisable une fois (ADR 0016). Les pouvoirs de super-admin exigent en plus une **passkey**
  (ADR 0025).
- **Le contexte d'organisation vient de la session**, relue côté serveur à chaque requête, jamais
  d'un paramètre d'URL, d'un en-tête ou d'un champ de formulaire. `withSessionOrg` est le seul
  chemin par lequel une route touche aux données d'une organisation — pour un responsable comme pour
  un super-admin. Seule la connexion change, et donc les politiques qui s'appliquent.
- **Toutes les écritures passent par des form actions** et fonctionnent sans JavaScript. Les tests
  postent avec un en-tête `accept: text/html`, ce qui est le chemin d'un navigateur sans JavaScript ;
  sans cet en-tête, SvelteKit répond au protocole de ses formulaires améliorés et rend un code 200
  qui porte l'échec dans son corps.
- **Aucun aperçu n'est recalculé ici.** Les sept prochains jours, le résumé d'un cours, les
  prochaines dates : tout vient de `@jadwal/core` (ADR 0021).
- **Quatre connexions à la base, quatre périmètres** : celle de la connexion ne touche qu'aux
  sessions et aux passkeys, celle de l'application ne voit rien hors d'un contexte d'organisation,
  celle du super-admin voit toutes les organisations mais reste bornée à celle de son contexte, et
  celle du côté public ne voit que les organisations actives et les cours publiés — en lecture seule
  (ADR 0026).
- **Le côté public ne lit pas la session.** Les routes `/m/**` et `/api/v1/**` ne consultent pas
  Better Auth du tout : il n'y a rien à oublier de ne pas lire (ADR 0027).

## Pages

| Route                  | À quoi elle sert                                                        |
| ---------------------- | ----------------------------------------------------------------------- |
| `/`                    | À venir : les sept prochains jours ; annuler, déplacer, rétablir        |
| `/cours`               | la liste, les pauses ; `/cours/nouveau` et `/cours/[id]` pour la saisie |
| `/partager`            | lien public, message de la semaine, code à coller, QR code              |
| `/membres`             | membres et invitations (`org_admin`)                                    |
| `/reglages`            | nom, fuseau, couleur, langues, salles, formule d'accueil (`org_admin`)  |
| `/connexion`           | demander un lien ; la réponse est la même pour toute adresse            |
| `/organisations`       | choisir son organisation, et accepter les invitations reçues            |
| `/super-admin`         | organisations, plan, entrée dans un espace, lien de secours             |
| `/super-admin/passkey` | enregistrer une passkey, se connecter avec, en supprimer                |
| `/deconnexion`         | fermer la session, ou toutes les sessions                               |

### Côté public (étape 5)

| Route                             | À quoi elle sert                             |
| --------------------------------- | -------------------------------------------- |
| `/m/[slug]`                       | le programme : Semaine, Tous les cours, Mois |
| `/m/[slug]/[langue]`              | la même page en `de`, `it` ou `ar`           |
| `/m/[slug]/[[langue]]/cours/[id]` | la page d'un cours, à son propre lien        |
| `/m/[slug]/[[langue]]/agenda`     | comment s'abonner au calendrier              |
| `/m/[slug]/agenda.ics`            | le flux agenda lui-même                      |
| `/api/v1/...`                     | l'API publique, décrite dans `docs/API.md`   |

Ces pages n'embarquent **aucun** JavaScript (`csr = false`), ne chargent rien d'un autre domaine —
police comprise — et sont les seules du service à ne pas porter `noindex`. Elles s'affichent dans
l'iframe d'un site tiers ; le reste du service, jamais (ADR 0027).

## Configuration

Toutes les variables sont documentées dans `.env.example` à la racine. Trois comptent plus que les
autres :

- `ORIGIN` : l'origine publique, **sans chemin**. Avec un chemin, Better Auth abandonne son chemin de
  base, les liens produits pointent à côté, et toutes ses routes répondent que l'origine est
  invalide. Le serveur refuse de démarrer plutôt que de le découvrir en production. C'est aussi
  cette origine qui sert d'identifiant de partie de confiance aux passkeys : la changer invalide
  celles qui existent.
- `BETTER_AUTH_SECRET` : signe les cookies de session. Obligatoire.
- `JADWAL_IP_HEADER` : l'en-tête que le mandataire inverse **réécrit** avec l'adresse du client. Sans
  mandataire de confiance, un client choisirait son propre seau de limitation de débit.
- `JADWAL_DB_PUBLIC_PASSWORD` : le rôle du côté public. Il ne donne accès qu'à ce qui est déjà
  public, mais c'est un mot de passe de plus à poser (ADR 0026).
- `JADWAL_EMBED_ORIGINS` : facultatif. Sans lui, les pages publiques s'affichent dans le cadre de
  n'importe quel site ; avec lui, seulement dans ceux qui y figurent.

Derrière un mandataire, `ORIGIN` doit être en `https://`, sans quoi l'en-tête de transport strict ne
part jamais et la protection contre la soumission d'un formulaire venu d'ailleurs compare une origine
fausse — toutes les soumissions échoueraient alors en production.

## Courriel

Une interface à une seule méthode, deux implémentations. `MAIL_TRANSPORT=file` est le **défaut** : un
oubli de configuration écrit un fichier, il n'expédie rien. Chaque message est un fichier JSON écrit
sous un nom temporaire puis renommé — un seul fichier en lignes JSON se déchire en écriture
concurrente, ce qui a été mesuré. En production, `MAIL_TRANSPORT=smtp` (ADR 0024).

Le port décide du chiffrement : **587** commence en clair et bascule par STARTTLS, que nous exigeons
même si le serveur ne l'annonce pas ; **465** parle TLS d'emblée. Se tromper de port fait échouer la
connexion, jamais partir un message en clair.

### Ce qu'il faut publier en DNS pour que les messages arrivent

Un serveur SMTP tiers envoie en votre nom : sans ces trois enregistrements, vos messages partent en
indésirable, ou ne partent pas. Les valeurs exactes sont données par votre fournisseur.

| Enregistrement | Où                                 | À quoi il sert                                                    |
| -------------- | ---------------------------------- | ----------------------------------------------------------------- |
| **SPF**        | `TXT` sur le domaine               | dit quels serveurs ont le droit d'envoyer pour ce domaine         |
| **DKIM**       | `TXT` sur `<sélecteur>._domainkey` | signe chaque message ; le destinataire vérifie la signature       |
| **DMARC**      | `TXT` sur `_dmarc`                 | dit quoi faire quand SPF ou DKIM échoue, et où envoyer les bilans |

Exemple pour Infomaniak, à adapter :

```
@                 TXT  "v=spf1 include:spf.infomaniak.ch -all"
<sélecteur>._domainkey TXT  "v=DKIM1; k=rsa; p=…"      (valeur donnée par le fournisseur)
_dmarc            TXT  "v=DMARC1; p=quarantine; rua=mailto:postmaster@votre-domaine"
```

Un seul enregistrement SPF par domaine : deux lignes `v=spf1` invalident les deux. Commencez DMARC en
`p=none` le temps de lire les bilans, puis passez à `p=quarantine`.

**Le projet ne fait pas tourner son propre serveur d'envoi.** Un MTA à soi demande une adresse IP à
la réputation propre, une surveillance des listes noires, des boucles de retour et un travail
d'exploitation continu — pour quelques dizaines de messages par jour. Le fournisseur s'en charge, et
SMTP nous laisse en changer sans toucher au code.

## Passkeys

Seuls les comptes super-admin en enregistrent, et elles sont **obligatoires** pour exercer leurs
pouvoirs (ADR 0025). Trois règles :

1. **Amorçage** : tant que le compte n'a aucune passkey, une session ordinaire peut en enregistrer
   une. Dès qu'il en a une, enregistrer ou supprimer exige une session **déjà ouverte par passkey**.
2. **Plusieurs par compte** : perdre son téléphone ne doit pas fermer le service.
3. **Secours** : quand toutes sont perdues, le propriétaire les efface côté base, ce qui rouvre
   l'amorçage :

   ```sql
   begin;
   set local jadwal.maintenance = 'on';
   delete from "passkey" where "user_id" = '…';
   commit;
   ```

   Jamais de question secrète, jamais de code envoyé par courriel : l'un et l'autre ramèneraient la
   boîte aux lettres au centre, ce que la passkey est précisément là pour éviter.

`/super-admin/passkey` est la **seule** page qui exige JavaScript : WebAuthn est une API du
navigateur, il n'existe pas de formulaire qui crée une passkey. La page le dit plutôt que d'afficher
un bouton inerte.

## Lancer

```
docker compose -f docker-compose.dev.yml up -d db
pnpm --filter @jadwal/db run bootstrap
pnpm --filter @jadwal/db run migrate
pnpm --filter @jadwal/db run seed
pnpm --filter @jadwal/web run dev
```

Les courriels partent dans `.courriels/` à la racine, un fichier par message.

## Tests

```
pnpm build                    # les tests d'accès lancent le serveur construit
pnpm --filter @jadwal/web test
```

Deux ensembles : les tests unitaires (`src/**/*.test.ts`) et ceux qui lancent un **vrai serveur**
contre un **vrai PostgreSQL** (`tests/**/*.test.ts`). Ces derniers construisent leur propre base, la
détruisent à la fin, et suivent le chemin complet : demande de lien, message écrit, lien suivi,
session posée, second usage refusé, lien expiré refusé, cours créé, séance annulée, déplacée,
rétablie. Si le serveur n'est pas construit, la préparation le dit et échoue ; elle ne passe jamais
en silence.

La cérémonie WebAuthn, elle, n'existe que dans un navigateur : les tests posent la preuve de passkey
directement dans la session, comme le point d'entrée du plugin le ferait, et vérifient d'abord
qu'une session **sans** cette preuve n'obtient aucun pouvoir.

Licence : AGPL-3.0-or-later (voir `LICENSE` à la racine du dépôt).
