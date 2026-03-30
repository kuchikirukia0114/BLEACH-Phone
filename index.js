const MODULE_NAME = 'BLEACH-Phone';
const SETTINGS_KEY = 'bleach_phone';
const MENU_ITEM_ID = 'bleach-phone-menu-item';
const MENU_API_ID = 'bleach-phone.open';
const MODAL_ID = 'bleach-phone-modal';
const HTML_URL = new URL('./bleach.html', import.meta.url).href;

const BASE_DIALOG_WIDTH = 980;
const BASE_DIALOG_HEIGHT = 980;
const DEFAULT_SCALE = 1;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.2;
const SCALE_STEP = 0.08;
const VIEWPORT_MARGIN = 12;
const COMPACT_INTERACTION_PADDING = 12;

const context = SillyTavern.getContext();
const { eventSource, event_types, extensionSettings, saveSettingsDebounced } = context;

const defaultSettings = Object.freeze({
    left: null,
    top: null,
    scale: null,
});

let escBound = false;
let resizeBound = false;
let initialized = false;

function getSettings() {
    if (!extensionSettings[SETTINGS_KEY]) {
        extensionSettings[SETTINGS_KEY] = { ...defaultSettings };
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[SETTINGS_KEY], key)) {
            extensionSettings[SETTINGS_KEY][key] = value;
        }
    }

    return extensionSettings[SETTINGS_KEY];
}

