<!--
  Le texte des conditions d'utilisation, mis en page pour l'écran (ADR 0044).

  La typographie est celle du PDF remis au juriste (`scripts/conditions-pdf.mjs`) : les mêmes
  polices, les mêmes tableaux bordés, le même alignement à gauche. Elle change d'unités, pas de
  caractère : des rem au lieu des points, une taille de lecture d'écran, et un tableau qui défile de
  côté dans son cadre au lieu d'élargir la page d'un téléphone.

  Le HTML vient de `$lib/server/conditions.ts`, qui ne rend que `docs/CONDITIONS.md`, relu et
  versionné. Aucun texte de visiteur n'arrive jamais ici.
-->
<script lang="ts">
	let { html }: { html: string } = $props();
</script>

<div class="conditions">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- rendu à la construction depuis docs/CONDITIONS.md, jamais d'une saisie -->
	{@html html}
</div>

<style>
	/* Polices du système seulement : aucune ressource d'un autre domaine. « Source Serif 4 » n'est là
	   que pour qui l'a installée, comme dans le PDF ; Georgia la remplace partout ailleurs. */
	.conditions {
		font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif;
		font-size: 1.0625rem;
		line-height: 1.6;
		color: #14171a;
		/* Une adresse ou un nom de colonne trop long se coupe plutôt que d'élargir la page. */
		overflow-wrap: break-word;
	}
	.conditions :global(h1),
	.conditions :global(h2),
	.conditions :global(h3),
	.conditions :global(th) {
		font-family: 'Segoe UI', system-ui, sans-serif;
		color: #0f1418;
	}
	.conditions :global(h1),
	.conditions :global(h2),
	.conditions :global(h3) {
		line-height: 1.25;
	}
	.conditions :global(h1) {
		font-size: 1.75rem;
		margin: 0 0 1rem;
	}
	.conditions :global(h2) {
		font-size: 1.3rem;
		margin: 2rem 0 0.6rem;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid #c8ced4;
	}
	.conditions :global(h3) {
		font-size: 1.1rem;
		margin: 1.5rem 0 0.5rem;
	}
	/* Aligné à gauche, jamais justifié : la justification creuse des rivières dans une colonne
	   étroite, et sur un téléphone toutes les colonnes le sont. */
	.conditions :global(p),
	.conditions :global(li),
	.conditions :global(th),
	.conditions :global(td) {
		text-align: left;
	}
	.conditions :global(p) {
		margin: 0 0 0.75rem;
	}
	.conditions :global(ul),
	.conditions :global(ol) {
		margin: 0 0 1rem;
		padding-left: 1.5rem;
	}
	.conditions :global(li) {
		margin-bottom: 0.4rem;
	}
	/* L'élément de plusieurs paragraphes, celui des passkeys : l'écart qui le suit reste celui d'une
	   puce. */
	.conditions :global(li > p:last-child) {
		margin-bottom: 0;
	}
	.conditions :global(code) {
		font-family: 'Cascadia Mono', Consolas, monospace;
		font-size: 0.88em;
		background: #f2f4f6;
		padding: 0 0.2em;
		border-radius: 0.2em;
	}
	.conditions :global(.tableau) {
		overflow-x: auto;
		margin: 0.5rem 0 1.25rem;
	}
	.conditions :global(.tableau:focus-visible) {
		outline: 2px solid #0f5c55;
		outline-offset: 2px;
	}
	/* Une largeur minimale, pour que les trois colonnes restent lisibles : en dessous, c'est le cadre
	   qui défile. */
	.conditions :global(table) {
		width: 100%;
		min-width: 34rem;
		border-collapse: collapse;
		font-size: 0.95rem;
		line-height: 1.45;
	}
	.conditions :global(th),
	.conditions :global(td) {
		border: 1px solid #c8ced4;
		padding: 0.4rem 0.55rem;
		vertical-align: top;
	}
	.conditions :global(th) {
		background: #eef1f4;
		font-weight: 600;
	}
</style>
