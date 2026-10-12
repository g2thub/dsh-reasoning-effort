# dsh-reasoning-effort

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI 的 **Models 设置页面**加一个**逐模型**的「思考强度」编辑器 —— 补上官方**故意**不做的那一块。

[English](README.md) | 中文

---

## 问题

在 dsh 里加一个自定义模型端点（`Settings → Models → Add model provider → Custom model API`），拉取模型列表，一切正常 —— 除了 composer 的 `/model` 选择器里**这批模型没有 Effort 行**，而内置的 DeepSeek 模型有。

这不是遗漏。`dsh-client-ui-settings-models` 的源码里写着：

> Reasoning effort is deliberately absent: it is a per-MODEL capability, and the models under one provider disagree about it, so a **provider-scoped control** can only be set to a value some of them reject.

关键词是 **provider-scoped**。把控件放在提供商层级，它就只能填一个值，而这个值必然被该提供商下某些模型拒绝 —— 一个模型支持 `off`，它的同门兄弟可能不支持。所以 Host 把 `reasoningEfforts` 留作 YAML 专属字段，而 `dsh-llm-pi-ai` 会在**任何网络 I/O 之前**拒绝一个该模型未声明的档位。

**本插件把编辑器放到模型层级**，那个反对理由就不成立了 —— 每个模型自己一组档位。

它**没有**修改或替换 Models 页面，而是注册进那个页面已经发布的、专为「仓库外插件」预留的扩展座位。

## 长什么样

每张 pi-ai 提供商卡片底部：

```
思考强度  尚未声明档位 —— 这些模型在模型选择器里没有 Effort 行      [编辑]
```

展开后，每个模型一行：

```
my-reasoner                                        [继承] [非推理模型]
[off] [minimal] [low] [medium] [high] [xhigh] [max]
  low [low]   medium [medium]   high [ultra]
```

点亮的档位即已声明。除 `off` 外，每个点亮的档位都有一个**线上取值**输入框 —— 改成别的就是「选择器显示 `high`、线上发 `ultra`」，适配网关自己的词汇表。

## 环境要求

- dsh `0.2.0-rc.2`（Client 插件格式与该座位）
- 已挂载 `@deepseek-ai/dsh-llm-pi-ai` —— 它属于 `@deepseek-ai/dsh-base`，所以任何基于 base 的 profile 都有。插件挂到它的 settings 命名空间（默认 `llm-pi-ai`）。
- **无需构建**：不需要 bundler、不需要 TypeScript、不需要任何工具链。浏览器那半是手写的纯 JavaScript，就是 shell 加载的那种格式。

## 安装

```sh
git clone https://github.com/<you>/dsh-reasoning-effort.git
cd dsh-reasoning-effort
sh install.sh --dsh-root /path/to/dsh          # 含有 node_modules/@deepseek-ai/dsh 的那一层
```

当 `DSH_HOME`、`DSH_PROFILE_DIR`，或当前目录的某一层父目录能标识出安装位置时，`--dsh-root` 可省略。用 `--profile <name>` 指定 `web` 以外的 profile。

然后**重启 dsh**，打开 `Settings → Models`。

卸载：

```sh
sh install.sh --dsh-root /path/to/dsh --uninstall
```

> **安装脚本放的是真实拷贝，不是软链接。** Host 半边真的会被 Node import，而它 `import` 了 `@deepseek-ai/schemastery`；Node 会把软链接解析到 realpath，落在 profile 之外，那里解析不到 `@deepseek-ai/*`。放在 profile 的 `node_modules` 下的真实拷贝能让正常的向上查找走到 dsh 安装根。见下文「为什么必须真实拷贝」。

## 用法

每个模型三种状态，对应适配器真实的三种语义：

| 状态 | 写入 | 效果 |
|---|---|---|
| **继承** | `unset …reasoningEfforts` | 该模型保留内置目录的能力。手写路由没有目录条目，于是**选择器里没有 Effort 行**。 |
| **非推理模型** | `reasoningEfforts: false` | 明确声明不推理。 |
| **声明档位** | `reasoningEfforts: {off: null, high: high}` | 选择器里出现这些档位。 |

`off` 不需要填值：它的语义就是**完全不发 reasoning 字段**。只有 `off` 可以留空 —— 其它档位必须给出实际要发送的字符串。

### 寻址方式

编辑器会自动选对位置，与适配器接受的形式一致：

- 路由**列了模型**（`models[]`，手写路由的常态）→ 写每个条目自己的 `reasoningEfforts`
- 路由**继承内置目录** → 写 `modelOverrides.<modelId>.reasoningEfforts`

