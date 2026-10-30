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
import './styles/sitewide-bold-fluid.css'
import './styles/overlay-contrast.css'
import './styles/messages-icon-centering.css'
import './styles/workspace-shell.css'
import './styles/standalone-workspaces.css'
import './styles/evidence-preview.css'
import './styles/backup-restore.css'
import './styles/chat-media.css'
import './styles/automations.css'
import './styles/public-architecture.css'
import './styles/motion-system.css'
import './styles/bot-composer-fluid-black.css'

import './styles/hidden-scrollbars.css'import { AppProvider } from './data/AppProvider'
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
