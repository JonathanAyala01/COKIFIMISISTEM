#!/usr/bin/env php
<?php
/** COKIFIMI data URL migration. Dry-run by default.
 * php migrate-historical-data-urls.php --wp-load=/path/wp-load.php [--batch-size=50]
 * php migrate-historical-data-urls.php --wp-load=/public_html/prueba/wp-load.php --apply --test-db=wordpress_test --staging
 */
if(PHP_SAPI!=='cli'){fwrite(STDERR,"CLI only.\n");exit(1);}
$o=getopt('',array('wp-load:','batch-size::','apply','test-db:','staging','help'));
if(isset($o['help'])||empty($o['wp-load'])){fwrite(STDOUT,"Usage: php migrate-historical-data-urls.php --wp-load=/absolute/path/wp-load.php [--batch-size=50] [--apply --test-db=DATABASE_NAME --staging]\nApply requires all three flags: --apply, --test-db=<exact DB name>, and --staging. wp-load.php realpath must end in /public_html/prueba/wp-load.php.\n");exit(isset($o['help'])?0:1);}
$load=realpath($o['wp-load']);if(!$load||basename($load)!=='wp-load.php'){fwrite(STDERR,"--wp-load must be an existing wp-load.php.\n");exit(1);}
$apply=isset($o['apply']);
if($apply&&(!isset($o['staging'])||empty($o['test-db']))){fwrite(STDERR,"Refusing --apply: require --apply, --test-db=<exact DB name>, and --staging together.\n");exit(1);}
$canonical_load=str_replace('\\','/',$load);
if($apply&&!preg_match('~/public_html/prueba/wp-load\.php$~D',$canonical_load)){fwrite(STDERR,"Refusing --apply: wp-load.php realpath must end in /public_html/prueba/wp-load.php.\n");exit(1);}
$batch=isset($o['batch-size'])?(int)$o['batch-size']:50;if($batch<1||$batch>500){fwrite(STDERR,"--batch-size must be between 1 and 500.\n");exit(1);}require_once $load;
global $wpdb;$table=$wpdb->prefix.'cokifimi_dj_records';$db=defined('DB_NAME')?(string)DB_NAME:'';$env=wp_get_environment_type();
if($apply&&!hash_equals($db,(string)$o['test-db'])){fwrite(STDERR,"Refusing --apply: current DB does not exactly match --test-db (current: $db).\n");exit(1);}if($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s',$table))!==$table){fwrite(STDERR,"Table not found: $table\n");exit(1);}
function cokifimi_hdu_walk($v,$id,$apply,&$s,&$made,&$invalid_headers){if(is_array($v)){foreach($v as $k=>$x)$v[$k]=cokifimi_hdu_walk($x,$id,$apply,$s,$made,$invalid_headers);return $v;}if(!is_string($v)||strpos($v,'data:')!==0)return $v;if(!preg_match('~^data:([a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+)((?:;[a-zA-Z0-9!#$&^_.+-]+(?:=[^;,\r\n]*)?)*)?;base64,(.*)$~sD',$v,$m)){$s['invalid_format']++;$header=strstr($v,',',true);if($header===false)$header=$v;$header=substr($header,0,120);$invalid_headers[$header]=($invalid_headers[$header]??0)+1;return $v;}$ext=array('application/pdf'=>'pdf','image/jpeg'=>'jpg','image/png'=>'png','image/gif'=>'gif','image/webp'=>'webp','image/bmp'=>'bmp','image/tiff'=>'tiff','application/x-zip-compressed'=>'zip','image/heic'=>'heic','message/rfc822'=>'eml');$mime=strtolower($m[1]);if(!isset($ext[$mime])){$s['unsupported_mime']++;$s['unsupported_mimes'][$mime]=($s['unsupported_mimes'][$mime]??0)+1;return $v;}$base64=preg_replace('/\\s+/','',$m[3]);if($base64===''){$s['empty_data']++;return $v;}$bin=base64_decode($base64,true);if($bin===false){$s['invalid_base64']++;return $v;}$s['files']++;$s['bytes']+=strlen($bin);if(!$apply)return '__COKIFIMI_MIGRATION_URL__';$u=wp_upload_dir();if(!empty($u['error']))throw new RuntimeException($u['error']);$dir=trailingslashit($u['basedir']).'cokifimi-historical';if(!wp_mkdir_p($dir))throw new RuntimeException('Cannot create '.$dir);$name=sanitize_file_name($id.'-'.hash('sha256',$bin).'.'.$ext[$mime]);$path=trailingslashit($dir).$name;if(file_exists($path)){if(!is_file($path)||!hash_equals(hash_file('sha256',$path),hash('sha256',$bin)))throw new RuntimeException('Conflicting file: '.$path);}elseif(file_put_contents($path,$bin,LOCK_EX)!==strlen($bin))throw new RuntimeException('Cannot write: '.$path);else $made[]=$path;return trailingslashit($u['baseurl']).'cokifimi-historical/'.rawurlencode($name);}
fwrite(STDOUT,sprintf("Mode: %s | DB: %s | environment: %s | batch size: %d\n",$apply?'APPLY':'DRY RUN',$db,$env?:'(unset)',$batch));$last='';$t=array('records'=>0,'changed'=>0,'files'=>0,'bytes'=>0,'invalid_format'=>0,'invalid_headers'=>array(),'unsupported_mime'=>0,'invalid_base64'=>0,'empty_data'=>0,'unsupported_mimes'=>array(),'errors'=>0);
do {
    $sql = $wpdb->prepare(
        "SELECT record_id, payload
         FROM {$table}
         WHERE record_id > %s
           AND payload LIKE %s
         ORDER BY record_id ASC
         LIMIT %d",
        $last,
        '%base64,%',
        $batch
    );
    $rows = $wpdb->get_results($sql);
    
foreach($rows as $r){$last=$r->record_id;$t['records']++;$p=json_decode($r->payload,true);if(!is_array($p)){$t['errors']++;fwrite(STDERR,"$r->record_id: invalid JSON; skipped.\n");continue;}$s=array('files'=>0,'bytes'=>0,'invalid_format'=>0,'unsupported_mime'=>0,'invalid_base64'=>0,'empty_data'=>0,'unsupported_mimes'=>array());$made=array();$invalid_headers=array();try{$n=cokifimi_hdu_walk($p,$r->record_id,$apply,$s,$made,$invalid_headers);foreach(array('files','bytes','invalid_format','unsupported_mime','invalid_base64','empty_data') as $k)$t[$k]+=$s[$k];foreach($invalid_headers as $header=>$count)$t['invalid_headers'][$header]=($t['invalid_headers'][$header]??0)+$count;foreach($s['unsupported_mimes'] as $mime=>$count)$t['unsupported_mimes'][$mime]=($t['unsupported_mimes'][$mime]??0)+$count;if(!$s['files'])continue;$t['changed']++;if($apply){$json=wp_json_encode($n);if($json===false)throw new RuntimeException('Could not encode payload.');if($wpdb->query($wpdb->prepare("UPDATE $table SET payload=%s WHERE record_id=%s AND payload=%s",$json,$r->record_id,$r->payload))!==1)throw new RuntimeException('Payload changed concurrently; record left untouched.');}fwrite(STDOUT,"$r->record_id: $s[files] attachment(s) ".($apply?'migrated':'would migrate').".\n");}catch(Throwable $e){foreach($made as $f)if(is_file($f))unlink($f);$t['errors']++;fwrite(STDERR,"$r->record_id: ".$e->getMessage()."\n");}}
} while (count($rows) === $batch);
fwrite(STDOUT,sprintf("Done. Records scanned: %d; payloads %s: %d; attachments: %d; bytes: %d; errors: %d.\n",$t['records'],$apply?'updated':'that would change',$t['changed'],$t['files'],$t['bytes'],$t['errors']));
fwrite(STDOUT,sprintf("Invalid data URLs (no payloads shown):\ninvalid_format=%d\nunsupported_mime=%d\ninvalid_base64=%d\nempty_data=%d\n",$t['invalid_format'],$t['unsupported_mime'],$t['invalid_base64'],$t['empty_data']));
if($t['invalid_headers']){ksort($t['invalid_headers']);fwrite(STDOUT,"Invalid format headers:\n");foreach($t['invalid_headers'] as $header=>$count)fwrite(STDOUT,sprintf("- %s: %d\n",$header,$count));}
if($t['unsupported_mimes']){ksort($t['unsupported_mimes']);fwrite(STDOUT,"Unsupported MIME:\n");foreach($t['unsupported_mimes'] as $mime=>$count)fwrite(STDOUT,sprintf("- %s: %d\n",$mime,$count));}
if(!$apply)fwrite(STDOUT,"Dry run only: no files or database rows were changed. Use --apply --test-db=<exact test DB name> after review.\n");exit($t['errors']?2:0);
