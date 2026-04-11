param(
  [Parameter(Mandatory = $true)]
  [string]$ProductionProjectRef,

  [string]$BranchName = "staging-work",
  [string]$GitBranch = "staging-work",
  [switch]$WithData
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  throw "Supabase CLI is not installed or not in PATH."
}

Write-Host "Checking Supabase branches for project $ProductionProjectRef..."
$branchesJson = supabase branches list --project-ref $ProductionProjectRef --output json
$branches = @()
if ($branchesJson) {
  $branches = $branchesJson | ConvertFrom-Json
}

$existing = $branches | Where-Object { $_.name -eq $BranchName -or $_.git_branch -eq $GitBranch } | Select-Object -First 1
if ($existing) {
  Write-Host "Branch already exists: $($existing.name) / $($existing.id)"
} else {
  $args = @("branches", "create", $BranchName, "--persistent", "--project-ref", $ProductionProjectRef, "--yes")
  if ($WithData) {
    $args += "--with-data"
  }
  Write-Host "Creating persistent Supabase branch '$BranchName'..."
  & supabase @args
}

Write-Host "Binding Supabase branch '$BranchName' to git branch '$GitBranch'..."
supabase branches update $BranchName --git-branch $GitBranch --project-ref $ProductionProjectRef --yes

Write-Host "Done. Fetch branch details with:"
Write-Host "supabase branches get $BranchName --project-ref $ProductionProjectRef --output env"
