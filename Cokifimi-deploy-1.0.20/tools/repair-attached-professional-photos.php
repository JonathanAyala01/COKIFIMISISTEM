#!/usr/bin/env php
<?php
/**
 * Completes missing photos for attached professionals in COKIFIMI records.
 * Dry-run is the default. Apply requires --apply --test-db=<exact DB> --staging.
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

$options = getopt('', array('wp-load:', 'batch-size::', 'apply', 'test-db:', 'staging', 'help'));
if (isset($options['help']) || empty($options['wp-load'])) {
    fwrite(STDOUT, "Usage: php repair-attached-professional-photos.php --wp-load=/absolute/path/wp-load.php [--batch-size=50]\n");
    fwrite(STDOUT, "Apply requires --apply --test-db=<exact DB name> --staging, and wp-load.php realpath ending in /public_html/prueba/wp-load.php.\n");
    exit(isset($options['help']) ? 0 : 1);
}

$wp_load = realpath($options['wp-load']);
if ($wp_load === false || basename($wp_load) !== 'wp-load.php') {
    fwrite(STDERR, "--wp-load must be an existing wp-load.php.\n");
    exit(1);
}

$apply = isset($options['apply']);
$canonical_wp_load = str_replace('\\', '/', $wp_load);
if ($apply && (!isset($options['staging']) || empty($options['test-db']))) {
    fwrite(STDERR, "Refusing --apply: require --apply, --test-db=<exact DB name>, and --staging together.\n");
    exit(1);
}
if ($apply && !preg_match('~/public_html/prueba/wp-load\.php$~D', $canonical_wp_load)) {
    fwrite(STDERR, "Refusing --apply: wp-load.php realpath must end in /public_html/prueba/wp-load.php.\n");
    exit(1);
}

$batch_size = isset($options['batch-size']) ? (int) $options['batch-size'] : 50;
if ($batch_size < 1 || $batch_size > 500) {
    fwrite(STDERR, "--batch-size must be between 1 and 500.\n");
    exit(1);
}

require_once $wp_load;
global $wpdb;
$table = $wpdb->prefix . 'cokifimi_dj_records';
$current_db = defined('DB_NAME') ? (string) DB_NAME : '';
if ($apply && !hash_equals($current_db, (string) $options['test-db'])) {
    fwrite(STDERR, "Refusing --apply: current DB does not exactly match --test-db.\n");
    exit(1);
}
if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) !== $table) {
    fwrite(STDERR, "Records table not found.\n");
    exit(1);
}

function cokifimi_repair_normalize_matricula($value) {
    $digits = preg_replace('/\D+/', '', (string) $value);
    $normalized = ltrim($digits, '0');
    return $normalized === '' && $digits !== '' ? '0' : $normalized;
}

function cokifimi_repair_is_http_url($value) {
    return is_string($value) && preg_match('~^https?://~i', trim($value)) === 1;
}

function cokifimi_repair_form_photos(&$form, $professional_index, &$summary) {
    if (!is_array($form)) {
        return false;
    }

    $changed = false;
    for ($slot = 1; $slot <= 8; $slot++) {
        $suffix = $slot === 1 ? '' : (string) $slot;
        $matricula_key = 'adjuntoMatricula' . $suffix;
        $photo_key = 'adjuntoFotoUrl' . $suffix;
        $matricula = cokifimi_repair_normalize_matricula($form[$matricula_key] ?? '');
        if ($matricula === '') {
            continue;
        }

        $summary['associations_scanned']++;
        if (isset($form[$photo_key]) && trim((string) $form[$photo_key]) !== '') {
            $summary['already_populated']++;
            continue;
        }

        if (!isset($professional_index[$matricula])) {
            $summary['missing_professional']++;
            continue;
        }
        $photo_url = $professional_index[$matricula]['photo_url'];
        if (!cokifimi_repair_is_http_url($photo_url)) {
            $summary['professional_without_photo']++;
            continue;
        }

        $form[$photo_key] = trim($photo_url);
        $summary['photos_would_be_filled']++;
        $changed = true;
    }
    return $changed;
}

function cokifimi_repair_record_forms(&$payload, $professional_index, &$summary) {
    if (!is_array($payload)) {
        return false;
    }
    $changed = false;
    if (isset($payload['formularioHabilitacionConsultorio']) && is_array($payload['formularioHabilitacionConsultorio'])) {
        $changed = cokifimi_repair_form_photos($payload['formularioHabilitacionConsultorio'], $professional_index, $summary) || $changed;
    }
    if (isset($payload['consultorioSolicitudes']) && is_array($payload['consultorioSolicitudes'])) {
        foreach ($payload['consultorioSolicitudes'] as &$request) {
            if (is_array($request) && isset($request['formularioHabilitacionConsultorio']) && is_array($request['formularioHabilitacionConsultorio'])) {
                $changed = cokifimi_repair_form_photos($request['formularioHabilitacionConsultorio'], $professional_index, $summary) || $changed;
            }
        }
        unset($request);
    }
    return $changed;
}

function cokifimi_repair_fetch_batch($table, $after_id, $limit) {
    global $wpdb;
    $sql = $wpdb->prepare(
        "SELECT record_id, payload
         FROM {$table}
         WHERE record_id > %s
         ORDER BY record_id ASC
         LIMIT %d",
        $after_id,
        $limit
    );
    return $wpdb->get_results($sql);
}

// Pass one builds a compact matricula => photo index for every professional.
$professional_index = array();
$last_id = '';
$index_errors = 0;
do {
    $batch = cokifimi_repair_fetch_batch($table, $last_id, $batch_size);
    foreach ($batch as $row) {
        $last_id = (string) $row->record_id;
        $payload = json_decode((string) $row->payload, true);
        if (!is_array($payload)) {
            $index_errors++;
            continue;
        }
        $matricula = cokifimi_repair_normalize_matricula($payload['matricula'] ?? '');
        if ($matricula === '') {
            continue;
        }
        $photo_url = cokifimi_repair_is_http_url($payload['fotoUrl'] ?? null) ? trim($payload['fotoUrl']) : '';
        if (!isset($professional_index[$matricula])) {
            $professional_index[$matricula] = array('photo_url' => $photo_url);
        } elseif ($professional_index[$matricula]['photo_url'] === '' && $photo_url !== '') {
            $professional_index[$matricula]['photo_url'] = $photo_url;
        }
    }
} while (count($batch) === $batch_size);

$summary = array(
    'records_scanned' => 0,
    'associations_scanned' => 0,
    'photos_would_be_filled' => 0,
    'already_populated' => 0,
    'missing_professional' => 0,
    'professional_without_photo' => 0,
    'errors' => $index_errors,
);
fwrite(STDOUT, sprintf("Mode: %s | DB: %s | batch size: %d\n", $apply ? 'APPLY' : 'DRY RUN', $current_db, $batch_size));

// Pass two repairs only the two requested form locations, in bounded batches.
$last_id = '';
do {
    $batch = cokifimi_repair_fetch_batch($table, $last_id, $batch_size);
    foreach ($batch as $row) {
        $last_id = (string) $row->record_id;
        $summary['records_scanned']++;
        $payload = json_decode((string) $row->payload, true);
        if (!is_array($payload)) {
            continue; // Already counted during index creation.
        }
        $photos_before = $summary['photos_would_be_filled'];
        $changed = cokifimi_repair_record_forms($payload, $professional_index, $summary);
        if (!$changed) {
            continue;
        }
        if (!$apply) {
            continue;
        }

        $encoded = wp_json_encode($payload);
        if ($encoded === false) {
            $summary['errors']++;
            continue;
        }
        $updated = $wpdb->query($wpdb->prepare(
            "UPDATE {$table}
             SET payload = %s
             WHERE record_id = %s
               AND payload = %s",
            $encoded,
            $row->record_id,
            $row->payload
        ));
        if ($updated !== 1) {
            // Report failed fills as errors instead of claiming they were saved.
            $summary['errors']++;
            $summary['photos_would_be_filled'] = $photos_before;
        }
    }
} while (count($batch) === $batch_size);

fwrite(STDOUT, sprintf(
    "Summary: records scanned=%d; associations scanned=%d; photos that would be filled=%d; already populated=%d; missing professional=%d; professional without photo=%d; errors=%d.\n",
    $summary['records_scanned'],
    $summary['associations_scanned'],
    $summary['photos_would_be_filled'],
    $summary['already_populated'],
    $summary['missing_professional'],
    $summary['professional_without_photo'],
    $summary['errors']
));
if (!$apply) {
    fwrite(STDOUT, "Dry run only: no files or database rows were changed. Use --apply --test-db=<exact DB name> --staging after review.\n");
}
exit($summary['errors'] > 0 ? 2 : 0);
