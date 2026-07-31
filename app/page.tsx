const companies = ['Pérez y Cardona', 'Galagro', 'Tierragro']

export default function Page() {
  const lastUpdated = new Date().toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f5faf6',
        color: '#1f2937',
        padding: '24px',
      }}
    >
      <header
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          background: '#ffffff',
          border: '1px solid #dfe9e1',
          borderRadius: '18px',
          boxShadow: '0 6px 18px rgba(36, 92, 58, 0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '20px 24px',
            borderBottom: '1px solid #edf3ee',
            background: '#ffffff',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: '#245c3a',
                textTransform: 'uppercase',
              }}
            >
              Indicadores C4C
            </div>
            <div
              style={{
                marginTop: '6px',
                fontSize: 'clamp(1.2rem, 2vw, 1.8rem)',
                fontWeight: 700,
                color: '#183a2a',
              }}
            >
              Pérez y Cardona S.A.S.
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px',
              justifyContent: 'flex-end',
            }}
          >
            {companies.map((company, index) => {
              const isActive = index === 0

              return (
                <button
                  key={company}
                  type="button"
                  style={{
                    border: '1px solid',
                    borderColor: isActive ? '#245c3a' : '#dfe9e1',
                    background: isActive ? '#245c3a' : '#ffffff',
                    color: isActive ? '#ffffff' : '#245c3a',
                    borderRadius: '999px',
                    padding: '8px 14px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {company}
                </button>
              )
            })}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            padding: '16px 24px',
            background: '#f9fcfa',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#4b5563', fontWeight: 500 }}>Última actualización:</span>
            <span style={{ fontSize: '0.9rem', color: '#183a2a', fontWeight: 700 }}>{lastUpdated}</span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button
              type="button"
              style={{
                border: '1px solid #245c3a',
                background: '#ffffff',
                color: '#245c3a',
                borderRadius: '10px',
                padding: '10px 16px',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Actualizar datos
            </button>
            <button
              type="button"
              style={{
                border: 'none',
                background: '#245c3a',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '10px 16px',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Descargar PDF
            </button>
          </div>
        </div>
      </header>
    </main>
  )
}
