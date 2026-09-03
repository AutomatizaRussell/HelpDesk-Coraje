# Documentación de HelpDesk — índice

## Estructura

```
CLAUDE.md                          → raíz del repositorio (Claude Code)
docs/
├── README-documentacion.md        → este índice
├── contexto-canonico.md           → decisiones estables y fronteras
├── specs/
│   ├── acceso-empleados.md
│   ├── acceso-clientes.md
│   ├── tickets.md
│   ├── sincronizacion-sharepoint.md
│   └── permisos.md
├── design/
│   └── sistema-helpdesk.md
├── estado/
│   ├── handoff.md
│   ├── plan-ejecucion.md
│   ├── operacion.md
│   └── backlog-diseno.md
└── legacy/                        → evidencia empírica del sistema anterior
    ├── hallazgos-migracion.md
    ├── reglas-clasificacion.md
    ├── baseline-calidad.md
    └── recapitulacion-sprint-inicial.md
```

## Qué contiene cada documento

| Documento | Propiedad | Volatilidad | Estado |
|---|---|---|---|
| `contexto-canonico.md` | Decisiones estables, reglas de negocio, fronteras arquitectónicas | Baja | — |
| `specs/acceso-empleados.md` | Identidad interna, Entra ID, sesión, admisión, relación con Conecta | Media | aprobado, no implementado |
| `specs/acceso-clientes.md` | Identidad externa del portal: autorización, invitación, OTP, dispositivo | Media | aprobado, no implementado |
| `specs/tickets.md` | Ciclo de vida del ticket, eventos, estados, SLA, asignación | Media | parcial — existe el modelo, falta el ciclo |
| `specs/sincronizacion-sharepoint.md` | Convivencia con PowerApps: ingesta, cola de salida, criterio de apagado | Media | parcial — ingesta viva, salida no ejercitada |
| `specs/permisos.md` | Gobierno de permisos ejecutables y roles | Media | no implementado |
| `design/sistema-helpdesk.md` | Identidad, tokens, resoluciones y recetas por vista | Media | no implementado |
| `estado/handoff.md` | Estado del corte, evidencia y **una** acción inmediata | **Alta** | — |
| `estado/plan-ejecucion.md` | Cola ordenada de unidades de trabajo | **Alta** | — |
| `estado/operacion.md` | Runbook: entornos, despliegue, infraestructura | Baja | — |
| `estado/backlog-diseno.md` | **Propuestas sin ratificar** | Alta | no es contrato |
| `legacy/*.md` | Evidencia empírica del SharePoint anterior y del arranque | Nula | histórico verificado |

> Los cuatro documentos de `legacy/` estaban antes sueltos en `docs/`. Se conservan sin
> alterar su contenido porque son **medición, no intención**: nombres internos
> codificados de SharePoint, reglas de reclasificación derivadas de datos reales y
> conteos conciliados de la carga. Reescribirlos por estilo destruiría evidencia que
> costó obtener y que nadie va a volver a obtener.
>
> Los documentos retirados en el mismo movimiento — `arquitectura_actual.md`,
> `estructura.md`, `decisiones_tecnicas.md` y `estrategia_transicion.md` — eran
> declaraciones de intención superadas. Su contenido vigente vive ahora en
> `contexto-canonico.md` y en las specs.

## Precedencia ante contradicción

1. Decisión aprobada explícita
2. Especificación vigente del dominio
3. Código y migraciones vigentes
4. Pruebas
5. Handoff fechado
6. Documentos históricos
7. Backlog de diseño *(no manda nunca)*

Las fuentes se nombran por **rol**, no por número de versión. Nombra las
contradicciones; no las resuelvas en silencio.

## Reglas del conjunto

- **Un solo propietario por tema.** Los demás documentos referencian, no repiten.
- **La metodología general no vive aquí**, sino en las skills de `.claude/skills/`:
  ciclo de trabajo, código y comentarios, arquitectura y herramientas, diseño y
  experiencia, entrega y operación, reproducibilidad.
- Cada spec abre con `ESTADO / CORTE / EVIDENCIA` y cierra con **Verificación contra
  código**.
- Cada documento termina con un **changelog** de una línea por corte.

## Dónde va cada cosa

- **Raíz del repositorio:** `CLAUDE.md`. Se carga al inicio de cada sesión de Claude
  Code.
- **Conocimiento del proyecto, si se usa Claude Desktop:** solo `contexto-canonico.md`.
  Se carga en cada conversación; nada más debe pagar ese costo.
- **Repositorio, lectura bajo demanda:** todo lo demás.

## Estado de este conjunto documental

Se escribió completo el **03-sep-2026**, adaptando la estructura, las convenciones y
buena parte de las decisiones de `plataforma-impulsa`. Consecuencia que hay que tener
presente al leerlo:

> **Casi todo lo que contiene es contrato acordado, no comportamiento observado.** Las
> specs de acceso, permisos y diseño describen un sistema que aún no existe en código.
> Las únicas afirmaciones respaldadas por ejecución real son las de
> `sincronizacion-sharepoint.md` sobre la ingesta, las de `legacy/baseline-calidad.md`
> sobre la carga conciliada, y las que cada spec marca explícitamente como verificadas
> contra el árbol.

**Changelog:** 03-sep-2026 — línea base. Estructura, precedencia y convenciones
adaptadas de `plataforma-impulsa`; documentos de intención superados retirados;
evidencia empírica reubicada en `legacy/`.
