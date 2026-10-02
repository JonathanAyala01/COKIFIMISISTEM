-- Base independiente para los registros COKIFIMI.
-- Ejecutar desde phpMyAdmin con un usuario que pueda crear bases y usuarios.

CREATE DATABASE IF NOT EXISTS `cokifimi_registros`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'cokifimi_admin'@'localhost'
  IDENTIFIED BY '';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX
  ON `cokifimi_registros`.*
  TO 'cokifimi_admin'@'localhost';

FLUSH PRIVILEGES;

USE `cokifimi_registros`;

CREATE TABLE IF NOT EXISTS `declaraciones` (
  `id` varchar(100) NOT NULL,
  `dni` varchar(80) NOT NULL DEFAULT '',
  `apellido` varchar(190) NOT NULL DEFAULT '',
  `nombres` varchar(190) NOT NULL DEFAULT '',
  `datos_json` longtext NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_declaraciones_dni` (`dni`),
  KEY `idx_declaraciones_apellido` (`apellido`),
  KEY `idx_declaraciones_nombres` (`nombres`),
  KEY `idx_declaraciones_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_usuarios` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admin_usuarios_usuario` (`usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

