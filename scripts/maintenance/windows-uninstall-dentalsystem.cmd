@echo off
setlocal
set "EXIT_CODE=0"
set "DATA_OPTION="

if /I "%~1"=="/quiet" (
  shift
  goto run_helper
)

echo.
echo  DentalSystem Windows maintenance tool
echo  This tool removes previous DentalSystem installations.
echo  Choose whether local clinic data should be kept.
echo.
choice /C KDR /N /M "[K]eep data  [D]elete data  [R]eturn"
if errorlevel 3 goto end
if errorlevel 2 set "DATA_OPTION=-DeleteUserData"
if errorlevel 1 goto run_helper

:run_helper
set "SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$raw = Get-Content -LiteralPath $env:SELF -Raw; $marker = '# POWERSHELL_PAYLOAD'; $index = $raw.IndexOf($marker); if ($index -lt 0) { throw 'PowerShell payload marker not found.' }; $payload = $raw.Substring($index + $marker.Length); $tempScript = [System.IO.Path]::Combine($env:TEMP, ('DentalSystem-uninstall-' + [System.Guid]::NewGuid().ToString('N') + '.ps1')); Set-Content -LiteralPath $tempScript -Value $payload -Encoding UTF8; try { if ($env:DATA_OPTION -eq '-DeleteUserData') { & $tempScript -DeleteUserData @args } else { & $tempScript @args }; exit $LASTEXITCODE } finally { Remove-Item -LiteralPath $tempScript -Force -ErrorAction SilentlyContinue }" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
pause
:end
exit /b %EXIT_CODE%

# POWERSHELL_PAYLOAD
param(
  [switch]$DeleteUserData,
  [switch]$FreshOnly,
  [switch]$LegacyOnly
)

$ErrorActionPreference = "Continue"
$LogPath = [System.IO.Path]::Combine($env:TEMP, "DentalSystem-uninstall.log")

function Write-Log {
  param([string]$Message)
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -Path $LogPath -Value $line -Encoding UTF8
  Write-Host $line
}

function Test-IsSafeInstallDirectory {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
  $leaf = Split-Path -Path $Path -Leaf
  $safeNames = @(
    "DentalSystem",
    "dental-clinic-manager",
    "dental-clinic-manager-fresh"
  )
  return $safeNames -contains $leaf
}

function Get-UninstallEntries {
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
  )

  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
      $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      if ($null -eq $props) { return }
      $keyName = Split-Path $_.Name -Leaf
      $displayName = [string]$props.DisplayName
      $uninstallString = [string]$props.UninstallString
      $installLocation = [string]$props.InstallLocation
      $isDentalSystem =
        $displayName -like "DentalSystem*" -or
        $keyName -like "*com.dental.clinic*" -or
        $keyName -like "*dental.clinic*" -or
        $uninstallString -like "*DentalSystem*" -or
        $installLocation -like "*DentalSystem*" -or
        $installLocation -like "*dental-clinic-manager*"

      if (-not $isDentalSystem) { return }
      if ($FreshOnly -and $displayName -notlike "*Fresh*" -and $installLocation -notlike "*fresh*") { return }
      if ($LegacyOnly -and ($displayName -like "*Fresh*" -or $installLocation -like "*fresh*")) { return }

      [PSCustomObject]@{
        RegistryPath = $_.PSPath
        KeyName = $keyName
        DisplayName = $displayName
        UninstallString = $uninstallString
        InstallLocation = $installLocation
      }
    }
  }
}

function Get-UninstallerPath {
  param([string]$UninstallString)
  if ([string]::IsNullOrWhiteSpace($UninstallString)) { return "" }
  if ($UninstallString -match '"([^"]+\.exe)"') { return $Matches[1] }
  if ($UninstallString -match '^([^\s]+\.exe)') { return $Matches[1] }
  return ""
}

