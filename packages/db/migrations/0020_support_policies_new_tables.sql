-- @retire : ce fichier a été rejouable, il ne l'est plus. La migration 0035 supprime
-- `support_access`, donc les politiques de lecture conditionnelle qu'il pose n'ont plus d'objet. Il appartient à l'histoire
-- de la base, et le test de rejeu le laisse de côté — il ne cherche que `@rejouable`.
-- La lecture de support du super-admin, pour les tables d'organisation ajoutées à l'étape 3.
-- Même règle qu'à la migration 0010 : la lecture n'est ouverte que pendant une fenêtre déclarée
-- (ADR 0018), et aucun droit d'écriture n'est accordé.

DO $support$
DECLARE
	t record;
BEGIN
	FOR t IN
		SELECT c.relname FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_attribute a ON a.attrelid = c.oid
		WHERE n.nspname = 'public' AND c.relkind = 'r'
			AND a.attname = 'organization_id' AND a.attnum > 0 AND NOT a.attisdropped
			AND c.relname NOT IN ('support_access', 'audit_log')
		ORDER BY c.relname
	LOOP
		EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
			t.relname || '_superadmin_support_select', t.relname);
		EXECUTE format(
			'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO "jadwal_superadmin" '
			|| 'USING ("organization_id" = (select jadwal.current_org_id()) '
			|| 'AND jadwal.support_access_open("organization_id"))',
			t.relname || '_superadmin_support_select', t.relname);
		EXECUTE format('GRANT SELECT ON public.%I TO "jadwal_superadmin"', t.relname);
	END LOOP;
END
$support$;
