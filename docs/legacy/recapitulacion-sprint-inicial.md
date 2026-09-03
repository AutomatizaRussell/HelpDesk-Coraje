# Recapitulación Técnica — Sprint Inicial CORAJE

> Documento de apuntes técnicos generales y específicos del arranque de CORAJE con Next.js, TypeScript, pnpm, Git, GitHub, Prisma y PostgreSQL.

---

## 1. Paso 0: base estructural del proyecto

Antes de tocar Next.js se definió que CORAJE no es solo una app web, sino un sistema completo.

Estructura conceptual:

```text
CORAJE/
  sql/
    db/
    ingest/
    elt/
    checks/
  docs/
  n8n/
  coraje-web/
  docker-compose.yml
  .env
  .gitignore
```

Decisión clave:

```text
CORAJE = proyecto completo.
coraje-web = frontend/fullstack Next.js dentro del proyecto.
```

No se trató `coraje-web` como el repositorio principal aislado.

---

## 2. Stack definido

Stack elegido:

```text
Next.js
TypeScript
PostgreSQL
Prisma
Tailwind
n8n
NextAuth/Auth.js más adelante
```

Decisiones relevantes:

```text
Next.js se usará como frontend y backend inicial.
Prisma se usará como cliente tipado contra PostgreSQL.
n8n no será backend público.
PostgreSQL será el núcleo estructurado.
SharePoint/PowerApps seguirán en paralelo durante transición.
```

No se usó Express en esta fase porque metería otra capa innecesaria para el alcance inicial.

---

## 3. Node.js

Aprendido:

```text
Node.js = runtime de JavaScript fuera del navegador.
```

No es:

```text
npm
pnpm
React
Next.js
TypeScript
```

Node ejecuta herramientas del ecosistema:

```text
Next.js
TypeScript
Prisma
Tailwind
scripts de desarrollo
builds
servidor local
```

---

## 4. Instalación y configuración de `fnm`

Se eligió `fnm` porque el entorno de trabajo es:

```text
Windows
PowerShell
Antigravity
```

Decisión:

```text
fnm para gestionar versiones de Node en Windows.
```

Se corrigió la configuración del perfil de PowerShell agregando:

```powershell
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
```

Luego se logró activar Node:

```powershell
fnm use v24.16.0
```

Resultado:

```text
Using Node v24.16.0
```

---

## 5. Fijar Node al proyecto con `.node-version`

Aprendido:

```text
fnm use VERSION activa Node en la terminal.
.node-version fija la versión para el proyecto.
```

Se creó:

```text
coraje-web/.node-version
```

con:

```text
24.16.0
```

Esto permite que el proyecto declare formalmente qué versión de Node espera.

---

## 6. Corepack y pnpm

Aprendido:

```text
pnpm = package manager.
Corepack = gestor de gestores de paquetes.
```

`package.json` puede contener:

```json
{
  "packageManager": "pnpm@11.2.2+sha512..."
}
```

Eso significa:

```text
El proyecto usa pnpm 11.2.2.
El hash sha512 valida integridad del gestor.
```

También se aclaró:

```text
package.json = intención/declaración.
pnpm-lock.yaml = resolución exacta de dependencias.
node_modules = artefacto generado, no se versiona.
```

---

## 7. Creación de la app Next.js

Desde:

```powershell
C:\Proyectos\CORAJE
```

se ejecutó:

```powershell
pnpm create next-app@latest coraje-web
```

Configuración elegida:

```text
Recommended defaults: No, customize settings
TypeScript: Yes
Linter: ESLint
React Compiler: No
Tailwind CSS: Yes
src directory: Yes
App Router: Yes
Customize alias: No
AGENTS.md: Yes
```

Resultado inicial:

```text
coraje-web/
  src/
    app/
      layout.tsx
      page.tsx
      globals.css
      favicon.ico
  public/
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.json
  next.config.ts
  eslint.config.mjs
  postcss.config.mjs
  README.md
```

---

## 8. `pnpm approve-builds`

Durante instalación aparecieron paquetes con scripts bloqueados:

```text
sharp
unrs-resolver
```

Luego, al instalar Prisma, aparecieron:

```text
@prisma/engines
prisma
esbuild
```

Aprendido:

```text
pnpm bloquea scripts de build/install por seguridad.
No se debe aprobar todo a ciegas.
Se aprueban explícitamente paquetes entendidos.
```

Comandos usados:

```powershell
pnpm approve-builds
pnpm install
```

o explícitamente:

```powershell
pnpm approve-builds @prisma/engines prisma esbuild
pnpm install
```

---

## 9. `.gitignore` centralizado

Decisión:

```text
Un solo .gitignore en la raíz CORAJE.
```

