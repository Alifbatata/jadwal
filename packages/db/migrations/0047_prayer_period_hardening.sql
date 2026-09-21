-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Ce que Drizzle Kit n'émet pas pour l'étape 8 : le forçage de la sécurité au niveau des lignes sur
-- la table des périodes, ses droits, ses politiques d'entretien, et la contrainte qui interdit à
-- deux périodes de se chevaucher.

-- 1. Forçage. Drizzle sait activer, jamais forcer : sans `FORCE`, le propriétaire échapperait aux
--    politiques, et l'ADR 0019 ne vaudrait plus rien.
ALTER TABLE "prayer_period" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. Les droits.
--
--    Deux boucles de migrations plus anciennes les rendraient au rejeu : celle de `0034` accorde les
--    quatre opérations au super-admin sur toute table portant `organization_id`, celle de `0039`
--    accorde la lecture au rôle public à toute table portant une politique `%_public_select`. On les
--    écrit ici aussi, pour que la **première** application donne exactement le même résultat que le
--    rejeu — c'est la leçon de l'étape 7, où deux boucles avaient fait diverger les deux chemins.
GRANT SELECT, INSERT, UPDATE, DELETE ON "prayer_period" TO "jadwal_app";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "prayer_period" TO "jadwal_superadmin";
--> statement-breakpoint
GRANT SELECT ON "prayer_period" TO "jadwal_public";
--> statement-breakpoint
REVOKE ALL ON "prayer_period" FROM "jadwal_auth";
--> statement-breakpoint
REVOKE ALL ON "prayer_period" FROM PUBLIC;
--> statement-breakpoint

-- 3. Les politiques d'entretien du propriétaire. Mêmes quatre, même drapeau que partout ailleurs :
--    la boucle générique de `0019` les créerait au rejeu, et les écrire ici les rend identiques
--    dans les deux chemins.
DROP POLICY IF EXISTS "prayer_period_owner_select" ON "prayer_period";
--> statement-breakpoint
CREATE POLICY "prayer_period_owner_select" ON "prayer_period"
	AS PERMISSIVE FOR SELECT TO "jadwal_owner" USING (jadwal.maintenance());
--> statement-breakpoint
DROP POLICY IF EXISTS "prayer_period_owner_insert" ON "prayer_period";
--> statement-breakpoint
CREATE POLICY "prayer_period_owner_insert" ON "prayer_period"
	AS PERMISSIVE FOR INSERT TO "jadwal_owner" WITH CHECK (jadwal.maintenance());
--> statement-breakpoint
DROP POLICY IF EXISTS "prayer_period_owner_update" ON "prayer_period";
--> statement-breakpoint
CREATE POLICY "prayer_period_owner_update" ON "prayer_period"
	AS PERMISSIVE FOR UPDATE TO "jadwal_owner"
	USING (jadwal.maintenance()) WITH CHECK (jadwal.maintenance());
--> statement-breakpoint
DROP POLICY IF EXISTS "prayer_period_owner_delete" ON "prayer_period";
--> statement-breakpoint
CREATE POLICY "prayer_period_owner_delete" ON "prayer_period"
	AS PERMISSIVE FOR DELETE TO "jadwal_owner" USING (jadwal.maintenance());
--> statement-breakpoint

-- 4. Deux périodes d'une même organisation ne se chevauchent pas.
--
--    Une contrainte d'exclusion, et non une vérification dans l'écran : une période qui se
--    chevauche rendrait la résolution des heures ambiguë — deux lignes pour la même date, et la
--    réponse dépendrait de l'ordre de lecture. La base le refuse, quel que soit le chemin
--    d'écriture, avec le code `23P01`.
--
--    `btree_gist` est nécessaire pour mêler l'égalité sur `organization_id` au chevauchement de
--    plages. C'est une extension *trusted* depuis PostgreSQL 13 : le propriétaire non privilégié
--    peut la créer, ce qui a été mesuré avant d'écrire ce fichier.
--
--    `coalesce(to_date, 'infinity')` donne son sens à une période sans fin : « jusqu'à nouvel
--    ordre » chevauche tout ce qui vient après elle, donc la base empêche d'en ouvrir une seconde
--    sans avoir clos la première. C'est exactement ce qu'on veut dire.
CREATE EXTENSION IF NOT EXISTS "btree_gist";
--> statement-breakpoint
ALTER TABLE "prayer_period" DROP CONSTRAINT IF EXISTS "prayer_period_no_overlap_ex";
--> statement-breakpoint
ALTER TABLE "prayer_period" ADD CONSTRAINT "prayer_period_no_overlap_ex"
	EXCLUDE USING gist (
		"organization_id" WITH =,
		daterange("from_date", coalesce("to_date", 'infinity'::date), '[]') WITH &&
	);
--> statement-breakpoint

-- 5. Et on vérifie que la contrainte est bien là, sous le bon type.
--
--    Ce contrôle est **structurel** et non comportemental : une première version essayait d'insérer
--    deux périodes qui se chevauchent pour voir la base les refuser, et elle butait au rejeu sur les
--    périodes déjà présentes — celles des fixtures sont ouvertes, donc elles couvrent 2099 comme le
--    reste. C'est `test/prayer-period.test.ts` qui éprouve le comportement, sur ses propres données.
DO $verifie$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.prayer_period'::regclass
			AND conname = 'prayer_period_no_overlap_ex'
			AND contype = 'x'
	) THEN
		RAISE EXCEPTION 'la contrainte d''exclusion des périodes est absente';
	END IF;
END
$verifie$;
