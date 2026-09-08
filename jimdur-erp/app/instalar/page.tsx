import type { Metadata } from "next";
import InstallMobile from "./InstallMobile";

export const metadata: Metadata = {
  title: "Aplicación JIMDUR ERP para Windows",
  description: "Descarga e instala JIMDUR ERP como aplicación de escritorio.",
};

export default function InstallPage() {
  return <InstallMobile />;
}
