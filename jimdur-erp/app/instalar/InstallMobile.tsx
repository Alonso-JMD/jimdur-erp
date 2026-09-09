"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function PwaInstallCard() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const isStandalone = () =>
      mediaQuery.matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const syncInstalled = () => setInstalled(isStandalone());
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    syncInstalled();
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    mediaQuery.addEventListener?.("change", syncInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      mediaQuery.removeEventListener?.("change", syncInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    setBusy(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } finally {
      setInstallPrompt(null);
      setBusy(false);
    }
  };

  return (
    <section className="desktop-installer-pwa">
      <span>APLICACIÓN WEB INSTALABLE</span>
      <h2>Instala JIMDUR como aplicativo</h2>
      <p>
        Se abrirá en una ventana propia, con su ícono y acceso directo, usando
        la misma información centralizada del sistema.
      </p>
      {installed ? (
        <div className="desktop-installer-pwa-success">
          ✓ JIMDUR ERP ya está instalado en este dispositivo.
        </div>
      ) : installPrompt ? (
        <button
          className="desktop-installer-pwa-button"
          type="button"
          onClick={() => void install()}
          disabled={busy}
        >
          {busy ? "INSTALANDO…" : "INSTALAR JIMDUR ERP"}
        </button>
      ) : (
        <ol className="desktop-installer-pwa-steps">
          <li>Abre esta página en Chrome o Edge.</li>
          <li>Selecciona el ícono de instalación en la barra de direcciones.</li>
          <li>Confirma con “Instalar”.</li>
        </ol>
      )}
    </section>
  );
}

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
        <PwaInstallCard />
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
