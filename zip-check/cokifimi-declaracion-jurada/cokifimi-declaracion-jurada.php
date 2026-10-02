<?php
/**
 * Plugin Name: COKIFIMI Declaracion Jurada-token
 * Description: Formulario React para la declaracion jurada digital de matricula.
 * Version: 1.0.43
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: Joni-Ayala Edicion: *-CodigoTech-*
 */

if (!defined('ABSPATH')) {
    exit;
}

define('COKIFIMI_DJ_VERSION', '1.0.43');
define('COKIFIMI_DJ_DIR', plugin_dir_path(__FILE__));
define('COKIFIMI_DJ_URL', plugin_dir_url(__FILE__));
define('COKIFIMI_DJ_PORTAL_USER', 'admincokifi');

function cokifimi_dj_table_name() {
    global $wpdb;
    return $wpdb->prefix . 'cokifimi_dj_records';
}

function cokifimi_dj_install() {
    global $wpdb;

    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $table = cokifimi_dj_table_name();
    $charset_collate = $wpdb->get_charset_collate();
    $sql = "CREATE TABLE {$table} (
        record_id varchar(100) NOT NULL,
        dni varchar(80) NOT NULL DEFAULT '',
        apellido varchar(190) NOT NULL DEFAULT '',
        nombres varchar(190) NOT NULL DEFAULT '',
        payload longtext NOT NULL,
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL,
        PRIMARY KEY (record_id),
        KEY dni (dni),
        KEY apellido (apellido),
        KEY nombres (nombres)
    ) {$charset_collate};";

    dbDelta($sql);
    update_option('cokifimi_dj_db_version', COKIFIMI_DJ_VERSION);

    add_role('cokifimi_admin', 'Administrador COKIFIMI', array(
        'read' => true,
        'manage_cokifimi_records' => true,
    ));

    $administrator = get_role('administrator');
    if ($administrator) {
        $administrator->add_cap('manage_cokifimi_records');
    }

    $portal_page_id = (int) get_option('cokifimi_dj_portal_page_id');
    if (!$portal_page_id || !get_post($portal_page_id)) {
        $page_id = wp_insert_post(array(
            'post_title' => 'Acceso COKIFIMI',
            'post_name' => 'cokifimi-admin',
            'post_content' => '[cokifimi_admin]',
            'post_status' => 'publish',
            'post_type' => 'page',
        ));
        if (!is_wp_error($page_id) && $page_id) {
            update_option('cokifimi_dj_portal_page_id', $page_id);
        }
    }
}
register_activation_hook(__FILE__, 'cokifimi_dj_install');

function cokifimi_dj_maybe_install() {
    if (get_option('cokifimi_dj_db_version') !== COKIFIMI_DJ_VERSION) {
        cokifimi_dj_install();
    }
}
add_action('init', 'cokifimi_dj_maybe_install');

function cokifimi_dj_ensure_member_page() {
    $page_id = (int) get_option('cokifimi_dj_member_page_id');
    if ($page_id && get_post($page_id)) return;
    $existing = get_page_by_path('portal-colegiados');
    if ($existing) {
        update_option('cokifimi_dj_member_page_id', $existing->ID);
        return;
    }
    $new_page_id = wp_insert_post(array(
        'post_title' => 'Portal de Colegiados',
        'post_name' => 'portal-colegiados',
        'post_content' => '[cokifimi_colegiado]',
        'post_status' => 'publish',
        'post_type' => 'page',
    ));
    if (!is_wp_error($new_page_id) && $new_page_id) update_option('cokifimi_dj_member_page_id', $new_page_id);
}
add_action('init', 'cokifimi_dj_ensure_member_page', 20);

function cokifimi_dj_decode_record($row) {
    $payload = json_decode($row->payload, true);
    if (!is_array($payload)) {
        $payload = array();
    }

    $payload['id'] = $row->record_id;
    $payload['createdAt'] = $row->created_at;
    $payload['updatedAt'] = $row->updated_at;
    return $payload;
}

function cokifimi_dj_admin_permission() {
    return current_user_can('manage_cokifimi_records') || current_user_can('manage_options');
}

function cokifimi_dj_portal_token() {
    return isset($_COOKIE['cokifimi_portal_token']) ? sanitize_text_field(wp_unslash($_COOKIE['cokifimi_portal_token'])) : '';
}

function cokifimi_dj_portal_permission() {
    return cokifimi_dj_admin_permission() || (cokifimi_dj_portal_token() && get_transient('cokifimi_portal_' . hash('sha256', cokifimi_dj_portal_token())));
}

function cokifimi_dj_portal_users() {
    $users = get_option('cokifimi_dj_portal_users', null);
    if (is_array($users)) {
        return $users;
    }

    $legacy_hash = get_option('cokifimi_dj_portal_password_hash', '');
    $users = $legacy_hash ? array(COKIFIMI_DJ_PORTAL_USER => $legacy_hash) : array();
    update_option('cokifimi_dj_portal_users', $users);
    return $users;
}

function cokifimi_dj_portal_login(WP_REST_Request $request) {
    $data = $request->get_json_params();
    $username = sanitize_user($data['username'] ?? '');
    $password = (string) ($data['password'] ?? '');
    $users = cokifimi_dj_portal_users();
    $password_hash = isset($users[$username]) ? $users[$username] : '';

    if ($username !== COKIFIMI_DJ_PORTAL_USER || !$password_hash || !wp_check_password($password, $password_hash)) {
        return new WP_Error('invalid_login', 'Usuario o contraseña incorrectos.', array('status' => 401));
    }

    $token = wp_generate_password(48, false, false);
    set_transient('cokifimi_portal_' . hash('sha256', $token), true, 12 * HOUR_IN_SECONDS);
    setcookie('cokifimi_portal_token', $token, array(
        'expires' => time() + 12 * HOUR_IN_SECONDS,
        'path' => COOKIEPATH ?: '/',
        'secure' => is_ssl(),
        'httponly' => true,
        'samesite' => 'Lax',
    ));

    return rest_ensure_response(array('authenticated' => true));
}

function cokifimi_dj_portal_logout() {
    $token = cokifimi_dj_portal_token();
    if ($token) delete_transient('cokifimi_portal_' . hash('sha256', $token));
    setcookie('cokifimi_portal_token', '', array('expires' => time() - HOUR_IN_SECONDS, 'path' => COOKIEPATH ?: '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax'));
    return rest_ensure_response(array('authenticated' => false));
}

/* Portal individual de colegiados: DNI + e-mail registrado + código temporal.
 * El token de seis dígitos nunca se almacena en texto plano. */
function cokifimi_dj_member_cookie_name() {
    return 'cokifimi_member_token';
}

function cokifimi_dj_member_session() {
    $token = isset($_COOKIE[cokifimi_dj_member_cookie_name()])
        ? sanitize_text_field(wp_unslash($_COOKIE[cokifimi_dj_member_cookie_name()]))
        : '';
    return $token ? get_transient('cokifimi_member_' . hash('sha256', $token)) : false;
}

function cokifimi_dj_member_permission() {
    return (bool) cokifimi_dj_member_session();
}

function cokifimi_dj_find_record_by_dni($dni) {
    global $wpdb;
    $digits = preg_replace('/\D+/', '', (string) $dni);
    if (!$digits) return null;
    $rows = $wpdb->get_results('SELECT * FROM ' . cokifimi_dj_table_name() . ' ORDER BY updated_at DESC LIMIT 5000');
    foreach ($rows as $row) {
        if (preg_replace('/\D+/', '', (string) $row->dni) === $digits) return $row;
    }
    return null;
}

function cokifimi_dj_member_account_key($dni) {
    return hash('sha256', preg_replace('/\D+/', '', (string) $dni));
}

function cokifimi_dj_member_accounts() {
    $accounts = get_option('cokifimi_dj_member_accounts', array());
    return is_array($accounts) ? $accounts : array();
}

function cokifimi_dj_hydrate_member_access($record) {
    if (!is_array($record)) return $record;
    $accounts = cokifimi_dj_member_accounts();
    $account = $accounts[cokifimi_dj_member_account_key($record['dni'] ?? '')] ?? array();
    if (empty($record['memberAccessTokenHash']) && !empty($account['token_hash'])) $record['memberAccessTokenHash'] = $account['token_hash'];
    if (empty($record['email']) && !empty($account['email'])) $record['email'] = $account['email'];
    return $record;
}

function cokifimi_dj_is_secure_member_token($token, $dni) {
    if (!preg_match('/^\d{6}$/', $token) || preg_match('/^(\d)\1{5}$/', $token)) return false;
    if (preg_match('/012|123|234|345|456|567|678|789|987|876|765|654|543|432|321|210/', $token)) return false;
    $dni_start = substr(preg_replace('/\D+/', '', (string) $dni), 0, 3);
    return !$dni_start || strpos($token, $dni_start) === false;
}

function cokifimi_dj_email_logo_path() {
    $logo_file = COKIFIMI_DJ_DIR . 'build/vite/assets/logo.png';
    return is_readable($logo_file) ? $logo_file : '';
}

function cokifimi_dj_embed_email_logo($phpmailer) {
    $logo_path = cokifimi_dj_email_logo_path();
    if (!empty($GLOBALS['cokifimi_dj_embed_email_logo']) && $logo_path) {
        $phpmailer->addEmbeddedImage($logo_path, 'cokifimi-logo', 'logo.png', 'base64', 'image/png');
    }
}

function cokifimi_dj_member_verification_email($code) {
    $safe_code = esc_html((string) $code);
    $logo = cokifimi_dj_email_logo_path()
        ? '<img src="cid:cokifimi-logo" width="58" height="58" alt="COKIFIMI" style="display:block;border:0;outline:none;border-radius:12px;" />'
        : '<div style="width:58px;height:58px;line-height:58px;text-align:center;background:#dcfce7;border-radius:12px;color:#087443;font-family:Arial,sans-serif;font-size:12px;font-weight:700;">COKI</div>';

    return '<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
        . '<body style="margin:0;padding:0;background:#eff8f3;color:#17382e;font-family:Arial,Helvetica,sans-serif;">'
        . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eff8f3;padding:32px 12px;"><tr><td align="center">'
        . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #d8ebe0;border-radius:20px;overflow:hidden;">'
        . '<tr><td style="padding:28px 34px 24px;background:linear-gradient(135deg,#053d2b,#0f6b49);text-align:center;">'
        . '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td style="padding-right:13px;vertical-align:middle;">' . $logo . '</td><td style="vertical-align:middle;text-align:left;"><div style="color:#a7f3d0;font-size:10px;font-weight:700;letter-spacing:1.6px;">COLEGIO COKIFIMI</div><div style="color:#ffffff;font-size:21px;font-weight:700;line-height:1.2;margin-top:4px;">Verificación de acceso</div></td></tr></table>'
        . '</td></tr><tr><td style="padding:32px 34px 18px;text-align:center;">'
        . '<h1 style="margin:0 0 10px;color:#17382e;font-size:24px;line-height:1.25;">Confirme su correo electrónico</h1>'
        . '<p style="margin:0;color:#61756b;font-size:14px;line-height:1.55;">Utilice este código para crear su token personal de acceso al Portal del Colegiado.</p>'
        . '<div style="margin:28px 0 20px;padding:18px 14px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;color:#075f42;font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:700;letter-spacing:9px;line-height:1;">' . $safe_code . '</div>'
        . '<p style="margin:0;color:#9b6500;font-size:12px;font-weight:700;">Este código vence en 10 minutos.</p>'
        . '<div style="margin:20px 0 0;padding:14px 16px;background:#f8fafc;border:1px solid #dbe5df;border-radius:10px;color:#334155;font-size:12px;line-height:1.55;text-align:justify;"><strong>Carácter de declaración:</strong> Al generar su clave única digital para todo trámite (TOKEN) en este Colegio, acepta que todo trámite realizado o solicitado tendrá la validez de un trámite efectuado con firma certificada, aceptando la legalidad que esto implica.</div>'
        . '</td></tr><tr><td style="padding:18px 34px 28px;border-top:1px solid #e7f0ea;">'
        . '<p style="margin:0;color:#60756a;font-size:12px;line-height:1.5;text-align:center;">Por seguridad, no comparta este código. Si no solicitó este acceso, puede ignorar este mensaje.</p>'
        . '<p style="margin:16px 0 0;color:#0f5a3e;font-size:11px;font-weight:700;letter-spacing:.5px;text-align:center;">COKIFIMI · COLEGIO DE KINESIÓLOGOS Y FISIOTERAPEUTAS DE MISIONES</p>'
        . '</td></tr></table></td></tr></table></body></html>';
}

function cokifimi_dj_member_set_session($row = null, $dni = '') {
    $member_dni = $row ? preg_replace('/\D+/', '', (string) $row->dni) : preg_replace('/\D+/', '', (string) $dni);
    $token = wp_generate_password(48, false, false);
    set_transient('cokifimi_member_' . hash('sha256', $token), array(
        'record_id' => $row ? $row->record_id : '',
        'dni' => $member_dni,
    ), 8 * HOUR_IN_SECONDS);
    setcookie(cokifimi_dj_member_cookie_name(), $token, array(
        'expires' => time() + 8 * HOUR_IN_SECONDS,
        'path' => COOKIEPATH ?: '/',
        'secure' => is_ssl(),
        'httponly' => true,
        'samesite' => 'Lax',
    ));
}

