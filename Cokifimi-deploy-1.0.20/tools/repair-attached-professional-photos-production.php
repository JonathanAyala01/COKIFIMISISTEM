#!/usr/bin/env php
<?php
/**
 * Completes missing photos for attached professionals in the production DB.
 * Dry-run by default. CLI only; only payload may be updated with --apply.
 *
 * Usage:
 *   php repair-attached-professional-photos-production.php \
 *     --wp-load=/absolute/path/to/public_html/wp-load.php \
 *     --production-db=u647623496_us4JX [--batch-size=50]
 *
 * Apply requires --apply --production-db=<exact DB name> --production, the
 * connected database must match exactly, and wp-load.php must resolve to the
 * production document root.
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

$options = getopt('', array('wp-load:', 'batch-size::', 'apply', 'production-db:', 'production', 'help'));
if (isset($options['help']) || empty($options['wp-load']) || empty($options['production-db'])) {
    fwrite(STDOUT, "Usage: php repair-attached-professional-photos-production.php --wp-load=/home/u647623496/private-tools/wp-load-production-isolated.php --production-db=DATABASE_NAME [--batch-size=50] [--apply --production]\n");
    fwrite(STDOUT, "Dry-run is the default. Apply requires --apply --production-db=<exact DB name> --production. The connected DB must match exactly.\n");
    fwrite(STDOUT, "For apply, --wp-load must be the canonical production wp-load.php or private isolated production bootstrap.\n");
    exit(isset($options['help']) ? 0 : 1);
}

$wpLoad = realpath($options['wp-load']);
if (!$wpLoad || (basename($wpLoad) !== 'wp-load.php' && str_replace('\\', '/', $wpLoad) !== '/home/u647623496/private-tools/wp-load-production-isolated.php')) {
    fwrite(STDERR, "--wp-load must resolve to an existing wp-load.php.\n");
    exit(1);
}

$apply = isset($options['apply']);
$expectedDb = (string) $options['production-db'];
if ($apply && !isset($options['production'])) {
    fwrite(STDERR, "Refusing --apply: require --apply --production-db=<exact DB name> --production together.\n");
    exit(1);
}

$canonicalWpLoad = str_replace('\\', '/', $wpLoad);
$allowedProductionLoads = array(
    '/home/u647623496/domains/cokifimi.org/public_html/wp-load.php',
    '/home/u647623496/private-tools/wp-load-production-isolated.php',
);
if ($apply && !in_array($canonicalWpLoad, $allowedProductionLoads, true)) {
    fwrite(STDERR, "Refusing --apply: --wp-load must be the production wp-load.php or the private isolated production bootstrap.\n");
    exit(1);
}

$batchSize = isset($options['batch-size']) ? (int) $options['batch-size'] : 50;
if ($batchSize < 1 || $batchSize > 500) {
    fwrite(STDERR, "--batch-size must be between 1 and 500.\n");
    exit(1);
}

require_once $wpLoad;

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
    fwrite(STDERR, "Records table not found: {$table}\n");
    exit(1);
}

function cokifimi_repair_prod_normalize_matricula($value)
{
    $digits = preg_replace('/\D+/', '', (string) $value);
    $normalized = ltrim($digits, '0');
    return $normalized === '' && $digits !== '' ? '0' : $normalized;
}

function cokifimi_repair_prod_is_http_url($value)
{
    return is_string($value) && preg_match('~^https?://~i', trim($value)) === 1;
}

function cokifimi_repair_prod_form_photos(&$form, $professionalIndex, &$summary)
{
    if (!is_array($form)) {
        return false;
    }

    $changed = false;
    for ($slot = 1; $slot <= 8; $slot++) {
        $suffix = $slot === 1 ? '' : (string) $slot;
        $matriculaKey = 'adjuntoMatricula' . $suffix;
        $photoKey = 'adjuntoFotoUrl' . $suffix;
        $matricula = cokifimi_repair_prod_normalize_matricula($form[$matriculaKey] ?? '');
        if ($matricula === '') {
            continue;
        }

        $summary['associations_scanned']++;
        if (isset($form[$photoKey]) && trim((string) $form[$photoKey]) !== '') {
            $summary['already_populated']++;
            continue;
        }
        if (!isset($professionalIndex[$matricula])) {
            $summary['missing_professional']++;
            continue;
        }

        $photoUrl = $professionalIndex[$matricula]['photo_url'];
        if (!cokifimi_repair_prod_is_http_url($photoUrl)) {
            $summary['professional_without_photo']++;
            continue;
        }

        $form[$photoKey] = trim($photoUrl);
        $summary['photos_filled']++;
        $changed = true;
    }

    return $changed;
}

function cokifimi_repair_prod_record_forms(&$payload, $professionalIndex, &$summary)
{
    if (!is_array($payload)) {
        return false;
    }

    $changed = false;
    if (isset($payload['formularioHabilitacionConsultorio']) && is_array($payload['formularioHabilitacionConsultorio'])) {
        $changed = cokifimi_repair_prod_form_photos($payload['formularioHabilitacionConsultorio'], $professionalIndex, $summary) || $changed;
    }
    if (isset($payload['consultorioSolicitudes']) && is_array($payload['consultorioSolicitudes'])) {
        foreach ($payload['consultorioSolicitudes'] as &$request) {
            if (is_array($request) && isset($request['formularioHabilitacionConsultorio']) && is_array($request['formularioHabilitacionConsultorio'])) {
                $changed = cokifimi_repair_prod_form_photos($request['formularioHabilitacionConsultorio'], $professionalIndex, $summary) || $changed;
            }
        }
        unset($request);
    }

    return $changed;
}

function cokifimi_repair_prod_fetch_batch($table, $afterId, $limit)
{
    global $wpdb;
    $sql = $wpdb->prepare(
        "SELECT record_id, payload
         FROM {$table}
         WHERE record_id > %s
         ORDER BY record_id ASC
         LIMIT %d",
        $afterId,
        $limit
    );
    $rows = $wpdb->get_results($sql);
    return is_array($rows) ? $rows : false;
}

// Pass one builds a compact normalized-matricula => photo URL index.
$professionalIndex = array();
$lastId = '';
$indexErrors = 0;
do {
    $batch = cokifimi_repair_prod_fetch_batch($table, $lastId, $batchSize);
    if ($batch === false) {
        fwrite(STDERR, "Database read failed while building the professional index. No changes made.\n");
        exit(2);
    }
    foreach ($batch as $row) {
        $lastId = (string) $row->record_id;
        $payload = json_decode((string) $row->payload, true);
        if (!is_array($payload)) {
            $indexErrors++;
            continue;
        }

        $matricula = cokifimi_repair_prod_normalize_matricula($payload['matricula'] ?? '');
        if ($matricula === '') {
            continue;
        }
        $photoUrl = cokifimi_repair_prod_is_http_url($payload['fotoUrl'] ?? null) ? trim($payload['fotoUrl']) : '';
        if (!isset($professionalIndex[$matricula])) {
            $professionalIndex[$matricula] = array('photo_url' => $photoUrl);
        } elseif ($professionalIndex[$matricula]['photo_url'] === '' && $photoUrl !== '') {
            $professionalIndex[$matricula]['photo_url'] = $photoUrl;
        }
    }
} while (count($batch) === $batchSize);

$summary = array(
    'records_scanned' => 0,
    'associations_scanned' => 0,
    'photos_filled' => 0,
    'already_populated' => 0,
    'missing_professional' => 0,
    'professional_without_photo' => 0,
    'errors' => $indexErrors,
);
fwrite(STDOUT, sprintf("Mode: %s | DB: %s | batch size: %d\n", $apply ? 'APPLY' : 'DRY RUN', $currentDb, $batchSize));

// Pass two processes every row and changes only payload when --apply is explicit.
$lastId = '';
do {
    $batch = cokifimi_repair_prod_fetch_batch($table, $lastId, $batchSize);
    if ($batch === false) {
        fwrite(STDERR, "Database read failed while scanning records.\n");
        $summary['errors']++;
        break;
    }
    foreach ($batch as $row) {
        $lastId = (string) $row->record_id;
        $summary['records_scanned']++;
        $payload = json_decode((string) $row->payload, true);
        if (!is_array($payload)) {
            continue; // Counted during index creation.
        }

        $photosBefore = $summary['photos_filled'];
        $changed = cokifimi_repair_prod_record_forms($payload, $professionalIndex, $summary);
        if (!$changed || !$apply) {
            continue;
        }

        $encoded = wp_json_encode($payload);
        if ($encoded === false) {
            $summary['errors']++;
            $summary['photos_filled'] = $photosBefore;
            continue;
        }

        $updated = $wpdb->query($wpdb->prepare(
            "UPDATE {$table}
             SET payload = %s
             WHERE record_id = %s
               AND payload = %s",
            $encoded,
            $lastId,
            $row->payload
        ));
        if ($updated !== 1) {
            $summary['errors']++;
            $summary['photos_filled'] = $photosBefore;
        }
    }
} while (count($batch) === $batchSize);

$photoLabel = $apply ? 'photos filled' : 'photos that would be filled';
fwrite(STDOUT, sprintf(
    "Summary: records scanned=%d; associations scanned=%d; %s=%d; already populated=%d; missing professional=%d; professional without photo=%d; errors=%d.\n",
    $summary['records_scanned'],
    $summary['associations_scanned'],
    $photoLabel,
    $summary['photos_filled'],
    $summary['already_populated'],
    $summary['missing_professional'],
    $summary['professional_without_photo'],
    $summary['errors']
));
if (!$apply) {
    fwrite(STDOUT, "Dry run only: no database rows or files were changed.\n");
}

exit($summary['errors'] > 0 ? 2 : 0);
