"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  AppUser,
  Order,
  Proforma,
  Product,
  Snapshot,
  StockRow,
  Warehouse,
} from "./jimdur-types";
import {
  importOrderFile,
  type ImportedOrderLine,
  type OrderFileImportResult,
} from "./order-file-import";

type AuthStatus = {
  authenticated: boolean;
  setupRequired: boolean;
  mustChangePassword: boolean;
  user: AppUser | null;
};

type ModuleKey =
  | "dashboard"
  | "receipts"
  | "proformas"
  | "orders"
  | "transfers"
  | "inventory"
  | "adjustments"
  | "kardex"
  | "critical"
  | "products"
  | "warehouses"
  | "reports"
  | "users"
  | "backups";

type IconName =
  | "dashboard"
  | "receive"
  | "file"
  | "dispatch"
  | "transfer"
  | "inventory"
  | "adjust"
  | "kardex"
  | "alert"
  | "product"
  | "warehouse"
  | "report"
  | "users"
  | "backup"
  | "refresh"
  | "download"
  | "plus"
  | "edit"
  | "key"
  | "upload"
  | "phone"
  | "shield"
  | "logout"
  | "menu"
  | "check"
  | "lock"
  | "clock";

type ModalKind =
  | "product-new"
  | "product-edit"
  | "receipt"
  | "proforma"
  | "order"
  | "transfer"
  | "adjustment"
  | "warehouse"
  | "user"
  | "password"
  | "import"
  | null;

type RunOperation = (
  payload: Record<string, unknown>,
) => Promise<{ ok: boolean; data?: Record<string, unknown> }>;

type ActionDialogResult = true | string | null;

type ActionDialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  inputLabel?: string;
  inputPlaceholder?: string;
  inputRequired?: boolean;
};

type ActionDialogState = ActionDialogOptions & {
  resolve: (result: ActionDialogResult) => void;
};

type RequestAction = (
  options: ActionDialogOptions,
) => Promise<ActionDialogResult>;

const ALL_PERMISSIONS = [
  "warehouses",
  "products",
  "operations",
  "store_orders",
  "reports",
  "inventory",
  "cancellations",
  "users",
  "imports",
];

const CRITICAL_STOCK_LIMIT = 15;

const MODULES: Record<
  ModuleKey,
  { title: string; subtitle: string; permission?: string }
> = {
  dashboard: { title: "Dashboard", subtitle: "Resumen operativo del almacén" },
  receipts: {
    title: "Recepción de mercadería",
    subtitle: "Ingreso controlado y actualización automática del stock",
    permission: "operations",
  },
  proformas: {
    title: "Proformas",
    subtitle: "Cotizaciones y control comercial",
    permission: "operations",
  },
  orders: {
    title: "Orden de salida / Despacho",
    subtitle: "Preparación, reserva y salida de productos",
    permission: "store_orders",
  },
  transfers: {
    title: "Transferencias",
    subtitle: "Movimiento de stock entre almacenes",
    permission: "operations",
  },
  inventory: {
    title: "Inventario",
    subtitle: "Stock físico, reservado, dañado y disponible",
    permission: "inventory",
  },
  adjustments: {
    title: "Ajustes de stock",
    subtitle: "Ingreso y corrección de existencias con trazabilidad",
    permission: "inventory",
  },
  kardex: {
    title: "Kardex",
    subtitle: "Historial de entradas, salidas y ajustes",
    permission: "inventory",
  },
  critical: {
    title: "Stock crítico",
    subtitle: "Productos activos con menos de 15 unidades disponibles",
    permission: "inventory",
  },
  products: {
    title: "Productos",
    subtitle: "Catálogo maestro de repuestos",
    permission: "products",
  },
  warehouses: {
    title: "Almacenes",
    subtitle: "Existencias consolidadas por ubicación",
    permission: "warehouses",
  },
  reports: {
    title: "Reportes",
    subtitle: "Consulta y exportación de movimientos",
    permission: "reports",
  },
  users: {
    title: "Usuarios",
    subtitle: "Accesos, perfiles y permisos",
    permission: "users",
  },
  backups: {
    title: "Copias y migración",
    subtitle: "Respaldo e importación desde SQL Server",
    permission: "imports",
  },
};

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ key: ModuleKey; label: string; icon: IconName }>;
}> = [
  {
    label: "INICIO",
    items: [{ key: "dashboard", label: "Dashboard", icon: "dashboard" }],
  },
  {
    label: "OPERACIONES",
    items: [
      { key: "receipts", label: "Recepción mercadería", icon: "receive" },
      { key: "proformas", label: "Proformas", icon: "file" },
      { key: "orders", label: "Orden salida / despacho", icon: "dispatch" },
      { key: "transfers", label: "Transferencias", icon: "transfer" },
    ],
  },
  {
    label: "INVENTARIO",
    items: [
      { key: "inventory", label: "Inventario", icon: "inventory" },
      { key: "adjustments", label: "Ajustes de stock", icon: "adjust" },
      { key: "kardex", label: "Kardex", icon: "kardex" },
      { key: "critical", label: "Stock crítico", icon: "alert" },
    ],
  },
  {
    label: "MAESTROS",
    items: [
      { key: "products", label: "Productos", icon: "product" },
      { key: "warehouses", label: "Almacenes", icon: "warehouse" },
    ],
  },
  {
    label: "GESTIÓN",
    items: [{ key: "reports", label: "Reportes", icon: "report" }],
  },
  {
    label: "SISTEMA",
    items: [
      { key: "users", label: "Usuarios", icon: "users" },
      { key: "backups", label: "Copias y migración", icon: "backup" },
    ],
  },
];

const MOBILE_NAV_ITEMS: Array<{
  key: ModuleKey;
  label: string;
  icon: IconName;
}> = [
  { key: "dashboard", label: "Inicio", icon: "dashboard" },
  { key: "orders", label: "Despachos", icon: "dispatch" },
  { key: "inventory", label: "Inventario", icon: "inventory" },
  { key: "kardex", label: "Kardex", icon: "kardex" },
];

const ICON_PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  receive: (
    <>
      <path d="M12 3v11" />
      <path d="m8 10 4 4 4-4" />
      <path d="M4 17v3h16v-3" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  dispatch: (
    <>
      <path d="M3 7h10v10H3z" />
      <path d="M13 10h4l3 3v4h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  transfer: (
    <>
      <path d="M4 8h14" />
      <path d="m15 5 3 3-3 3" />
      <path d="M20 16H6" />
      <path d="m9 13-3 3 3 3" />
    </>
  ),
  inventory: (
    <>
      <rect x="4" y="4" width="16" height="5" rx="1" />
      <rect x="4" y="11" width="16" height="9" rx="1" />
      <path d="M10 14h4" />
    </>
  ),
  adjust: (
    <>
      <path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h9M17 18h3" />
      <circle cx="13" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="15" cy="18" r="2" />
    </>
  ),
  kardex: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h4M8 16h3" />
      <circle cx="16" cy="16" r="2.5" />
      <path d="M16 14.7V16l1 .7" />
    </>
  ),
  alert: (
    <>
      <path d="m12 3 9 17H3z" />
      <path d="M12 9v5" />
      <path d="M12 17h.01" />
    </>
  ),
  product: (
    <>
      <path d="m4 7 8-4 8 4-8 4z" />
      <path d="M4 7v10l8 4 8-4V7M12 11v10" />
    </>
  ),
  warehouse: (
    <>
      <path d="M3 10 12 4l9 6v10H3z" />
      <path d="M7 20v-6h10v6M8 10h.01M12 10h.01M16 10h.01" />
    </>
  ),
  report: (
    <>
      <path d="M5 20V10M12 20V4M19 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-2c0-3 2.5-5 6-5s6 2 6 5v2" />
      <circle cx="17" cy="9" r="2" />
      <path d="M16 14c3.2 0 5 1.6 5 4v2" />
    </>
  ),
  backup: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
      <path d="M9 9h6v6H9z" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M19 12a7 7 0 1 1-2-5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m8 11 4 4 4-4" />
      <path d="M4 20h16" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13 7 4 4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9M16 7l2 2M14 9l2 2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 21V9" />
      <path d="m8 13 4-4 4 4" />
      <path d="M4 4h16" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M10 5h4M11 18h2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H5v16h5" />
      <path d="M13 8l4 4-4 4M17 12H9" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  check: <path d="m5 12 4 4L19 6" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
};

function AppIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="app-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

const DEMO_PRODUCTS: Product[] = [
  {
    id: 1,
    code: "00000012",
    supplierCode: "",
    name: "ACEITE DE TRANSMISIÓN 140 RCC",
    brand: "RCC",
    application: "",
    unit: "UND",
    location: "A-01-02",
    cost: 16,
    minimum: 10,
    active: true,
    physical: 96,
    reserved: 0,
    damaged: 0,
    available: 96,
  },
  {
    id: 2,
    code: "00001318",
    supplierCode: "",
    name: "ACEITE MTR 20W50 ROJO",
    brand: "",
    application: "",
    unit: "UND",
    location: "A-02-01",
    cost: 17,
    minimum: 20,
    active: true,
    physical: 276,
    reserved: 0,
    damaged: 0,
    available: 276,
  },
  {
    id: 3,
    code: "00000412",
    supplierCode: "",
    name: "ALTERNADOR 125/150 KIGCOL",
    brand: "KIGCOL",
    application: "",
    unit: "UND",
    location: "B-03-01",
    cost: 28,
    minimum: 8,
    active: true,
    physical: 165,
    reserved: 2,
    damaged: 0,
    available: 163,
  },
  {
    id: 4,
    code: "00000604",
    supplierCode: "",
    name: "ALTERNADOR CB200 (8P, 2H)",
    brand: "",
    application: "CB200",
    unit: "UND",
    location: "C-02-01",
    cost: 30,
    minimum: 5,
    active: true,
    physical: 14,
    reserved: 0,
    damaged: 0,
    available: 14,
  },
  {
    id: 5,
    code: "00000889",
    supplierCode: "",
    name: "ABRAZADERA DE MUELLE U RCC JGO",
    brand: "RCC",
    application: "",
    unit: "JGO",
    location: "D-01-01",
    cost: 17,
    minimum: 5,
    active: true,
    physical: 0,
    reserved: 0,
    damaged: 0,
    available: 0,
  },
];

const DEMO_STOCK: StockRow[] = DEMO_PRODUCTS.map((product) => ({
  id: product.id,
  productId: product.id,
  code: product.code,
  name: product.name,
  unit: product.unit,
  location: product.location,
  minimum: product.minimum,
  warehouseId: 1,
  warehouse: "ALMACÉN PRINCIPAL",
  physical: product.physical,
  reserved: product.reserved,
  damaged: product.damaged,
  available: product.available,
}));

const DEMO_SNAPSHOT: Snapshot = {
  user: {
    email: "demo@jimdur.web",
    username: "DEMO",
    displayName: "VISITANTE",
    role: "USUARIO",
    active: true,
    permissions: ALL_PERMISSIONS,
    lastAccess: null,
  },
  products: DEMO_PRODUCTS,
  stock: DEMO_STOCK,
  warehouses: [
    {
      id: 1,
      code: "ALM-PRI",
      name: "ALMACÉN PRINCIPAL",
      active: true,
      productsWithStock: 4,
      physical: 551,
      reserved: 2,
      damaged: 0,
      available: 549,
    },
    {
      id: 2,
      code: "ALM-SEC",
      name: "ALMACÉN SECUNDARIO",
      active: true,
      productsWithStock: 0,
      physical: 0,
      reserved: 0,
      damaged: 0,
      available: 0,
    },
  ],
  movements: [
    {
      id: 1,
      date: "2026-08-21 10:42:00",
      type: "INGRESO",
      document: "REC-2026-000018",
      productId: 2,
      product: "ACEITE MTR 20W50 ROJO",
      code: "00001318",
      quantity: 24,
      warehouseId: 1,
      warehouse: "ALMACÉN PRINCIPAL",
      notes: "Recepción confirmada",
      userEmail: "almacen.general@jimdur.pe",
    },
    {
      id: 2,
      date: "2026-08-21 10:08:00",
      type: "SALIDA",
      document: "OS-2026-000006",
      productId: 3,
      product: "ALTERNADOR 125/150 KIGCOL",
      code: "00000412",
      quantity: 2,
      warehouseId: 1,
      warehouse: "ALMACÉN PRINCIPAL",
      notes: "Orden despachada",
      userEmail: "almacen.general@jimdur.pe",
    },
    {
      id: 3,
      date: "2026-08-21 09:36:00",
      type: "AJUSTE",
      document: "AJ-2026-000004",
      productId: 4,
      product: "ALTERNADOR CB200 (8P, 2H)",
      code: "00000604",
      quantity: 1,
      warehouseId: 1,
      warehouse: "ALMACÉN PRINCIPAL",
      notes: "Conteo físico",
      userEmail: "control@jimdur.pe",
    },
  ],
  receipts: [
    {
      id: 1,
      number: "REC-2026-000018",
      date: "2026-08-21",
      warehouseId: 1,
      warehouse: "ALMACÉN PRINCIPAL",
      supplier: "DISTRIBUIDORA NORTE",
      source: "PIURA",
      documentNumber: "GR-1845",
      carrier: "",
      notes: "",
      status: "CONFIRMADA",
      userEmail: "almacen.general@jimdur.pe",
      products: 1,
      units: 24,
    },
  ],
  proformas: [
    {
      id: 1,
      number: "PRO-2026-000003",
      date: "2026-08-21",
      client: "CLIENTE DE DEMOSTRACIÓN",
      document: "DNI 00000000",
      address: "PIURA",
      warehouseId: 1,
      warehouse: "ALMACÉN PRINCIPAL",
      paymentCondition: "CONTADO",
      status: "VIGENTE",
      userEmail: "control@jimdur.pe",
      products: 2,
      units: 4,
      total: 92,
    },
  ],
  orders: [
    {
      id: 1,
      number: "OS-2026-000006",
      date: "2026-08-21",
      warehouseId: 1,
      warehouse: "ALMACÉN PRINCIPAL",
      destination: "TIENDA PRINCIPAL",
      orderType: "REPOSICIÓN",
      flowMode: "PEDIDO",
      priority: "NORMAL",
      notes: "",
      status: "PENDIENTE",
      userEmail: "almacen.general@jimdur.pe",
      products: 2,
      requested: 16,
      reserved: 16,
      dispatched: 0,
    },
    {
      id: 2,
      number: "OS-2026-000005",
      date: "2026-08-20",
      warehouseId: 1,
      warehouse: "ALMACÉN PRINCIPAL",
      destination: "TIENDA PRINCIPAL",
      orderType: "VENTA",
      flowMode: "DIRECTO",
      priority: "ALTA",
      notes: "",
      status: "LISTA",
      userEmail: "control@jimdur.pe",
      products: 1,
      requested: 2,
      reserved: 2,
      dispatched: 0,
    },
  ],
  transfers: [
    {
      id: 1,
      number: "TR-2026-000004",
      date: "2026-08-21",
      originWarehouseId: 1,
      origin: "ALMACÉN PRINCIPAL",
      destinationWarehouseId: 2,
      destination: "ALMACÉN SECUNDARIO",
      notes: "",
      status: "CONFIRMADA",
      userEmail: "almacen.general@jimdur.pe",
      products: 2,
      units: 18,
    },
  ],
  users: [
    {
      email: "almacen.general@jimdur.pe",
      username: "ALMACEN",
      displayName: "ALONSO VEGA",
      role: "ADMINISTRADOR",
      active: true,
      permissions: ALL_PERMISSIONS,
      lastAccess: "2026-08-21 12:45:00",
    },
    {
      email: "control@jimdur.pe",
      username: "CONTROL",
      displayName: "CESAR LOPEZ",
      role: "USUARIO",
      active: true,
      permissions: ["operations", "inventory", "reports"],
      lastAccess: "2026-08-21 11:18:00",
    },
  ],
  imports: [],
  generatedAt: new Date().toISOString(),
};