function cokifimi_dj_member_request_code(WP_REST_Request $request) {
    $data = $request->get_json_params();
    $dni = preg_replace('/\D+/', '', (string) ($data['dni'] ?? ''));
    $email = sanitize_email($data['email'] ?? '');
    if (!$dni || !is_email($email) || !preg_match('/@gmail\.com$/i', $email)) return new WP_Error('invalid_member_data', 'Debe ingresar un correo Gmail válido (@gmail.com).', array('status' => 400));

    $throttle_key = 'cokifimi_member_throttle_' . hash('sha256', $dni . '|' . strtolower($email));
    if (get_transient($throttle_key)) return new WP_Error('code_recently_sent', 'Espere un minuto antes de solicitar otro código.', array('status' => 429));

    $row = cokifimi_dj_find_record_by_dni($dni);
    $record = $row ? cokifimi_dj_decode_record($row) : array();
    $accounts = cokifimi_dj_member_accounts();
    $account = $accounts[cokifimi_dj_member_account_key($dni)] ?? array();
    if ($row && array_key_exists('memberEnabled', $record) && !$record['memberEnabled']) {
        return new WP_Error('member_access_disabled', 'El acceso de este colegiado fue dado de baja. Comuníquese con la Administración del Colegio.', array('status' => 403));
    }
    $registered_email = strtolower(trim((string) ($record['email'] ?? ($account['email'] ?? ''))));
    if ($row && ($registered_email === '' || $registered_email !== strtolower($email))) {
        return new WP_Error('member_not_verified', 'El DNI y el correo no coinciden con un registro habilitado.', array('status' => 404));
    }
    if (!$row && !empty($account['email']) && strtolower($account['email']) !== strtolower($email)) {
        return new WP_Error('member_not_verified', 'El DNI y el correo no coinciden con el acceso registrado.', array('status' => 404));
    }

    $existing_token = $row ? ($record['memberAccessTokenHash'] ?? ($account['token_hash'] ?? '')) : ($account['token_hash'] ?? '');
    if ($existing_token) {
        return new WP_Error('member_token_already_created', 'Ya posee un token de acceso. Para restablecerlo, solicite uno nuevo a la Administración del Colegio.', array('status' => 403));
    }

    $code = (string) wp_rand(100000, 999999);
    $verification_key = 'cokifimi_member_verify_' . hash('sha256', $dni . '|' . strtolower($email));
    set_transient($verification_key, array('hash' => wp_hash_password($code), 'record_id' => $row ? $row->record_id : '', 'new_member' => !$row), 10 * MINUTE_IN_SECONDS);
    set_transient($throttle_key, true, MINUTE_IN_SECONDS);

    $subject = 'Código de verificación - Portal COKIFIMI';
    $message = cokifimi_dj_member_verification_email($code);
    $headers = array('Content-Type: text/html; charset=UTF-8');
    $GLOBALS['cokifimi_dj_embed_email_logo'] = true;
    add_action('phpmailer_init', 'cokifimi_dj_embed_email_logo');
    $email_sent = wp_mail($email, $subject, $message, $headers);
    remove_action('phpmailer_init', 'cokifimi_dj_embed_email_logo');
    unset($GLOBALS['cokifimi_dj_embed_email_logo']);
    if (!$email_sent) return new WP_Error('email_not_sent', 'No se pudo enviar el correo de verificación. Intente nuevamente o contacte a administración.', array('status' => 500));
    return rest_ensure_response(array('sent' => true));
}

function cokifimi_dj_member_verify_and_create_token(WP_REST_Request $request) {
    global $wpdb;
    $data = $request->get_json_params();
    $dni = preg_replace('/\D+/', '', (string) ($data['dni'] ?? ''));
    $email = sanitize_email($data['email'] ?? '');
    $code = preg_replace('/\D+/', '', (string) ($data['code'] ?? ''));
    $access_token = preg_replace('/\D+/', '', (string) ($data['accessToken'] ?? ''));
    if (!$dni || !is_email($email) || !preg_match('/@gmail\.com$/i', $email) || strlen($code) !== 6 || !cokifimi_dj_is_secure_member_token($access_token, $dni)) {
        return new WP_Error('invalid_verification', 'Use un correo electrónico válido y un token seguro de 6 números, sin secuencias, repeticiones ni los 3 primeros números del DNI.', array('status' => 400));
    }
    $key = 'cokifimi_member_verify_' . hash('sha256', $dni . '|' . strtolower($email));
    $verification = get_transient($key);
    $row = cokifimi_dj_find_record_by_dni($dni);
    if (!$verification || !wp_check_password($code, $verification['hash']) || ($row && $verification['record_id'] !== $row->record_id) || (!$row && empty($verification['new_member']))) {
        return new WP_Error('invalid_verification', 'El código es incorrecto o venció.', array('status' => 401));
    }
    $record = null;
    if ($row) {
        $record = cokifimi_dj_decode_record($row);
        $accounts = cokifimi_dj_member_accounts();
        $account = $accounts[cokifimi_dj_member_account_key($dni)] ?? array();
        $registered_email = strtolower(trim((string) ($record['email'] ?? ($account['email'] ?? ''))));
        if ($registered_email === '' || $registered_email !== strtolower($email)) return new WP_Error('member_not_verified', 'No se pudo verificar el correo.', array('status' => 401));
        if (!empty($record['memberAccessTokenHash']) || !empty($account['token_hash'])) return new WP_Error('member_token_already_created', 'El token ya fue creado. Solicite un restablecimiento a la Administración del Colegio.', array('status' => 403));
        $record['memberAccessTokenHash'] = wp_hash_password($access_token);
        $record['updatedAt'] = current_time('mysql', true);
        $wpdb->update(cokifimi_dj_table_name(), array('payload' => wp_json_encode($record), 'updated_at' => $record['updatedAt']), array('record_id' => $row->record_id), array('%s', '%s'), array('%s'));
    } else {
        $accounts = cokifimi_dj_member_accounts();
        $existing_account = $accounts[cokifimi_dj_member_account_key($dni)] ?? array();
        if (!empty($existing_account['token_hash'])) return new WP_Error('member_token_already_created', 'El token ya fue creado. Solicite un restablecimiento a la Administración del Colegio.', array('status' => 403));
        $now = current_time('mysql', true);
        $token_hash = wp_hash_password($access_token);
        $accounts[cokifimi_dj_member_account_key($dni)] = array('email' => strtolower($email), 'token_hash' => $token_hash, 'created_at' => $now);
        update_option('cokifimi_dj_member_accounts', $accounts, false);
        $record = array('id' => 'dec_' . wp_generate_uuid4(), 'dni' => $dni, 'apellido' => '', 'nombres' => '', 'email' => strtolower($email), 'createdAt' => $now, 'updatedAt' => $now, 'memberEnabled' => true, 'memberAccessTokenHash' => $token_hash, 'memberProvisional' => true, 'consultorios' => array());
        $created = $wpdb->insert(cokifimi_dj_table_name(), array('record_id' => $record['id'], 'dni' => $dni, 'apellido' => $record['apellido'], 'nombres' => $record['nombres'], 'payload' => wp_json_encode($record), 'created_at' => $now, 'updated_at' => $now), array('%s', '%s', '%s', '%s', '%s', '%s', '%s'));
        if ($created === false) return new WP_Error('member_record_not_saved', 'No se pudo registrar el acceso del colegiado.', array('status' => 500));
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $record['id']));
    }
    delete_transient($key);
    cokifimi_dj_member_set_session($row, $dni);
    return rest_ensure_response(array('authenticated' => true, 'record' => $record));
}

function cokifimi_dj_member_login(WP_REST_Request $request) {
    global $wpdb;
    $data = $request->get_json_params();
    $dni = preg_replace('/\D+/', '', (string) ($data['dni'] ?? ''));
    $access_token = preg_replace('/\D+/', '', (string) ($data['accessToken'] ?? ''));
    $row = cokifimi_dj_find_record_by_dni($dni);
    $record = $row ? cokifimi_dj_decode_record($row) : array();
    $accounts = cokifimi_dj_member_accounts();
    $account = $accounts[cokifimi_dj_member_account_key($dni)] ?? array();
    // A completely unknown DNI must never be treated as a reset-token case.
    // The reset message is reserved for an existing member whose token was
    // explicitly removed by administration.
    if (!$row && empty($account)) {
        return new WP_Error('member_not_registered', 'NO SE ENCUENTRA SU REGISTRO. Debe registrarse para obtener su token en la parte inferior mediante su correo electrónico de Gmail.', array('status' => 404));
    }
    if ($row && array_key_exists('memberEnabled', $record) && !$record['memberEnabled']) {
        return new WP_Error('member_access_disabled', 'El acceso de este colegiado fue dado de baja. Comuníquese con la Administración del Colegio.', array('status' => 403));
    }
    $token_hash = $row ? ($record['memberAccessTokenHash'] ?? ($account['token_hash'] ?? '')) : ($account['token_hash'] ?? '');
    if (!empty($record['memberTokenBlocked'])) {
        return new WP_Error('member_token_blocked', 'Por favor comunicarse al Colegio para volver habilitar y reestablecer su token.', array('status' => 403));
    }
    if (!$token_hash) {
        return new WP_Error('member_token_reset_required', 'El token fue restablecido. Debe volver a verificar su correo electrónico y DNI para generar un nuevo token.', array('status' => 403));
    }
    if (strlen($access_token) !== 6 || !$token_hash || !wp_check_password($access_token, $token_hash)) {
        if ($row) {
            $failed_attempts = (int) ($record['memberTokenFailedAttempts'] ?? 0) + 1;
            $record['memberTokenFailedAttempts'] = $failed_attempts;
            $record['memberTokenBlocked'] = $failed_attempts >= 6;
            $wpdb->update(cokifimi_dj_table_name(), array('payload' => wp_json_encode($record), 'updated_at' => current_time('mysql', true)), array('record_id' => $row->record_id), array('%s', '%s'), array('%s'));
        }
        return new WP_Error('invalid_member_login', 'DNI o token incorrectos.', array('status' => 401));
    }
    if (!$row) {
        $now = current_time('mysql', true);
        $record = array(
            'id' => 'dec_' . wp_generate_uuid4(),
            'dni' => $dni,
            'apellido' => '',
            'nombres' => '',
            'email' => strtolower((string) ($account['email'] ?? '')),
            'createdAt' => $now,
            'updatedAt' => $now,
            'memberEnabled' => true,
            'memberAccessTokenHash' => $token_hash,
            'memberProvisional' => true,
            'consultorios' => array(),
        );
        $created = $wpdb->insert(cokifimi_dj_table_name(), array(
            'record_id' => $record['id'], 'dni' => $dni, 'apellido' => $record['apellido'], 'nombres' => $record['nombres'],
            'payload' => wp_json_encode($record), 'created_at' => $now, 'updated_at' => $now,
        ), array('%s', '%s', '%s', '%s', '%s', '%s', '%s'));
        if ($created === false) return new WP_Error('member_record_not_saved', 'No se pudo registrar el acceso del colegiado.', array('status' => 500));
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $record['id']));
    }
    cokifimi_dj_member_set_session($row, $dni);
    return rest_ensure_response(array('authenticated' => true, 'record' => $record));
}

function cokifimi_dj_member_me() {
    global $wpdb;
    $session = cokifimi_dj_member_session();
    if (!$session) return new WP_Error('member_session_not_found', 'Sesión no válida.', array('status' => 401));
    if (empty($session['record_id'])) {
        $dni = preg_replace('/\D+/', '', (string) ($session['dni'] ?? ''));
        $accounts = cokifimi_dj_member_accounts();
        $account = $accounts[cokifimi_dj_member_account_key($dni)] ?? array();
        if (!$dni || empty($account['token_hash'])) return rest_ensure_response(array('record' => null));
        $now = current_time('mysql', true);
        $record = array('id' => 'dec_' . wp_generate_uuid4(), 'dni' => $dni, 'apellido' => '', 'nombres' => '', 'email' => strtolower((string) ($account['email'] ?? '')), 'createdAt' => $now, 'updatedAt' => $now, 'memberEnabled' => true, 'memberAccessTokenHash' => $account['token_hash'], 'memberProvisional' => true, 'consultorios' => array());
        $created = $wpdb->insert(cokifimi_dj_table_name(), array('record_id' => $record['id'], 'dni' => $dni, 'apellido' => $record['apellido'], 'nombres' => $record['nombres'], 'payload' => wp_json_encode($record), 'created_at' => $now, 'updated_at' => $now), array('%s', '%s', '%s', '%s', '%s', '%s', '%s'));
        if ($created === false) return new WP_Error('member_record_not_saved', 'No se pudo registrar el acceso del colegiado.', array('status' => 500));
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $record['id']));
        cokifimi_dj_member_set_session($row, $dni);
        return rest_ensure_response($record);
    }
    $row = $session ? $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $session['record_id'])) : null;
    if (!$row) return new WP_Error('member_session_not_found', 'La sesión no es válida.', array('status' => 401));
    return rest_ensure_response(cokifimi_dj_decode_record($row));
}

function cokifimi_dj_sync_legacy_member_account(WP_REST_Request $request) {
    global $wpdb;
    $data = $request->get_json_params();
    $dni = preg_replace('/\D+/', '', (string) ($data['dni'] ?? ''));
    if (!$dni) return new WP_Error('invalid_member_data', 'Ingrese un DNI válido.', array('status' => 400));
    $existing_row = cokifimi_dj_find_record_by_dni($dni);
    if ($existing_row) return rest_ensure_response(cokifimi_dj_hydrate_member_access(cokifimi_dj_decode_record($existing_row)));
    $accounts = cokifimi_dj_member_accounts();
    $account = $accounts[cokifimi_dj_member_account_key($dni)] ?? array();
    if (empty($account['token_hash'])) return new WP_Error('member_account_not_found', 'No se encontró un acceso con token para ese DNI.', array('status' => 404));
    $now = current_time('mysql', true);
    $record = array('id' => 'dec_' . wp_generate_uuid4(), 'dni' => $dni, 'apellido' => '', 'nombres' => '', 'email' => strtolower((string) ($account['email'] ?? '')), 'createdAt' => $now, 'updatedAt' => $now, 'memberEnabled' => true, 'memberAccessTokenHash' => $account['token_hash'], 'memberProvisional' => true, 'consultorios' => array());
    $created = $wpdb->insert(cokifimi_dj_table_name(), array('record_id' => $record['id'], 'dni' => $dni, 'apellido' => $record['apellido'], 'nombres' => $record['nombres'], 'payload' => wp_json_encode($record), 'created_at' => $now, 'updated_at' => $now), array('%s', '%s', '%s', '%s', '%s', '%s', '%s'));
    if ($created === false) return new WP_Error('member_record_not_saved', 'No se pudo sincronizar el acceso.', array('status' => 500));
    return rest_ensure_response($record);
}

