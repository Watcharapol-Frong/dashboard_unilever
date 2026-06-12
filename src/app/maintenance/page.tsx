export const metadata = {
  title: 'ระบบปิดปรับปรุงชั่วคราว — Makro × Unilever Dashboard',
}

export default function MaintenancePage() {
  return (
    <html lang="th">
      <body style={{ margin: 0, padding: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#FAFAFA',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
        }}>

          {/* Logo / Brand */}
          <div style={{ marginBottom: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#999999', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Makro × Unilever
            </div>
            <div style={{ fontSize: '22px', fontWeight: 600, color: '#111111', marginTop: '8px', lineHeight: '28px' }}>
              Dashboard
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: '40px', height: '1px', backgroundColor: '#E5E5E5', marginBottom: '48px' }} />

          {/* Main message */}
          <div style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontFamily: 'monospace', color: '#2563EB', marginBottom: '16px', letterSpacing: '0.04em' }}>
              🔧 Under Maintenance
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 600, color: '#111111', margin: '0 0 16px 0', lineHeight: '28px' }}>
              ระบบปิดปรับปรุงชั่วคราว
            </h1>
            <p style={{ fontSize: '15px', color: '#777777', lineHeight: '24px', margin: '0 0 8px 0' }}>
              ขณะนี้เรากำลังอัพเกรดระบบเพื่อประสิทธิภาพที่ดีขึ้น
            </p>
            <p style={{ fontSize: '15px', color: '#777777', lineHeight: '24px', margin: 0 }}>
              We are currently upgrading the system for better performance.
            </p>
          </div>

          {/* Divider */}
          <div style={{ width: '40px', height: '1px', backgroundColor: '#E5E5E5', margin: '48px 0' }} />

          {/* Footer */}
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '11px', fontFamily: 'monospace', color: '#999999', margin: 0, letterSpacing: '0.04em' }}>
              กรุณาลองใหม่ในภายหลัง · Please try again later
            </p>
          </div>

        </div>
      </body>
    </html>
  )
}
