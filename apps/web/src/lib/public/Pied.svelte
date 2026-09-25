<script lang="ts">
	// Le pied commun : deux lignes, et rien d'autre (docs/maquettes/README.md). La première porte
	// les deux liens, l'abonnement et les conditions d'utilisation ; la seconde, la mention.
	import { resolve } from '$app/paths';
	import { annonceNouvelOnglet, t, type Langue } from '$lib/i18n.js';

	let {
		langue,
		lienAgenda,
		integre = false
	}: { langue: Langue; lienAgenda: string; integre?: boolean } = $props();
	const mots = $derived(t(langue));
</script>

<footer>
	<p>
		<a href={lienAgenda}>{mots.subscribe}</a>
		·
		<!-- Les conditions n'existent qu'en français : le lien le dit par `hreflang`, et son texte
		     reste dans la langue de la page. `/conditions` refuse d'être encadrée
		     (`frame-ancestors 'none'`) : le lien s'ouvre donc dans un nouvel onglet, et `embed.js`
		     laisse passer tout lien qui porte une cible. Partout, et pas seulement en mode intégré :
		     le cadre que l'écran Partager donne à coller à la main charge la page sans `embed=1`, et
		     c'est la même page qu'il montre, dans un cadre ou non.
		     Le nouvel onglet est annoncé aux lecteurs d'écran, et à eux seuls (technique G201 des
		     WCAG) : le nom du lien devient « Conditions d’utilisation (s’ouvre dans un nouvel
		     onglet) ». Aucun blanc du gabarit entre le texte et l'annonce : l'annonce porte le sien
		     (`annonceNouvelOnglet`). -->
		<a href={resolve('/conditions')} hreflang="fr" target="_blank" rel="noopener"
			>{mots.terms}<span class="pour-lecteur">{annonceNouvelOnglet(langue)}</span></a
		>
	</p>
	<!-- En mode intégré, la mention est portée par le pied du widget, juste sous le cadre : elle
	     appartient alors au site de l'organisation, et non à une page qu'il enferme. L'écrire deux
	     fois à dix pixels d'écart n'apprendrait rien à personne (ADR 0005). -->
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
	/* Hors de la vue, pas hors de l'arbre d'accessibilité : `display: none` ou `visibility: hidden`
	   le retireraient aux lecteurs d'écran aussi. La même règle que les jours de la vue Mois. */
	.pour-lecteur {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		border: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
