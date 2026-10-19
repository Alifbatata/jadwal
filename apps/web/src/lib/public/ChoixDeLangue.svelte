<script lang="ts">
	// Le choix de la langue d'une page publique, dans les trois gabarits qui le portent : l'en-tête
	// des vues, l'abonnement et la page d'un cours. Depuis l'étape 21, une liste déroulante au lieu des
	// langues côte à côte, comme dans l'espace des responsables.
	//
	// Une page publique n'a pas de JavaScript : c'est un formulaire `GET`, avec un bouton. Chaque choix
	// est l'adresse de cette page dans cette langue, celle que le lien d'avant donnait ; la route
	// `/m/<identifiant>/langue` y renvoie, sans jamais sortir des pages de l'organisation. Rien ne part
	// au seul changement de la liste (WCAG 3.2.2). Dans un cadre, `embed.js` fait de l'envoi un
	// remplacement, comme pour un lien, et le champ caché garde le mode intégré.
	//
	// Les versions linguistiques restent annoncées aux moteurs dans `<head>` (ADR 0029) : un
	// `hreflang` sur un lien n'en était pas une.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { NOM_DE_LANGUE, t, type Langue } from '$lib/i18n.js';

	let {
		slug,
		langue,
		langues,
		lienLangue,
		integre = false
	}: {
		slug: string;
		langue: Langue;
		langues: Langue[];
		lienLangue: (langue: Langue) => string;
		integre?: boolean;
	} = $props();

	const mots = $derived(t(langue));

	/**
	 * L'adresse de cette page dans une autre langue, en absolu. Celle que rend `resolve` est relative
	 * à cette page ; elle part vers une autre route, qui ne saurait plus d'où elle se lit.
	 */
	function absolue(autre: Langue): string {
		const vers = new URL(lienLangue(autre), page.url);
		return `${vers.pathname}${vers.search}`;
	}
</script>

{#if langues.length > 1}
	<form class="langues" method="get" action={resolve('/m/[slug]/langue', { slug })}>
		{#if integre}
			<input type="hidden" name="embed" value="1" />
		{/if}
		<label for="choix-de-la-langue">{mots.languageLabel}</label>
		<select id="choix-de-la-langue" name="vers">
			{#each langues as autre (autre)}
				<option value={absolue(autre)} lang={autre} selected={autre === langue}
					>{NOM_DE_LANGUE[autre]}</option
				>
			{/each}
		</select>
		<button type="submit">{mots.languageSubmit}</button>
	</form>
{/if}

<style>
	.langues {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
		margin-bottom: 0.25rem;
		font-size: 0.95rem;
	}
	/* La liste et le bouton : 44 px au moins, la couleur des liens de la page sur le bouton. */
	select,
	button {
		min-height: 44px;
		font: inherit;
		padding: 0 0.6rem;
		border: 1px solid #c8ced4;
		border-radius: 0.375rem;
		background: #fff;
		color: inherit;
	}
	button {
		color: #0f5c55;
		cursor: pointer;
	}
</style>
