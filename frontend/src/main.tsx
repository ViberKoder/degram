import React from 'react'
import ReactDOM from 'react-dom/client'
import './utils/bufferPolyfill'
import App from './App'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

