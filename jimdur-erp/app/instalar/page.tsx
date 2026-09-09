import type { Metadata } from "next";
import InstallMobile from "./InstallMobile";

export const metadata: Metadata = {
  title: "Instalar JIMDUR ERP",
  description: "Instala JIMDUR ERP como aplicación web o acceso de escritorio.",
};

export default function InstallPage() {
  return <InstallMobile />;
}
