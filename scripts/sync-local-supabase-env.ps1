# Reconcile ignored local-only credentials after Supabase start/CLI key rotation.
# Never prints keys and never changes cloud/Vercel configuration.
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = [IO.Path]::GetFullPath((Join-Path $workspace '.env.local'))
if ([IO.Path]::GetDirectoryName($destination) -ne $workspace) { throw 'Unexpected target path.' }
if (-not (Test-Path -LiteralPath $destination)) { throw '.env.local is missing.' }
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue' # Supabase emits harmless stopped-service notices on stderr.
$raw = (& pnpm dlx supabase@2.118.0 status -o json 2>$null) -join "`n"
$commandExit = $LASTEXITCODE
$ErrorActionPreference = $previousPreference
if ($commandExit -ne 0) { throw 'Could not read local Supabase status.' }
$status = $raw | ConvertFrom-Json
if ($status.API_URL -ne 'http://127.0.0.1:54321' -or -not $status.ANON_KEY -or -not $status.SERVICE_ROLE_KEY) {
  throw 'Local Supabase status is incomplete.'
}
$content = Get-Content -Raw -LiteralPath $destination
foreach ($entry in @(
  @{ Name = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'; Value = $status.ANON_KEY },
  @{ Name = 'SUPABASE_SERVICE_ROLE_KEY'; Value = $status.SERVICE_ROLE_KEY }
)) {
  $pattern = '(?m)^' + [regex]::Escape($entry.Name) + '=.*$'
  if (-not [regex]::IsMatch($content, $pattern)) { throw "Missing $($entry.Name) in .env.local." }
  $content = [regex]::Replace($content, $pattern, [string]($entry.Name + '=' + $entry.Value))
}
[IO.File]::WriteAllText($destination, $content)
Write-Output 'Synced ignored .env.local with the running local Supabase keys.'
