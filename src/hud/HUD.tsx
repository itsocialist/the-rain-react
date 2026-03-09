import { useGameStore } from '../stores/gameStore';
import './HUD.css';

export function HUD() {
    const grip = useGameStore((s) => s.player.grip);
    const mode = useGameStore((s) => s.player.mode);
    const deaths = useGameStore((s) => s.player.deaths);
    const intensity = useGameStore((s) => s.weather.intensity);
    const tensionScore = useGameStore((s) => s.difficulty.tensionScore);
    const started = useGameStore((s) => s.level.started);
    const startLevel = useGameStore((s) => s.startLevel);

    if (!started) {
        return (
            <div className="hud-overlay">
                <div className="hud-title-screen">
                    <h1 className="hud-title">THE RAIN CONTINUES</h1>
                    <p className="hud-subtitle">Cross the skybridge. Don't look down.</p>
                    <button className="hud-start-btn" onClick={startLevel}>
                        BEGIN
                    </button>
                    <div className="hud-controls-hint">
                        <p>WASD / Arrow Keys to move</p>
                        <p>Touch: D-pad left, Grip right</p>
                    </div>
                </div>
            </div>
        );
    }

    const gripPercent = Math.round(grip * 100);
    const gripClass =
        grip < 0.2 ? 'critical' : grip < 0.5 ? 'warning' : 'normal';

    return (
        <div className="hud-overlay hud-gameplay">
            {/* Grip Bar */}
            <div className="hud-grip-container">
                <div className="hud-grip-label">GRIP</div>
                <div className="hud-grip-track">
                    <div
                        className={`hud-grip-fill ${gripClass}`}
                        style={{ width: `${gripPercent}%` }}
                    />
                </div>
                <div className="hud-grip-value">{gripPercent}%</div>
            </div>

            {/* Status indicators */}
            <div className="hud-status">
                <div className="hud-stat">
                    <span className="hud-stat-label">MODE</span>
                    <span className={`hud-stat-value mode-${mode}`}>{mode.toUpperCase()}</span>
                </div>
                <div className="hud-stat">
                    <span className="hud-stat-label">STORM</span>
                    <span className="hud-stat-value">{Math.round(intensity * 100)}%</span>
                </div>
                <div className="hud-stat">
                    <span className="hud-stat-label">DEATHS</span>
                    <span className="hud-stat-value">{deaths}</span>
                </div>
            </div>

            {/* Mode indicator */}
            {mode === 'grip' && (
                <div className="hud-mode-alert">
                    <span>⚠ GRIPPING — Hold on!</span>
                </div>
            )}
            {mode === 'falling' && (
                <div className="hud-mode-alert falling">
                    <span>↓ FALLING</span>
                </div>
            )}
        </div>
    );
}
