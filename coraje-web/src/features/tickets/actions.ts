"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCurrentEmployee } from "@/server/auth/current-employee";
import {
  addInternalNote,
  addObservers,
  commentAsRequester,
  createInternalTicket,
  reassignTicket,
  rejectTicket,
  removeObserver,
  requestValidation,
  respondTicket,
} from "@/server/tickets/ticket-commands";
import { MAX_OBSERVERS_PER_ACTION } from "@/server/tickets/follow-rules";
import { dispatchTicketMail, resendTicketMail } from "@/server/notifications/ticket-notifications";
import { logEvent } from "@/server/observability/log";
import { kickSharePointMirror } from "@/server/sync/sharepoint-mirror";
import { isTicketDomainError } from "@/server/tickets/ticket-errors";

import type { TicketFormState } from "./action-state";

/**
 * Acciones de servidor del ciclo del ticket.
 *
 * Cada una es un endpoint alcanzable por sí mismo, con independencia de qué
 * botón la muestre (specs/permisos.md §1): por eso exige sesión, valida la
 * entrada con `zod` y delega la autorización en el comando, que la evalúa
 * dentro de su transacción. Ninguna confía en que la vista haya ocultado el
 * botón.
 *
 * Los límites de longitud existen para que un formulario manipulado no meta
 * un documento entero en una celda. No son reglas de negocio del legacy.
 */

const MAX_TEXT = 10_000;

const idSchema = z.uuid({ error: "Identificador inválido." });

const textSchema = (label: string, min: number) =>
  z
    .string()
    .trim()
    .min(min, { error: `${label} debe tener al menos ${min} caracteres.` })
    .max(MAX_TEXT, { error: `${label} no puede superar ${MAX_TEXT.toLocaleString("es-CO")} caracteres.` });

/**
 * Campos de texto del formulario tal como llegaron, para devolverlos si falla.
 * Un campo con varios valores (las personas de un selector múltiple) vuelve
 * unido por comas: son uuid, que nunca llevan una.
 */
function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || key.startsWith("$")) continue;
    values[key] = key in values ? `${values[key]},${value}` : value;
  }
  return values;
}

function invalid(error: z.ZodError, formData: FormData): TicketFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return { status: "error", message: "Revisa los campos marcados.", fieldErrors, values: formValues(formData) };
}

/**
 * Un error de dominio se muestra tal cual; cualquier otro se registra y se
 * responde con una frase genérica, sin describir el interior de la aplicación.
 */
function failed(error: unknown, formData: FormData, context: string): TicketFormState {
  if (isTicketDomainError(error)) {
    return { status: "error", message: error.message, fieldErrors: {}, values: formValues(formData) };
  }
  const idTicket = formData.get("idTicket");
  logEvent("error", "tickets.accion_fallida", { accion: context, idTicket: typeof idTicket === "string" ? idTicket : undefined }, error);
  return {
    status: "error",
    message: "No fue posible completar la acción. Intenta de nuevo en unos minutos.",
    fieldErrors: {},
    values: formValues(formData),
  };
}

/**
 * Envía los correos de la acción, ya guardada, y construye la respuesta.
 * Un correo que no sale no convierte la acción en error: se guardó, y el
 * aviso dice qué correo falló y por qué. El ticket lo muestra con la opción
 * de reenviarlo.
 */
async function succeeded(message: string, mailIds: readonly string[] = []): Promise<TicketFormState> {
  const failures = (await dispatchTicketMail(mailIds)).filter((result) => !result.ok);
  const warning =
    failures.length === 0
      ? undefined
      : `No se pudo enviar ${failures.length > 1 ? "los correos" : "el correo"} de aviso. ${failures[0].error ?? ""} Puedes reenviarlo desde la sección «Correos» del ticket.`;
  return { status: "success", message, nonce: randomUUID(), warning };
}

// ---------------------------------------------------------------------------

/**
 * Personas elegidas en un selector múltiple. Llegan como varios valores del
 * mismo campo (`formData.getAll`); el tope es el mismo que aplica el comando,
 * para responder aquí con un mensaje claro en lugar de dejarlo llegar.
 */
