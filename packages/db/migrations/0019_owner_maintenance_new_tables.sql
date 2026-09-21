-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Les politiques d'entretien du propriétaire pour les tables ajoutées à l'étape 3 (ADR 0019).
-- Sans elles, le propriétaire ne pourrait ni migrer leur contenu ni le relire, et un `update`
-- refusé rendrait « 0 ligne » sans rien dire.

DO $maintenance$
DECLARE
	t record;
	op record;
	owner_name text := current_user;
	policy_name text;
BEGIN
	FOR t IN
		SELECT c.relname FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND c.relkind = 'r'
			AND NOT EXISTS (
				SELECT 1 FROM pg_policy p
				-- Toute politique d'entretien, et non la seule lecture : une migration plus
				-- récente peut avoir retiré délibérément la lecture du propriétaire sur un
				-- journal (ADR 0020). Se fier à `_owner_select` faisait alors repasser cette
				-- boucle pour « table sans politique » et recréait ce qu'on venait d'enlever.
				WHERE p.polrelid = c.oid AND p.polname LIKE c.relname || '\_owner\_%'
			)
		ORDER BY c.relname
	LOOP
		FOR op IN
			SELECT * FROM (VALUES
				('select', 'using'), ('insert', 'with check'),
				('update', 'both'), ('delete', 'using')
			) AS v(operation, clause)
		LOOP
			policy_name := format('%s_owner_%s', t.relname, op.operation);
			EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, t.relname);
			EXECUTE format(
				'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR %s TO %I %s',
				policy_name, t.relname, op.operation, owner_name,
				CASE op.clause
					WHEN 'using' THEN 'USING (jadwal.maintenance())'
					WHEN 'with check' THEN 'WITH CHECK (jadwal.maintenance())'
					ELSE 'USING (jadwal.maintenance()) WITH CHECK (jadwal.maintenance())'
				END);
		END LOOP;
	END LOOP;
END
$maintenance$;