function n(value: number) {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function money(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(Number(value) || 0);
}

function dateTime(value: string) {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function fullDateTime(value: string) {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function dateOnly(value: string) {
  if (!value) return "—";
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function compactOperationalNumber(value: string) {
  const adjustment = value.match(/^AJ-\d{4}-(\d{6})$/i);
  if (adjustment) return `AS-${adjustment[1]}`;
  return value.replace(/^(REC|OS)-\d{4}-(\d{6})$/i, "$1-$2");
}

function todayInputValue() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

function dateInputValue(date: Date) {
  const localTime = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localTime.toISOString().slice(0, 10);
}

function greetingForCurrentTime() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function isCriticalProduct(product: Product) {
  return product.active && product.available < CRITICAL_STOCK_LIMIT;
}

type SearchOption = {
  value: number;
  code: string;
  label: string;
  meta?: string;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("·", " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function productSearchOptions(
  snapshot: Snapshot,
  warehouseId: number,
): SearchOption[] {
  return snapshot.products
    .filter((product) => product.active)
    .map((product) => {
      const stock = snapshot.stock.find(
        (row) =>
          row.productId === product.id && row.warehouseId === warehouseId,
      );
      return {
        value: product.id,
        code: product.code,
        label: product.name,
        meta:
          (product.location || "SIN UBICACIÓN") +
          " · Disponible: " +
          n(stock?.available || 0) +
          " " +
          product.unit,
      };
    });
}

function SearchCombobox({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  className = "",
}: {
  id: string;
  label: string;
  placeholder: string;
  options: SearchOption[];
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  const selectedText = selected?.label || "";
  const [typedQuery, setTypedQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const query = typedQuery ?? selectedText;
  const hasQuery = normalizeSearch(query).length > 0;
  const matches = useMemo(() => {
    const term = normalizeSearch(query);
    if (!term) return [];
    return options
      .filter((option) => {
        return normalizeSearch(
          option.code + " " + option.label + " " + (option.meta || ""),
        ).includes(term);
      })
      .slice(0, 30);
  }, [options, query]);

  const choose = (option: SearchOption) => {
    onChange(option.value);
    setTypedQuery(null);
    setOpen(false);
    setHighlighted(0);
  };

  const changeQuery = (next: string) => {
    setTypedQuery(next);
    const normalized = normalizeSearch(next);
    const exact = options.find(
      (option) =>
        normalizeSearch(option.code) === normalized ||
        normalizeSearch(option.label) === normalized,
    );
    onChange(exact?.value || 0);
    setHighlighted(0);
    setOpen(normalized.length > 0);
  };

  const navigate = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!matches.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlighted((current) => Math.min(current + 1, matches.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlighted((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      choose(matches[highlighted] || matches[0]);
    }
  };

  return (
    <div className={("search-combobox " + className).trim()}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={id + "-options"}
        autoComplete="off"
        value={query}
        onChange={(event) => changeQuery(event.target.value)}
        onFocus={() => setOpen(hasQuery)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={navigate}
        placeholder={placeholder}
      />
      <span
        className={"search-combobox-arrow" + (open ? " open" : "")}
        aria-hidden="true"
      >
       ⌄
      </span>
      {open && hasQuery && (
        <div className="product-combobox-menu" id={id + "-options"} role="listbox">
          {matches.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={index === highlighted ? "highlighted" : ""}
              key={option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <strong>{option.label}</strong>
            </button>
          ))}
          {!matches.length && (
            <div className="product-combobox-empty">No se encontraron productos.</div>
          )}
        </div>
      )}
    </div>
  );
}

function printAsPdf(fileName: string) {
  const previousTitle = document.title;
  document.title = fileName.replace(/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ._-]+/g, "_");
  window.print();
  document.title = previousTitle;
}

function downloadBlob(content: string, name: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  return '"' + String(value ?? "").replaceAll('"', '""') + '"';
}

function downloadCsv(
  headers: string[],
  rows: Array<Array<string | number>>,
  name: string,
) {
  const content = [headers, ...rows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\n");
  downloadBlob("\ufeff" + content, name, "text/csv;charset=utf-8");
}

function hasPermission(snapshot: Snapshot, key?: string) {
  if (!key) return true;
  return (
    snapshot.user.role === "ADMINISTRADOR" ||
    snapshot.user.permissions.includes(key) ||
    (key === "store_orders" && snapshot.user.permissions.includes("operations"))
  );
}

function LoginScreen({
  setupRequired,
  onAuthenticated,
}: {
  setupRequired: boolean;
  onAuthenticated: () => void;
}) {
  const [username, setUsername] = useState(setupRequired ? "ADMIN" : "");
  const [displayName, setDisplayName] = useState("ADMINISTRADOR JIMDUR");
  const [setupCode, setSetupCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const creatingPassword = setupRequired || recoveryMode;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (creatingPassword && password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          setupRequired
            ? {
                action: "setup",
                setupCode,
                username,
                displayName,
                password,
              }
            : recoveryMode
              ? {
                  action: "recover_password",
                  recoveryCode,
                  username,
                  newPassword: password,
                }
              : { action: "login", username, password },
        ),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo completar el ingreso.");
      }
      setPassword("");
      setConfirmation("");
      setRecoveryCode("");
      onAuthenticated();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo completar el ingreso.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="login-brand-content">
          <img src="/jimdur-app-logo.png" alt="JIMDUR ERP" />
          <span>GRUPO JIMDUR E.I.R.L.</span>
          <h1>JIMDUR ERP</h1>
          <p>
            Pedidos, recepción, despacho y control de repuestos desde tu PC o
            celular, con información centralizada.
          </p>
          <div className="login-features">
            <span>✓ Repuestos y existencias</span>
            <span>✓ Pedidos y despachos</span>
            <span>✓ Acceso desde cualquier lugar</span>
          </div>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">
            {setupRequired
              ? "ACTIVACIÓN INICIAL"
              : recoveryMode
                ? "RECUPERACIÓN SEGURA"
                : "ACCESO JIMDUR ERP"}
          </span>
          <h2>
            {setupRequired
              ? "Crea tu acceso principal"
              : recoveryMode
                ? "Recupera tu acceso"
                : "Ingresa a tu sistema"}
          </h2>
          <p>
            {setupRequired
              ? "Usa el código temporal entregado y define una contraseña que solo tú conozcas."
              : recoveryMode
                ? "Usa tu clave personal de recuperación. Funciona una sola vez y no vence hasta que la utilices."
                : "Ingresa con tu usuario y contraseña de JIMDUR ERP."}
          </p>
          <form className="login-form" onSubmit={(event) => void submit(event)}>
            {setupRequired && (
              <>
                <label>
                  CÓDIGO TEMPORAL
                  <input
                    required
                    autoComplete="one-time-code"
                    value={setupCode}
                    onChange={(event) => setSetupCode(event.target.value)}
                    placeholder="JD-XXXX-XXXX-XXXX"
                  />
                </label>
                <label>
                  NOMBRE DEL ADMINISTRADOR
                  <input
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={80}
                  />
                </label>
              </>
            )}
            {recoveryMode && (
              <label>
                CLAVE DE RECUPERACIÓN
                <input
                  required
                  autoComplete="one-time-code"
                  value={recoveryCode}
                  onChange={(event) =>
                    setRecoveryCode(event.target.value.toUpperCase())
                  }
                  placeholder="JD-REC-XXXX-XXXX-XXXX"
                  maxLength={32}
                />
              </label>
            )}
            <label>
              USUARIO
              <input
                required
                autoCapitalize="characters"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value.toUpperCase())}
                placeholder="Ejemplo: ADMIN"
                maxLength={32}
              />
            </label>
            <label>
              {recoveryMode ? "NUEVA CONTRASEÑA" : "CONTRASEÑA"}
              <span className="password-field">
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete={creatingPassword ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? "OCULTAR" : "VER"}
                </button>
              </span>
            </label>
            {creatingPassword && (
              <label>
                REPITE LA NUEVA CONTRASEÑA
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  maxLength={128}
                />
              </label>
            )}
            {creatingPassword && (
              <small className="password-rule">
                Mínimo 10 caracteres, con mayúscula, minúscula y número.
              </small>
            )}
            {error && <div className="login-error">{error}</div>}
            <button className="login-submit" type="submit" disabled={busy}>
              {busy
                ? "PROCESANDO…"
                : setupRequired
                  ? "ACTIVAR JIMDUR"
                  : recoveryMode
                    ? "RESTABLECER E INGRESAR"
                    : "INGRESAR AL SISTEMA"}
            </button>
            {!setupRequired && (
              <button
                className="login-recovery-toggle"
                type="button"
                onClick={() => {
                  const next = !recoveryMode;
                  setRecoveryMode(next);
                  setError("");
                  setPassword("");
                  setConfirmation("");
                  setRecoveryCode("");
                  if (next && !username) setUsername("ADMIN");
                }}
              >
                {recoveryMode
                  ? "VOLVER AL INICIO DE SESIÓN"
                  : "OLVIDÉ MI CONTRASEÑA"}
              </button>
            )}
          </form>
          <small className="login-security">
            🔒 La sesión se cierra automáticamente después de 12 horas.
          </small>
        </div>
      </section>
    </main>
  );
}

function PasswordChangeScreen({
  onChanged,
  onLogout,
}: {
  onChanged: () => void;
  onLogout: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmation) {
      setError("Las nuevas contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          currentPassword,
          newPassword,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo cambiar la contraseña.");
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo cambiar la contraseña.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-shell compact-login">
      <section className="login-brand">
        <img src="/jimdur-app-logo.png" alt="JIMDUR" />
        <span>SEGURIDAD JIMDUR</span>
        <h1>Protege tu cuenta</h1>
        <p>Antes de continuar, reemplaza la contraseña temporal.</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">CAMBIO OBLIGATORIO</span>
          <h2>Crea tu contraseña personal</h2>
          <form className="login-form" onSubmit={(event) => void submit(event)}>
            <label>
              CONTRASEÑA TEMPORAL
              <input
                required
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              NUEVA CONTRASEÑA
              <input
                required
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label>
              REPITE LA NUEVA CONTRASEÑA
              <input
                required
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <small className="password-rule">
              Mínimo 10 caracteres, con mayúscula, minúscula y número.
            </small>
            {error && <div className="login-error">{error}</div>}
            <button className="login-submit" type="submit" disabled={busy}>
              {busy ? "GUARDANDO…" : "GUARDAR Y CONTINUAR"}
            </button>
            <button className="login-cancel" type="button" onClick={onLogout}>
              CERRAR SESIÓN
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export default function JimdurApp() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authError, setAuthError] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [active, setActive] = useState<ModuleKey>("dashboard");
  const [modal, setModal] = useState<ModalKind>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(
    null,
  );

  const requestAction: RequestAction = useCallback(
    (options) =>
      new Promise<ActionDialogResult>((resolve) => {
        setActionDialog({ ...options, resolve });
      }),
    [],
  );

  const resolveActionDialog = (result: ActionDialogResult) => {
    if (!actionDialog) return;
    const resolver = actionDialog.resolve;
    setActionDialog(null);
    resolver(result);
  };

  const checkAuth = useCallback(async () => {
    setAuthError("");
    try {
      const response = await fetch("/api/auth", { cache: "no-store" });
      const data = (await response.json()) as AuthStatus & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo comprobar el acceso.");
      }
      setAuthStatus(data);
      if (!data.authenticated) setSnapshot(null);
    } catch (caught) {
      setAuthError(
        caught instanceof Error
          ? caught.message
          : "No se pudo comprobar el acceso.",
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!authStatus?.authenticated || authStatus.mustChangePassword) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/snapshot", { cache: "no-store" });
      const data = (await response.json()) as Snapshot & { error?: string };
      if (response.status === 401) {
        setAuthStatus((current) =>
          current
            ? { ...current, authenticated: false, user: null }
            : current,
        );
        setSnapshot(null);
        return;
      }
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los datos.");
      setSnapshot(data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudieron cargar los datos.",
      );
    } finally {
      setLoading(false);
    }
  }, [authStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkAuth(), 0);
    return () => window.clearTimeout(timer);
  }, [checkAuth]);

  useEffect(() => {
    if (!authStatus?.authenticated || authStatus.mustChangePassword) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [authStatus?.authenticated, authStatus?.mustChangePassword, refresh]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      let reloading = false;
      const onControllerChange = () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      void navigator.serviceWorker
        .register("/service-worker.js?v=5", { updateViaCache: "none" })
        .then((registration) => registration.update());
      return () => {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      };
    }
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const runOperation: RunOperation = useCallback(
    async (payload) => {
      setBusy(true);
      try {
        const response = await fetch("/api/operations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await response.json()) as Record<string, unknown> & {
          error?: string;
          message?: string;
        };
        if (response.status === 401) {
          setAuthStatus((current) =>
            current
              ? { ...current, authenticated: false, user: null }
              : current,
          );
          setSnapshot(null);
        }
        if (!response.ok) {
          throw new Error(data.error || "No se pudo completar la operación.");
        }
        setNotice(data.message || "Operación completada.");
        await refresh();
        setModal(null);
        return { ok: true, data };
      } catch (caught) {
        setNotice(
          caught instanceof Error
            ? caught.message
            : "No se pudo completar la operación.",
        );
        return { ok: false };
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setSnapshot(null);
    setActive("dashboard");
    setAuthStatus({
      authenticated: false,
      setupRequired: false,
      mustChangePassword: false,
      user: null,
    });
  }, []);

  const openModule = (key: ModuleKey) => {
    if (!snapshot) return;
    const permission = MODULES[key].permission;
    if (!hasPermission(snapshot, permission)) {
      setNotice("Tu perfil no tiene permiso para abrir este módulo.");
      return;
    }
    setActive(key);
    setMenuOpen(false);
  };

  if (!authStatus && !authError) {
    return (
      <div className="boot-screen">
        <img src="/jimdur-app-logo.png" alt="JIMDUR" />
        <strong>Protegiendo el acceso…</strong>
        <span>Verificando tu sesión JIMDUR</span>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="access-screen">
        <section>
          <img src="/jimdur-app-logo.png" alt="JIMDUR" />
          <span className="eyebrow">ACCESO AL SISTEMA</span>
          <h1>No pudimos comprobar el acceso</h1>
          <p>{authError}</p>
          <div className="access-actions">
            <button onClick={() => void checkAuth()}>REINTENTAR</button>
          </div>
        </section>
      </div>
    );
  }

  if (authStatus && !authStatus.authenticated) {
    return (
      <LoginScreen
        setupRequired={authStatus.setupRequired}
        onAuthenticated={() => {
          setActive("dashboard");
          void checkAuth();
        }}
      />
    );
  }

  if (authStatus?.mustChangePassword) {
    return (
      <PasswordChangeScreen
        onChanged={() => {
          setActive("dashboard");
          void checkAuth();
        }}
        onLogout={() => void logout()}
      />
    );
  }

  if (!snapshot && loading) {
    return (
      <div className="boot-screen">
        <img src="/jimdur-app-logo.png" alt="JIMDUR" />
        <strong>Preparando JIMDUR ERP…</strong>
        <span>Conectando con el inventario</span>
      </div>
    );
  }

  if (!snapshot || error) {
    return (
      <div className="access-screen">
        <section>
          <img src="/jimdur-app-logo.png" alt="JIMDUR" />
          <span className="eyebrow">ACCESO AL SISTEMA</span>
          <h1>No pudimos abrir tu inventario</h1>
          <p>{error || "Vuelve a iniciar sesión e inténtalo nuevamente."}</p>
          <div className="access-actions">
            <button onClick={() => void refresh()}>REINTENTAR</button>
            <button className="secondary-access" onClick={() => void logout()}>
              CERRAR SESIÓN
            </button>
          </div>
        </section>
      </div>
    );
  }

  const currentMeta = MODULES[active];
  const activeActions = toolbarActions(active, {
    setModal,
    setEditingProduct,
    setEditingWarehouse,
    setEditingUser,
    snapshot,
    setNotice,
  });
  const noticeIsError = /no se pudo|sin permiso|no tiene permiso|error|fall/i.test(
    notice,
  );

  return (
    <div className="app-shell">
      <button
        className={"mobile-scrim " + (menuOpen ? "visible" : "")}
        onClick={() => setMenuOpen(false)}
        aria-label="Cerrar menú"
      />
      <aside className={"sidebar " + (menuOpen ? "open" : "")}>
        <div className="company-block">
          <span>PLATAFORMA EMPRESARIAL</span>
          <strong>GRUPO JIMDUR E.I.R.L.</strong>
          <small>OPERACIONES EN TIEMPO REAL</small>
        </div>
        <div className="brand-block">
          <img src="/jimdur-app-logo.png" alt="JIMDUR" />
          <div>
            <strong>JIMDUR ERP</strong>
            <small>INVENTARIO · PEDIDOS · DESPACHOS</small>
          </div>
        </div>
        <nav className="main-nav" aria-label="Módulos del sistema">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map((item) => {
                const allowed = hasPermission(
                  snapshot,
                  MODULES[item.key].permission,
                );
                return (
                  <button
                    key={item.key}
                    className={active === item.key ? "active" : ""}
                    onClick={() => openModule(item.key)}
                    aria-disabled={!allowed}
                    aria-current={active === item.key ? "page" : undefined}
                  >
                    <span className="nav-icon">
                      <AppIcon name={item.icon} />
                    </span>
                    {item.label}
                    {!allowed && (
                      <span className="nav-lock" title="Sin permiso">
                        <AppIcon name="lock" size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="user-block">
          <div className="avatar">
            {(snapshot.user.displayName || "U").slice(0, 1)}
          </div>
          <div>
            <strong>{snapshot.user.displayName}</strong>
            <small>{snapshot.user.role} · {snapshot.user.username}</small>
          </div>
        </div>
        <div className="sidebar-utility">
          <button onClick={() => void logout()}>
            <AppIcon name="logout" size={16} />
            Cerrar sesión
          </button>
          <small>JIMDUR ERP · DATOS CENTRALIZADOS</small>
        </div>
      </aside>

      <main className="workspace">
        <header className="top-header">
          <button
            className="menu-toggle"
            aria-label="Abrir menú"
            onClick={() => setMenuOpen(true)}
          >
            <AppIcon name="menu" size={20} />
          </button>
          <div className="page-heading">
            <span className="page-kicker">JIMDUR ERP · CENTRO DE OPERACIONES</span>
            <h1>{currentMeta.title}</h1>
            <p>{currentMeta.subtitle}</p>
          </div>
          <div className="header-status">
            <span className="status-online">
              <AppIcon name="check" size={13} />
              En línea
            </span>
            <span className="sync-time">
              Actualizado: {fullDateTime(snapshot.generatedAt)}
            </span>
          </div>
          <div className="header-mode">
            <span className="mode-chip live">
              <AppIcon name="shield" size={12} />
              OPERATIVO
            </span>
            <strong>{snapshot.warehouses.find((warehouse) => warehouse.active)?.name || "SIN ALMACÉN"}</strong>
          </div>
        </header>

        <section className="content-area">
          {snapshot.products.length === 0 && (
            <div className="onboarding-banner">
              <div>
                <strong>EL SISTEMA ESTÁ LISTO PARA RECIBIR TUS DATOS</strong>
                <span>
                  Exporta la base CONTROL_INVENTARIO desde la PC e impórtala en
                  Copias y migración.
                </span>
              </div>
              <button onClick={() => openModule("backups")}>
                INICIAR MIGRACIÓN
              </button>
            </div>
          )}

          <div className="module-toolbar">
            <div>
              <span>{currentMeta.title.toUpperCase()}</span>
              <small>Cambios guardados automáticamente</small>
            </div>
            <div className="toolbar-buttons">
              {activeActions.map((action) => (
                <button
                  key={action.label}
                  className={action.tone || ""}
                  onClick={action.onClick}
                >
                  <AppIcon name={action.icon} size={15} />
                  {action.label}
                </button>
              ))}
              <button onClick={() => void refresh()} disabled={loading}>
                <AppIcon name="refresh" size={15} />
                ACTUALIZAR
              </button>
            </div>
          </div>

          {renderModule(active, snapshot, {
            setModal,
            setEditingProduct,
            setEditingWarehouse,
            setEditingUser,
            runOperation,
            setNotice,
            requestAction,
            openModule,
          })}
        </section>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Accesos rápidos">
        {MOBILE_NAV_ITEMS.filter((item) =>
          hasPermission(snapshot, MODULES[item.key].permission),
        ).map((item) => (
          <button
            key={item.key}
            className={active === item.key ? "active" : ""}
            onClick={() => openModule(item.key)}
            aria-current={active === item.key ? "page" : undefined}
          >
            <AppIcon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {modal === "product-new" && (
        <ProductModal
          snapshot={snapshot}
          product={null}
          busy={busy}
          runOperation={runOperation}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "product-edit" && editingProduct && (
        <ProductModal
          snapshot={snapshot}
          product={editingProduct}
          busy={busy}
          runOperation={runOperation}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "receipt" && (
        <LineOperationModal
          kind="receipt"
          snapshot={snapshot}
          busy={busy}
          runOperation={runOperation}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "proforma" && (
        <LineOperationModal
          kind="proforma"
          snapshot={snapshot}
          busy={busy}
          runOperation={runOperation}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "order" && (
        <LineOperationModal
          kind="order"
          snapshot={snapshot}
          busy={busy}
          runOperation={runOperation}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "transfer" && (
        <LineOperationModal
          kind="transfer"
          snapshot={snapshot}
          busy={busy}
          runOperation={runOperation}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "adjustment" && (
        <AdjustmentModal
          snapshot={snapshot}
          busy={busy}
          runOperation={runOperation}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "warehouse" && (
        <WarehouseModal
          warehouse={editingWarehouse}
          busy={busy}
          runOperation={runOperation}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "user" && (
        <UserModal
          user={editingUser}
          busy={busy}
          runOperation={runOperation}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "password" && (
        <PasswordModal
          onClose={() => setModal(null)}
          onSuccess={(message) => {
            setNotice(message);
            setModal(null);
          }}
        />
      )}
      {modal === "import" && (
        <ImportModal
          busy={busy}
          runOperation={runOperation}
          onClose={() => setModal(null)}
        />
      )}

      {actionDialog && (
        <ActionDialog
          dialog={actionDialog}
          onCancel={() => resolveActionDialog(null)}
          onConfirm={(result) => resolveActionDialog(result)}
        />
      )}

      {(loading || busy) && (
        <div className="activity-indicator">
          <span />
          {busy ? "Guardando cambios…" : "Actualizando información…"}
        </div>
      )}
      {notice && (
        <div
          className={"toast " + (noticeIsError ? "error" : "success")}
          role={noticeIsError ? "alert" : "status"}
          aria-live={noticeIsError ? "assertive" : "polite"}
        >
          <span className="toast-icon">
            <AppIcon name={noticeIsError ? "alert" : "check"} size={18} />
          </span>
          <div>
            <strong>{noticeIsError ? "Revisa esta operación" : "Operación completada"}</strong>
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice("")} aria-label="Cerrar mensaje">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function toolbarActions(
  active: ModuleKey,
  context: {
    setModal: (value: ModalKind) => void;
    setEditingProduct: (value: Product | null) => void;
    setEditingWarehouse: (value: Warehouse | null) => void;
    setEditingUser: (value: AppUser | null) => void;
    snapshot: Snapshot;
    setNotice: (value: string) => void;
  },
) {
  const {
    setModal,
    setEditingProduct,
    setEditingWarehouse,
    setEditingUser,
    snapshot,
    setNotice,
  } = context;
  const actions: Array<{
    label: string;
    icon: IconName;
    tone?: string;
    onClick: () => void;
  }> = [];
  if (active === "products") {
    actions.push({
      label: "NUEVO PRODUCTO",
      icon: "plus",
      tone: "primary",
      onClick: () => {
        setEditingProduct(null);
        setModal("product-new");
      },
    });
  }
  if (active === "warehouses") {
    actions.push({
      label: "NUEVO ALMACÉN",
      icon: "plus",
      tone: "primary",
      onClick: () => {
        setEditingWarehouse(null);
        setModal("warehouse");
      },
    });
  }
  if (active === "receipts") {
    actions.push({
      label: "NUEVA RECEPCIÓN",
      icon: "plus",
      tone: "primary",
      onClick: () => setModal("receipt"),
    });
  }
  if (active === "proformas") {
    actions.push({
      label: "NUEVA PROFORMA",
      icon: "plus",
      tone: "primary",
      onClick: () => setModal("proforma"),
    });
  }
  if (active === "transfers") {
    actions.push({
      label: "NUEVA TRANSFERENCIA",
      icon: "plus",
      tone: "primary",
      onClick: () => setModal("transfer"),
    });
  }
  if (active === "adjustments") {
    actions.push({
      label: "INGRESAR / AJUSTAR STOCK",
      icon: "edit",
      tone: "primary",
      onClick: () => setModal("adjustment"),
    });
  }
  if (active === "users") {
    actions.push({
      label: "NUEVO USUARIO",
      icon: "plus",
      tone: "primary",
      onClick: () => {
        setEditingUser(null);
        setModal("user");
      },
    });
    actions.push({
      label: "MI RECUPERACIÓN",
      icon: "key",
      onClick: () => setModal("password"),
    });
  }
  if (active === "backups") {
    actions.push({
      label: "IMPORTAR SQL SERVER",
      icon: "upload",
      tone: "primary",
      onClick: () => setModal("import"),
    });
  }
  if (["inventory", "critical"].includes(active)) {
    actions.push({
      label: "EXPORTAR CSV",
      icon: "download",
      onClick: () => {
        if (active === "critical") {
          const rows = snapshot.products.filter(isCriticalProduct);
          downloadCsv(
            [
              "CÓDIGO",
              "PRODUCTO",
              "FÍSICO",
              "RESERVADO",
              "DISPONIBLE",
              "ESTADO",
            ],
            rows.map((row) => [
              row.code,
              row.name,
              row.physical,
              row.reserved,
              row.available,
              row.available <= 0 ? "AGOTADO" : "STOCK BAJO",
            ]),
            "JIMDUR_STOCK_CRITICO.csv",
          );
          setNotice("Archivo CSV generado correctamente.");
          return;
        }
        downloadCsv(
          [
            "CÓDIGO",
            "PRODUCTO",
            "ALMACÉN",
            "FÍSICO",
            "RESERVADO",
            "DISPONIBLE",
          ],
          snapshot.stock.map((row) => [
            row.code,
            row.name,
            row.warehouse,
            row.physical,
            row.reserved,
            row.available,
          ]),
          "JIMDUR_INVENTARIO.csv",
        );
        setNotice("Archivo CSV generado correctamente.");
      },
    });
  }
  return actions;
}

function renderModule(
  active: ModuleKey,
  snapshot: Snapshot,
  context: {
    setModal: (value: ModalKind) => void;
    setEditingProduct: (value: Product | null) => void;
    setEditingWarehouse: (value: Warehouse | null) => void;
    setEditingUser: (value: AppUser | null) => void;
    runOperation: RunOperation;
    setNotice: (value: string) => void;
    requestAction: RequestAction;
    openModule: (key: ModuleKey) => void;
  },
) {
  switch (active) {
    case "dashboard":
      return (
        <DashboardView
          snapshot={snapshot}
          onNavigate={context.openModule}
        />
      );
    case "receipts":
      return (
        <ReceiptsView
          snapshot={snapshot}
          runOperation={context.runOperation}
          canDelete={hasPermission(snapshot, "cancellations")}
          requestAction={context.requestAction}
        />
      );
    case "proformas":
      return <ProformasView snapshot={snapshot} />;
    case "orders":
      return (
        <OrdersView
          snapshot={snapshot}
          runOperation={context.runOperation}
          requestAction={context.requestAction}
        />
      );
    case "transfers":
      return <TransfersView snapshot={snapshot} />;
    case "inventory":
      return <InventoryView snapshot={snapshot} />;
    case "adjustments":
      return <AdjustmentsView snapshot={snapshot} />;
    case "kardex":
      return <KardexView snapshot={snapshot} />;
    case "critical":
      return <CriticalView snapshot={snapshot} />;
    case "products":
      return (
        <ProductsView
          snapshot={snapshot}
          onEdit={(product) => {
            context.setEditingProduct(product);
            context.setModal("product-edit");
          }}
        />
      );
    case "warehouses":
      return (
        <WarehousesView
          snapshot={snapshot}
          runOperation={context.runOperation}
          requestAction={context.requestAction}
          onEdit={(warehouse) => {
            context.setEditingWarehouse(warehouse);
            context.setModal("warehouse");
          }}
        />
      );
    case "reports":
      return (
        <ReportsView snapshot={snapshot} setNotice={context.setNotice} />
      );
    case "users":
      return (
        <UsersView
          snapshot={snapshot}
          onEdit={(user) => {
            context.setEditingUser(user);
            context.setModal("user");
          }}
        />
      );
    case "backups":
      return (
        <BackupsView
          snapshot={snapshot}
          onImport={() => context.setModal("import")}
          setNotice={context.setNotice}
        />
      );
  }
}

function DashboardView({
  snapshot,
  onNavigate,
}: {
  snapshot: Snapshot;
  onNavigate: (key: ModuleKey) => void;
}) {
  const [period, setPeriod] = useState("30");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const productById = useMemo(
    () => new Map(snapshot.products.map((product) => [product.id, product])),
    [snapshot.products],
  );
  const categories = useMemo(
    () => Array.from(new Set(snapshot.products.map((product) => product.brand || product.application || "Sin categoría"))).sort(),
    [snapshot.products],
  );
  const days = period === "today" ? 1 : period === "month" ? new Date().getDate() : period === "year" ? 365 : Number(period);
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - Math.max(0, days - 1));
  const previousCutoff = new Date(cutoff);
  previousCutoff.setDate(previousCutoff.getDate() - days);
  const categoryOf = (product?: Product) => product?.brand || product?.application || "Sin categoría";
  const matchesFilters = (movement: Snapshot["movements"][number]) => {
    const product = productById.get(movement.productId);
    return (warehouseFilter === "all" || String(movement.warehouseId) === warehouseFilter)
      && (categoryFilter === "all" || categoryOf(product) === categoryFilter);
  };
  const filteredMovements = snapshot.movements.filter((movement) => new Date(movement.date) >= cutoff && matchesFilters(movement));
  const previousMovements = snapshot.movements.filter((movement) => {
    const date = new Date(movement.date);
    return date >= previousCutoff && date < cutoff && matchesFilters(movement);
  });
  const isEntry = (type: string) => /ENTR|RECEP|AJUSTE POSITIVO/i.test(type);
  const isExit = (type: string) => /SAL|DESP|AJUSTE NEGATIVO/i.test(type);
  const movementValue = (movement: Snapshot["movements"][number]) => movement.quantity * (productById.get(movement.productId)?.cost || 0);
  const entries = filteredMovements.filter((movement) => isEntry(movement.type));
  const exits = filteredMovements.filter((movement) => isExit(movement.type));
  const previousEntries = previousMovements.filter((movement) => isEntry(movement.type));
  const previousExits = previousMovements.filter((movement) => isExit(movement.type));
  const purchasesValue = entries.reduce((total, movement) => total + movementValue(movement), 0);
  const salesValue = exits.reduce((total, movement) => total + movementValue(movement), 0);
  const previousPurchasesValue = previousEntries.reduce((total, movement) => total + movementValue(movement), 0);
  const previousSalesValue = previousExits.reduce((total, movement) => total + movementValue(movement), 0);
  const variation = (current: number, previous: number) => previous ? ((current - previous) / previous) * 100 : current ? 100 : 0;
  const filteredProducts = snapshot.products.filter((product) => categoryFilter === "all" || categoryOf(product) === categoryFilter);
  const physical = snapshot.warehouses.reduce(
    (total, warehouse) => total + warehouse.physical,
    0,
  );
  const available = snapshot.warehouses.reduce(
    (total, warehouse) => total + warehouse.available,
    0,
  );
  const withoutStock = snapshot.products.filter(
    (product) => product.available <= 0,
  ).length;
  const criticalProducts = snapshot.products.filter(isCriticalProduct);
  const critical = criticalProducts.length;
  const pendingReceipts = snapshot.receipts.filter(
    (receipt) => receipt.status !== "CONFIRMADA",
  ).length;
  const pendingOrders = snapshot.orders.filter(
    (order) =>
      !["DESPACHADA", "RECIBIDA", "CANCELADA", "ANULADA"].includes(
        normalizedOrderStatus(order.status),
      ),
  ).length;
  const completedOrders = snapshot.orders.filter((order) =>
    ["DESPACHADA", "RECIBIDA"].includes(normalizedOrderStatus(order.status)),
  ).length;
  const inventoryValue = snapshot.products.reduce(
    (total, product) => total + product.available * product.cost,
    0,
  );
  const scopedInventoryValue = filteredProducts.reduce((total, product) => total + product.available * product.cost, 0);
  const movementDays = Array.from({ length: Math.min(days, 30) }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (Math.min(days, 30) - 1 - index));
    const key = date.toISOString().slice(0, 10);
    const dayRows = filteredMovements.filter((movement) => movement.date.slice(0, 10) === key);
    return {
      label: date.toLocaleDateString("es-PE", { day: "2-digit", month: "short" }),
      entries: dayRows.filter((movement) => isEntry(movement.type)).reduce((sum, movement) => sum + movement.quantity, 0),
      exits: dayRows.filter((movement) => isExit(movement.type)).reduce((sum, movement) => sum + movement.quantity, 0),
    };
  });
  const categoryStock = categories.map((category) => ({
    label: category,
    value: snapshot.products.filter((product) => categoryOf(product) === category).reduce((sum, product) => sum + product.available, 0),
  })).sort((a, b) => b.value - a.value).slice(0, 7);
  const topProducts = Array.from(filteredMovements.reduce((map, movement) => {
    map.set(movement.product, (map.get(movement.product) || 0) + Math.abs(movement.quantity));
    return map;
  }, new Map<string, number>())).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  const stockHealth = snapshot.products.length
    ? Math.max(0, Math.round(((snapshot.products.length - critical) / snapshot.products.length) * 100))
    : 100;
  const today = todayInputValue();
  const todayMovements = snapshot.movements.filter((movement) => movement.date.slice(0, 10) === today).length;
  const orderProgress = snapshot.orders.length
    ? Math.round((completedOrders / snapshot.orders.length) * 100)
    : 100;
  const firstName = (snapshot.user.displayName || snapshot.user.username)
    .trim()
    .split(/\s+/)[0];
  return (
    <div className="dashboard-stack">
      <section className="dashboard-banner executive-banner">
        <div>
          <span className="eyebrow">
            {greetingForCurrentTime().toUpperCase()}, {firstName.toUpperCase()}
          </span>
          <h2>Centro de control gerencial</h2>
          <p>
            Ventas, compras e inventario consolidados para tomar decisiones con información actualizada.
          </p>
        </div>
        <div className="dashboard-date">
          <span className="dashboard-date-icon">
            <AppIcon name="clock" size={18} />
          </span>
          <small>FECHA DE CONTROL</small>
          <strong>
            {new Date().toLocaleDateString("es-PE", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </strong>
        </div>
      </section>
      <section className="dashboard-filters" aria-label="Filtros del dashboard">
        <div className="period-tabs">
          {[["today", "Hoy"], ["7", "7 días"], ["30", "30 días"], ["month", "Este mes"], ["year", "Este año"]].map(([value, label]) => (
            <button key={value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{label}</button>
          ))}
        </div>
        <select aria-label="Filtrar por almacén" value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}>
          <option value="all">Todos los almacenes</option>
          {snapshot.warehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}
        </select>
        <select aria-label="Filtrar por categoría" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">Todas las categorías</option>
          {categories.map((category) => <option value={category} key={category}>{category}</option>)}
        </select>
      </section>
      <section className="metric-grid executive-kpis">
        <Metric tone="blue" label="VENTAS DEL PERÍODO" value={`S/ ${n(salesValue)}`} note={`${variation(salesValue, previousSalesValue) >= 0 ? "↑" : "↓"} ${Math.abs(variation(salesValue, previousSalesValue)).toFixed(1)}% vs. período anterior`} icon="dispatch" onClick={() => onNavigate("orders")} />
        <Metric tone="green" label="COMPRAS DEL PERÍODO" value={`S/ ${n(purchasesValue)}`} note={`${variation(purchasesValue, previousPurchasesValue) >= 0 ? "↑" : "↓"} ${Math.abs(variation(purchasesValue, previousPurchasesValue)).toFixed(1)}% vs. período anterior`} icon="receive" onClick={() => onNavigate("receipts")} />
        <Metric tone="navy" label="VALOR DEL INVENTARIO" value={`S/ ${n(scopedInventoryValue)}`} note={`${n(available)} unidades disponibles`} icon="inventory" onClick={() => onNavigate("inventory")} />
        <Metric tone="red" label="STOCK CRÍTICO" value={String(critical)} note={`${withoutStock} productos agotados`} icon="alert" onClick={() => onNavigate("critical")} />
        <Metric tone="cobalt" label="ENTRADAS" value={n(entries.reduce((sum, movement) => sum + movement.quantity, 0))} note={`${entries.length} movimientos registrados`} icon="receive" onClick={() => onNavigate("kardex")} />
        <Metric tone="amber" label="SALIDAS" value={n(exits.reduce((sum, movement) => sum + movement.quantity, 0))} note={`${exits.length} movimientos registrados`} icon="dispatch" onClick={() => onNavigate("kardex")} />
      </section>
      <section className="executive-chart-grid">
        <DashboardLineChart title="Movimientos de inventario" subtitle="Entradas y salidas · últimos 30 días" rows={movementDays} />
        <DashboardBarChart title="Stock por categoría" subtitle="Unidades disponibles" rows={categoryStock} />
        <DashboardDonut entries={entries.reduce((sum, row) => sum + row.quantity, 0)} exits={exits.reduce((sum, row) => sum + row.quantity, 0)} />
        <DashboardHorizontalBars title="Top 10 productos con mayor movimiento" rows={topProducts} />
      </section>
      <section className="dashboard-grid">
        <article className="summary-card dashboard-critical-card">
          <div className="card-title">
            <h3>Productos con stock crítico</h3>
            <button onClick={() => onNavigate("critical")}>Ver todos ({critical})</button>
          </div>
          <div className="executive-table-wrap"><table className="executive-table"><thead><tr><th>Producto</th><th>Categoría</th><th>Stock actual</th><th>Mínimo</th><th>Diferencia</th><th>Nivel</th><th>Estado</th></tr></thead><tbody>
          {criticalProducts.slice(0, 10).map((product) => { const ratio = Math.min(100, Math.max(0, product.available / Math.max(product.minimum || CRITICAL_STOCK_LIMIT, 1) * 100)); const state = product.available <= 0 ? "CRÍTICO" : product.available <= (product.minimum || CRITICAL_STOCK_LIMIT) ? "BAJO" : "NORMAL"; return (
            <tr key={product.id}><td><strong>{product.name}</strong><small>{product.code}</small></td><td>{categoryOf(product)}</td><td>{n(product.available)} {product.unit}</td><td>{n(product.minimum || CRITICAL_STOCK_LIMIT)}</td><td>{n(product.available - (product.minimum || CRITICAL_STOCK_LIMIT))}</td><td><span className="stock-level"><i style={{width: `${ratio}%`}} /></span></td><td><span className={`status-pill ${state.toLowerCase()}`}>{state}</span></td></tr>
          ); })}
          </tbody></table></div>
          {!criticalProducts.length && (
            <EmptyInline text="No hay productos con menos de 15 unidades." />
          )}
        </article>
      </section>
      <article className="summary-card movements-card">
        <div className="card-title">
          <h3>Últimos movimientos de inventario</h3>
          <button onClick={() => onNavigate("kardex")}>Abrir Kardex</button>
        </div>
        <div className="executive-table-wrap"><table className="executive-table movements"><thead><tr><th>Fecha</th><th>Documento</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Almacén</th><th>Responsable</th></tr></thead><tbody>{filteredMovements.slice(0, 10).map((movement) => <tr key={movement.id}><td>{new Date(movement.date).toLocaleDateString("es-PE")}</td><td>{movement.document || "—"}</td><td><strong>{movement.product}</strong><small>{movement.code}</small></td><td><span className={`movement-type ${isEntry(movement.type) ? "entry" : isExit(movement.type) ? "exit" : "transfer"}`}>{movement.type}</span></td><td>{n(movement.quantity)}</td><td>{movement.warehouse}</td><td>{movement.userEmail}</td></tr>)}</tbody></table></div>
      </article>
    </div>
  );
}

function DashboardLineChart({ title, subtitle, rows }: { title: string; subtitle: string; rows: Array<{label: string; entries: number; exits: number}> }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.entries, row.exits]));
  const points = (key: "entries" | "exits") => rows.map((row, index) => `${(index / Math.max(rows.length - 1, 1)) * 100},${96 - (row[key] / max) * 82}`).join(" ");
  return <article className="chart-card line-card"><div className="chart-heading"><div><h3>{title}</h3><small>{subtitle}</small></div><span><i /> Entradas <i /> Salidas</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={title}><polyline className="entry-line" points={points("entries")} /><polyline className="exit-line" points={points("exits")} /></svg><div className="chart-axis"><span>{rows[0]?.label}</span><span>{rows[Math.floor(rows.length / 2)]?.label}</span><span>{rows.at(-1)?.label}</span></div></article>;
}

function DashboardBarChart({ title, subtitle, rows }: { title: string; subtitle: string; rows: Array<{label: string; value: number}> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return <article className="chart-card"><div className="chart-heading"><div><h3>{title}</h3><small>{subtitle}</small></div></div><div className="vertical-bars">{rows.map((row) => <div key={row.label}><span><i style={{height: `${Math.max(5, row.value / max * 100)}%`}} /></span><small title={row.label}>{row.label}</small></div>)}</div></article>;
}

function DashboardDonut({ entries, exits }: { entries: number; exits: number }) {
  const total = entries + exits || 1; const entryPct = entries / total * 100;
  return <article className="chart-card donut-card"><div className="chart-heading"><div><h3>Entradas vs. salidas</h3><small>Distribución del período</small></div></div><div className="donut-content"><div className="donut" style={{background: `conic-gradient(#16865f 0 ${entryPct}%, #d3222a ${entryPct}% 100%)`}}><span><strong>{n(entries + exits)}</strong><small>unidades</small></span></div><div className="donut-legend"><span><i className="entry" />Entradas <b>{n(entries)}</b></span><span><i className="exit" />Salidas <b>{n(exits)}</b></span></div></div></article>;
}

function DashboardHorizontalBars({ title, rows }: { title: string; rows: Array<{label: string; value: number}> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return <article className="chart-card top-products-card"><div className="chart-heading"><div><h3>{title}</h3><small>Unidades acumuladas en el período</small></div></div><div className="horizontal-bars">{rows.length ? rows.map((row, index) => <div key={row.label}><span>{index + 1}</span><label title={row.label}>{row.label}</label><i><b style={{width: `${row.value / max * 100}%`}} /></i><strong>{n(row.value)}</strong></div>) : <EmptyInline text="No hay movimientos en el período seleccionado." />}</div></article>;
}

function Metric({
  tone,
  label,
  value,
  note,
  icon,
  onClick,
}: {
  tone: string;
  label: string;
  value: string;
  note: string;
  icon: IconName;
  onClick: () => void;
}) {
  return (
    <button className={"metric-card " + tone} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
      <b><AppIcon name={icon} size={18} /></b>
    </button>
  );
}

function InventoryView({ snapshot }: { snapshot: Snapshot }) {
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState(0);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return snapshot.stock.filter(
      (row) =>
        row.physical > 0 &&
        (!warehouseId || row.warehouseId === warehouseId) &&
        (!term ||
          (row.code + " " + row.name + " " + row.location)
            .toLowerCase()
            .includes(term)),
    );
  }, [query, warehouseId, snapshot.stock]);
  return (
    <DataPanel>
      <FilterBar>
        <label>
          BUSCAR PRODUCTO
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Código, descripción o ubicación"
          />
        </label>
        <label>
          ALMACÉN
          <select
            value={warehouseId}
            onChange={(event) => setWarehouseId(Number(event.target.value))}
          >
            <option value={0}>TODOS LOS ALMACENES</option>
            {snapshot.warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <div className="filter-result">
          <strong>{filtered.length}</strong>
          <span>productos con stock</span>
        </div>
      </FilterBar>
      <StockTable rows={filtered} />
    </DataPanel>
  );
}

function ProductsView({
  snapshot,
  onEdit,
}: {
  snapshot: Snapshot;
  onEdit: (product: Product) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = snapshot.products.filter((product) =>
    (product.code + " " + product.name + " " + product.brand)
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <DataPanel>
      <FilterBar>
        <label className="wide-filter">
          BUSCAR EN EL CATÁLOGO
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Código, nombre o marca"
          />
        </label>
        <div className="filter-result">
          <strong>{filtered.length}</strong>
          <span>productos</span>
        </div>
      </FilterBar>
      <div className="table-wrap">
        <table className="selectable-table">
          <thead>
            <tr>
              <th>CÓDIGO</th>
              <th>PRODUCTO</th>
              <th>MARCA</th>
              <th>UNIDAD</th>
              <th>UBICACIÓN</th>
              <th>COSTO</th>
              <th>ESTADO</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.id} onDoubleClick={() => onEdit(product)}>
                <td className="code-cell">{product.code}</td>
                <td className="product-cell">{product.name}</td>
                <td>{product.brand || "—"}</td>
                <td>{product.unit}</td>
                <td>{product.location || "—"}</td>
                <td>{money(product.cost)}</td>
                <td>
                  <Status value={product.active ? "ACTIVO" : "INACTIVO"} />
                </td>
                <td>
                  <button className="table-action" onClick={() => onEdit(product)}>
                    EDITAR
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <EmptyState text="No hay productos con ese filtro." />}
      </div>
    </DataPanel>
  );
}

function ReceiptsView({
  snapshot,
  runOperation,
  canDelete,
  requestAction,
}: {
  snapshot: Snapshot;
  runOperation: RunOperation;
  canDelete: boolean;
  requestAction: RequestAction;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = snapshot.receipts.find((receipt) => receipt.id === selectedId);

  const removeSelected = async () => {
    if (!selected) return;
    const confirmed = await requestAction({
      title: "Eliminar recepción",
      message:
        "Se eliminará la recepción " +
        compactOperationalNumber(selected.number) +
        " y se descontarán del inventario los productos ingresados. Esta acción no se puede deshacer.",
      confirmLabel: "ELIMINAR RECEPCIÓN",
      tone: "danger",
    });
    if (confirmed !== true) return;
    const result = await runOperation({
      action: "delete_receipt",
      id: selected.id,
    });
    if (result.ok) setSelectedId(null);
  };

  return (
    <DataPanel>
      <div className="panel-summary receipt-list-summary">
        <div>
          <strong>{snapshot.receipts.length} RECEPCIONES</strong>
          <span>Selecciona una fila. Al eliminarla, se revierte su ingreso de stock.</span>
        </div>
        {canDelete && (
          <div className="order-list-actions">
            <button
              className="danger-action"
              disabled={!selected}
              onClick={() => void removeSelected()}
            >
              − ELIMINAR RECEPCIÓN SELECCIONADA
            </button>
          </div>
        )}
      </div>
      <div className="table-wrap receipt-list-table">
        <table>
          <thead>
            <tr>
              <th>N.º RECEPCIÓN</th>
              <th>FECHA</th>
              <th>ALMACÉN</th>
              <th>PROVEEDOR / PROCEDENCIA</th>
              <th>DOCUMENTO</th>
              <th>PRODUCTOS</th>
              <th>UNIDADES</th>
              <th>ESTADO</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {snapshot.receipts.map((receipt) => (
              <tr
                key={receipt.id}
                className={selectedId === receipt.id ? "selected-receipt-row" : ""}
                onClick={() => setSelectedId(receipt.id)}
                aria-selected={selectedId === receipt.id}
              >
                <td className="code-cell">{compactOperationalNumber(receipt.number)}</td>
                <td className="date-only-cell">{dateOnly(receipt.date)}</td>
                <td>{receipt.warehouse}</td>
                <td className="product-cell">
                  {receipt.supplier || receipt.source || "—"}
                </td>
                <td>{receipt.documentNumber || "—"}</td>
                <td>{receipt.products}</td>
                <td>{n(receipt.units)}</td>
                <td><Status value={receipt.status} /></td>
                <td>
                  <button
                    className="table-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedId(
                        selectedId === receipt.id ? null : receipt.id,
                      );
                    }}
                  >
                    {selectedId === receipt.id ? "SELECCIONADA" : "SELECCIONAR"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!snapshot.receipts.length && <EmptyState text="Aún no hay recepciones." />}
      </div>
    </DataPanel>
  );
}

function ProformasView({ snapshot }: { snapshot: Snapshot }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const selected = snapshot.proformas.find((proforma) => proforma.id === detailId);

  if (selected) {
    return (
      <ProformaDetail
        proforma={selected}
        autoPrint={autoPrint}
        onPrinted={() => setAutoPrint(false)}
        onBack={() => {
          setAutoPrint(false);
          setDetailId(null);
        }}
      />
    );
  }

  return (
    <DataPanel>
      <div className="panel-summary proforma-list-summary">
        <div>
          <strong>{snapshot.proformas.length} PROFORMAS</strong>
          <span>Abre una proforma para imprimirla, guardarla como PDF o exportarla a Excel.</span>
        </div>
        <div className="order-list-actions">
          <button disabled={!selectedId} onClick={() => selectedId && setDetailId(selectedId)}>
            ABRIR / VER DETALLE
          </button>
          <button
            disabled={!selectedId}
            onClick={() => {
              if (!selectedId) return;
              setAutoPrint(true);
              setDetailId(selectedId);
            }}
          >
            ⇩ EXPORTAR PROFORMA SELECCIONADA
          </button>
        </div>
      </div>
      <div className="table-wrap proforma-list-table">
        <table>
          <thead>
            <tr>
              <th>N.º PROFORMA</th>
              <th>FECHA</th>
              <th>CLIENTE</th>
              <th>DOCUMENTO</th>
              <th>ALMACÉN</th>
              <th>PRODUCTOS</th>
              <th>TOTAL</th>
              <th>ESTADO</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {snapshot.proformas.map((row) => (
              <tr
                key={row.id}
                className={selectedId === row.id ? "selected-document-row" : ""}
                onClick={() => setSelectedId(row.id)}
                onDoubleClick={() => setDetailId(row.id)}
              >
                <td className="code-cell">{row.number}</td>
                <td className="date-only-cell">{dateOnly(row.date)}</td>
                <td className="product-cell">{row.client}</td>
                <td>{row.document || "—"}</td>
                <td>{row.warehouse}</td>
                <td>{row.products}</td>
                <td>{money(row.total)}</td>
                <td><Status value={row.status} /></td>
                <td><button className="table-action" onClick={(event) => { event.stopPropagation(); setSelectedId(row.id); setDetailId(row.id); }}>VER</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!snapshot.proformas.length && <EmptyState text="Aún no hay proformas." />}
      </div>
    </DataPanel>
  );
}

function ProformaDetail({
  proforma,
  autoPrint,
  onPrinted,
  onBack,
}: {
  proforma: Proforma;
  autoPrint: boolean;
  onPrinted: () => void;
  onBack: () => void;
}) {
  const lines = proforma.lines ?? [];
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => {
      printAsPdf("Proforma_" + proforma.number);
      onPrinted();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [autoPrint, onPrinted, proforma.number]);
  const exportDetail = () => {
    downloadCsv(
      ["CÓDIGO", "PRODUCTO", "UNIDAD", "CANTIDAD", "PRECIO UNITARIO", "SUBTOTAL"],
      lines.map((line) => [
        line.code,
        line.name,
        line.unit,
        line.quantity,
        line.price,
        line.subtotal,
      ]),
      proforma.number + ".csv",
    );
  };

  return (
    <DataPanel>
      <ProformaPrintDocument proforma={proforma} />
      <div className="screen-document-ui">
        <div className="order-print-header proforma-print-header">
        <img src="/jimdur-app-logo.png" alt="JIMDUR" />
        <div>
          <span>GRUPO JIMDUR E.I.R.L.</span>
          <strong>PROFORMA COMERCIAL</strong>
        </div>
        <b>{proforma.number}</b>
        </div>
        <div className="order-detail-toolbar">
        <button onClick={onBack}>← VOLVER A PROFORMAS</button>
        <div>
          <button onClick={exportDetail}>⇩ EXPORTAR ESTA PROFORMA A EXCEL</button>
          <button onClick={() => printAsPdf("Proforma_" + proforma.number)}>▤ EXPORTAR ESTA PROFORMA A PDF</button>
          <Status value={proforma.status} />
        </div>
        </div>

      <section className="proforma-heading">
        <div>
          <span className="eyebrow">COTIZACIÓN PARA</span>
          <h2>{proforma.client}</h2>
          <p>{proforma.document || "SIN DOCUMENTO"}</p>
        </div>
        <div className="proforma-grand-total">
          <small>TOTAL PROPUESTO</small>
          <strong>{money(proforma.total)}</strong>
        </div>
      </section>

      <section className="order-meta-grid proforma-meta-grid">
        <div><small>FECHA</small><strong>{dateOnly(proforma.date)}</strong></div>
        <div><small>CONDICIÓN DE PAGO</small><strong>{proforma.paymentCondition}</strong></div>
        <div><small>ALMACÉN</small><strong>{proforma.warehouse}</strong></div>
        <div><small>RESPONSABLE</small><strong>{proforma.userEmail || "—"}</strong></div>
        <div className="proforma-address"><small>DIRECCIÓN / REFERENCIA</small><strong>{proforma.address || "—"}</strong></div>
      </section>

      <div className="table-wrap proforma-detail-lines">
        <table>
          <thead>
            <tr><th>ÍTEM</th><th>CÓDIGO</th><th>PRODUCTO</th><th>UNIDAD</th><th>CANTIDAD</th><th>PRECIO UNIT.</th><th>SUBTOTAL</th></tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id}>
                <td>{index + 1}</td>
                <td className="code-cell">{line.code}</td>
                <td className="product-cell">{line.name}</td>
                <td>{line.unit}</td>
                <td>{n(line.quantity)}</td>
                <td>{money(line.price)}</td>
                <td><strong>{money(line.subtotal)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lines.length && <EmptyState text="Esta proforma no tiene productos." />}
      </div>

      <div className="proforma-total-box">
        <span>{proforma.products} productos · {n(proforma.units)} unidades</span>
        <div><small>TOTAL</small><strong>{money(proforma.total)}</strong></div>
      </div>
      <div className="proforma-footer-note">
        <strong>Gracias por su preferencia.</strong>
        <span>Precios y disponibilidad sujetos a confirmación al momento de realizar el pedido.</span>
      </div>
      </div>
    </DataPanel>
  );
}

function ProformaPrintDocument({ proforma }: { proforma: Proforma }) {
  const lines = proforma.lines ?? [];
  return (
    <section className="print-document" aria-hidden="true">
      <PrintableDocumentHeader title="PROFORMA" number={proforma.number} />
      <table className="document-meta-table">
        <tbody>
          <tr>
            <th>FECHA</th><td>{dateOnly(proforma.date)}</td>
            <th>ALMACÉN</th><td>{proforma.warehouse}</td>
          </tr>
          <tr><th>CLIENTE</th><td colSpan={3}>{proforma.client}</td></tr>
          <tr>
            <th>DOCUMENTO</th><td>{proforma.document || "—"}</td>
            <th>CONDICIÓN</th><td>{proforma.paymentCondition}</td>
          </tr>
          <tr><th>DIRECCIÓN</th><td colSpan={3}>{proforma.address || "—"}</td></tr>
        </tbody>
      </table>
      <table className="document-items-table proforma-document-items">
        <thead>
          <tr><th>ITEM</th><th>UNIDAD</th><th>PRODUCTO</th><th>CANTIDAD</th><th>P. UNITARIO</th><th>SUBTOTAL</th></tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id}>
              <td>{index + 1}</td>
              <td>{line.unit}</td>
              <td>{line.name}</td>
              <td>{n(line.quantity)}</td>
              <td>{money(line.price)}</td>
              <td>{money(line.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="document-summary">
        <span>TOTAL DE ÍTEMS: {lines.length}</span>
        <strong>TOTAL: {money(proforma.total)}</strong>
      </div>
      <p className="document-footnote">Precios y disponibilidad sujetos a confirmación.</p>
    </section>
  );
}

function PrintableDocumentHeader({
  title,
  number,
}: {
  title: string;
  number: string;
}) {
  return (
    <header className="document-header">
      <img src="/jimdur-app-logo.png" alt="JIMDUR" />
      <h1>GRUPO JIMDUR &amp; MOTOREPUESTOS<br /><span>&quot;JIMÉNEZ&quot;</span></h1>
      <div className="document-title-box"><strong>{title}</strong><b>{number}</b></div>
    </header>
  );
}

type OrderEditorMode = "store" | "direct";

function normalizedOrderStatus(value: string) {
  const status = value.trim().toUpperCase();
  if (status === "PENDIENTE") return "ENVIADA";
  if (status === "PREPARANDO") return "EN PREPARACIÓN";
  return status;
}

function isDirectOrder(order: Order) {
  return order.flowMode.toUpperCase().includes("DIRECT");
}

function OrdersView({
  snapshot,
  runOperation,
  requestAction,
}: {
  snapshot: Snapshot;
  runOperation: RunOperation;
  requestAction: RequestAction;
}) {
  const [editorMode, setEditorMode] = useState<OrderEditorMode | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("TODOS");
  const [fromDate, setFromDate] = useState(todayInputValue);
  const [toDate, setToDate] = useState(todayInputValue);
  const canRequestStore = hasPermission(snapshot, "store_orders");
  const canManageWarehouse = hasPermission(snapshot, "operations");

  const visibleOrders = canManageWarehouse
    ? snapshot.orders
    : snapshot.orders.filter((order) => !isDirectOrder(order));
  const selectedOrder = visibleOrders.find((order) => order.id === detailId);
  const rows = useMemo(() => {
    const term = query.trim().toUpperCase();
    return visibleOrders.filter((order) => {
      const currentStatus = normalizedOrderStatus(order.status);
      const matchesText =
        !term ||
        [
          order.number,
          compactOperationalNumber(order.number),
          order.destination,
          order.warehouse,
          order.orderType,
          order.flowMode,
        ].some((value) => value.toUpperCase().includes(term));
      return (
        matchesText &&
        (status === "TODOS" || currentStatus === status) &&
        (!fromDate || order.date >= fromDate) &&
        (!toDate || order.date <= toDate)
      );
    });
  }, [fromDate, query, status, toDate, visibleOrders]);

  if (editorMode) {
    return (
      <OrderEditor
        mode={editorMode}
        existing={editingOrder}
        snapshot={snapshot}
        runOperation={runOperation}
        onCancel={() => {
          setEditorMode(null);
          setEditingOrder(null);
        }}
        onFinished={(id) => {
          setEditorMode(null);
          setEditingOrder(null);
          if (id) {
            setSelectedId(id);
            setDetailId(id);
          }
        }}
      />
    );
  }

  if (selectedOrder) {
    return (
      <OrderDetail
        order={selectedOrder}
        canCancel={hasPermission(snapshot, "cancellations")}
        canRequestStore={canRequestStore}
        canManageWarehouse={canManageWarehouse}
        autoPrint={autoPrint}
        onPrinted={() => setAutoPrint(false)}
        runOperation={runOperation}
        requestAction={requestAction}
        onBack={() => {
          setAutoPrint(false);
          setDetailId(null);
        }}
        onEdit={() => {
          setEditingOrder(selectedOrder);
          setEditorMode("store");
        }}
      />
    );
  }

  return (
    <div className="orders-workspace">
      <section className={canManageWarehouse ? "order-mode-bar" : "order-mode-bar single-mode"}>
        <div>
          <span className="eyebrow">NUEVA OPERACIÓN</span>
          <strong>¿Qué salida vas a registrar?</strong>
        </div>
        {canRequestStore && (
          <button
            className="order-mode-button store"
            onClick={() => {
              setEditingOrder(null);
              setEditorMode("store");
            }}
          >
            <b>＋</b>
            <span>PEDIDO DE TIENDA<small>Borrador y envío al almacén</small></span>
          </button>
        )}
        {canManageWarehouse && (
          <button
            className="order-mode-button direct"
            onClick={() => {
              setEditingOrder(null);
              setEditorMode("direct");
            }}
          >
            <b>→</b>
            <span>DESPACHO DIRECTO<small>Inicia en preparación</small></span>
          </button>
        )}
      </section>

      <DataPanel>
        <div className="panel-summary order-list-summary">
          <div>
            <strong>{rows.length} ÓRDENES EN LA LISTA</strong>
            <span>Selecciona una fila y abre el detalle para continuar el despacho.</span>
          </div>
          <div className="order-list-actions">
            <button
              disabled={!selectedId}
              onClick={() => selectedId && setDetailId(selectedId)}
            >
              ABRIR / VER DETALLE
            </button>
            <button
              disabled={!selectedId}
              onClick={() => {
                if (!selectedId) return;
                setAutoPrint(true);
                setDetailId(selectedId);
              }}
            >
              ⇩ EXPORTAR ORDEN SELECCIONADA
            </button>
          </div>
        </div>
        <FilterBar>
          <label>
            DESDE
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label>
            HASTA
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label>
            ESTADO
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>TODOS</option>
              <option>BORRADOR</option>
              <option>ENVIADA</option>
              <option>EN PREPARACIÓN</option>
              <option>LISTA</option>
              <option>DESPACHADA</option>
              <option>RECIBIDA</option>
              <option>CANCELADA</option>
              <option>ANULADA</option>
            </select>
          </label>
          <label className="wide-filter">
            BUSCAR
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="N.º orden, destino, almacén o tipo"
            />
          </label>
          <div className="filter-result"><strong>{rows.length}</strong><span>RESULTADOS</span></div>
        </FilterBar>
        <div className="table-wrap order-list-table">
          <table>
            <thead>
              <tr>
                <th>N.º ORDEN</th>
                <th>FECHA</th>
                <th>FLUJO</th>
                <th>DESTINO</th>
                <th>TIPO</th>
                <th>ALMACÉN</th>
                <th>SOLICITADO</th>
                <th>A DESPACHAR</th>
                <th>DESPACHADO</th>
                <th>ESTADO</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((order) => (
                <tr
                  key={order.id}
                  className={selectedId === order.id ? "selected-order-row" : ""}
                  onClick={() => setSelectedId(order.id)}
                  onDoubleClick={() => setDetailId(order.id)}
                >
                  <td className="code-cell">{compactOperationalNumber(order.number)}</td>
                  <td className="date-only-cell">{dateOnly(order.date)}</td>
                  <td><span className={isDirectOrder(order) ? "flow-chip direct" : "flow-chip"}>{isDirectOrder(order) ? "DIRECTO" : "TIENDA"}</span></td>
                  <td className="product-cell">{order.destination}</td>
                  <td>{order.orderType}</td>
                  <td>{order.warehouse}</td>
                  <td>{n(order.requested)}</td>
                  <td>{n(order.reserved)}</td>
                  <td>{n(order.dispatched)}</td>
                  <td><Status value={normalizedOrderStatus(order.status)} /></td>
                  <td><button className="table-action" onClick={(event) => { event.stopPropagation(); setDetailId(order.id); }}>VER</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <EmptyState text="No hay órdenes con esos filtros." />}
        </div>
      </DataPanel>
    </div>
  );
}

function OrderEditor({
  mode,
  existing,
  snapshot,
  runOperation,
  onCancel,
  onFinished,
}: {
  mode: OrderEditorMode;
  existing: Order | null;
  snapshot: Snapshot;
  runOperation: RunOperation;
  onCancel: () => void;
  onFinished: (id?: number) => void;
}) {
  const activeWarehouses = snapshot.warehouses.filter(
    (warehouse) => warehouse.active,
  );
  const availableWarehouses = existing
    ? snapshot.warehouses.filter(
        (warehouse) => warehouse.active || warehouse.id === existing.warehouseId,
      )
    : activeWarehouses;
  const firstWarehouse =
    existing?.warehouseId || activeWarehouses[0]?.id || 0;
  const [date, setDate] = useState(existing?.date || todayInputValue());
  const [warehouseId, setWarehouseId] = useState(firstWarehouse);
  const [destination, setDestination] = useState(existing?.destination || "TIENDA PRINCIPAL");
  const [orderType, setOrderType] = useState(existing?.orderType || (mode === "direct" ? "VENTA" : "REPOSICIÓN"));
  const [priority, setPriority] = useState(existing?.priority || "NORMAL");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [productId, setProductId] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [lines, setLines] = useState<Array<{ productId: number; quantity: number }>>(
    (existing?.lines ?? []).map((line) => ({
      productId: line.productId,
      quantity: line.requested,
    })),
  );

  const productOptions = useMemo(
    () => productSearchOptions(snapshot, warehouseId),
    [snapshot, warehouseId],
  );
  const selectedProduct = snapshot.products.find((product) => product.id === productId);
  const selectedStock = snapshot.stock.find(
    (row) => row.productId === productId && row.warehouseId === warehouseId,
  );
  const totalUnits = lines.reduce((total, line) => total + line.quantity, 0);

  const addLine = () => {
    if (!productId || quantity <= 0) return;
    setLines((current) => {
      const found = current.find((line) => line.productId === productId);
      return found
        ? current.map((line) =>
            line.productId === productId
              ? { ...line, quantity: line.quantity + quantity }
              : line,
          )
        : [...current, { productId, quantity }];
    });
    setProductId(0);
    setQuantity(1);
  };

  const save = async (initialStatus: "BORRADOR" | "ENVIADA" | "EN PREPARACIÓN") => {
    if (!warehouseId || !destination.trim() || !lines.length) return;
    const payload = {
      action: existing ? "update_order_draft" : "create_order",
      id: existing?.id,
      date,
      warehouseId,
      destination,
      orderType,
      flowMode: mode === "direct" ? "DESPACHO DIRECTO" : "PEDIDO DE TIENDA",
      priority,
      notes,
      initialStatus,
      lines,
    };
    const result = await runOperation(payload);
    if (!result.ok) return;
    const id = existing?.id || Number(result.data?.id || 0);
    if (existing && initialStatus === "ENVIADA") {
      const sent = await runOperation({
        action: "set_order_status",
        id: existing.id,
        targetStatus: "ENVIADA",
      });
      if (!sent.ok) return;
    }
    onFinished(id || undefined);
  };

  return (
    <DataPanel>
      <div className="order-editor-heading">
        <div>
          <span className="eyebrow">{mode === "direct" ? "DESPACHO DIRECTO" : "PEDIDO DE TIENDA"}</span>
          <h2>{existing ? "Editar " + existing.number : mode === "direct" ? "Registrar salida inmediata" : "Crear lista para el almacén"}</h2>
          <p>{mode === "direct" ? "La orden inicia en preparación y valida el stock disponible." : "Puedes guardar un borrador o enviarlo al almacén para su preparación."}</p>
        </div>
        <span className={mode === "direct" ? "order-editor-icon direct" : "order-editor-icon"}>{mode === "direct" ? "→" : "▤"}</span>
      </div>

      <div className="order-editor-body">
        <div className="form-grid order-main-fields">
          <label>FECHA<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>ALMACÉN<select value={warehouseId} onChange={(event) => { setWarehouseId(Number(event.target.value)); setProductId(0); }}>{availableWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></label>
          <label className="span-2">DESTINO / TIENDA<input required value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Ej. Tienda principal" /></label>
          <label>TIPO<select value={orderType} onChange={(event) => setOrderType(event.target.value)}><option>REPOSICIÓN</option><option>REPOSICIÓN URGENTE</option><option>VENTA</option><option>ENTREGA INTERNA</option><option>OTRO</option></select></label>
          <label>PRIORIDAD<select value={priority} onChange={(event) => setPriority(event.target.value)}><option>NORMAL</option><option>ALTA</option><option>URGENTE</option></select></label>
        </div>

        <section className="order-product-builder">
          <div className="order-section-title">
            <div><strong>PRODUCTOS SOLICITADOS</strong><span>Escribe el nombre del producto y agrega la cantidad.</span></div>
            <b>{lines.length} productos · {n(totalUnits)} unidades</b>
          </div>
          <div className="order-product-picker">
            <SearchCombobox
              id="order-product-search"
              label="BUSCAR PRODUCTO"
              placeholder=""
              options={productOptions}
              value={productId}
              onChange={setProductId}
              className="order-product-combobox"
            />
            <label>CANTIDAD<input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
            <button type="button" disabled={!productId || quantity <= 0} onClick={addLine}>＋ AGREGAR</button>
          </div>
          <OrderFileImporter
            products={snapshot.products}
            learnedAliases={snapshot.orderProductAliases}
            runOperation={runOperation}
            onApply={(imported) =>
              setLines((current) => {
                const next = [...current];
                for (const item of imported) {
                  const index = next.findIndex(
                    (line) => line.productId === item.productId,
                  );
                  if (index >= 0) {
                    next[index] = {
                      ...next[index],
                      quantity: next[index].quantity + item.quantity,
                    };
                  } else {
                    next.push({
                      productId: item.productId,
                      quantity: item.quantity,
                    });
                  }
                }
                return next;
              })
            }
          />
          {selectedProduct && (
            <div className={selectedStock?.available ? "stock-preview" : "stock-preview warning"}>
              <span><b>{selectedProduct.code}</b>{selectedProduct.name}</span>
              <strong>DISPONIBLE EN ESTE ALMACÉN: {n(selectedStock?.available || 0)} {selectedProduct.unit}</strong>
            </div>
          )}
          <div className="table-wrap order-editor-lines">
            <table>
              <thead><tr><th>CÓDIGO</th><th>PRODUCTO</th><th>UBICACIÓN</th><th>DISPONIBLE</th><th>SOLICITADO</th><th>UNIDAD</th><th /></tr></thead>
              <tbody>
                {lines.map((line) => {
                  const product = snapshot.products.find((item) => item.id === line.productId);
                  const stock = snapshot.stock.find((item) => item.productId === line.productId && item.warehouseId === warehouseId);
                  return (
                    <tr key={line.productId}>
                      <td className="code-cell">{product?.code}</td>
                      <td className="product-cell">{product?.name}</td>
                      <td>{product?.location || "—"}</td>
                      <td className={(stock?.available || 0) >= line.quantity ? "available-value" : "critical-value"}>{n(stock?.available || 0)}</td>
                      <td><input className="line-quantity-input" type="number" min="0.01" step="0.01" value={line.quantity} onChange={(event) => setLines((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity: Math.max(0.01, Number(event.target.value)) } : item))} /></td>
                      <td>{product?.unit}</td>
                      <td><button className="remove-line-button" type="button" onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!lines.length && <EmptyState text="Agrega los productos de la orden." />}
          </div>
        </section>
        <label className="notes-field order-notes">OBSERVACIÓN<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Indicaciones para preparación o entrega" /></label>
      </div>
      <div className="order-editor-footer">
        <button type="button" onClick={onCancel}>VOLVER A LA LISTA</button>
        <div>
          {mode === "store" && <button type="button" disabled={!lines.length || !destination.trim()} onClick={() => void save("BORRADOR")}>GUARDAR BORRADOR</button>}
          <button className="primary" type="button" disabled={!lines.length || !destination.trim()} onClick={() => void save(mode === "direct" ? "EN PREPARACIÓN" : "ENVIADA")}>{mode === "direct" ? "GUARDAR E INICIAR PREPARACIÓN" : "ENVIAR AL ALMACÉN"}</button>
        </div>
      </div>
    </DataPanel>
  );
}

function OrderFileImporter({
  products,
  learnedAliases,
  runOperation,
  onApply,
}: {
  products: Product[];
  learnedAliases: Snapshot["orderProductAliases"];
  runOperation: RunOperation;
  onApply: (lines: ImportedOrderLine[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<OrderFileImportResult | null>(null);
  const [manualRows, setManualRows] = useState<Record<string, { productId: number; quantity: number }>>({});

  type LearnedAlias = { alias: string; productId: number };
  const aliasStorageKey = "jimdur-order-product-aliases-v1";
  const readAliases = (): LearnedAlias[] => {
    try {
      const value = JSON.parse(window.localStorage.getItem(aliasStorageKey) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const aliasFromRow = (value: string) =>
    value
      .replace(/^\s*\[\s*\d+(?:[.,]\d+)?\s*\]\s*/, "")
      .replace(/\b\d+[.,]\d{2}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const readFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setFileName(file.name);
    setError("");
    setResult(null);
    setManualRows({});
    setStatus("Abriendo archivo…");
    try {
      const allAliases = [...learnedAliases, ...readAliases()].filter(
        (entry, index, values) => values.findIndex((item) => item.alias === entry.alias) === index,
      );
      const learnedProducts = allAliases.flatMap((entry) => {
        const product = products.find((item) => item.id === entry.productId);
        return product && entry.alias.length >= 5
          ? [{ ...product, name: entry.alias }]
          : [];
      });
      const imported = await importOrderFile(file, [...products, ...learnedProducts], setStatus);
      const canonicalMatched = imported.matched.map((line) => {
        const product = products.find((item) => item.id === line.productId);
        return product ? { ...line, code: product.code, name: product.name } : line;
      });
      const canonicalResult = { ...imported, matched: canonicalMatched };
      setResult(canonicalResult);
      setStatus(
        canonicalMatched.length
          ? `${canonicalMatched.length} productos reconocidos. Revisa las cantidades antes de agregarlos.`
          : "No se reconocieron productos del catálogo.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo leer el archivo seleccionado.",
      );
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const updateQuantity = (productId: number, quantity: number) => {
    setResult((current) =>
      current
        ? {
            ...current,
            matched: current.matched.map((line) =>
              line.productId === productId
                ? { ...line, quantity: Math.max(0.01, quantity || 0.01) }
                : line,
            ),
          }
        : current,
    );
  };

  const removeImported = (productId: number) => {
    setResult((current) =>
      current
        ? {
            ...current,
            matched: current.matched.filter(
              (line) => line.productId !== productId,
            ),
          }
        : current,
    );
  };

  const linkUnmatched = async (line: string, index: number) => {
    const key = `${index}:${line}`;
    const selection = manualRows[key];
    const product = products.find((item) => item.id === selection?.productId);
    if (!result || !selection || !product || selection.quantity <= 0) return;
    const current = result.matched.find((item) => item.productId === product.id);
    const linked: ImportedOrderLine = {
      productId: product.id,
      code: product.code,
      name: product.name,
      quantity: (current?.quantity ?? 0) + selection.quantity,
      source: current ? `${current.source} | ${line}` : line,
    };
    const alias = aliasFromRow(line);
    const aliases = readAliases().filter(
      (item) => !(item.alias === alias && item.productId === product.id),
    );
    if (alias.length >= 5) {
      window.localStorage.setItem(
        aliasStorageKey,
        JSON.stringify([...aliases, { alias, productId: product.id }].slice(-250)),
      );
      const saved = await runOperation({
        action: "save_order_product_alias",
        alias,
        productId: product.id,
      });
      if (!saved.ok) return;
    }
    setResult({
      ...result,
      matched: current
        ? result.matched.map((item) => item.productId === product.id ? linked : item)
        : [...result.matched, linked],
      unmatched: result.unmatched.filter((_, rowIndex) => rowIndex !== index),
    });
    setManualRows({});
    setStatus(`${product.name} fue vinculado y la equivalencia quedó guardada.`);
  };

  const applyImported = () => {
    if (!result?.matched.length) return;
    const lines = result.matched.filter((line) => line.quantity > 0);
    onApply(lines);
    setResult(null);
    setError("");
    setStatus(
      `${lines.length} productos de ${fileName} fueron agregados a la lista.`,
    );
  };

  return (
    <section className="order-file-import" aria-label="Cargar productos desde archivo">
      <div className="order-file-import-heading">
        <span className="order-file-import-icon">
          <AppIcon name="upload" size={20} />
        </span>
        <div>
          <strong>CARGAR PRODUCTOS DESDE ARCHIVO</strong>
          <span>PDF, foto, Excel o Word. El documento debe incluir código y cantidad.</span>
          <small>Lector v10 · Aprende equivalencias corregidas por el usuario.</small>
        </div>
        <label className={busy ? "order-file-button disabled" : "order-file-button"}>
          {busy ? "LEYENDO…" : "SELECCIONAR ARCHIVO"}
          <input
            type="file"
            disabled={busy}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.xlsm,.csv,.docx,.doc,application/pdf,image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void readFile(file);
            }}
          />
        </label>
      </div>

      {(status || error) && (
        <div
          className={error ? "order-file-status error" : "order-file-status"}
          role={error ? "alert" : "status"}
          aria-live={error ? "assertive" : "polite"}
        >
          {busy && <i />}
          <span>{error || status}</span>
        </div>
      )}

      {result && (
        <div className="order-file-review">
          {result.matched.length > 0 ? (
            <>
              <div className="order-file-review-title">
                <div>
                  <strong>REVISIÓN DE PRODUCTOS</strong>
                  <span>{fileName}</span>
                </div>
                <b>{result.matched.length} reconocidos</b>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>CÓDIGO</th><th>PRODUCTO</th><th>CANTIDAD</th><th /></tr>
                  </thead>
                  <tbody>
                    {result.matched.map((line) => (
                      <tr key={line.productId}>
                        <td className="code-cell">{line.code}</td>
                        <td className="product-cell">{line.name}</td>
                        <td>
                          <input
                            className="line-quantity-input"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={line.quantity}
                            onChange={(event) =>
                              updateQuantity(
                                line.productId,
                                Number(event.target.value),
                              )
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="remove-line-button"
                            type="button"
                            aria-label={`Quitar ${line.name}`}
                            onClick={() => removeImported(line.productId)}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="order-file-review-actions">
                <span>Verifica especialmente las cantidades leídas de fotos o documentos escaneados.</span>
                <button type="button" onClick={applyImported}>
                  AGREGAR {result.matched.length} PRODUCTOS A LA LISTA
                </button>
              </div>
            </>
          ) : (
            <div className="order-file-empty">
              <strong>No se encontró ningún código del catálogo.</strong>
              <span>Comprueba que el documento muestre claramente el código y la cantidad de cada producto.</span>
            </div>
          )}

          {result.warnings.map((warning) => (
            <p className="order-file-warning" key={warning}>{warning}</p>
          ))}
          {result.unmatched.length > 0 && (
            <details className="order-file-unmatched">
              <summary>{result.unmatched.length} filas pendientes de vincular</summary>
              <p>Selecciona el producto correcto una vez. JIMDUR ERP recordará la equivalencia para próximas cargas.</p>
              <div className="order-file-unmatched-list">
                {result.unmatched.map((line, index) => {
                  const key = `${index}:${line}`;
                  const selection = manualRows[key] || { productId: 0, quantity: 1 };
                  return (
                    <div className="order-file-unmatched-row" key={key}>
                      <span title={line}>{line}</span>
                      <select
                        aria-label={`Producto para ${line}`}
                        value={selection.productId}
                        onChange={(event) => setManualRows((current) => ({
                          ...current,
                          [key]: { ...selection, productId: Number(event.target.value) },
                        }))}
                      >
                        <option value={0}>Seleccionar producto…</option>
                        {products.filter((product) => product.active).map((product) => (
                          <option key={product.id} value={product.id}>{product.code} · {product.name}</option>
                        ))}
                      </select>
                      <input
                        aria-label={`Cantidad para ${line}`}
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={selection.quantity}
                        onChange={(event) => setManualRows((current) => ({
                          ...current,
                          [key]: { ...selection, quantity: Math.max(0.01, Number(event.target.value) || 0.01) },
                        }))}
                      />
                      <button type="button" disabled={!selection.productId} onClick={() => void linkUnmatched(line, index)}>
                        VINCULAR
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      )}

    </section>
  );
}

function OrderDetail({
  order,
  canCancel,
  canRequestStore,
  canManageWarehouse,
  autoPrint,
  onPrinted,
  runOperation,
  requestAction,
  onBack,
  onEdit,
}: {
  order: Order;
  canCancel: boolean;
  canRequestStore: boolean;
  canManageWarehouse: boolean;
  autoPrint: boolean;
  onPrinted: () => void;
  runOperation: RunOperation;
  requestAction: RequestAction;
  onBack: () => void;
  onEdit: () => void;
}) {
  const current = normalizedOrderStatus(order.status);
  const direct = isDirectOrder(order);
  const steps = direct
    ? ["EN PREPARACIÓN", "LISTA", "DESPACHADA", "RECIBIDA"]
    : ["BORRADOR", "ENVIADA", "EN PREPARACIÓN", "LISTA", "DESPACHADA", "RECIBIDA"];
  const activeStep = steps.indexOf(current);
  const lines = order.lines ?? [];
  const terminal = ["DESPACHADA", "RECIBIDA", "ANULADA"].includes(current);
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => {
      printAsPdf("Orden_Salida_" + compactOperationalNumber(order.number));
      onPrinted();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [autoPrint, onPrinted, order.number]);

  const changeStatus = async (targetStatus: string) => {
    if (targetStatus === "DESPACHADA") {
      const confirmed = await requestAction({
        title: "Confirmar salida",
        message:
          "El stock se descontará y el movimiento quedará registrado en Kardex.",
        confirmLabel: "CONFIRMAR SALIDA",
      });
      if (confirmed !== true) return;
    }
    if (targetStatus === "RECIBIDA") {
      const confirmed = await requestAction({
        title: "Confirmar recepción",
        message: "Confirma que el destino recibió este pedido.",
        confirmLabel: "CONFIRMAR RECEPCIÓN",
      });
      if (confirmed !== true) return;
    }
    let reason = "";
    if (["CANCELADA", "ANULADA"].includes(targetStatus)) {
      const isCancellation = targetStatus === "CANCELADA";
      const entered = await requestAction({
        title: isCancellation ? "Cancelar pedido" : "Anular despacho",
        message: isCancellation
          ? "Escribe el motivo de la cancelación para dejarlo registrado."
          : "Escribe el motivo. Los productos despachados volverán al stock.",
        confirmLabel: isCancellation
          ? "CANCELAR PEDIDO"
          : "ANULAR Y DEVOLVER STOCK",
        tone: "danger",
        inputLabel: "MOTIVO",
        inputPlaceholder: "Describe el motivo",
        inputRequired: true,
      });
      if (typeof entered !== "string") return;
      reason = entered;
    }
    await runOperation({
      action: "set_order_status",
      id: order.id,
      targetStatus,
      reason,
    });
  };

  return (
    <DataPanel>
      <OrderPrintDocument order={order} />
      <div className="screen-document-ui">
        <div className="order-print-header">
        <img src="/jimdur-app-logo.png" alt="JIMDUR" />
        <div><span>GRUPO JIMDUR E.I.R.L.</span><strong>ORDEN DE SALIDA Y DESPACHO</strong></div>
        <b>{compactOperationalNumber(order.number)}</b>
        </div>
        <div className="order-detail-toolbar">
        <button onClick={onBack}>← VOLVER A LA LISTA</button>
        <div>
          <button onClick={() => printAsPdf("Orden_Salida_" + compactOperationalNumber(order.number))}>▤ EXPORTAR ESTA ORDEN A PDF</button>
          <Status value={current} />
        </div>
        </div>
      <section className="order-detail-heading">
        <div>
          <span className={direct ? "flow-chip direct" : "flow-chip"}>{direct ? "DESPACHO DIRECTO" : "PEDIDO DE TIENDA"}</span>
          <h2>{compactOperationalNumber(order.number)}</h2>
          <p>{order.destination} · {order.orderType} · Prioridad {order.priority}</p>
        </div>
        <div className="order-detail-total"><small>SOLICITADO</small><strong>{n(order.requested)}</strong><span>unidades</span></div>
      </section>

      <div className={activeStep < 0 ? "order-stepper terminal" : "order-stepper"}>
        {steps.map((step, index) => (
          <div className={index < activeStep ? "complete" : index === activeStep ? "active" : ""} key={step}>
            <i>{index < activeStep ? "✓" : index + 1}</i>
            <span>{step}</span>
          </div>
        ))}
      </div>
      {activeStep < 0 && <div className="terminal-order-message"><Status value={current} /><span>Esta operación ya no forma parte del flujo activo.</span></div>}

      <section className="order-meta-grid">
        <div><small>FECHA</small><strong>{dateOnly(order.date)}</strong></div>
        <div><small>ALMACÉN</small><strong>{order.warehouse}</strong></div>
        <div><small>DESTINO</small><strong>{order.destination}</strong></div>
        <div><small>RESPONSABLE</small><strong>{order.userEmail || "—"}</strong></div>
      </section>

      <div className="table-wrap order-detail-lines">
        <table>
          <thead><tr><th>CÓDIGO</th><th>PRODUCTO</th><th>UBICACIÓN</th><th>DISPONIBLE</th><th>SOLICITADO</th><th>A DESPACHAR</th><th>FALTANTE</th><th>VALIDACIÓN</th></tr></thead>
          <tbody>
            {lines.map((line) => {
              const prepared = terminal ? line.dispatched : line.reserved;
              const missing = Math.max(0, line.requested - prepared);
              const validation = prepared >= line.requested ? "COMPLETO" : prepared > 0 ? "PARCIAL" : "SIN STOCK";
              return (
                <tr key={line.id}>
                  <td className="code-cell">{line.code}</td>
                  <td className="product-cell">{line.name}<small>{line.unit}</small></td>
                  <td>{line.location || "—"}</td>
                  <td>{n(line.available)}</td>
                  <td><strong>{n(line.requested)}</strong></td>
                  <td className="available-value"><strong>{n(prepared)}</strong></td>
                  <td className={missing > 0 ? "critical-value" : ""}>{n(missing)}</td>
                  <td><span className={"stock-validation " + validation.toLowerCase().replace(" ", "-")}>{validation}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!lines.length && <EmptyState text="Esta orden no tiene líneas disponibles." />}
      </div>

      {order.notes && <div className="order-detail-notes"><small>OBSERVACIONES Y TRAZABILIDAD</small><p>{order.notes}</p></div>}

      <div className="order-workflow-actions">
        <div>
          {canRequestStore && current === "BORRADOR" && <button onClick={onEdit}>✎ CONTINUAR EDICIÓN</button>}
          {canManageWarehouse && current === "EN PREPARACIÓN" && <button onClick={() => void runOperation({ action: "review_order_stock", id: order.id })}>↻ REVISAR STOCK</button>}
          {canCancel && ["BORRADOR", "ENVIADA", "EN PREPARACIÓN", "LISTA"].includes(current) && <button className="danger-outline" onClick={() => void changeStatus("CANCELADA")}>CANCELAR PEDIDO</button>}
          {canCancel && ["DESPACHADA", "RECIBIDA"].includes(current) && <button className="danger-outline" onClick={() => void changeStatus("ANULADA")}>ANULAR DESPACHO</button>}
        </div>
        <div>
          {canRequestStore && current === "BORRADOR" && <button className="primary" onClick={() => void changeStatus("ENVIADA")}>ENVIAR AL ALMACÉN →</button>}
          {canManageWarehouse && current === "ENVIADA" && <button className="primary" onClick={() => void changeStatus("EN PREPARACIÓN")}>INICIAR PREPARACIÓN →</button>}
          {canManageWarehouse && current === "EN PREPARACIÓN" && <button className="primary" onClick={() => void changeStatus("LISTA")}>MARCAR COMO LISTO →</button>}
          {canManageWarehouse && current === "LISTA" && <button className="primary dispatch" onClick={() => void changeStatus("DESPACHADA")}>CONFIRMAR SALIDA →</button>}
          {canManageWarehouse && current === "DESPACHADA" && <button className="primary receive" onClick={() => void changeStatus("RECIBIDA")}>CONFIRMAR RECEPCIÓN ✓</button>}
        </div>
      </div>
      </div>
    </DataPanel>
  );
}

function OrderPrintDocument({ order }: { order: Order }) {
  const lines = order.lines ?? [];
  return (
    <section className="print-document" aria-hidden="true">
      <PrintableDocumentHeader title="ORDEN DE SALIDA" number={compactOperationalNumber(order.number)} />
      <table className="document-meta-table">
        <tbody>
          <tr>
            <th>FECHA</th><td>{dateOnly(order.date)}</td>
            <th>ALMACÉN</th><td>{order.warehouse}</td>
          </tr>
          <tr><th>PARTIDA</th><td colSpan={3}>{order.warehouse}</td></tr>
          <tr><th>DESTINO</th><td colSpan={3}>{order.destination}</td></tr>
          <tr>
            <th>ENCARGADO</th><td>{order.userEmail || "—"}</td>
            <th>MOTIVO</th><td>{order.orderType}</td>
          </tr>
        </tbody>
      </table>
      <table className="document-items-table">
        <thead><tr><th>ITEM</th><th>UNIDAD</th><th>PRODUCTO</th><th>CANTIDAD</th></tr></thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id}>
              <td>{index + 1}</td>
              <td>{line.unit}</td>
              <td>{line.name}</td>
              <td>{n(line.requested)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="document-summary"><strong>TOTAL DE ÍTEMS: {lines.length}</strong></div>
      {order.notes && <p className="document-footnote"><b>OBSERVACIÓN:</b> {order.notes}</p>}
    </section>
  );
}

function TransfersView({ snapshot }: { snapshot: Snapshot }) {
  return (
    <DataPanel>
      <div className="panel-summary">
        <strong>{snapshot.transfers.length} TRANSFERENCIAS</strong>
        <span>Cada operación actualiza origen y destino simultáneamente.</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>N.º TRANSFERENCIA</th>
              <th>FECHA</th>
              <th>ORIGEN</th>
              <th>DESTINO</th>
              <th>PRODUCTOS</th>
              <th>UNIDADES</th>
              <th>RESPONSABLE</th>
              <th>ESTADO</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.transfers.map((transfer) => (
              <tr key={transfer.id}>
                <td className="code-cell">{transfer.number}</td>
                <td className="date-only-cell">{dateOnly(transfer.date)}</td>
                <td>{transfer.origin}</td>
                <td>{transfer.destination}</td>
                <td>{transfer.products}</td>
                <td>{n(transfer.units)}</td>
                <td>{transfer.userEmail || "—"}</td>
                <td><Status value={transfer.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!snapshot.transfers.length && <EmptyState text="Aún no hay transferencias." />}
      </div>
    </DataPanel>
  );
}

function AdjustmentsView({ snapshot }: { snapshot: Snapshot }) {
  const stockedRows = useMemo(
    () => snapshot.stock.filter((row) => row.physical > 0),
    [snapshot.stock],
  );
  return (
    <DataPanel>
      <div className="info-strip">
        <span>✓</span>
        <div>
          <strong>Ajustes con trazabilidad</strong>
          <p>
            La tabla muestra solo productos con stock. Al registrar un ajuste
            puedes buscar cualquier producto del catálogo, tenga o no existencias.
          </p>
        </div>
      </div>
      <StockTable rows={stockedRows} />
    </DataPanel>
  );
}

function KardexView({ snapshot }: { snapshot: Snapshot }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("TODOS");
  const rows = snapshot.movements.filter((movement) => {
    const term = query.trim().toLowerCase();
    return (
      (type === "TODOS" || movement.type === type) &&
      (!term ||
        (movement.code + " " + movement.product + " " + movement.document)
          .toLowerCase()
          .includes(term))
    );
  });
  return (
    <DataPanel>
      <FilterBar>
        <label className="wide-filter">
          PRODUCTO O DOCUMENTO
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Código, descripción o documento"
          />
        </label>
        <label>
          MOVIMIENTO
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option>TODOS</option>
            <option>INGRESO</option>
            <option>SALIDA</option>
            <option>AJUSTE</option>
            <option>MIGRACION_INICIAL</option>
          </select>
        </label>
      </FilterBar>
      <MovementTable rows={rows} />
    </DataPanel>
  );
}

function CriticalView({ snapshot }: { snapshot: Snapshot }) {
  const rows = snapshot.products.filter(isCriticalProduct);
  return (
    <DataPanel>
      <div className="critical-summary">
        <span>△</span>
        <div>
          <strong>{rows.length} productos requieren atención</strong>
          <p>La lista incluye productos activos con menos de 15 unidades disponibles.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>CÓDIGO</th><th>PRODUCTO</th><th>UBICACIÓN</th><th>FÍSICO</th><th>RESERVADO</th><th>DISPONIBLE</th><th>ESTADO</th></tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.id}>
                <td className="code-cell">{product.code}</td>
                <td className="product-cell">{product.name}</td>
                <td>{product.location || "—"}</td>
                <td>{n(product.physical)}</td>
                <td>{n(product.reserved)}</td>
                <td className="critical-value">{n(product.available)}</td>
                <td><Status value={product.available <= 0 ? "AGOTADO" : "STOCK BAJO"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <EmptyState text="No hay productos con menos de 15 unidades." />
        )}
      </div>
    </DataPanel>
  );
}

function WarehousesView({
  snapshot,
  runOperation,
  requestAction,
  onEdit,
}: {
  snapshot: Snapshot;
  runOperation: RunOperation;
  requestAction: RequestAction;
  onEdit: (warehouse: Warehouse) => void;
}) {
  const toggleWarehouse = async (warehouse: Warehouse) => {
    if (warehouse.active) {
      const confirmed = await requestAction({
        title: "Dar de baja el almacén",
        message:
          warehouse.name + " dejará de aparecer en las operaciones nuevas.",
        confirmLabel: "DAR DE BAJA",
        tone: "danger",
      });
      if (confirmed !== true) return;
    }
    await runOperation({
      action: "save_warehouse",
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      active: !warehouse.active,
    });
  };
  return (
    <div className="warehouse-grid">
      {snapshot.warehouses.map((warehouse, index) => (
        <article className="warehouse-card" key={warehouse.id}>
          <div className={"warehouse-card-icon " + (index ? "secondary" : "")}>
            ⌂
          </div>
          <div className="warehouse-card-title">
            <span>{warehouse.code}</span>
            <h3>{warehouse.name}</h3>
            <Status value={warehouse.active ? "ACTIVO" : "INACTIVO"} />
          </div>
          <dl>
            <div><dt>Productos con stock</dt><dd>{warehouse.productsWithStock}</dd></div>
            <div><dt>Stock físico</dt><dd>{n(warehouse.physical)}</dd></div>
            <div><dt>Reservado</dt><dd>{n(warehouse.reserved)}</dd></div>
            <div><dt>Disponible</dt><dd>{n(warehouse.available)}</dd></div>
          </dl>
          <div className="warehouse-card-actions">
            <button type="button" onClick={() => onEdit(warehouse)}>EDITAR</button>
            <button
              type="button"
              className={warehouse.active ? "danger" : "activate"}
              onClick={() => void toggleWarehouse(warehouse)}
            >
              {warehouse.active ? "DAR DE BAJA" : "ACTIVAR"}
            </button>
          </div>
        </article>
      ))}
      {!snapshot.warehouses.length && (
        <EmptyState text="Todavía no hay almacenes registrados." />
      )}
    </div>
  );
}

function ReportsView({
  snapshot,
  setNotice,
}: {
  snapshot: Snapshot;
  setNotice: (value: string) => void;
}) {
  const [from, setFrom] = useState(todayInputValue);
  const [to, setTo] = useState(todayInputValue);
  const [type, setType] = useState("TODOS");
  const [query, setQuery] = useState("");
  const [datePresets] = useState(() => {
    const now = new Date();
    return {
      today: dateInputValue(now),
      lastSevenDays: dateInputValue(
        new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      ),
      monthStart: dateInputValue(
        new Date(now.getFullYear(), now.getMonth(), 1),
      ),
    };
  });
  const { today, lastSevenDays, monthStart } = datePresets;
  const invalidRange = Boolean(from && to && from > to);
  const rows = snapshot.movements.filter((row) => {
    const day = row.date.slice(0, 10);
    const term = query.trim().toLowerCase();
    return (
      (!from || day >= from) &&
      (!to || day <= to) &&
      (type === "TODOS" || row.type === type) &&
      (!term ||
        (row.code + " " + row.product + " " + row.document)
          .toLowerCase()
          .includes(term))
    );
  });
  const totalQuantity = rows.reduce(
    (total, row) => total + Number(row.quantity || 0),
    0,
  );
  const applyPreset = (start: string, end = today) => {
    setFrom(start);
    setTo(end);
  };
  return (
    <DataPanel>
      <div className="report-preset-bar">
        <div>
          <strong>RANGO RÁPIDO</strong>
          <span>Consulta movimientos sin escribir las fechas.</span>
        </div>
        <div className="report-preset-buttons">
          <button
            className={from === today && to === today ? "active" : ""}
            onClick={() => applyPreset(today)}
          >
            HOY
          </button>
          <button
            className={from === lastSevenDays && to === today ? "active" : ""}
            onClick={() => applyPreset(lastSevenDays)}
          >
            ÚLTIMOS 7 DÍAS
          </button>
          <button
            className={from === monthStart && to === today ? "active" : ""}
            onClick={() => applyPreset(monthStart)}
          >
            ESTE MES
          </button>
        </div>
      </div>
      <FilterBar>
        <label>DESDE<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>HASTA<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label>
          TIPO
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option>TODOS</option><option>INGRESO</option><option>SALIDA</option><option>AJUSTE</option>
          </select>
        </label>
        <label className="wide-filter">
          BUSCAR
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Producto o documento" />
        </label>
        <button
          className="filter-export"
          disabled={invalidRange || rows.length === 0}
          onClick={() => {
            downloadCsv(
              ["FECHA", "TIPO", "DOCUMENTO", "CÓDIGO", "PRODUCTO", "CANTIDAD", "ALMACÉN", "USUARIO"],
              rows.map((row) => [row.date, row.type, row.document, row.code, row.product, row.quantity, row.warehouse, row.userEmail]),
              `JIMDUR_MOVIMIENTOS_${from || "INICIO"}_${to || "HOY"}.csv`,
            );
            setNotice("Reporte exportado correctamente.");
          }}
        >
          <AppIcon name="download" size={15} />
          EXPORTAR
        </button>
      </FilterBar>
      {invalidRange ? (
        <div className="report-range-error" role="alert">
          <AppIcon name="alert" size={17} />
          La fecha “Desde” no puede ser posterior a la fecha “Hasta”.
        </div>
      ) : (
        <div className="report-summary-strip">
          <div>
            <AppIcon name="report" size={18} />
            <span><small>MOVIMIENTOS</small><strong>{rows.length}</strong></span>
          </div>
          <div>
            <AppIcon name="inventory" size={18} />
            <span><small>UNIDADES MOVILIZADAS</small><strong>{n(totalQuantity)}</strong></span>
          </div>
          <div>
            <AppIcon name="clock" size={18} />
            <span><small>PERÍODO</small><strong>{from || "Inicio"} — {to || "Hoy"}</strong></span>
          </div>
        </div>
      )}
      <MovementTable rows={rows} />
    </DataPanel>
  );
}

function UsersView({
  snapshot,
  onEdit,
}: {
  snapshot: Snapshot;
  onEdit: (user: AppUser) => void;
}) {
  return (
    <DataPanel>
      <div className="panel-summary">
        <strong>{snapshot.users.length} USUARIOS</strong>
        <span>
          Cada persona ingresa con su propio usuario y contraseña JIMDUR.
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>NOMBRE</th><th>USUARIO</th><th>NIVEL</th><th>PERMISOS</th><th>ÚLTIMO ACCESO</th><th>ESTADO</th><th /></tr>
          </thead>
          <tbody>
            {snapshot.users.map((user) => (
              <tr key={user.email}>
                <td className="product-cell">{user.displayName}</td>
                <td className="code-cell">{user.username}</td>
                <td>{user.role}</td>
                <td>
                  {user.role === "ADMINISTRADOR"
                    ? "TODOS"
                    : user.permissions.length === 1 &&
                        user.permissions.includes("store_orders")
                      ? "PEDIDO DE TIENDA"
                      : user.permissions.length}
                </td>
                <td>{user.lastAccess ? dateTime(user.lastAccess) : "SIN INGRESO"}</td>
                <td><Status value={user.active ? "ACTIVO" : "INACTIVO"} /></td>
                <td><button className="table-action" onClick={() => onEdit(user)}>EDITAR</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="access-warning">
        <strong>Importante</strong>
        <span>
          Al crear o restablecer una cuenta, entrega la contraseña temporal solo
          al usuario correspondiente. JIMDUR le pedirá cambiarla al ingresar.
        </span>
      </div>
    </DataPanel>
  );
}

function BackupsView({
  snapshot,
  onImport,
  setNotice,
}: {
  snapshot: Snapshot;
  onImport: () => void;
  setNotice: (value: string) => void;
}) {
  const downloadBackup = () => {
    downloadBlob(
      JSON.stringify(
        {
          system: "JIMDUR ERP",
          generatedAt: new Date().toISOString(),
          data: snapshot,
        },
        null,
        2,
      ),
      "JIMDUR_RESPALDO_" + new Date().toISOString().slice(0, 10) + ".json",
      "application/json",
    );
    setNotice("Respaldo descargado correctamente.");
  };
  return (
    <div className="backup-shell">
      <section className="backup-overview">
        <article className="backup-card protected">
          <span>✓</span><div><small>PROTECCIÓN</small><strong>Base en línea</strong><p>Datos persistentes y centralizados.</p></div>
        </article>
        <article className="backup-card">
          <span>⇩</span><div><small>RESPALDO</small><strong>Descarga inmediata</strong><p>Archivo administrativo en formato JSON.</p></div>
        </article>
        <article className="backup-card">
          <span>⇄</span><div><small>MIGRACIÓN</small><strong>Desde SQL Server</strong><p>Catálogo y stock sin contraseñas.</p></div>
        </article>
      </section>
      <section className="migration-steps">
        <div className="migration-heading">
          <span className="eyebrow">MIGRACIÓN DESDE LA PC</span>
          <h3>Pasar CONTROL_INVENTARIO a JIMDUR ERP</h3>
          <p>
            El exportador solo consulta la base local. No modifica SQL Server y
            excluye contraseñas, hashes y tokens.
          </p>
        </div>
        <ol>
          <li><b>1</b><div><strong>Descarga el exportador</strong><span>Guárdalo en la PC donde funciona JIMDUR.</span></div></li>
          <li><b>2</b><div><strong>Ejecuta como usuario de Windows</strong><span>Se creará un archivo JIMDUR_EXPORT en el Escritorio.</span></div></li>
          <li><b>3</b><div><strong>Importa el archivo aquí</strong><span>Se cargarán productos, almacenes y stock actual.</span></div></li>
        </ol>
        <div className="migration-actions">
          <a href="/JIMDUR_EXPORTADOR_SQL.zip" download>⇩ DESCARGAR EXPORTADOR</a>
          <button onClick={onImport}>⇧ IMPORTAR ARCHIVO</button>
          <button className="secondary" onClick={downloadBackup}>⇩ DESCARGAR RESPALDO WEB</button>
        </div>
      </section>
      <section className="import-history">
        <div className="card-title"><h3>Historial de migraciones</h3><span>{snapshot.imports.length} registros</span></div>
        {snapshot.imports.map((run) => (
          <div className="import-row" key={run.id}>
            <span>✓</span>
            <div><strong>{run.sourceDatabase || "CONTROL_INVENTARIO"}</strong><small>{run.sourceServer || "SQL Server local"}</small></div>
            <b>{dateTime(run.importedAt)}</b>
            <code>{run.summary}</code>
          </div>
        ))}
        {!snapshot.imports.length && <EmptyInline text="Todavía no se realizó una migración." />}
      </section>
    </div>
  );
}

function StockTable({ rows }: { rows: StockRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>CÓDIGO</th><th>PRODUCTO</th><th>UBICACIÓN</th><th>ALMACÉN</th><th>FÍSICO</th><th>RESERVADO</th><th>DAÑADO</th><th>DISPONIBLE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="code-cell">{row.code}</td>
              <td className="product-cell">{row.name}</td>
              <td>{row.location || "—"}</td>
              <td>{row.warehouse}</td>
              <td>{n(row.physical)}</td>
              <td>{n(row.reserved)}</td>
              <td>{n(row.damaged)}</td>
              <td className={row.available <= 0 ? "critical-value" : "available-value"}>{n(row.available)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState text="No hay inventario para mostrar." />}
    </div>
  );
}

function MovementTable({ rows }: { rows: Snapshot["movements"] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>FECHA / HORA</th><th>MOVIMIENTO</th><th>DOCUMENTO</th><th>CÓDIGO</th><th>PRODUCTO</th><th>CANTIDAD</th><th>ALMACÉN</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="date-time-cell">{dateTime(row.date)}</td>
              <td><span className={"movement-badge " + row.type.toLowerCase()}>{row.type.replaceAll("_", " ")}</span></td>
              <td className="code-cell">{compactOperationalNumber(row.document)}</td>
              <td>{row.code}</td>
              <td className="product-cell">{row.product}</td>
              <td>{n(row.quantity)}</td>
              <td>{row.warehouse}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState text="No hay movimientos con esos filtros." />}
    </div>
  );
}

function Status({ value }: { value: string }) {
  const key = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll(" ", "-");
  return <span className={"status-badge status-" + key}>{value}</span>;
}

function DataPanel({ children }: { children: ReactNode }) {
  return <section className="data-panel">{children}</section>;
}

function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><span>⌕</span><strong>{text}</strong><p>Registra información nueva o cambia los filtros.</p></div>;
}

function EmptyInline({ text }: { text: string }) {
  return <div className="empty-inline">{text}</div>;
}

function ActionDialog({
  dialog,
  onCancel,
  onConfirm,
}: {
  dialog: ActionDialogState;
  onCancel: () => void;
  onConfirm: (result: true | string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const hasInput = Boolean(dialog.inputLabel);
  const trimmedValue = inputValue.trim();

  useEffect(() => {
    const closeWithEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", closeWithEscape);
    return () => document.removeEventListener("keydown", closeWithEscape);
  }, [onCancel]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (hasInput) {
      if (dialog.inputRequired && !trimmedValue) return;
      onConfirm(trimmedValue);
      return;
    }
    onConfirm(true);
  };

  return (
    <div
      className="modal-backdrop action-dialog-backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && onCancel()
      }
    >
      <section
        className={"action-dialog-card " + (dialog.tone || "primary")}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="action-dialog-title"
        aria-describedby="action-dialog-message"
      >
        <form onSubmit={submit}>
          <div className="action-dialog-icon" aria-hidden="true">
            {dialog.tone === "danger" ? "!" : "✓"}
          </div>
          <div className="action-dialog-copy">
            <h3 id="action-dialog-title">{dialog.title}</h3>
            <p id="action-dialog-message">{dialog.message}</p>
          </div>
          {hasInput && (
            <label className="action-dialog-field">
              {dialog.inputLabel}
              <textarea
                autoFocus
                rows={3}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder={dialog.inputPlaceholder}
                required={dialog.inputRequired}
              />
            </label>
          )}
          <div className="action-dialog-actions">
            <button type="button" onClick={onCancel}>
              {dialog.cancelLabel || "CANCELAR"}
            </button>
            <button
              className={dialog.tone === "danger" ? "danger" : "primary"}
              type="submit"
              disabled={Boolean(
                hasInput && dialog.inputRequired && !trimmedValue,
              )}
            >
              {dialog.confirmLabel || "CONFIRMAR"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Modal({
  title,
  eyebrow,
  description,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3><p>{description}</p></div>
          <button aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ProductModal({
  snapshot,
  product,
  busy,
  runOperation,
  onClose,
}: {
  snapshot: Snapshot;
  product: Product | null;
  busy: boolean;
  runOperation: RunOperation;
  onClose: () => void;
}) {
  const activeWarehouses = snapshot.warehouses.filter(
    (warehouse) => warehouse.active,
  );
  const [form, setForm] = useState({
    code: product?.code || "",
    supplierCode: product?.supplierCode || "",
    name: product?.name || "",
    brand: product?.brand || "",
    application: product?.application || "",
    unit: product?.unit || "UND",
    location: product?.location || "",
    cost: String(product?.cost || 0),
    minimum: String(product?.minimum || 0),
    initialStock: "0",
    warehouseId: String(activeWarehouses[0]?.id || ""),
    active: product?.active ?? true,
  });
  const field = (key: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await runOperation({
      action: product ? "update_product" : "create_product",
      id: product?.id,
      ...form,
      warehouseId: Number(form.warehouseId),
      cost: Number(form.cost),
      minimum: Number(form.minimum),
      initialStock: Number(form.initialStock),
    });
  };
  return (
    <Modal
      title={product ? "Editar producto" : "Nuevo producto"}
      eyebrow="MAESTRO DE PRODUCTOS"
      description="Datos principales para identificar y controlar el repuesto."
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <label>CÓDIGO<input required disabled={!!product} value={form.code} onChange={(event) => field("code", event.target.value)} /></label>
          <label className="span-2">PRODUCTO<input required value={form.name} onChange={(event) => field("name", event.target.value)} /></label>
          <label>CÓD. PROVEEDOR<input value={form.supplierCode} onChange={(event) => field("supplierCode", event.target.value)} /></label>
          <label>MARCA<input value={form.brand} onChange={(event) => field("brand", event.target.value)} /></label>
          <label>APLICACIÓN<input value={form.application} onChange={(event) => field("application", event.target.value)} /></label>
          <label>UNIDAD<select value={form.unit} onChange={(event) => field("unit", event.target.value)}><option>UND</option><option>JGO</option><option>PAR</option><option>SET</option><option>LT</option></select></label>
          <label>UBICACIÓN<input value={form.location} onChange={(event) => field("location", event.target.value)} placeholder="A-01-01" /></label>
          <label>COSTO<input type="number" min="0" step="0.01" value={form.cost} onChange={(event) => field("cost", event.target.value)} /></label>
          {!product && (
            <>
              <label>ALMACÉN<select required value={form.warehouseId} onChange={(event) => field("warehouseId", event.target.value)}>{activeWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></label>
              <label>STOCK INICIAL<input type="number" min="0" step="0.01" value={form.initialStock} onChange={(event) => field("initialStock", event.target.value)} /></label>
            </>
          )}
          {product && <label>ESTADO<select value={form.active ? "ACTIVO" : "INACTIVO"} onChange={(event) => field("active", event.target.value === "ACTIVO")}><option>ACTIVO</option><option>INACTIVO</option></select></label>}
        </div>
        <ModalFooter busy={busy} onClose={onClose} label="GUARDAR PRODUCTO" />
      </form>
    </Modal>
  );
}

function WarehouseModal({
  warehouse,
  busy,
  runOperation,
  onClose,
}: {
  warehouse: Warehouse | null;
  busy: boolean;
  runOperation: RunOperation;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    code: warehouse?.code || "",
    name: warehouse?.name || "",
    active: warehouse?.active ?? true,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await runOperation({
      action: "save_warehouse",
      id: warehouse?.id,
      code: form.code,
      name: form.name,
      active: form.active,
    });
  };
  return (
    <Modal
      title={warehouse ? "Editar almacén" : "Nuevo almacén"}
      eyebrow="MAESTRO DE ALMACENES"
      description="Administra los lugares disponibles para nuevas operaciones."
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-grid warehouse-form-grid">
          <label>
            CÓDIGO
            <input
              required
              value={form.code}
              onChange={(event) =>
                setForm({ ...form, code: event.target.value.toUpperCase() })
              }
              placeholder="EJ.: ALM-NORTE"
            />
          </label>
          <label className="span-2">
            NOMBRE DEL ALMACÉN
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value.toUpperCase() })
              }
              placeholder="EJ.: ALMACÉN NORTE"
            />
          </label>
          {warehouse && (
            <label>
              ESTADO
              <select
                value={form.active ? "ACTIVO" : "INACTIVO"}
                onChange={(event) =>
                  setForm({ ...form, active: event.target.value === "ACTIVO" })
                }
              >
                <option>ACTIVO</option>
                <option>INACTIVO</option>
              </select>
            </label>
          )}
        </div>
        <ModalFooter
          busy={busy}
          onClose={onClose}
          label="GUARDAR ALMACÉN"
        />
      </form>
    </Modal>
  );
}

type OperationKind = "receipt" | "proforma" | "order" | "transfer";

function LineOperationModal({
  kind,
  snapshot,
  busy,
  runOperation,
  onClose,
}: {
  kind: OperationKind;
  snapshot: Snapshot;
  busy: boolean;
  runOperation: RunOperation;
  onClose: () => void;
}) {
  const activeWarehouses = snapshot.warehouses.filter(
    (warehouse) => warehouse.active,
  );
  const firstWarehouse = activeWarehouses[0]?.id || 0;
  const secondWarehouse = activeWarehouses[1]?.id || firstWarehouse;
  const [form, setForm] = useState({
    date: todayInputValue(),
    warehouseId: firstWarehouse,
    originWarehouseId: firstWarehouse,
    destinationWarehouseId: secondWarehouse,
    supplier: "",
    source: "",
    documentNumber: "",
    carrier: "",
    client: "",
    document: "",
    address: "",
    paymentCondition: "CONTADO",
    destination: "TIENDA PRINCIPAL",
    orderType: "REPOSICIÓN",
    flowMode: "PEDIDO",
    priority: "NORMAL",
    notes: "",
  });
  const [draft, setDraft] = useState({
    productId: 0,
    quantity: 1,
    damaged: 0,
    price: 0,
  });
  const [lines, setLines] = useState<Array<typeof draft>>([]);
  const selectedProduct = snapshot.products.find((product) => product.id === draft.productId);
  const searchWarehouseId =
    kind === "transfer" ? form.originWarehouseId : form.warehouseId;
  const selectedProductStock = snapshot.stock.find(
    (row) =>
      row.productId === draft.productId &&
      row.warehouseId === searchWarehouseId,
  );
  const productOptions = useMemo(
    () => productSearchOptions(snapshot, searchWarehouseId),
    [snapshot, searchWarehouseId],
  );
  const addLine = () => {
    if (!draft.productId || draft.quantity <= 0) return;
    setLines((current) => {
      const existing = current.find((line) => line.productId === draft.productId);
      if (existing) {
        return current.map((line) =>
          line.productId === draft.productId
            ? { ...line, quantity: line.quantity + draft.quantity, damaged: line.damaged + draft.damaged }
            : line,
        );
      }
      return [...current, { ...draft }];
    });
    setDraft((current) => ({
      ...current,
      productId: 0,
      quantity: 1,
      damaged: 0,
      price: 0,
    }));
  };
  const labels = {
    receipt: ["Nueva recepción", "INGRESO DE MERCADERÍA", "Registra lo recibido y actualiza el stock.", "create_receipt"],
    proforma: ["Nueva proforma", "COTIZACIÓN COMERCIAL", "Registra productos y precios para el cliente.", "create_proforma"],
    order: ["Nueva orden de salida", "CONTROL DE DESPACHO", "Reserva productos para preparación y entrega.", "create_order"],
    transfer: ["Nueva transferencia", "MOVIMIENTO ENTRE ALMACENES", "Traslada stock con trazabilidad inmediata.", "create_transfer"],
  } as const;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!lines.length) return;
    await runOperation({
      action: labels[kind][3],
      ...form,
      lines: lines.map((line) => ({
        ...line,
        expected: line.quantity,
        received: line.quantity,
      })),
    });
  };
  return (
    <Modal title={labels[kind][0]} eyebrow={labels[kind][1]} description={labels[kind][2]} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-grid operation-fields">
          <label>FECHA<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          {kind !== "transfer" && <label>ALMACÉN<select value={form.warehouseId} onChange={(event) => { setForm({ ...form, warehouseId: Number(event.target.value) }); setDraft((current) => ({ ...current, productId: 0, price: 0 })); }}>{activeWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></label>}
          {kind === "transfer" && (
            <>
              <label>ORIGEN<select value={form.originWarehouseId} onChange={(event) => { setForm({ ...form, originWarehouseId: Number(event.target.value) }); setDraft((current) => ({ ...current, productId: 0, price: 0 })); }}>{activeWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></label>
              <label>DESTINO<select value={form.destinationWarehouseId} onChange={(event) => setForm({ ...form, destinationWarehouseId: Number(event.target.value) })}>{activeWarehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></label>
            </>
          )}
          {kind === "receipt" && (
            <>
              <label className="span-2">PROVEEDOR<input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} /></label>
              <label>PROCEDENCIA<input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label>
              <label>DOCUMENTO<input value={form.documentNumber} onChange={(event) => setForm({ ...form, documentNumber: event.target.value })} /></label>
            </>
          )}
          {kind === "proforma" && (
            <>
              <label className="span-2">CLIENTE<input required value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} /></label>
              <label>DOCUMENTO<input value={form.document} onChange={(event) => setForm({ ...form, document: event.target.value })} /></label>
              <label>DIRECCIÓN<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
            </>
          )}
          {kind === "order" && (
            <>
              <label className="span-2">DESTINO<input required value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} /></label>
              <label>TIPO<select value={form.orderType} onChange={(event) => setForm({ ...form, orderType: event.target.value })}><option>REPOSICIÓN</option><option>VENTA</option><option>USO INTERNO</option></select></label>
              <label>PRIORIDAD<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>NORMAL</option><option>ALTA</option><option>URGENTE</option></select></label>
            </>
          )}
        </div>
        <div className="line-builder">
          <SearchCombobox
            id={kind + "-product-search"}
            label="BUSCAR PRODUCTO"
            placeholder=""
            options={productOptions}
            value={draft.productId}
            onChange={(productId) => {
              const product = snapshot.products.find((item) => item.id === productId);
              setDraft((current) => ({
                ...current,
                productId,
                price: product?.cost || 0,
              }));
            }}
            className="product-picker"
          />
          <label>CANTIDAD<input type="number" min="0.01" step="0.01" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: Number(event.target.value) })} /></label>
          {kind === "receipt" && <label>DAÑADO<input type="number" min="0" step="0.01" value={draft.damaged} onChange={(event) => setDraft({ ...draft, damaged: Number(event.target.value) })} /></label>}
          {kind === "proforma" && <label>PRECIO<input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label>}
          <button type="button" onClick={addLine}>+ AGREGAR</button>
          {selectedProduct && <small>Disponible en el almacén seleccionado: {n(selectedProductStock?.available || 0)} {selectedProduct.unit}</small>}
        </div>
        <div className="line-list">
          <div className="line-list-head"><span>PRODUCTO</span><span>CANTIDAD</span><span>{kind === "proforma" ? "PRECIO" : kind === "receipt" ? "DAÑADO" : "UNIDAD"}</span><span /></div>
          {lines.map((line) => {
            const product = snapshot.products.find((item) => item.id === line.productId);
            return (
              <div className="line-list-row" key={line.productId}>
                <span><b>{product?.code}</b>{product?.name}</span>
                <strong>{n(line.quantity)}</strong>
                <span>{kind === "proforma" ? money(line.price) : kind === "receipt" ? n(line.damaged) : product?.unit}</span>
                <button type="button" onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))}>×</button>
              </div>
            );
          })}
          {!lines.length && <EmptyInline text="Agrega por lo menos un producto." />}
        </div>
        <label className="notes-field">OBSERVACIÓN<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <ModalFooter busy={busy} onClose={onClose} label="CONFIRMAR OPERACIÓN" disabled={!lines.length} />
      </form>
    </Modal>
  );
}

function AdjustmentModal({
  snapshot,
  busy,
  runOperation,
  onClose,
}: {
  snapshot: Snapshot;
  busy: boolean;
  runOperation: RunOperation;
  onClose: () => void;
}) {
  const activeWarehouses = snapshot.warehouses.filter(
    (warehouse) => warehouse.active,
  );
  const [productId, setProductId] = useState(0);
  const [warehouseId, setWarehouseId] = useState(
    activeWarehouses[0]?.id || 0,
  );
  const [newPhysical, setNewPhysical] = useState("0");
  const [notes, setNotes] = useState("Conteo físico");
  const product = snapshot.products.find((item) => item.id === productId);
  const warehouse = activeWarehouses.find((item) => item.id === warehouseId);
  const row = snapshot.stock.find(
    (item) =>
      item.productId === productId && item.warehouseId === warehouseId,
  );
  const productOptions = useMemo<SearchOption[]>(
    () =>
      snapshot.products.filter((item) => item.active).map((item) => ({
        value: item.id,
        code: item.code,
        label: item.name,
        meta:
          "Stock físico total: " +
          n(item.physical) +
          " " +
          item.unit,
      })),
    [snapshot.products],
  );
  const setCurrentPhysical = (nextProductId: number, nextWarehouseId: number) => {
    const selected = snapshot.stock.find(
      (item) =>
        item.productId === nextProductId &&
        item.warehouseId === nextWarehouseId,
    );
    setNewPhysical(String(selected?.physical || 0));
  };
  const changeProduct = (id: number) => {
    setProductId(id);
    setCurrentPhysical(id, warehouseId);
  };
  const changeWarehouse = (id: number) => {
    setWarehouseId(id);
    setCurrentPhysical(productId, id);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!product || !warehouse) return;
    await runOperation({
      action: "adjust_stock",
      productId: product.id,
      warehouseId: warehouse.id,
      newPhysical: Number(newPhysical),
      notes,
    });
  };
  return (
    <Modal title="Ingresar o ajustar stock" eyebrow="CONTEO Y CORRECCIÓN" description="Puedes seleccionar cualquier producto activo, incluso si todavía no tiene existencias." onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <SearchCombobox
            id="adjustment-product-search"
            label="BUSCAR PRODUCTO"
            placeholder="Código o nombre del producto"
            options={productOptions}
            value={productId}
            onChange={changeProduct}
            className="span-2"
          />
          <label>
            ALMACÉN
            <select
              required
              value={warehouseId}
              onChange={(event) => changeWarehouse(Number(event.target.value))}
            >
              {activeWarehouses.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <div className="stock-current">
            <small>STOCK ACTUAL EN {warehouse?.name || "EL ALMACÉN"}</small>
            <strong>{n(row?.physical || 0)}</strong>
            <span>
              Reservado: {n(row?.reserved || 0)} · Disponible: {n(row?.available || 0)}
            </span>
          </div>
          <label>NUEVO STOCK FÍSICO<input type="number" min="0" step="0.01" value={newPhysical} onChange={(event) => setNewPhysical(event.target.value)} /></label>
          <label className="span-2">MOTIVO<input required value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </div>
        <ModalFooter busy={busy} onClose={onClose} label="REGISTRAR STOCK" disabled={!product || !warehouse} />
      </form>
    </Modal>
  );
}

function UserModal({
  user,
  busy,
  runOperation,
  onClose,
}: {
  user: AppUser | null;
  busy: boolean;
  runOperation: RunOperation;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    displayName: user?.displayName || "",
    email: user?.email || "",
    username: user?.username || "",
    temporaryPassword: "",
    role: user?.role || "USUARIO",
    active: user?.active ?? true,
    permissions: user?.permissions || ["store_orders"],
  });
  const toggle = (permission: string) =>
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await runOperation({ action: "save_user", ...form });
  };
  return (
    <Modal title={user ? "Editar usuario" : "Nuevo usuario"} eyebrow="CONTROL DE ACCESO" description="Crea un acceso propio e independiente para cada integrante." onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <label className="span-2">NOMBRE<input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
          <label>USUARIO<input required disabled={!!user} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toUpperCase() })} placeholder="EJ.: ALMACEN1" /></label>
          <label>{user ? "NUEVA CONTRASEÑA TEMPORAL (OPCIONAL)" : "CONTRASEÑA TEMPORAL"}<input type="password" required={!user} value={form.temporaryPassword} onChange={(event) => setForm({ ...form, temporaryPassword: event.target.value })} minLength={10} autoComplete="new-password" /></label>
          <label>NIVEL<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as AppUser["role"] })}><option>USUARIO</option><option>ADMINISTRADOR</option></select></label>
          <label>ESTADO<select value={form.active ? "ACTIVO" : "INACTIVO"} onChange={(event) => setForm({ ...form, active: event.target.value === "ACTIVO" })}><option>ACTIVO</option><option>INACTIVO</option></select></label>
        </div>
        <fieldset className="permission-box" disabled={form.role === "ADMINISTRADOR"}>
          <legend>PERMISOS</legend>
          {[
            ["store_orders", "Pedido de tienda (solo solicitar)"],
            ["operations", "Operaciones de almacén / despacho"],
            ["inventory", "Inventario / Kardex"],
            ["products", "Productos"],
            ["warehouses", "Almacenes"],
            ["reports", "Reportes"],
            ["cancellations", "Cancelaciones / anulaciones"],
            ["users", "Usuarios"],
            ["imports", "Copias y migración"],
          ].map(([key, label]) => (
            <label key={key}><input type="checkbox" checked={form.role === "ADMINISTRADOR" || form.permissions.includes(key)} onChange={() => toggle(key)} /><span>{label}</span></label>
          ))}
        </fieldset>
        {form.role === "USUARIO" && form.permissions.length === 1 && form.permissions.includes("store_orders") && (
          <div className="permission-note">
            Este acceso solo podrá crear, editar y enviar pedidos de tienda. No podrá realizar despachos directos ni movimientos de almacén.
          </div>
        )}
        <ModalFooter busy={busy} onClose={onClose} label="GUARDAR USUARIO" />
      </form>
    </Modal>
  );
}

function PasswordModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [recoveryNotice, setRecoveryNotice] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmation) {
      setError("Las nuevas contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change_password",
          currentPassword,
          newPassword,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo cambiar la contraseña.");
      }
      onSuccess(data.message || "Contraseña actualizada correctamente.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo cambiar la contraseña.",
      );
    } finally {
      setBusy(false);
    }
  };

  const generateRecoveryKey = async (event: FormEvent) => {
    event.preventDefault();
    setRecoveryError("");
    setRecoveryNotice("");
    setRecoveryBusy(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_recovery_key",
          currentPassword: recoveryPassword,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
        recoveryKey?: string;
      };
      if (!response.ok || !data.recoveryKey) {
        throw new Error(data.error || "No se pudo crear la clave de recuperación.");
      }
      setRecoveryKey(data.recoveryKey);
      setRecoveryPassword("");
      setRecoveryNotice(
        "Guárdala ahora: por seguridad no volverá a mostrarse.",
      );
    } catch (caught) {
      setRecoveryError(
        caught instanceof Error
          ? caught.message
          : "No se pudo crear la clave de recuperación.",
      );
    } finally {
      setRecoveryBusy(false);
    }
  };

  const copyRecoveryKey = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setRecoveryNotice("Clave copiada. Guárdala fuera del sistema.");
    } catch {
      setRecoveryNotice("Selecciona y copia la clave para guardarla.");
    }
  };

  return (
    <Modal
      title="Seguridad de mi cuenta"
      eyebrow="SEGURIDAD DE LA CUENTA"
      description="Cambia tu contraseña o crea una clave para recuperar el acceso más adelante."
      onClose={onClose}
    >
      <div className="security-modal-stack">
        <section className="security-section">
          <div className="security-section-heading">
            <span>1</span>
            <div>
              <strong>CAMBIAR CONTRASEÑA</strong>
              <small>Cierra las demás sesiones abiertas.</small>
            </div>
          </div>
          <form onSubmit={(event) => void submit(event)}>
            <div className="form-grid">
              <label className="span-2">
                CONTRASEÑA ACTUAL
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <label>
                NUEVA CONTRASEÑA
                <input
                  required
                  type="password"
                  minLength={10}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>
              <label>
                REPITE LA CONTRASEÑA
                <input
                  required
                  type="password"
                  minLength={10}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
            </div>
            <p className="form-help">
              Usa al menos 10 caracteres, una mayúscula, una minúscula y un número.
            </p>
            {error && <div className="form-error">{error}</div>}
            <div className="security-inline-actions">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "GUARDANDO…" : "CAMBIAR CONTRASEÑA"}
              </button>
            </div>
          </form>
        </section>

        <section className="security-section recovery-section">
          <div className="security-section-heading">
            <span>2</span>
            <div>
              <strong>CLAVE DE RECUPERACIÓN</strong>
              <small>No vence, funciona una sola vez y reemplaza la clave anterior.</small>
            </div>
          </div>
          {recoveryKey ? (
            <div className="recovery-key-result">
              <small>TU NUEVA CLAVE</small>
              <code>{recoveryKey}</code>
              <p>{recoveryNotice}</p>
              <div className="security-inline-actions">
                <button type="button" className="primary" onClick={() => void copyRecoveryKey()}>
                  COPIAR CLAVE
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadBlob(
                      "JIMDUR ERP\nClave de recuperación: " + recoveryKey + "\n\nGuárdala en un lugar seguro. Es de un solo uso.",
                      "JIMDUR_CLAVE_RECUPERACION.txt",
                      "text/plain;charset=utf-8",
                    )
                  }
                >
                  DESCARGAR
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={(event) => void generateRecoveryKey(event)}>
              <label>
                CONFIRMA TU CONTRASEÑA ACTUAL
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={recoveryPassword}
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                />
              </label>
              {recoveryError && <div className="form-error">{recoveryError}</div>}
              <div className="security-inline-actions">
                <button type="submit" className="primary" disabled={recoveryBusy}>
                  {recoveryBusy ? "GENERANDO…" : "GENERAR CLAVE SEGURA"}
                </button>
                <button type="button" onClick={onClose}>CERRAR</button>
              </div>
            </form>
          )}
        </section>
      </div>
    </Modal>
  );
}

function ImportModal({
  busy,
  runOperation,
  onClose,
}: {
  busy: boolean;
  runOperation: RunOperation;
  onClose: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const readFile = async (file?: File) => {
    setData(null);
    setFileError("");
    if (!file) return;
    setFileName(file.name);
    if (file.size > 25 * 1024 * 1024) {
      setFileError("El archivo supera 25 MB.");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (!parsed.tables) throw new Error("No contiene tablas exportadas.");
      setData(parsed);
    } catch (caught) {
      setFileError(
        caught instanceof Error ? caught.message : "No se pudo leer el archivo.",
      );
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!data) return;
    await runOperation({ action: "import_legacy", export: data });
  };
  return (
    <Modal title="Importar desde SQL Server" eyebrow="MIGRACIÓN CONTROLADA" description="Se actualizarán catálogo, almacenes y saldos de stock." onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <label className="file-drop">
          <input type="file" accept=".json,application/json" onChange={(event) => void readFile(event.target.files?.[0])} />
          <span>⇧</span>
          <strong>{fileName || "SELECCIONAR JIMDUR_EXPORT.json"}</strong>
          <small>Archivo generado por el exportador oficial de JIMDUR</small>
        </label>
        {data && <div className="file-ok">✓ Archivo validado y listo para importar.</div>}
        {fileError && <div className="form-error">{fileError}</div>}
        <div className="import-note"><strong>Operación segura</strong><span>La migración no elimina registros web. Los productos existentes se actualizan por código.</span></div>
        <ModalFooter busy={busy} onClose={onClose} label="INICIAR IMPORTACIÓN" disabled={!data} />
      </form>
    </Modal>
  );
}

function ModalFooter({
  busy,
  onClose,
  label,
  disabled = false,
}: {
  busy: boolean;
  onClose: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="modal-actions">
      <button type="button" className="ghost-button" onClick={onClose}>CANCELAR</button>
      <button className="primary-button" disabled={busy || disabled}>{busy ? "GUARDANDO…" : label}</button>
    </div>
  );
}
