-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- jadwal est gratuit, et il n'y a plus de plan (étape 22, ADR 0049).
--
-- Depuis l'étape 0, chaque organisation portait un plan, `free`, `sponsored` ou `paid`, que le
-- super-admin choisissait dans sa console (migrations 0001 et 0003). Aucun ne changeait ce qu'une
-- organisation peut faire : la colonne ne servait qu'au suivi. Le chef de projet a décidé, le
-- 20.10.2026, que le service est entièrement gratuit et que les plans disparaissent du code, de la
-- base et de la feuille de route. La colonne et sa règle partent ici ; ce qu'elles valaient est
-- perdu, et rien ne le lisait.
--
-- Le rôle applicatif ne pouvait déjà pas l'écrire (migration 0059) : son droit de modification ne
-- nomme que les colonnes de l'écran des réglages. Aucune politique, vue ni fonction ne la nomme.
-- Le journal garde ses anciennes entrées telles quelles : un journal ne se réécrit pas.
--
-- Les instructions sont celles que Drizzle Kit produit pour le schéma (`src/schema/index.ts`),
-- rendues rejouables ; `meta/0076_snapshot.json` est l'instantané qui va avec.
-- `test/migration-proofs.test.ts` éprouve la preuve sur un état où le plan est revenu.

ALTER TABLE "organization" DROP CONSTRAINT IF EXISTS "organization_plan_ck";
--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN IF EXISTS "plan";
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier
-- annonce, la migration échoue et rien n'est appliqué.
DO $verifie$
BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_attribute
		WHERE attrelid = 'public.organization'::regclass AND attname = 'plan' AND NOT attisdropped
	) THEN
		RAISE EXCEPTION 'organization : la colonne du plan est encore là';
	END IF;
	IF EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.organization'::regclass AND conname = 'organization_plan_ck'
	) THEN
		RAISE EXCEPTION 'organization : la règle du plan est encore là';
	END IF;
END
$verifie$;
