<script lang="ts">
	// Le poste « Diffuser » (ADR 0056). Les textes sont dans `#lib/i18n/live.ts`.
	//
	// Cette page ne décide de rien : `session.ts` tient le fil avec le relais, `microphone.ts` le
	// micro. Elle les branche l'un sur l'autre, et montre ce qui se passe à une personne qui a
	// autre chose à faire que de lire un écran.
	import { onDestroy, onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { liveTexts } from '#lib/i18n/live.js';
	import { languesEnClair } from '#lib/public/affichage.js';
	import {
		keepScreenOn,
		MicrophoneFailure,
		startCapture,
		type Capture,
		type MicrophoneError
	} from '#lib/direct/microphone.js';
	import {
		BroadcastSession,
		openRelaySocket,
		type BroadcastState,
		type TokenAnswer
	} from '#lib/direct/session.js';

	let { data } = $props();
	const text = $derived(liveTexts[data.language]);
	/** Le nom d'une langue, écrit dans la langue de l'écran. */
	const nameOf = (language: string) => languesEnClair(data.language, [language]);

	/** Sous ce niveau, le micro ne donne rien : un souffle, pas une voix. */
	const QUIET = 0.005;
	/** Vingt-cinq morceaux de 200 ms : cinq secondes de silence avant de le dire. */
	const QUIET_CHUNKS = 25;

	/** Les langues cochées : toutes, à l'ouverture de l'écran. */
	let chosen = $state<string[]>(untrack(() => [...data.languages]));
	let broadcast = $state<BroadcastState>({
		phase: 'idle',
		languages: [],
		seconds: 0,
		maxSeconds: null,
		listeners: {},
		end: null
	});
	/** Le micro est demandé : le navigateur attend peut-être la réponse de la personne. */
	let preparing = $state(false);
	let microphoneError = $state<MicrophoneError | null>(null);
	let noLanguage = $state(false);
	let peak = $state(0);
	let silent = $state(false);
	/** Le script tourne : avant, le bouton ne ferait rien, et il est éteint. */
	let ready = $state(false);

	let session: BroadcastSession | null = null;
	let capture: Capture | null = null;
	let awake: { release(): void } | null = null;
	let quietChunks = 0;

	const busy = $derived(
		preparing ||
			broadcast.phase === 'starting' ||
			broadcast.phase === 'live' ||
			broadcast.phase === 'resuming'
	);
	const onAir = $derived(broadcast.phase === 'live' || broadcast.phase === 'resuming');
	const total = $derived(
		broadcast.languages.reduce((sum, language) => sum + (broadcast.listeners[language] ?? 0), 0)
	);

	/** Ce que la fin d'un direct, ou son refus, donne à lire. */
	const outcome = $derived.by((): { text: string; alert: boolean } | null => {
		if (microphoneError) return { text: text.microphoneErrors[microphoneError], alert: true };
		const end = broadcast.end;
		if (!end || broadcast.phase !== 'ended') return null;
		if (end.kind === 'closed') {
			const known: Record<string, string> = text.closed;
			return {
				text: Object.hasOwn(known, end.reason) ? (known[end.reason] as string) : text.closed.other,
				alert: end.reason !== 'requested'
			};
		}
		if (end.kind === 'refused') {
			const known: Record<string, string> = text.refused;
			return {
				text: Object.hasOwn(known, end.reason) ? (known[end.reason] as string) : text.refused.other,
				alert: true
			};
		}
		return { text: text[end.kind], alert: true };
	});

	onMount(() => {
		ready = true;
	});

	/** `1:02:07`, ou `2:07` sous une heure : des chiffres, pareils dans les cinq langues. */
	function clock(seconds: number): string {
		const whole = Math.max(0, Math.floor(seconds));
		const hours = Math.floor(whole / 3600);
		const minutes = Math.floor((whole % 3600) / 60);
		const rest = String(whole % 60).padStart(2, '0');
		return hours > 0
			? `${hours}:${String(minutes).padStart(2, '0')}:${rest}`
			: `${minutes}:${rest}`;
	}

	/** Le jeton, demandé au serveur web au moment d'ouvrir la liaison, et à chaque reprise. */
	async function requestToken(): Promise<TokenAnswer> {
		const response = await fetch(resolve('/direct/jeton'), {
			method: 'POST',
			headers: { accept: 'application/json' }
		});
		// Une panne du serveur n'est pas un refus : pendant une reprise, elle vaut un essai manqué.
		if (response.status >= 500) throw new Error('token');
		if (!response.ok) return { ok: false };
		const body: unknown = await response.json();
		const token = (body as { token?: unknown } | null)?.token;
		return typeof token === 'string' ? { ok: true, token } : { ok: false };
	}

	function release(): void {
		capture?.stop();
		capture = null;
		awake?.release();
		awake = null;
		peak = 0;
		silent = false;
		quietChunks = 0;
	}

	function onChunk(pcm: ArrayBuffer, level: number): void {
		peak = level;
		quietChunks = level < QUIET ? quietChunks + 1 : 0;
		silent = quietChunks >= QUIET_CHUNKS;
		session?.audio(pcm);
	}

	async function begin(): Promise<void> {
		if (busy) return;
		microphoneError = null;
		noLanguage = chosen.length === 0;
		if (noLanguage) return;
		preparing = true;
		try {
			// Le micro d'abord : la personne répond peut-être à la question du navigateur, et le
			// jeton, qui ne vit qu'une minute, ne se demande qu'après.
			capture = await startCapture(onChunk);
		} catch (error) {
			microphoneError = error instanceof MicrophoneFailure ? error.kind : 'unsupported';
			return;
		} finally {
			preparing = false;
		}
		awake = keepScreenOn();
		session ??= new BroadcastSession({
			requestToken,
			connect: () => openRelaySocket(data.relay),
			setTimer: (callback, ms) => window.setTimeout(callback, ms),
			clearTimer: (timer) => window.clearTimeout(timer as number),
			onChange: (next) => {
				broadcast = next;
				if (next.phase === 'ended') release();
			}
		});
		// Dans l'ordre du relais, quel que soit l'ordre des appuis.
		session.start(data.languages.filter((language) => chosen.includes(language)));
	}

	onDestroy(() => {
		session?.stop();
		release();
	});
</script>

<svelte:head><title>{text.title} | {data.organisation.name}</title></svelte:head>

<h1>{text.title}</h1>
<p class="details">{text.intro}</p>
<p class="details">{text.automatic}</p>
<noscript><p class="alerte">{text.noScript}</p></noscript>

<form
	onsubmit={(event) => {
		event.preventDefault();
		void begin();
	}}
>
	<fieldset disabled={busy}>
		<legend>{text.languages.legend}</legend>
		<p class="details">{text.languages.help}</p>
		{#each data.languages as language (language)}
			<label class="langue">
				<input type="checkbox" name="languages" value={language} bind:group={chosen} />
				{nameOf(language)}
			</label>
		{/each}
	</fieldset>
	{#if noLanguage}<p class="alerte" role="alert">{text.languages.none}</p>{/if}

	{#if onAir || broadcast.phase === 'starting'}
		<button type="button" class="arreter" onclick={() => session?.stop()}>{text.stop}</button>
	{:else}
		<button type="submit" class="commencer" disabled={!ready || preparing}>{text.start}</button>
	{/if}
</form>

<!-- Ce qui change d'état est annoncé ; la durée, qui change chaque seconde, ne l'est pas. -->
<div role="status">
	{#if preparing || broadcast.phase === 'starting'}
		<p>{text.phase.starting}</p>
	{:else if broadcast.phase === 'live'}
		<p class="en-direct"><span class="pastille" aria-hidden="true"></span>{text.phase.live}</p>
	{:else if broadcast.phase === 'resuming'}
		<p class="alerte">{text.phase.resuming}</p>
	{:else if outcome && !outcome.alert}
		<p>{outcome.text}</p>
	{/if}
</div>
{#if outcome?.alert}<p class="alerte" role="alert">{outcome.text}</p>{/if}

{#if onAir}
	<p class="details">{text.keepOpen}</p>

	<dl>
		<dt>{text.duration}</dt>
		<dd dir="ltr">{clock(broadcast.seconds)}</dd>
		{#if broadcast.maxSeconds !== null}
			<dt>{text.maxDuration}</dt>
			<dd dir="ltr">{clock(broadcast.maxSeconds)}</dd>
		{/if}
	</dl>

	<label for="niveau">{text.microphone.level}</label>
	<meter id="niveau" min="0" max="1" value={peak}></meter>
	{#if silent}<p class="alerte" role="alert">{text.microphone.silent}</p>{/if}

	<h2>{text.listeners.title}</h2>
	<dl>
		{#each broadcast.languages as language (language)}
			<dt>{nameOf(language)}</dt>
			<dd>{broadcast.listeners[language] ?? 0}</dd>
		{/each}
		<dt class="total">{text.listeners.total}</dt>
		<dd class="total">{total}</dd>
	</dl>
{/if}

<style>
	.details {
		color: #555;
		font-size: 0.95rem;
	}
	fieldset {
		border: 1px solid #c8ced4;
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem 0.75rem;
		margin: 1rem 0;
	}
	legend {
		font-weight: 600;
		padding: 0 0.25rem;
	}
	.langue {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
	}
	.langue input {
		width: 1.25rem;
		height: 1.25rem;
	}
	button {
		min-height: 56px;
		width: 100%;
		font: inherit;
		font-size: 1.15rem;
		font-weight: 600;
		border-radius: 0.5rem;
		cursor: pointer;
	}
	/* Le bouton prend la couleur de l'organisation, et le texte calculé pour elle (ADR 0031). */
	.commencer {
		border: 2px solid var(--accent);
		background: var(--accent);
		color: var(--accent-texte);
	}
	.commencer:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.arreter {
		border: 2px solid #b91c1c;
		background: #fff;
		color: #b91c1c;
	}
	.en-direct {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
		font-size: 1.15rem;
	}
	.pastille {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 50%;
		background: #b91c1c;
	}
	.alerte {
		border: 2px solid #b91c1c;
		border-radius: 0.5rem;
		background: #fef2f2;
		padding: 0.5rem 0.75rem;
	}
	dl {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.25rem 1rem;
		margin: 0.75rem 0;
	}
	dt,
	dd {
		margin: 0;
		padding: 0.35rem 0;
		border-bottom: 1px solid #e5e7eb;
	}
	dd {
		font-variant-numeric: tabular-nums;
		text-align: end;
	}
	.total {
		font-weight: 700;
		border-bottom: 0;
	}
	label[for='niveau'] {
		display: block;
		font-weight: 600;
		font-size: 0.9rem;
		margin-top: 0.75rem;
	}
	meter {
		width: 100%;
		height: 1.25rem;
	}
</style>