function cokifimi_dj_delete_member_account(WP_REST_Request $request) {
    global $wpdb;
    $data = $request->get_json_params();
    $dni = preg_replace('/\D+/', '', (string) ($data['dni'] ?? ''));
    if (!$dni) return new WP_Error('invalid_member_data', 'Ingrese un DNI válido.', array('status' => 400));
    $row = cokifimi_dj_find_record_by_dni($dni);
    if ($row) {
        $deleted = $wpdb->delete(cokifimi_dj_table_name(), array('record_id' => $row->record_id), array('%s'));
        if ($deleted === false) return new WP_Error('member_delete_failed', 'No se pudo eliminar la declaración del colegiado.', array('status' => 500));
    }
    $accounts = cokifimi_dj_member_accounts();
    $account_key = cokifimi_dj_member_account_key($dni);
    unset($accounts[$account_key]);
    update_option('cokifimi_dj_member_accounts', $accounts, false);
    return rest_ensure_response(array('deleted' => true));
}

function cokifimi_dj_store_consultorio_attachment($record_id, $key, $value) {
    $attachment_suffix = '';
    if (preg_match('/Adjunto(2)?$/', (string) $key, $suffix_match)) {
        $attachment_suffix = !empty($suffix_match[1]) ? '-adjunto-2' : '-adjunto-1';
        $key = preg_replace('/Adjunto2?$/', '', (string) $key);
    }
    if (!is_string($value) || !preg_match('/^data:([a-zA-Z0-9.+-]+);base64,(.+)$/s', $value, $matches)) return null;
    $allowed = array(
        'certificadoAnssalArchivo' => 'certificado-anssal',
        'polizaPraxisArchivo' => 'poliza-praxis',
        'planoMunicipalArchivo' => 'plano-municipal',
        'certificadoBomberosArchivo' => 'certificado-bomberos',
        'comprobantePagoArchivo' => 'comprobante-pago',
        'reciboPagoArchivo' => 'recibo-pago',
        'certificadoUrl' => 'certificado-habilitacion',
        'certificadoConsultorioUrl' => 'certificado-habilitacion',
        'certificadoEticaUrl' => 'certificado-etica-libre-deuda',
    );
    if (!isset($allowed[$key])) return null;
    $binary = base64_decode($matches[2], true);
    if ($binary === false || strlen($binary) > 15 * 1024 * 1024) return new WP_Error('attachment_too_large', 'El archivo adjunto supera el límite permitido de 15 MB.', array('status' => 400));
    $mime = sanitize_mime_type($matches[1]);
    $extension = $mime === 'application/pdf' ? 'pdf' : (strpos($mime, 'image/') === 0 ? substr($mime, 6) : 'bin');
    $filename = sanitize_file_name($record_id . '-' . $allowed[$key] . $attachment_suffix . '.' . $extension);
    $upload = wp_upload_bits($filename, null, $binary);
    if (!empty($upload['error'])) return new WP_Error('attachment_upload_failed', $upload['error'], array('status' => 500));
    require_once ABSPATH . 'wp-admin/includes/image.php';
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    $attachment_id = wp_insert_attachment(array(
        'post_mime_type' => $mime,
        'post_title' => $allowed[$key] . '-' . $record_id,
        'post_status' => 'inherit',
    ), $upload['file'], 0, true);
    if (!is_wp_error($attachment_id) && wp_attachment_is_image($attachment_id)) {
        wp_update_attachment_metadata($attachment_id, wp_generate_attachment_metadata($attachment_id, $upload['file']));
    }
    return array('url' => $upload['url'], 'name' => basename($upload['file']), 'mime' => $mime, 'id' => is_wp_error($attachment_id) ? 0 : (int) $attachment_id);
}

function cokifimi_dj_member_save_record(WP_REST_Request $request) {
    global $wpdb;
    $session = cokifimi_dj_member_session();
    $row = $session ? $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $session['record_id'])) : null;
    $data = $request->get_json_params();
    $notify_consultorio_submission = false;
    if (!$session || !is_array($data)) return new WP_Error('member_update_denied', 'No tiene permiso para actualizar este registro.', array('status' => 403));
    if (!$row && empty($session['record_id'])) {
        // La matrícula es única aunque se envíe con ceros iniciales (0122 = 122).
        $matricula_normalizada = preg_replace('/^0+(?=\d)/', '', preg_replace('/\D+/', '', (string) ($data['matricula'] ?? '')));
        if ($matricula_normalizada === '') return new WP_Error('invalid_member_matricula', 'Ingrese una matrícula válida.', array('status' => 400));
        $matricula_rows = $wpdb->get_results('SELECT payload FROM ' . cokifimi_dj_table_name());
        foreach ((array) $matricula_rows as $matricula_row) {
            $stored = json_decode((string) ($matricula_row->payload ?? ''), true);
            $stored_matricula = preg_replace('/^0+(?=\d)/', '', preg_replace('/\D+/', '', (string) ($stored['matricula'] ?? '')));
            if ($stored_matricula !== '' && $stored_matricula === $matricula_normalizada) {
                return new WP_Error('member_matricula_exists', 'La matrícula ya está registrada. No se puede crear otra declaración con la misma matrícula.', array('status' => 409));
            }
        }
        $data['matricula'] = $matricula_normalizada;
        $now = current_time('mysql', true);
        $accounts = cokifimi_dj_member_accounts();
        $account = $accounts[cokifimi_dj_member_account_key($session['dni'])] ?? array();
        $data['id'] = 'dec_' . wp_generate_uuid4();
        $data['dni'] = $session['dni'];
        $data['email'] = $account['email'] ?? ($data['email'] ?? '');
        $data['createdAt'] = $now;
        $data['updatedAt'] = $now;
        // Keep dates/matricula supplied by the first member submission. They
        // used to be unconditionally cleared here, which made them disappear
        // immediately after saving the declaration.
        $data['fechaMatriculacion'] = (string) ($data['fechaMatriculacion'] ?? '');
        $data['fechaMatriculacionAdmin'] = !empty($data['fechaMatriculacionAdmin']);
        $data['memberAccessTokenHash'] = $account['token_hash'] ?? '';
        $created = $wpdb->insert(cokifimi_dj_table_name(), array(
            'record_id' => $data['id'],
            'dni' => $data['dni'],
            'apellido' => sanitize_text_field($data['apellido'] ?? ''),
            'nombres' => sanitize_text_field($data['nombres'] ?? ''),
            'payload' => wp_json_encode($data),
            'created_at' => $now,
            'updated_at' => $now,
        ), array('%s', '%s', '%s', '%s', '%s', '%s', '%s'));
        if ($created === false) return new WP_Error('member_record_not_saved', 'No se pudo crear la declaración.', array('status' => 500));
        $new_row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $data['id']));
        cokifimi_dj_member_set_session($new_row, $session['dni']);
        return rest_ensure_response($data);
    }
    $existing = $row ? cokifimi_dj_decode_record($row) : array();
    // Formulario 1 remains read-only after submission. The attached official
    // Formulario 2 payload is the only subsequent member-side update allowed.
    if (($row || !empty($session['record_id'])) && empty($existing['memberProvisional'])) {
        $formulario_2 = $data['formularioHabilitacionConsultorio'] ?? null;
        if (!is_array($formulario_2)) {
            $data = array_merge($existing, $data);
        } else {
        $notify_consultorio_submission = empty($existing['formularioHabilitacionConsultorio']['submittedAt']) && !empty($formulario_2['submittedAt']);
        $tipo = ($formulario_2['tipoPresentacion'] ?? '') === 'TITULAR' ? 'TITULAR' : 'ADJUNTO';
        $data = $existing;
        $formulario_2_limpio = array();
        foreach ($formulario_2 as $key => $value) {
            $key = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $key);
            if ($key === '') continue;
            if (in_array($key, array('certificadoAnssalArchivo', 'polizaPraxisArchivo', 'planoMunicipalArchivo', 'certificadoBomberosArchivo', 'comprobantePagoArchivo', 'reciboPagoArchivo'), true) && is_string($value) && strpos($value, 'data:') === 0) {
                $attachment = cokifimi_dj_store_consultorio_attachment($data['id'] ?? $existing['id'] ?? $row->record_id, $key, $value);
                if (is_wp_error($attachment)) return $attachment;
                if ($attachment) {
                    $formulario_2_limpio[$key] = $attachment['url'];
                    $formulario_2_limpio[$key . 'Nombre'] = $attachment['name'];
                    $formulario_2_limpio[$key . 'Mime'] = $attachment['mime'];
                    $formulario_2_limpio[$key . 'Id'] = $attachment['id'];
                    continue;
                }
            }
            $formulario_2_limpio[$key] = is_bool($value) ? $value : sanitize_textarea_field((string) $value);
        }
        $formulario_2_limpio['tipoPresentacion'] = $tipo;
        $formulario_2_limpio['declaraVeracidad'] = !empty($formulario_2['declaraVeracidad']);
        $formulario_2_limpio['submittedAt'] = current_time('mysql', true);
        $request_id = sanitize_key($data['consultorioSolicitudId'] ?? ($formulario_2['consultorioSolicitudId'] ?? ''));
        if ($request_id) {
            $requests = is_array($existing['consultorioSolicitudes'] ?? null) ? $existing['consultorioSolicitudes'] : array();
            $request_updated = false;
            foreach ($requests as $request_index => $request_item) {
                if (is_array($request_item) && sanitize_key($request_item['id'] ?? '') === $request_id) {
                    $requests[$request_index]['formularioHabilitacionConsultorio'] = $formulario_2_limpio;
                    $request_updated = true;
                    break;
                }
            }
            if (!$request_updated) {
                $incoming_address_key = cokifimi_dj_consultorio_address_key($formulario_2_limpio);
                if ($incoming_address_key !== '') {
                    foreach ($requests as $request_index => $request_item) {
                        if (!is_array($request_item)) continue;
                        $stored_address_key = cokifimi_dj_consultorio_address_key($request_item['formularioHabilitacionConsultorio'] ?? array());
                        if ($stored_address_key !== '' && $stored_address_key === $incoming_address_key) {
                            $requests[$request_index]['formularioHabilitacionConsultorio'] = $formulario_2_limpio;
                            $request_id = sanitize_key($request_item['id'] ?? $request_id);
                            $request_updated = true;
                            break;
                        }
                    }
                }
            }
            if (!$request_updated) {
                if (empty($formulario_2['nuevaSolicitudConsultorio']) && empty($formulario_2['consultorioSolicitudId'])) {
                    return new WP_Error('consultorio_request_not_found', 'Solicitud de Alta no encontrada.', array('status' => 404));
                }
                if (count($requests) >= 2) {
                    return new WP_Error('consultorio_request_limit', 'Cada colegiado puede tener hasta 3 Altas de consultorio.', array('status' => 400));
                }
                $requests[] = array('id' => $request_id, 'formularioHabilitacionConsultorio' => $formulario_2_limpio);
            }
            $data['consultorioSolicitudes'] = $requests;
        } else {
            $data['formularioHabilitacionConsultorio'] = $formulario_2_limpio;
        }
        }
    }
    if (!$row || !is_array($data) || ($data['id'] ?? '') !== $row->record_id) return new WP_Error('member_update_denied', 'No tiene permiso para actualizar este registro.', array('status' => 403));
    foreach (array('id', 'dni', 'createdAt', 'memberAccessTokenHash') as $field) {
        $data[$field] = $existing[$field] ?? '';
    }
    $accounts = cokifimi_dj_member_accounts();
    $account = $accounts[cokifimi_dj_member_account_key($session['dni'])] ?? array();
    $data['email'] = strtolower(trim((string) ($existing['email'] ?? ($account['email'] ?? $data['email'] ?? ''))));
    // Preserve administrator values when present, otherwise retain the
    // values entered in the member's first declaration.
    foreach (array('matricula', 'fechaMatriculacion', 'fechaMatriculacionAdmin', 'fechaPresentacion', 'fechaVencimiento', 'apellido', 'nombres', 'dni', 'cuilCuit', 'fechaNacimiento', 'sexo', 'provinciaNacimiento', 'ciudadNacimiento', 'nacionalidad', 'fechaEmisionTitulo', 'fechaEmisionRevalida', 'fechaInicioConsultorio') as $field) {
        if (!empty($existing[$field])) $data[$field] = $existing[$field];
        elseif (!array_key_exists($field, $data)) $data[$field] = '';
    }
    $data['memberProvisional'] = false;
    $data['updatedAt'] = current_time('mysql', true);
    $updated = $wpdb->update(cokifimi_dj_table_name(), array(
        'apellido' => sanitize_text_field($data['apellido'] ?? ''),
        'nombres' => sanitize_text_field($data['nombres'] ?? ''),
        'payload' => wp_json_encode($data),
        'updated_at' => $data['updatedAt'],
    ), array('record_id' => $row->record_id), array('%s', '%s', '%s', '%s'), array('%s'));
    if ($updated === false) return new WP_Error('member_record_not_saved', 'No se pudo guardar la actualización.', array('status' => 500));
    if ($notify_consultorio_submission) {
        wp_schedule_single_event(time() + 1, 'cokifimi_send_consultorio_submission_email', array($data));
    }
    return rest_ensure_response($data);
}


