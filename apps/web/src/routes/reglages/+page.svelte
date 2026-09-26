<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { languageLabel } from '$lib/format.js';
	import { settingsTexts } from '$lib/i18n/settings.js';
	import { accentValide, contraste, texteSur, variablesAccent } from '$lib/couleur.js';

	let { data, form } = $props();
	const text = $derived(settingsTexts[data.language]);
	const organisation = $derived(data.organisation);

	/**
	 * Ce que montre le formulaire : ce qui a été saisi, après un refus du serveur, pour que le message
	 * et les champs disent la même chose ; sinon, ce qui est enregistré.
	 */
	const saisie = $derived(
		form && 'values' in form && form.values
			? form.values
			: {
					name: organisation.name,
					timeZone: organisation.time_zone,
					accentColor: organisation.accent_color,
					greeting: organisation.greeting,
					enabledLanguages: organisation.enabled_language,
					defaultLanguage: organisation.default_language
				}
	);
	/**
	 * Le nom et la formule d'accueil, liés à leur champ. Posés par `value=`, ils étaient mis à jour
	 * par le même effet que l'aperçu de la couleur : la première couleur choisie après le chargement
	 * remettait dans les deux champs les valeurs du départ, et ce qui avait été tapé partait perdu
	 * sous « Réglages enregistrés. ». Liés, ils gardent ce qui est tapé, et repartent de la saisie
	 * seulement quand elle change.
	 */
	let nom = $derived(saisie.name);
	let accueil = $derived(saisie.greeting);
	/** Un fuseau hors de la liste n'est jamais rendu par le serveur : c'est alors celui qui est enregistré. */
	const fuseauChoisi = $derived(saisie.timeZone ?? organisation.time_zone);
	/** Un nom de fuseau se lit mieux sans ses traits de soulignement : « America/New York ». */
	const zoneLabel = (zone: string) => zone.replaceAll('_', ' ');

	/**
	 * La couleur en cours de saisie. Elle part de celle du formulaire : sans JavaScript, le champ
	 * garde cette valeur et l'aperçu la montre, ce qui est exact, puisque rien n'a encore changé.
	 */
	let couleur = $state(untrack(() => accentValide(saisie.accentColor)));
	const apercu = $derived(variablesAccent(couleur));
	const rapport = $derived(contraste(couleur, texteSur(couleur)));

	/** Le message d'une erreur, dans la langue de l'écran. */
	const erreur = $derived(form && 'error' in form && form.error ? text.errors[form.error] : null);
	/** La salle occupée dont la suppression attend une confirmation. */
	const aConfirmer = $derived(form && 'roomInUse' in form ? form.roomInUse : null);
</script>

<svelte:head><title>{text.title} | {organisation.name}</title></svelte:head>

<h1>{text.title}</h1>
<p>{text.intro}</p>

