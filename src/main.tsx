import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/app.css'
import './styles/extra.css'
import './styles/messages.css'
import './styles/bot.css'
import './styles/sitewide-liquid-glass.css'
import './styles/loader.css'
import './styles/project-work.css'
import './styles/messages-final.css'
import './styles/messages-reference.css'
import './styles/messages-neuroglass.css'
import { AppProvider } from './data/AppProvider'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)
