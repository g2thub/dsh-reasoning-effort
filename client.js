/**
 * Browser half of `dsh-reasoning-effort`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The shipped Models page edits `id` / `name` / `contextWindow` / `maxTokens` /
 * `input` for each model and deliberately NOT `reasoningEfforts`. Its own
 * comment states the reason: effort is a per-MODEL capability, the models under
 * one provider disagree about it, so a provider-scoped control could only be
 * set to a value some of them reject. Nothing is missing from the host — the
 * field is simply YAML-only, which leaves the composer's Effort row unreachable
 * for a hand-declared route.
 *
 * This plugin fills exactly that seat, per model, through the extension slot the
 * Models section already publishes: `settings.models.provider-card`, keyed by
 * the owning settings namespace. It reads and writes the same settings
 * namespace the page uses, through the same `settings` Remote, so revisions,
 * redaction and the write path are the host's.
 *
 * CONSTRAINTS THIS FILE OBEYS (see the cordis-plugin-development skill)
 * - It is a hand-written lazy-CJS artifact: `window.__ModuleLoader__.load` with
 *   a `factory(require)`. There is no build step and no bundler in the npm
 *   distribution, so JSX/TS/ESM imports are impossible here.
 * - It `require`s ONLY `react`, which is one of the nine frozen seed words in
 *   the shell's platform module table. Requiring a Harness Client package (for
 *   example `@deepseek-ai/dsh-client-ui-primitives`) is explicitly discouraged:
 *   the plugin would have no type check and a throwing component blanks the slot
 *   entry. Controls and styles are therefore written here, against `--dsw-alias-*`
 *   theme tokens only.
 *
 * @module dsh-reasoning-effort/client
 */
