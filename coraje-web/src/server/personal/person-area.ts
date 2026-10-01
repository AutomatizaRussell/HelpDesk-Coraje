import { prisma } from "@/lib/prisma";

/**
 * El nombre del área de una persona, para el color del shell (U16). Lee el
 * directorio de HelpDesk (`core.dim_personal`), no el perfil de Conecta: el
 * perfil del navegador solo decide qué se muestra, y aquí también es solo
 * presentación, pero no hace falta depender de él.
 *
 * Suplantando, `idPersonal` es la persona suplantada: el color cambia con
 * ella, y eso recuerda como quién se trabaja.
 */
export async function getPersonAreaName(idPersonal: string): Promise<string | null> {
  const persona = await prisma.dimPersonal.findUnique({
    where: { idPersonal },
    select: { dimArea: { select: { nombreArea: true } } },
  });
  return persona?.dimArea?.nombreArea ?? null;
}