No mantener política duplicada en:

```text
coraje-web/.gitignore
```

Reglas importantes absorbidas:

```gitignore
coraje-web/node_modules/
coraje-web/.next/
coraje-web/out/
coraje-web/build/
coraje-web/.vercel/
coraje-web/*.tsbuildinfo
coraje-web/next-env.d.ts
coraje-web/.env
coraje-web/.env.*

.env
.env.*
!*.env.example
!coraje-web/.env.example

*.log
.venv/
__pycache__/
*.pyc
.DS_Store
Thumbs.db
.vscode/
.idea/
```

Principio aprendido:

```text
No versionar artefactos generados.
Sí versionar contratos de reproducibilidad.
```

Versionar:

```text
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
.node-version
tsconfig.json
schema.prisma
src/
sql/
docs/
docker-compose.yml
```

No versionar:

```text
node_modules
.next
.env
.venv
logs
credenciales
```

---

## 10. Git y GitHub

Se eligió instalación profesional por WinGet:

```powershell
winget install --id Git.Git -e --source winget
```

Desglose aprendido:

```text
winget = gestor de paquetes de Windows
install = acción
--id Git.Git = paquete exacto
-e = coincidencia exacta
--source winget = fuente explícita
```

Luego se inicializó el repositorio en:

```text
C:\Proyectos\CORAJE
```

No en:

```text
coraje-web/
```

porque el repo debe cubrir el sistema completo.

Aprendido:

```text
git add . = preparar todos los cambios desde el directorio actual hacia abajo.
git commit = snapshot versionado del proyecto.
git push -u origin main = subir y establecer upstream.
```

También se aprendió:

```text
-u = --set-upstream
```

Conecta:

```text
main local -> origin/main remoto
```

para que luego baste con:

```powershell
git push
git pull
```

---

## 11. `.venv`

Se corrigió una confusión importante.

Aprendido:

```text
.venv no administra todo el proyecto.
.venv solo administra Python.
```

No sirve para:

```text
Node
pnpm
Prisma
Next.js
Docker
Git
PostgreSQL
n8n
```

Sí sirve para:

```text
Python
pip
scripts Python
paquetes Python
```

Comando de activación en PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Pero para comandos como:

```powershell
pnpm install
pnpm exec prisma init
pnpm dev
docker compose up -d
git status
```

no se usa `.venv`.

---

## 12. Instalación local de Prisma

Se corrigió una decisión:

Inicialmente se había considerado:

```powershell
pnpm dlx prisma init
```

Pero para este proyecto lo correcto es:

```powershell
pnpm add -D prisma
pnpm exec prisma init
```

Principio aprendido:

```text
pnpm dlx = herramienta temporal/remota.
pnpm exec = herramienta instalada localmente en el proyecto.
```

Como Prisma forma parte del stack, debe ir como dependencia local.

Instalación:

```powershell
pnpm add @prisma/client @prisma/adapter-pg dotenv pg
pnpm add -D prisma tsx @types/pg
```

---

## 13. `prisma init`

Comando:

```powershell
pnpm exec prisma init
```

Prisma creó:

```text
prisma/
  schema.prisma

prisma.config.ts
.env
```

Pero `.env` generado apuntaba a:

```env
DATABASE_URL="prisma+postgres://localhost:51213/?api_key=..."
```

Diagnóstico:

```text
Eso era Prisma Postgres temporal/local, no tu PostgreSQL Docker real.
```

Se reemplazó conceptualmente por:

```env
DATABASE_URL="postgresql://postgres:TU_PASSWORD@localhost:5433/adm_helpdesk_db"
```

---

## 14. Dos `.env`

Decisión actual:

```text
CORAJE/.env = infraestructura / Docker Compose
CORAJE/coraje-web/.env = Next.js / Prisma
```

Ejemplo raíz:

```env
DB_USER=postgres
DB_PASS=...
DB_NAME=adm_helpdesk_db
DB_PORT_HOST=5433
DB_PORT_CONTAINER=5432
```

Ejemplo app:

```env
DATABASE_URL="postgresql://postgres:***@localhost:5433/adm_helpdesk_db"
```

Principio aprendido:

```text
Desde Windows/DBeaver/Prisma se usa localhost:5433.
Desde n8n dentro de Docker se usa el puerto interno 5432.
```

---

## 15. Prisma 7

Apareció error:

```text
The datasource property `url` is no longer supported in schema files.
```

Causa:

```text
Prisma 7 ya no permite url = env("DATABASE_URL") dentro de schema.prisma.
```

Corrección en `schema.prisma`.

