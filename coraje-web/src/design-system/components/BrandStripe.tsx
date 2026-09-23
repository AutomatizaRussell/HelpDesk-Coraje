/**
 * Franja corporativa de cuatro colores, en el orden del manual de marca
 * (navy · magenta · teal · naranja). Es decorativa: no transmite información
 * y por eso se oculta a los lectores de pantalla.
 */
const SEGMENTS = ["bg-stripe-0", "bg-stripe-1", "bg-stripe-2", "bg-stripe-3"] as const;

export function BrandStripe() {
  return (
    <div aria-hidden="true" className="grid h-stripe grid-cols-4">
      {SEGMENTS.map((segment) => (
        <span key={segment} className={segment} />
      ))}
    </div>
  );
}
