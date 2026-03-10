import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Hash routing: #cinematic → visual showcase, default → gameplay
function Root() {
    const [route, setRoute] = React.useState(window.location.hash);

    React.useEffect(() => {
        const onHash = () => setRoute(window.location.hash);
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);

    if (route === '#cinematic') {
        const CinematicScene = React.lazy(() => import('./cinematic/CinematicScene'));
        return (
            <React.Suspense fallback={
                <div style={{
                    position: 'fixed', inset: 0, background: '#050810',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#4a5a6a', fontFamily: 'monospace', letterSpacing: '4px',
                    fontSize: '12px'
                }}>
                    LOADING CINEMATIC...
                </div>
            }>
                <CinematicScene />
            </React.Suspense>
        );
    }

    if (route === '#cinematic-models') {
        const CinematicSceneModels = React.lazy(() => import('./cinematic/CinematicSceneModels'));
        return (
            <React.Suspense fallback={
                <div style={{
                    position: 'fixed', inset: 0, background: '#050810',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#4a5a6a', fontFamily: 'monospace', letterSpacing: '4px',
                    fontSize: '12px'
                }}>
                    LOADING CINEMATIC (MODELS)...
                </div>
            }>
                <CinematicSceneModels />
            </React.Suspense>
        );
    }

    if (route === '#cinematic-city') {
        const CinematicSceneCity = React.lazy(() => import('./cinematic/CinematicSceneCity'));
        return (
            <React.Suspense fallback={
                <div style={{
                    position: 'fixed', inset: 0, background: '#050810',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#4a5a6a', fontFamily: 'monospace', letterSpacing: '4px',
                    fontSize: '12px'
                }}>
                    LOADING CITYSCAPE...
                </div>
            }>
                <CinematicSceneCity />
            </React.Suspense>
        );
    }

    return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Root />
    </React.StrictMode>
);
