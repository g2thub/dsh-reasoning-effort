/**
 * Host half of `dsh-reasoning-effort`.
 *
 * The feature is entirely browser-side (see `./client.js`); this half exists
 * because a bundle's Loader entry must resolve to a real Cordis plugin, and
 * because it is where the plugin's `Config` is declared. It renders nothing and
 * registers no Host behaviour.
 *
 * @module dsh-reasoning-effort
 */
import z from '@deepseek-ai/schemastery';

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-reasoning-effort';

/**
 * Plugin config.
 *
 * `settingsNs` is the settings namespace the editor attaches to, which is the
 * Loader entry id of the adapter that owns the routes. `dsh-base` mounts
 * `@deepseek-ai/dsh-llm-pi-ai` as `llm-pi-ai`, so that is the default; change
 * it only if this profile renames that row.
 */
export const Config = z.object({
	settingsNs: z.string().default('llm-pi-ai'),
});

/**
 * Host body: intentionally empty — the client module owns the rendering.
 * @param _ctx - plugin context.
 * @param _config - resolved plugin config.
 */
export function apply(_ctx, _config) {}