第二种是必须的、不是风格选择：`modelOverrides` 的值不带 `id`，而写 `models` 会**整个替换**继承来的目录。

### 保存前的校验

- 只声明 `off` 会被拒绝 —— 适配器同样会拒（`offers no level beyond "off"`），所以编辑器提前报错，而不是让你去启动日志里找。
- 非 `off` 档位留空会被拒绝。
- 没有实际改动时保存按钮不可用。
- 写入带 settings revision；并发修改会明确报冲突，而不是静默覆盖。

## 原理

三个 Host 事实让这件事无需 patch 任何东西即可成立：

1. **座位本来就存在。** `dsh-client-ui-settings-models` 把 `settings.models.provider-card` 声明为 `settings.section` 的 `keyed` 子槽位，以 `entryKey = row.entry.settingsNs` 派发。`slot-contract.d.ts` 明确写了它是「为本仓库之外分发的插件」准备的两个座位之一。
2. **写入走的是页面自己的通道。** 插件调用 `ctx.remote.settings.describe()` / `.mutate(ns, ops, rev)` —— 和 Models 页面同一个 Remote，所以 revision、密钥脱敏、拒绝语义都归 Host 管。
3. **字段不会静默丢失。** 页面的写入是路径寻址的（`setPath` 只克隆路径那条脊、只改一个叶子），所以手写进 `cordis.patch.yml` 的 `reasoningEfforts` 能扛住任何 GUI 编辑。本插件改的是同一个字段，不需要去「保护」它。

### 唯一一个坑：`RemoteResult`

Typert 的 remote 方法返回的比 Host 签名所示的**深一层**：

```ts
type RemoteResult<T> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: RemoteFailure }
```

直接按声明的形状读，每个字段都是 `undefined` —— 而这看起来和「数据本来就没有」一模一样，不像个 bug。官方页面写的是 `response.ok ? response.value : response.error.message`；本插件也是。

### 遵循的客户端插件约束

发行版自带的插件规范：

> **Do not** `require('@deepseek-ai/dsh-client-ui-primitives')` or load any other Harness Client package as a module … They change without notice, **a plain-JS plugin has no type check**, and a throwing component blanks your slot entry … Write your own controls and match the host instead.

所以浏览器那半只 `require` 一样东西 —— `react`（shell 冻结种子表九项之一），控件自己写，样式只用 `--dsw-alias-*` 主题变量（各带字面量兜底，token 改名只会掉外观、不会崩渲染）。`verify.mjs` 会强制这条。

## 校验

```sh
node verify.mjs                                  # 只查契约，不需要装 dsh
node verify.mjs --dsh-root /path/to/dsh          # 额外解析适配器
```

它复刻了 Host 在激活时真正执行的检查，所以错误在这里就报出来，而不是变成一片空白的槽位。每一项都对应一个真实报错：

- `exports["./client"]` 缺失或形状不对 → *"declares dsh.client but exports no './client' bundle"*
- `client.js` 缺失 → `MissingClientBundleError`，并提示你跑 `pnpm run build` —— 对一个根本不需要构建的 bundle 来说，这条信息很有误导性
- **`client.js` 里的注册 id 必须等于包名**，因为 Host 的浏览器模块表按包名做键；一旦漂移，什么都绑不上
- 浏览器那半必须是经典脚本（无 ESM `import`/`export`）—— 它是以非 module 的 `<script>` 加载的
- 浏览器那半只能 `require` 平台种子表里的模块

`.github/workflows/verify.yml` 在每次 push 和 PR 上跑它。这不是仪式感：id 与包名漂移**没有别的机制能抓到**。

## 已知边界

- **纯客户端。** 没有 Host 行为、没有工具、模型看不到任何东西。
- **只覆盖 `llm-pi-ai` 家族。** 该家族涵盖所有第三方与网关路由。官方 `llm-deepseek` 路由本来就由适配器内置目录提供档位。
- **它改模型的档位，不新增模型。** 模型列表仍归官方提供商编辑器管。本编辑器只对**已存在或已继承**的模型提供档位。
- **视觉效果未经作者验证。** 行为有测试覆盖，但渲染效果只做了静态推断 —— 自写控件、只用 token、不碰 `document.body`。视觉上的问题欢迎反馈。

## 发布你自己的 fork 之前

`package.json` 故意省略了 `author`、`repository`、`homepage`、`bugs` —— 仓库还不存在时这些无从得知。请补上，并把 [`LICENSE`](LICENSE) 里的版权持有者（目前是 `<YOUR NAME>`）填好。

## 许可证

[MIT](LICENSE)
