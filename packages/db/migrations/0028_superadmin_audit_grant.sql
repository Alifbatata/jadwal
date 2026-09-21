-- @rejouable : ce fichier est écrit à la main et doit pouvoir être rejoué tel quel.
-- Le super-admin écrit sa propre trace dans le journal de l'organisation visée (ADR 0018).
-- Comme pour le rôle applicatif, l'horodatage lui échappe : il appartient au serveur (ADR 0020).

GRANT INSERT ("id", "organization_id", "actor_id", "action", "target_table", "target_id", "before", "after")
	ON "audit_log" TO "jadwal_superadmin";
