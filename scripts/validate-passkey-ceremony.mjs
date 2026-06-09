#!/usr/bin/env node
/*
 * Reproducible WebAuthn ceremony validation for the /demo/passkey page (#650).
 *
 * The rehearsal stack was removed in #644, so #631's pre-merge gate ("manual
 * cross-browser register + authenticate") had no automatable substitute — only
 * a human clicking through Touch UI. This drives the FULL register ->
 * authenticate ceremony against a live deployment headlessly, using a Chrome
 * CDP virtual authenticator, so the protocol + server path can be validated in
 * CI-shaped reproducible steps. The only thing it cannot exercise is the OS
 * platform-authenticator UI prompt (Touch ID / Windows Hello) — that is browser
 * chrome, not the WebAuthn protocol, and remains the one genuinely human gate.
 *
 * Pairs with scripts/smoke-webauthn-demo.sh, which asserts the raw Function URL
 * returns 403 to direct callers (the other half of #650's acceptance).
 *
 * Usage:
 *   node scripts/validate-passkey-ceremony.mjs [origin]
 *   # default origin: https://millsymills.com
 *   CHROME_BIN=/path/to/chrome node scripts/validate-passkey-ceremony.mjs
 *
 * Requires: Google Chrome (or Chromium) and Node >= 22 (global WebSocket/fetch).
 * Exits 0 on a verified register + authenticate with a monotonic signature
 * counter; non-zero (with a surfaced reason) otherwise.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGIN = (process.argv[2] ?? 'https://millsymills.com').replace(/\/$/, '');
const PAGE_URL = `${ORIGIN}/demo/passkey/`;
const PORT = 9333;
const CHROME_BIN =
	process.env.CHROME_BIN ??
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CEREMONY_TIMEOUT_MS = 30_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function launchChrome(userDataDir) {
	const child = spawn(
		CHROME_BIN,
		[
			'--headless=new',
			`--remote-debugging-port=${PORT}`,
			`--user-data-dir=${userDataDir}`,
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-gpu',
		],
		{ stdio: 'ignore' },
	);
	child.on('error', (err) => {
		console.error(`FAIL: could not launch Chrome at ${CHROME_BIN}: ${err.message}`);
		process.exit(2);
	});
	return child;
}

async function browserWebSocketUrl() {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		try {
			const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
			const body = await res.json();
			if (body.webSocketDebuggerUrl) return body.webSocketDebuggerUrl;
		} catch {
			// DevTools endpoint not up yet — keep polling.
		}
		await sleep(250);
	}
	throw new Error('Chrome DevTools endpoint never came up on port ' + PORT);
}

class Cdp {
	#ws;
	#nextId = 1;
	#pending = new Map();

	constructor(ws) {
		this.#ws = ws;
		ws.addEventListener('message', (event) => {
			const msg = JSON.parse(event.data);
			const resolver = this.#pending.get(msg.id);
			if (!resolver) return;
			this.#pending.delete(msg.id);
			if (msg.error) resolver.reject(new Error(msg.error.message));
			else resolver.resolve(msg.result);
		});
	}

	static async connect(url) {
		const ws = new WebSocket(url);
		await new Promise((resolve, reject) => {
			ws.addEventListener('open', resolve, { once: true });
			ws.addEventListener('error', () => reject(new Error('CDP socket error')), {
				once: true,
			});
		});
		return new Cdp(ws);
	}

	send(method, params = {}, sessionId) {
		const id = this.#nextId++;
		const payload = { id, method, params };
		if (sessionId) payload.sessionId = sessionId;
		this.#ws.send(JSON.stringify(payload));
		return new Promise((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
		});
	}

	close() {
		this.#ws.close();
	}
}

async function evaluate(cdp, sessionId, expression) {
	const result = await cdp.send(
		'Runtime.evaluate',
		{ expression, returnByValue: true, awaitPromise: true },
		sessionId,
	);
	if (result.exceptionDetails) {
		throw new Error(result.exceptionDetails.exception?.description ?? 'page eval threw');
	}
	return result.result.value;
}

async function waitForPageReady(cdp, sessionId) {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		const ready = await evaluate(
			cdp,
			sessionId,
			`document.readyState === 'complete' && !!document.querySelector('[data-passkey-demo]')`,
		);
		if (ready) return;
		await sleep(250);
	}
	throw new Error(`passkey demo never mounted at ${PAGE_URL} (page not deployed?)`);
}

async function runStep(cdp, sessionId, clickExpression, statusKey) {
	await evaluate(cdp, sessionId, clickExpression);
	const deadline = Date.now() + CEREMONY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const state = await evaluate(
			cdp,
			sessionId,
			`document.querySelector('[data-status="${statusKey}"]')?.dataset.state ?? 'idle'`,
		);
		if (state === 'ok' || state === 'err') {
			const message = await evaluate(
				cdp,
				sessionId,
				`document.querySelector('[data-status="${statusKey}"]')?.textContent ?? ''`,
			);
			return { state, message };
		}
		await sleep(250);
	}
	return { state: 'timeout', message: `${statusKey} did not settle in ${CEREMONY_TIMEOUT_MS}ms` };
}

async function main() {
	const userDataDir = mkdtempSync(join(tmpdir(), 'passkey-validate-'));
	const chrome = launchChrome(userDataDir);
	let cdp;
	try {
		cdp = await Cdp.connect(await browserWebSocketUrl());

		const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
		const { sessionId } = await cdp.send('Target.attachToTarget', {
			targetId,
			flatten: true,
		});

		await cdp.send('Page.enable', {}, sessionId);
		await cdp.send('Runtime.enable', {}, sessionId);
		await cdp.send('WebAuthn.enable', {}, sessionId);
		// Internal transport + presence/UV auto-simulation => no OS prompt, so the
		// navigator.credentials.* calls resolve without human interaction.
		const { authenticatorId } = await cdp.send(
			'WebAuthn.addVirtualAuthenticator',
			{
				options: {
					protocol: 'ctap2',
					transport: 'internal',
					hasResidentKey: true,
					hasUserVerification: true,
					isUserVerified: true,
					automaticPresenceSimulation: true,
				},
			},
			sessionId,
		);

		await cdp.send('Page.navigate', { url: PAGE_URL }, sessionId);
		await waitForPageReady(cdp, sessionId);

		console.error(`driving register + authenticate against ${PAGE_URL}`);

		const register = await runStep(
			cdp,
			sessionId,
			`(() => {
				const i = document.querySelector('[data-passkey-name]');
				i.value = 'ceremony-validator';
				i.dispatchEvent(new Event('input', { bubbles: true }));
				document.querySelector('[data-action="register"]').click();
			})()`,
			'register',
		);
		if (register.state !== 'ok') {
			throw new Error(`registration ${register.state}: ${register.message}`);
		}
		console.error(`  register: ok — ${register.message}`);

		const authenticate = await runStep(
			cdp,
			sessionId,
			`document.querySelector('[data-action="authenticate"]').click()`,
			'authenticate',
		);
		if (authenticate.state !== 'ok') {
			throw new Error(`authentication ${authenticate.state}: ${authenticate.message}`);
		}
		console.error(`  authenticate: ok — ${authenticate.message}`);

		const { credentials } = await cdp.send(
			'WebAuthn.getCredentials',
			{ authenticatorId },
			sessionId,
		);
		const resident = credentials.find((c) => c.isResidentCredential);
		if (!resident) {
			throw new Error('no resident credential after registration');
		}
		if (typeof resident.signCount !== 'number' || resident.signCount < 1) {
			throw new Error(`signature counter did not advance (signCount=${resident.signCount})`);
		}
		console.error(`  signCount advanced to ${resident.signCount} (rpId ${resident.rpId})`);

		console.error('OK: register + authenticate verified end-to-end against the live backend.');
	} finally {
		cdp?.close();
		const exited = new Promise((resolve) => chrome.once('exit', resolve));
		chrome.kill();
		await Promise.race([exited, sleep(2000)]);
		// Best-effort: Chrome may still be releasing the profile dir, and a
		// cleanup ENOTEMPTY must never mask the ceremony result.
		try {
			rmSync(userDataDir, { recursive: true, force: true });
		} catch (err) {
			console.error(`note: temp dir cleanup skipped (${err.code ?? err.message})`);
		}
	}
}

main().catch((err) => {
	console.error(`FAIL: ${err.message}`);
	process.exit(1);
});
