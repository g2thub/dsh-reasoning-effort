#!/usr/bin/env node
/**
 * Pre-flight check for this plugin, against the rules the Host actually
 * enforces when it turns a `dsh.client` declaration into a served bundle.
 *
 * Every check here corresponds to a real failure mode in
 * `@deepseek-ai/dsh-client-modules`:
 *   - a missing or wrongly-shaped `exports["./client"]` throws
 *     "declares dsh.client but exports no './client' bundle";
 *   - a missing `client.js` throws MissingClientBundleError ("run `pnpm run
 *     build` before launch") — which is confusing here, because this bundle is
 *     hand-written and needs no build;
 *   - a registration whose `id` is not the package name never binds, because the
 *     Host keys the module table by package name.
 *
 * It also enforces the distribution's own plugin guidance: the browser bundle
 * may `require` only a frozen platform seed word. Requiring a Harness Client
 * package is what the skill's `references/practices.md` explicitly discourages,
 * and a plain-JS plugin gets no type check to catch it.
 *
 * Usage:
 *   node verify.mjs                     # this directory
 *   node verify.mjs --dsh-root /path/to/dsh
 *
 * @module dsh-reasoning-effort/verify
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The frozen seed table the shell installs before any plugin bundle loads.
 * A browser bundle may require exactly these and nothing else.
 * @see dsh-web-frontend `dist/assets/index-*.js` (`function rM()`).
 */
const PLATFORM_SEED = [
	'react',
	'react/jsx-runtime',
	'react-dom',
	'react-dom/client',
	'@deepseek-ai/cordis',
	'@deepseek-ai/dsh-client-store',
	'@deepseek-ai/dsh-client-ui-slots',
	'@deepseek-ai/dsh-client-ui-primitives',
	'@deepseek-ai/dsh-client-ui-dockkit',
];

const here = dirname(fileURLToPath(import.meta.url));
const problems = [];
const notes = [];
let pass = 0;

/**
 * Record one check outcome.
 * @param ok - whether the check passed.
 * @param label - what was checked.
 * @param detail - extra context on failure.
 */
function check(ok, label, detail) {
	if (ok) {
		pass += 1;
		console.log(`  ok    ${label}`);
	} else {
		problems.push(`${label}${detail === undefined ? '' : ` — ${detail}`}`);
		console.log(`  FAIL  ${label}${detail === undefined ? '' : ` — ${detail}`}`);
	}
}

