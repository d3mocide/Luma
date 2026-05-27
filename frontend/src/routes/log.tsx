import { useNavigate } from 'react-router-dom'
import LogSheet from '../components/LogSheet'

export default function LogRoute() {
  const navigate = useNavigate()

  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <LogSheet
        mode="page"
        onClose={() => {
          if (window.history.length > 1) {
            navigate(-1)
          } else {
            navigate('/today', { replace: true })
          }
        }}
      />
    </div>
  )
}
