# dsh-reasoning-effort

A per-model **reasoning-effort editor** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI's Models settings page — the one model field that page deliberately leaves to YAML.

English | [中文](README.zh.md)

---

## The problem

Add a custom model endpoint in dsh (`Settings → Models → Add model provider → Custom model API`), fetch its model list, and everything works — except the composer's `/model` picker has **no Effort row** for those models, while the built-in DeepSeek models do.

That is not an oversight. From `dsh-client-ui-settings-models`:

> Reasoning effort is deliberately absent: it is a per-MODEL capability, and the models under one provider disagree about it, so a **provider-scoped control** can only be set to a value some of them reject.

The key phrase is *provider-scoped*. Put the control at the provider level and it can only hold one value, which some model under that provider is guaranteed to reject — one model may support `off`, its sibling may not. The Host therefore keeps `reasoningEfforts` as a YAML-only field, and `dsh-llm-pi-ai` refuses (before any network I/O) a request whose effort the exact model does not advertise.

**This plugin puts the editor at the model level**, where that objection does not apply. Each model gets its own set of declared levels.

It does not modify or replace the Models page. It registers into the extension seat that page already publishes for out-of-tree plugins.

## What it looks like

At the bottom of every pi-ai provider card:

```
Reasoning effort   no levels declared — these models get no Effort row   [Edit]
```

Expanded, per model:

```
my-reasoner                                            [Inherit] [Not a reasoning model]
[off] [minimal] [low] [medium] [high] [xhigh] [max]
  low [low]   medium [medium]   high [ultra]
```

Each lit chip is a declared level. A lit level other than `off` gets a **wire value** box — change it to send something else than the level name (`high` in the picker, `ultra` on the wire) for a gateway with its own vocabulary.

## Requirements

- dsh `0.2.0-rc.2` (the Client plugin format and the `settings.models.provider-card` seat)
- `@deepseek-ai/dsh-llm-pi-ai` mounted — it is part of `@deepseek-ai/dsh-base`, so any base-backed profile has it. The plugin attaches to its settings namespace (`llm-pi-ai` by default).
- No build step, no bundler, no toolchain. The browser half is hand-written plain JavaScript in the format the shell loads.

## Install

```sh
git clone https://github.com/<you>/dsh-reasoning-effort.git
cd dsh-reasoning-effort
sh install.sh --dsh-root /path/to/dsh          # the directory holding node_modules/@deepseek-ai/dsh
```

`--dsh-root` may be omitted when `DSH_HOME`, `DSH_PROFILE_DIR`, or a directory above the current one identifies the installation. Add `--profile <name>` to target a profile other than `web`.

Then **restart dsh**. Open `Settings → Models`.

Uninstall:

```sh
sh install.sh --dsh-root /path/to/dsh --uninstall
```

> **The installer places a real copy, not a symlink.** The Host half really is imported by Node and imports `@deepseek-ai/schemastery`; Node resolves a symlinked package to its realpath, which lands outside the profile where `@deepseek-ai/*` is not resolvable. A real copy under the profile's `node_modules` makes normal resolution walk up to the dsh installation. See [Why a real copy](#why-a-real-copy).

## Usage

Every model has three states, matching the adapter's own semantics:

| State | Written | Effect |
|---|---|---|
| **Inherit** | `unset …reasoningEfforts` | The model keeps the installed catalog's capability. On a hand-declared route there is no catalog entry, so it gets **no Effort row**. |
| **Not a reasoning model** | `reasoningEfforts: false` | Declared non-reasoning. |
| **Declared levels** | `reasoningEfforts: {off: null, high: high}` | Those levels appear in the picker. |

`off` needs no value: it means *send no reasoning field at all*. Only `off` may be empty — every other level must carry the string dispatch should send.

### Addressing

The editor picks the correct place automatically, mirroring what the adapter accepts:

- A route that **lists its models** (`models[]`, the norm for a hand-declared route) writes each entry's own `reasoningEfforts`.
- A route that **inherits a catalog** writes `modelOverrides.<modelId>.reasoningEfforts`.

