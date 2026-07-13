// Datos estructurados schema.org. El replace escapa `<` para que contenido
// controlado por usuarios (bio, nombres) no pueda cerrar el <script> e
// inyectar HTML.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  )
}
