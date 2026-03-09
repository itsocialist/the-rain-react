import { useState, useRef, useCallback, useEffect } from 'react';
import { inputManager } from '../player/InputManager';
import './TouchControls.css';

/**
 * TouchControls — Visible on-screen controls for mobile.
 * Left side: virtual D-pad with directional arrows
 * Right side: large GRIP button
 * 
 * Only renders on touch-capable devices.
 */
export function TouchControls() {
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [dpadActive, setDpadActive] = useState(false);
    const [dpadDir, setDpadDir] = useState({ x: 0, z: 0 });
    const [gripActive, setGripActive] = useState(false);
    const dpadRef = useRef<HTMLDivElement>(null);
    const dpadOrigin = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        setIsTouchDevice(hasTouch);
    }, []);

    // ── D-pad handlers ──────────────────────────────────────────────
    const handleDpadStart = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.changedTouches[0];
        dpadOrigin.current = { x: touch.clientX, y: touch.clientY };
        setDpadActive(true);
    }, []);

    const handleDpadMove = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.changedTouches[0];
        const dx = touch.clientX - dpadOrigin.current.x;
        const dy = touch.clientY - dpadOrigin.current.y;
        const maxRadius = 40;
        const x = Math.max(-1, Math.min(1, dx / maxRadius));
        const z = Math.max(-1, Math.min(1, dy / maxRadius));
        setDpadDir({ x, z });

        // Feed directly into InputManager's touch state
        (inputManager as any).touchDirection = { x, z };
        (inputManager as any).touchActive = true;
    }, []);

    const handleDpadEnd = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        setDpadActive(false);
        setDpadDir({ x: 0, z: 0 });
        (inputManager as any).touchDirection = { x: 0, z: 0 };
        (inputManager as any).touchActive = false;
    }, []);

    // ── Grip button handlers ────────────────────────────────────────
    const handleGripStart = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setGripActive(true);
        (inputManager as any).touchGrip = true;
    }, []);

    const handleGripEnd = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        setGripActive(false);
        (inputManager as any).touchGrip = false;
    }, []);

    if (!isTouchDevice) return null;

    const knobStyle = dpadActive
        ? {
            transform: `translate(${dpadDir.x * 25}px, ${dpadDir.z * 25}px)`,
            background: 'rgba(100, 200, 255, 0.6)',
        }
        : {};

    return (
        <div className="touch-controls">
            {/* D-pad (left side) */}
            <div
                ref={dpadRef}
                className={`touch-dpad ${dpadActive ? 'active' : ''}`}
                onTouchStart={handleDpadStart}
                onTouchMove={handleDpadMove}
                onTouchEnd={handleDpadEnd}
            >
                <div className="dpad-ring">
                    <div className="dpad-arrows">
                        <span className="dpad-arrow up">▲</span>
                        <span className="dpad-arrow right">▶</span>
                        <span className="dpad-arrow down">▼</span>
                        <span className="dpad-arrow left">◀</span>
                    </div>
                    <div className="dpad-knob" style={knobStyle} />
                </div>
                <span className="touch-label">MOVE</span>
            </div>

            {/* Grip button (right side) */}
            <div
                className={`touch-grip ${gripActive ? 'active' : ''}`}
                onTouchStart={handleGripStart}
                onTouchEnd={handleGripEnd}
            >
                <div className="grip-ring">
                    <span className="grip-icon">✊</span>
                </div>
                <span className="touch-label">GRIP</span>
            </div>
        </div>
    );
}
