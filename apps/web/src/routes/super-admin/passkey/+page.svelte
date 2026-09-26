<script lang="ts">
	// Le seul écran qui exige JavaScript : WebAuthn n'existe que dans le navigateur. Le client
	// Better Auth est importé à la demande, pour que le reste des pages n'en porte pas le poids.
	import { invalidateAll } from '$app/navigation';
	import { numericDate } from '$lib/i18n.js';
	import { passkeyTexts } from '$lib/i18n/super-admin-passkey.js';
	import { afterRegistration, passkeyButtons } from './screen.js';

	let { data } = $props();
	const text = $derived(passkeyTexts[data.language]);
	const buttons = $derived(passkeyButtons(data));

	type Outcome =
		'registered' | 'registeredAnother' | 'registerFailed' | 'signInFailed' | 'deleteFailed';

	let etat = $state<'repos' | 'en-cours' | 'echec'>('repos');
	/** Ce qui vient de se passer, dit dans la langue de l'écran. */
	let outcome = $state<Outcome | null>(null);
	/** Le message technique du navigateur après un échec, dans la langue qu'il choisit. */
	let detail = $state('');

	async function client() {
		const [{ createAuthClient }, { passkeyClient }] = await Promise.all([
			import('better-auth/client'),
			import('@better-auth/passkey/client')
		]);
		return createAuthClient({ plugins: [passkeyClient()] });
	}

	function begin() {
		etat = 'en-cours';
		outcome = null;
		detail = '';
	}

	function failed(what: Outcome, erreur: unknown) {
		etat = 'echec';
		outcome = what;
		detail = erreur instanceof Error ? erreur.message : '';
	}

	async function enregistrer() {
		begin();
		// Le message dépend de la session qui enregistre, lue avant que les données ne changent.
		const said = afterRegistration(data);
		try {
			const authClient = await client();
			const { error } = await authClient.passkey.addPasskey({ name: text.thisDevice });
			if (error) throw new Error(error.message ?? '');
			etat = 'repos';
			// Pas de déconnexion. Pour la première passkey, le bouton « Se connecter avec une
			// passkey » apparaît juste en dessous dès que les données sont relues, et c'est lui qui
			// donne les pouvoirs à cette session. Pour une passkey de plus, la session a déjà ses
			// pouvoirs : aucun bouton n'apparaît, et le message le dit.
			outcome = said;
			await invalidateAll();
		} catch (erreur) {
			failed('registerFailed', erreur);
		}
	}

	async function seConnecter() {
		begin();
		try {
			const authClient = await client();
			const { error } = await authClient.signIn.passkey();
			if (error) throw new Error(error.message ?? '');
			window.location.assign('/super-admin');
		} catch (erreur) {
			failed('signInFailed', erreur);
		}
	}

	async function supprimer(id: string) {
		begin();
		try {
			const authClient = await client();
			const { error } = await authClient.passkey.deletePasskey({ id });
			if (error) throw new Error(error.message ?? '');
			etat = 'repos';
			await invalidateAll();
		} catch (erreur) {
			failed('deleteFailed', erreur);
		}
	}
</script>

<svelte:head><title>{text.title} | jadwal</title></svelte:head>

<h1>{text.title}</h1>

<p>{text.what}</p>
<p>{text.why}</p>

<noscript>
	<p class="erreur">{text.noScript}</p>
</noscript>

{#if data.hasSuperAdminPowers}
	<p class="succes" role="status">{text.powersActive}</p>
{:else if data.amorcage}
	<p class="avertissement">{text.firstTime}</p>
{:else}
	<p class="avertissement">{text.noPowers}</p>
{/if}

{#if outcome}
	<p class={etat === 'echec' ? 'erreur' : 'succes'} role="status">{text[outcome]}</p>
	{#if detail}
		<p class="aide">{text.detail} <bdi>{detail}</bdi></p>
	{/if}
{/if}

<div class="actions">
	{#if buttons.register}
		<button type="button" onclick={enregistrer} disabled={etat === 'en-cours'}>
			{text.register}
		</button>
	{/if}
	{#if buttons.signIn}
		<button type="button" onclick={seConnecter} disabled={etat === 'en-cours'}>
			{text.signIn}
		</button>
	{/if}
</div>

<section aria-labelledby="liste-titre">
	<h2 id="liste-titre">{text.listTitle}</h2>
	{#if data.passkeys.length === 0}
		<p class="aide">{text.none}</p>
	{/if}
	<ul>
		{#each data.passkeys as passkey (passkey.id)}
			<li>
				<!-- Le nom et la date, côte à côte : l'espacement de la ligne les sépare dans les cinq
				     langues, sans virgule à placer du bon côté d'un nom écrit dans un autre sens. -->
				<strong><bdi>{passkey.name ?? text.unnamed}</bdi></strong>
				<span>{text.registeredOn(numericDate(passkey.createdAt))}</span>
				{#if data.hasSuperAdminPowers}
					<button type="button" onclick={() => supprimer(passkey.id)}>{text.delete}</button>
				{/if}
			</li>
		{/each}
	</ul>
	<p class="aide">{text.advice}</p>
</section>

<style>
	.actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	button {
		min-height: 44px;
		font: inherit;
		padding: 0 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--accent-texte);
		cursor: pointer;
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
	li button {
		margin-inline-start: auto;
	}
	.erreur {
		color: #b91c1c;
		font-weight: 600;
	}
	.succes {
		color: #065f46;
		font-weight: 600;
	}
	.avertissement {
		background: #fef3c7;
		border-inline-start: 4px solid #d97706;
		padding: 0.5rem 0.75rem;
	}
	.aide {
		font-size: 0.85rem;
		color: #555;
	}
</style>