function cokifimi_dj_member_manage_attached(WP_REST_Request $request) {
    global $wpdb;
    $session = cokifimi_dj_member_session();
    $data = $request->get_json_params();
    $action = sanitize_key($data['action'] ?? '');
    $matricula = preg_replace('/\D+/', '', (string) ($data['matricula'] ?? ''));
    if (!$session || empty($session['record_id']) || !in_array($action, array('associate', 'remove'), true) || !$matricula) {
        return new WP_Error('invalid_attached_request', 'Datos de asociaci�n no v�lidos.', array('status' => 400));
    }
    $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $session['record_id']));
    if (!$row) return new WP_Error('member_record_not_found', 'No se encontr� su registro.', array('status' => 404));
    $record = cokifimi_dj_decode_record($row);
    $yes = static function ($value) { return in_array(strtoupper(trim((string) $value)), array('SI', 'S?', 'YES', 'TRUE', '1'), true); };
    $consultorios = is_array($record['consultorios'] ?? null) ? $record['consultorios'] : array();
    $is_titular = $yes($record['esTitularConsultorio'] ?? '') || (bool) array_filter($consultorios, function ($item) use ($yes) { return is_array($item) && $yes($item['esTitularConsultorio'] ?? ''); });
    if (!$is_titular) return new WP_Error('attached_manage_denied', 'Solo el titular de consultorio puede administrar profesionales adjuntos.', array('status' => 403));

    $form = is_array($record['formularioHabilitacionConsultorio'] ?? null) ? $record['formularioHabilitacionConsultorio'] : array();
    $slots = array('', '2');
    $clear_fields = array('adjuntoApellido','adjuntoNombres','adjuntoDni','adjuntoCuil','adjuntoTitulo','adjuntoObrasSociales','adjuntoAnssal','adjuntoAnssalDesde','adjuntoAnssalHasta','adjuntoCompaniaSeguro','adjuntoPolizaSeguro','adjuntoSeguroDesde','adjuntoSeguroHasta','adjuntoInicioActividad','adjuntoAsociado','adjuntoFotoUrl','certificadoAnssalArchivoAdjunto','certificadoAnssalArchivoAdjuntoNombre','polizaPraxisArchivoAdjunto','polizaPraxisArchivoAdjuntoNombre');
    if ($action === 'remove') {
        foreach ($slots as $suffix) {
            if (preg_replace('/\D+/', '', (string) ($form['adjuntoMatricula' . $suffix] ?? '')) === $matricula) {
                $form['adjuntoMatricula' . $suffix] = '';
                foreach ($clear_fields as $field) $form[$field . $suffix] = '';
            }
        }
    } else {
        if (preg_replace('/\D+/', '', (string) ($record['matricula'] ?? '')) === $matricula) return new WP_Error('attached_self_not_allowed', 'No puede asociarse a s� mismo.', array('status' => 400));
        $rows = $wpdb->get_results('SELECT * FROM ' . cokifimi_dj_table_name() . ' ORDER BY updated_at DESC LIMIT 5000');
        $target = null;
        foreach ($rows as $candidate_row) {
            $candidate = cokifimi_dj_decode_record($candidate_row);
            if (preg_replace('/\D+/', '', (string) ($candidate['matricula'] ?? '')) === $matricula) { $target = $candidate; break; }
        }
        if (!$target) return new WP_Error('attached_not_found', 'No se encontr� un colegiado con esa matr�cula.', array('status' => 404));
        $target_consultorios = is_array($target['consultorios'] ?? null) ? $target['consultorios'] : array();
        $target_is_adjunto = $yes($target['esProfesionalAdjunto'] ?? '') || (bool) array_filter($target_consultorios, function ($item) use ($yes) { return is_array($item) && !$yes($item['esTitularConsultorio'] ?? '') && $yes($item['esProfesionalAdjunto'] ?? ''); });
        if (!$target_is_adjunto) return new WP_Error('attached_not_eligible', 'La matr�cula corresponde a un titular o no figura como profesional adjunto.', array('status' => 400));
        foreach ($slots as $suffix) if (preg_replace('/\D+/', '', (string) ($form['adjuntoMatricula' . $suffix] ?? '')) === $matricula) return new WP_Error('attached_already_linked', 'Ese profesional ya est� asociado.', array('status' => 400));
        $free_suffix = null;
        foreach ($slots as $suffix) if (empty($form['adjuntoMatricula' . $suffix])) { $free_suffix = $suffix; break; }
        if ($free_suffix === null) return new WP_Error('attached_limit', 'Ya tiene asociados los dos profesionales adjuntos permitidos.', array('status' => 400));
        $form['adjuntoMatricula' . $free_suffix] = $matricula;
        if ($free_suffix === '2') $form['tipoArea'] = 'Consultorio particular (un titular y dos adjuntos)';
        $target_form = is_array($target['formularioHabilitacionConsultorio'] ?? null) ? $target['formularioHabilitacionConsultorio'] : array();
        $target_praxis = (string) ($target['polizaPraxisArchivo'] ?? ($target_form['polizaPraxisArchivo'] ?? ''));
        $target_seguro_desde = (string) ($target['seguroDesde'] ?? ($target_form['seguroDesde'] ?? ''));
        $target_seguro_hasta = (string) ($target['seguroHasta'] ?? ($target_form['seguroHasta'] ?? ''));
        if (!$target_praxis || !$target_seguro_desde || !$target_seguro_hasta) return new WP_Error('attached_data_incomplete', 'El profesional adjunto que quiere asociar debe actualizar su declaraci�n jurada y cargar la p�liza de praxis con sus fechas de vigencia.', array('status' => 400));
        $field_map = array('adjuntoApellido'=>'apellido','adjuntoNombres'=>'nombres','adjuntoDni'=>'dni','adjuntoCuil'=>'cuilCuit','adjuntoTitulo'=>'tituloUniversitario','adjuntoObrasSociales'=>'atiendeObrasSociales','adjuntoAnssal'=>'poseeAnssal','adjuntoAnssalDesde'=>'anssalDesde','adjuntoAnssalHasta'=>'anssalHasta','adjuntoCompaniaSeguro'=>'companiaSeguro','adjuntoPolizaSeguro'=>'polizaSeguro','adjuntoSeguroDesde'=>'seguroDesde','adjuntoSeguroHasta'=>'seguroHasta','adjuntoInicioActividad'=>'fechaInicioConsultorio','adjuntoAsociado'=>'asociadoAsociacion','adjuntoFotoUrl'=>'fotoUrl');
        foreach ($field_map as $destination => $source) $form[$destination . $free_suffix] = $target[$source] ?? ($target_form[$source] ?? '');
        $form['certificadoAnssalArchivoAdjunto' . $free_suffix] = ($target['certificadoAnssalArchivo'] ?? ($target_form['certificadoAnssalArchivo'] ?? ''));
        $form['certificadoAnssalArchivoAdjuntoNombre' . $free_suffix] = ($target['certificadoAnssalArchivoNombre'] ?? ($target_form['certificadoAnssalArchivoNombre'] ?? ''));
        $form['polizaPraxisArchivoAdjunto' . $free_suffix] = ($target['polizaPraxisArchivo'] ?? ($target_form['polizaPraxisArchivo'] ?? ''));
        $form['polizaPraxisArchivoAdjuntoNombre' . $free_suffix] = ($target['polizaPraxisArchivoNombre'] ?? ($target_form['polizaPraxisArchivoNombre'] ?? ''));
    }
    $record['formularioHabilitacionConsultorio'] = $form;
    $record['updatedAt'] = current_time('mysql', true);
    $updated = $wpdb->update(cokifimi_dj_table_name(), array('payload' => wp_json_encode($record), 'updated_at' => $record['updatedAt']), array('record_id' => $row->record_id), array('%s', '%s'), array('%s'));
    if ($updated === false) return new WP_Error('attached_update_failed', 'No se pudo actualizar la asociaci�n.', array('status' => 500));
    return rest_ensure_response($record);
}
function cokifimi_dj_member_logout() {
    $token = isset($_COOKIE[cokifimi_dj_member_cookie_name()]) ? sanitize_text_field(wp_unslash($_COOKIE[cokifimi_dj_member_cookie_name()])) : '';
    if ($token) delete_transient('cokifimi_member_' . hash('sha256', $token));
    setcookie(cokifimi_dj_member_cookie_name(), '', array('expires' => time() - HOUR_IN_SECONDS, 'path' => COOKIEPATH ?: '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax'));
    return rest_ensure_response(array('authenticated' => false));
}

function cokifimi_dj_consultorio_submission_email($record) {
    $name = esc_html(trim(($record['nombres'] ?? '') . ' ' . ($record['apellido'] ?? '')));
    $matricula = esc_html((string) ($record['matricula'] ?? '—'));
    $dni = esc_html((string) ($record['dni'] ?? '—'));
    $form = is_array($record['formularioHabilitacionConsultorio'] ?? null) ? $record['formularioHabilitacionConsultorio'] : array();
    $localidad = esc_html((string) ($form['localidadConsultorio'] ?? 'Sin localidad'));
    $periodo = esc_html((string) ($form['periodoHabilitacion'] ?? ($form['mesesHabilitacion'] ?? 'Sin especificar')));
    $admin_url = 'https://cokifimi.org/index.php/seccion-admin-declaracion-jurada/';
    $logo = cokifimi_dj_email_logo_path()
        ? '<img src="cid:cokifimi-logo" width="58" height="58" alt="COKIFIMI" style="display:block;border:0;outline:none;border-radius:12px;" />'
        : '<div style="width:58px;height:58px;line-height:58px;text-align:center;background:#dcfce7;border-radius:12px;color:#087443;font-family:Arial,sans-serif;font-size:12px;font-weight:700;">COKI</div>';

    return '<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
        . '<body style="margin:0;padding:0;background:#eff8f3;color:#17382e;font-family:Arial,Helvetica,sans-serif;">'
        . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eff8f3;padding:32px 12px;"><tr><td align="center">'
        . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #d8ebe0;border-radius:20px;overflow:hidden;">'
        . '<tr><td style="padding:28px 34px 24px;background:linear-gradient(135deg,#053d2b,#0f6b49);text-align:center;">'
        . '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td style="padding-right:13px;vertical-align:middle;">' . $logo . '</td><td style="vertical-align:middle;text-align:left;"><div style="color:#a7f3d0;font-size:10px;font-weight:700;letter-spacing:1.6px;">COLEGIO COKIFIMI</div><div style="color:#ffffff;font-size:21px;font-weight:700;line-height:1.2;margin-top:4px;">Nueva solicitud de alta</div></td></tr></table>'
        . '</td></tr><tr><td style="padding:30px 34px 28px;"><h1 style="margin:0 0 10px;color:#17382e;font-size:24px;line-height:1.25;">Alta de consultorio pendiente</h1>'
        . '<p style="margin:0 0 22px;color:#61756b;font-size:14px;line-height:1.55;">Se gener&oacute; una nueva solicitud de alta de consultorio en la web y requiere verificaci&oacute;n administrativa.</p>'
        . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #d8ebe0;border-radius:12px;background:#f6fbf8;"><tr><td style="padding:16px 18px;color:#334155;font-size:14px;line-height:1.7;"><strong>Colegiado:</strong> ' . ($name ?: 'Sin nombre') . '<br><strong>M.P.:</strong> ' . $matricula . '<br><strong>DNI:</strong> ' . $dni . '<br><strong>Localidad:</strong> ' . $localidad . '<br><strong>Per&iacute;odo solicitado:</strong> ' . $periodo . '</td></tr></table>'
        . '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:26px auto 0;"><tr><td style="border-radius:10px;background:#0f6b49;"><a href="' . esc_url($admin_url) . '" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Ver solicitud en el panel administrativo</a></td></tr></table>'
        . '</td></tr><tr><td style="padding:18px 34px 28px;border-top:1px solid #e7f0ea;"><p style="margin:0;color:#60756a;font-size:12px;line-height:1.5;text-align:center;">COKIFIMI &middot; Aviso autom&aacute;tico de la plataforma</p></td></tr></table></td></tr></table></body></html>';
}