function savePluginSettings() {
    if (typeof saveSettingsDebounced === 'function') {
        saveSettingsDebounced();
    }
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function getCurrentScale(modal) {
    const value = Number.parseFloat(modal.dataset.scale || `${DEFAULT_SCALE}`);
    return Number.isFinite(value) ? value : DEFAULT_SCALE;
}

function getFrame(modal) {
    return modal?.querySelector('[data-role="frame"]') ?? null;
}

function hasRunningIframeAnimations(frame) {
    const doc = frame?.contentDocument;
    if (!doc) {
        return false;
    }

    const animationTargets = [
        doc.getElementById('phone'),
        doc.querySelector('.upper-flip'),
    ].filter(Boolean);

    return animationTargets.some((target) => {
        if (typeof target.getAnimations !== 'function') {
            return false;
        }

        return target.getAnimations().some((animation) => animation.playState === 'running');
    });
}

function expandInteractionRegion(modal) {
    const frame = getFrame(modal);
    if (!frame) {
        return;
    }

    frame.style.clipPath = 'none';
    modal.dataset.interactionMode = 'expanded';
}

function compactInteractionRegion(modal) {
    const frame = getFrame(modal);
    const doc = frame?.contentDocument;
    const phone = doc?.getElementById('phone');
    if (!frame || !doc || !phone) {
        return;
    }

    const rect = phone.getBoundingClientRect();
    const viewportWidth = doc.documentElement.clientWidth;
    const viewportHeight = doc.documentElement.clientHeight;
    const left = clamp(rect.left - COMPACT_INTERACTION_PADDING, 0, viewportWidth);
    const top = clamp(rect.top - COMPACT_INTERACTION_PADDING, 0, viewportHeight);
    const right = clamp(rect.right + COMPACT_INTERACTION_PADDING, 0, viewportWidth);
    const bottom = clamp(rect.bottom + COMPACT_INTERACTION_PADDING, 0, viewportHeight);

    frame.style.clipPath = `inset(${top}px ${Math.max(0, viewportWidth - right)}px ${Math.max(0, viewportHeight - bottom)}px ${left}px)`;
    modal.dataset.interactionMode = 'compact';
}

function scheduleCompactInteraction(modal, delay = 80) {
    if (!modal) {
        return;
    }

    clearTimeout(modal.__compactTimerId);
    modal.__compactTimerId = window.setTimeout(() => {
        const frame = getFrame(modal);
        if (hasRunningIframeAnimations(frame)) {
            scheduleCompactInteraction(modal, delay);
            return;
        }

        compactInteractionRegion(modal);
    }, delay);
}

function getAutoScale() {
    return clamp(
        (window.innerHeight - VIEWPORT_MARGIN * 2) / BASE_DIALOG_HEIGHT,
        MIN_SCALE,
        MAX_SCALE,
    );
}

function clampScale(scale) {
    return clamp(scale, MIN_SCALE, MAX_SCALE);
}

function setModalPosition(modal, left, top, { persist = true } = {}) {
    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;
    modal.style.right = 'auto';
    modal.style.bottom = 'auto';

    if (persist) {
        const settings = getSettings();
        settings.left = left;
        settings.top = top;
        savePluginSettings();
    }
}

function clampModalPosition(modal, { persist = true } = {}) {
    if (!modal) {
        return;
    }

    const rect = modal.getBoundingClientRect();
    setModalPosition(modal, rect.left, rect.top, { persist });
}

function setModalScale(modal, nextScale, {
    persist = true,
    anchorX = null,
    anchorY = null,
    clampPosition = true,
} = {}) {
    const dialog = modal.querySelector('[data-role="dialog"]');
    if (!dialog) {
        return DEFAULT_SCALE;
    }

    const previousScale = getCurrentScale(modal);
    const previousRect = modal.getBoundingClientRect();
    const scale = clampScale(nextScale);

    dialog.style.width = `${Math.round(BASE_DIALOG_WIDTH * scale)}px`;
    dialog.style.height = `${Math.round(BASE_DIALOG_HEIGHT * scale)}px`;
    modal.dataset.scale = String(scale);

    if (persist) {
        const settings = getSettings();
        settings.scale = scale;
        savePluginSettings();
    }

    if (!clampPosition) {
        requestAnimationFrame(() => scheduleCompactInteraction(modal, 0));
        return scale;
    }

    if (anchorX !== null && anchorY !== null && previousScale > 0) {
        const ratio = scale / previousScale;
        const nextLeft = anchorX - (anchorX - previousRect.left) * ratio;
        const nextTop = anchorY - (anchorY - previousRect.top) * ratio;
        setModalPosition(modal, nextLeft, nextTop, { persist });
        requestAnimationFrame(() => scheduleCompactInteraction(modal, 0));
        return scale;
    }

    clampModalPosition(modal, { persist });
    requestAnimationFrame(() => scheduleCompactInteraction(modal, 0));
    return scale;
}

function centerModal(modal, { persist = true } = {}) {
    if (!modal) {
        return;
    }

    const rect = modal.getBoundingClientRect();
    const left = (window.innerWidth - rect.width) / 2;
    const top = (window.innerHeight - rect.height) / 2;
    setModalPosition(modal, left, top, { persist });
}

function shouldCenterOnOpen() {
    if (typeof context.isMobile === 'boolean') {
        return context.isMobile;
    }

    return window.matchMedia('(max-width: 768px)').matches;
}

function initializeModalLayout(modal) {
    if (modal.dataset.initialized === 'true') {
        return;
    }

    const settings = getSettings();
    const savedScale = isFiniteNumber(settings.scale) ? settings.scale : getAutoScale();
    setModalScale(modal, savedScale, { persist: false, clampPosition: false });

    requestAnimationFrame(() => {
        const rect = modal.getBoundingClientRect();
        const defaultLeft = (window.innerWidth - rect.width) / 2;
        const defaultTop = (window.innerHeight - rect.height) / 2;
        const left = isFiniteNumber(settings.left) ? settings.left : defaultLeft;
        const top = isFiniteNumber(settings.top) ? settings.top : defaultTop;

        setModalPosition(modal, left, top, { persist: false });
        modal.dataset.initialized = 'true';
    });
}

function syncModalToViewport(modal) {
    if (!modal || modal.classList.contains('is-hidden')) {
        return;
    }

    setModalScale(modal, getCurrentScale(modal), { persist: false, clampPosition: true });
}

function closeModal() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) {
        return;
    }

    modal.classList.add('is-hidden');
}

function getFramePoint(frame, clientX, clientY) {
    const frameRect = frame.getBoundingClientRect();
    return {
        x: frameRect.left + clientX,
        y: frameRect.top + clientY,
    };
}

function getTouchGesture(frame, touches) {
    if (touches.length < 2) {
        return null;
    }

    const point1 = getFramePoint(frame, touches[0].clientX, touches[0].clientY);
    const point2 = getFramePoint(frame, touches[1].clientX, touches[1].clientY);

    return {
        centerX: (point1.x + point2.x) / 2,
        centerY: (point1.y + point2.y) / 2,
        distance: Math.hypot(point2.x - point1.x, point2.y - point1.y),
    };
}

