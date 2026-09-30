import { test } from "node:test";
import assert from "node:assert/strict";

import { TICKET_ACTIONS, type TicketAction } from "./catalog";
import {
  NO_RECEPCION,
  VISIBLE_BY_PROJECTION,
  consultScopeConditions,
  historyProjection,
  isTicketWithinScope,
  type Alcance,
  type ScopeActor,
  type ScopeTicket,
} from "./scope";

/**
 * Reglas de alcance (specs/permisos.md §4). Son puras, así que se prueban sin
 * base de datos. Las pruebas negativas son las que importan: un solicitante
 * que no puede responder su propio ticket, un compañero de área que no recibe
 * y no ve, una nota interna que quien radicó no recibe.
 */

const YO = "00000000-0000-0000-0000-000000000001";
const OTRA_PERSONA = "00000000-0000-0000-0000-000000000002";
const MI_AREA = "00000000-0000-0000-0000-0000000000a1";
const OTRA_AREA = "00000000-0000-0000-0000-0000000000a2";
const TIPO_QUE_RECIBO = "00000000-0000-0000-0000-0000000000b1";
// Tipo de mi área que el enrutamiento manda a otra persona (el caso de
// «proyectos y ti», que va a Alex Bolaños y no a la encargada del área).
const TIPO_DE_OTRO = "00000000-0000-0000-0000-0000000000b2";

/** Encargado de recepción de MI_AREA, que recibe TIPO_QUE_RECIBO. */
const encargado: ScopeActor = { idPersonal: YO, idArea: MI_AREA, recepcion: { idTiposReq: [TIPO_QUE_RECIBO], idAreas: [MI_AREA] } };
/** Colaborador de la misma área que no recibe nada. */
const colaborador: ScopeActor = { idPersonal: YO, idArea: MI_AREA, recepcion: NO_RECEPCION };

const ticket = (fields: Partial<ScopeTicket>): ScopeTicket => ({
  idSolicitante: OTRA_PERSONA,
  idAsignado: OTRA_PERSONA,
  idAreaDestino: OTRA_AREA,
  idTipoReq: null,
  idObservadores: [],
  ...fields,
});

const tickets = {
  soyResponsable: ticket({ idAsignado: YO, idAreaDestino: MI_AREA, idTipoReq: TIPO_DE_OTRO }),
  loRadiqueYo: ticket({ idSolicitante: YO }),
  queRecibo: ticket({ idAreaDestino: MI_AREA, idTipoReq: TIPO_QUE_RECIBO }),
  deMiAreaPeroDeOtro: ticket({ idAreaDestino: MI_AREA, idTipoReq: TIPO_DE_OTRO }),
  // Legacy sin tipo reconocido: cuenta el área.
  sinTipoDeMiArea: ticket({ idAreaDestino: MI_AREA, idTipoReq: null }),
  ajeno: ticket({}),
  sinAreaNiResponsable: ticket({ idAsignado: null, idAreaDestino: null }),
  // U11: de otra área, y lo sigo como observador.
  loSigo: ticket({ idObservadores: [YO] }),
} satisfies Record<string, ScopeTicket>;

const within = (alcance: Alcance, action: TicketAction, target: ScopeTicket, who: ScopeActor = encargado) =>
  isTicketWithinScope({ alcance, action, actor: who, ticket: target });

test("consultar con alcance PROPIO: lo que radiqué y lo que me asignaron, nada más", () => {
  assert.equal(within("PROPIO", TICKET_ACTIONS.consultar, tickets.soyResponsable), true);
  assert.equal(within("PROPIO", TICKET_ACTIONS.consultar, tickets.loRadiqueYo), true);
  assert.equal(within("PROPIO", TICKET_ACTIONS.consultar, tickets.queRecibo), false);
  assert.equal(within("PROPIO", TICKET_ACTIONS.consultar, tickets.ajeno), false);
});

test("AREA añade lo que recibo: mis tipos, y mi área solo en tickets sin tipo", () => {
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.queRecibo), true);
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.sinTipoDeMiArea), true);
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.loRadiqueYo), true);
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.ajeno), false);
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.sinAreaNiResponsable), false);
});

test("un tipo de mi área que se enruta a otra persona no lo veo por ser encargado", () => {
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.deMiAreaPeroDeOtro), false);
});

test("un colaborador que no recibe nada ve solo lo suyo, aunque sea de la misma área", () => {
  for (const [name, target] of Object.entries(tickets)) {
    assert.equal(
      within("AREA", TICKET_ACTIONS.consultar, target, colaborador),
      within("PROPIO", TICKET_ACTIONS.consultar, target, colaborador),
      name,
    );
  }
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.sinTipoDeMiArea, colaborador), false);
});

test("pertenecer a un área no da nada: cuenta lo que se recibe (el caso de recepción)", () => {
  // Pertenece a MI_AREA pero recibe OTRA_AREA, como la encargada de
  // ADMINISTRACIÓN-RECEPCIÓN, que pertenece a ADMINISTRACIÓN.
  const recepcion: ScopeActor = { idPersonal: YO, idArea: MI_AREA, recepcion: { idTiposReq: [], idAreas: [OTRA_AREA] } };
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, ticket({ idAreaDestino: OTRA_AREA }), recepcion), true);
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.sinTipoDeMiArea, recepcion), false);
});

