<script lang="ts">
	// La vue d'écoute du direct (étape 25, chantier 3, ADR 0057) : le choix de la langue, le
	// bouton, l'état, les sous-titres, et la mention de la traduction automatique.
	//
	// Rendue sans SvelteKit dans le navigateur, comme toute la page publique : c'est le module
	// `/m/ecoute.js` qui se branche sur le relais. Il ne porte aucun texte ; il lit ceux de la page
	// dans `data-textes`, dans sa langue. Sans lui, la page dit qu'il faut JavaScript, et les
	// commandes, qui ne feraient rien, restent cachées.
	import { NOM_DE_LANGUE_DU_DIRECT, t, type Langue } from '#lib/i18n.js';

	let {
		langue,
		relais,
		langues
	}: {
		langue: Langue;
		/** La porte du relais pour cette organisation, jusqu'à la langue exclue. */
		relais: string;
		/** Les langues offertes : celles de l'organisation que le relais sert. */
		langues: string[];
	} = $props();

	const mots = $derived(t(langue));
	/** La langue de la page si elle est offerte, sinon la première. */
	const choisie = $derived(langues.includes(langue) ? langue : langues[0]);
	const textes = $derived(
		JSON.stringify({
			...mots.live.states,
			ecouter: mots.live.listen,
			arreter: mots.live.stop
		})
	);
</script>

<section
	class="ecoute"
	data-jadwal-ecoute
	data-relais={relais}
	data-textes={textes}
	data-etat="arret"
>
	<h2>{mots.live.title}</h2>
	<p>{mots.live.intro}</p>
	<!-- Toujours visible, avant le bouton : on sait ce qu'on écoute avant d'écouter. -->
	<p class="machine">{mots.live.machine}</p>

	<p class="sans-script" data-sans-script>{mots.live.noScript}</p>

	<div data-avec-script hidden>
		<fieldset>
			<legend>{mots.live.language}</legend>
			{#each langues as code (code)}
				<label lang={code} dir="auto">
					<input type="radio" name="langue" value={code} checked={code === choisie} />
					{NOM_DE_LANGUE_DU_DIRECT[code] ?? code}
				</label>
			{/each}
		</fieldset>

		<button type="button" class="ecouter" data-ecouter>{mots.live.listen}</button>
		<p class="statut" role="status" data-statut>{mots.live.states.arret}</p>
		<p class="ecran">{mots.live.screen}</p>

		<h3>{mots.live.subtitles}</h3>
		<!-- Le texte est dans la langue choisie, que le module pose sur ce cadre. Seules les phrases
		     définitives sont annoncées : la phrase en cours change à chaque mot. -->
		<div class="sous-titres" dir="ltr" lang={choisie} data-sous-titres>
			<ol data-phrases aria-live="polite" aria-relevant="additions"></ol>
			<p class="en-cours" data-en-cours aria-hidden="true"></p>
		</div>
	</div>
</section>

<style>
	.ecoute {
		max-width: 40rem;
	}
	.machine {
		font-weight: 600;
		border-inline-start: 4px solid var(--accent);
		padding-inline-start: 0.75rem;
	}
	.sans-script {
		font-style: italic;
	}
	fieldset {
		border: 1px solid #ccc;
		border-radius: 0.375rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin: 1rem 0;
	}
	label {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.ecouter {
		min-height: 48px;
		min-width: 10rem;
		font-size: 1.1rem;
		font-weight: 700;
		border: 0;
		border-radius: 0.5rem;
		background: var(--accent);
		color: var(--accent-texte);
		cursor: pointer;
	}
	.ecouter:focus-visible {
		outline: 3px solid #000;
		outline-offset: 2px;
	}
	.statut {
		font-weight: 600;
	}
	.ecran {
		color: #444;
		font-size: 0.95rem;
	}
	.sous-titres {
		min-height: 6rem;
		padding: 0.75rem;
		border-radius: 0.375rem;
		background: #f4f4f4;
		font-size: 1.15rem;
		line-height: 1.5;
	}
	.sous-titres ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.en-cours {
		margin: 0;
		color: #555;
	}
</style>
