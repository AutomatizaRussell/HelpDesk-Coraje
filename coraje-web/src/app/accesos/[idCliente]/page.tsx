import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";

import { iconStroke } from "@/design-system/foundations/iconography";
import { badge, type BadgeTone } from "@/design-system/recipes/badge";
import { focusRing } from "@/design-system/recipes/interaction";
import { notice, sectionTitle, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import {
  GrantAgainForm,
  NewContactForm,
  ReadOnlyForm,
  ReissueInvitationForm,
  RevokeAccessForm,
} from "@/features/accesos/AccessForms";
import { formatDate, formatDateTime } from "@/features/tickets/format";
import { AppFrame } from "@/features/shell/AppFrame";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { getClientAccessOverview, type ContactAccessRow, type ContactAccessState } from "@/server/portal/portal-admin-queries";

/**
 * Contactos de un cliente y el estado de su acceso al portal. Aquí se da de
 * alta a un contacto, se reenvía su invitación, se pasa a solo consulta y se
 * revoca (acceso-clientes.md §11, entregas 3 y 6).
 *
 * Sin `portal.acceso.administrar`, la ruta responde como si no existiera.
 */
const STATE_LABEL: Record<ContactAccessState, string> = {
  SIN_ACCESO: "Sin acceso",
  INVITADO: "Invitado, sin activar",
  ACTIVO: "Acceso activo",
  REVOCADO: "Acceso revocado",
};

const STATE_TONE: Record<ContactAccessState, BadgeTone> = {
  SIN_ACCESO: "neutral",
  INVITADO: "info",
  ACTIVO: "success",
  REVOCADO: "neutral",
};

function ContactCard({ idCliente, clienteActivo, contacto }: { idCliente: string; clienteActivo: boolean; contacto: ContactAccessRow }) {
  const { estado, idAutorizacion } = contacto;
  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-heading">{contacto.nombre}</p>
          <p className="text-sm text-ink-muted">{contacto.correos.join(", ") || "Sin correo activo"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={badge(STATE_TONE[estado])}>{STATE_LABEL[estado]}</span>
          {estado === "ACTIVO" && contacto.soloLectura && <span className={badge("warning")}>Solo consulta</span>}
          {!contacto.activo && <span className={badge("neutral")}>Contacto inactivo</span>}
        </div>
      </div>

      <p className="text-sm text-ink-muted">
        {estado === "ACTIVO" && contacto.activadoEl && `Activado el ${formatDate(contacto.activadoEl)} · ${contacto.navegadores} navegador(es) recordado(s).`}
        {estado === "INVITADO" && contacto.invitacionVence && `La invitación vence el ${formatDate(contacto.invitacionVence)}.`}
        {estado === "INVITADO" && !contacto.invitacionVence && "La invitación venció o se reemplazó; emite otra."}
        {estado === "REVOCADO" && contacto.revocadoEl && `Revocado el ${formatDate(contacto.revocadoEl)}${contacto.motivoRevocacion ? `: ${contacto.motivoRevocacion}` : "."}`}
      </p>
      {contacto.ultimoEnvio && !contacto.ultimoEnvio.exito && estado === "INVITADO" && (
        <p className="text-sm text-danger">
          El último envío de la invitación falló ({formatDateTime(contacto.ultimoEnvio.fecha)}): {contacto.ultimoEnvio.motivo ?? "sin detalle"}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-4">
        {estado === "INVITADO" && idAutorizacion && <ReissueInvitationForm idCliente={idCliente} idAutorizacion={idAutorizacion} />}
        {estado === "ACTIVO" && idAutorizacion && (
          <ReadOnlyForm idCliente={idCliente} idAutorizacion={idAutorizacion} soloLectura={contacto.soloLectura} />
        )}
        {(estado === "SIN_ACCESO" || estado === "REVOCADO") && contacto.activo && clienteActivo && (
          <GrantAgainForm idCliente={idCliente} idContacto={contacto.idContacto} />
        )}
      </div>
      {(estado === "INVITADO" || estado === "ACTIVO") && idAutorizacion && (
        <details className="group">
          <summary className={cn("cursor-pointer rounded-control text-sm font-bold text-danger", focusRing)}>Revocar acceso</summary>
          <div className="mt-3 max-w-md">
            <RevokeAccessForm idCliente={idCliente} idAutorizacion={idAutorizacion} />
          </div>
        </details>
      )}
    </li>
  );
}

export default async function ClientAccessPage({ params }: { params: Promise<{ idCliente: string }> }) {
  const { idCliente } = await params;
  const employee = await requireCurrentEmployee(`/accesos/${idCliente}`);
  if (!z.uuid().safeParse(idCliente).success) notFound();
  const cliente = await getClientAccessOverview(employee.idPersonal, idCliente);
  if (!cliente) notFound();

  return (
    <AppFrame employee={employee} title={cliente.nombre} mode="coraje">
      <div className="space-y-4">
        <Link
          href="/accesos"
          className={cn("inline-flex items-center gap-1 rounded-control text-sm font-bold text-heading hover:underline", focusRing)}
        >
          <ChevronLeft aria-hidden className="size-4" strokeWidth={iconStroke.regular} />
          Volver a la búsqueda
        </Link>

        {!cliente.activo && <p className={notice("warning")}>Este cliente está inactivo: no puede recibir accesos nuevos.</p>}

        <div className="grid gap-4 lg:grid-cols-3">
          <section className={cn(surface(), "lg:col-span-2")} aria-labelledby="contactos-titulo">
            <h2 id="contactos-titulo" className={cn(sectionTitle, "mb-4")}>Contactos con acceso al portal</h2>
            {cliente.contactos.length === 0 ? (
              <p className="text-ink-muted">Este cliente todavía no tiene contactos en el portal.</p>
            ) : (
              <ul className="divide-y divide-line">
                {cliente.contactos.map((contacto) => (
                  <ContactCard key={contacto.idContacto} idCliente={cliente.idCliente} clienteActivo={cliente.activo} contacto={contacto} />
                ))}
              </ul>
            )}
          </section>

          {cliente.activo && (
            <section className={cn(surface(), "h-fit")} aria-labelledby="nuevo-titulo">
              <h2 id="nuevo-titulo" className={cn(sectionTitle, "mb-1")}>Nuevo contacto</h2>
              <p className="mb-4 text-sm text-ink-muted">
                Recibe una invitación de un solo uso. Solo verá las solicitudes que radique él mismo.
              </p>
              <NewContactForm idCliente={cliente.idCliente} />
            </section>
          )}
        </div>
      </div>
    </AppFrame>
  );
}
