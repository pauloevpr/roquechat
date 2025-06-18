import type { Component } from 'solid-js';
import { ChatPage } from './pages/chat';
import { Router, Route } from "@solidjs/router"
import { ProtectedWrapper } from './pages/protected';
import { LoginPage } from './pages/login';
import { ConvexProvider } from './lib/convex/provider';
import { convex } from './lib/convex/client';
import { OpenRouterProvider } from './lib/openrouter';
import { SettingsPage } from './pages/settings';


const App: Component = () => {
  return (
    <OpenRouterProvider>
      <ConvexProvider client={convex}>
        <Router>
          <Route path="/" component={ProtectedWrapper} >
            <Route path="/" component={ChatPage} />
            <Route path="/settings" component={SettingsPage} />
          </Route>
          <Route path="/login" component={LoginPage} />
        </Router>
      </ConvexProvider>
    </OpenRouterProvider>
  )
}

export default App;