/** Program entry. */
function main() {
	const argv = process.argv.slice(2);
	let root = here;
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === '--dsh-root') root = resolve(argv[++i]);
		else if (argv[i] === '--help' || argv[i] === '-h') {
			console.log('usage: node verify.mjs [--dsh-root DIR]');
			return 0;
		}
	}

	const manifestPath = join(here, 'package.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	console.log(`package  ${manifest.name}`);
	console.log(`dir      ${here}`);
	console.log(`dsh root ${root}`);
	console.log('');

	// ---- bundle declaration -------------------------------------------------
	console.log('bundle');
	check(manifest.dsh?.bundle?.patch !== undefined, 'declares dsh.bundle.patch');
	const patches = [].concat(manifest.dsh?.bundle?.patch ?? []);
	for (const patch of patches) check(existsSync(join(here, patch)), `patch file exists: ${patch}`);

	// ---- host half ----------------------------------------------------------
	console.log('\nhost half');
	const mainExport = typeof manifest.exports?.['.'] === 'string'
		? manifest.exports['.']
		: manifest.exports?.['.']?.default;
	check(typeof mainExport === 'string', 'exports[".\"] resolves to a file');
	if (typeof mainExport === 'string') {
		const hostPath = join(here, mainExport);
		check(existsSync(hostPath), `host entry exists: ${mainExport}`);
		if (existsSync(hostPath)) {
			const source = readFileSync(hostPath, 'utf8');
			check(/\bexport\s+(function|const)\s+apply\b/.test(source), 'host half exports `apply` (a Loader entry must resolve to a Cordis plugin)');
			check(/\bexport\s+const\s+name\b/.test(source), 'host half exports a plugin `name`');
			const bare = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1]).filter((spec) => !spec.startsWith('.'));
			check(bare.every((spec) => spec.startsWith('@deepseek-ai/')), 'host imports only declared dependencies', bare.join(', '));
			notes.push(`host half imports: ${bare.join(', ') || '(none)'}`);
		}
	}

	// ---- client half --------------------------------------------------------
	console.log('\nclient half');
	const clientDecl = manifest.dsh?.client;
	check(clientDecl !== undefined, 'declares dsh.client');
	check(clientDecl?.platform === 'web', 'dsh.client.platform is "web"', String(clientDecl?.platform));
	const clientRel = typeof manifest.exports?.['./client'] === 'string'
		? manifest.exports['./client']
		: manifest.exports?.['./client']?.default;
	check(typeof clientRel === 'string', 'exports["./client"] resolves to a file', JSON.stringify(manifest.exports?.['./client']));

	if (typeof clientRel === 'string') {
		const clientPath = join(here, clientRel);
		check(existsSync(clientPath), `client bundle exists: ${clientRel} (a missing one throws MissingClientBundleError)`);
		if (existsSync(clientPath)) {
			const source = readFileSync(clientPath, 'utf8');
			// The module table is keyed by PACKAGE NAME; the registration id must match.
			const idMatch = source.match(/__ModuleLoader__\s*\.\s*load\s*\(\s*\{\s*id\s*:\s*['"]([^'"]+)['"]/);
			check(idMatch !== null, 'registers through window.__ModuleLoader__.load with an id');
			if (idMatch !== null) {
				check(idMatch[1] === manifest.name, 'registration id equals the package name', `id="${idMatch[1]}" package="${manifest.name}"`);
			}
			check(!/^\s*(import|export)\s/m.test(source), 'is a classic script (no ESM import/export — the loader uses a non-module <script>)');

			// Policy: only seed words may be required.
			const required = [...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]);
			const foreign = [...new Set(required)].filter((spec) => !PLATFORM_SEED.includes(spec));
			check(
				foreign.length === 0,
				'requires only platform seed words',
				foreign.length === 0 ? undefined : `${foreign.join(', ')} — declare them in dsh.client.external or drop them`,
			);
			notes.push(`client requires: ${[...new Set(required)].join(', ') || '(none)'}`);

			// A keyed seat must name the key, or the entry never renders.
			if (source.includes('settings.models.provider-card')) {
				check(/key\s*:\s*settingsNs|\bkey\s*:/.test(source), 'sets a slot `key` for the keyed provider-card seat');
			}
			check(!/document\.body|appendChild\(\s*document/.test(source), 'does not touch document.body');
		}
	}
	// `external` is only for non-baseline module requests.
	const declaredExternal = clientDecl?.external ?? [];
	for (const request of declaredExternal) {
		notes.push(`declared external: ${request}`);
	}

	// ---- patch wiring -------------------------------------------------------
	console.log('\npatch wiring');
	for (const patch of patches) {
		const path = join(here, patch);
		if (!existsSync(path)) continue;
		const text = readFileSync(path, 'utf8');
		check(text.includes(manifest.name), `${patch} names ${manifest.name}`);
	}
	// The entry id becomes the settings namespace for the Host half, and the
	// client reads it back from config; make sure the two agree.
	const patchText = patches.map((patch) => (existsSync(join(here, patch)) ? readFileSync(join(here, patch), 'utf8') : '')).join('\n');
	const nsMatch = patchText.match(/settingsNs\s*:\s*([^\s#]+)/);
	if (nsMatch !== null) {
		notes.push(`configured settingsNs: ${nsMatch[1]}`);
		const clientSource = typeof clientRel === 'string' && existsSync(join(here, clientRel)) ? readFileSync(join(here, clientRel), 'utf8') : '';
		check(clientSource.includes(nsMatch[1]) || /config\s*&&\s*typeof config\.settingsNs/.test(clientSource), `client honours settingsNs (or reads it from config)`, nsMatch[1]);
	}

	// ---- optional: does the adapter this attaches to exist? ----------------
	if (existsSync(join(root, 'node_modules'))) {
		const require = createRequire(join(root, 'package.json'));
		let adapterPath;
		try {
			adapterPath = require.resolve('@deepseek-ai/dsh-llm-pi-ai');
			notes.push(`adapter resolves: ${adapterPath}`);
			check(true, 'the pi-ai adapter this attaches to is installed');
		} catch {
			check(false, 'the pi-ai adapter this attaches to is installed');
		}
	} else {
		notes.push(`no node_modules under ${root}; skipped the adapter resolution check`);
	}

	console.log('');
	for (const note of notes) console.log(`note: ${note}`);
	if (problems.length > 0) {
		console.error('');
		for (const problem of problems) console.error(`error: ${problem}`);
		console.error(`\n${problems.length} problem(s), ${pass} check(s) passed`);
		return 1;
	}
	console.log(`\nall ${pass} checks passed`);
	return 0;
}

process.exit(main());
