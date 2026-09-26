<script lang="ts">
	import { resolve } from '$app/paths';
	import { commonTexts } from '$lib/i18n/common.js';
	import { signInTexts } from '$lib/i18n/sign-in.js';

	let { data, form } = $props();
	const text = $derived(signInTexts[data.language]);
	const common = $derived(commonTexts[data.language]);
</script>

<svelte:head><title>{text.title} | jadwal</title></svelte:head>

<h1>{text.title}</h1>

{#if form?.sent}
	<p role="status">{text.sent}</p>
	<p>{text.sentHint}</p>
	<p><a href={resolve('/connexion')}>{text.askAgain}</a></p>
	<p>{text.close}</p>
{:else}
	<p>{text.intro}</p>
	<form method="post">
		<label for="email">{text.emailLabel}</label>
		<!-- L'aide et l'erreur sont reliées au champ : un lecteur d'écran les lit avec son nom. Une
		     adresse électronique s'écrit de gauche à droite, même sur une page arabe (`dir="ltr"`). -->
		<p class="aide" id="email-aide">{text.emailHint}</p>
		<input
			id="email"
			name="email"
			type="email"
			autocomplete="email"
			dir="ltr"
			required
			value={form?.email ?? ''}
			aria-describedby={form?.invalidEmail ? 'email-aide email-erreur' : 'email-aide'}
			aria-invalid={form?.invalidEmail ? 'true' : undefined}
		/>
		{#if form?.invalidEmail}
			<p role="alert" id="email-erreur">{common.errors.invalidEmail}</p>
		{/if}
		<button type="submit">{text.submit}</button>
	</form>
	<p class="invitation">{text.notInvited}</p>
{/if}

<!-- Le texte que chacun accepte à sa première entrée dans un espace : il se lit avant d'avoir un
     compte (ADR 0044). -->
<p class="conditions">
	<a href={resolve('/conditions')}>{text.readTerms}</a>
</p>

<style>
	form {
		display: grid;
		gap: 0.5rem;
		max-width: 22rem;
	}
	label {
		font-weight: 600;
	}
	.aide {
		margin: 0;
		color: #4a5560;
		font-size: 0.95rem;
	}
	input,
	button {
		font: inherit;
		padding: 0.5rem;
	}
	.invitation {
		margin-top: 1.5rem;
	}
	.conditions {
		margin-top: 1.5rem;
	}
</style>
