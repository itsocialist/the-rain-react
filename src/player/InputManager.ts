/**
 * InputManager — Keyboard + Touch abstraction
 * Outputs a normalized direction vector and action states.
 */

export interface InputState {
    direction: { x: number; z: number };
    gripAction: boolean;
    jump: boolean;
}

class InputManager {
    private keys: Set<string> = new Set();
    private touchDirection = { x: 0, z: 0 };
    private touchGrip = false;
    private touchActive = false;
    private dpadTouchId: number | null = null;
    private dpadOrigin = { x: 0, y: 0 };

    constructor() {
        if (typeof window === 'undefined') return;

        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('touchstart', this.onTouchStart, { passive: false });
        window.addEventListener('touchmove', this.onTouchMove, { passive: false });
        window.addEventListener('touchend', this.onTouchEnd, { passive: false });
    }

    private onKeyDown = (e: KeyboardEvent) => {
        this.keys.add(e.code);
    };

    private onKeyUp = (e: KeyboardEvent) => {
        this.keys.delete(e.code);
    };

    private onTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const screenW = window.innerWidth;

            if (touch.clientX < screenW * 0.5) {
                // Left half → D-pad
                this.dpadTouchId = touch.identifier;
                this.dpadOrigin = { x: touch.clientX, y: touch.clientY };
                this.touchActive = true;
            } else {
                // Right half → grip action
                this.touchGrip = true;
            }
        }
    };

    private onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.dpadTouchId) {
                const dx = touch.clientX - this.dpadOrigin.x;
                const dy = touch.clientY - this.dpadOrigin.y;
                const maxRadius = 50;
                this.touchDirection = {
                    x: Math.max(-1, Math.min(1, dx / maxRadius)),
                    z: Math.max(-1, Math.min(1, dy / maxRadius)),
                };
            }
        }
    };

    private onTouchEnd = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.dpadTouchId) {
                this.dpadTouchId = null;
                this.touchActive = false;
                this.touchDirection = { x: 0, z: 0 };
            } else {
                this.touchGrip = false;
            }
        }
    };

    getInput(): InputState {
        // Keyboard direction
        let kx = 0;
        let kz = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kz = -1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kz = 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx = -1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx = 1;

        // Merge keyboard + touch (touch overrides if active)
        const direction = this.touchActive
            ? this.touchDirection
            : { x: kx, z: kz };

        // Normalize
        const mag = Math.sqrt(direction.x ** 2 + direction.z ** 2);
        if (mag > 1) {
            direction.x /= mag;
            direction.z /= mag;
        }

        return {
            direction,
            gripAction: this.keys.has('Space') || this.touchGrip,
            jump: this.keys.has('Space'),
        };
    }

    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('touchstart', this.onTouchStart);
        window.removeEventListener('touchmove', this.onTouchMove);
        window.removeEventListener('touchend', this.onTouchEnd);
    }
}

// Singleton
export const inputManager = new InputManager();
