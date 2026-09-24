"use client";

import { useEffect, useRef } from "react";

import { buildAppPath } from "@/server/auth/base-path";

/**
 * Detección de la entrada (specs/integracion-conecta.md §2-§3).
 *
 * Corre en el navegador porque es el único sitio donde existe el dato: el
 * `localStorage` que Conecta escribe al iniciar sesión, compartido con
 * HelpDesk por vivir en el mismo origen (`conecta.rbgct.cloud`).
 *
 * - **Hay sesión de Conecta** (`gct_empleado` con correo): se envía por POST
 *   un subconjunto mínimo de ese objeto a `/api/auth/microsoft/start`, que lo
 *   valida y arranca el ingreso silencioso con esa cuenta.
 * - **No la hay**: se va a `/login`, donde la persona elige cuenta.
 *
 * Qué se envía, y qué no: solo los campos que el servidor usa para pintar el
 * menú y sugerir la cuenta. Nunca los tokens de Conecta que viven en el mismo
 * `localStorage`: HelpDesk no los necesita ni debe tocarlos (acceso-empleados
 * §2, ningún token viaja entre módulos).
 *
 * POST y no parámetros en la URL: el correo y el nombre no deben quedar en
 * los registros del proxy ni en el historial del navegador.
 */

/** Clave con la que Conecta guarda la ficha del empleado (AuthContext.jsx). */
const CONECTA_EMPLOYEE_KEY = "gct_empleado";

/** Campos de la ficha de Conecta que viajan; el resto se descarta aquí. */
const FORWARDED_FIELDS = [
  "correo_corporativo",
  "primer_nombre",
  "primer_apellido",
  "nombre_area",
  "nombre_cargo",
  "acceso_sqf_clientes",
  "acceso_sqf_contratos",
  "acceso_sqf_facturacion",
  "acceso_sqf_auditoria",
] as const;

function readConectaEmployee(): string | null {
  try {
    const raw = window.localStorage.getItem(CONECTA_EMPLOYEE_KEY);
    if (!raw) return null;
    const employee = JSON.parse(raw) as Record<string, unknown> | null;
    if (!employee || typeof employee.correo_corporativo !== "string") return null;
    const subset = Object.fromEntries(FORWARDED_FIELDS.map((field) => [field, employee[field] ?? null]));
    return JSON.stringify(subset);
  } catch {
    // Almacenamiento bloqueado o JSON ilegible: se trata como entrada directa.
    return null;
  }
}

export function EntryHandoff({ destino }: { destino: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const payloadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const payload = readConectaEmployee();
    if (payload && formRef.current && payloadRef.current) {
      payloadRef.current.value = payload;
      formRef.current.submit();
      return;
    }
    window.location.replace(buildAppPath("/login", { destino }));
  }, [destino]);

  return (
    <main className="min-h-dvh bg-canvas">
      <p role="status" className="sr-only">
        Verificando el acceso a HelpDesk.
      </p>
      <form ref={formRef} method="post" action={buildAppPath("/api/auth/microsoft/start")} hidden>
        <input type="hidden" name="destino" value={destino} readOnly />
        <input ref={payloadRef} type="hidden" name="conecta" defaultValue="" />
      </form>
      <noscript>
        <a href={buildAppPath("/login", { destino })}>Ingresar a HelpDesk</a>
      </noscript>
    </main>
  );
}
