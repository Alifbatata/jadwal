# Image de production de jadwal (ADR 0034).
#
# Deux étages. `build` installe le dépôt entier et construit les quatre paquets ; l'étage final ne
# garde que l'arbre autonome que `pnpm deploy` produit — le serveur d'`adapter-node`, ses
# dépendances, et `@jadwal/db` avec ses migrations et ses scripts, que les tâches périodiques
# appellent (`node node_modules/@jadwal/db/scripts/migrate.mjs`).
#
# Pourquoi l'installation n'est pas isolée dans un étage à part, comme on le fait d'habitude pour le
# cache : `packages/widget` a un script `prepare` qui construit le widget, et un `pnpm install` sans
# les sources échoue. Le remède habituel, `--ignore-scripts`, casse `esbuild`, qui a besoin du sien.
# Le cache de BuildKit sur le magasin pnpm rend le compromis indolore.
#
# Ce qui n'est pas dans l'image finale : ni pnpm, ni `.git`, ni les tests, ni les sources d'`apps/web`.
#
# Ce qui y reste et ne devrait pas, mesuré et assumé : `pnpm deploy --prod` élague les dépendances
# de développement du paquet déployé, mais pas celles des paquets du workspace dont il dépend —
# `drizzle-kit`, `typescript` et `esbuild` arrivent par `@jadwal/db`. L'arbre pèse 227 Mio là où une
# centaine suffirait. C'est du disque, pas de la mémoire : rien de cela n'est chargé à l'exécution.
#
# Les images de base sont épinglées par digest, comme PostgreSQL depuis l'étape 0 (ADR 0010). Une
# étiquette mouvante ferait qu'une reconstruction de la même version du code produirait une image
# différente, ce qui rendrait un retour arrière incertain.

# node:24.21.0-trixie-slim — la version de .node-version, épinglée par le digest de son index
# multi-architecture (relevé le 2026-09-21 : docker buildx imagetools inspect).
FROM node@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe AS build
WORKDIR /app
ENV CI=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY . .
RUN --mount=type=cache,target=/pnpm/store,sharing=locked \
	corepack enable && \
	pnpm config set store-dir /pnpm/store --global && \
	pnpm install --frozen-lockfile && \
	pnpm build && \
	# `--ignore-scripts` : l'arbre déployé n'a plus de sources, et le `prepare` du widget — qui
	# reconstruit le widget — y échouerait. Tout est déjà construit à ce stade.
	pnpm deploy --filter=@jadwal/web --prod --ignore-scripts /app/out && \
	# Ce que `deploy` recopie du paquet et qui n'a rien à faire en production : les sources, les
	# tests d'accès, et les fichiers de configuration des outils de développement.
	rm -rf /app/out/src /app/out/tests /app/out/vite.config.ts /app/out/vitest.config.ts \
		/app/out/tsconfig.json /app/out/pnpm-lock.yaml /app/out/pnpm-workspace.yaml

# La même image, le même digest : l'étage d'exécution ne doit pas dériver de celui qui construit.
FROM node@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe AS runtime
WORKDIR /app
ENV NODE_ENV=production
# `node` existe déjà dans l'image officielle, uid 1000. On n'en crée pas un de plus : celui-là
# suffit, et il rend les volumes lisibles depuis l'hôte sans acrobatie.
USER node

COPY --chown=node:node --from=build /app/out /app

EXPOSE 3000
# Pas de `HEALTHCHECK` ici : le conteneur est piloté par Compose, qui porte le sien. Une sonde
# écrite à deux endroits finit par diverger.
CMD ["node", "build/index.js"]
