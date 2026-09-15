/**
 * Forma de la cookie de estado OIDC, compartida entre la ruta que inicia el
 * ingreso (`/api/auth/microsoft/start`) y la que recibe el retorno del
 * proveedor (`/api/auth/microsoft/callback`). El valor viaja sellado
 * (`src/server/security/secret-box.ts`) — nunca legible ni manipulable desde
 * el navegador.
 */

export const STATE_COOKIE_NAME = "helpdesk_oidc_state";

export interface SealedOidcState {
  state: string;
  nonce: string;
  codeVerifier: string;
  destino: string;
  silent: boolean;
}
