-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Les écritures d'adhésion reviennent au rôle applicatif, et la dernière personne responsable d'une
-- organisation ne peut être ni retirée ni rétrogradée (étape 3).

GRANT INSERT, UPDATE ON "membership" TO "jadwal_app";
--> statement-breakpoint
-- La règle est portée par la base, donc elle tient quel que soit le code appelant : une interface
-- qui oublierait de la vérifier échouerait au lieu de laisser une organisation sans responsable.
--
-- Aux droits de l'appelant, et non du définisseur. À droits du définisseur, la fonction tournerait
-- sous le propriétaire — lui-même soumis à la sécurité au niveau des lignes depuis l'ADR 0019, et
-- sans politique de lecture hors de son drapeau d'entretien : le comptage rendrait toujours zéro et
-- le déclencheur refuserait tout. Aux droits de l'appelant, chacun voit ce qu'il faut : le rôle
-- applicatif voit les adhésions de l'organisation de son contexte, qui est celle de la ligne visée ;
-- le super-admin les voit toutes ; le propriétaire les voit sous son drapeau. Un appelant qui ne
-- verrait pas l'organisation se verrait refuser l'écriture — le refus va dans le bon sens.
-- `search_path` est figé : sans cela, un schéma temporaire posé par l'appelant pourrait détourner
-- le nom `membership`.
CREATE OR REPLACE FUNCTION "jadwal"."refuse_last_org_admin"() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $fn$
DECLARE
	restants integer;
BEGIN
	-- Rien à vérifier quand la ligne visée n'est pas celle d'une personne responsable, ni quand la
	-- modification la laisse responsable.
	IF TG_OP = 'UPDATE' AND NEW."role" = 'org_admin' THEN RETURN NEW; END IF;
	IF TG_OP = 'UPDATE' AND OLD."role" <> 'org_admin' THEN RETURN NEW; END IF;
	IF TG_OP = 'DELETE' AND OLD."role" <> 'org_admin' THEN RETURN OLD; END IF;

	-- L'organisation elle-même est en train de disparaître : la cascade efface ses adhésions, et il
	-- n'y a plus personne à protéger. PostgreSQL retire la ligne parente avant de déclencher les
	-- actions de clé étrangère, donc elle est déjà absente ici.
	IF NOT EXISTS (SELECT 1 FROM public."organization" WHERE "id" = OLD."organization_id") THEN
		RETURN OLD;
	END IF;

	SELECT count(*) INTO restants FROM public."membership"
	WHERE "organization_id" = OLD."organization_id" AND "role" = 'org_admin' AND "id" <> OLD."id";

	IF restants = 0 THEN
		RAISE EXCEPTION 'last org_admin of organisation %', OLD."organization_id"
			USING ERRCODE = 'restrict_violation';
	END IF;

	IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END
$fn$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "jadwal"."refuse_last_org_admin"() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "membership_last_org_admin" ON "membership";
--> statement-breakpoint
CREATE TRIGGER "membership_last_org_admin"
	BEFORE DELETE OR UPDATE OF "role" ON "membership"
	FOR EACH ROW EXECUTE FUNCTION "jadwal"."refuse_last_org_admin"();
