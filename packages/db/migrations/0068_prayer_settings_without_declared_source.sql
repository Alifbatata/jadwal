-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- La « source déclarée » des heures de prière quitte la base (étape 19).
--
-- `prayer_settings.source` disait si une organisation déclarait importer ses heures ou les
-- calculer. L'écran des prières ne pose plus cette question depuis l'étape 18 (retour C1) : il en
-- pose une seule, et la priorité entre l'import, le calcul et les horaires saisis ne dépend d'aucune
-- déclaration (ADR 0004). La colonne restait, relue puis réécrite telle quelle, et aucune décision
-- n'en dépendait. Elle part avec sa contrainte.
--
-- `prayer_day.source` n'est pas touchée : elle dit d'où vient chaque jour, et c'est elle qui fait
-- passer un jour importé avant un jour calculé.
--
-- Aucun droit de colonne ne la nommait, aucune politique, aucune fonction, aucune migration
-- rejouable : la retirer ne casse aucun rejeu. Retirer une colonne retire ses droits avec elle.
--
-- Les deux instructions sont celles que Drizzle Kit produit pour le schéma (`src/schema/index.ts`),
-- rendues rejouables ; `meta/0068_snapshot.json` est l'instantané qui va avec.

ALTER TABLE "prayer_settings" DROP CONSTRAINT IF EXISTS "prayer_settings_source_ck";
--> statement-breakpoint
ALTER TABLE "prayer_settings" DROP COLUMN IF EXISTS "source";
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_attribute
		WHERE attrelid = 'public.prayer_settings'::regclass AND attname = 'source' AND NOT attisdropped
	) THEN
		RAISE EXCEPTION 'prayer_settings : la colonne de la source déclarée est encore là';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.prayer_day'::regclass AND conname = 'prayer_day_source_ck'
			AND convalidated
	) THEN
		RAISE EXCEPTION 'prayer_day : la source d''un jour a perdu sa contrainte';
	END IF;
END
$verifie$;
