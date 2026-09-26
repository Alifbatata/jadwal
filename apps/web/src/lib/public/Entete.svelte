<script lang="ts">
	// L'en-tête commun aux vues : nom, vues, filtres, langues (voir docs/maquettes/README.md). Tout
	// est lien : aucun bouton, aucune case à cocher, donc rien qui demande du JavaScript.
	//
	// Depuis l'étape 18, un quatrième onglet, les heures de prière, quand le module est allumé
	// (retour C4). Le widget n'en sait rien : il encadre cette page, et l'onglet y est donc aussi.
	import { NOM_DE_LANGUE, t, type Langue } from '$lib/i18n.js';

	type Vue = 'semaine' | 'cours' | 'mois' | 'prieres';

	let {
		nom,
		langue,
		langues,
		vue,
		filtre,
		lienVue,
		lienFiltre,
		lienLangue,
		avecFiltres = true,
		avecPrieres = false,
		vendredi
	}: {
		nom: string;
		langue: Langue;
		langues: Langue[];
		vue: Vue;
		filtre: string | null;
		lienVue: (vue: Vue) => string;
		lienFiltre: (audience: string | null) => string;
		lienLangue: (langue: Langue) => string;
		avecFiltres?: boolean;
		/** L'onglet des prières, montré seulement si le module de l'organisation est allumé. */
		avecPrieres?: boolean;
		/**
		 * Le bloc de la prière du vendredi, rendu **entre le nom et les vues** : c'est la seule
		 * chose qui passe devant la navigation, et c'est délibéré (docs/maquettes/public-vendredi.md).
		 */
		vendredi?: import('svelte').Snippet;
	} = $props();

	const mots = $derived(t(langue));
	const PUBLICS = ['kids', 'youth', 'women', 'adults', 'open'] as const;
	const onglets = $derived<[Vue, string][]>([
		['semaine', mots.views.week],
		['cours', mots.views.courses],
		['mois', mots.views.month],
		...(avecPrieres ? [['prieres', mots.views.prayers] as [Vue, string]] : [])
	]);
</script>

<header>
	<h1>{nom}</h1>

	{@render vendredi?.()}

	<nav class="vues" aria-label={mots.viewsLabel}>
		{#each onglets as [cle, libelle] (cle)}
			<a href={lienVue(cle)} aria-current={vue === cle ? 'page' : undefined}>
				{libelle}
			</a>
		{/each}
	</nav>

	{#if avecFiltres}
		<nav class="filtres" aria-label={mots.audiencesLabel}>
			<a href={lienFiltre(null)} aria-current={filtre === null ? 'true' : undefined}>
				{mots.allAudiences}
			</a>
			{#each PUBLICS as audience (audience)}
				<a href={lienFiltre(audience)} aria-current={filtre === audience ? 'true' : undefined}>
					{mots.audiences[audience]}
				</a>
			{/each}
		</nav>
	{/if}

	{#if langues.length > 1}
		<nav class="langues" aria-label={mots.languagesLabel}>
			{#each langues as autre (autre)}
				<a
					href={lienLangue(autre)}
					hreflang={autre}
					aria-current={autre === langue ? 'true' : undefined}
				>
					{NOM_DE_LANGUE[autre]}
				</a>
			{/each}
		</nav>
	{/if}
</header>

<style>
	header {
		border-bottom: 1px solid #ddd;
		padding-bottom: 0.5rem;
		margin-bottom: 1rem;
	}
	h1 {
		font-size: 1.4rem;
		margin: 0 0 0.5rem;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		margin-bottom: 0.25rem;
	}
	nav a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		color: #0f5c55;
	}
	/* L'onglet et le filtre actifs prennent le fond d'accent. La graisse et `aria-current` restent :
	   la couleur n'est jamais le seul indicateur d'un état (WCAG 1.4.1), et le texte posé sur le
	   fond est calculé, donc lisible quelle que soit la couleur choisie (ADR 0031). */
	nav a[aria-current] {
		font-weight: 700;
		text-decoration: none;
		background: var(--accent);
		color: var(--accent-texte);
		border-radius: 0.375rem;
		padding: 0 0.6rem;
	}
	.filtres a,
	.langues a {
		font-size: 0.95rem;
	}
</style>
