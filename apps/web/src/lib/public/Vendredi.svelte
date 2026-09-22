<script lang="ts">
	// Le bloc de la prière du vendredi, tout en haut de la page publique
	// (voir docs/maquettes/public-vendredi.md).
	//
	// Trois lignes au plus : heure, langues du sermon, salle. C'est l'information la plus cherchée
	// sur la page d'une organisation, et celle qui se contredit le plus entre les canaux — elle doit
	// se lire sans faire défiler et sans cliquer.
	//
	// Le bloc décrit le **rythme habituel** et ne porte aucune exception : une session annulée ou
	// déplacée se lit dans la vue Semaine, là où sont toutes les exceptions. Un bloc qui changerait
	// chaque semaine ne serait plus une réponse, il serait une question de plus.
	import { languesEnClair } from './affichage.js';
	import { t, type Langue } from '$lib/i18n.js';

	let {
		langue,
		sessions
	}: {
		langue: Langue;
		sessions: readonly {
			id: string;
			start: string;
			sermonLanguages: string[];
			room: string | null;
		}[];
	} = $props();

	const mots = $derived(t(langue));
</script>

{#if sessions.length > 0}
	<section class="vendredi" aria-labelledby="vendredi-titre">
		<h2 id="vendredi-titre">{mots.jumua}</h2>
		<ul>
			{#each sessions as session (session.id)}
				<li>
					<span class="heure">{session.start}</span>
					<span class="detail">{languesEnClair(langue, session.sermonLanguages)}</span>
					{#if session.room}<span class="detail">{session.room}</span>{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.vendredi {
		background: var(--accent);
		color: var(--accent-texte);
		border-radius: 0.5rem;
		padding: 0.6rem 0.9rem;
		margin: 0 0 1rem;
	}
	h2 {
		font-size: 1rem;
		margin: 0 0 0.25rem;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
		font-variant-numeric: tabular-nums;
	}
	.heure {
		font-weight: 700;
	}
	/* Un séparateur en CSS, jamais dans le texte : un lecteur d'écran lit le point médian
	   « point médian » et n'apprend rien. */
	.detail + .detail::before,
	.heure + .detail::before {
		content: '· ';
	}
</style>
