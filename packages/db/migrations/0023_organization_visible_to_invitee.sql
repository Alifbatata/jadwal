ALTER POLICY "organization_select" ON "organization" TO jadwal_app USING ("organization"."id" = (select jadwal.current_org_id())
				or exists (
					select 1 from "invitation" i
					join "user" u on lower(u."email") = lower(i."email")
					where i."organization_id" = "organization"."id"
						and i."status" = 'pending' and i."expires_at" > now()
						and u."id" = (select jadwal.current_user_id())
				));