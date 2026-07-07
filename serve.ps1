param([int]$Port = 8123)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
$root = $PSScriptRoot
Write-Host "Serving $root at http://localhost:$Port/"
$mime = @{ '.html' = 'text/html'; '.js' = 'application/javascript'; '.css' = 'text/css'; '.png' = 'image/png'; '.ico' = 'image/x-icon' }
while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
        $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
        if ($ctx.Request.HttpMethod -eq 'POST' -and $path -eq 'upload') {
            $reader = New-Object IO.StreamReader($ctx.Request.InputStream)
            $b64 = $reader.ReadToEnd() -replace '^data:image/\w+;base64,', ''
            [IO.File]::WriteAllBytes((Join-Path $root 'capture.jpg'), [Convert]::FromBase64String($b64))
            $ctx.Response.StatusCode = 200
            $ctx.Response.Close()
            continue
        }
        if ($path -eq '') { $path = 'index.html' }
        $file = Join-Path $root $path
        if ((Test-Path $file -PathType Leaf) -and ([IO.Path]::GetFullPath($file)).StartsWith($root)) {
            $bytes = [IO.File]::ReadAllBytes($file)
            $ext = [IO.Path]::GetExtension($file).ToLower()
            if ($mime[$ext]) { $ctx.Response.ContentType = $mime[$ext] } else { $ctx.Response.ContentType = 'application/octet-stream' }
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        else { $ctx.Response.StatusCode = 404 }
        $ctx.Response.Close()
    }
    catch { }
}
