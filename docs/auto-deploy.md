# 自动发布工作流

本仓库按分支区分环境：

- `staging-work` -> Vercel Preview -> Supabase persistent staging branch
- `main` -> Vercel Production -> Supabase production main

运行时代码不再包含生产 Supabase URL / key 的默认兜底。缺少环境变量时，构建或 API 会直接失败，这是为了避免测试环境误连正式 Supabase。

## 新增工作流

- `.github/workflows/deploy-staging.yml`
  - 触发：push 到 `staging-work` 或手动触发。
  - 使用 `STAGING_*` secrets。
  - 将 Vercel env upsert 到 `preview` target，并限定 `gitBranch=staging-work`。
  - 部署 Supabase migrations、config、Edge Function secrets、Edge Functions 到 staging Supabase project ref。
  - 部署 Vercel Preview。

- `.github/workflows/deploy-production.yml`
  - 触发：push 到 `main` 或手动触发。
  - 使用 `PRODUCTION_*` secrets。
  - 将 Vercel env upsert 到 `production` target。
  - 部署 Supabase migrations、config、Edge Function secrets、Edge Functions 到 production Supabase project ref。
  - 部署 Vercel Production。

## GitHub Secrets

通用 secrets：

- `VERCEL_TOKEN`: Vercel API / CLI token。
- `VERCEL_ORG_ID`: Vercel org/team id，供 Vercel CLI 链接项目使用。
- `VERCEL_TEAM_ID`: 可选。Vercel API 的 team id；为空时脚本会使用 `VERCEL_ORG_ID`。
- `VERCEL_PROJECT_ID`: Vercel project id。
- `SUPABASE_ACCESS_TOKEN`: Supabase CLI access token。

staging secrets：

- `STAGING_SUPABASE_PROJECT_REF`: Supabase persistent staging branch 的 project ref。
- `STAGING_SUPABASE_DB_PASSWORD`: staging branch 数据库密码，用于自动执行 migrations。
- `STAGING_SUPABASE_URL`: staging Supabase API URL。
- `STAGING_SUPABASE_PUBLISHABLE_KEY`: staging publishable / anon key。
- `STAGING_SUPABASE_SERVICE_ROLE_KEY`: staging service role key。
- `STAGING_APP_URL`: staging / Preview 访问地址。
- `STAGING_ALLOWED_ORIGINS`: staging CORS 允许来源，逗号分隔；可为空，但建议配置。
- `STAGING_GEMINI_API_KEY`: staging Gemini key。
- `STAGING_ALIPAY_APP_ID`: staging 支付宝 app id。
- `STAGING_ALIPAY_PRIVATE_KEY`: staging 支付宝应用私钥。
- `STAGING_ALIPAY_PUBLIC_KEY`: staging 支付宝公钥。
- `STAGING_ALIPAY_GATEWAY`: staging 支付宝网关。
- `STAGING_ALIPAY_NOTIFY_URL`: staging 支付回调地址。
- `STAGING_ALIPAY_RETURN_URL`: staging 支付完成返回地址。

production secrets：

- `PRODUCTION_SUPABASE_PROJECT_REF`: Supabase production main project ref。
- `PRODUCTION_SUPABASE_DB_PASSWORD`: production 数据库密码，用于自动执行 migrations。
- `PRODUCTION_SUPABASE_URL`: production Supabase API URL。
- `PRODUCTION_SUPABASE_PUBLISHABLE_KEY`: production publishable / anon key。
- `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`: production service role key。
- `PRODUCTION_APP_URL`: 正式站访问地址。
- `PRODUCTION_ALLOWED_ORIGINS`: production CORS 允许来源，逗号分隔；建议配置正式域名。
- `PRODUCTION_GEMINI_API_KEY`: production Gemini key。
- `PRODUCTION_ALIPAY_APP_ID`: production 支付宝 app id。
- `PRODUCTION_ALIPAY_PRIVATE_KEY`: production 支付宝应用私钥。
- `PRODUCTION_ALIPAY_PUBLIC_KEY`: production 支付宝公钥。
- `PRODUCTION_ALIPAY_GATEWAY`: production 支付宝网关。
- `PRODUCTION_ALIPAY_NOTIFY_URL`: production 支付回调地址。
- `PRODUCTION_ALIPAY_RETURN_URL`: production 支付完成返回地址。

