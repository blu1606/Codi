param([ValidateSet('generate','focused','full','types','standards','build','runner')][string]$Check)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$commands = @{
  generate = 'pnpm run env:generate'
  focused = 'pnpm exec vitest run apps/web/src/lib/analytics-real-data.test.ts apps/web/src/lib/analytics-routes.test.ts apps/web/src/lib/analytics-source.test.ts apps/web/src/components/analytics/analytics-read-panel.test.ts'
  full = 'pnpm test'
  types = 'pnpm run check-types'
  standards = 'pnpm run check:standards'
  build = 'pnpm run build'
  runner = 'pnpm exec vitest run apps/web/src/lib/coding-runner.test.ts'
}
$start = [System.Diagnostics.ProcessStartInfo]::new()
$start.FileName = $env:ComSpec
$start.Arguments = '/d /s /c "' + $commands[$Check] + '"'
$start.WorkingDirectory = $project
$start.UseShellExecute = $false
$start.Environment.Clear()
foreach ($name in @('Path','SystemRoot','WINDIR','ComSpec','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','ProgramData','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','PATHEXT','HOMEDRIVE','HOMEPATH')) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ($value) { $start.Environment[$name] = $value }
}
$start.Environment['CI'] = '1'
$start.Environment['NEXT_TELEMETRY_DISABLED'] = '1'
$start.Environment['DATABASE_URL'] = 'postgresql://unused:unused@127.0.0.1:1/unused'
$start.Environment['BETTER_AUTH_SECRET'] = 'nonsecret-local-build-placeholder-00000000'
$start.Environment['BETTER_AUTH_URL'] = 'http://localhost:3001'
$start.Environment['NODE_ENV'] = $(if ($Check -eq 'build') { 'production' } else { 'test' })
$process = [System.Diagnostics.Process]::Start($start)
$process.WaitForExit()
exit $process.ExitCode
