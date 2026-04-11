param(
  [string]$EnvFile = ".env.deploy.local",
  [string]$Repo = ""
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) is not installed. Install it first, then run 'gh auth login'."
}

gh auth status | Out-Host

if (-not (Test-Path $EnvFile)) {
  throw "Missing $EnvFile. Copy .env.deploy.example to $EnvFile and fill it locally."
}

if (-not $Repo) {
  $remote = git config --get remote.origin.url
  if ($remote -match "github\.com[:/](?<owner>[^/]+)/(?<repo>[^/.]+)(\.git)?$") {
    $Repo = "$($Matches.owner)/$($Matches.repo)"
  }
}

if (-not $Repo) {
  throw "Could not infer GitHub repo. Pass -Repo owner/name."
}

function Read-EnvFile([string]$Path) {
  $map = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$key] = $value
  }
  return $map
}

function Require-Key($Map, [string]$Key) {
  if (-not $Map.ContainsKey($Key) -or [string]::IsNullOrWhiteSpace([string]$Map[$Key])) {
    throw "Missing required key in ${EnvFile}: $Key"
  }
}

function Set-RepoSecret($Map, [string]$Key) {
  Require-Key $Map $Key
  $value = [string]$Map[$Key]
  $value | gh secret set $Key --repo $Repo
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to set repo secret: $Key"
  }
  Write-Host "Set repo secret: $Key"
}

function Set-EnvSecret($Map, [string]$Environment, [string]$Key) {
  Require-Key $Map $Key
  $value = [string]$Map[$Key]
  $value | gh secret set $Key --repo $Repo --env $Environment
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to set $Environment secret: $Key"
  }
  Write-Host "Set $Environment secret: $Key"
}

$envMap = Read-EnvFile $EnvFile

$repoSecrets = @(
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "SUPABASE_ACCESS_TOKEN"
)

$optionalRepoSecrets = @("VERCEL_TEAM_ID")

$stagingSecrets = @(
  "STAGING_SUPABASE_PROJECT_REF",
  "STAGING_SUPABASE_DB_PASSWORD",
  "STAGING_SUPABASE_URL",
  "STAGING_SUPABASE_PUBLISHABLE_KEY",
  "STAGING_SUPABASE_SERVICE_ROLE_KEY",
  "STAGING_APP_URL",
  "STAGING_ALLOWED_ORIGINS",
  "STAGING_GEMINI_API_KEY",
  "STAGING_ALIPAY_APP_ID",
  "STAGING_ALIPAY_PRIVATE_KEY",
  "STAGING_ALIPAY_PUBLIC_KEY",
  "STAGING_ALIPAY_GATEWAY",
  "STAGING_ALIPAY_NOTIFY_URL",
  "STAGING_ALIPAY_RETURN_URL"
)

$productionSecrets = @(
  "PRODUCTION_SUPABASE_PROJECT_REF",
  "PRODUCTION_SUPABASE_DB_PASSWORD",
  "PRODUCTION_SUPABASE_URL",
  "PRODUCTION_SUPABASE_PUBLISHABLE_KEY",
  "PRODUCTION_SUPABASE_SERVICE_ROLE_KEY",
  "PRODUCTION_APP_URL",
  "PRODUCTION_ALLOWED_ORIGINS",
  "PRODUCTION_GEMINI_API_KEY",
  "PRODUCTION_ALIPAY_APP_ID",
  "PRODUCTION_ALIPAY_PRIVATE_KEY",
  "PRODUCTION_ALIPAY_PUBLIC_KEY",
  "PRODUCTION_ALIPAY_GATEWAY",
  "PRODUCTION_ALIPAY_NOTIFY_URL",
  "PRODUCTION_ALIPAY_RETURN_URL"
)

Write-Host "Ensuring GitHub environments exist for $Repo..."
gh api --method PUT "repos/$Repo/environments/staging" | Out-Null
gh api --method PUT "repos/$Repo/environments/production" | Out-Null

foreach ($key in $repoSecrets) {
  Set-RepoSecret $envMap $key
}

foreach ($key in $optionalRepoSecrets) {
  if ($envMap.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace([string]$envMap[$key])) {
    Set-RepoSecret $envMap $key
  }
}

foreach ($key in $stagingSecrets) {
  Set-EnvSecret $envMap "staging" $key
}

foreach ($key in $productionSecrets) {
  Set-EnvSecret $envMap "production" $key
}

Write-Host "Done. GitHub Actions can now deploy staging-work and main using branch-specific secrets."
