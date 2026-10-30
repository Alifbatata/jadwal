<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n.js';
	import { accessRequestTexts } from '$lib/i18n/access-request.js';
	import { commonTexts } from '$lib/i18n/common.js';
	import type { AccessRequestError, AccessRequestField } from '$lib/server/access-requests.js';

	let { data, form } = $props();
	const text = $derived(accessRequestTexts[data.language]);
	const common = $derived(commonTexts[data.language]);

	/** Les quatre champs d'une ligne ; le message, sur plusieurs lignes, est écrit à part. */
	const lines = $derived([
		{
			name: 'organization',
			label: text.organizationLabel,
			hint: text.organizationHint,
			autocomplete: 'organization'
		},
		{
			name: 'locality',
			label: text.localityLabel,
			hint: text.localityHint,
			autocomplete: 'address-level2'
		},
		{ name: 'contact', label: text.contactLabel, hint: text.contactHint, autocomplete: 'name' },
		{
			name: 'email',
			label: text.emailLabel,
			hint: text.emailHint,
			autocomplete: 'email',
			type: 'email'
		}
	] as const);

	function value(field: AccessRequestField): string {
		return form && 'values' in form && form.values ? form.values[field] : '';
	}

	function error(field: AccessRequestField): AccessRequestError | undefined {
		return form && 'errors' in form && form.errors ? form.errors[field] : undefined;
	}

	function errorText(code: AccessRequestError): string {
		return code === 'invalidEmail' ? common.errors.invalidEmail : text.errors[code];
	}

	/** L'aide d'abord, puis l'erreur : un lecteur d'écran les lit avec le nom du champ. */
	function describedBy(field: AccessRequestField): string {
		return error(field) ? `${field}-aide ${field}-erreur` : `${field}-aide`;
	}
</script>

<svelte:head><title>{text.title} | jadwal</title></svelte:head>

<h1>{text.title}</h1>

{#if form && 'sent' in form && form.sent}
	<p role="status">{text.sent}</p>
	<p>{text.sentHint}</p>
	<p>{text.close}</p>
{:else}
	<p>{text.intro}</p>
	<p>{text.outcome}</p>
	<p>{text.member}</p>

	{#if form && 'tooMany' in form && form.tooMany}
		<p role="alert" class="erreur">{text.tooMany}</p>
	{:else if form && 'errors' in form && form.errors}
		<p role="alert" class="erreur">{text.errorSummary}</p>
	{/if}

	<form method="post">
		{#each lines as line (line.name)}
			<div class="champ">
				<label for={line.name}>{line.label}</label>
				<p class="aide" id="{line.name}-aide">{line.hint}</p>
				<!-- Une adresse électronique s'écrit de gauche à droite, même sur une page arabe. -->
				<input
					id={line.name}
					name={line.name}
					type={'type' in line ? line.type : 'text'}
					autocomplete={line.autocomplete}
					dir={line.name === 'email' ? 'ltr' : undefined}
					required
					maxlength={data.max[line.name]}
					value={value(line.name)}
					aria-describedby={describedBy(line.name)}
					aria-invalid={error(line.name) ? 'true' : undefined}
				/>
				{#if error(line.name)}
					{@const code = error(line.name) as AccessRequestError}
					<p class="erreur" id="{line.name}-erreur">{errorText(code)}</p>
				{/if}
			</div>
		{/each}

		<div class="champ">
			<label for="message">{text.messageLabel}</label>
			<p class="aide" id="message-aide">{text.messageHint}</p>
			<textarea
				id="message"
				name="message"
				rows="5"
				maxlength={data.max.message}
				aria-describedby={describedBy('message')}
				aria-invalid={error('message') ? 'true' : undefined}>{value('message')}</textarea
			>
			{#if error('message')}
				<p class="erreur" id="message-erreur">
					{errorText(error('message') as AccessRequestError)}
				</p>
			{/if}
		</div>

		<section aria-labelledby="donnees">
			<h2 id="donnees">{text.privacyTitle}</h2>
			<p>{text.privacy}</p>
			<p>{text.privacyTerms} <a href={resolve('/conditions')}>{t(data.language).terms}</a>.</p>
		</section>

		<button type="submit">{text.submit}</button>
	</form>
{/if}

<style>
	form {
		display: grid;
		gap: 1rem;
		max-width: 32rem;
	}
	.champ {
		display: grid;
		gap: 0.35rem;
	}
	label {
		font-weight: 600;
	}
	.aide {
		margin: 0;
		color: #4a5560;
		font-size: 0.95rem;
	}
	.erreur {
		margin: 0;
		color: #a4161a;
		font-weight: 600;
	}
	h2 {
		font-size: 1.1rem;
		margin: 0.5rem 0 0;
	}
	input,
	textarea,
	button {
		font: inherit;
		padding: 0.5rem;
	}
	button {
		justify-self: start;
	}
</style>
