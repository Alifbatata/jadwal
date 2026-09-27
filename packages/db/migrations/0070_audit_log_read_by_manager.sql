-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Le journal ne se lit que par la personne responsable de l'organisation (étape 19, ADR 0046).
--
-- La politique de lecture du rôle applicatif (migration 0001) ne demandait que l'organisation du
-- contexte : tout membre lisait le journal. Or le journal nomme des personnes. L'écran Membres y
-- écrit l'adresse et le rôle de chaque personne invitée (`invitation.create`), l'acceptation y est
-- signée de la personne qui entre (`invitation.accept`), et un changement de rôle ou un retrait y
-- désigne l'adhésion touchée. Un éditeur qui le lisait par un appel direct reconstituait donc la
-- liste des membres, que la migration 0064 lui retire, et les invitations en attente, que la
-- migration 0059 lui retire.
--
-- La politique exige maintenant `jadwal.is_org_admin()`, comme la lecture des adhésions et des
-- invitations. Aucun écran ne lit le journal : l'application ne fait qu'y écrire, et l'écriture ne
-- change pas. Tout membre y ajoute ses entrées, signées de lui-même (migration 0063), sans les
-- relire : une insertion sans `returning` ne passe pas par la politique de lecture. Le super-admin
-- garde sa propre politique de lecture (ADR 0025), et le propriétaire purge sans lire, comme avant.
--
-- L'instruction est celle que Drizzle Kit produit pour le schéma (`src/schema/index.ts`), et
-- `meta/0070_snapshot.json` est l'instantané qui va avec. `ALTER POLICY` remplace l'expression à
-- l'identique : le rejeu ne change rien.

ALTER POLICY "audit_log_select" ON "audit_log" TO jadwal_app USING ("audit_log"."organization_id" = (select jadwal.current_org_id()) and (select jadwal.is_org_admin()));
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	lecture text;
BEGIN
	SELECT coalesce(qual, '') INTO lecture
	FROM pg_policies
	WHERE schemaname = 'public' AND tablename = 'audit_log' AND policyname = 'audit_log_select'
		AND cmd = 'SELECT' AND roles = ARRAY['jadwal_app']::name[];
	IF lecture IS NULL THEN
		RAISE EXCEPTION 'audit_log_select : manque, ou n''est plus au seul rôle applicatif';
	END IF;
	IF lecture NOT LIKE '%organization_id = ( SELECT %current_org_id()%) AND ( SELECT %is_org_admin()%'
		OR lecture LIKE '% OR %' THEN
		RAISE EXCEPTION 'audit_log_select : ne réserve pas la lecture du journal (%)', lecture;
	END IF;
	-- Aucune autre politique ne rouvre la lecture au rôle applicatif.
	IF EXISTS (
		SELECT 1 FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'audit_log' AND 'jadwal_app' = ANY (roles)
			AND cmd IN ('SELECT', 'ALL') AND policyname <> 'audit_log_select'
	) THEN
		RAISE EXCEPTION 'audit_log : une autre politique rouvre la lecture au rôle applicatif';
	END IF;
END
$verifie$;
