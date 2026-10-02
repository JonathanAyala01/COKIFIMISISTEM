import React from 'react';
// @ts-ignore
import cokifimiLogo from '@/logo.png';

interface LogoProps {
  className?: string;
  size?: number;
}

export default function CoKiFiMiLogo({ className = '', size = 80 }: LogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`} style={{ height: size }}>
      <img
        src={cokifimiLogo}
        alt="COKIFIMI Logo"
        style={{ width: size, height: size }}
        className="shrink-0 object-contain rounded-lg border border-gray-150 shadow-sm bg-white"
        referrerPolicy="no-referrer"
      />
      <div className="flex flex-col text-left leading-tight">
        <span className="font-sans font-bold text-[#0F5A3E] text-base md:text-lg tracking-tight">
          Colegio de Kinesiólogos y Fisioterapeutas
        </span>
        <span className="font-sans font-semibold text-gray-700 text-sm tracking-wide">
          de la Provincia de Misiones
        </span>
        <span className="font-mono text-[9px] text-gray-500 mt-0.5">
          Ley I Nº 55 | Personería Jurídica Nº 894
        </span>
      </div>
    </div>
  );
}