test("quien radicó un ticket no puede responderlo, rechazarlo ni reasignarlo", () => {
  for (const action of [TICKET_ACTIONS.responder, TICKET_ACTIONS.rechazar, TICKET_ACTIONS.reasignar]) {
    assert.equal(within("PROPIO", action, tickets.loRadiqueYo), false, action);
    assert.equal(within("PROPIO", action, tickets.soyResponsable), true, action);
  }
});

test("quien recibe un área no actúa sobre un ticket que no le asignaron, aunque lo vea", () => {
  assert.equal(within("PROPIO", TICKET_ACTIONS.responder, tickets.queRecibo), false);
  assert.equal(within("AREA", TICKET_ACTIONS.notaInterna, tickets.queRecibo), true);
});

test("TOTAL cubre cualquier ticket", () => {
  assert.equal(within("TOTAL", TICKET_ACTIONS.consultar, tickets.ajeno, colaborador), true);
  assert.equal(within("TOTAL", TICKET_ACTIONS.responder, tickets.ajeno), true);
});

test("el filtro SQL de consulta equivale a la regla en memoria, caso por caso", () => {
  type Condition = NonNullable<ReturnType<typeof consultScopeConditions>>[number];
  const fieldMatches = (value: unknown, expected: unknown) =>
    expected !== null && typeof expected === "object" && "in" in expected
      ? (expected.in as unknown[]).includes(value)
      : value === expected;
  const matchesOne = (condition: Condition, target: ScopeTicket) =>
    "observadores" in condition
      ? target.idObservadores.includes(condition.observadores.some.idPersonal)
      : Object.entries(condition).every(([field, expected]) => fieldMatches(target[field as keyof ScopeTicket], expected));
  const matches = (conditions: ReturnType<typeof consultScopeConditions>, target: ScopeTicket) =>
    conditions === null || conditions.some((condition) => matchesOne(condition, target));

  for (const alcance of ["PROPIO", "AREA", "TOTAL"] as const) {
    for (const [whoName, who] of Object.entries({ encargado, colaborador })) {
      const conditions = consultScopeConditions(alcance, who);
      for (const [name, target] of Object.entries(tickets)) {
        assert.equal(matches(conditions, target), within(alcance, TICKET_ACTIONS.consultar, target, who), `${alcance} · ${whoName} · ${name}`);
      }
    }
  }
});

test("quien solo radicó el ticket no recibe notas internas", () => {
  assert.equal(historyProjection({ alcance: "AREA", actor: encargado, ticket: tickets.loRadiqueYo }), "SOLICITANTE");
  assert.deepEqual([...VISIBLE_BY_PROJECTION.SOLICITANTE], ["AMBOS"]);
  assert.ok(!(VISIBLE_BY_PROJECTION.SOLICITANTE as readonly string[]).includes("INTERNO"));
});

test("el responsable y quien recibe ven la historia del equipo; el compañero que no recibe, no", () => {
  assert.equal(historyProjection({ alcance: "PROPIO", actor: encargado, ticket: tickets.soyResponsable }), "EQUIPO");
  assert.equal(historyProjection({ alcance: "AREA", actor: encargado, ticket: tickets.queRecibo }), "EQUIPO");
  assert.equal(historyProjection({ alcance: "AREA", actor: colaborador, ticket: tickets.queRecibo }), "SOLICITANTE");
  assert.equal(historyProjection({ alcance: "TOTAL", actor: colaborador, ticket: tickets.ajeno }), "EQUIPO");
});

// ---------------------------------------------------------------------------
// U11 · Observadores y comentario del solicitante (tickets.md §11)
// ---------------------------------------------------------------------------

test("un observador ve el ticket que sigue, aunque sea de otra área", () => {
  for (const alcance of ["PROPIO", "AREA"] as const) {
    assert.equal(within(alcance, TICKET_ACTIONS.consultar, tickets.loSigo), true, alcance);
  }
  assert.equal(historyProjection({ alcance: "PROPIO", actor: encargado, ticket: tickets.loSigo }), "EQUIPO");
});

test("seguir un ticket no da ninguna acción sobre él (permisos.md §9, V7)", () => {
  const acciones = Object.values(TICKET_ACTIONS).filter((action) => action !== TICKET_ACTIONS.consultar);
  for (const action of acciones) {
    assert.equal(within("PROPIO", action, tickets.loSigo), false, action);
    assert.equal(within("AREA", action, tickets.loSigo), false, action);
  }
});

test("comentar como solicitante: solo quien radicó, no el responsable", () => {
  assert.equal(within("PROPIO", TICKET_ACTIONS.comentarSolicitante, tickets.loRadiqueYo), true);
  assert.equal(within("PROPIO", TICKET_ACTIONS.comentarSolicitante, tickets.soyResponsable), false);
  assert.equal(within("PROPIO", TICKET_ACTIONS.comentarSolicitante, tickets.loSigo), false);
});
