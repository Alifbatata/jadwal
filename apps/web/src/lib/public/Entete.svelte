<script lang="ts">
	// L'en-tête commun aux vues : nom, vues, filtres, langues (voir docs/maquettes/README.md). Les vues
	// et les filtres sont des liens ; le choix de la langue, depuis l'étape 21, une liste déroulante
	// dans un formulaire avec son bouton (`ChoixDeLangue.svelte`). Rien ne demande du JavaScript.
	//
	// Depuis l'étape 18, un quatrième onglet, les heures de prière, quand le module est allumé
	// (retour C4). Le widget n'en sait rien : il encadre cette page, et l'onglet y est donc aussi.
	//
	// Depuis l'étape 24, hors du cadre du widget, la navigation principale (`Onglets.svelte`) vient
	// juste sous le nom : Aujourd'hui, Programme, Prières, Infos. La liste des vues ne garde alors que
	// celles du programme, Semaine, Tous les cours et Mois, et ne se montre que sous « Programme ».
	// Dans le cadre, rien ne change : pas de navigation principale, et la liste garde ses quatre vues
	// (ADR 0053, docs/maquettes/public-aujourdhui.md).
	import { t, type Langue } from '#lib/i18n.js';
	import ChoixDeLangue from './ChoixDeLangue.svelte';
	import Onglets, { type Onglet } from './Onglets.svelte';
	import type { Adresse } from './liens.js';

	type Vue = 'semaine' | 'cours' | 'mois' | 'prieres' | 'aujourdhui' | 'infos';
	/** Les vues du programme : celles que la liste des vues porte toujours. */
	const DU_PROGRAMME: readonly Vue[] = ['semaine', 'cours', 'mois'];

	let {
		slug,
		adresse,
		nom,
		langue,
		langues,
		vue,
		filtre,
		lienVue,
		lienFiltre,
		lienLangue,
		integre = false,
		avecFiltres = true,
		avecPrieres = false,
		avecInfos = false,
		vendredi
	}: {
		/** L'identifiant de l'organisation, pour l'adresse où le choix de la langue est envoyé. */
		slug: string;
		/** L'adresse de la page, pour les liens de la navigation principale. */
		adresse: Adresse;
		nom: string;
		langue: Langue;
		langues: Langue[];
		vue: Vue;
		filtre: string | null;
		lienVue: (vue: Vue) => string;
		lienFiltre: (audience: string | null) => string;
		lienLangue: (langue: Langue) => string;
		/** La page est dans un cadre : le choix de la langue garde ce mode. */
		integre?: boolean;
		avecFiltres?: boolean;
		/** L'onglet des prières, montré seulement si le module de l'organisation est allumé. */
		avecPrieres?: boolean;
		/** L'onglet des infos, montré seulement si l'organisation en a saisi au moins une. */
		avecInfos?: boolean;
		/**
		 * Le bloc de la prière du vendredi, rendu **entre le nom et les vues** : c'est la seule
		 * chose qui passe devant la navigation, et c'est délibéré (docs/maquettes/public-vendredi.md).
		 */
		vendredi?: import('svelte').Snippet;
	} = $props();

	const mots = $derived(t(langue));
	const PUBLICS = ['kids', 'youth', 'women', 'adults', 'open'] as const;
	const programme = $derived(DU_PROGRAMME.includes(vue));
	/** L'onglet de la navigation principale où l'on est. */
	const onglet = $derived<Onglet>(programme ? 'programme' : (vue as Onglet));
	/** Dans le cadre du widget, la liste des vues garde l'onglet des prières : c'est sa seule porte. */
	const vues = $derived<[Vue, string][]>([
		['semaine', mots.views.week],
		['cours', mots.views.courses],
		['mois', mots.views.month],
		...(integre && avecPrieres ? [['prieres', mots.views.prayers] as [Vue, string]] : [])
	]);
</script>

<header>
	<h1>{nom}</h1>

	{#if !integre}
		<Onglets
			{adresse}
			{langue}
			courant={onglet}
			exact={!programme || vue === 'semaine'}
			{avecPrieres}
			{avecInfos}
		/>
	{/if}

	{@render vendredi?.()}

	{#if integre || programme}
		<nav class="vues" aria-label={mots.viewsLabel}>
			{#each vues as [cle, libelle] (cle)}
				<a href={lienVue(cle)} aria-current={vue === cle ? 'page' : undefined}>
					{libelle}
				</a>
			{/each}
		</nav>
	{/if}

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

	<ChoixDeLangue {slug} {langue} {langues} {lienLangue} {integre} />
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
	.filtres a {
		font-size: 0.95rem;
	}
</style>
