#!/usr/bin/env php
<?php
/**
 * Migrate historical data URLs for the production database.
 * Dry-run by default. CLI only; no database or files are changed without --apply.
 *
 * Usage:
 *   php migrate-historical-data-urls-production.php \
 *     --wp-load=/absolute/path/to/public_html/wp-load.php \
 *     --production-db=u647623496_us4JX [--batch-size=50]
 *
 * Apply requires all of: --apply, --production-db=<exact DB name>, and
 * --production. For apply, wp-load.php must resolve inside the production
 * document root and the active WordPress DB must match --production-db exactly.
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

$options = getopt('', array('wp-load:', 'batch-size::', 'apply', 'production-db:', 'production', 'help'));
if (isset($options['help']) || empty($options['wp-load']) || empty($options['production-db'])) {
    fwrite(STDOUT, "Usage: php migrate-historical-data-urls-production.php --wp-load=/home/u647623496/private-tools/wp-load-production-isolated.php --production-db=DATABASE_NAME [--batch-size=50] [--apply --production]\n");
    fwrite(STDOUT, "Dry-run is the default. Apply requires --apply, --production-db=<exact DB name>, and --production together. The active DB must match exactly.\n");
    fwrite(STDOUT, "For apply, --wp-load must be the canonical production wp-load.php or private isolated production bootstrap.\n");
    exit(isset($options['help']) ? 0 : 1);
}

$load = realpath($options['wp-load']);
if (!$load || (basename($load) !== 'wp-load.php' && str_replace('\\', '/', $load) !== '/home/u647623496/private-tools/wp-load-production-isolated.php')) {
    fwrite(STDERR, "--wp-load must resolve to an existing wp-load.php.\n");
    exit(1);
}

$apply = isset($options['apply']);
$expectedDb = (string) $options['production-db'];
if ($apply && !isset($options['production'])) {
    fwrite(STDERR, "Refusing --apply: require --apply, --production-db=<exact DB name>, and --production together.\n");
    exit(1);
}

$canonicalLoad = str_replace('\\', '/', $load);
$allowedProductionLoads = array(
    '/home/u647623496/domains/cokifimi.org/public_html/wp-load.php',
    '/home/u647623496/private-tools/wp-load-production-isolated.php',
);
if ($apply && !in_array($canonicalLoad, $allowedProductionLoads, true)) {
    fwrite(STDERR, "Refusing --apply: --wp-load must be the production wp-load.php or the private isolated production bootstrap.\n");
    exit(1);
}

$batchSize = isset($options['batch-size']) ? (int) $options['batch-size'] : 50;
if ($batchSize < 1 || $batchSize > 500) {
    fwrite(STDERR, "--batch-size must be between 1 and 500.\n");
    exit(1);
}

require_once $load;

global $wpdb;
$table = $wpdb->prefix . 'cokifimi_dj_records';
$expectedRoot = realpath('/home/u647623496/domains/cokifimi.org/public_html');
$activeRoot = defined('ABSPATH') ? realpath(ABSPATH) : false;
if (!$expectedRoot || !$activeRoot || $activeRoot !== $expectedRoot) {
    fwrite(STDERR, "Refusing: WordPress ABSPATH is not the production document root. No changes made.\n");
    exit(1);
}
$currentDb = (string) $wpdb->get_var('SELECT DATABASE()');
if ($currentDb === '' || !hash_equals($expectedDb, $currentDb)) {
    fwrite(STDERR, "Refusing: connected WordPress DB does not exactly match --production-db (active DB: " . ($currentDb !== '' ? $currentDb : '(unknown)') . "). No changes made.\n");
    exit(1);
}

if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) !== $table) {
    fwrite(STDERR, "Table not found: {$table}\n");
    exit(1);
}

if ($apply) {
    $uploads = wp_upload_dir();
    $uploadsPath = !empty($uploads['basedir']) ? realpath($uploads['basedir']) : false;
    $uploadsHost = !empty($uploads['baseurl']) ? strtolower((string) wp_parse_url($uploads['baseurl'], PHP_URL_HOST)) : '';
    $canonicalUploadsPath = $uploadsPath ? str_replace('\\', '/', $uploadsPath) : '';
    if (!empty($uploads['error']) || $uploadsHost !== 'cokifimi.org' || !preg_match('~/public_html/wp-content/uploads$~D', $canonicalUploadsPath)) {
        fwrite(STDERR, "Refusing --apply: uploads must resolve to production /public_html/wp-content/uploads and use the cokifimi.org host. No changes made.\n");
        exit(1);
    }
}

function cokifimi_hdu_prod_walk($value, $recordId, $apply, &$stats, &$createdFiles, &$invalidHeaders)
{
    if (is_array($value)) {
        foreach ($value as $key => $item) {
            $value[$key] = cokifimi_hdu_prod_walk($item, $recordId, $apply, $stats, $createdFiles, $invalidHeaders);
        }
        return $value;
    }

    if (!is_string($value) || strpos($value, 'data:') !== 0) {
        return $value;
    }

    if (!preg_match('~^data:([a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+)((?:;[a-zA-Z0-9!#$&^_.+-]+(?:=[^;,\r\n]*)?)*)?;base64,(.*)$~sD', $value, $matches)) {
        $stats['invalid_format']++;
        $header = strstr($value, ',', true);
        if ($header === false) {
            $header = $value;
        }
        $header = substr($header, 0, 120);
        $invalidHeaders[$header] = ($invalidHeaders[$header] ?? 0) + 1;
        return $value;
    }

    $extensions = array(
        'application/pdf' => 'pdf',
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/gif' => 'gif',
        'image/webp' => 'webp',
        'image/bmp' => 'bmp',
        'image/tiff' => 'tiff',
        'application/x-zip-compressed' => 'zip',
        'image/heic' => 'heic',
        'message/rfc822' => 'eml',
    );

    $mime = strtolower($matches[1]);
    if (!isset($extensions[$mime])) {
        $stats['unsupported_mime']++;
        $stats['unsupported_mimes'][$mime] = ($stats['unsupported_mimes'][$mime] ?? 0) + 1;
        return $value;
    }

    $base64 = preg_replace('/\s+/', '', $matches[3]);
    if ($base64 === '') {
        $stats['empty_data']++;
        return $value;
    }

    $binary = base64_decode($base64, true);
    if ($binary === false) {
        $stats['invalid_base64']++;
        return $value;
    }

    $stats['files']++;
    $stats['bytes'] += strlen($binary);
    $uploads = wp_upload_dir();
    if (!empty($uploads['error'])) {
        throw new RuntimeException($uploads['error']);
    }

    $relativeDir = 'cokifimi-historical';
    $directory = trailingslashit($uploads['basedir']) . $relativeDir;
    $hash = hash('sha256', $binary);
    $filename = sanitize_file_name($recordId . '-' . $hash . '.' . $extensions[$mime]);
    $path = trailingslashit($directory) . $filename;
    if (!$apply) {
        if (file_exists($path)) {
            $existingHash = is_file($path) ? hash_file('sha256', $path) : false;
            if (!is_string($existingHash) || !hash_equals($existingHash, $hash)) {
                $stats['conflicting_files']++;
            } else {
                $stats['existing_files']++;
            }
        } else {
            $stats['missing_files']++;
        }
        return '__COKIFIMI_MIGRATION_URL__';
    }

    if (!wp_mkdir_p($directory)) {
        throw new RuntimeException('Could not create uploads directory.');
    }

    if (file_exists($path)) {
        if (!is_file($path) || !hash_equals(hash_file('sha256', $path), $hash)) {
            throw new RuntimeException('Conflicting destination file.');
        }
    } else {
        $written = file_put_contents($path, $binary, LOCK_EX);
        if ($written !== strlen($binary)) {
            throw new RuntimeException('Could not write upload file.');
        }
        $createdFiles[] = $path;
    }

    return trailingslashit($uploads['baseurl']) . $relativeDir . '/' . rawurlencode($filename);
}

fwrite(STDOUT, sprintf(
    "Mode: %s | DB: %s | environment: %s | batch size: %d\n",
    $apply ? 'APPLY' : 'DRY RUN',
    $currentDb,
    function_exists('wp_get_environment_type') ? wp_get_environment_type() : '(unavailable)',
    $batchSize
));

$lastRecordId = '';
$totals = array(
    'records' => 0,
    'changed' => 0,
    'files' => 0,
    'bytes' => 0,
    'existing_files' => 0,
    'missing_files' => 0,
    'conflicting_files' => 0,
    'invalid_format' => 0,
    'invalid_headers' => array(),
    'unsupported_mime' => 0,
    'invalid_base64' => 0,
    'empty_data' => 0,
    'unsupported_mimes' => array(),
    'errors' => 0,
);

do {
    $sql = $wpdb->prepare(
        "SELECT record_id, payload
         FROM {$table}
         WHERE record_id > %s
           AND payload LIKE %s
         ORDER BY record_id ASC
         LIMIT %d",
        $lastRecordId,
        '%base64,%',
        $batchSize
    );
    $rows = $wpdb->get_results($sql);
    if (!is_array($rows)) {
        fwrite(STDERR, "Database read failed; stopping without processing this batch.\n");
        exit(2);
    }

    foreach ($rows as $row) {
        $lastRecordId = (string) $row->record_id;
        $totals['records']++;
        $payload = json_decode($row->payload, true);
        if (!is_array($payload)) {
            $totals['errors']++;
            fwrite(STDERR, sprintf("Record %s: invalid JSON; skipped.\n", $lastRecordId));
            continue;
        }

        $stats = array(
            'files' => 0,
            'bytes' => 0,
            'existing_files' => 0,
            'missing_files' => 0,
            'conflicting_files' => 0,
            'invalid_format' => 0,
            'unsupported_mime' => 0,
            'invalid_base64' => 0,
            'empty_data' => 0,
            'unsupported_mimes' => array(),
        );
        $createdFiles = array();
        $invalidHeaders = array();

        try {
            $updatedPayload = cokifimi_hdu_prod_walk($payload, $lastRecordId, $apply, $stats, $createdFiles, $invalidHeaders);
            foreach (array('files', 'bytes', 'existing_files', 'missing_files', 'conflicting_files', 'invalid_format', 'unsupported_mime', 'invalid_base64', 'empty_data') as $key) {
                $totals[$key] += $stats[$key];
            }
            foreach ($invalidHeaders as $header => $count) {
                $totals['invalid_headers'][$header] = ($totals['invalid_headers'][$header] ?? 0) + $count;
            }
            foreach ($stats['unsupported_mimes'] as $mime => $count) {
                $totals['unsupported_mimes'][$mime] = ($totals['unsupported_mimes'][$mime] ?? 0) + $count;
            }

            if ($stats['files'] === 0) {
                continue;
            }

            if ($apply) {
                $json = wp_json_encode($updatedPayload);
                if ($json === false) {
                    throw new RuntimeException('Could not encode updated payload.');
                }
                $updated = $wpdb->query($wpdb->prepare(
                    "UPDATE {$table} SET payload = %s WHERE record_id = %s AND payload = %s",
                    $json,
                    $lastRecordId,
                    $row->payload
                ));
                if ($updated !== 1) {
                    throw new RuntimeException('Payload changed concurrently; record left untouched.');
                }
            }

            $totals['changed']++;
            fwrite(STDOUT, sprintf(
                "Record %s: %d file(s) %s.\n",
                $lastRecordId,
                $stats['files'],
                $apply ? 'migrated' : 'would migrate'
            ));
        } catch (Throwable $error) {
            foreach ($createdFiles as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
            $totals['errors']++;
            fwrite(STDERR, sprintf("Record %s: %s\n", $lastRecordId, $error->getMessage()));
        }
    }
} while (count($rows) === $batchSize);

fwrite(STDOUT, sprintf(
    "Done. Records scanned: %d; payloads %s: %d; attachments: %d; bytes: %d; existing file refs: %d; missing file refs: %d; conflicting file refs: %d; errors: %d.\n",
    $totals['records'],
    $apply ? 'updated' : 'that would change',
    $totals['changed'],
    $totals['files'],
    $totals['bytes'],
    $totals['existing_files'],
    $totals['missing_files'],
    $totals['conflicting_files'],
    $totals['errors']
));
fwrite(STDOUT, sprintf(
    "Invalid data URLs (payloads hidden):\ninvalid_format=%d\nunsupported_mime=%d\ninvalid_base64=%d\nempty_data=%d\n",
    $totals['invalid_format'],
    $totals['unsupported_mime'],
    $totals['invalid_base64'],
    $totals['empty_data']
));

if ($totals['invalid_headers']) {
    ksort($totals['invalid_headers']);
    fwrite(STDOUT, "Invalid format headers:\n");
    foreach ($totals['invalid_headers'] as $header => $count) {
        fwrite(STDOUT, sprintf("- %s: %d\n", $header, $count));
    }
}

if ($totals['unsupported_mimes']) {
    ksort($totals['unsupported_mimes']);
    fwrite(STDOUT, "Unsupported MIME:\n");
    foreach ($totals['unsupported_mimes'] as $mime => $count) {
        fwrite(STDOUT, sprintf("- %s: %d\n", $mime, $count));
    }
}

if (!$apply) {
    fwrite(STDOUT, "Dry run only: no files or database rows were changed. Do not use --apply until the report and backup are verified.\n");
}

exit($totals['errors'] ? 2 : 0);
