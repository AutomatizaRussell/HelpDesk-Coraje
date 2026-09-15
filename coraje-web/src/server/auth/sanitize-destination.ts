/**
 * Allowlist de forma, no blacklist de trucos: solo sobrevive un valor que
 * empiece con un único "/". Rechaza también backslash — algunos navegadores
 * lo normalizan a "/", así que "/\evil.example" se volvería
 * protocol-relative si no se rechazara aquí (specs/acceso-empleados.md §5,
 * paso 2; §10, criterio "no puede convertirse en una redirección a otro
 * sitio"). Se aplica en ambos extremos: al sellar el destino en /start y al
 * leerlo de vuelta en /login.
 */
export function sanitizeDestination(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (raw.startsWith("//") || raw.includes("\\") || !raw.startsWith("/")) {
    return "/";
  }
  return raw;
}