function Invoke-Uninstaller {
  param([object]$Entry)
  $uninstaller = Get-UninstallerPath $Entry.UninstallString
  if ([string]::IsNullOrWhiteSpace($uninstaller) -or -not (Test-Path $uninstaller)) {
    Write-Log "Uninstaller missing for $($Entry.DisplayName): $uninstaller"
    return $false
  }

  Write-Log "Running uninstaller: $uninstaller"
  $process = Start-Process -FilePath $uninstaller -ArgumentList "/S", "/KEEP_APP_DATA" -Wait -PassThru -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    Write-Log "Failed to start uninstaller: $uninstaller"
    return $false
  }
  Write-Log "Uninstaller exit code: $($process.ExitCode)"
  return $process.ExitCode -eq 0
}

function Remove-InstallDirectory {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path $Path)) { return }
  if (-not (Test-IsSafeInstallDirectory $Path)) {
    Write-Log "Skip unsafe install directory: $Path"
    return
  }
  Write-Log "Removing install directory: $Path"
  Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
}

function Remove-RegistryEntry {
  param([string]$RegistryPath)
  if ([string]::IsNullOrWhiteSpace($RegistryPath) -or -not (Test-Path $RegistryPath)) { return }
  Write-Log "Removing uninstall registry entry: $RegistryPath"
  Remove-Item -LiteralPath $RegistryPath -Recurse -Force -ErrorAction SilentlyContinue
}

function Remove-KnownInstallDirectories {
  $candidates = @(
    [System.IO.Path]::Combine($env:LOCALAPPDATA, "Programs", "DentalSystem"),
    [System.IO.Path]::Combine($env:LOCALAPPDATA, "Programs", "dental-clinic-manager"),
    [System.IO.Path]::Combine($env:LOCALAPPDATA, "Programs", "dental-clinic-manager-fresh"),
    [System.IO.Path]::Combine($env:ProgramFiles, "DentalSystem"),
    [System.IO.Path]::Combine($env:ProgramFiles, "dental-clinic-manager"),
    [System.IO.Path]::Combine($env:ProgramFiles, "dental-clinic-manager-fresh")
  )
  $programFilesX86 = ${env:ProgramFiles(x86)}
  if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
    $candidates += @(
      [System.IO.Path]::Combine($programFilesX86, "DentalSystem"),
      [System.IO.Path]::Combine($programFilesX86, "dental-clinic-manager"),
      [System.IO.Path]::Combine($programFilesX86, "dental-clinic-manager-fresh")
    )
  }
  foreach ($path in $candidates | Select-Object -Unique) {
    Remove-InstallDirectory $path
  }
}

function Remove-UserData {
  if (-not $DeleteUserData) {
    Write-Log "User data is preserved. Pass -DeleteUserData only if you intentionally want to remove local clinic data."
    return
  }

  $dataDirs = @(
    [System.IO.Path]::Combine($env:APPDATA, "DentalSystem"),
    [System.IO.Path]::Combine($env:APPDATA, "dental-clinic-manager"),
    [System.IO.Path]::Combine($env:APPDATA, "dental-clinic-manager-fresh")
  )
  foreach ($path in $dataDirs | Select-Object -Unique) {
    if (Test-Path $path) {
      Write-Log "Removing user data directory: $path"
      Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

Set-Content -Path $LogPath -Value "DentalSystem uninstall log" -Encoding UTF8
Write-Log "Uninstall helper started."
Write-Log "Log path: $LogPath"

Write-Log "Stopping DentalSystem processes."
Get-Process -Name "DentalSystem" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

$entries = @(Get-UninstallEntries)
Write-Log "Matched uninstall entries: $($entries.Count)"

foreach ($entry in $entries) {
  Write-Log "Entry: $($entry.DisplayName) | $($entry.KeyName) | $($entry.InstallLocation)"
  $uninstalled = Invoke-Uninstaller $entry
  if (-not $uninstalled) {
    Remove-InstallDirectory $entry.InstallLocation
  }
  Remove-RegistryEntry $entry.RegistryPath
}

Remove-KnownInstallDirectories
Remove-UserData

Write-Log "Uninstall helper finished."
Write-Host ""
Write-Host "Done. Log file: $LogPath"
