-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- L'auteur d'une entrée du journal est la personne du contexte (étape 19, ADR 0046).
--
-- La politique d'insertion du rôle applicatif (migrations 0001 puis 0004) ne demandait qu'une
-- organisation, celle du contexte, et un auteur visible, par la garde des personnes désignées
-- (ADR 0013). Tout membre de l'organisation est visible de ses collègues : une éditrice pouvait donc
-- écrire au journal une entrée qui nommait un collègue comme auteur, ou n'en nommait aucun. Le
-- journal dit qui a fait quoi (ADR 0015) ; il ne le dit plus si l'auteur se choisit.
--
-- La politique exige maintenant que l'auteur soit la personne du contexte, celle que l'application
-- pose à partir de la session (`withSessionOrg`). Une entrée sans auteur, ou écrite sans personne
-- dans le contexte, est refusée : `current_user_id()` rend alors NULL, et la comparaison aussi. La
-- garde des personnes désignées disparaît de cette politique : la personne du contexte est toujours
-- visible d'elle-même, elle n'aurait plus rien à ajouter.
--
-- Les chemins qui écrivent au journal, relevés un par un :
-- - l'application, sous le rôle applicatif : `record` (`apps/web/src/lib/server/audit.ts`) signe
--   toujours de `context.userId`, la personne de la session, et l'acceptation d'une invitation de la
--   personne qui accepte, qu'elle vient de poser dans le contexte ;
-- - le super-admin : sa politique (`audit_log_superadmin_insert`, migration 0027) ne change pas. Il
--   signe de sa propre identité, que `withSessionOrg` pose comme pour tout le monde (ADR 0025), et la
--   base ne le contient pas davantage ici qu'ailleurs (`docs/SECURITE.md`, barrière 10) ;
-- - aucun déclencheur n'écrit au journal, et aucune fonction du schéma `jadwal` non plus ;
-- - le propriétaire y écrit sous son drapeau d'entretien (`audit_log_owner_insert`), et le purge
--   (`jadwal.purge_audit_log`) : ses politiques ne changent pas.
--
-- L'instruction est celle que Drizzle Kit produit pour le schéma (`src/schema/index.ts`), et
-- `meta/0063_snapshot.json` est l'instantané qui va avec. `ALTER POLICY` remplace l'expression à
-- l'identique : le rejeu ne change rien.

ALTER POLICY "audit_log_insert" ON "audit_log" TO jadwal_app WITH CHECK ("audit_log"."organization_id" = (select jadwal.current_org_id()) and "audit_log"."actor_id" = (select jadwal.current_user_id()));
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	controle text;
BEGIN
	SELECT coalesce(with_check, '') INTO controle
	FROM pg_policies
	WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'audit_log_insert'
		AND cmd = 'INSERT' AND roles = ARRAY['jadwal_app']::name[];
	IF controle IS NULL THEN
		RAISE EXCEPTION 'audit_log_insert : manque, ou n''est plus au seul rôle applicatif';
	END IF;
	IF controle NOT LIKE '%organization_id = ( SELECT %current_org_id()%'
		OR controle NOT LIKE '%actor_id = ( SELECT %current_user_id()%'
		OR controle LIKE '% OR %' THEN
		RAISE EXCEPTION 'audit_log_insert : l''auteur doit être la personne du contexte (%)', controle;
	END IF;
	-- Le journal reste en ajout seul pour le rôle applicatif (ADR 0015).
	IF EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'audit_log' AND 'jadwal_app' = ANY (roles)
			AND cmd NOT IN ('SELECT', 'INSERT')
	) OR has_table_privilege('jadwal_app', 'public.audit_log', 'UPDATE, DELETE, TRUNCATE') THEN
		RAISE EXCEPTION 'audit_log : le rôle applicatif peut modifier ou supprimer';
	END IF;
END
$verifie$;
