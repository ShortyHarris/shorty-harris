# End-to-end authorization check for the approved_queue RPC, through PostgREST with a real
# client login (SECURITY DEFINER bypasses RLS, so can_manage_client() is the only gate).
# Run by hand with a CLIENT account (not an admin): .\approved_queue_auth.ps1
# PASS = the other client's call returns ok:false / not_permitted with no rows, and the own
# call returns ok:true with is_admin false and no policy-held rows.

$url = "https://lxoeotyibsalbxgbjfxo.supabase.co"
$key = "sb_publishable_CdK80AB1j_99hPPZGGS_jA_XYsNzrUs"
$email = Read-Host "Client login email (NOT an admin)"
$pw = Read-Host "Password" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
$otherId = Read-Host "Paste the id of a DIFFERENT client"

$login = Invoke-RestMethod -Method Post -Uri "$url/auth/v1/token?grant_type=password" -Headers @{apikey=$key} -ContentType "application/json" -Body (@{email=$email;password=$plain}|ConvertTo-Json)
$h = @{apikey=$key; Authorization="Bearer $($login.access_token)"}
$own = (Invoke-RestMethod -Uri "$url/rest/v1/clients?select=id" -Headers $h)[0].id
if ($own -eq $otherId) { Write-Host "That is your own client id; paste a different one."; exit 1 }

function Call-Queue($clientId) {
  Invoke-RestMethod -Method Post -Uri "$url/rest/v1/rpc/approved_queue" -Headers $h -ContentType "application/json" `
    -Body (@{p_client_id=$clientId; p_tab="approved"; p_limit=50}|ConvertTo-Json)
}

Write-Host "--- 1. Another client's id (expect ok=false, not_permitted, no rows)"
$x = Call-Queue $otherId
$rows = @($x.rows).Count
Write-Host ("ok={0} error={1} rows={2} counts={3}" -f $x.ok, $x.error, $rows, ($x.counts -ne $null))
if ($x.ok -eq $false -and $x.error -eq "not_permitted" -and $rows -eq 0 -and $x.counts -eq $null) { Write-Host "RESULT: denied (GOOD)" } else { Write-Host "RESULT: LEAK (BAD)" }

Write-Host "--- 2. A client id that does not exist (expect the same denial)"
$y = Call-Queue "00000000-0000-0000-0000-000000000000"
if ($y.ok -eq $false -and $y.error -eq "not_permitted") { Write-Host "RESULT: denied (GOOD)" } else { Write-Host "RESULT: BAD: $($y | ConvertTo-Json -Depth 3 -Compress)" }

Write-Host "--- 3. Own client (expect ok=true, is_admin=false, policy_held=0, no policy-held rows)"
$z = Call-Queue $own
$heldRows = @($z.rows | Where-Object { $_.policy_held }).Count
Write-Host ("ok={0} is_admin={1} approved={2} policy_held_count={3} policy_held_rows={4}" -f $z.ok, $z.is_admin, $z.counts.approved, $z.counts.policy_held, $heldRows)
if ($z.ok -eq $true -and $z.is_admin -eq $false -and $z.counts.policy_held -eq 0 -and $heldRows -eq 0) { Write-Host "RESULT: correct (GOOD)" } else { Write-Host "RESULT: BAD" }
