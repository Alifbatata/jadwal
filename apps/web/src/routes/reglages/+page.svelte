<script lang="ts">
	import { untrack } from 'svelte';
	import { LANGUAGE_LABELS } from '$lib/format.js';
	import { accentValide, contraste, texteSur, variablesAccent } from '$lib/couleur.js';

	let { data, form } = $props();
	const organisation = $derived(data.organisation);

	/**
	 * La couleur en cours de saisie. Elle part de celle qui est enregistrée : sans JavaScript, le
	 * champ garde cette valeur et l'aperçu montre la couleur actuelle — ce qui est exact, puisque
	 * rien n'a encore changé.
	 */
	let couleur = $state(untrack(() => accentValide(data.organisation.accent_color)));
	const apercu = $derived(variablesAccent(couleur));
	const rapport = $derived(contraste(couleur, texteSur(couleur)));
</script>

<svelte:head><title>Réglages | {organisation.name}</title></svelte:head>

<h1>Réglages</h1>

{#if form?.erreur}<p class="erreur" role="alert">{form.erreur}</p>{/if}
{#if form?.enregistre}<p class="succes" role="status">Réglages enregistrés.</p>{/if}
{#if form?.moduleChange}<p class="succes" role="status">Module mis à jour.</p>{/if}

<form method="post" action="?/enregistrer" class="colonne">
	<label for="name">Nom de l’organisation</label>
	<input id="name" name="name" type="text" value={organisation.name} maxlength="120" required />

	<label for="timeZone">Fuseau horaire</label>
	<input id="timeZone" name="timeZone" type="text" value={organisation.time_zone} required />
	<p class="aide">Nom IANA, par exemple Europe/Zurich.</p>

	<label for="accentColor">Couleur d’accent</label>
	<input id="accentColor" name="accentColor" type="color" bind:value={couleur} />
	<!-- L'aperçu, et la raison pour laquelle aucune couleur n'est refusée : elle ne sert que de
	     fond, et le texte posé dessus est choisi noir ou blanc selon celui des deux qui contraste
	     le mieux. Le pire cas possible reste au-dessus de 4,5:1, seuil AA (ADR 0031). -->
	<p class="apercu" style={apercu}>
		<span class="pastille">Exemple de bouton</span>
		Contraste du texte sur cette couleur : {rapport.toFixed(2)}:1
	</p>
	<p class="aide">
		Elle sert de fond : sur vos pages publiques, dans le widget et ici. Le texte posé dessus est
		calculé pour rester lisible, donc aucune couleur n’est refusée. Elle n’est jamais la seule
		indication de quoi que ce soit : une séance annulée le reste sans elle.
	</p>

	<label for="greeting">Formule d’accueil des messages</label>
	<input
		id="greeting"
		name="greeting"
		type="text"
		value={organisation.greeting}
		maxlength="60"
		required
	/>
	<p class="aide">Elle ouvre chaque message prêt à coller.</p>

	<fieldset class="cases">
		<legend>Langues activées</legend>
		{#each data.languesPossibles as langue (langue)}
			<label class="case">
				<input
					type="checkbox"
					name="enabledLanguages"
					value={langue}
					checked={organisation.enabled_language.includes(langue)}
				/>
				{LANGUAGE_LABELS[langue] ?? langue}
			</label>
		{/each}
	</fieldset>

	<label for="defaultLanguage">Langue par défaut</label>
	<select id="defaultLanguage" name="defaultLanguage">
		{#each data.languesPossibles as langue (langue)}
			<option value={langue} selected={langue === organisation.default_language}>
				{LANGUAGE_LABELS[langue] ?? langue}
			</option>
		{/each}
	</select>

	<button type="submit">Enregistrer</button>
</form>

<section aria-labelledby="salles-titre">
	<h2 id="salles-titre">Salles</h2>
	{#if data.salles.length === 0}
		<p class="aide">Aucune salle. Un cours peut s’en passer.</p>
	{/if}
	<ul>
		{#each data.salles as salle (salle.id)}
			<li>
				{salle.name}
				<form method="post" action="?/supprimerSalle">
					<input type="hidden" name="roomId" value={salle.id} />
					<button type="submit">Supprimer</button>
				</form>
			</li>
		{/each}
	</ul>
	<form method="post" action="?/ajouterSalle" class="ligne">
		<label for="salle">Nouvelle salle</label>
		<input id="salle" name="name" type="text" maxlength="80" required />
		<button type="submit">Ajouter</button>
	</form>
</section>

<!-- Le seul endroit qui propose le module : pas de bannière, pas de suggestion ailleurs. Une
     organisation à qui cela ne parle pas n'a rien à refuser (ADR 0042). -->
<section aria-labelledby="module-titre">
	<h2 id="module-titre">Heures de prière</h2>
	{#if organisation.prayer_module}
		<p>
			Le module est <strong>allumé</strong>. Votre espace affiche les heures de prière et la prière
			du vendredi, un cours peut être réglé sur une prière, et votre page publique les montre.
		</p>
		<p class="discret">
			L'éteindre n'efface rien : vos horaires, vos imports et vos sessions du vendredi restent, et
			tout revient si vous le rallumez.
		</p>
		<form method="post" action="?/modulePrieres">
			<input type="hidden" name="allume" value="non" />
			<button type="submit">Éteindre le module</button>
		</form>
	{:else}
		<p>
			Le module est <strong>éteint</strong>. Allumez-le si votre organisation publie des heures de
			prière, une iqama ou une prière du vendredi, ou si un cours commence après une prière.
		</p>
		<form method="post" action="?/modulePrieres">
			<input type="hidden" name="allume" value="oui" />
			<button type="submit">Allumer le module</button>
		</form>
	{/if}
</section>

<style>
	.discret {
		color: #4b5563;
		font-size: 0.9rem;
	}

	.colonne {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 28rem;
	}
	.ligne {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		border-bottom: 1px solid #eee;
		padding: 0.35rem 0;
	}
	li form {
		margin-left: auto;
	}
	fieldset {
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	legend {
		font-weight: 600;
	}
	.case {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		font-weight: 400;
	}
	label {
		font-size: 0.9rem;
		font-weight: 600;
	}
	input,
	select,
	button {
		min-height: 44px;
		font: inherit;
		padding: 0.25rem 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
		background: #fff;
	}
	button {
		background: var(--accent);
		color: var(--accent-texte);
		border-color: var(--accent);
		cursor: pointer;
	}
	.apercu {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		background: var(--accent);
		color: var(--accent-texte);
		border-radius: 0.375rem;
		padding: 0.6rem 0.75rem;
		margin: 0;
	}
	.pastille {
		border: 1px solid currentColor;
		border-radius: 0.375rem;
		padding: 0.2rem 0.6rem;
		font-weight: 600;
	}
	.aide {
		font-size: 0.85rem;
		color: #555;
		margin: 0;
	}
	.erreur {
		color: #b91c1c;
		font-weight: 600;
	}
	.succes {
		color: #065f46;
		font-weight: 600;
	}
</style>
