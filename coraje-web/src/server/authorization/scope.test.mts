import { test } from "node:test";
import assert from "node:assert/strict";

import { TICKET_ACTIONS, type TicketAction } from "./catalog";
import {
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
 * que no puede responder su propio ticket, un compañero de otra área que no
 * lo ve, una nota interna que quien radicó no recibe.
 */

const YO = "00000000-0000-0000-0000-000000000001";
const OTRA_PERSONA = "00000000-0000-0000-0000-000000000002";
const MI_AREA = "00000000-0000-0000-0000-0000000000a1";
const OTRA_AREA = "00000000-0000-0000-0000-0000000000a2";

const actor: ScopeActor = { idPersonal: YO, idArea: MI_AREA };

const tickets = {
  soyResponsable: { idSolicitante: OTRA_PERSONA, idAsignado: YO, idAreaDestino: MI_AREA },
  loRadiqueYo: { idSolicitante: YO, idAsignado: OTRA_PERSONA, idAreaDestino: OTRA_AREA },
  deMiArea: { idSolicitante: OTRA_PERSONA, idAsignado: OTRA_PERSONA, idAreaDestino: MI_AREA },
  ajeno: { idSolicitante: OTRA_PERSONA, idAsignado: OTRA_PERSONA, idAreaDestino: OTRA_AREA },
  sinAreaNiResponsable: { idSolicitante: OTRA_PERSONA, idAsignado: null, idAreaDestino: null },
} satisfies Record<string, ScopeTicket>;

const within = (alcance: Alcance, action: TicketAction, ticket: ScopeTicket, who: ScopeActor = actor) =>
  isTicketWithinScope({ alcance, action, actor: who, ticket });

test("consultar con alcance PROPIO: lo que radiqué y lo que me asignaron, nada más", () => {
  assert.equal(within("PROPIO", TICKET_ACTIONS.consultar, tickets.soyResponsable), true);
  assert.equal(within("PROPIO", TICKET_ACTIONS.consultar, tickets.loRadiqueYo), true);
  assert.equal(within("PROPIO", TICKET_ACTIONS.consultar, tickets.deMiArea), false);
  assert.equal(within("PROPIO", TICKET_ACTIONS.consultar, tickets.ajeno), false);
});

test("consultar con alcance AREA añade los de mi área, no los de otra", () => {
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.deMiArea), true);
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.loRadiqueYo), true);
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.ajeno), false);
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, tickets.sinAreaNiResponsable), false);
});

test("quien radicó un ticket no puede responderlo, rechazarlo ni reasignarlo", () => {
  for (const action of [TICKET_ACTIONS.responder, TICKET_ACTIONS.rechazar, TICKET_ACTIONS.reasignar]) {
    assert.equal(within("PROPIO", action, tickets.loRadiqueYo), false, action);
    assert.equal(within("PROPIO", action, tickets.soyResponsable), true, action);
  }
});

test("un compañero de área no actúa sobre un ticket que no le asignaron, aunque lo vea", () => {
  assert.equal(within("PROPIO", TICKET_ACTIONS.responder, tickets.deMiArea), false);
  assert.equal(within("AREA", TICKET_ACTIONS.notaInterna, tickets.deMiArea), true);
});

test("sin área propia, AREA no amplía nada: no hay área con la que coincidir", () => {
  const sinArea: ScopeActor = { idPersonal: YO, idArea: null };
  const ticketSinArea: ScopeTicket = { idSolicitante: OTRA_PERSONA, idAsignado: OTRA_PERSONA, idAreaDestino: null };
  assert.equal(within("AREA", TICKET_ACTIONS.consultar, ticketSinArea, sinArea), false);
});

test("TOTAL cubre cualquier ticket", () => {
  assert.equal(within("TOTAL", TICKET_ACTIONS.responder, tickets.ajeno), true);
});

test("el filtro SQL de consulta equivale a la regla en memoria, caso por caso", () => {
  const matches = (conditions: ReturnType<typeof consultScopeConditions>, ticket: ScopeTicket) =>
    conditions === null ||
    conditions.some((condition) =>
      Object.entries(condition).every(([field, value]) => ticket[field as keyof ScopeTicket] === value),
    );

  for (const alcance of ["PROPIO", "AREA", "TOTAL"] as const) {
    for (const who of [actor, { idPersonal: YO, idArea: null }]) {
      const conditions = consultScopeConditions(alcance, who);
      for (const [name, ticket] of Object.entries(tickets)) {
        assert.equal(
          matches(conditions, ticket),
          within(alcance, TICKET_ACTIONS.consultar, ticket, who),
          `${alcance} · área ${who.idArea ?? "ninguna"} · ${name}`,
        );
      }
    }
  }
});

test("quien solo radicó el ticket no recibe notas internas", () => {
  assert.equal(historyProjection({ alcance: "AREA", actor, ticket: tickets.loRadiqueYo }), "SOLICITANTE");
  assert.deepEqual([...VISIBLE_BY_PROJECTION.SOLICITANTE], ["AMBOS"]);
  assert.ok(!(VISIBLE_BY_PROJECTION.SOLICITANTE as readonly string[]).includes("INTERNO"));
});

test("el responsable y su área ven la historia del equipo", () => {
  assert.equal(historyProjection({ alcance: "PROPIO", actor, ticket: tickets.soyResponsable }), "EQUIPO");
  assert.equal(historyProjection({ alcance: "AREA", actor, ticket: tickets.deMiArea }), "EQUIPO");
  assert.equal(historyProjection({ alcance: "PROPIO", actor, ticket: tickets.deMiArea }), "SOLICITANTE");
});