function bindFrameInteractions(modal) {
    const frame = modal.querySelector('[data-role="frame"]');
    if (!frame || frame.dataset.hostBound === 'true') {
        return;
    }

    const install = () => {
        const doc = frame.contentDocument;
        if (!doc || frame.dataset.gestureBound === 'true') {
            return;
        }

        frame.dataset.gestureBound = 'true';

        const gestureState = {
            dragging: false,
            pointerId: null,
            startX: 0,
            startY: 0,
            startLeft: 0,
            startTop: 0,
            pinching: false,
            pinchDistance: 0,
            pinchScale: DEFAULT_SCALE,
            pinchLeft: 0,
            pinchTop: 0,
            pinchCenterX: 0,
            pinchCenterY: 0,
        };

        const finishPointerDrag = (event) => {
            if (!gestureState.dragging || gestureState.pointerId !== event.pointerId) {
                return;
            }

            gestureState.dragging = false;
            gestureState.pointerId = null;
            const rect = modal.getBoundingClientRect();
            setModalPosition(modal, rect.left, rect.top, { persist: true });
            scheduleCompactInteraction(modal, 0);
        };

        doc.addEventListener('wheel', (event) => {
            if (!(event.ctrlKey || event.metaKey)) {
                return;
            }

            event.preventDefault();
            const anchor = getFramePoint(frame, event.clientX, event.clientY);
            const delta = event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
            setModalScale(modal, getCurrentScale(modal) + delta, {
                persist: true,
                anchorX: anchor.x,
                anchorY: anchor.y,
                clampPosition: true,
            });
        }, { passive: false });

        doc.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        }, { capture: true });

        doc.addEventListener('pointerdown', (event) => {
            if (event.button !== 2) {
                return;
            }

            const point = getFramePoint(frame, event.clientX, event.clientY);
            const rect = modal.getBoundingClientRect();
            gestureState.dragging = true;
            gestureState.pointerId = event.pointerId;
            gestureState.startX = point.x;
            gestureState.startY = point.y;
            gestureState.startLeft = rect.left;
            gestureState.startTop = rect.top;

            try {
                event.target?.setPointerCapture?.(event.pointerId);
            } catch {
                // ignore
            }

            event.preventDefault();
        }, { passive: false, capture: true });

        doc.addEventListener('pointermove', (event) => {
            if (!gestureState.dragging || gestureState.pointerId !== event.pointerId) {
                return;
            }

            const point = getFramePoint(frame, event.clientX, event.clientY);
            const deltaX = point.x - gestureState.startX;
            const deltaY = point.y - gestureState.startY;
            setModalPosition(modal, gestureState.startLeft + deltaX, gestureState.startTop + deltaY, { persist: false });
            event.preventDefault();
        }, { passive: false, capture: true });

        doc.addEventListener('pointerup', finishPointerDrag, { capture: true });
        doc.addEventListener('pointercancel', finishPointerDrag, { capture: true });

        doc.addEventListener('touchstart', (event) => {
            const gesture = getTouchGesture(frame, event.touches);
            if (!gesture) {
                return;
            }

            const rect = modal.getBoundingClientRect();
            gestureState.pinching = true;
            gestureState.pinchDistance = Math.max(gesture.distance, 1);
            gestureState.pinchScale = getCurrentScale(modal);
            gestureState.pinchLeft = rect.left;
            gestureState.pinchTop = rect.top;
            gestureState.pinchCenterX = gesture.centerX;
            gestureState.pinchCenterY = gesture.centerY;
            event.preventDefault();
        }, { passive: false, capture: true });

        doc.addEventListener('touchmove', (event) => {
            if (!gestureState.pinching) {
                return;
            }

            const gesture = getTouchGesture(frame, event.touches);
            if (!gesture) {
                return;
            }

            const nextScale = gestureState.pinchScale * (gesture.distance / Math.max(gestureState.pinchDistance, 1));
            const appliedScale = setModalScale(modal, nextScale, { persist: false, clampPosition: false });
            const ratio = appliedScale / gestureState.pinchScale;
            const nextLeft = gesture.centerX - (gestureState.pinchCenterX - gestureState.pinchLeft) * ratio;
            const nextTop = gesture.centerY - (gestureState.pinchCenterY - gestureState.pinchTop) * ratio;

            setModalPosition(modal, nextLeft, nextTop, { persist: false });
            event.preventDefault();
        }, { passive: false, capture: true });

        const finishTouchGesture = () => {
            if (!gestureState.pinching) {
                return;
            }

            gestureState.pinching = false;
            const rect = modal.getBoundingClientRect();
            const settings = getSettings();
            settings.left = rect.left;
            settings.top = rect.top;
            settings.scale = getCurrentScale(modal);
            savePluginSettings();
        };

        doc.addEventListener('touchend', finishTouchGesture, { capture: true });
        doc.addEventListener('touchcancel', finishTouchGesture, { capture: true });

        const phone = doc.getElementById('phone');
        const upperFlip = doc.querySelector('.upper-flip');
        const onAnimationStart = () => expandInteractionRegion(modal);
        const onAnimationEnd = () => scheduleCompactInteraction(modal);

        for (const target of [phone, upperFlip]) {
            if (!target) {
                continue;
            }

            target.addEventListener('transitionrun', onAnimationStart);
            target.addEventListener('transitionend', onAnimationEnd);
            target.addEventListener('transitioncancel', onAnimationEnd);
        }

        if (frame.__phoneClassObserver) {
            frame.__phoneClassObserver.disconnect();
        }

        if (phone) {
            frame.__phoneClassObserver = new MutationObserver(() => {
                if (hasRunningIframeAnimations(frame)) {
                    expandInteractionRegion(modal);
                    return;
                }

                scheduleCompactInteraction(modal);
            });
            frame.__phoneClassObserver.observe(phone, {
                attributes: true,
                attributeFilter: ['class'],
            });
        }

        compactInteractionRegion(modal);
    };

    frame.addEventListener('load', () => {
        frame.dataset.gestureBound = 'false';
        install();
    });

    frame.dataset.hostBound = 'true';
    install();
}

