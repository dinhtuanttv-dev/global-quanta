$path = "C:\Users\HP\global-quanta-react_1\global-quanta\src\components\MainTabs\KetNoiTheGioi\KetNoiTheGioiTab.tsx"
$lines = Get-Content $path
# Remove lines 289-290 (0-indexed: 288-289)
$newLines = $lines[0..287] + $lines[290..($lines.Length-1)]
$newLines | Set-Content $path
Write-Host "Removed lines 289-290"