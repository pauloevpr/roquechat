import type { Component } from 'solid-js';
import { ChatPage } from './pages/chat';
import { Router, Route } from "@solidjs/router"
import { ProtectedWrapper } from './pages/protected';
import { LoginPage } from './pages/login';
import { ConvexProvider } from './lib/convex/provider';
import { convex } from './lib/convex/client';


const App: Component = () => {
  return (
    <ConvexProvider client={convex}>
      <Router>
        <Route path="/" component={ProtectedWrapper} >
          <Route path="/" component={ChatPage} />
        </Route>
        <Route path="/login" component={LoginPage} />
      </Router>
    </ConvexProvider>
  )
}

export default App;