function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) {
        return modal;
    }

    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'bleach-phone-modal is-hidden';
    modal.innerHTML = `
        <div class="bleach-phone-modal__dialog" data-role="dialog" role="dialog" aria-modal="false" aria-label="BLEACH-Phone">
            <iframe
                class="bleach-phone-modal__frame"
                data-role="frame"
                src="${HTML_URL}"
                title="BLEACH-Phone"
                loading="eager"
                scrolling="no"
                allowtransparency="true"
            ></iframe>
        </div>
    `;

    document.body.appendChild(modal);
    bindEscape();
    bindFrameInteractions(modal);
    return modal;
}

function openModal() {
    const modal = ensureModal();
    modal.classList.remove('is-hidden');
    initializeModalLayout(modal);
    requestAnimationFrame(() => {
        syncModalToViewport(modal);
        if (shouldCenterOnOpen()) {
            centerModal(modal, { persist: false });
        }
        scheduleCompactInteraction(modal, 0);
    });
}

function toggleModal() {
    const modal = ensureModal();
    if (modal.classList.contains('is-hidden')) {
        openModal();
        return;
    }

    closeModal();
}

function bindEscape() {
    if (escBound) {
        return;
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeModal();
        }
    });

    escBound = true;
}

function bindResize() {
    if (resizeBound) {
        return;
    }

    window.addEventListener('resize', () => {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) {
            return;
        }

        syncModalToViewport(modal);
    });

    resizeBound = true;
}

function createManualMenuItem() {
    if (document.getElementById(MENU_ITEM_ID)) {
        return true;
    }

    const menu = document.getElementById('extensionsMenu');
    if (!menu) {
        return false;
    }

    const item = document.createElement('div');
    item.id = MENU_ITEM_ID;
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = `
        <div class="fa-solid fa-mobile-screen-button extensionsMenuExtensionButton"></div>
        <span>BLEACH-Phone</span>
    `;

    const handleActivate = (event) => {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        if (event.type === 'keydown') {
            event.preventDefault();
        }

        toggleModal();
    };

    item.addEventListener('click', handleActivate);
    item.addEventListener('keydown', handleActivate);
    menu.appendChild(item);
    return true;
}

function ensureManualMenuItem(retries = 20) {
    if (createManualMenuItem()) {
        return;
    }

    if (retries <= 0) {
        console.warn(`[${MODULE_NAME}] 未找到 #extensionsMenu，无法插入菜单项。`);
        return;
    }

    setTimeout(() => ensureManualMenuItem(retries - 1), 500);
}

async function registerMenuItem() {
    if (window.ST_API?.ui?.registerExtensionsMenuItem) {
        try {
            await window.ST_API.ui.registerExtensionsMenuItem({
                id: MENU_API_ID,
                label: 'BLEACH-Phone',
                icon: 'fa-solid fa-mobile-screen-button',
                onClick: toggleModal,
            });
            return;
        } catch (error) {
            console.warn(`[${MODULE_NAME}] ST_API 菜单注册失败，改用手动注入。`, error);
        }
    }

    ensureManualMenuItem();
}

function init() {
    if (initialized) {
        return;
    }

    initialized = true;
    bindResize();
    ensureModal();
    registerMenuItem();
    console.log(`[${MODULE_NAME}] 已初始化，HTML 地址：${HTML_URL}`);
}

eventSource.on(event_types.APP_READY, init);

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 0);
} else {
    window.addEventListener('load', init, { once: true });
}
