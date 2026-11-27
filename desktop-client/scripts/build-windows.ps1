param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = 'Stop'
$goWinresVersion = 'github.com/tc-hib/go-winres@v0.3.3'
$projectRoot = Split-Path -Parent $PSScriptRoot
$resourceFile = Join-Path $projectRoot 'rsrc_windows_amd64.syso'
$outputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $outputPath
$extractDirectory = Join-Path $outputDirectory "icon-resources-$PID"

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
Push-Location $projectRoot
try {
    go run $goWinresVersion simply --arch amd64 --out rsrc --icon icon/market-archive.ico
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not generate the Windows icon resource.'
    }

    $ldflags = "-s -w -X main.version=$Version"
    go build "-ldflags=$ldflags" -o $outputPath .
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not build the Windows executable.'
    }

    go run $goWinresVersion extract --dir $extractDirectory $outputPath
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not inspect embedded Windows resources.'
    }

    $icons = Get-ChildItem -LiteralPath $extractDirectory -Filter '*.ico' -File -Recurse -ErrorAction SilentlyContinue
    if (-not $icons) {
        throw 'The executable has no embedded Windows icon.'
    }
}
finally {
    Pop-Location
    if (Test-Path -LiteralPath $resourceFile -PathType Leaf) {
        Remove-Item -LiteralPath $resourceFile -Force
    }
}
