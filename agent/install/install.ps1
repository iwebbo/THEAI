# Installation de l'agent THEAI sur Windows (PowerShell en administrateur).
#   $env:THEAI_URL='https://theai.example.com'; $env:THEAI_TOKEN='<jeton>'
#   iwr "$env:THEAI_URL/downloads/agent/install.ps1" -UseBasicParsing | iex
# Variable optionnelle : THEAI_CA_FILE (CA interne PEM).
$ErrorActionPreference = 'Stop'

if (-not $env:THEAI_URL -or -not $env:THEAI_TOKEN) { throw 'THEAI_URL et THEAI_TOKEN sont requis.' }
$principalCheck = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Exécuter PowerShell en administrateur.' }

$base = $env:THEAI_URL.TrimEnd('/') + '/downloads/agent'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
$name = "theai-agent-windows-$arch.exe"
$dir  = Join-Path $env:ProgramFiles 'TheaiAgent'
$data = Join-Path $env:ProgramData 'theai-agent'
$exe  = Join-Path $dir 'theai-agent.exe'
$tmp  = Join-Path $env:TEMP $name

Write-Host "Telechargement de $name..."
Invoke-WebRequest "$base/$name" -OutFile $tmp -UseBasicParsing
$r = Invoke-WebRequest "$base/SHA256SUMS" -UseBasicParsing
$sums = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
$line = $sums -split "`n" | Where-Object { $_.Trim() -match ('\s' + [regex]::Escape($name) + '$') } | Select-Object -First 1
if (-not $line) { throw "Somme de contrôle introuvable pour $name" }
$expected = ($line.Trim() -split '\s+')[0].ToLower()
$actual = (Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower()
if ($expected -ne $actual) { Remove-Item $tmp -Force; throw 'Somme de contrôle invalide, abandon.' }

New-Item -ItemType Directory -Force -Path $dir, $data | Out-Null
if (Get-ScheduledTask -TaskName 'TheaiAgent' -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName 'TheaiAgent' -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
Copy-Item $tmp $exe -Force
Remove-Item $tmp -Force

$cfg = Join-Path $data 'config.json'
$enrollArgs = @('enroll', '-url', $env:THEAI_URL, '-token', $env:THEAI_TOKEN, '-config', $cfg)
if ($env:THEAI_CA_FILE) { $enrollArgs += @('-ca', $env:THEAI_CA_FILE) }
& $exe @enrollArgs
if ($LASTEXITCODE -ne 0) { throw "Echec de l'enrôlement." }

# La clé API ne doit être lisible que par SYSTEM et les administrateurs.
icacls $data /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null

$action    = New-ScheduledTaskAction -Execute $exe -Argument "run -config `"$cfg`""
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'TheaiAgent' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'TheaiAgent'
Write-Host "Agent installe et demarre (tâche planifiee 'TheaiAgent')."