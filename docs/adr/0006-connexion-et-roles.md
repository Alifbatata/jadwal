# ADR 0006 : Connexion et rôles

## Contexte

`jadwal` est alimenté par les responsables d'une organisation : en pratique, 2 à 3 responsables
par mosquée. Les seules données personnelles du système sont les emails de ces responsables ;
côté public, il n'y a aucune donnée personnelle, aucun cookie et aucune inscription aux cours.

La V1 vise les mosquées, gratuitement. Plus tard, d'autres organisations, en payant. Aucun
paiement n'est codé en V1, mais le modèle doit prévoir dès le départ un plan par organisation et
la possibilité d'offrir le service à une organisation.

Trois besoins distincts apparaissent : créer les organisations et décider de la gratuité, gérer
les membres d'une organisation, saisir et modifier les cours. Les modifications doivent pouvoir
être retracées (qui, quoi, quand) et annulées.

Règles du projet qui s'appliquent ici : aucune dépendance sans besoin immédiat, aucun secret
dans le dépôt, identifiants passés par des variables d'environnement documentées dans
`.env.example`.

## Décision

Trois rôles existent :

- `superadmin` : crée les organisations, attribue la gratuité ;
- `org_admin` : invite et retire les membres de son organisation ;
- `editor` : saisit et modifie les cours.

Les responsables se connectent par un lien magique reçu par mail, sans mot de passe.

La connexion repose sur Better Auth, qui fournit le lien magique, les organisations, les
invitations, les rôles et la limitation de débit. Les mails sont envoyés par AWS SES.

Un journal des modifications enregistre qui a modifié quoi et quand, et permet un retour arrière.

Chaque organisation porte un `plan` et un statut « offert » que seul le `superadmin` peut
attribuer. Aucun paiement n'est codé en V1.

## Conséquences

- Le système ne gère aucun mot de passe.
- La création d'une organisation et l'attribution de la gratuité passent par le `superadmin` ;
  la gestion des membres reste dans l'organisation, entre les mains de l'`org_admin`.
- Better Auth et AWS SES n'entrent dans le dépôt qu'à l'étape 3, quand le besoin devient
  immédiat ; rien n'est installé à l'étape 0.
- Les identifiants AWS SES ne figurent pas dans le dépôt : ils passent par des variables
  d'environnement documentées dans `.env.example`.
- Le `plan` et le statut « offert » sont présents dans le modèle dès la V1, sans aucun code de
  paiement ; le paiement est reporté à plus tard dans la feuille de route.
- Toute modification est retraçable et réversible grâce au journal.
- Les passkeys arrivent plus tard dans la feuille de route.

## Statut

Accepté, 2026-09-19. Étape 3 de la feuille de route : connexion, organisations, rôles,
invitations, super-admin, journal.

Révisé à l'étape 3 par l'ADR 0016 (Better Auth ne fournit ni les organisations, ni les invitations,
ni les rôles), et à l'étape 4 par l'ADR 0024 (les courriels partent par SMTP, plus par AWS SES) et
l'ADR 0025 (le super-admin a tous les droits, et une passkey est exigée pour les exercer).
