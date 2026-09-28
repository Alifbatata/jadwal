-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Une annulation peut garder le jour et l'heure où la séance avait été déplacée (étape 20, C2,
-- ADR 0021).
--
-- Une exception se range sous la date prévue de la séance, jamais sous celle où elle a été déplacée
-- (`session_exception_course_date_uq`). Une séance déplacée dont la date prévue est passée ne peut
-- plus y revenir : le chef de projet refuse « Rétablir » sur sa carte, qui gagne « Annuler cette
-- séance ». La séance annulée reste visible, barrée, à sa nouvelle date, comme toute séance annulée,
-- et le flux agenda la retire comme une annulation. Remplacer le déplacement par une annulation
-- nue l'aurait fait disparaître de la nouvelle date sans aucune marque.
--
-- La contrainte de forme (migration 0003) exigeait qu'une annulation n'ait ni jour ni heure
-- d'arrivée. Elle permet maintenant les deux, ensemble, avec la même forme d'heure qu'un
-- déplacement (`HH:MM`, avant minuit, sans seconde) : une annulation sans rien, ou une annulation à
-- l'endroit où la séance avait été déplacée. Un déplacement ne change pas : les deux, toujours. Les
-- lignes déjà là sont toutes conformes, puisque la règle ne fait que s'élargir.
--
-- Le cœur (`@jadwal/core`) range une telle annulation comme un déplacement à la date prévue
-- (`moved_away`), et comme une séance annulée (`cancelled`) à la nouvelle date, avec sa date
-- d'origine. Le flux agenda la traite comme une annulation.
--
-- Les instructions sont celles que Drizzle Kit produit pour le schéma (`src/schema/index.ts`),
-- rendues rejouables ; `meta/0075_snapshot.json` est l'instantané qui va avec.

ALTER TABLE "session_exception" DROP CONSTRAINT IF EXISTS "session_exception_shape_ck";
--> statement-breakpoint
ALTER TABLE "session_exception" ADD CONSTRAINT "session_exception_shape_ck" CHECK ((case "session_exception"."kind"
				when 'cancelled' then ("session_exception"."to_date" is null and "session_exception"."to_start" is null)
					or ("session_exception"."to_date" is not null and "session_exception"."to_start" is not null
						and "session_exception"."to_start" < time '24:00:00' and extract(second from "session_exception"."to_start") = 0)
				when 'moved' then "session_exception"."to_date" is not null and "session_exception"."to_start" is not null
					and "session_exception"."to_start" < time '24:00:00' and extract(second from "session_exception"."to_start") = 0
				else false end) is true);
--> statement-breakpoint

-- La preuve, dans la même transaction. Si l'état n'est pas exactement celui que ce fichier annonce,
-- la migration échoue et rien n'est appliqué.
DO $verifie$
DECLARE
	definition text;
BEGIN
	SELECT pg_get_constraintdef(oid) INTO definition
	FROM pg_constraint
	WHERE conrelid = 'public.session_exception'::regclass AND conname = 'session_exception_shape_ck'
		AND contype = 'c' AND convalidated;
	IF definition IS NULL THEN
		RAISE EXCEPTION 'session_exception : la contrainte de forme manque, ou n''est pas validée';
	END IF;
	IF definition !~* 'IS\s+TRUE\s*\)*\s*$' THEN
		RAISE EXCEPTION 'session_exception_shape_ck : doit être close par is true (%)', definition;
	END IF;
	-- Une annulation : rien, ou le jour et l'heure ensemble, l'heure bornée. Un déplacement : les
	-- deux, l'heure bornée. Rien d'autre.
	IF definition !~ (
		'WHEN ''cancelled''::text THEN .*to_date IS NULL.*AND.*to_start IS NULL.* OR .*'
		|| 'to_date IS NOT NULL.*AND.*to_start IS NOT NULL.*AND.*to_start < ''24:00:00''.*'
		|| 'EXTRACT\(second FROM to_start\).*'
		|| 'WHEN ''moved''::text THEN .*to_date IS NOT NULL.*AND.*to_start IS NOT NULL.*AND.*'
		|| 'to_start < ''24:00:00''.*EXTRACT\(second FROM to_start\).*ELSE\s+false\s+END'
	) THEN
		RAISE EXCEPTION 'session_exception_shape_ck : n''a pas la forme annoncée (%)', definition;
	END IF;
END
$verifie$;