Antes:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["core", "helpdesk"]
}
```

Después:

```prisma
datasource db {
  provider = "postgresql"
  schemas  = ["core", "helpdesk"]
}
```

Y en `prisma.config.ts` quedó la conexión:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

---

## 16. Introspección con `prisma db pull`

Comando:

```powershell
pnpm exec prisma db pull
```

Resultado:

```text
Database: adm_helpdesk_db
Schemas: core, helpdesk
Host: localhost:5433
Models introspected: 9
```

Modelos introspectados:

```text
cliente_contai_recurso
dim_area
dim_cliente_contai
dim_personal
dim_estado
dim_prioridad
dim_tipo_requerimiento
fact_ticket
fact_ticket_evento
```

Warnings recibidos:

```text
Prisma no soporta completamente CHECK constraints.
```

Diagnóstico:

```text
No bloquea lectura.
No se eliminan constraints.
La base sigue protegiendo integridad.
```

---

## 17. `prisma generate`

Comando:

```powershell
pnpm exec prisma generate
```

Se generó Prisma Client en:

```text
src/generated/prisma/
```

Estructura generada:

```text
src/generated/prisma/
  internal/
  models/
  browser.ts
  client.ts
  commonInputTypes.ts
  enums.ts
  models.ts
```

Aprendido:

```text
Prisma Client es el puente tipado entre TypeScript/Next.js y PostgreSQL.
```

No es:

```text
Prisma CLI
la base de datos
el backend completo
```

Sirve para consultar:

```ts
prisma.fact_ticket.findMany()
```

y obtener tipos basados en el schema real.

---

## 18. `src/lib/prisma.ts`

Archivo creado:

```text
coraje-web/src/lib/prisma.ts
```

Propósito:

```text
Centralizar una instancia de Prisma Client.
Evitar múltiples instancias durante hot reload.
Configurar adapter PostgreSQL.
```

Contenido conceptual usado:

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["query", "error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

Principio:

```text
Prisma solo se usa server-side.
No se importa Prisma en componentes con "use client".
```

---

## 19. Ruta `/tickets`

Archivo creado:

```text
coraje-web/src/app/tickets/page.tsx
```

Objetivo:

```text
Leer 10 tickets reales desde PostgreSQL usando Prisma.
```

Consulta usada conceptualmente:

```ts
await prisma.fact_ticket.findMany({
  take: 10,
  orderBy: {
    fecha_creacion: "desc",
  },
  select: {
    id_ticket: true,
    consecutivo_sp: true,
    titulo_ticket: true,
    fecha_creacion: true,
    dim_estado: {
      select: {
        nombre_estado: true,
      },
    },
    dim_prioridad: {
      select: {
        nombre_prioridad: true,
      },
    },
    dim_area: {
      select: {
        nombre_area: true,
      },
    },
    dim_cliente_contai: {
      select: {
        nombre_cliente: true,
      },
    },
  },
});
```

Objetivo del endpoint/página:

```text
Validar cadena real:
Next.js -> Prisma -> PostgreSQL -> datos reales -> render.
```

No era diseño final.

---

## 20. Validación TypeScript

Comando:

```powershell
pnpm exec tsc --noEmit
```

Aprendido:

```text
tsc = TypeScript compiler.
--noEmit = revisar tipos sin generar archivos.
```

Sirve para:

```text
validar imports
validar tipos
detectar errores antes de correr o commitear
```

Si no muestra errores, la validación estática pasó.

---

## 21. Estado Git después de cambios Prisma

`git status` mostró:

```text
modified:
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  tsconfig.json

untracked:
  .gitignore
  prisma.config.ts
  prisma/
  src/app/tickets/
  src/lib/
```

Diagnóstico:

```text
Esperado tras instalar Prisma, aprobar builds, generar config, crear ruta /tickets y crear src/lib/prisma.ts.
```

Puntos a revisar antes de commit:

```text
tsconfig.json
pnpm-workspace.yaml
.gitignore correcto
no subir .env
no subir node_modules
no subir .next
decidir si ignorar src/generated/prisma
```

---

## 22. Estado actual del proyecto

Ya se logró:

```text
Next.js creado.
TypeScript activo.
Tailwind activo.
ESLint activo.
Node fijado con .node-version.
pnpm fijado con packageManager.
Git/GitHub configurado.
Prisma instalado localmente.
Prisma conectado a PostgreSQL real.
Prisma introspectó core/helpdesk.
Prisma Client generado.
src/lib/prisma.ts creado.
Ruta /tickets creada para lectura real.
```

---


## 23. Principio general aprendido

```text
Un proyecto serio no empieza con código.
Empieza con control del entorno.
```

Y el estándar mental queda:

```text
Si no está declarado en archivos versionados,
no existe como contrato del proyecto.
```
