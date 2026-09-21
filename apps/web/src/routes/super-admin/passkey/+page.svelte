<script lang="ts">
	// Le seul écran qui exige JavaScript : WebAuthn n'existe que dans le navigateur. Le client
	// Better Auth est importé à la demande, pour que le reste des pages n'en porte pas le poids.
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let etat = $state<'repos' | 'en-cours' | 'echec'>('repos');
	let message = $state('');

	async function client() {
		const [{ createAuthClient }, { passkeyClient }] = await Promise.all([
			import('better-auth/client'),
			import('@better-auth/passkey/client')
		]);
		return createAuthClient({ plugins: [passkeyClient()] });
	}

	async function enregistrer() {
		etat = 'en-cours';
		message = '';
		try {
			const authClient = await client();
			const { error } = await authClient.passkey.addPasskey({ name: 'Cet appareil' });
			if (error) throw new Error(error.message ?? 'refusé');
			etat = 'repos';
			message =
				'Passkey enregistrée. Déconnectez-vous puis reconnectez-vous avec elle pour obtenir vos pouvoirs.';
			await invalidateAll();
		} catch (erreur) {
			etat = 'echec';
			message = erreur instanceof Error ? erreur.message : 'refusé';
		}
	}

	async function seConnecter() {
		etat = 'en-cours';
		message = '';
		try {
			const authClient = await client();
			const { error } = await authClient.signIn.passkey();
			if (error) throw new Error(error.message ?? 'refusé');
			window.location.assign('/super-admin');
		} catch (erreur) {
			etat = 'echec';
			message = erreur instanceof Error ? erreur.message : 'refusé';
		}
	}

	async function supprimer(id: string) {
		etat = 'en-cours';
		message = '';
		try {
			const authClient = await client();
			const { error } = await authClient.passkey.deletePasskey({ id });
			if (error) throw new Error(error.message ?? 'refusé');
			etat = 'repos';
			await invalidateAll();
		} catch (erreur) {
			etat = 'echec';
			message = erreur instanceof Error ? erreur.message : 'refusé';
		}
	}
</script>

<svelte:head><title>Passkey | jadwal</title></svelte:head>

<h1>Votre passkey</h1>

<p>
	Les pouvoirs de super-admin exigent une session ouverte par passkey. Un lien magique seul ne les
	donne jamais : une boîte aux lettres compromise ne doit pas suffire à ouvrir toutes les mosquées.
</p>

<noscript>
	<p class="erreur">
		Cet écran a besoin de JavaScript : une passkey est créée par le navigateur lui-même, il n’existe
		pas de formulaire qui puisse le faire. Tout le reste de l’application fonctionne sans.
	</p>
</noscript>

{#if data.hasSuperAdminPowers}
	<p class="succes" role="status">
		Cette session est ouverte par passkey : vos pouvoirs sont actifs.
	</p>
{:else if data.amorcage}
	<p class="avertissement">
		Aucune passkey enregistrée. Vous pouvez en enregistrer une maintenant, depuis cette session. Dès
		qu’il y en aura une, il faudra une session ouverte par passkey pour en ajouter ou en retirer.
	</p>
{:else}
	<p class="avertissement">
		Cette session a été ouverte par lien magique : elle n’a aucun pouvoir. Connectez-vous avec une
		passkey déjà enregistrée.
	</p>
{/if}

{#if message}
	<p class={etat === 'echec' ? 'erreur' : 'succes'} role="status">{message}</p>
{/if}

<div class="actions">
	{#if data.amorcage || data.hasSuperAdminPowers}
		<button type="button" onclick={enregistrer} disabled={etat === 'en-cours'}>
			Enregistrer une passkey
		</button>
	{/if}
	{#if !data.hasSuperAdminPowers && !data.amorcage}
		<button type="button" onclick={seConnecter} disabled={etat === 'en-cours'}>
			Se connecter avec une passkey
		</button>
	{/if}
</div>

<section aria-labelledby="liste-titre">
	<h2 id="liste-titre">Passkeys enregistrées</h2>
	{#if data.passkeys.length === 0}
		<p class="aide">Aucune.</p>
	{/if}
	<ul>
		{#each data.passkeys as passkey (passkey.id)}
			<li>
				{passkey.name}, enregistrée le {passkey.createdAt}
				{#if data.hasSuperAdminPowers}
					<button type="button" onclick={() => supprimer(passkey.id)}>Supprimer</button>
				{/if}
			</li>
		{/each}
	</ul>
	<p class="aide">
		Enregistrez-en plusieurs : perdre son téléphone ne doit pas fermer le service. Si toutes sont
		perdues, la remise à zéro se fait côté base, par le propriétaire, jamais par une question
		secrète ni par un code envoyé par courriel.
	</p>
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
		margin-left: auto;
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
		border-left: 4px solid #d97706;
		padding: 0.5rem 0.75rem;
	}
	.aide {
		font-size: 0.85rem;
		color: #555;
	}
</style>
