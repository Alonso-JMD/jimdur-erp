"use client";

import Link from "next/link";

export default function InstallMobile() {
  return (
    <main className="desktop-installer-shell">
      <section className="desktop-installer-card">
        <div className="desktop-installer-brand">
          <img src="/jimdur-icon-512.png" alt="JIMDUR ERP" />
          <div>
            <span>APLICACIÓN DE ESCRITORIO</span>
            <h1>JIMDUR ERP</h1>
            <p>Inventario, pedidos y despachos en una ventana propia de Windows.</p>
          </div>
        </div>
        <div className="desktop-installer-features">
          <div><b>01</b><span><strong>Acceso directo</strong><small>Ícono de JIMDUR ERP en el escritorio y menú Inicio.</small></span></div>
          <div><b>02</b><span><strong>Ventana independiente</strong><small>Abre el sistema como aplicación, sin pestañas del navegador.</small></span></div>
          <div><b>03</b><span><strong>Datos centralizados</strong><small>Trabaja siempre con la misma información segura y actualizada.</small></span></div>
        </div>
        <a className="desktop-installer-download" href="/JIMDUR_ERP_WINDOWS.zip" download>
          <span>↓</span>
          <div><strong>DESCARGAR INSTALADOR</strong><small>JIMDUR ERP para Windows 10 y 11</small></div>
        </a>
        <div className="desktop-installer-steps">
          <strong>INSTALACIÓN RÁPIDA</strong>
          <ol>
            <li>Descarga y descomprime el archivo ZIP.</li>
            <li>Abre INSTALAR_JIMDUR_WINDOWS.cmd.</li>
            <li>Windows creará el acceso de JIMDUR ERP automáticamente.</li>
          </ol>
        </div>
        <Link className="desktop-installer-open" href="/">VOLVER AL SISTEMA</Link>
        <small className="desktop-installer-note">No borra información ni duplica datos; crea una aplicación vinculada al sistema oficial.</small>
      </section>
    </main>
  );
}
