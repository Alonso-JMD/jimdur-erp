param(
    [string]$Server = "",
    [string]$Database = ""
)

$ErrorActionPreference = "Stop"

function Read-JimdurConfig {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "JIMDUR\config.ini"),
        (Join-Path $PSScriptRoot "Programa\config.ini"),
        (Join-Path $PSScriptRoot "config.ini")
    )
    foreach ($candidate in $candidates) {
        if (-not (Test-Path $candidate)) { continue }
        $values = @{}
        foreach ($line in Get-Content -LiteralPath $candidate) {
            if ($line -match "^\s*([^#;][^=]*)=(.*)$") {
                $values[$matches[1].Trim().ToUpperInvariant()] = $matches[2].Trim()
            }
        }
        return $values
    }
    return @{}
}

function Convert-DataTableRows {
    param([System.Data.DataTable]$Table)
    $rows = New-Object System.Collections.Generic.List[object]
    foreach ($dataRow in $Table.Rows) {
        $item = [ordered]@{}
        foreach ($column in $Table.Columns) {
            $value = $dataRow[$column.ColumnName]
            if ($value -eq [DBNull]::Value) {
                $item[$column.ColumnName] = $null
            }
            elseif ($value -is [DateTime]) {
                $item[$column.ColumnName] = $value.ToString("o")
            }
            elseif ($value -is [byte[]]) {
                $item[$column.ColumnName] = [Convert]::ToBase64String($value)
            }
            else {
                $item[$column.ColumnName] = $value
            }
        }
        $rows.Add([pscustomobject]$item)
    }
    return $rows
}

try {
    try { $Host.UI.RawUI.WindowTitle = "JIMDUR - Exportador SQL Server" } catch {}
    try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

    Write-Host ""
    Write-Host "====================================================" -ForegroundColor DarkBlue
    Write-Host "  JIMDUR - EXPORTADOR SEGURO DE INVENTARIO" -ForegroundColor Blue
    Write-Host "====================================================" -ForegroundColor DarkBlue
    Write-Host ""
    Write-Host "Este proceso solo consulta SQL Server." -ForegroundColor DarkGreen
    Write-Host "No modifica la base y no exporta contrasenas." -ForegroundColor DarkGreen
    Write-Host ""

    $config = Read-JimdurConfig
    if ([string]::IsNullOrWhiteSpace($Server)) {
        $Server = [string]$config["SERVER"]
    }
    if ([string]::IsNullOrWhiteSpace($Database)) {
        $Database = [string]$config["DATABASE"]
    }
    if ([string]::IsNullOrWhiteSpace($Server)) {
        $Server = Read-Host "Servidor SQL (ejemplo: PC\SQLEXPRESS)"
    }
    if ([string]::IsNullOrWhiteSpace($Database)) {
        $Database = "CONTROL_INVENTARIO"
    }

    Write-Host ("Servidor: " + $Server)
    Write-Host ("Base:     " + $Database)
    Write-Host "Conectando..." -ForegroundColor DarkCyan

    $connectionString = "Data Source=$Server;Initial Catalog=$Database;Integrated Security=True;Encrypt=False;TrustServerCertificate=True;Connection Timeout=15"
    $connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)
    $connection.Open()

    $wantedTables = @("UNIDADES", "ALMACENES", "PRODUCTOS", "STOCK")
    $exportedTables = [ordered]@{}

    foreach ($tableName in $wantedTables) {
        $existsCommand = $connection.CreateCommand()
        $existsCommand.CommandText = "SELECT COUNT(*) FROM sys.tables WHERE name=@name"
        [void]$existsCommand.Parameters.Add("@name", [System.Data.SqlDbType]::NVarChar, 128)
        $existsCommand.Parameters["@name"].Value = $tableName
        if ([int]$existsCommand.ExecuteScalar() -eq 0) {
            Write-Warning ("No se encontro la tabla " + $tableName)
            continue
        }

        $columnsCommand = $connection.CreateCommand()
        $columnsCommand.CommandText = @"
SELECT c.name
FROM sys.columns c
JOIN sys.tables t ON t.object_id=c.object_id
WHERE t.name=@name
  AND UPPER(c.name) NOT LIKE '%PASSWORD%'
  AND UPPER(c.name) NOT LIKE '%HASH%'
  AND UPPER(c.name) NOT LIKE '%SALT%'
  AND UPPER(c.name) NOT LIKE '%TOKEN%'
  AND UPPER(c.name) NOT LIKE '%SECRET%'
ORDER BY c.column_id
"@
        [void]$columnsCommand.Parameters.Add("@name", [System.Data.SqlDbType]::NVarChar, 128)
        $columnsCommand.Parameters["@name"].Value = $tableName
        $reader = $columnsCommand.ExecuteReader()
        $columns = New-Object System.Collections.Generic.List[string]
        while ($reader.Read()) {
            $columns.Add([string]$reader["name"])
        }
        $reader.Close()
        if ($columns.Count -eq 0) { continue }

        $quotedColumns = ($columns | ForEach-Object { "[" + $_.Replace("]", "]]") + "]" }) -join ","
        $query = "SELECT " + $quotedColumns + " FROM [dbo].[" + $tableName.Replace("]", "]]") + "]"
        $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($query, $connection)
        $dataTable = New-Object System.Data.DataTable
        [void]$adapter.Fill($dataTable)
        $exportedTables[$tableName] = @(Convert-DataTableRows -Table $dataTable)
        Write-Host ("  OK " + $tableName + ": " + $dataTable.Rows.Count + " registros") -ForegroundColor DarkGreen
    }

    $connection.Close()

    if (-not $exportedTables.Contains("PRODUCTOS")) {
        throw "La base no contiene una tabla PRODUCTOS compatible."
    }

    $document = [ordered]@{
        format = "JIMDUR-SQL-EXPORT"
        version = 1
        metadata = [ordered]@{
            server = $Server
            database = $Database
            exportedAt = (Get-Date).ToString("o")
            computer = $env:COMPUTERNAME
            windowsUser = $env:USERNAME
            sensitiveColumnsExcluded = $true
        }
        tables = $exportedTables
    }

    $desktop = [Environment]::GetFolderPath("Desktop")
    $fileName = "JIMDUR_EXPORT_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".json"
    $outputPath = Join-Path $desktop $fileName
    $json = $document | ConvertTo-Json -Depth 12
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($outputPath, $json, $utf8)

    Write-Host ""
    Write-Host "EXPORTACION COMPLETADA" -ForegroundColor Green
    Write-Host $outputPath -ForegroundColor Blue
    Write-Host ""
    Write-Host "Ahora abre JIMDUR ERP, entra a Copias y migracion e importa este archivo."
    Start-Process explorer.exe -ArgumentList $desktop
}
catch {
    Write-Host ""
    Write-Host "NO SE PUDO EXPORTAR" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Verifica que SQL Server este encendido y que JIMDUR funcione en esta PC."
}
finally {
    Write-Host ""
    Write-Host "Regresando al asistente de JIMDUR..."
}
