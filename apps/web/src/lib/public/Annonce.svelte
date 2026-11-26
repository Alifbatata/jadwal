<script lang="ts">
	// L'annonce du moment d'une organisation (étape 24, docs/maquettes/public-infos.md) : un encadré,
	// en tête de la vue « Aujourd'hui » et de l'onglet Infos, et nulle part ailleurs.
	//
	// Du texte brut : rien de ce qu'un responsable a saisi n'est interprété comme du HTML. Les retours
	// à la ligne de la saisie sont gardés par la mise en page. Le texte ne se traduit pas : il est
	// marqué dans la langue par défaut de l'organisation, pour que les lecteurs d'écran le lisent
	// avec la bonne voix sur une page d'une autre langue.
	import { direction, isLangue, t, type Langue } from '#lib/i18n.js';

	let { langue, langueDuTexte, texte }: { langue: Langue; langueDuTexte: string; texte: string } =
		$props();

	const mots = $derived(t(langue));
	const sens = $derived(isLangue(langueDuTexte) ? direction(langueDuTexte) : 'auto');
</script>

<section class="annonce" aria-labelledby="annonce-titre">
	<h2 id="annonce-titre">{mots.infoNotice}</h2>
	<p class="saisi" lang={langueDuTexte} dir={sens}>{texte}</p>
</section>

<style>
	/* Un encadré, pas une alerte : un liseré d'accent du côté où la lecture commence. */
	.annonce {
		border-inline-start: 0.3rem solid var(--accent);
		background: #f6f6f6;
		border-radius: 0.375rem;
		padding: 0.6rem 0.9rem;
		margin: 0 0 1rem;
	}
	h2 {
		font-size: 1rem;
		margin: 0 0 0.25rem;
	}
	.saisi {
		margin: 0;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
</style>
