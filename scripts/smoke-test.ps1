$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000/api/v1'
$script:results = New-Object System.Collections.Generic.List[object]

function Add-Result($Name, $Status, $Ok, $Detail = '') {
  $script:results.Add([pscustomobject]@{ Name = $Name; Status = $Status; Ok = [bool]$Ok; Detail = $Detail })
}

function Unwrap-Data($obj) {
  if ($null -eq $obj) { return $null }
  if ($obj.PSObject.Properties.Name -contains 'data') { return $obj.data }
  return $obj
}

function Invoke-Api {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers = @{},
    [string]$Body = $null,
    [int[]]$Accept = @(200, 201)
  )
  try {
    $params = @{
      Method = $Method
      Uri = "$base$Path"
      Headers = $Headers
      UseBasicParsing = $true
    }
    if ($Body) {
      $params.ContentType = 'application/json'
      $params.Body = $Body
    }
    $resp = Invoke-WebRequest @params
    $ok = $Accept -contains [int]$resp.StatusCode
    Add-Result $Name $resp.StatusCode $ok ''
    if ($resp.Content) {
      $json = $resp.Content | ConvertFrom-Json
      return (Unwrap-Data $json)
    }
    return $null
  } catch {
    $code = 0
    $msg = $_.Exception.Message
    if ($_.Exception.Response) {
      $code = [int]$_.Exception.Response.StatusCode
    }
    if ($_.ErrorDetails.Message) { $msg = $_.ErrorDetails.Message }
    $ok = $Accept -contains $code
    $detail = if ($msg.Length -gt 140) { $msg.Substring(0, 140) } else { $msg }
    Add-Result $Name $code $ok $detail
    return $null
  }
}

Write-Host 'Running IMMS meal-api smoke tests (api/v1)...'

$login = Invoke-Api 'AUTH.login' 'POST' '/auth/login' @{} '{"email":"superadmin@insa.gov.et","password":"ChangeMe!123"}'
if (-not $login -or -not $login.accessToken) {
  Write-Host 'FATAL: login failed'
  $script:results | Format-Table -AutoSize
  exit 1
}

$token = $login.accessToken
$orgId = $login.user.defaultOrganizationId
$h = @{ Authorization = "Bearer $token" }

Invoke-Api 'AUTH.me' 'GET' '/auth/me' $h | Out-Null
Invoke-Api 'SEC.noToken' 'GET' '/campuses' @{} $null @(401) | Out-Null

$orgs = Invoke-Api 'ORG.list' 'GET' '/organizations' $h
$campuses = Invoke-Api 'CAMPUS.list' 'GET' "/campuses?organizationId=$orgId" $h
$programs = Invoke-Api 'PROGRAM.list' 'GET' "/programs?organizationId=$orgId" $h
$years = Invoke-Api 'YEAR.list' 'GET' "/academic-years?organizationId=$orgId" $h
$students = Invoke-Api 'STUDENT.list' 'GET' "/students?organizationId=$orgId&page=1&limit=20" $h
Invoke-Api 'STUDENT.search' 'GET' "/students/search?q=DEMO&organizationId=$orgId" $h | Out-Null
Invoke-Api 'STUDENT.barcode' 'GET' "/students/barcode/DEMO-1001-26?organizationId=$orgId" $h | Out-Null
Invoke-Api 'USER.list' 'GET' '/users' $h | Out-Null
Invoke-Api 'MENTOR.list' 'GET' '/mentors' $h | Out-Null
Invoke-Api 'ROLE.list' 'GET' '/roles' $h | Out-Null
$dash = Invoke-Api 'DASH.summary' 'GET' "/dashboard/summary?organizationId=$orgId" $h
Invoke-Api 'MEAL.sessions' 'GET' "/meals/sessions?organizationId=$orgId" $h | Out-Null
Invoke-Api 'MEAL_SESSIONS.list' 'GET' "/meal-sessions?organizationId=$orgId" $h | Out-Null
Invoke-Api 'MEAL.history' 'GET' "/meals/history?organizationId=$orgId&page=1&limit=20" $h | Out-Null
Invoke-Api 'MEAL.stats' 'GET' "/meals/today-stats?organizationId=$orgId" $h | Out-Null
Invoke-Api 'MEAL.verify' 'POST' '/meals/verify' $h (@{ barcode = 'DEMO-1001-26'; organizationId = $orgId } | ConvertTo-Json) | Out-Null
Invoke-Api 'IMPORT.history' 'GET' "/import/history?organizationId=$orgId" $h | Out-Null
Invoke-Api 'REPORT.daily' 'GET' "/reports/daily?organizationId=$orgId" $h | Out-Null
Invoke-Api 'REPORT.meals' 'GET' "/reports/meals?organizationId=$orgId" $h | Out-Null
Invoke-Api 'AUDIT.list' 'GET' '/audit-logs?page=1&limit=20' $h | Out-Null
Invoke-Api 'SETTINGS.list' 'GET' "/settings?organizationId=$orgId" $h | Out-Null

# Attendance must not exist
Invoke-Api 'ATT.gone' 'GET' '/attendance' $h $null @(404) | Out-Null

$now = Get-Date
$sessionBody = @{
  organizationId = $orgId
  code = 'DINNER'
  name = 'Dinner'
  startTime = '{0:D2}:00' -f $now.Hour
  endTime = '{0:D2}:59' -f $now.Hour
  gracePeriod = 0
  sortOrder = 3
  isActive = $true
} | ConvertTo-Json
Invoke-Api 'MEAL.sessionUpsert' 'PUT' '/meals/sessions' $h $sessionBody | Out-Null

$mealBody = @{ barcode = 'DEMO-1001-26'; organizationId = $orgId } | ConvertTo-Json
# 409 = duplicate blocked (Rule 5) — valid on re-runs the same day
Invoke-Api 'MEAL.serve' 'POST' '/meals/serve' $h $mealBody @(200, 201, 409) | Out-Null
$overrideBody = @{
  barcode = 'DEMO-1001-26'
  organizationId = $orgId
  override = $true
  overrideReason = 'Smoke re-serve'
} | ConvertTo-Json
Invoke-Api 'MEAL.serveOverride' 'POST' '/meals/serve' $h $overrideBody @(200, 201) | Out-Null

$fail = @($script:results | Where-Object { -not $_.Ok })
$pass = @($script:results | Where-Object { $_.Ok })
Write-Host "==== RESULTS: $($pass.Count) passed, $($fail.Count) failed of $($script:results.Count) ===="
$script:results | Format-Table -AutoSize
if ($fail.Count -gt 0) {
  $fail | Format-Table -AutoSize
  exit 1
}

$studentTotal = if ($students -is [array]) { $students.Count } elseif ($null -ne $students) { 1 } else { 0 }
# list unwrap may return array (data) when paginated
Write-Host "ORG=$orgId STUDENTS~$studentTotal MEALS_TODAY=$($dash.mealsServedToday)"
exit 0