The second is required, not stylistic: a `modelOverrides` value cannot carry an `id`, and writing `models` would replace the entire inherited catalog.

### Validation, before any write

- Declaring only `off` is refused — the adapter refuses it too (`offers no level beyond "off"`), so the editor reports it instead of letting you find out from a boot log.
- A non-`off` level with an empty wire value is refused.
- Save is disabled until something actually changed.
- Writes carry the settings revision. A concurrent edit is reported as a conflict rather than silently overwritten.

## How it works

Three host facts make this possible without patching anything:

1. **The seat exists.** `dsh-client-ui-settings-models` declares `settings.models.provider-card` as a `keyed` child slot of `settings.section`, dispatched with `entryKey = row.entry.settingsNs`. `slot-contract.d.ts` documents it as one of two seats intended for plugins distributed outside the dsh repository.
2. **The write path is the page's own.** The plugin calls `ctx.remote.settings.describe()` / `.mutate(ns, ops, rev)` — the same Remote the Models page uses, so revisions, secret redaction, and refusal semantics stay the Host's.
3. **Silent field loss is impossible.** The page's writes are path-addressed (`setPath` clones only the spine and sets one leaf), so hand-written `reasoningEfforts` in `cordis.patch.yml` survives any GUI edit. This plugin edits the same field; it does not have to defend it.

### The one sharp edge: `RemoteResult`

Typert remote methods answer one level deeper than their Host signature suggests:

```ts
type RemoteResult<T> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: RemoteFailure }
```

Reading the declared shape directly yields `undefined` for every field — which looks exactly like *"the data is not there"* rather than like a bug. The shipped page writes `response.ok ? response.value : response.error.message`; so does this plugin.

### Client-plugin constraints this file obeys

From the distribution's own plugin guidance:

> **Do not** `require('@deepseek-ai/dsh-client-ui-primitives')` or load any other Harness Client package as a module … They change without notice, **a plain-JS plugin has no type check**, and a throwing component blanks your slot entry … Write your own controls and match the host instead.

So the browser half `require`s exactly one thing — `react`, one of the nine frozen platform seed words — and writes its own controls, styled with `--dsw-alias-*` theme tokens (each with a literal fallback, so a renamed token degrades appearance instead of breaking rendering). `verify.mjs` enforces this.

## Verify

```sh
node verify.mjs                                  # contracts only; no dsh needed
node verify.mjs --dsh-root /path/to/dsh          # also resolves the adapter
```

It re-implements the checks the Host performs at activation, so a mistake is reported here rather than as a blank slot entry. Every check corresponds to a real failure:

- a missing or wrongly shaped `exports["./client"]` throws *"declares dsh.client but exports no './client' bundle"*
- a missing `client.js` throws `MissingClientBundleError` and tells you to run `pnpm run build` — misleading for a bundle that needs no build
- **the registration id in `client.js` must equal the package name**, because the Host keys the browser module table by package name; a drift binds nothing
- the browser half must be a classic script (no ESM `import`/`export`) — it is loaded as a non-module `<script>`
- the browser half may `require` only a platform seed word

`.github/workflows/verify.yml` runs it on every push and pull request. That is not ceremony: nothing else catches an id/package-name drift.

## Limitations

- **Client-side only.** No Host behaviour, no tools, no model-visible anything.
- **The `llm-pi-ai` family only.** Its family covers every third-party and gateway route. The official `llm-deepseek` route already advertises its own levels from the adapter's built-in catalog.
- **It edits a model's levels; it does not add models.** The provider editor still owns the model list. This editor only offers levels for models that already exist or are inherited.
- **Visual appearance is unverified by its author.** Behaviour is covered by tests, but the rendered look was only reasoned about statically — controls, token usage, and no `document.body` writes. Issues with the visual result are welcome.

## Before publishing your fork

`package.json` intentionally omits `author`, `repository`, `homepage`, and `bugs`, since none can be known before the repository exists. Fill them in, and set the copyright holder in [`LICENSE`](LICENSE) (currently `<YOUR NAME>`).

## License

[MIT](LICENSE)
