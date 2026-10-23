#!/usr/bin/env php
<?php
/**
 * Private CLI bootstrap for maintenance scripts targeting the original
 * production database without changing public_html/wp-config.php.
 *
 * On the server, place this file and wp-config-main.php in
 * /home/u647623496/private-tools/ with permissions 0600. The private config
 * must contain the credentials for u647623496_us4JX. Never put it in
 * public_html or share its contents.
 */

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

$productionRoot = realpath('/home/u647623496/domains/cokifimi.org/public_html');
$privateConfig = '/home/u647623496/private-tools/wp-config-main.php';
if (!$productionRoot || !is_readable($productionRoot . '/wp-settings.php')) {
    fwrite(STDERR, "Production WordPress core not found.\n");
    exit(1);
}
if (!is_file($privateConfig) || !is_readable($privateConfig)) {
    fwrite(STDERR, "Private production config not found.\n");
    exit(1);
}

if (!defined('ABSPATH')) {
    define('ABSPATH', rtrim($productionRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR);
}

// Keep the maintenance bootstrap from loading active site plugins or themes.
if (!defined('WP_INSTALLING')) {
    define('WP_INSTALLING', true);
}

require_once $privateConfig;