const peopleSchema = (min: number) =>
  z
    .array(z.uuid({ error: "Persona inválida." }))
    .min(min, { error: "Elige al menos una persona." })
    .max(MAX_OBSERVERS_PER_ACTION, { error: `Puedes elegir hasta ${MAX_OBSERVERS_PER_ACTION} personas de una vez.` });

const createSchema = z.object({
  idTipoReq: idSchema,
  prioridad: z.string().trim().min(1, { error: "Elige una prioridad." }).max(50),
  descripcion: textSchema("La descripción", 10),
  idObservadores: peopleSchema(0),
});

export async function createTicketAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee("/tickets/nuevo");
  const parsed = createSchema.safeParse({
    idTipoReq: formData.get("idTipoReq"),
    prioridad: formData.get("prioridad"),
    descripcion: formData.get("descripcion"),
    idObservadores: formData.getAll("idObservadores"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  let idTicket: string;
  let mailIds: string[];
  try {
    ({ idTicket, mailIds } = await createInternalTicket({ idPersonal: employee.idPersonal, ...parsed.data }));
  } catch (error) {
    return failed(error, formData, "crear el ticket");
  }

  // El aviso a quien recibe el ticket sale antes de navegar. Si falla, el
  // detalle lo muestra en «Correos», con la opción de reenviarlo.
  await dispatchTicketMail(mailIds);
  kickSharePointMirror();
  revalidatePath("/tickets");
  // Fuera del try: redirect() funciona lanzando, y un catch lo tragaría.
  redirect(`/tickets/${idTicket}?creado=1`);
}

// ---------------------------------------------------------------------------

const reassignSchema = z.object({
  idTicket: idSchema,
  idNuevoResponsable: z.uuid({ error: "Elige a la persona que recibirá el ticket." }),
  comentario: z.string().trim().max(MAX_TEXT).optional(),
});

export async function reassignTicketAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee();
  const parsed = reassignSchema.safeParse({
    idTicket: formData.get("idTicket"),
    idNuevoResponsable: formData.get("idNuevoResponsable"),
    comentario: formData.get("comentario") ?? undefined,
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  let mailIds: string[];
  try {
    ({ mailIds } = await reassignTicket({
      idPersonal: employee.idPersonal,
      idTicket: parsed.data.idTicket,
      idNuevoResponsable: parsed.data.idNuevoResponsable,
      comentario: parsed.data.comentario || null,
    }));
  } catch (error) {
    return failed(error, formData, "reasignar el ticket");
  }

  const result = await succeeded("Ticket reasignado.", mailIds);
  kickSharePointMirror();
  revalidatePath(`/tickets/${parsed.data.idTicket}`);
  return result;
}

// ---------------------------------------------------------------------------

const respondSchema = z.object({
  idTicket: idSchema,
  respuesta: textSchema("La respuesta", 5),
});

export async function respondTicketAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee();
  const parsed = respondSchema.safeParse({
    idTicket: formData.get("idTicket"),
    respuesta: formData.get("respuesta"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  let mailIds: string[];
  try {
    ({ mailIds } = await respondTicket({ idPersonal: employee.idPersonal, ...parsed.data }));
  } catch (error) {
    return failed(error, formData, "responder el ticket");
  }

  const result = await succeeded("Respuesta guardada. El ticket quedó cerrado.", mailIds);
  kickSharePointMirror();
  revalidatePath(`/tickets/${parsed.data.idTicket}`);
  return result;
}

// ---------------------------------------------------------------------------

const rejectSchema = z.object({
  idTicket: idSchema,
  motivo: textSchema("El motivo", 10),
});

export async function rejectTicketAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee();
  const parsed = rejectSchema.safeParse({
    idTicket: formData.get("idTicket"),
    motivo: formData.get("motivo"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  let mailIds: string[];
  try {
    ({ mailIds } = await rejectTicket({ idPersonal: employee.idPersonal, ...parsed.data }));
  } catch (error) {
    return failed(error, formData, "rechazar el ticket");
  }

  const result = await succeeded("Ticket rechazado.", mailIds);
  kickSharePointMirror();
  revalidatePath(`/tickets/${parsed.data.idTicket}`);
  return result;
}

// ---------------------------------------------------------------------------

const noteSchema = z.object({
  idTicket: idSchema,
  nota: textSchema("La nota", 2),
});

export async function addInternalNoteAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee();
  const parsed = noteSchema.safeParse({
    idTicket: formData.get("idTicket"),
    nota: formData.get("nota"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await addInternalNote({ idPersonal: employee.idPersonal, ...parsed.data });
  } catch (error) {
    return failed(error, formData, "registrar la nota");
  }

  revalidatePath(`/tickets/${parsed.data.idTicket}`);
  return succeeded("Nota registrada.");
}

// ---------------------------------------------------------------------------

const resendSchema = z.object({ idNotificacion: idSchema });

export async function resendTicketMailAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee();
  const parsed = resendSchema.safeParse({ idNotificacion: formData.get("idNotificacion") });
  if (!parsed.success) return invalid(parsed.error, formData);

  let outcome: Awaited<ReturnType<typeof resendTicketMail>>;
  try {
    outcome = await resendTicketMail({ idPersonal: employee.idPersonal, idNotificacion: parsed.data.idNotificacion });
  } catch (error) {
    return failed(error, formData, "reenviar el correo");
  }

  revalidatePath(`/tickets/${outcome.idTicket}`);
  if (!outcome.result.ok) {
    return { status: "error", message: outcome.result.error ?? "El correo no se envió.", fieldErrors: {}, values: {} };
  }
  return { status: "success", message: "Correo enviado.", nonce: randomUUID() };
}

// ---------------------------------------------------------------------------
// Seguimiento (U11)
// ---------------------------------------------------------------------------

const addObserversSchema = z.object({ idTicket: idSchema, idObservadores: peopleSchema(1) });

export async function addObserversAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee();
  const parsed = addObserversSchema.safeParse({
    idTicket: formData.get("idTicket"),
    idObservadores: formData.getAll("idObservadores"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  let mailIds: string[];
  try {
    ({ mailIds } = await addObservers({ idPersonal: employee.idPersonal, ...parsed.data }));
  } catch (error) {
    return failed(error, formData, "añadir observadores");
  }

  const result = await succeeded("Observadores añadidos. Les llegó un aviso.", mailIds);
  revalidatePath(`/tickets/${parsed.data.idTicket}`);
  return result;
}

const removeObserverSchema = z.object({ idTicket: idSchema, idObservador: idSchema });

export async function removeObserverAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee();
  const parsed = removeObserverSchema.safeParse({
    idTicket: formData.get("idTicket"),
    idObservador: formData.get("idObservador"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  try {
    await removeObserver({ idPersonal: employee.idPersonal, ...parsed.data });
  } catch (error) {
    return failed(error, formData, "retirar el observador");
  }

  revalidatePath(`/tickets/${parsed.data.idTicket}`);
  return succeeded("Ya no sigue el ticket.");
}

const validationSchema = z.object({
  idTicket: idSchema,
  idDestinatario: z.uuid({ error: "Elige a la persona que debe validar." }),
  comentario: textSchema("El comentario", 5),
});

export async function requestValidationAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee();
  const parsed = validationSchema.safeParse({
    idTicket: formData.get("idTicket"),
    idDestinatario: formData.get("idDestinatario"),
    comentario: formData.get("comentario"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  let mailIds: string[];
  try {
    ({ mailIds } = await requestValidation({ idPersonal: employee.idPersonal, ...parsed.data }));
  } catch (error) {
    return failed(error, formData, "solicitar la validación");
  }

  const result = await succeeded("Validación solicitada. El ticket sigue su curso.", mailIds);
  revalidatePath(`/tickets/${parsed.data.idTicket}`);
  return result;
}

const requesterCommentSchema = z.object({
  idTicket: idSchema,
  comentario: textSchema("El comentario", 2),
});

export async function commentAsRequesterAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee();
  const parsed = requesterCommentSchema.safeParse({
    idTicket: formData.get("idTicket"),
    comentario: formData.get("comentario"),
  });
  if (!parsed.success) return invalid(parsed.error, formData);

  let mailIds: string[];
  try {
    ({ mailIds } = await commentAsRequester({ idPersonal: employee.idPersonal, ...parsed.data }));
  } catch (error) {
    return failed(error, formData, "comentar el ticket");
  }

  const result = await succeeded("Comentario enviado. La persona responsable recibió un aviso.", mailIds);
  revalidatePath(`/tickets/${parsed.data.idTicket}`);
  return result;
}