function cokifimi_dj_send_consultorio_submission_email($record) {
    if (!is_array($record)) return;
    $admin_email = 'colegioklgosmisiones@gmail.com';
    $headers = array('Content-Type: text/html; charset=UTF-8');
    $GLOBALS['cokifimi_dj_embed_email_logo'] = true;
    add_action('phpmailer_init', 'cokifimi_dj_embed_email_logo');
    wp_mail($admin_email, 'Nueva solicitud de alta de consultorio - COKIFIMI', cokifimi_dj_consultorio_submission_email($record), $headers);
    remove_action('phpmailer_init', 'cokifimi_dj_embed_email_logo');
    unset($GLOBALS['cokifimi_dj_embed_email_logo']);
}
add_action('cokifimi_send_consultorio_submission_email', 'cokifimi_dj_send_consultorio_submission_email');
function cokifimi_dj_consultorio_amount_email($record) {
    $name = esc_html(trim(($record['nombres'] ?? '') . ' ' . ($record['apellido'] ?? '')));
    $form = is_array($record['formularioHabilitacionConsultorio'] ?? null) ? $record['formularioHabilitacionConsultorio'] : array();
    $amount = max(0, (float) ($form['importeConfirmado'] ?? 0));
    $amount_label = '$ ' . number_format($amount, 0, ',', '.');
    $period = esc_html((string) ($form['periodoHabilitacion'] ?? ($form['mesesHabilitacion'] ?? 'Sin especificar')));
    $vigencia_desde_raw = (string) ($form['certificadoVigenciaDesde'] ?? '');
    $vigencia_hasta_raw = (string) ($form['certificadoVigenciaHasta'] ?? '');
    $format_vigencia = static function ($value) {
        $timestamp = strtotime($value);
        return $timestamp ? date('d/m/Y', $timestamp) : 'Sin definir';
    };
    $vigencia_desde = esc_html($format_vigencia($vigencia_desde_raw));
    $vigencia_hasta = esc_html($format_vigencia($vigencia_hasta_raw));
    $vigencia_html = '<div style="font-size:13px;margin-top:9px;">Fecha de alta: <b>' . $vigencia_desde . '</b><br>Fecha final del alta: <b>' . $vigencia_hasta . '</b></div>';
    $portal_url = 'https://cokifimi.org/index.php/acceso-para-el-colegiado/';
    $logo = cokifimi_dj_email_logo_path()
        ? '<img src="cid:cokifimi-logo" width="58" height="58" alt="COKIFIMI" style="display:block;border:0;outline:none;border-radius:12px;" />'
        : '<div style="width:58px;height:58px;line-height:58px;text-align:center;background:#dcfce7;border-radius:12px;color:#087443;font-family:Arial,sans-serif;font-size:12px;font-weight:700;">COKI</div>';

    return '<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
        . '<body style="margin:0;padding:0;background:#eff8f3;color:#17382e;font-family:Arial,Helvetica,sans-serif;">'
        . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eff8f3;padding:32px 12px;"><tr><td align="center">'
        . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #d8ebe0;border-radius:20px;overflow:hidden;">'
        . '<tr><td style="padding:28px 34px 24px;background:linear-gradient(135deg,#053d2b,#0f6b49);text-align:center;">'
        . '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td style="padding-right:13px;vertical-align:middle;">' . $logo . '</td><td style="vertical-align:middle;text-align:left;"><div style="color:#a7f3d0;font-size:10px;font-weight:700;letter-spacing:1.6px;">COLEGIO COKIFIMI</div><div style="color:#ffffff;font-size:21px;font-weight:700;line-height:1.2;margin-top:4px;">Importe confirmado</div></td></tr></table>'
        . '</td></tr><tr><td style="padding:30px 34px 28px;text-align:center;"><h1 style="margin:0 0 10px;color:#17382e;font-size:24px;line-height:1.25;">Su alta de consultorio est&aacute; lista para el pago</h1>'
        . '<p style="margin:0;color:#61756b;font-size:14px;line-height:1.55;">Hola ' . ($name ?: 'colegiado/a') . '. La Administraci&oacute;n verific&oacute; la documentaci&oacute;n y confirm&oacute; el importe a abonar.</p>'
        . '<div style="margin:25px auto 18px;padding:20px 14px;background:#ecfdf5;border:2px solid #34d399;border-radius:16px;color:#075f42;"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Importe confirmado a abonar</div><strong style="display:block;font-size:36px;line-height:1.2;margin-top:7px;">' . $amount_label . '</strong>' . $vigencia_html . '</div>'
        . '<div style="margin:20px 0;padding:16px 18px;background:#f6fbf8;border:1px solid #b8dfc8;border-radius:12px;color:#17382e;font-size:14px;line-height:1.65;text-align:left;"><strong>*Home Banking</strong><br>*Banco De La Naci&oacute;n Argentina- Sucursal Posadas<br>CBU: 0110407720040712036177<br>Alias: cokifimi<br>Cuenta corriente en Pesos: N&deg;40712036/17<br>Cuit: 30-67238903-4</div>'
        . '<p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">Debe abonar este importe y luego ingresar al Portal del Colegiado para subir el comprobante de pago desde su panel. Una vez que la Administraci&oacute;n confirme el pago, se emitir&aacute; el certificado de alta de consultorio.</p>'
        . '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:25px auto 0;"><tr><td style="border-radius:10px;background:#0f6b49;"><a href="' . esc_url($portal_url) . '" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Ingresar y subir comprobante</a></td></tr></table>'
        . '</td></tr><tr><td style="padding:18px 34px 28px;border-top:1px solid #e7f0ea;"><p style="margin:0;color:#60756a;font-size:12px;line-height:1.5;text-align:center;">COKIFIMI &middot; Aviso autom&aacute;tico de la plataforma</p></td></tr></table></td></tr></table></body></html>';
}

function cokifimi_dj_send_consultorio_amount_email($notification_record) {
    if (!is_array($notification_record) || !is_email($notification_record['email'] ?? '')) return;
    $GLOBALS['cokifimi_dj_embed_email_logo'] = true;
    add_action('phpmailer_init', 'cokifimi_dj_embed_email_logo');
    wp_mail(
        sanitize_email($notification_record['email']),
        'Importe confirmado para su alta de consultorio - COKIFIMI',
        cokifimi_dj_consultorio_amount_email($notification_record),
        array('Content-Type: text/html; charset=UTF-8')
    );
    remove_action('phpmailer_init', 'cokifimi_dj_embed_email_logo');
    unset($GLOBALS['cokifimi_dj_embed_email_logo']);
}
add_action('cokifimi_send_consultorio_amount_email', 'cokifimi_dj_send_consultorio_amount_email');
function cokifimi_dj_consultorio_resolution_email($record, $approved, $admin_message = '') {
    $name = esc_html(trim(($record['nombres'] ?? '') . ' ' . ($record['apellido'] ?? '')));
    $portal_url = 'https://cokifimi.org/index.php/acceso-para-el-colegiado/';
    $is_approved = (bool) $approved;
    $accent = $is_approved ? '#0f8a5f' : '#dc2626';
    $soft = $is_approved ? '#ecfdf5' : '#fff1f2';
    $title = $is_approved ? 'Su alta de consultorio fue aprobada' : 'Su alta de consultorio fue rechazada';
    $description = $is_approved
        ? 'La Administración aprobó su solicitud de alta o actualización de consultorio.'
        : 'La Administración revisó su solicitud de alta o actualización de consultorio y requiere correcciones.';
    $message_html = trim((string) $admin_message) !== ''
        ? '<div style="margin:22px 0;padding:16px 18px;background:' . $soft . ';border-left:4px solid ' . $accent . ';border-radius:10px;color:#334155;font-size:14px;line-height:1.55;"><strong style="color:' . $accent . ';">Mensaje de Administración</strong><br>' . nl2br(esc_html($admin_message)) . '</div>'
        : '';
    $action = $is_approved
        ? 'Ingrese al Portal del Colegiado con su DNI y token personal para descargar el certificado de habilitación y el certificado de ética / libre deuda.'
        : 'Ingrese al Portal del Colegiado con su DNI y token personal para ver el motivo, editar la solicitud y enviarla nuevamente a revisión.';
    $logo = cokifimi_dj_email_logo_path()
        ? '<img src="cid:cokifimi-logo" width="58" height="58" alt="COKIFIMI" style="display:block;border:0;outline:none;border-radius:12px;" />'
        : '<div style="width:58px;height:58px;line-height:58px;text-align:center;background:#dcfce7;border-radius:12px;color:#087443;font-family:Arial,sans-serif;font-size:12px;font-weight:700;">COKI</div>';

    return '<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
        . '<body style="margin:0;padding:0;background:#eff8f3;color:#17382e;font-family:Arial,Helvetica,sans-serif;">'
        . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#eff8f3;padding:32px 12px;"><tr><td align="center">'
        . '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #d8ebe0;border-radius:20px;overflow:hidden;">'
        . '<tr><td style="padding:28px 34px 24px;background:linear-gradient(135deg,#053d2b,' . $accent . ');text-align:center;">'
        . '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td style="padding-right:13px;vertical-align:middle;">' . $logo . '</td><td style="vertical-align:middle;text-align:left;"><div style="color:#d1fae5;font-size:10px;font-weight:700;letter-spacing:1.6px;">COLEGIO COKIFIMI</div><div style="color:#ffffff;font-size:21px;font-weight:700;line-height:1.2;margin-top:4px;">Resolución de consultorio</div></td></tr></table>'
        . '</td></tr><tr><td style="padding:32px 34px 28px;text-align:center;">'
        . '<div style="display:inline-block;margin-bottom:14px;padding:7px 12px;background:' . $soft . ';border-radius:999px;color:' . $accent . ';font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;">' . ($is_approved ? 'Solicitud aprobada' : 'Solicitud rechazada') . '</div>'
        . '<h1 style="margin:0 0 10px;color:#17382e;font-size:24px;line-height:1.25;">' . $title . '</h1>'
        . '<p style="margin:0;color:#61756b;font-size:14px;line-height:1.55;">Hola ' . ($name ?: 'colegiado/a') . '. ' . $description . '</p>'
        . $message_html
        . '<p style="margin:0;color:#334155;font-size:14px;line-height:1.55;">' . $action . '</p>'
        . '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:25px auto 0;"><tr><td style="border-radius:10px;background:' . $accent . ';"><a href="' . esc_url($portal_url) . '" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Ingresar a mi portal</a></td></tr></table>'
        . '</td></tr><tr><td style="padding:18px 34px 28px;border-top:1px solid #e7f0ea;"><p style="margin:0;color:#60756a;font-size:12px;line-height:1.5;text-align:center;">Portal del Colegiado · Acceda con su DNI y token personal.</p><p style="margin:14px 0 0;color:#0f5a3e;font-size:11px;font-weight:700;letter-spacing:.5px;text-align:center;">COKIFIMI · COLEGIO DE KINESIÓLOGOS Y FISIOTERAPEUTAS DE MISIONES</p></td></tr>'
        . '</table></td></tr></table></body></html>';
}

function cokifimi_dj_send_consultorio_resolution_email($record, $approved, $message = '') {
    if (!is_array($record) || !is_email($record['email'] ?? '')) return;
    $subject = ($approved ? 'Aprobación' : 'Rechazo') . ' de alta de consultorio - COKIFIMI';
    $headers = array('Content-Type: text/html; charset=UTF-8');
    $GLOBALS['cokifimi_dj_embed_email_logo'] = true;
    add_action('phpmailer_init', 'cokifimi_dj_embed_email_logo');
    wp_mail(sanitize_email($record['email']), $subject, cokifimi_dj_consultorio_resolution_email($record, $approved, $message), $headers);
    remove_action('phpmailer_init', 'cokifimi_dj_embed_email_logo');
    unset($GLOBALS['cokifimi_dj_embed_email_logo']);
}
add_action('cokifimi_send_consultorio_resolution_email', 'cokifimi_dj_send_consultorio_resolution_email', 10, 3);
function cokifimi_dj_notify_consultorio_resolution(WP_REST_Request $request) {
    global $wpdb;
    $data = $request->get_json_params();
    $record_id = sanitize_key($data['recordId'] ?? '');
    $approved = !empty($data['approved']);
    if (!$record_id) return new WP_Error('invalid_record', 'Solicitud inválida.', array('status' => 400));
    $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $record_id));
    if (!$row) return new WP_Error('record_not_found', 'Registro no encontrado.', array('status' => 404));
    $record = cokifimi_dj_decode_record($row);
    $email = sanitize_email($record['email'] ?? '');
    if (!is_email($email)) return new WP_Error('missing_email', 'El colegiado no tiene un correo electrónico válido.', array('status' => 400));
    wp_schedule_single_event(time() + 1, 'cokifimi_send_consultorio_resolution_email', array($record, $approved, (string) ($data['message'] ?? '')));
    return rest_ensure_response(array('sent' => true));
}

function cokifimi_dj_notify_consultorio_amount(WP_REST_Request $request) {
    global $wpdb;
    $data = $request->get_json_params();
    $record_id = sanitize_key($data['recordId'] ?? '');
    if (!$record_id) return new WP_Error('invalid_record', 'Solicitud inválida.', array('status' => 400));
    $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $record_id));
    if (!$row) return new WP_Error('record_not_found', 'Registro no encontrado.', array('status' => 404));
    $record = cokifimi_dj_decode_record($row);
    $email = sanitize_email($record['email'] ?? '');
    if (!is_email($email)) return new WP_Error('missing_email', 'El colegiado no tiene un correo electrónico válido.', array('status' => 400));
    wp_schedule_single_event(time() + 1, 'cokifimi_send_consultorio_amount_email', array($record));
    return rest_ensure_response(array('sent' => true));
}

/* A submitted declaration remains read-only for the member. This narrowly
 * scoped endpoint is the sole exception: it can only append one consultorio
 * owned by the authenticated member, never alter the declaration itself. */
