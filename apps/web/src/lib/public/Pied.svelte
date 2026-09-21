<script lang="ts">
	// Le pied commun : deux lignes, et rien d'autre (docs/maquettes/README.md).
	import { t, type Langue } from '$lib/i18n.js';

	let {
		langue,
		lienAgenda,
		integre = false
	}: { langue: Langue; lienAgenda: string; integre?: boolean } = $props();
	const mots = $derived(t(langue));
</script>

<footer>
	<p><a href={lienAgenda}>{mots.subscribe}</a></p>
	<!-- En mode intégré, la mention est portée par le pied du widget, juste sous le cadre : elle
	     appartient alors au site de la mosquée, et non à une page qu'il enferme. L'écrire deux fois
	     à dix pixels d'écart n'apprendrait rien à personne (ADR 0005). -->
	{#if !integre}
		<p class="mention">{mots.offeredBy}</p>
	{/if}
</footer>

<style>
	footer {
		border-top: 1px solid #ddd;
		margin-top: 2rem;
		padding-top: 0.75rem;
	}
	footer p {
		margin: 0.25rem 0;
	}
	footer a {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		color: #0f5c55;
	}
	.mention {
		color: #555;
		font-size: 0.85rem;
	}
</style>
