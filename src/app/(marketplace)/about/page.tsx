import Link from 'next/link'

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto py-8">

      {/* Hero */}
      <section className="text-center mb-16">
        <span
          className="material-symbols-outlined text-primary text-[56px] mb-4 block"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          handshake
        </span>
        <h1 className="text-headline-lg-mobile md:text-headline-lg text-primary mb-4">
          Conectamos personas, no solo servicios
        </h1>
        <p className="text-body-lg text-on-surface-variant max-w-xl mx-auto">
          ServiLocal nació con una idea simple: que encontrar trabajo o un trabajador de confianza
          en El Salvador no debería ser complicado ni arriesgado.
        </p>
      </section>

      {/* Philosophy */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-8 mb-8 shadow-sm">
        <h2 className="text-headline-md text-primary mb-4">Nuestra filosofía</h2>
        <p className="text-body-md text-on-surface leading-relaxed mb-4">
          Creemos que el talento local merece oportunidades reales. Hay electricistas, fontaneros,
          maestros, diseñadores y profesionales del delivery que tienen las habilidades para
          transformar tu proyecto — solo necesitan que los encuentres.
        </p>
        <p className="text-body-md text-on-surface leading-relaxed">
          Del otro lado, hay clientes que quieren contratar con confianza: saber que su dinero
          está protegido hasta que el trabajo esté hecho. ServiLocal cierra esa brecha.
        </p>
      </section>

      {/* How it works — 3 steps */}
      <section className="mb-12">
        <h2 className="text-headline-md text-primary mb-8 text-center">¿Cómo funciona?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-primary-container flex items-center justify-center mb-4">
              <span
                className="material-symbols-outlined text-primary text-[28px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                edit_note
              </span>
            </div>
            <span className="text-label-sm text-on-surface-variant mb-1">Paso 1</span>
            <h3 className="text-label-md text-on-surface mb-2">Publica tu proyecto</h3>
            <p className="text-body-md text-on-surface-variant">
              Describe lo que necesitas, tu presupuesto y la fecha límite. Es gratis y toma menos
              de un minuto.
            </p>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-primary-container flex items-center justify-center mb-4">
              <span
                className="material-symbols-outlined text-primary text-[28px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                manage_search
              </span>
            </div>
            <span className="text-label-sm text-on-surface-variant mb-1">Paso 2</span>
            <h3 className="text-label-md text-on-surface mb-2">Recibe propuestas</h3>
            <p className="text-body-md text-on-surface-variant">
              Los proveedores con las habilidades adecuadas aplican directamente. Tú revisas,
              comparas y eliges al que mejor se ajusta.
            </p>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-primary-container flex items-center justify-center mb-4">
              <span
                className="material-symbols-outlined text-primary text-[28px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                lock
              </span>
            </div>
            <span className="text-label-sm text-on-surface-variant mb-1">Paso 3</span>
            <h3 className="text-label-md text-on-surface mb-2">Pago seguro</h3>
            <p className="text-body-md text-on-surface-variant">
              Tu pago queda retenido en custodia hasta que el trabajo esté completado y aprobado.
              El trabajador recibe su dinero solo cuando tú confirmas.
            </p>
          </div>

        </div>
      </section>

      {/* Trust section */}
      <section className="bg-surface-container rounded-2xl p-8 mb-12">
        <h2 className="text-headline-md text-primary mb-6">Por qué confiar en ServiLocal</h2>
        <ul className="space-y-5">
          {[
            {
              icon: 'shield',
              title: 'Tu dinero siempre protegido',
              desc: 'El pago se retiene de forma segura al publicar el proyecto. No hay transferencias directas ni riesgo de perder tu dinero.',
            },
            {
              icon: 'verified',
              title: 'Proveedores con habilidades reales',
              desc: 'Cada proveedor registra las categorías en las que trabaja. Solo los que tienen la habilidad correcta pueden aplicar a tu proyecto.',
            },
            {
              icon: 'location_on',
              title: 'Comunidad local',
              desc: 'Construido para El Salvador. Todos los proveedores son personas reales de tu misma comunidad.',
            },
            {
              icon: 'support_agent',
              title: 'Transparencia total',
              desc: 'Puedes ver el estado de tu proyecto, las propuestas recibidas y el historial de pagos en todo momento desde tu panel.',
            },
          ].map(({ icon, title, desc }) => (
            <li key={icon} className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center shrink-0 mt-0.5">
                <span
                  className="material-symbols-outlined text-primary text-[20px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {icon}
                </span>
              </div>
              <div>
                <p className="text-label-md text-on-surface">{title}</p>
                <p className="text-body-md text-on-surface-variant mt-0.5">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* CTAs */}
      <section className="text-center flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href="/dashboard/jobs/new"
          className="btn-press bg-primary text-on-primary px-8 py-4 rounded-full text-label-md hover:opacity-90 transition-opacity shadow-sm"
        >
          Publicar un proyecto
        </Link>
        <Link
          href="/jobs"
          className="btn-press border border-secondary text-secondary px-8 py-4 rounded-full text-label-md hover:bg-surface-variant transition-colors"
        >
          Buscar trabajo
        </Link>
      </section>

    </div>
  )
}