## 自动发布流程

`staging-work` push 后：

1. 安装依赖。
2. 校验所有 staging secrets，缺任何关键项会 fail fast。
3. 用 Vercel API upsert Preview env，且只绑定 `staging-work` git branch。
4. 用当前 staging secrets 执行前端构建。
5. 用 Supabase CLI 写入 Edge Function secrets 到 staging project ref。
6. 推送 migrations 和 config 到 staging project ref。
7. 部署 Supabase Edge Functions 到 staging project ref。
8. 用 Vercel CLI 部署 Preview。

`main` push 后：

1. 安装依赖。
2. 校验所有 production secrets，缺任何关键项会 fail fast。
3. 用 Vercel API upsert Production env。
4. 用当前 production secrets 执行前端构建。
5. 用 Supabase CLI 写入 Edge Function secrets 到 production project ref。
6. 推送 migrations 和 config 到 production project ref。
7. 部署 Supabase Edge Functions 到 production project ref。
8. 用 Vercel CLI 部署 Production。

## 首次人工步骤

这些步骤只需要首次做一次，之后正常 push 分支即可：

- 在 Supabase 创建 production main 和 persistent staging branch，并记录各自 project ref、URL、publishable key、service role key、数据库密码。
- 在 GitHub 仓库 Settings -> Secrets and variables -> Actions 里配置上面列出的 secrets。
- 在 GitHub Environments 里创建 `staging` 和 `production` 环境；production 建议开启人工审批保护。
- 在 Vercel 创建/绑定项目，生成 `VERCEL_TOKEN`，记录 `VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`。
- 如果 Vercel Git Integration 已开启自动部署，建议关闭或设置 ignored build step，避免 GitHub Actions 和 Vercel 自带部署重复触发。
- 支付宝回调域名必须分别配置到 staging / production 对应地址，且公网可访问。

## 可选：用脚本完成首次初始化

如果本机已经安装并登录 `gh`，可以用本地文件一次性导入 GitHub Secrets：

```powershell
Copy-Item .env.deploy.example .env.deploy.local
# 编辑 .env.deploy.local，填入 staging / production 值。不要提交这个文件。
.\scripts\setup\import-github-secrets.ps1
```

如果本机已经登录 Supabase CLI，可以创建 persistent staging branch：

```powershell
.\scripts\setup\create-supabase-staging-branch.ps1 -ProductionProjectRef <production-project-ref> -BranchName staging-work -GitBranch staging-work
```

如果要从 production 克隆数据到 staging，额外加 `-WithData`。这个可能产生数据合规和成本影响，默认不启用。

## 排查

- 如果 workflow 在 `Validate deployment environment` 失败，看日志里的 `Missing required deployment environment variables`，补对应 GitHub Secret。
- 如果 Vercel env 同步失败，检查 `VERCEL_TOKEN` 权限、`VERCEL_PROJECT_ID`、`VERCEL_TEAM_ID` / `VERCEL_ORG_ID` 是否匹配项目。
- 如果 Supabase migrations 失败，检查 `SUPABASE_PROJECT_REF` 是否指向正确 branch，以及 `SUPABASE_DB_PASSWORD` 是否是对应 branch 的数据库密码。
- 如果 Edge Functions 运行时报 `GEMINI_API_KEY` 或支付 env 缺失，检查 `Sync Supabase Edge Function secrets` 是否成功。
- 如果测试版数据出现在正式版，先看 workflow 日志里的 Supabase project ref，再检查 GitHub Secrets 是否把 staging 值误填成 production 值。

## 参考

- Vercel API 环境变量 upsert 使用 [`POST /v10/projects/{idOrName}/env?upsert=true`](https://vercel.com/docs/rest-api/reference/endpoints/projects/create-one-or-more-environment-variables)，并支持 `target` 与 `gitBranch`。
- Supabase CLI 使用 [`secrets set --env-file`](https://supabase.com/docs/reference/cli/supabase-secrets)、`db push`、`config push`、`functions deploy --project-ref` 按 project ref 部署到对应环境。
