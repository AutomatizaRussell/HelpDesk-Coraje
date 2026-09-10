---
name: reproducibilidad-entorno
description: "Entornos deterministas y reproducibles (filosofía anti \"en mi máquina funcionaba\"). Úsala SIEMPRE que se inicialice o configure un proyecto, se agreguen dependencias, se escriban Dockerfiles o docker-compose, se defina el runtime (Python/Node), o se fijen versiones. Cubre: sin runtimes globales (UV para Python, FNM para Node), pnpm, imágenes Docker con versión explícita, y pin por defecto sin rigidez dogmática. Aplica aunque no se mencione \"reproducibilidad\": crear un proyecto o instalar algo ya es el disparo."
---

# Reproducibilidad y entorno

## Filosofía
Evita "en mi máquina funcionaba". El entorno debe ser determinista y reproducible por cualquiera que clone el repo, sin pasos implícitos.

## Sin runtimes globales
- **Python → UV.** Nunca asumas un Python global. Usa `pyproject.toml` + `uv.lock`, con la versión de Python fijada.
- **Node → FNM.** Nunca asumas un Node global. Fija la versión con `.nvmrc` (o `.node-version`) y el campo `engines` en `package.json`.
- **Gestor de paquetes → pnpm.** `pnpm-lock.yaml` siempre commiteado.

## Fijar versiones (sin camisa de fuerza)
Pin por defecto; afloja con criterio explícito, no por descuido.
- **Estricto** (fija versión exacta): runtimes, motores de base de datos, imágenes Docker productivas.
- **Flexible** (rango semver acotado): librerías estables y bien mantenidas, tooling de desarrollo.
- Todo cambio de dependencia: fija/actualiza el lockfile y justifica por qué esa librería. No arrastres dependencias innecesarias.

## Consultar antes de fijar (obligatorio)
Nunca fijes una versión de memoria: el conocimiento del modelo tiene fecha de corte y las versiones se mueven. Antes de escribir cualquier tag de imagen, versión de runtime o pin de dependencia, consulta la versión vigente (Docker Hub, repo oficial, changelog del proyecto) y decide con criterio explícito de rama:

- Rama estable vs mainline/dev: para infraestructura, la última estable de la rama que corresponda, no necesariamente la más nueva (ej. nginx stable 1.30.x, no mainline 1.31.x; Postgres: última minor de una major madura, no la major recién salida).
- Declara la versión elegida y por qué esa rama.
- Si no puedes consultarla, dilo explícitamente en vez de inventar un número.

## Docker
- Imágenes con **tag de versión explícito**: `postgres:16.x`, `n8n:x.y.z`. Nunca `latest` en entornos que importan; usa digest (`@sha256:…`) para builds productivos reproducibles.
- Dependencias de servicio (Postgres, n8n) en `docker-compose` con versiones fijadas y volúmenes nombrados para persistencia.
- Busca paridad dev/prod: lo que corre local debe parecerse a producción.

## Secretos y configuración
- `.env.example` con placeholders claros; nunca secretos reales en el repo.
- Configuración por variables de entorno, no hardcodeada.

## Al inicializar un proyecto
Deja explícitos desde el día uno: versión de runtime fijada, lockfile, `docker-compose` de dependencias con versiones, `.env.example`, y los comandos de dev/build/test en el `CLAUDE.md`/README del proyecto.