function cokifimi_dj_member_add_consultorio(WP_REST_Request $request) {
    global $wpdb;
    $session = cokifimi_dj_member_session();
    $row = $session ? $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $session['record_id'])) : null;
    $params = $request->get_json_params();
    $incoming = is_array($params) ? ($params['consultorio'] ?? null) : null;
    if (!$session || !$row || !is_array($incoming)) return new WP_Error('member_consultorio_denied', 'No tiene permiso para registrar este consultorio.', array('status' => 403));

    $required = array('domicilio', 'numeracion', 'ciudad', 'fechaInicioConsultorio');
    foreach ($required as $field) {
        if (empty($incoming[$field])) return new WP_Error('member_consultorio_invalid', 'Complete todos los datos obligatorios del consultorio.', array('status' => 400));
    }

    $record = cokifimi_dj_decode_record($row);
    $consultorios = !empty($record['consultorios']) && is_array($record['consultorios']) ? array_values($record['consultorios']) : array();
    if (!$consultorios && ($record['trabajaConsultorio'] ?? '') === 'SI' && (!empty($record['domicilioConsultorio']) || !empty($record['numeracionConsultorio']) || !empty($record['ciudadConsultorio']))) {
        $consultorios[] = array(
            'domicilio' => (string) ($record['domicilioConsultorio'] ?? ''), 'numeracion' => (string) ($record['numeracionConsultorio'] ?? ''), 'ciudad' => (string) ($record['ciudadConsultorio'] ?? ''),
            'esTitularConsultorio' => (string) ($record['esTitularConsultorio'] ?? 'NO'), 'esProfesionalAdjunto' => (string) ($record['esProfesionalAdjunto'] ?? 'NO'),
            'nombreTitularConsultorio' => (string) ($record['nombreTitularConsultorio'] ?? ''), 'fechaInicioConsultorio' => (string) ($record['fechaInicioConsultorio'] ?? ''), 'numeroMatriculaConsultorio' => (string) ($record['numeroMatriculaConsultorio'] ?? ''),
        );
    }
    if (count($consultorios) >= 4) return new WP_Error('member_consultorio_limit', 'Ya cuenta con el máximo de cuatro consultorios registrados.', array('status' => 400));

    $is_titular = ($incoming['esTitularConsultorio'] ?? 'SI') === 'NO' ? 'NO' : 'SI';
    $consultorio = array(
        'domicilio' => sanitize_text_field($incoming['domicilio']),
        'numeracion' => sanitize_text_field($incoming['numeracion']),
        'ciudad' => sanitize_text_field($incoming['ciudad']),
        'esTitularConsultorio' => $is_titular,
        'esProfesionalAdjunto' => $is_titular === 'NO' && ($incoming['esProfesionalAdjunto'] ?? 'NO') === 'SI' ? 'SI' : 'NO',
        'nombreTitularConsultorio' => $is_titular === 'NO' ? sanitize_text_field($incoming['nombreTitularConsultorio'] ?? '') : '',
        'fechaInicioConsultorio' => sanitize_text_field($incoming['fechaInicioConsultorio']),
        'numeroMatriculaConsultorio' => $is_titular === 'NO' ? sanitize_text_field($incoming['numeroMatriculaConsultorio'] ?? '') : '',
    );
    if ($is_titular === 'NO' && (empty($consultorio['nombreTitularConsultorio']) || empty($consultorio['numeroMatriculaConsultorio']))) return new WP_Error('member_consultorio_invalid', 'Complete los datos del titular del consultorio.', array('status' => 400));

    $consultorios[] = $consultorio;
    $record['consultorios'] = $consultorios;
    $record['cantidadConsultorios'] = count($consultorios);
    $record['trabajaConsultorio'] = 'SI';
    if (empty($record['actividadPrivada'])) $record['actividadPrivada'] = 'CONSULTORIO PARTICULAR';
    $record['updatedAt'] = current_time('mysql', true);
    $updated = $wpdb->update(cokifimi_dj_table_name(), array('payload' => wp_json_encode($record), 'updated_at' => $record['updatedAt']), array('record_id' => $row->record_id), array('%s', '%s'), array('%s'));
    if ($updated === false) return new WP_Error('member_consultorio_not_saved', 'No se pudo guardar el consultorio.', array('status' => 500));
    return rest_ensure_response($record);
}

function cokifimi_dj_consultorio_address_key($form) {
    if (!is_array($form)) return '';
    $parts = array(
        $form['domicilioConsultorio'] ?? '',
        $form['numeroConsultorio'] ?? '',
        $form['localidadConsultorio'] ?? '',
    );
    $value = strtoupper((string) remove_accents(implode(' ', array_filter($parts, static function ($part) { return trim((string) $part) !== ''; }))));
    $tokens = preg_split('/[^A-Z0-9]+/i', $value, -1, PREG_SPLIT_NO_EMPTY);
    $unique = array();
    foreach ($tokens as $token) {
        if ($token === 'N' || end($unique) === $token) continue;
        $unique[] = $token;
    }
    return implode('', $unique);
}

function cokifimi_dj_dedupe_consultorio_requests($record) {
    if (!is_array($record) || !is_array($record['consultorioSolicitudes'] ?? null)) return $record;
    $seen_ids = array();
    $seen_addresses = array();
    $principal_address = cokifimi_dj_consultorio_address_key($record['formularioHabilitacionConsultorio'] ?? array());
    if ($principal_address !== '') $seen_addresses[$principal_address] = true;
    $unique = array();
    foreach ($record['consultorioSolicitudes'] as $request_item) {
        if (!is_array($request_item)) continue;
        $request_id = sanitize_key($request_item['id'] ?? '');
        $address = cokifimi_dj_consultorio_address_key($request_item['formularioHabilitacionConsultorio'] ?? array());
        if (($request_id !== '' && isset($seen_ids[$request_id])) || ($address !== '' && isset($seen_addresses[$address]))) continue;
        if ($request_id !== '') $seen_ids[$request_id] = true;
        if ($address !== '') $seen_addresses[$address] = true;
        $unique[] = $request_item;
    }
    $record['consultorioSolicitudes'] = $unique;
    return $record;
}
function cokifimi_dj_save_record(WP_REST_Request $request) {
    global $wpdb;

    $data = $request->get_json_params();
    if (!is_array($data)) {
        return new WP_Error('invalid_record', 'Los datos del registro no son válidos.', array('status' => 400));
    }

    $is_admin = current_user_can('manage_options') || cokifimi_dj_portal_permission();
    $data = cokifimi_dj_dedupe_consultorio_requests($data);
    $id = $is_admin && !empty($data['id']) ? sanitize_key($data['id']) : 'dec_' . wp_generate_uuid4();
    $previous_row = $id ? $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $id)) : null;
    $previous_record = $previous_row ? cokifimi_dj_decode_record($previous_row) : array();
    $previous_form = is_array($previous_record['formularioHabilitacionConsultorio'] ?? null) ? $previous_record['formularioHabilitacionConsultorio'] : array();
    $current_form = is_array($data['formularioHabilitacionConsultorio'] ?? null) ? $data['formularioHabilitacionConsultorio'] : array();
    $previous_amount_timestamp = (string) ($previous_form['importeConfirmadoAt'] ?? '');
    $current_amount_timestamp = (string) ($current_form['importeConfirmadoAt'] ?? '');
    $previous_payment_state = (string) ($previous_form['estadoPago'] ?? '');
    $current_payment_state = (string) ($current_form['estadoPago'] ?? '');
    $should_notify_amount = $is_admin
        && ($current_form['estadoImporte'] ?? '') === 'IMPORTE_CONFIRMADO'
        && !empty($current_form['submittedAt'])
        && (
            ($previous_form['estadoImporte'] ?? '') !== 'IMPORTE_CONFIRMADO'
            || $previous_amount_timestamp !== $current_amount_timestamp
        );
    $now = current_time('mysql', true);
    $created_at = $now;
    $data['id'] = $id;
    $data['createdAt'] = $created_at;
    $data['updatedAt'] = $now;

    $result = $wpdb->replace(
        cokifimi_dj_table_name(),
        array(
            'record_id' => $id,
            'dni' => sanitize_text_field($data['dni'] ?? ''),
            'apellido' => sanitize_text_field($data['apellido'] ?? ''),
            'nombres' => sanitize_text_field($data['nombres'] ?? ''),
            'payload' => wp_json_encode($data),
            'created_at' => $created_at,
            'updated_at' => $now,
        ),
        array('%s', '%s', '%s', '%s', '%s', '%s', '%s')
    );

    if ($result === false) {
        return new WP_Error('record_not_saved', 'No se pudo guardar el registro.', array('status' => 500));
    }

    if ($is_admin && array_key_exists('memberAccessTokenHash', $data)) {
        $accounts = cokifimi_dj_member_accounts();
        $account_key = cokifimi_dj_member_account_key($data['dni'] ?? '');
        if (!empty($accounts[$account_key])) {
            $accounts[$account_key]['token_hash'] = (string) $data['memberAccessTokenHash'];
            if (!empty($data['email'])) $accounts[$account_key]['email'] = strtolower(sanitize_email($data['email']));
            update_option('cokifimi_dj_member_accounts', $accounts, false);
        }
    }

    if ($should_notify_amount && is_email($data['email'] ?? '')) {
        $notification_record = $data;
        wp_schedule_single_event(time() + 1, 'cokifimi_send_consultorio_amount_email', array($notification_record));
    }
    return rest_ensure_response($data);
}

function cokifimi_dj_list_records(WP_REST_Request $request) {
    global $wpdb;
    $search = sanitize_text_field($request->get_param('search'));
    $table = cokifimi_dj_table_name();
    $like = '%' . $wpdb->esc_like($search) . '%';

    if ($search !== '') {
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} WHERE dni LIKE %s OR apellido LIKE %s OR nombres LIKE %s ORDER BY updated_at DESC LIMIT 200",
            $like,
            $like,
            $like
        ));
    } else {
        $rows = $wpdb->get_results("SELECT * FROM {$table} ORDER BY updated_at DESC LIMIT 200");
    }

    return rest_ensure_response(array_map(function($row) {
        return cokifimi_dj_hydrate_member_access(cokifimi_dj_decode_record($row));
    }, $rows));
}

function cokifimi_dj_lookup_record(WP_REST_Request $request) {
    global $wpdb;
    $value = strtoupper(trim(sanitize_text_field($request->get_param('value'))));
    $digits = preg_replace('/\D+/', '', $value);
    $rows = $wpdb->get_results('SELECT * FROM ' . cokifimi_dj_table_name() . ' ORDER BY updated_at DESC LIMIT 5000');

    foreach ($rows as $row) {
        $record = cokifimi_dj_decode_record($row);
        $record_dni = preg_replace('/\D+/', '', (string) ($record['dni'] ?? ''));
        $record_matricula = strtoupper(trim((string) ($record['matricula'] ?? '')));
        if (($digits !== '' && $record_dni === $digits) || ($record_matricula !== '' && $record_matricula === $value)) {
            return rest_ensure_response($record);
        }
    }

    return new WP_Error('record_not_found', 'Registro no encontrado.', array('status' => 404));
}

function cokifimi_dj_get_record(WP_REST_Request $request) {
    global $wpdb;
    $row = $wpdb->get_row($wpdb->prepare(
        'SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s',
        sanitize_key($request['id'])
    ));

    if (!$row) {
        return new WP_Error('record_not_found', 'Registro no encontrado.', array('status' => 404));
    }

    return rest_ensure_response(cokifimi_dj_decode_record($row));
}

function cokifimi_dj_delete_record(WP_REST_Request $request) {
    global $wpdb;
    $deleted = $wpdb->delete(cokifimi_dj_table_name(), array('record_id' => sanitize_key($request['id'])), array('%s'));
    if (!$deleted) {
        return new WP_Error('record_not_found', 'Registro no encontrado.', array('status' => 404));
    }
    return rest_ensure_response(array('deleted' => true));
}

function cokifimi_dj_delete_consultorio(WP_REST_Request $request) {
    global $wpdb;
    $record_id = sanitize_key($request['id']);
    $request_id = sanitize_key($request->get_param('solicitudId') ?? $request->get_param('requestId') ?? '');
    $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $record_id));
    if (!$row) return new WP_Error('record_not_found', 'Registro no encontrado.', array('status' => 404));

    $record = cokifimi_dj_decode_record($row);
    $form = is_array($record['formularioHabilitacionConsultorio'] ?? null) ? $record['formularioHabilitacionConsultorio'] : array();
    if ($request_id) {
        $requests = is_array($record['consultorioSolicitudes'] ?? null) ? $record['consultorioSolicitudes'] : array();
        $filtered_requests = array();
        $matched = false;
        foreach ($requests as $request_item) {
            if (is_array($request_item) && sanitize_key($request_item['id'] ?? '') === $request_id) {
                $matched = true;
                $request_form = is_array($request_item['formularioHabilitacionConsultorio'] ?? null) ? $request_item['formularioHabilitacionConsultorio'] : array();
                foreach (array('certificadoAnssalArchivoId', 'polizaPraxisArchivoId', 'planoMunicipalArchivoId', 'certificadoBomberosArchivoId', 'comprobantePagoArchivoId') as $attachment_key) {
                    if (!empty($request_form[$attachment_key])) wp_delete_attachment((int) $request_form[$attachment_key], true);
                }
                continue;
            }
            $filtered_requests[] = $request_item;
        }
        if (!$matched) {
            return new WP_Error('consultorio_request_not_found', 'Solicitud de Alta no encontrada.', array('status' => 404));
        }
        $record['consultorioSolicitudes'] = $filtered_requests;
        if (empty($filtered_requests) && empty($record['formularioHabilitacionConsultorio'])) {
            unset($record['formularioHabilitacionConsultorio']);
        }
    } else {
        foreach (array('certificadoAnssalArchivoId', 'polizaPraxisArchivoId', 'planoMunicipalArchivoId', 'certificadoBomberosArchivoId', 'comprobantePagoArchivoId') as $attachment_key) {
            if (!empty($form[$attachment_key])) wp_delete_attachment((int) $form[$attachment_key], true);
        }
        unset($record['formularioHabilitacionConsultorio']);
    }
    $record['updatedAt'] = current_time('mysql', true);
    $updated = $wpdb->update(cokifimi_dj_table_name(), array(
        'payload' => wp_json_encode($record),
        'updated_at' => $record['updatedAt'],
    ), array('record_id' => $record_id), array('%s', '%s'), array('%s'));
    if ($updated === false) return new WP_Error('consultorio_delete_failed', 'No se pudo eliminar el alta de consultorio.', array('status' => 500));
    $refresh_row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $record_id));
    return rest_ensure_response(cokifimi_dj_decode_record($refresh_row));
}

