import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-500.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import App from './App';
import './styles.css';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {failed: boolean}> {
 state = { failed: false };
 static getDerivedStateFromError() { return { failed: true }; }
 render() { return this.state.failed ? <main className="container page-content"><h1>Precisamos recarregar esta página.</h1><p>Ocorreu uma falha na interface. Você pode tentar novamente.</p><button onClick={() => location.reload()}>Recarregar</button></main> : this.props.children; }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><BrowserRouter><App /></BrowserRouter></ErrorBoundary></React.StrictMode>);
