import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Exposed by the preload script; drives OS-conditional CSS.
if (typeof window.platform === 'string') {
  document.documentElement.dataset.platform = window.platform
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
