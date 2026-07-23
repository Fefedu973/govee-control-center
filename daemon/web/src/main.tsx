import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
const syncTheme = () => {
  document.documentElement.classList.toggle('dark', colorScheme.matches)
}
syncTheme()
colorScheme.addEventListener('change', syncTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
