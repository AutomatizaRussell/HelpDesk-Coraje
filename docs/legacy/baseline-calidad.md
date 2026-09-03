# Baseline de Calidad — Migración Local

Fecha de baseline: definir manualmente.

## Conteos validados

- Tickets cargados: 2,313
- Eventos cargados: 439
- Eventos únicos por `event_hash`: 439
- Tickets sin área: 0
- Tickets sin tipo requerimiento: 4
- Tickets sin prioridad: 3

## Eventos esperados vs cargados

Desde staging:

- Justificación prioridad: 0
- Comentarios adicionales: 71
- Observaciones: 89
- Respuestas sugeridas: 279

Total esperado: 439  
Total cargado: 439

## Distribución de eventos por ticket

- 0 eventos: 1,892 tickets
- 1 evento: 404 tickets
- 2 eventos: 16 tickets
- 3 eventos: 1 ticket

## Criterio de aceptación local

La carga local se considera válida si:

- tickets_sin_area = 0
- eventos_unicos = total_eventos
- tickets_sin_tipo_req <= 4
- tickets_sin_prioridad <= 3