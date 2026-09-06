$path = "C:\Users\HP\global-quanta-react_1\global-quanta\src\components\MainTabs\KetNoiTheGioi\KetNoiTheGioiTab.tsx"
$content = Get-Content $path
$content[326] = ""
$content[327] = ""
$newContent = $content | Where-Object { $_.Trim() -ne "" }
Set-Content -Path $path -Value $newContent
Write-Host "Done"