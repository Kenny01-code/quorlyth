import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/app.css'
import './styles/extra.css'
import './styles/project-work.css'
import './styles/motion-system.css'

import './styles/hidden-scrollbars.css'
import './styles/room-theme.css'
import './styles/idea-media.css'
import './styles/community-experience.css'
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
