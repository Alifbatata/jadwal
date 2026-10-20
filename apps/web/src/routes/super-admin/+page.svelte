<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { LANGUES, NOM_DE_LANGUE } from '$lib/i18n.js';
	import { commonTexts } from '$lib/i18n/common.js';
	import { superAdminTexts } from '$lib/i18n/super-admin.js';
	import { PUBLIC_ADDRESS_PATTERN, proposePublicAddress } from './public-address.js';

	let { data, form } = $props();
	const text = $derived(superAdminTexts[data.language]);

	/**
	 * L'exemple d'adresse, tiré de l'exemple de nom par la fonction qui propose l'adresse pendant la
	 * frappe. Un exemple de nom sans lettre latine (l'arabe) n'en donne aucun : celui du français sert.
	 */
	const addressExample = $derived(
		proposePublicAddress(text.nameExample) || proposePublicAddress(superAdminTexts.fr.nameExample)
	);

	/** Le message d'une erreur rendue par une action, dans la langue de l'écran. */
	const errorMessage = $derived.by(() => {
		const error = form?.error;
		if (!error) return '';
		if (error === 'invalidEmail') return commonTexts[data.language].errors.invalidEmail;
		const message = text.errors[error];
		return typeof message === 'function' ? message(addressExample) : message;
	});

	type Statut = keyof typeof text.statuses;
	const statusLabel = (status: string) => text.statuses[status as Statut] ?? status;

	// Le formulaire de création. Après une erreur, il revient avec ce qui avait été saisi. L'adresse
	// suit le nom pendant la frappe, tant que la personne ne l'a pas écrite elle-même ; si elle
	// l'efface, la proposition reprend. Sans JavaScript, le champ reste vide et le serveur propose la
	// même adresse, par la même fonction, puis la montre avant de rien créer.
	const saisi = untrack(() => (form && 'values' in form ? form.values : undefined));
	let name = $state(saisi?.name ?? '');
	let address = $state(saisi?.slug ?? '');
	let addressWritten = $state(Boolean(saisi?.slug));
	// Le fuseau saisi revient choisi s'il est dans la liste. Un nom qu'elle n'a pas ne choisirait
	// aucune option, et le navigateur prendrait la première : c'est alors celui de la Suisse.
	const chosenTimeZone = untrack(() => {
		const zone = saisi?.timeZone ?? '';
		const listed = data.timeZones.europe.includes(zone) || data.timeZones.world.includes(zone);
		return listed ? zone : data.defaultTimeZone;
	});
	// La personne responsable, facultative, et la langue de son courriel : celle de l'écran d'abord.
	const managerEmail = untrack(() => saisi?.managerEmail ?? '');
	const managerLanguage = untrack(() => saisi?.language ?? data.language);
	const shownAddress = $derived(address || proposePublicAddress(name));
	/**
	 * Un nom sans lettre latine ne propose aucune adresse : la phrase sous le champ demande de
	 * l'écrire, pendant la frappe, et après un envoi sans JavaScript (étape 19, D6).
	 */
	const addressToType = $derived(
		name.trim() !== '' && address === '' && proposePublicAddress(name) === ''
	);
	/**
	 * L'adresse que le serveur a proposée parce que le champ est arrivé vide : rien n'est créé avant
	 * qu'elle soit confirmée, ou changée, dans l'étape qui la montre en entier (étape 19, D6).
	 */
	const toConfirm = $derived(form && 'toConfirm' in form ? form.toConfirm : null);

	/**
	 * L'invitation saisie dans la liste et refusée : elle revient dans le formulaire de son
	 * organisation, ouvert, avec l'adresse et la langue saisies.
	 */
	const inviteBack = $derived(form && 'invite' in form ? form.invite : null);
	const inviteFor = (organizationId: string) =>
		inviteBack?.organizationId === organizationId ? inviteBack : null;

	function followName(event: Event & { currentTarget: HTMLInputElement }) {
		name = event.currentTarget.value;
		if (!addressWritten) address = proposePublicAddress(name);
	}

	function writeAddress(event: Event & { currentTarget: HTMLInputElement }) {
		address = event.currentTarget.value;
		addressWritten = address !== '';
	}

	/** Un nom de fuseau se lit mieux sans ses traits de soulignement : « America/New York ». */
	const zoneLabel = (zone: string) => zone.replaceAll('_', ' ');
</script>

<svelte:head><title>{text.title} | jadwal</title></svelte:head>

<h1>{text.title}</h1>
<p class="details">{text.intro}</p>