{#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
{#if form && 'enregistre' in form}<p class="succes" role="status">{text.saved}</p>{/if}
{#if form && 'moduleChange' in form}
	<p class="succes" role="status">{form.allume ? text.turnedOn : text.turnedOff}</p>
{/if}
{#if form && 'salleAjoutee' in form}<p class="succes" role="status">{text.roomAdded}</p>{/if}
{#if form && 'salleSupprimee' in form}<p class="succes" role="status">{text.roomDeleted}</p>{/if}

<!-- Une salle que des cours occupent ne part pas au premier envoi : l'écran dit ce que la
     suppression leur fera, et demande de confirmer. En haut, avec les messages : l'envoi recharge la
     page, qui s'ouvre en haut, avec ou sans JavaScript. Rendue sous le formulaire, la demande tombait
     hors de l'écran, et l'on croyait que rien ne s'était passé. « Garder » est un lien, qui ramène à
     l'écran sans rien envoyer. -->
{#if aConfirmer}
	<div id="confirmer-salle" class="confirmer" role="alert">
		<p>{text.confirmIntro} <strong><bdi>{aConfirmer.name}</bdi></strong></p>
		{#if aConfirmer.courses > 0}<p>{text.roomCourses(aConfirmer.courses)}</p>{/if}
		{#if aConfirmer.fridays > 0}<p>{text.roomFridays(aConfirmer.fridays)}</p>{/if}
		<p>{text.nothingElse}</p>
		<div class="ligne">
			<form method="post" action="?/supprimerSalle">
				<input type="hidden" name="roomId" value={aConfirmer.id} />
				<input type="hidden" name="confirm" value="yes" />
				<button type="submit">{text.confirmDelete}</button>
			</form>
			<a href={resolve('/reglages')}>{text.keepRoom}</a>
		</div>
	</div>
{/if}

<form method="post" action="?/enregistrer" class="colonne">
	<label for="name">{text.nameLabel}</label>
	<input
		id="name"
		name="name"
		type="text"
		bind:value={nom}
		maxlength="120"
		required
		dir="auto"
		aria-describedby="name-aide"
	/>
	<p id="name-aide" class="aide">{text.nameHelp}</p>

	<!-- La liste de la création d'une organisation, l'Europe en tête : un nom tapé à la main laissait
	     passer un alias (Europe/Amsterdam), que le flux agenda refuse ensuite. Un fuseau enregistré
	     avant la liste, qu'elle ne propose pas, vient en premier, choisi, pour ne pas être perdu. -->
	<label for="timeZone">{text.timeZoneLabel}</label>
	<select id="timeZone" name="timeZone" dir="ltr" aria-describedby="timeZone-aide">
		{#if data.timeZoneKept}
			<option value={data.timeZoneKept} selected={data.timeZoneKept === fuseauChoisi}>
				{zoneLabel(data.timeZoneKept)}
			</option>
		{/if}
		<optgroup label={text.timeZoneEurope}>
			{#each data.timeZones.europe as zone (zone)}
				<option value={zone} selected={zone === fuseauChoisi}>{zoneLabel(zone)}</option>
			{/each}
		</optgroup>
		<optgroup label={text.timeZoneWorld}>
			{#each data.timeZones.world as zone (zone)}
				<option value={zone} selected={zone === fuseauChoisi}>{zoneLabel(zone)}</option>
			{/each}
		</optgroup>
	</select>
	<p id="timeZone-aide" class="aide">
		{text.timeZoneHelp}
		{text.timeZoneNotListed}
		{#if data.timeZoneKept}
			{data.timeZoneKeptBreaksCalendar
				? text.timeZoneKeptNoCalendar(data.timeZoneKept)
				: text.timeZoneKept(data.timeZoneKept)}
		{/if}
	</p>

	<label for="accentColor">{text.colourLabel}</label>
	<input
		id="accentColor"
		name="accentColor"
		type="color"
		bind:value={couleur}
		aria-describedby="accentColor-aide"
	/>
	<!-- L'aperçu, et la raison pour laquelle aucune couleur n'est refusée : elle ne sert que de
	     fond, et le texte posé dessus est choisi noir ou blanc selon celui des deux qui contraste
	     le mieux. Le pire cas possible reste au-dessus de 4,5:1, seuil AA (ADR 0031). -->
	<p class="apercu" style={apercu}>
		<span class="pastille">{text.colourPreview}</span>
		{text.colourContrast(rapport)}
	</p>
	<p id="accentColor-aide" class="aide">{text.colourHelp}</p>

	<label for="greeting">{text.greetingLabel}</label>
	<input
		id="greeting"
		name="greeting"
		type="text"
		bind:value={accueil}
		maxlength="60"
		required
		dir="auto"
		aria-describedby="greeting-aide"
	/>
	<p id="greeting-aide" class="aide">{text.greetingHelp}</p>

	<fieldset class="cases" aria-describedby="langues-aide">
		<legend>{text.languagesLegend}</legend>
		<p id="langues-aide" class="aide">{text.languagesHelp}</p>
		{#each data.languesPossibles as langue (langue)}
			<label class="case">
				<input
					type="checkbox"
					name="enabledLanguages"
					value={langue}
					checked={saisie.enabledLanguages.includes(langue)}
				/>
				{languageLabel(langue, data.language)}
			</label>
		{/each}
	</fieldset>

	<label for="defaultLanguage">{text.defaultLanguageLabel}</label>
	<select id="defaultLanguage" name="defaultLanguage" aria-describedby="defaultLanguage-aide">
		{#each data.languesPossibles as langue (langue)}
			<option value={langue} selected={langue === saisie.defaultLanguage}>
				{languageLabel(langue, data.language)}
			</option>
		{/each}
	</select>
	<p id="defaultLanguage-aide" class="aide">{text.defaultLanguageHelp}</p>

	<button type="submit">{text.save}</button>
</form>

<section aria-labelledby="salles-titre">
	<h2 id="salles-titre">{text.roomsTitle}</h2>
	<p class="aide">{text.roomsIntro}</p>

	{#if data.salles.length === 0}
		<p class="aide">{text.roomsNone}</p>
	{/if}
	<ul id="salles">
		{#each data.salles as salle (salle.id)}
			<li>
				<span class="salle">
					<bdi>{salle.name}</bdi>
					{#if salle.courses > 0}<span class="aide">{text.roomCourses(salle.courses)}</span>{/if}
					{#if salle.fridays > 0}<span class="aide">{text.roomFridays(salle.fridays)}</span>{/if}
				</span>
				<form method="post" action="?/supprimerSalle">
					<input type="hidden" name="roomId" value={salle.id} />
					<button type="submit">{text.deleteRoom}</button>
				</form>
			</li>
		{/each}
	</ul>
	<form method="post" action="?/ajouterSalle" class="ligne">
		<label for="salle">{text.newRoomLabel}</label>
		<input
			id="salle"
			name="name"
			type="text"
			maxlength="80"
			required
			dir="auto"
			aria-describedby="salle-aide"
		/>
		<button type="submit">{text.addRoom}</button>
		<p id="salle-aide" class="aide">{text.newRoomHelp}</p>
	</form>
</section>

<!-- Le seul endroit qui propose les heures de prière : pas de bannière, pas de suggestion ailleurs.
     Une organisation à qui cela ne parle pas n'a rien à refuser (ADR 0042). -->
<section aria-labelledby="module-titre">
	<h2 id="module-titre">{text.prayerTitle}</h2>
	{#if organisation.prayer_module}
		<p>{text.prayerOn}</p>
		<p class="discret">{text.prayerOnKeep}</p>
		<form method="post" action="?/modulePrieres">
			<input type="hidden" name="allume" value="non" />
			<button type="submit">{text.turnOff}</button>
		</form>
	{:else}
		<p>{text.prayerOff}</p>
		<form method="post" action="?/modulePrieres">
			<input type="hidden" name="allume" value="oui" />
			<button type="submit">{text.turnOn}</button>
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
		max-width: 32rem;
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
	.salle {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	/* Une propriété logique : en arabe, le bouton va à gauche, au bout de la ligne. */
	li form {
		margin-inline-start: auto;
	}
	.confirmer {
		border: 2px solid #b91c1c;
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-block: 0 1rem;
		max-width: 36rem;
	}
	.confirmer p {
		margin: 0.35rem 0;
	}
	fieldset {
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	fieldset .aide {
		flex-basis: 100%;
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
	.ligne .aide {
		flex-basis: 100%;
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
