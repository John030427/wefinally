param(
  [ValidateSet(
    'WXPAY_ENABLED',
    'WXPAY_APP_ID',
    'WXPAY_MCH_ID',
    'WXPAY_MERCHANT_SERIAL_NO',
    'WXPAY_MERCHANT_PRIVATE_KEY_BASE64',
    'WXPAY_PUBLIC_KEY_ID',
    'WXPAY_PUBLIC_KEY_BASE64',
    'PAYMENT_STAGE',
    'PAYMENT_TEST_AMOUNT_FEN'
  )]
  [string]$Name,
  [switch]$Check
)

$ErrorActionPreference = 'Stop'

$projectParent = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$paymentDirs = @(Get-ChildItem -LiteralPath $projectParent -Directory | Where-Object {
  Test-Path -LiteralPath (Join-Path $_.FullName 'pub_key.pem') -PathType Leaf
})
if ($paymentDirs.Count -ne 1) {
  throw "Expected one payment credential directory, found $($paymentDirs.Count)"
}
$paymentDir = $paymentDirs[0].FullName
$publicKeyPath = Join-Path $paymentDir 'pub_key.pem'
$merchantPrivateKeys = @(Get-ChildItem -LiteralPath $paymentDir -Recurse -File -Filter 'apiclient_key.pem')
$merchantCertificates = @(Get-ChildItem -LiteralPath $paymentDir -Recurse -File -Filter 'apiclient_cert.pem')

if (-not (Test-Path -LiteralPath $publicKeyPath -PathType Leaf)) {
  throw 'Missing WeChat Pay public key pub_key.pem'
}
if ($merchantPrivateKeys.Count -ne 1) {
  throw "Expected one merchant private key apiclient_key.pem, found $($merchantPrivateKeys.Count)"
}
if ($merchantCertificates.Count -ne 1) {
  throw "Expected one merchant certificate apiclient_cert.pem, found $($merchantCertificates.Count)"
}

$publicPem = Get-Content -Raw -LiteralPath $publicKeyPath
$privatePem = Get-Content -Raw -LiteralPath $merchantPrivateKeys[0].FullName
$serialLine = & openssl x509 -in $merchantCertificates[0].FullName -noout -serial
if ($LASTEXITCODE -ne 0 -or $serialLine -notmatch '^serial=([0-9A-Fa-f]+)$') {
  throw 'Unable to read the merchant certificate serial with openssl'
}
$merchantSerial = $Matches[1].ToUpperInvariant()

if ($publicPem -notmatch '-----BEGIN PUBLIC KEY-----') {
  throw 'pub_key.pem is not a public-key PEM file'
}
if ($privatePem -notmatch '-----BEGIN PRIVATE KEY-----') {
  throw 'apiclient_key.pem is not a private-key PEM file'
}
if ($merchantSerial -ne '3AF25390241003BF601241DFBC51C659070061D7') {
  throw 'Merchant API certificate serial does not match the confirmed value'
}

$utf8 = [Text.UTF8Encoding]::new($false)
$values = @{
  WXPAY_ENABLED = 'true'
  WXPAY_APP_ID = 'wx91c6559ea4490a29'
  WXPAY_MCH_ID = '1747991634'
  WXPAY_MERCHANT_SERIAL_NO = $merchantSerial
  WXPAY_MERCHANT_PRIVATE_KEY_BASE64 = [Convert]::ToBase64String($utf8.GetBytes($privatePem))
  WXPAY_PUBLIC_KEY_ID = 'PUB_KEY_ID_0117479916342026071000291646004203'
  WXPAY_PUBLIC_KEY_BASE64 = [Convert]::ToBase64String($utf8.GetBytes($publicPem))
  PAYMENT_STAGE = 'test'
  PAYMENT_TEST_AMOUNT_FEN = '1'
}

if ($Check -or -not $Name) {
  Write-Host 'Local WeChat Pay credential check passed.'
  Write-Host 'Manual values still required: WXPAY_API_V3_KEY and WXPAY_NOTIFY_URL.'
  Write-Host 'First device test: PAYMENT_STAGE=test and PAYMENT_TEST_AMOUNT_FEN=1.'
  exit 0
}

Set-Clipboard -Value $values[$Name]
Write-Host "Copied $Name to the clipboard without printing its value."
