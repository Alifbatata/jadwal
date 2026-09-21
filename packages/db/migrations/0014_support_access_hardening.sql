-- @retire : ce fichier a été rejouable, il ne l'est plus. La migration 0035 supprime
-- `support_access`, donc les contraintes de la fenêtre d'accès n'ont plus d'objet. Il appartient à l'histoire
-- de la base, et le test de rejeu le laisse de côté — il ne cherche que `@rejouable`.
-- Durcissement de la table d'accès de support, et retrait des écritures d'adhésion au super-admin.
-- Drizzle Kit n'émet ni le forçage de la RLS ni les droits.

ALTER TABLE "support_access" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "support_access" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Attacher une personne est revenu au rôle applicatif, sous la forme « on ne s'attache que
-- soi-même » (ADR 0017) : le super-admin n'écrit plus dans `membership`. Il garde la lecture et le
-- retrait, qui ne révèlent rien qu'il ne puisse déjà voir.
REVOKE INSERT, UPDATE ON "membership" FROM "jadwal_superadmin";