{#if errorMessage}<p class="erreur" role="alert">{errorMessage}</p>{/if}

<!-- Sans JavaScript, l'adresse proposée à partir du nom n'a été vue par personne : elle se montre
     ici, en haut de la page qui revient, dans un champ où on la confirme ou la change. Le nom et le
     fuseau repartent tels quels ; le formulaire de création, plus bas, les garde aussi. -->
{#if toConfirm}
	<section class="a-confirmer" aria-labelledby="confirmer-titre">
		<h2 id="confirmer-titre">{text.confirm.title}</h2>
		<p>{text.confirm.notYet} <strong><bdi>{toConfirm.name}</bdi></strong></p>
		<p class="adresse-complete">
			{text.confirm.proposed}
			<strong><bdi dir="ltr">{toConfirm.address}</bdi></strong>
		</p>
		{#if toConfirm.managerEmail}
			<p class="adresse-complete">
				{text.confirm.invite}
				<strong><bdi dir="ltr">{toConfirm.managerEmail}</bdi></strong>
			</p>
		{/if}
		<p>{text.confirm.check}</p>
		<form method="post" action="?/ouvrir" class="colonne">
			<input type="hidden" name="name" value={toConfirm.name} />
			<input type="hidden" name="timeZone" value={toConfirm.timeZone} />
			{#if toConfirm.managerEmail}
				<input type="hidden" name="managerEmail" value={toConfirm.managerEmail} />
				<input type="hidden" name="emailLanguage" value={toConfirm.language} />
			{/if}
			<label for="slug-confirme">{text.addressLabel}</label>
			<input
				id="slug-confirme"
				name="slug"
				type="text"
				dir="ltr"
				autocapitalize="none"
				autocomplete="off"
				spellcheck="false"
				required
				pattern={PUBLIC_ADDRESS_PATTERN}
				aria-describedby="slug-confirme-regle"
				value={toConfirm.slug}
			/>
			<p id="slug-confirme-regle" class="aide">{text.addressRule}</p>
			<button type="submit">{text.create}</button>
		</form>
	</section>
{/if}

{#if form && 'created' in form && form.created}
	<section class="succes" aria-labelledby="succes-titre">
		<p id="succes-titre">
			{text.created}
			<strong><bdi>{form.created.name}</bdi></strong>
		</p>
		<p>
			{text.createdAddress}
			<bdi dir="ltr">{form.created.address}</bdi>
		</p>
		{#if form.created.invited}
			<p>
				{text.invite.sentTo}
				<bdi dir="ltr">{form.created.invited}</bdi>
			</p>
			<p>{text.invite.validity(data.invitationDays)}</p>
		{:else}
			<p>{text.createdNext}</p>
		{/if}
	</section>
{/if}
{#if form && 'invited' in form && form.invited}
	<section class="succes" aria-labelledby="invitee-titre">
		<p id="invitee-titre">
			{text.invite.sentTo}
			<strong><bdi dir="ltr">{form.invited.email}</bdi></strong>
		</p>
		<p>
			{text.invite.sentFor}
			<bdi>{form.invited.name}</bdi>
		</p>
		<p>{text.invite.validity(data.invitationDays)}</p>
	</section>
{/if}
{#if form && 'statusSaved' in form && form.statusSaved}
	<p class="succes" role="status">{text.statusSaved} <bdi>{form.statusSaved}</bdi>.</p>
{/if}

{#if form && 'link' in form && form.link}
	<section class="secours" aria-labelledby="secours-titre">
		<h2 id="secours-titre">{text.rescue.resultTitle} <bdi>{form.email}</bdi></h2>
		<textarea readonly rows="3" dir="ltr" aria-label={text.rescue.linkLabel}>{form.link}</textarea>
		<p>{text.rescue.resultCopy}</p>
		<p>{text.rescue.resultOpens}</p>
		<p class="details">{text.rescue.resultLog}</p>
	</section>
{/if}

<section aria-labelledby="liste-titre">
	<h2 id="liste-titre">{text.listTitle}</h2>
	{#if data.organisations.length === 0}
		<p class="details">{text.listEmpty}</p>
	{:else}
		<dl class="aide">
			<dt>{text.enter}</dt>
			<dd>{text.enterHelp}</dd>
			<dt>{text.statusLabel}</dt>
			<dd>{text.statusHelp}</dd>
			<dt>{text.invite.summary}</dt>
			<dd>{text.invite.help}</dd>
		</dl>
	{/if}
	<ul>
		{#each data.organisations as organisation (organisation.id)}
			<li>
				<p class="titre">
					<bdi>{organisation.name}</bdi>
					<span class="etiquette">{statusLabel(organisation.status)}</span>
				</p>
				<p class="adresse">
					{text.publicPage}
					<a href={resolve('/m/[slug]/[[langue=langue]]', { slug: organisation.slug })}
						><bdi dir="ltr">{data.publicPrefix}{organisation.slug}</bdi></a
					>
				</p>
				<div class="actions">
					<form method="post" action="?/entrer">
						<input type="hidden" name="organizationId" value={organisation.id} />
						<button type="submit">{text.enter}</button>
					</form>

					<form method="post" action="?/statut">
						<input type="hidden" name="organizationId" value={organisation.id} />
						<label for={`statut-${organisation.id}`}>{text.statusLabel}</label>
						<select id={`statut-${organisation.id}`} name="status">
							{#each data.statuts as statut (statut)}
								<option value={statut} selected={statut === organisation.status}>
									{statusLabel(statut)}
								</option>
							{/each}
						</select>
						<button type="submit">{text.saveStatus}</button>
					</form>
				</div>

				<!-- Inviter sa personne responsable sans entrer dans son espace (étape 22). Un élément
				     replié : sans JavaScript comme avec, il s'ouvre au toucher, et il revient ouvert, avec ce
				     qui a été saisi, quand l'invitation de cette organisation a été refusée. -->
				<details class="inviter" open={inviteFor(organisation.id) !== null}>
					<summary>{text.invite.summary}</summary>
					<form method="post" action="?/inviter" class="colonne">
						<input type="hidden" name="organizationId" value={organisation.id} />
						<label for={`invite-email-${organisation.id}`}>{text.invite.emailLabel}</label>
						<input
							id={`invite-email-${organisation.id}`}
							name="email"
							type="email"
							dir="ltr"
							autocomplete="off"
							required
							aria-describedby={`invite-email-aide-${organisation.id}`}
							value={inviteFor(organisation.id)?.email ?? ''}
						/>
						<p id={`invite-email-aide-${organisation.id}`} class="aide">{text.invite.emailHint}</p>
						<label for={`invite-language-${organisation.id}`}>{text.invite.languageLabel}</label>
						<select
							id={`invite-language-${organisation.id}`}
							name="emailLanguage"
							aria-describedby={`invite-language-aide-${organisation.id}`}
						>
							{#each LANGUES as langue (langue)}
								<option
									value={langue}
									lang={langue}
									selected={langue === (inviteFor(organisation.id)?.language ?? data.language)}
								>
									{NOM_DE_LANGUE[langue]}
								</option>
							{/each}
						</select>
						<p id={`invite-language-aide-${organisation.id}`} class="aide">
							{text.invite.languageHelp}
						</p>
						<button type="submit">{text.invite.submit}</button>
					</form>
				</details>
			</li>
		{/each}
	</ul>
</section>

<section aria-labelledby="creer-titre">
	<h2 id="creer-titre">{text.createTitle}</h2>
	<p>{text.createIntro}</p>
	<form method="post" action="?/ouvrir" class="colonne">
		<label for="name">{text.nameLabel}</label>
		<input
			id="name"
			name="name"
			type="text"
			dir="auto"
			maxlength="120"
			required
			aria-describedby="name-aide"
			value={name}
			oninput={followName}
		/>
		<p id="name-aide" class="aide">
			{text.nameHint}
			{text.example}
			<bdi class="exemple">{text.nameExample}</bdi>
		</p>

		<label for="slug">{text.addressLabel}</label>
		<input
			id="slug"
			name="slug"
			type="text"
			dir="ltr"
			autocapitalize="none"
			autocomplete="off"
			spellcheck="false"
			pattern={PUBLIC_ADDRESS_PATTERN}
			aria-describedby="slug-a-taper slug-aide slug-regle slug-adresse"
			value={address}
			oninput={writeAddress}
		/>
		<p id="slug-a-taper" class="aide" aria-live="polite">
			{addressToType ? text.addressToType : ''}
		</p>
		<p id="slug-aide" class="aide">{text.addressHint}</p>
		<p id="slug-regle" class="aide">
			{text.addressRule}
			{text.example}
			<bdi class="exemple" dir="ltr">{addressExample}</bdi>
		</p>
		<p id="slug-adresse" class="adresse-complete">
			{text.fullAddress}
			<output for="name slug"><bdi dir="ltr">{data.publicPrefix}{shownAddress}</bdi></output>
		</p>
		<p class="aide">{text.addressFixed}</p>

		<label for="timeZone">{text.timeZoneLabel}</label>
		<select id="timeZone" name="timeZone" aria-describedby="timeZone-aide timeZone-ville">
			<optgroup label={text.timeZoneEurope}>
				{#each data.timeZones.europe as zone (zone)}
					<option value={zone} selected={zone === chosenTimeZone}>{zoneLabel(zone)}</option>
				{/each}
			</optgroup>
			<optgroup label={text.timeZoneWorld}>
				{#each data.timeZones.world as zone (zone)}
					<option value={zone} selected={zone === chosenTimeZone}>{zoneLabel(zone)}</option>
				{/each}
			</optgroup>
		</select>
		<p id="timeZone-aide" class="aide">{text.timeZoneHint(data.defaultTimeZone)}</p>
		<p id="timeZone-ville" class="aide">{text.timeZoneNotListed}</p>

		<!-- La personne responsable, facultative (étape 22) : saisie, l'invitation part avec la
		     création, dans la même transaction ; vide, l'organisation est créée seule. -->
		<fieldset aria-describedby="manager-intro">
			<legend>{text.manager.legend}</legend>
			<p id="manager-intro" class="aide">{text.manager.intro}</p>
			<label for="managerEmail">{text.invite.emailLabel}</label>
			<input
				id="managerEmail"
				name="managerEmail"
				type="email"
				dir="ltr"
				autocomplete="off"
				aria-describedby="managerEmail-aide"
				value={managerEmail}
			/>
			<p id="managerEmail-aide" class="aide">{text.invite.emailHint}</p>
			<label for="emailLanguage">{text.invite.languageLabel}</label>
			<select id="emailLanguage" name="emailLanguage" aria-describedby="emailLanguage-aide">
				{#each LANGUES as langue (langue)}
					<option value={langue} lang={langue} selected={langue === managerLanguage}>
						{NOM_DE_LANGUE[langue]}
					</option>
				{/each}
			</select>
			<p id="emailLanguage-aide" class="aide">{text.invite.languageHelp}</p>
		</fieldset>

		<button type="submit">{text.create}</button>
	</form>
</section>

<section aria-labelledby="lien-titre">
	<h2 id="lien-titre">{text.rescue.title}</h2>
	<p>{text.rescue.when}</p>
	<p>{text.rescue.what}</p>
	<p>{text.rescue.duration}</p>
	<form method="post" action="?/lienSecours" class="colonne">
		<label for="email">{text.rescue.emailLabel}</label>
		<input
			id="email"
			name="email"
			type="email"
			dir="ltr"
			autocomplete="off"
			required
			aria-describedby="email-aide"
		/>
		<p id="email-aide" class="aide">{text.rescue.emailHint}</p>
		<button type="submit">{text.rescue.submit}</button>
	</form>
</section>

<style>
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.titre {
		font-weight: 600;
		margin: 0 0 0.5rem;
	}
	.adresse {
		margin: 0 0 0.5rem;
		overflow-wrap: anywhere;
	}
	.etiquette {
		font-size: 0.8rem;
		font-weight: 400;
		background: #e5e7eb;
		border-radius: 0.25rem;
		padding: 0.1rem 0.4rem;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.actions form {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.colonne {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 32rem;
	}
	label {
		font-size: 0.9rem;
		font-weight: 600;
		margin-block-start: 0.5rem;
	}
	.actions label {
		margin-block-start: 0;
	}
	fieldset {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		padding: 0.75rem;
		margin: 0.75rem 0 0;
	}
	legend {
		font-weight: 600;
		padding: 0 0.25rem;
	}
	details.inviter {
		margin-block-start: 0.5rem;
	}
	details.inviter summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
		font-weight: 600;
	}
	input,
	select,
	button,
	textarea {
		min-height: 44px;
		font: inherit;
		padding: 0.25rem 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
		background: #fff;
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
	}
	button {
		background: var(--accent);
		color: var(--accent-texte);
		border-color: var(--accent);
		cursor: pointer;
	}
	.colonne button {
		align-self: flex-start;
		margin-block-start: 0.5rem;
	}
	.aide,
	dl.aide {
		color: #555;
		font-size: 0.9rem;
		margin: 0;
	}
	dl.aide {
		margin-block-end: 0.75rem;
	}
	dl.aide dt {
		font-weight: 600;
		margin-block-start: 0.35rem;
	}
	dl.aide dd {
		margin-inline-start: 0;
	}
	/* Un exemple d'adresse ne se coupe pas à son trait d'union : on le lirait comme une césure. */
	.exemple {
		white-space: nowrap;
	}
	.adresse-complete {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.adresse-complete output {
		font-weight: 600;
	}
	.succes,
	.secours {
		background: #ecfdf5;
		border-inline-start: 4px solid var(--accent);
		padding: 0.75rem;
	}
	.a-confirmer {
		background: #fef3c7;
		border-inline-start: 4px solid #d97706;
		padding: 0.75rem;
	}
	.a-confirmer h2 {
		margin-block-start: 0;
		font-size: 1.1rem;
	}
	.a-confirmer .adresse-complete bdi {
		overflow-wrap: anywhere;
	}
	.succes p {
		margin: 0.25rem 0;
	}
	.details {
		color: #555;
		font-size: 0.95rem;
	}
	.erreur {
		color: #b91c1c;
		font-weight: 600;
	}
</style>
