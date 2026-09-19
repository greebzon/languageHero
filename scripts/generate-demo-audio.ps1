$ErrorActionPreference = 'Stop'
$audioDirectory = Join-Path $PSScriptRoot '../apps/mobile/assets/audio'
New-Item -ItemType Directory -Force -Path $audioDirectory | Out-Null
$speaker = New-Object -ComObject SAPI.SpVoice
$englishVoice = $speaker.GetVoices() | Where-Object { $_.GetDescription() -like '*Zira*' } | Select-Object -First 1
if (-not $englishVoice) { throw 'Microsoft Zira English voice is required to regenerate demo audio.' }
$speaker.Voice = $englishVoice
$speaker.Rate = -2
$words = @{ fox = 'A fox.'; bear = 'A bear.'; rabbit = 'A rabbit.'; owl = 'An owl.' }
foreach ($entry in $words.GetEnumerator()) {
    $stream = New-Object -ComObject SAPI.SpFileStream
    try {
        $stream.Format.Type = 22
        $stream.Open((Join-Path $audioDirectory ($entry.Key + '.wav')), 3)
        $speaker.AudioOutputStream = $stream
        $null = $speaker.Speak($entry.Value)
    } finally { $stream.Close() }
}
Write-Output 'Generated four local English audio files.'