function cokifimi_dj_update_consultorio(WP_REST_Request $request) {
    global $wpdb;
    if (!current_user_can('manage_options') && !cokifimi_dj_portal_permission()) {
        return new WP_Error('forbidden', 'No tiene permisos para actualizar el Alta.', array('status' => 403));
    }
    $data = $request->get_json_params();
    $record_id = sanitize_key($data['recordId'] ?? '');
    $incoming_form = is_array($data['formularioHabilitacionConsultorio'] ?? null) ? $data['formularioHabilitacionConsultorio'] : null;
    if (!$record_id || $incoming_form === null) return new WP_Error('invalid_consultorio', 'Datos del Alta no válidos.', array('status' => 400));
    $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cokifimi_dj_table_name() . ' WHERE record_id = %s', $record_id));
    if (!$row) return new WP_Error('record_not_found', 'Registro no encontrado.', array('status' => 404));
    $record = cokifimi_dj_decode_record($row);
    $request_id = sanitize_key($data['consultorioSolicitudId'] ?? '');
    $requests = is_array($record['consultorioSolicitudes'] ?? null) ? $record['consultorioSolicitudes'] : array();
    $previous_form = is_array($record['formularioHabilitacionConsultorio'] ?? null) ? $record['formularioHabilitacionConsultorio'] : array();
    if ($request_id) {
        foreach ($requests as $request_item) {
            if (is_array($request_item) && sanitize_key($request_item['id'] ?? '') === $request_id) {
                $previous_form = is_array($request_item['formularioHabilitacionConsultorio'] ?? null) ? $request_item['formularioHabilitacionConsultorio'] : array();
                break;
            }
        }
    }
    $merged_form = array_merge($previous_form, $incoming_form);
    if ($request_id) {
        $target_address = cokifimi_dj_consultorio_address_key($merged_form);
        $principal_address = cokifimi_dj_consultorio_address_key($record['formularioHabilitacionConsultorio'] ?? array());
        if ($target_address !== '' && $target_address === $principal_address) {
            return new WP_Error('consultorio_duplicate_address', 'Ese domicilio ya tiene un Alta registrada.', array('status' => 400));
        }
        foreach ($requests as $request_item) {
            if (!is_array($request_item) || sanitize_key($request_item['id'] ?? '') === $request_id) continue;
            if ($target_address !== '' && $target_address === cokifimi_dj_consultorio_address_key($request_item['formularioHabilitacionConsultorio'] ?? array())) {
                return new WP_Error('consultorio_duplicate_address', 'Ese domicilio ya tiene un Alta registrada.', array('status' => 400));
            }
        }
    }
    $should_notify_amount = ($merged_form['estadoImporte'] ?? '') === 'IMPORTE_CONFIRMADO'
        && !empty($merged_form['submittedAt'])
        && (($previous_form['estadoImporte'] ?? '') !== 'IMPORTE_CONFIRMADO'
            || ($previous_form['importeConfirmadoAt'] ?? '') !== ($merged_form['importeConfirmadoAt'] ?? ''));
    $clean_form = array();
    $binary_keys = array('certificadoAnssalArchivo', 'polizaPraxisArchivo', 'planoMunicipalArchivo', 'certificadoBomberosArchivo', 'comprobantePagoArchivo', 'reciboPagoArchivo', 'certificadoUrl', 'certificadoConsultorioUrl', 'certificadoEticaUrl');
    foreach ($merged_form as $key => $value) {
        $key = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $key);
        if ($key === '') continue;
        if ((in_array($key, $binary_keys, true) || preg_match('/^(certificadoAnssalArchivoAdjunto|polizaPraxisArchivoAdjunto)(2)?$/', $key)) && is_string($value) && strpos($value, 'data:') === 0) {
            $attachment = cokifimi_dj_store_consultorio_attachment($record_id, $key, $value);
            if (is_wp_error($attachment)) return $attachment;
            if ($attachment) {
                $clean_form[$key] = $attachment['url'];
                $clean_form[$key . 'Nombre'] = $attachment['name'];
                $clean_form[$key . 'Mime'] = $attachment['mime'];
                $clean_form[$key . 'Id'] = $attachment['id'];
                continue;
            }
        }
        $clean_form[$key] = is_bool($value) ? $value : sanitize_textarea_field((string) $value);
    }
    if (($clean_form['estadoAdmin'] ?? '') !== 'APROBADO') {
        foreach (array('certificadoNombre', 'certificadoUrl', 'certificadoConsultorioNombre', 'certificadoConsultorioUrl', 'certificadoEticaNombre', 'certificadoEticaUrl') as $certificate_field) {
            $clean_form[$certificate_field] = '';
        }
        $clean_form['validadoAdmin'] = false;
    }
    if ($request_id) {
        $updated_request = false;
        foreach ($requests as $index => $request_item) {
            if (is_array($request_item) && sanitize_key($request_item['id'] ?? '') === $request_id) {
                $requests[$index]['formularioHabilitacionConsultorio'] = $clean_form;
                $updated_request = true;
                break;
            }
        }
        if (!$updated_request) return new WP_Error('consultorio_request_not_found', 'Solicitud de Alta no encontrada.', array('status' => 404));
        $record['consultorioSolicitudes'] = $requests;
    } else {
        $record['formularioHabilitacionConsultorio'] = $clean_form;
    }
    $record['updatedAt'] = current_time('mysql', true);
    $updated = $wpdb->update(cokifimi_dj_table_name(), array('payload' => wp_json_encode($record), 'updated_at' => $record['updatedAt']), array('record_id' => $record_id), array('%s', '%s'), array('%s'));
    if ($updated === false) return new WP_Error('consultorio_not_saved', 'No se pudo guardar el Alta.', array('status' => 500));
    if ($should_notify_amount && is_email($record['email'] ?? '')) {
        $notification_record = $record;
        $notification_record['formularioHabilitacionConsultorio'] = $clean_form;
        $notification_record['consultorioSolicitudId'] = $request_id;
        wp_schedule_single_event(time() + 1, 'cokifimi_send_consultorio_amount_email', array($notification_record));
    }
    return rest_ensure_response($record);
}function cokifimi_dj_register_rest_routes() {
    register_rest_route('cokifimi/v1', '/auth/login', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_portal_login',
        'permission_callback' => '__return_true',
    ));
    register_rest_route('cokifimi/v1', '/auth/logout', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_portal_logout',
        'permission_callback' => 'cokifimi_dj_portal_permission',
    ));
    register_rest_route('cokifimi/v1', '/member/request-code', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_member_request_code',
        'permission_callback' => '__return_true',
    ));
    register_rest_route('cokifimi/v1', '/member/verify', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_member_verify_and_create_token',
        'permission_callback' => '__return_true',
    ));
    register_rest_route('cokifimi/v1', '/member/login', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_member_login',
        'permission_callback' => '__return_true',
    ));
    register_rest_route('cokifimi/v1', '/member/me', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'cokifimi_dj_member_me',
        'permission_callback' => 'cokifimi_dj_member_permission',
    ));
    register_rest_route('cokifimi/v1', '/member/record', array(
        'methods' => array(WP_REST_Server::CREATABLE, WP_REST_Server::EDITABLE),
        'callback' => 'cokifimi_dj_member_save_record',
        'permission_callback' => 'cokifimi_dj_member_permission',
    ));
    register_rest_route('cokifimi/v1', '/member/consultorios', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_member_add_consultorio',
        'permission_callback' => 'cokifimi_dj_member_permission',
    ));
    register_rest_route('cokifimi/v1', '/member/attached-professionals', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_member_manage_attached',
        'permission_callback' => 'cokifimi_dj_member_permission',
    ));
    register_rest_route('cokifimi/v1', '/member/logout', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_member_logout',
        'permission_callback' => 'cokifimi_dj_member_permission',
    ));
    register_rest_route('cokifimi/v1', '/member/sync-legacy-account', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_sync_legacy_member_account',
        'permission_callback' => 'cokifimi_dj_portal_permission',
    ));
    register_rest_route('cokifimi/v1', '/member/delete-account', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_delete_member_account',
        'permission_callback' => 'cokifimi_dj_portal_permission',
    ));
    register_rest_route('cokifimi/v1', '/consultorio/update', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_update_consultorio',
        'permission_callback' => 'cokifimi_dj_portal_permission',
    ));    register_rest_route('cokifimi/v1', '/consultorio/notify-resolution', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_notify_consultorio_resolution',
        'permission_callback' => 'cokifimi_dj_portal_permission',
    ));
    register_rest_route('cokifimi/v1', '/consultorio/notify-amount', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'cokifimi_dj_notify_consultorio_amount',
        'permission_callback' => 'cokifimi_dj_portal_permission',
    ));
    register_rest_route('cokifimi/v1', '/records', array(
        array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'cokifimi_dj_list_records',
            'permission_callback' => 'cokifimi_dj_portal_permission',
        ),
        array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => 'cokifimi_dj_save_record',
            'permission_callback' => '__return_true',
        ),
    ));
    register_rest_route('cokifimi/v1', '/records/lookup', array(
        'methods' => WP_REST_Server::READABLE,
        'callback' => 'cokifimi_dj_lookup_record',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('cokifimi/v1', '/records/(?P<id>[a-zA-Z0-9_-]+)', array(
        array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => 'cokifimi_dj_get_record',
            'permission_callback' => 'cokifimi_dj_portal_permission',
        ),
        array(
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => 'cokifimi_dj_save_record',
            'permission_callback' => 'cokifimi_dj_portal_permission',
        ),
        array(
            'methods' => WP_REST_Server::DELETABLE,
            'callback' => 'cokifimi_dj_delete_record',
            'permission_callback' => 'cokifimi_dj_portal_permission',
        ),
    ));
    register_rest_route('cokifimi/v1', '/records/(?P<id>[a-zA-Z0-9_-]+)/consultorio', array(
        'methods' => WP_REST_Server::DELETABLE,
        'callback' => 'cokifimi_dj_delete_consultorio',
        'permission_callback' => 'cokifimi_dj_portal_permission',
    ));
}
add_action('rest_api_init', 'cokifimi_dj_register_rest_routes');

function cokifimi_dj_manifest_candidates() {
    return array(
        COKIFIMI_DJ_DIR . 'build/vite/.vite/manifest.json',
        COKIFIMI_DJ_DIR . 'build/vite/manifest.json',
        COKIFIMI_DJ_DIR . 'vite/.vite/manifest.json',
        COKIFIMI_DJ_DIR . 'vite/manifest.json',
        COKIFIMI_DJ_DIR . 'build/.vite/manifest.json',
        COKIFIMI_DJ_DIR . 'build/manifest.json',
        COKIFIMI_DJ_DIR . 'dist/manifest.json',
        COKIFIMI_DJ_DIR . 'dist/.vite/manifest.json',
    );
}

function cokifimi_dj_assets_directory($manifest_path) {
    if (strpos($manifest_path, COKIFIMI_DJ_DIR . 'build' . DIRECTORY_SEPARATOR . 'vite' . DIRECTORY_SEPARATOR) === 0) {
        return 'build/vite';
    }

    if (strpos($manifest_path, COKIFIMI_DJ_DIR . 'vite' . DIRECTORY_SEPARATOR) === 0) {
        return 'vite';
    }

    if (strpos($manifest_path, COKIFIMI_DJ_DIR . 'dist' . DIRECTORY_SEPARATOR) === 0) {
        return 'dist';
    }

    return 'build';
}

function cokifimi_dj_locate_manifest() {
    foreach (cokifimi_dj_manifest_candidates() as $candidate) {
        if (file_exists($candidate)) {
            return $candidate;
        }
    }

    return '';
}

function cokifimi_dj_read_manifest() {
    $manifest_path = cokifimi_dj_locate_manifest();

    if (!$manifest_path) {
        return array();
    }

    $contents = file_get_contents($manifest_path);
    if ($contents === false) {
        return array();
    }

    $manifest = json_decode($contents, true);
    if (!is_array($manifest)) {
        return array();
    }

    return $manifest;
}

function cokifimi_dj_find_entry(array $manifest) {
    if (isset($manifest['index.html']) && is_array($manifest['index.html'])) {
        return $manifest['index.html'];
    }

    foreach ($manifest as $entry) {
        if (is_array($entry) && !empty($entry['isEntry'])) {
            return $entry;
        }
    }

    foreach ($manifest as $entry) {
        if (is_array($entry) && !empty($entry['file'])) {
            return $entry;
        }
    }

    return array();
}

function cokifimi_dj_enqueue_assets() {
    static $enqueued = false;

    if ($enqueued) {
        return true;
    }

    $manifest_path = cokifimi_dj_locate_manifest();
    $manifest = cokifimi_dj_read_manifest();
    if (empty($manifest)) {
        return false;
    }

    $asset_version = $manifest_path && file_exists($manifest_path)
        ? (string) filemtime($manifest_path)
        : COKIFIMI_DJ_VERSION;

    $entry = cokifimi_dj_find_entry($manifest);
    if (empty($entry) || empty($entry['file'])) {
        return false;
    }

    $assets_directory = cokifimi_dj_assets_directory($manifest_path);
    $base_url = trailingslashit(COKIFIMI_DJ_URL . $assets_directory);
    $script_url = $base_url . ltrim($entry['file'], '/');

    if (!empty($entry['css']) && is_array($entry['css'])) {
        foreach ($entry['css'] as $index => $css_file) {
            wp_enqueue_style(
                'cokifimi-dj-style-' . $index,
                $base_url . ltrim($css_file, '/'),
                array(),
                $asset_version
            );
        }
    }

    wp_enqueue_script(
        'cokifimi-dj-app',
        $script_url,
        array(),
        $asset_version,
        true
    );

    $enqueued = true;
    return true;
}

function cokifimi_dj_script_loader_tag($tag, $handle, $src) {
    if ($handle === 'cokifimi-dj-app') {
        return '<script type="module" src="' . esc_url($src) . '" id="' . esc_attr($handle) . '-js"></script>' . "\n";
    }

    return $tag;
}
add_filter('script_loader_tag', 'cokifimi_dj_script_loader_tag', 10, 3);

