param([Parameter(Mandatory=$true)][string]$Archive)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$expectedHash = '969abdbd5cc7fce201c4226f3ab4173a6ab119b3170e52528fffcd949dfa687e'
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Archive).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw 'Unexpected GeoGebra archive. Use the pinned official 5.4.936.0 bundle.' }

$assetRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\vendor\geogebra'))
New-Item -ItemType Directory -Path $assetRoot -Force | Out-Null
$manifestFiles = [Collections.Generic.List[object]]::new()
$zip = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Archive))
try {
  foreach ($entry in $zip.Entries) {
    if ($entry.FullName.EndsWith('/')) { continue }
    if ($entry.FullName -eq 'README.txt') { $relative = 'UPSTREAM-README.txt' }
    elseif ($entry.FullName -match '^GeoGebra/(deployggb\.js|HTML5/5\.0/(?:css|web3d)/.+)$') { $relative = $Matches[1] }
    else { continue }
    $destination = [IO.Path]::GetFullPath((Join-Path $assetRoot $relative))
    if (-not $destination.StartsWith($assetRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive path' }
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($destination)) -Force | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
    $manifestFiles.Add([ordered]@{
      path = $relative.Replace('\', '/')
      size = (Get-Item -LiteralPath $destination).Length
      sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
    })
  }
} finally { $zip.Dispose() }

$manifest = [ordered]@{
  version = '5.4.936.0'
  source = 'https://download.geogebra.org/installers/5.4/geogebra-math-apps-bundle-5-4-936-0.zip'
  archiveSha256 = $expectedHash
  scope = 'Official deployggb.js, shared CSS and the complete web3d runtime; unused web/webSimple variants omitted.'
  license = 'https://www.geogebra.org/license'
  files = @($manifestFiles | Sort-Object { $_.path })
}
[IO.File]::WriteAllText((Join-Path $assetRoot 'manifest.json'), ($manifest | ConvertTo-Json -Depth 6) + "`n", [Text.UTF8Encoding]::new($false))
Write-Output ('Imported GeoGebra ' + $manifest.version + ': ' + $manifestFiles.Count + ' files.')
