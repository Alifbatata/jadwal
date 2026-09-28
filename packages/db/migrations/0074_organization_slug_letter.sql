-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Une adresse publique a au moins une lettre, et la base le tient (étape 20). La règle est décrite
-- dans `packages/db/README.md` et `docs/maquettes/super-admin.md`, le comptage qui la précède dans
-- l'addendum du 28.09.2026 de l'ADR 0019.
--
-- `organization_slug_ck` (migration 0003) ne demande que des minuscules, des chiffres et des traits
-- d'union : la base acceptait `2026` ou `12-34`. L'écran du super-admin les refuse depuis l'étape 19
-- (D6), parce que des chiffres seuls ne disent rien de l'organisation et ressemblent à une date ou à
-- un numéro. Un appel direct les écrivait encore. Une contrainte à part le refuse maintenant :
-- `organization_slug_letter_ck`, une lettre de `a` à `z` au moins une fois. Combinée à la forme de
-- 0003, c'est la règle de l'écran, `UNE_LETTRE` de `apps/web/src/routes/super-admin/public-address.ts`.
-- Celle de 0003 ne change pas. Elle est close par `is true`, comme toutes les autres (ADR 0013).
--
-- Avant l'étape 19, l'écran acceptait `2026`, et proposait `2` pour un nom arabe suivi d'un
-- chiffre : une base en service peut porter une telle adresse. Ce fichier les compte d'abord, et
-- refuse de s'appliquer s'il en trouve, en disant combien. Il n'en réécrit aucune : une adresse
-- publique ne change pas, des liens et des widgets la portent déjà. C'est à l'exploitant de décider,
-- avec l'organisation, puis de relancer.
--
-- Le comptage lit la table sous le drapeau d'entretien : hors de lui, le propriétaire ne voit
-- aucune organisation, et le compte rendrait zéro sans rien dire, le défaut de la migration 0050
-- que 0072 a réparé. Les politiques d'entretien sont vérifiées d'abord, le drapeau est posé pour le
-- seul comptage, puis coupé, comme dans 0072. L'ajout de la contrainte vérifie de toute façon chaque
-- ligne, hors des politiques : le comptage ne fait que donner un message clair.
--
-- L'instruction sur le schéma est celle que Drizzle Kit produit (`src/schema/index.ts`), rendue
-- rejouable ; `meta/0074_snapshot.json` est l'instantané qui va avec.
-- `test/public-address-letter.test.ts` joue ce fichier sur une adresse sans lettre.

-- 1. Les adresses déjà là, avant de poser quoi que ce soit.
DO $existant$
DECLARE
	sans_lettre bigint;
BEGIN
	IF (
		SELECT count(*) FROM pg_policies
		WHERE schemaname = 'public' AND tablename = 'organization'
			AND policyname = 'organization_owner_select' AND current_user = ANY (roles)
			AND coalesce(qual, '') LIKE '%maintenance()%'
	) <> 1 THEN
		RAISE EXCEPTION 'organization : la politique d''entretien du propriétaire manque, le comptage serait à vide';
	END IF;
	PERFORM set_config('jadwal.maintenance', 'on', true);
	SELECT count(*) INTO sans_lettre FROM public."organization" WHERE "slug" !~ '[a-z]';
	PERFORM set_config('jadwal.maintenance', 'off', true);
	IF sans_lettre > 0 THEN
		RAISE EXCEPTION 'organization : % adresse(s) publique(s) sans aucune lettre ; la règle n''est pas posée, et aucune adresse n''est réécrite',
			sans_lettre;
	END IF;
END
$existant$;
--> statement-breakpoint

-- 2. La règle, telle que Drizzle Kit la produit pour le schéma. Retirée d'abord, pour le rejeu.
ALTER TABLE "organization" DROP CONSTRAINT IF EXISTS "organization_slug_letter_ck";
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_slug_letter_ck" CHECK (("organization"."slug" ~ '[a-z]') is true);
--> statement-breakpoint

-- 3. La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier
--    annonce, la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	definition text;
BEGIN
	-- Le drapeau est coupé après le comptage : la suite du lot ne l'hérite pas.
	IF jadwal.maintenance() THEN
		RAISE EXCEPTION 'organization : le drapeau d''entretien est resté posé après le comptage';
	END IF;
	SELECT pg_get_constraintdef(oid) INTO definition
	FROM pg_constraint
	WHERE conrelid = 'public.organization'::regclass AND conname = 'organization_slug_letter_ck'
		AND contype = 'c' AND convalidated;
	IF definition IS NULL THEN
		RAISE EXCEPTION 'organization : la règle de la lettre manque, ou n''est pas validée';
	END IF;
	-- La définition entière, telle que PostgreSQL la rend : une lettre de a à z, close par is true.
	-- Une lecture par fragments laissait passer `(slug ~ '[a-z]' or true) is true`, qui ne demande
	-- rien (`test/migration-proofs.test.ts`).
	IF definition <> 'CHECK (((slug ~ ''[a-z]''::text) IS TRUE))' THEN
		RAISE EXCEPTION 'organization_slug_letter_ck : n''est pas la règle annoncée, une lettre de a à z close par is true (%)',
			definition;
	END IF;
	-- La forme de la migration 0003 reste, telle quelle.
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.organization'::regclass AND conname = 'organization_slug_ck'
			AND contype = 'c' AND convalidated
			AND pg_get_constraintdef(oid) LIKE '%slug ~ ''^[a-z0-9]+(-[a-z0-9]+)*$''::text%'
	) THEN
		RAISE EXCEPTION 'organization : la forme de l''adresse publique (migration 0003) manque';
	END IF;
END
$verifie$;