window.__ModuleLoader__.load({
	id: 'dsh-reasoning-effort',
	factory(require) {
		const React = require('react');
		const h = React.createElement;

		/** Locale namespace for this plugin's own copy. */
		const LOCALE_NS = 'dsh-reasoning-effort';
		/** Every level the adapter accepts as a reasoningEfforts key, in picker order. */
		const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
		/** `off` is the only level allowed to carry no wire value. */
		const EMPTY_WIRE_LEVEL = 'off';

		const DICTS = {
			en: {
				title: 'Reasoning effort',
				summaryNone: 'no levels declared — these models get no Effort row in the picker',
				summarySome: 'declared for {n} of {m} models',
				expand: 'Edit',
				collapse: 'Close',
				inherit: 'Inherit',
				nonReasoning: 'Not a reasoning model',
				inheritHint: 'Clear this model\u2019s levels so it inherits the catalog capability.',
				nonReasoningHint: 'Declare this model as non-reasoning (reasoningEfforts: false).',
				wireLabel: 'wire value',
				offHint: '\u201coff\u201d is sent by omitting the reasoning field entirely.',
				listedNote: 'These models are listed on the route, so each edit writes that model\u2019s own reasoningEfforts.',
				catalogNote: 'This route inherits a catalog, so each edit writes a modelOverride for that model id.',
				save: 'Save',
				reload: 'Reload',
				statusSaved: 'Saved. The composer\u2019s Effort row updates on its next catalog read.',
				statusNoChange: 'Nothing changed.',
				statusReadOnly: 'This profile does not accept configuration writes.',
				statusHidden: 'The settings namespace this editor targets is not registered in this profile.',
				statusEmpty: 'No models are visible on this route yet. Add models on the provider editor first.',
				statusError: 'Could not read the settings document: ',
				errorOnlyOff: '{model}: declaring only \u201coff\u201d is refused — declare a thinking level, or mark the model non-reasoning.',
				errorNeedsWire: '{model}: level \u201c{level}\u201d needs the wire value dispatch should send.',
				conflict: 'Someone else changed this namespace. Reload and re-apply.',
			},
			zh: {
				title: '思考强度',
				summaryNone: '尚未声明档位 —— 这些模型在模型选择器里没有 Effort 行',
				summarySome: '已为 {m} 个模型中的 {n} 个声明',
				expand: '编辑',
				collapse: '收起',
				inherit: '继承',
				nonReasoning: '非推理模型',
				inheritHint: '清除该模型的档位，使其继承目录能力。',
				nonReasoningHint: '把该模型声明为非推理模型（reasoningEfforts: false）。',
				wireLabel: '线上取值',
				offHint: '“off” 通过完全不发 reasoning 字段表达。',
				listedNote: '这些模型已在路由上列出，因此编辑写入各自的 reasoningEfforts。',
				catalogNote: '该路由继承内置目录，因此编辑会写入对应模型 id 的 modelOverride。',
				save: '保存',
				reload: '重新读取',
				statusSaved: '已保存。模型选择器的 Effort 行会在下次读取目录时更新。',
				statusNoChange: '没有改动。',
				statusReadOnly: '当前 profile 不接受配置写入。',
				statusHidden: '本编辑器指向的 settings 命名空间未在本 profile 注册。',
				statusEmpty: '该路由还没有可见模型，请先在提供商编辑器里添加模型。',
				statusError: '读取配置文档失败：',
				errorOnlyOff: '{model}：只声明 “off” 会被拒绝 —— 请声明一个思考档位，或标记为非推理模型。',
				errorNeedsWire: '{model}：档位 “{level}” 需要填写实际发送的线上取值。',
				conflict: '该命名空间已被改动，请重新读取后再保存。',
			},
		};

		/**
		 * Render one dictionary entry, substituting `{name}` placeholders.
		 * Deliberately local: the plugin must not depend on a translate-signature
		 * detail it cannot type-check.
		 * @param template - dictionary text.
		 * @param params - replacement values.
		 * @returns the rendered text.
		 */
		function format(template, params) {
			if (params === undefined) return template;
			return String(template).replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
		}

		/**
		 * Whether a value is a plain non-array object.
		 * @param value - candidate.
		 * @returns whether it is a plain object.
		 */
		function isObject(value) {
			return value !== null && typeof value === 'object' && !Array.isArray(value);
		}

		/**
		 * Read a nested value by a path, tolerating any missing link.
		 * @param root - container.
		 * @param path - keys.
		 * @returns the value, or undefined.
		 */
		function get(root, path) {
			let cursor = root;
			for (const key of path) {
				if (!isObject(cursor)) return undefined;
				cursor = cursor[key];
			}
			return cursor;
		}

		/**
		 * Unwrap one Typert `RemoteResult`.
		 *
		 * Every remote method answers `{ok: true, value} | {ok: false, error}`, so
		 * the payload always sits one level below what the Host method declares it
		 * returns. Reading the declared shape directly yields `undefined` for every
		 * field and looks exactly like "no data" rather than like a bug.
		 * @param response - the value a remote call resolved with.
		 * @returns `{ value }` on success, or `{ error }` with the Host diagnostic.
		 */
		function unwrap(response) {
			if (isObject(response) && response.ok === true) return { value: response.value };
			const failure = isObject(response) && isObject(response.error) ? response.error : {};
			const message = typeof failure.message === 'string' && failure.message.length > 0 ? failure.message : 'remote call failed';
			return { error: message };
		}

		/**
		 * Normalize a stored `reasoningEfforts` value into the editor's model.
		 *
		 * Three states are distinct and must stay distinct:
		 *   `null`  — the field is absent, so the model inherits the catalog.
		 *   `false` — explicitly declared non-reasoning.
		 *   object  — the declared level map, each level mapping to its wire
		 *             string or to `null` (meaning "send no reasoning field").
		 * @param raw - the stored value.
		 * @returns the normalized state.
		 */
		function normalizeEfforts(raw) {
			if (raw === undefined) return null;
			if (raw === false) return false;
			if (!isObject(raw)) return null;
			const out = {};
			for (const level of LEVELS) {
				if (!Object.prototype.hasOwnProperty.call(raw, level)) continue;
				const wire = raw[level];
				out[level] = wire === null || wire === undefined ? null : String(wire);
			}
			return out;
		}

		/**
		 * Build the editable rows for one route.
		 *
		 * Two shapes are addressable, mirroring what the adapter accepts:
		 * a route that LISTS its models (`models[]`) edits each entry in place;
		 * a route that inherits a catalog edits `modelOverrides[<id>]`, because a
		 * `modelOverrides` value cannot carry an id and a `models` array would
		 * replace the whole inherited catalog.
		 * @param userProfile - the user layer's profile for this route.
		 * @param liveProfile - the resolved profile for this route.
		 * @returns the rows and which addressing mode they use.
		 */
		function buildRows(userProfile, liveProfile) {
			const listed = Array.isArray(userProfile.models) ? userProfile.models : null;
			if (listed !== null && listed.length > 0) {
				return {
					mode: 'listed',
					rows: listed.map((model, index) => ({
						key: `models:${String(index)}`,
						locator: ['models', String(index)],
						id: isObject(model) && typeof model.id === 'string' ? model.id : `#${String(index + 1)}`,
						efforts: normalizeEfforts(isObject(model) ? model.reasoningEfforts : undefined),
					})),
				};
			}

			const overrides = isObject(userProfile.modelOverrides) ? userProfile.modelOverrides : {};
			const liveOverrides = isObject(liveProfile.modelOverrides) ? liveProfile.modelOverrides : {};
			const liveModels = Array.isArray(liveProfile.models) ? liveProfile.models : [];
			const ids = [];
			const seen = new Set();
			for (const source of [overrides, liveOverrides]) {
				for (const id of Object.keys(source)) if (!seen.has(id)) (seen.add(id), ids.push(id));
			}
			for (const model of liveModels) {
				if (isObject(model) && typeof model.id === 'string' && !seen.has(model.id)) (seen.add(model.id), ids.push(model.id));
			}
			return {
				mode: 'catalog',
				rows: ids.map((id) => {
					const stored = isObject(overrides[id]) ? overrides[id] : isObject(liveOverrides[id]) ? liveOverrides[id] : {};
					return { key: `override:${id}`, locator: ['modelOverrides', id], id, efforts: normalizeEfforts(stored.reasoningEfforts) };
				}),
			};
		}

		/**
		 * Diff the draft against the loaded state and produce the write plan.
		 * @param rows - the editable rows.
		 * @param draft - draft state by row key.
		 * @param basePath - path of the route profile inside the user section.
		 * @param t - translate function.
		 * @returns the ops to send and any validation errors.
		 */
		function planOps(rows, draft, basePath, t) {
			const ops = [];
			const errors = [];
			for (const row of rows) {
				const before = row.efforts;
				const after = Object.prototype.hasOwnProperty.call(draft, row.key) ? draft[row.key] : before;
				if (JSON.stringify(before) === JSON.stringify(after)) continue;
				const path = basePath.concat(row.locator, ['reasoningEfforts']);

				if (after === null) {
					ops.push({ op: 'unset', path });
					continue;
				}
				if (after === false) {
					ops.push({ op: 'set', path, value: false });
					continue;
				}
				const levels = Object.keys(after);
				// The adapter refuses an empty map and a map offering nothing but `off`.
				if (levels.length === 0 || !levels.some((level) => level !== EMPTY_WIRE_LEVEL)) {
					errors.push(format(t('errorOnlyOff'), { model: row.id }));
					continue;
				}
				let invalid = false;
				for (const level of levels) {
					const wire = after[level];
					if (wire === null) {
						if (level !== EMPTY_WIRE_LEVEL) {
							errors.push(format(t('errorNeedsWire'), { model: row.id, level }));
							invalid = true;
						}
						continue;
					}
					if (typeof wire !== 'string' || wire.length === 0) {
						errors.push(format(t('errorNeedsWire'), { model: row.id, level }));
						invalid = true;
					}
				}
				if (!invalid) ops.push({ op: 'set', path, value: after });
			}
			return { ops, errors };
		}

		// ------------------------------------------------------------------
		// Styles: theme tokens only, each with a literal fallback so a renamed
		// token degrades appearance instead of breaking rendering.
		// ------------------------------------------------------------------
		const TOKEN = {
			text: 'var(--dsw-alias-label-primary, #1a1a1a)',
			textDim: 'var(--dsw-alias-label-tertiary, #8a8a8a)',
			caption: 'var(--dsw-alias-label-caption, #999999)',
			layer: 'var(--dsw-alias-bg-layer-2, #f7f7f8)',
			base: 'var(--dsw-alias-bg-base, #ffffff)',
			border: 'var(--dsw-alias-border-l2, #e0e0e2)',
			borderSoft: 'var(--dsw-alias-border-l1, #ececee)',
			brand: 'var(--dsw-alias-brand-primary, #4d6bfe)',
			hover: 'var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,0.04))',
			error: 'var(--dsw-alias-state-error-primary, #d33)',
		};
		const S = {
			wrap: { marginTop: 8, borderTop: `1px solid ${TOKEN.borderSoft}`, paddingTop: 8 },
			head: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
			title: { fontSize: 12, fontWeight: 600, color: TOKEN.text },
			summary: { fontSize: 11, color: TOKEN.textDim, flex: '1 1 auto', minWidth: 0 },
			link: {
				fontSize: 11, color: TOKEN.brand, background: 'none', border: 'none',
				padding: '2px 4px', cursor: 'pointer', borderRadius: 4, font: 'inherit',
			},
			row: { padding: '6px 0', borderTop: `1px solid ${TOKEN.borderSoft}` },
			rowHead: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
			modelId: {
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11,
				color: TOKEN.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
				flex: '1 1 auto', minWidth: 0,
			},
			chips: { display: 'flex', flexWrap: 'wrap', gap: 4 },
			inputs: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
			field: { display: 'flex', alignItems: 'center', gap: 4 },
			fieldLabel: { fontSize: 10, color: TOKEN.caption },
			input: {
				font: 'inherit', fontSize: 11, padding: '2px 5px', width: 74,
				color: TOKEN.text, background: TOKEN.base,
				border: `1px solid ${TOKEN.border}`, borderRadius: 4,
			},
			footer: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 },
			primary: {
				font: 'inherit', fontSize: 11, fontWeight: 600, padding: '3px 10px',
				color: '#fff', background: TOKEN.brand, border: 'none', borderRadius: 5, cursor: 'pointer',
			},
			note: { fontSize: 10, color: TOKEN.caption, marginTop: 4, lineHeight: 1.5 },
		};
		/**
		 * One level chip's style for its on/off state.
		 * @param on - whether the level is declared.
		 * @returns the style object.
		 */
		function chipStyle(on) {
			return {
				font: 'inherit', fontSize: 10.5, padding: '2px 7px', borderRadius: 999,
				cursor: 'pointer',
				color: on ? '#fff' : TOKEN.textDim,
				background: on ? TOKEN.brand : 'transparent',
				border: `1px solid ${on ? TOKEN.brand : TOKEN.border}`,
			};
		}

		/**
		 * Build the card component over one context.
		 * @param ctx - the client plugin context.
		 * @param t - translate function for this plugin's namespace.
		 * @param settingsNs - settings namespace whose cards this editor attaches to.
		 * @returns the React component registered into the slot.
		 */
		function makeCard(ctx, t, settingsNs) {
			return function ReasoningEffortCard(props) {
				const provider = isObject(props) && isObject(props.provider) ? props.provider : {};
				const route = typeof provider.provider === 'string' ? provider.provider : '';
				const basePath = Array.isArray(provider.settingsPath) && provider.settingsPath.length > 0
					? provider.settingsPath.slice()
					: ['providers', route];
				const pathKey = JSON.stringify(basePath);

				const [phase, setPhase] = React.useState('loading');
				const [rows, setRows] = React.useState([]);
				const [draft, setDraft] = React.useState({});
				const [mode, setMode] = React.useState('listed');
				const [revision, setRevision] = React.useState(undefined);
				const [available, setAvailable] = React.useState([]);
				const [message, setMessage] = React.useState(null);
				const [busy, setBusy] = React.useState(false);
				const [expanded, setExpanded] = React.useState(false);

				/**
				 * Read the namespace and rebuild the editor state.
				 * @returns a cancel function for the effect that started it.
				 */
				const load = React.useCallback(() => {
					let cancelled = false;
					setPhase('loading');
					setMessage(null);
					Promise.resolve()
						.then(() => ctx.remote.settings.describe())
						.then((response) => {
							if (cancelled) return;
							const unwrapped = unwrap(response);
							if (unwrapped.error !== undefined) {
								setPhase('error');
								setMessage({ kind: 'error', text: t('statusError') + unwrapped.error });
								return;
							}
							const described = isObject(unwrapped.value) ? unwrapped.value : {};
							const list = Array.isArray(described.namespaces) ? described.namespaces : [];
							const view = list.filter((entry) => isObject(entry) && entry.ns === settingsNs)[0];
							if (view === undefined) {
								// Name what WAS registered: the namespace is the Loader entry id,
								// so a mismatch is a configuration fact, not a mystery.
								const available = list
									.map((entry) => (isObject(entry) && typeof entry.ns === 'string' ? entry.ns : ''))
									.filter((ns) => ns.length > 0);
								setAvailable(available);
								setPhase('hidden');
								return;
							}
							if (described.writable === false) {
								setPhase('readonly');
								return;
							}
							const user = isObject(view.user) ? view.user : {};
							const live = isObject(view.value) ? view.value : {};
							const built = buildRows(
								isObject(get(user, basePath)) ? get(user, basePath) : {},
								isObject(get(live, basePath)) ? get(live, basePath) : {},
							);
							setRevision(view.revision);
							setRows(built.rows);
							setMode(built.mode);
							const nextDraft = {};
							for (const row of built.rows) nextDraft[row.key] = row.efforts;
							setDraft(nextDraft);
							setPhase(built.rows.length === 0 ? 'empty' : 'ready');
						})
						.catch((error) => {
							if (cancelled) return;
							setPhase('error');
							setMessage({ kind: 'error', text: t('statusError') + String((error && error.message) || error) });
						});
					return () => {
						cancelled = true;
					};
				}, [settingsNs, pathKey]);

				React.useEffect(load, [load]);


				/**
				 * Add or remove one level on one row.
				 * @param rowKey - row identity.
				 * @param level - level name.
				 */
				const toggle = (rowKey, level) => {
					setDraft((current) => {
						const row = rows.filter((candidate) => candidate.key === rowKey)[0];
						const before = Object.prototype.hasOwnProperty.call(current, rowKey) ? current[rowKey] : row ? row.efforts : null;
						const base = before === null || before === false || !isObject(before) ? {} : Object.assign({}, before);
						if (Object.prototype.hasOwnProperty.call(base, level)) delete base[level];
						else base[level] = level === EMPTY_WIRE_LEVEL ? null : level;
						return Object.assign({}, current, { [rowKey]: base });
					});
				};

				/**
				 * Set one level's wire spelling.
				 * @param rowKey - row identity.
				 * @param level - level name.
				 * @param wire - the text the input holds.
				 */
				const setWire = (rowKey, level, wire) => {
					setDraft((current) => {
						const before = current[rowKey];
						if (!isObject(before)) return current;
						const base = Object.assign({}, before);
						base[level] = wire.length === 0 ? null : wire;
						return Object.assign({}, current, { [rowKey]: base });
					});
				};

				/**
				 * Replace one row's whole state (inherit / non-reasoning).
				 * @param rowKey - row identity.
				 * @param value - `null` to inherit, `false` for non-reasoning.
				 */
				const setRowState = (rowKey, value) => {
					setDraft((current) => Object.assign({}, current, { [rowKey]: value }));
				};

				const plan = planOps(rows, draft, basePath, t);
				const dirty = plan.ops.length > 0;

				/** Write the plan through the settings Remote. */
				const save = () => {
					if (plan.errors.length > 0) {
						setMessage({ kind: 'error', text: plan.errors.join(' ') });
						return;
					}
					if (plan.ops.length === 0) {
						setMessage({ kind: 'info', text: t('statusNoChange') });
						return;
					}
					setBusy(true);
					setMessage(null);
					Promise.resolve()
						.then(() => ctx.remote.settings.mutate(settingsNs, plan.ops, revision))
						.then((response) => {
							setBusy(false);
							const unwrapped = unwrap(response);
							if (unwrapped.error !== undefined) {
								setMessage({ kind: 'error', text: /conflict/i.test(unwrapped.error) ? t('conflict') : unwrapped.error });
								return;
							}
							setMessage({ kind: 'info', text: t('statusSaved') });
							load();
						})
						.catch((error) => {
							setBusy(false);
							const text = String((error && error.message) || error);
							setMessage({ kind: 'error', text: /conflict/i.test(text) ? t('conflict') : text });
						});
				};

				// Stay quiet while reading, and stay quiet when the route simply has no
				// model to configure: silence there is the correct answer, not a
				// swallowed failure.
				if (phase === 'loading' || phase === 'empty') return null;
				// A misconfigured target, a read-only profile, or a failed read IS worth
				// a line: each one means the editor cannot do its job, and silence would
				// make that indistinguishable from "this route has nothing to edit".
				if (phase !== 'ready') {
					const problem = phase === 'hidden'
						? `${t('statusHidden')} (settingsNs=${settingsNs}; available=[${available.join(', ')}])`
						: phase === 'readonly'
							? t('statusReadOnly')
							: message !== null
								? message.text
								: '';
					return h('div', { style: S.wrap },
						h('div', { style: S.head },
							h('span', { style: S.title }, t('title')),
							h('span', { style: Object.assign({}, S.summary, phase === 'error' ? { color: TOKEN.error } : {}) }, problem),
						),
					);
				}

				const declaredCount = rows.filter((row) => {
					const value = Object.prototype.hasOwnProperty.call(draft, row.key) ? draft[row.key] : row.efforts;
					return isObject(value) && Object.keys(value).length > 0;
				}).length;
				const summary = declaredCount === 0
					? t('summaryNone')
					: format(t('summarySome'), { n: declaredCount, m: rows.length });

				const children = [];
				children.push(
					h('div', { key: 'head', style: S.head },
						h('span', { style: S.title }, t('title')),
						h('span', { style: S.summary }, summary),
						h('button', {
							type: 'button', style: S.link,
							onClick: () => setExpanded((value) => !value),
						}, expanded ? t('collapse') : t('expand')),
					),
				);

				if (expanded) {
					for (const row of rows) {
						const value = Object.prototype.hasOwnProperty.call(draft, row.key) ? draft[row.key] : row.efforts;
						const levels = isObject(value) ? value : {};
						const chips = LEVELS.map((level) => h('button', {
							key: level, type: 'button',
							'aria-pressed': Object.prototype.hasOwnProperty.call(levels, level),
							style: chipStyle(Object.prototype.hasOwnProperty.call(levels, level)),
							onClick: () => toggle(row.key, level),
						}, level));
						const fields = LEVELS
							.filter((level) => level !== EMPTY_WIRE_LEVEL && Object.prototype.hasOwnProperty.call(levels, level))
							.map((level) => h('label', { key: level, style: S.field },
								h('span', { style: S.fieldLabel }, level),
								h('input', {
									type: 'text', style: S.input, value: levels[level] === null ? '' : String(levels[level]),
									placeholder: t('wireLabel'), disabled: busy,
									onChange: (event) => setWire(row.key, level, event.target.value),
								}),
							));
						children.push(h('div', { key: row.key, style: S.row },
							h('div', { style: S.rowHead },
								h('code', { style: S.modelId, title: row.id }, row.id),
								h('button', { type: 'button', style: S.link, disabled: busy, title: t('inheritHint'), onClick: () => setRowState(row.key, null) }, t('inherit')),
								h('button', { type: 'button', style: S.link, disabled: busy, title: t('nonReasoningHint'), onClick: () => setRowState(row.key, false) }, t('nonReasoning')),
							),
							h('div', { style: S.chips }, chips),
							fields.length > 0 ? h('div', { style: S.inputs }, fields) : null,
						));
					}
					children.push(h('div', { key: 'note', style: S.note },
						mode === 'catalog' ? t('catalogNote') : t('listedNote'),
						' ',
						t('offHint'),
					));
					children.push(h('div', { key: 'footer', style: S.footer },
						h('button', {
							type: 'button', style: S.primary, disabled: busy || !dirty,
							onClick: save,
						}, t('save')),
						h('button', { type: 'button', style: S.link, disabled: busy, onClick: load }, t('reload')),
					));
				}

				if (message !== null) {
					children.push(h('div', {
						key: 'message',
						style: Object.assign({}, S.note, message.kind === 'error' ? { color: TOKEN.error } : {}),
					}, message.text));
				}

				return h('div', { style: S.wrap }, children);
			};
		}

		/** Services this plugin needs: slot registration plus the settings transport. */
		const inject = ['slots', 'locale', 'remote', 'remote.settings'];

		/**
		 * Register the per-model reasoning-effort editor into the Models page.
		 * @param ctx - client plugin context.
		 * @param config - this bundle's config, whose `settingsNs` names the family.
		 */
		function apply(ctx, config) {
			const settingsNs = isObject(config) && typeof config.settingsNs === 'string' && config.settingsNs.length > 0
				? config.settingsNs
				: 'llm-pi-ai';
			ctx.effect(() => ctx.locale.register(LOCALE_NS, 'en', DICTS.en), 'dsh-reasoning-effort: copy (en)');
			ctx.effect(() => ctx.locale.register(LOCALE_NS, 'zh', DICTS.zh), 'dsh-reasoning-effort: copy (zh)');
			const t = ctx.locale.bind(LOCALE_NS);
			const Card = makeCard(ctx, t, settingsNs);
			// Keyed by the owning settings namespace, so this single registration
			// receives every card of the family: shipped routes, GUI-added routes and
			// hand-declared ones alike.
			ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
				name: 'settings.models.provider-card',
				key: settingsNs,
			}, Card));
		}

		return { inject, apply };
	},
});
