# Mint a Shopify Admin API access token (shpat_...) for an app you already
# installed on a store via Partner Dashboard.
#
# Run from the VS Code PowerShell terminal:
#   .\scripts\mint-shopify-token.ps1

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Web

$shop = Read-Host "Shop domain (xxx.myshopify.com)"
$clientId = Read-Host "Client ID (API key)"
$clientSecret = Read-Host "Client Secret (API secret)"

if ([string]::IsNullOrWhiteSpace($shop) -or [string]::IsNullOrWhiteSpace($clientId) -or [string]::IsNullOrWhiteSpace($clientSecret)) {
    Write-Host "All three values are required." -ForegroundColor Red
    exit 1
}

$shop = $shop.Trim().ToLower()
if ($shop -notmatch '\.myshopify\.com$') {
    Write-Host "Shop must end in .myshopify.com (e.g. blackvaultapparel.myshopify.com)" -ForegroundColor Red
    exit 1
}

$scopes = "read_products,write_products,read_files,write_files,read_orders,read_themes,write_themes,read_content,write_content"
$state  = [guid]::NewGuid().ToString("N")

# This redirect URI MUST exist in your Partner Dashboard app's "Allowed
# redirection URLs". If yours uses a different one, edit this line.
$redirectUri = "https://example.com/callback"

# Build the authorization URL using a UriBuilder to avoid manually concatenating
# query strings with ampersands (PowerShell's parser dislikes raw "and" symbols
# in source even inside quoted strings on some installs).
$query = [System.Web.HttpUtility]::ParseQueryString([string]::Empty)
$query.Add("client_id", $clientId)
$query.Add("scope", $scopes)
$query.Add("redirect_uri", $redirectUri)
$query.Add("state", $state)

$builder = New-Object System.UriBuilder
$builder.Scheme = "https"
$builder.Host   = $shop
$builder.Path   = "/admin/oauth/authorize"
$builder.Query  = $query.ToString()
$authUrl = $builder.Uri.AbsoluteUri

Write-Host ""
Write-Host "Step 1: opening this URL in your browser..." -ForegroundColor Cyan
Write-Host $authUrl -ForegroundColor DarkGray
Write-Host ""
Write-Host "Step 2: in Partner Dashboard, this redirect URI must be in"
Write-Host "        'Allowed redirection URLs':"
Write-Host "        $redirectUri" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Step 3: click 'Install app' / 'Update app' / approve in the browser."
Write-Host "Step 4: the browser will redirect to $redirectUri (will probably 404)."
Write-Host "        Copy the ENTIRE URL from the browser address bar."
Write-Host ""

Start-Process $authUrl

$pastedUrl = Read-Host "Paste the redirect URL you ended up on"

# Parse the pasted URL with the .NET Uri class so we don't have to handle
# query string parsing manually.
try {
    $uri = [System.Uri]$pastedUrl
} catch {
    Write-Host "That doesn't look like a valid URL." -ForegroundColor Red
    Write-Host "Pasted: $pastedUrl"
    exit 1
}

$queryParams = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
$code = $queryParams.Get("code")

if ([string]::IsNullOrWhiteSpace($code)) {
    Write-Host "Could not find 'code' parameter in the pasted URL." -ForegroundColor Red
    Write-Host "Available keys in the URL: $($queryParams.AllKeys -join ', ')"
    exit 1
}

Write-Host "Got code." -ForegroundColor Green
Write-Host ""
Write-Host "Exchanging code for access token..." -ForegroundColor Cyan

$body = @{
    client_id     = $clientId
    client_secret = $clientSecret
    code          = $code
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://$shop/admin/oauth/access_token" -Method POST -Body $body -ContentType "application/json"
} catch {
    Write-Host "Token exchange failed:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
    exit 1
}

if (-not $response.access_token) {
    Write-Host "No access_token in response:" -ForegroundColor Red
    Write-Host ($response | ConvertTo-Json -Depth 4)
    exit 1
}

Write-Host ""
Write-Host "===================== ACCESS TOKEN =====================" -ForegroundColor Green
Write-Host $response.access_token
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Granted scopes: $($response.scope)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Add to .env.local:"
Write-Host "  SHOPIFY_BLACKVAULT_API_KEY=$($response.access_token)" -ForegroundColor Yellow
Write-Host "  SHOPIFY_BLACKVAULT_STORE_DOMAIN=$shop" -ForegroundColor Yellow
