param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
  [string]$ProjectId,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z]+-[a-z]+[0-9]+$')]
  [string]$Region,

  [ValidatePattern('^[a-z][a-z0-9-]{0,48}[a-z0-9]$')]
  [string]$Service = 'catchcatch',

  [ValidatePattern('^[a-z][a-z0-9-]{0,61}[a-z0-9]$')]
  [string]$Repository = 'catchcatch',

  [ValidatePattern('^[A-Za-z0-9._-]+$')]
  [string]$Tag = 'latest'
)

$ErrorActionPreference = 'Stop'
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$templatePath = Join-Path $scriptDirectory 'service.template.yaml'
$outputPath = Join-Path $scriptDirectory 'service.generated.yaml'

$content = [System.IO.File]::ReadAllText($templatePath)
$replacements = [ordered]@{
  '__PROJECT_ID__' = $ProjectId
  '__REGION__' = $Region
  '__SERVICE__' = $Service
  '__REPOSITORY__' = $Repository
  '__TAG__' = $Tag
}

foreach ($entry in $replacements.GetEnumerator()) {
  $content = $content.Replace($entry.Key, $entry.Value)
}

if ($content.Contains('__')) {
  throw 'Unresolved template token remains in service.generated.yaml'
}

[System.IO.File]::WriteAllText($outputPath, $content, [System.Text.UTF8Encoding]::new($false))
Write-Output $outputPath

