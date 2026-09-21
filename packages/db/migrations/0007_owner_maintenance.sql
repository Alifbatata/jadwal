-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Politiques de maintenance du propriétaire (ADR 0019). Écrit à la main : Drizzle Kit ne connaît
-- pas ce rôle, qui n'apparaît dans aucune définition de table.
--
-- Le propriétaire n'est plus superutilisateur : la sécurité au niveau des lignes s'applique donc
-- aussi à lui, forçage compris. C'est tout l'intérêt de l'opération, et c'est aussi son coût — sans
-- politique le nommant, il ne peut plus rien écrire. Le silence serait le pire : une insertion
-- refusée lève une erreur, mais un `update` ou un `delete` refusé rend simplement « 0 ligne », sans
-- rien dire. Un script d'entretien croirait avoir travaillé.
--
-- D'où un drapeau, posé pour la seule durée d'une transaction :
--
--     begin;
--     set local jadwal.maintenance = 'on';
--     ...
--     commit;
--
-- Hors de ce drapeau, le propriétaire est en refus par défaut, y compris pour une requête tapée par
-- erreur dans une console de production. Ce n'est pas une muraille — il peut poser le drapeau quand
-- il veut — mais c'est explicite, transactionnel, et sans verrou. La solution écartée était
-- `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` le temps d'une transaction : elle prend un verrou
-- exclusif qui bloque toute lecture concurrente, et un `commit` mal placé laisse la table sans
-- protection, définitivement et sans le moindre message.

CREATE OR REPLACE FUNCTION "jadwal"."maintenance"() RETURNS boolean
LANGUAGE sql STABLE
AS $fn$
	SELECT current_setting('jadwal.maintenance', true) = 'on'
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."maintenance"() FROM PUBLIC;
--> statement-breakpoint
-- Les politiques sont posées pour chaque table du schéma, sans en nommer aucune : une table ajoutée
-- par une migration ultérieure recevra les siennes dans cette migration-là, et le test de catalogue
-- échoue si on l'oublie.
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
		ORDER BY c.relname
	LOOP
		-- Une politique par opération, jamais une seule qui les couvre toutes : `FOR ALL` se cumule
		-- en OU avec les autres et promeut silencieusement son `USING` en `WITH CHECK` (ADR 0013).
		-- Le journal d'audit reste en ajout seul, même pour le propriétaire (ADR 0015) : sa seule
		-- suppression autorisée est la purge au-delà de vingt-quatre mois, posée par l'ADR 0020.
		FOR op IN
			SELECT * FROM (VALUES
				('select', 'using'), ('insert', 'with check'),
				('update', 'both'), ('delete', 'using')
			) AS v(operation, clause)
		LOOP
			CONTINUE WHEN t.relname = 'audit_log' AND op.operation IN ('update', 'delete');
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