function cokifimi_dj_render_mount_point($mode = 'public') {
    if (!cokifimi_dj_enqueue_assets()) {
        return '<div class="cokifimi-wordpress-shell"><div class="notice notice-warning"><p>El build del formulario todavia no esta disponible. Genera los assets con <code>npm run build</code>.</p></div></div>';
    }

    $root_id = 'cokifimi-formulario-root-' . wp_unique_id('cokifimi-');
    $settings = array(
        'apiBase' => esc_url_raw(rest_url('cokifimi/v1')),
        'isAdmin' => $mode === 'wp-admin',
        'mode' => $mode,
        'nonce' => wp_create_nonce('wp_rest'),
    );

    wp_localize_script('cokifimi-dj-app', 'cokifimiSettings', $settings);

    $json_settings = wp_json_encode($settings);

    return '<div class="cokifimi-wordpress-shell"><div id="' . esc_attr($root_id) . '" data-cokifimi-root="true" data-cokifimi-mode="' . esc_attr($mode) . '"></div></div>'
        . '<script>window.cokifimiSettings = Object.assign(window.cokifimiSettings || {}, ' . $json_settings . ');</script>';
}

function cokifimi_dj_shortcode() {
    return cokifimi_dj_render_mount_point();
}

function cokifimi_dj_portal_shortcode() {
    return cokifimi_dj_render_mount_point('portal');
}

function cokifimi_dj_member_shortcode() {
    return cokifimi_dj_render_mount_point('member');
}

function cokifimi_dj_member_no_token_shortcode() {
    return cokifimi_dj_render_mount_point('member-no-token');
}

function cokifimi_dj_member_registration_shortcode() {
    return cokifimi_dj_render_mount_point('member-register');
}

function cokifimi_dj_register_shortcodes() {
    add_shortcode('cokifimi_declaracion_jurada', 'cokifimi_dj_shortcode');
    add_shortcode('cokifimi_formulario', 'cokifimi_dj_shortcode');
    add_shortcode('cokifimi_admin', 'cokifimi_dj_portal_shortcode');
    add_shortcode('cokifimi_colegiado', 'cokifimi_dj_member_shortcode');
    add_shortcode('cokifimi_colegiado_sin_token', 'cokifimi_dj_member_no_token_shortcode');
    add_shortcode('cokifimi_colegiado_registro', 'cokifimi_dj_member_registration_shortcode');
}
add_action('init', 'cokifimi_dj_register_shortcodes');

function cokifimi_dj_render_missing_build_notice() {
    if (!current_user_can('manage_cokifimi_records') && !current_user_can('manage_options')) {
        return;
    }

    echo '<div class="notice notice-warning"><p><strong>COKIFIMI Declaracion Jurada:</strong> falta generar el build dentro de <code>wordpress-plugin/build</code>. Ejecuta <code>npm run build</code> antes de activar el plugin en produccion.</p></div>';
}

function cokifimi_dj_render_admin_page() {
    echo '<div class="wrap">';
    echo '<h1>Declaracion Jurada-token</h1>';
    echo '<p>Registros guardados en la base de datos. Busca por DNI o nombre para ver, editar, imprimir o eliminar una declaración.</p>';
    echo cokifimi_dj_render_mount_point('wp-admin');
    echo '</div>';
}

function cokifimi_dj_register_admin_menu() {
    add_menu_page(
        'Declaracion Jurada',
        'Declaracion Jurada',
        'manage_cokifimi_records',
        'cokifimi-declaracion-jurada',
        'cokifimi_dj_render_admin_page',
        'dashicons-media-document',
        26
    );
    add_submenu_page(
        'cokifimi-declaracion-jurada',
        'Registros cargados',
        'Registros cargados',
        'manage_cokifimi_records',
        'cokifimi-registros-cargados',
        'cokifimi_dj_render_records_page'
    );
}
add_action('admin_menu', 'cokifimi_dj_register_admin_menu');

function cokifimi_dj_render_records_page() {
    if (!current_user_can('manage_cokifimi_records')) {
        wp_die('No tienes permisos para administrar los registros.');
    }

    global $wpdb;
    $message = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['cokifimi_dj_delete_record'])) {
        check_admin_referer('cokifimi_dj_delete_record');
        $record_id = sanitize_key(wp_unslash($_POST['record_id'] ?? ''));
        $deleted = $record_id ? $wpdb->delete(cokifimi_dj_table_name(), array('record_id' => $record_id), array('%s')) : false;
        $message = $deleted
            ? '<div class="notice notice-success is-dismissible"><p>Registro eliminado correctamente.</p></div>'
            : '<div class="notice notice-error is-dismissible"><p>No se pudo eliminar el registro o ya no existe.</p></div>';
    }

    $rows = $wpdb->get_results('SELECT * FROM ' . cokifimi_dj_table_name() . ' ORDER BY updated_at DESC LIMIT 5000');
    echo '<div class="wrap"><h1>Registros cargados</h1>';
    echo $message;
    echo '<p>Desde aquí puedes consultar y eliminar registros sin acceder a phpMyAdmin.</p>';
    echo '<table class="widefat striped"><thead><tr><th>Apellido</th><th>Nombre/s</th><th>DNI</th><th>Matrícula</th><th>Última actualización</th><th>Acción</th></tr></thead><tbody>';
    if ($rows) {
        foreach ($rows as $row) {
            $record = cokifimi_dj_decode_record($row);
            echo '<tr>';
            echo '<td>' . esc_html($record['apellido'] ?? '') . '</td>';
            echo '<td>' . esc_html($record['nombres'] ?? '') . '</td>';
            echo '<td>' . esc_html($record['dni'] ?? '') . '</td>';
            echo '<td>' . esc_html($record['matricula'] ?? '') . '</td>';
            echo '<td>' . esc_html($row->updated_at) . '</td>';
            echo '<td><form method="post">';
            wp_nonce_field('cokifimi_dj_delete_record');
            echo '<input type="hidden" name="record_id" value="' . esc_attr($row->record_id) . '">';
            echo '<button type="submit" name="cokifimi_dj_delete_record" class="button button-link-delete" onclick="return confirm(\'¿Eliminar definitivamente este registro?\');">Eliminar</button>';
            echo '</form></td>';
            echo '</tr>';
        }
    } else {
        echo '<tr><td colspan="6">No hay registros cargados.</td></tr>';
    }
    echo '</tbody></table></div>';
}

function cokifimi_dj_render_access_settings_legacy() {
    if (!current_user_can('manage_options')) {
        wp_die('No tienes permisos para configurar este acceso.');
    }

    $message = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['cokifimi_dj_save_access'])) {
        check_admin_referer('cokifimi_dj_save_access');
        $password = (string) ($_POST['cokifimi_dj_password'] ?? '');
        $confirmation = (string) ($_POST['cokifimi_dj_password_confirmation'] ?? '');
        if (strlen($password) < 8) {
            $message = '<div class="notice notice-error"><p>La contraseña debe tener al menos 8 caracteres.</p></div>';
        } elseif ($password !== $confirmation) {
            $message = '<div class="notice notice-error"><p>Las contraseñas no coinciden.</p></div>';
        } else {
            update_option('cokifimi_dj_portal_password_hash', wp_hash_password($password));
            $message = '<div class="notice notice-success"><p>Acceso independiente actualizado correctamente.</p></div>';
        }
    }

    $page_id = (int) get_option('cokifimi_dj_portal_page_id');
    $portal_url = $page_id ? get_permalink($page_id) : home_url('/cokifimi-admin/');
    echo '<div class="wrap"><h1>Acceso independiente COKIFIMI</h1>';
    echo $message;
    echo '<p><strong>URL:</strong> <a href="' . esc_url($portal_url) . '" target="_blank" rel="noopener">' . esc_html($portal_url) . '</a></p>';
    echo '<p><strong>Usuario:</strong> ' . esc_html(COKIFIMI_DJ_PORTAL_USER) . '</p>';
    echo '<form method="post">';
    wp_nonce_field('cokifimi_dj_save_access');
    echo '<table class="form-table"><tr><th><label for="cokifimi_dj_password">Nueva contraseña</label></th><td><input type="password" class="regular-text" id="cokifimi_dj_password" name="cokifimi_dj_password" required minlength="8" autocomplete="new-password"></td></tr>';
    echo '<tr><th><label for="cokifimi_dj_password_confirmation">Repetir contraseña</label></th><td><input type="password" class="regular-text" id="cokifimi_dj_password_confirmation" name="cokifimi_dj_password_confirmation" required minlength="8" autocomplete="new-password"></td></tr></table>';
    echo '<p><button type="submit" name="cokifimi_dj_save_access" class="button button-primary">Guardar contraseña</button></p></form></div>';
}

function cokifimi_dj_render_access_settings() {
    if (!current_user_can('manage_options')) {
        wp_die('No tienes permisos para configurar este acceso.');
    }

    $message = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['cokifimi_dj_access_action'])) {
        check_admin_referer('cokifimi_dj_save_access');
        $action = sanitize_key($_POST['cokifimi_dj_access_action']);
        $users = cokifimi_dj_portal_users();
        $username = sanitize_user(wp_unslash($_POST['cokifimi_dj_username'] ?? ''), true);

        if ($action === 'delete') {
            if (isset($users[$username])) {
                unset($users[$username]);
                update_option('cokifimi_dj_portal_users', $users);
                $message = '<div class="notice notice-success"><p>Usuario eliminado correctamente.</p></div>';
            }
        } else {
            $password = (string) ($_POST['cokifimi_dj_password'] ?? '');
            $confirmation = (string) ($_POST['cokifimi_dj_password_confirmation'] ?? '');
            if (!$username || strlen($username) < 3 || strlen($username) > 60) {
                $message = '<div class="notice notice-error"><p>Indica un usuario válido de entre 3 y 60 caracteres.</p></div>';
            } elseif (strlen($password) < 8) {
                $message = '<div class="notice notice-error"><p>La contraseña debe tener al menos 8 caracteres.</p></div>';
            } elseif ($password !== $confirmation) {
                $message = '<div class="notice notice-error"><p>Las contraseñas no coinciden.</p></div>';
            } else {
                $users[$username] = wp_hash_password($password);
                update_option('cokifimi_dj_portal_users', $users);
                $message = '<div class="notice notice-success"><p>Usuario y contraseña guardados correctamente.</p></div>';
            }
        }
    }

    $page_id = (int) get_option('cokifimi_dj_portal_page_id');
    $portal_url = $page_id ? get_permalink($page_id) : home_url('/cokifimi-admin/');
    $users = cokifimi_dj_portal_users();
    echo '<div class="wrap"><h1>Acceso independiente COKIFIMI</h1>' . $message;
    echo '<p><strong>URL:</strong> <a href="' . esc_url($portal_url) . '" target="_blank" rel="noopener">' . esc_html($portal_url) . '</a></p>';
    echo '<h2>Usuarios con acceso</h2>';
    if ($users) {
        echo '<table class="widefat striped" style="max-width:700px"><thead><tr><th>Usuario</th><th>Acción</th></tr></thead><tbody>';
        foreach ($users as $registered_username => $unused_hash) {
            echo '<tr><td>' . esc_html($registered_username) . '</td><td><form method="post" style="display:inline">';
            wp_nonce_field('cokifimi_dj_save_access');
            echo '<input type="hidden" name="cokifimi_dj_access_action" value="delete"><input type="hidden" name="cokifimi_dj_username" value="' . esc_attr($registered_username) . '"><button type="submit" class="button" onclick="return confirm(\'¿Eliminar este usuario?\');">Eliminar</button></form></td></tr>';
        }
        echo '</tbody></table>';
    } else {
        echo '<p>Aún no hay usuarios configurados.</p>';
    }
    echo '<h2>Añadir o actualizar usuario</h2><form method="post">';
    wp_nonce_field('cokifimi_dj_save_access');
    echo '<input type="hidden" name="cokifimi_dj_access_action" value="save"><table class="form-table"><tr><th><label for="cokifimi_dj_username">Usuario</label></th><td><input type="text" class="regular-text" id="cokifimi_dj_username" name="cokifimi_dj_username" required minlength="3" maxlength="60" autocomplete="username"><p class="description">Escribe un usuario nuevo o uno existente para cambiar su contraseña.</p></td></tr>';
    echo '<tr><th><label for="cokifimi_dj_password">Nueva contraseña</label></th><td><input type="password" class="regular-text" id="cokifimi_dj_password" name="cokifimi_dj_password" required minlength="8" autocomplete="new-password"></td></tr><tr><th><label for="cokifimi_dj_password_confirmation">Repetir contraseña</label></th><td><input type="password" class="regular-text" id="cokifimi_dj_password_confirmation" name="cokifimi_dj_password_confirmation" required minlength="8" autocomplete="new-password"></td></tr></table>';
    echo '<p><button type="submit" class="button button-primary">Guardar usuario y contraseña</button></p></form></div>';
}

function cokifimi_dj_register_access_settings() {
    add_submenu_page(
        'cokifimi-declaracion-jurada',
        'Configurar acceso independiente',
        'Configurar acceso',
        'manage_options',
        'cokifimi-acceso',
        'cokifimi_dj_render_access_settings'
    );
}
add_action('admin_menu', 'cokifimi_dj_register_access_settings');

function cokifimi_dj_restrict_admin_menu() {
    if (!current_user_can('manage_cokifimi_records') || current_user_can('manage_options')) {
        return;
    }

    foreach (array(
        'index.php',
        'edit.php',
        'upload.php',
        'edit.php?post_type=page',
        'edit-comments.php',
        'themes.php',
        'plugins.php',
        'users.php',
        'tools.php',
        'options-general.php',
    ) as $menu_slug) {
        remove_menu_page($menu_slug);
    }
}
add_action('admin_menu', 'cokifimi_dj_restrict_admin_menu', 999);

function cokifimi_dj_admin_notices() {
    $screen = function_exists('get_current_screen') ? get_current_screen() : null;

    if (!$screen || $screen->id !== 'toplevel_page_cokifimi-declaracion-jurada') {
        return;
    }

    if (!cokifimi_dj_locate_manifest()) {
        cokifimi_dj_render_missing_build_notice();
    }
}
add_action('admin_notices', 'cokifimi_dj_admin_notices');
