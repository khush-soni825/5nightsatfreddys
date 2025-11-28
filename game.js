import kaboom from "https://unpkg.com/kaboom@3000.0.1/dist/kaboom.mjs";

// Initialize Kaboom
kaboom({
    width: 1024,
    height: 576,
    background: [0, 0, 0],
    scale: 1,
});

// Game Configuration
const NIGHT_CONFIG = {
    1: { drainRate: 0.05, animatronics: ['freddy'] },
    2: { drainRate: 0.10, animatronics: ['freddy', 'bonnie'] },
    3: { drainRate: 0.15, animatronics: ['freddy', 'bonnie', 'foxy'] }
};

const CAMERAS = ['1A', '1B', '1C', '2A', '2B'];

// Global State
let state = {
    night: 1,
    power: 100,
    time: 0, // 0 to 6
    doors: { left: false, right: false },
    cameraOpen: false,
    currentCam: '1A',
    animatronics: {
        freddy: { location: '1A', path: ['1A', '1B', '1C', 'office'], aggression: 2 },
        bonnie: { location: '1A', path: ['1A', '2A', '2B', 'office'], aggression: 3 },
        foxy: { location: '1C', path: ['1C', '2A', 'office'], aggression: 4 }
    }
};

// Load Assets
loadSprite("office", "images/office_bg.png");
loadSprite("freddy_jumpscare", "images/freddy_jumpscare.png");
loadSprite("bonnie_jumpscare", "images/bonnie_jumpscare.png");
loadSprite("foxy_jumpscare", "images/foxy_jumpscare.png");

// Load Camera Placeholders
CAMERAS.forEach(cam => {
    loadSprite(`cam_${cam}_empty`, `images/cam_${cam}_empty.png`);
    // Load variants if they exist (we created some in the script)
    // In a real scenario we'd check existence or load all blindly. 
    // For now, we manually list the ones we know we made.
    if (cam === '1A') {
        loadSprite(`cam_1A_freddy`, `images/cam_1A_freddy.png`);
        loadSprite(`cam_1A_bonnie`, `images/cam_1A_bonnie.png`);
    }
    if (cam === '1B') loadSprite(`cam_1B_freddy`, `images/cam_1B_freddy.png`);
    if (cam === '1C') {
        loadSprite(`cam_1C_freddy`, `images/cam_1C_freddy.png`);
        loadSprite(`cam_1C_foxy`, `images/cam_1C_foxy.png`);
    }
    if (cam === '2A') {
        loadSprite(`cam_2A_bonnie`, `images/cam_2A_bonnie.png`);
        loadSprite(`cam_2A_foxy`, `images/cam_2A_foxy.png`);
    }
    if (cam === '2B') loadSprite(`cam_2B_bonnie`, `images/cam_2B_bonnie.png`);
});

// SCENE: Start
scene("start", () => {
    add([
        text("Night Shift at Freddy's", { size: 48 }),
        pos(width() / 2, height() / 2 - 50),
        anchor("center"),
    ]);

    add([
        text("Click to Start Night " + state.night, { size: 24 }),
        pos(width() / 2, height() / 2 + 50),
        anchor("center"),
    ]);

    onClick(() => go("game"));
});

// SCENE: Game
scene("game", () => {
    // Reset State for the night
    state.power = 100;
    state.time = 0;
    state.doors = { left: false, right: false };
    state.cameraOpen = false;
    state.currentCam = '1A';
    // Reset animatronics
    Object.keys(state.animatronics).forEach(k => {
        state.animatronics[k].location = state.animatronics[k].path[0];
    });

    // Layers
    // Layers
    const bgLayer = add([]);
    const camLayer = add([]); // For camera feed
    const uiLayer = add([]);
    camLayer.hidden = true;

    // Background (Office)
    const officeBg = bgLayer.add([
        sprite("office"),
        pos(0, 0),
        scale(1), // SVGs are 1024x576 already
    ]);

    // Door Visuals (Simple Rects for now, or we could tint the BG)
    const leftDoor = bgLayer.add([
        rect(150, height()),
        pos(0, 0),
        color(50, 50, 50),
        opacity(0), // Hidden when open
    ]);
    const rightDoor = bgLayer.add([
        rect(150, height()),
        pos(width() - 150, 0),
        color(50, 50, 50),
        opacity(0),
    ]);

    // --- UI CONTROLS ---

    // Door Buttons
    // Door Buttons
    function createButton(txt, p, cb, parent = uiLayer) {
        const btn = parent.add([
            rect(80, 40),
            pos(p),
            color(100, 100, 100),
            area(),
            anchor("center"),
            "button"
        ]);
        btn.add([
            text(txt, { size: 16 }),
            anchor("center"),
            color(255, 255, 255)
        ]);
        btn.onClick(cb);
        return btn;
    }

    createButton("DOOR L", vec2(60, height() / 2), () => {
        if (state.power <= 0) return;
        state.doors.left = !state.doors.left;
        leftDoor.opacity = state.doors.left ? 1 : 0;
    }, bgLayer);

    createButton("DOOR R", vec2(width() - 60, height() / 2), () => {
        if (state.power <= 0) return;
        state.doors.right = !state.doors.right;
        rightDoor.opacity = state.doors.right ? 1 : 0;
    }, bgLayer);

    // Camera Toggle
    const camToggleBtn = createButton("MONITOR", vec2(width() / 2, height() - 40), () => {
        if (state.power <= 0) return;
        state.cameraOpen = !state.cameraOpen;
        camLayer.hidden = !state.cameraOpen;
        updateCameraView();
    });
    camToggleBtn.use(rect(200, 40)); // Make it wider

    // --- HUD ---
    const powerLabel = uiLayer.add([
        text("Power: 100%", { size: 24 }),
        pos(20, height() - 80),
    ]);

    const timeLabel = uiLayer.add([
        text("12 AM", { size: 24 }),
        pos(width() - 120, 20),
    ]);

    // --- CAMERA LAYER ---
    const camFeed = camLayer.add([
        sprite("cam_1A_empty"),
        pos(0, 0),
    ]);

    // Camera Map Buttons
    const mapBase = vec2(width() - 250, height() - 200);

    function createCamButton(camId, relPos) {
        const btn = camLayer.add([
            rect(50, 30),
            pos(mapBase.add(relPos)),
            color(0, 100, 0),
            area(),
            anchor("center"),
            "cam_btn"
        ]);
        btn.add([
            text(camId, { size: 12 }),
            anchor("center")
        ]);
        btn.onClick(() => {
            state.currentCam = camId;
            updateCameraView();
        });
    }

    createCamButton('1A', vec2(50, 20));
    createCamButton('1B', vec2(20, 60));
    createCamButton('1C', vec2(80, 60));
    createCamButton('2A', vec2(50, 100));
    createCamButton('2B', vec2(100, 100));

    function updateCameraView() {
        if (!state.cameraOpen) return;

        let spriteName = `cam_${state.currentCam}_empty`;

        // Check animatronics
        Object.keys(state.animatronics).forEach(name => {
            const anim = state.animatronics[name];
            if (anim.location === state.currentCam) {
                // Check if we have a specific sprite for this combo
                // Simplified logic: just try to load the sprite, fallback to empty if complex logic needed
                // For this demo, we know the exact names we generated.
                if (name === 'freddy' && ['1A', '1B', '1C'].includes(state.currentCam)) {
                    spriteName = `cam_${state.currentCam}_freddy`;
                }
                if (name === 'bonnie' && ['1A', '2A', '2B'].includes(state.currentCam)) {
                    spriteName = `cam_${state.currentCam}_bonnie`;
                }
                if (name === 'foxy' && ['1C', '2A'].includes(state.currentCam)) {
                    spriteName = `cam_${state.currentCam}_foxy`;
                }
            }
        });

        camFeed.use(sprite(spriteName));
    }

    // --- GAME LOOPS ---

    // Timer (1 hour = 10 seconds real time for demo speed)
    loop(10, () => {
        state.time++;
        if (state.time === 0) timeLabel.text = "12 AM";
        else timeLabel.text = state.time + " AM";

        if (state.time >= 6) {
            go("win");
        }
    });

    // Power Drain
    loop(1, () => {
        let usage = 1;
        if (state.doors.left) usage += 2;
        if (state.doors.right) usage += 2;
        if (state.cameraOpen) usage += 1;

        state.power -= NIGHT_CONFIG[state.night].drainRate * usage * 5; // x5 for faster drain in demo
        powerLabel.text = "Power: " + Math.floor(state.power) + "%";

        if (state.power <= 0) {
            state.power = 0;
            state.doors.left = false;
            state.doors.right = false;
            state.cameraOpen = false;
            leftDoor.opacity = 0;
            rightDoor.opacity = 0;
            camLayer.hidden = true;

            wait(3, () => {
                go("jumpscare", "freddy");
            });
        }
    });

    // AI Movement
    loop(4, () => {
        if (state.power <= 0) return;

        const activeAnimatronics = NIGHT_CONFIG[state.night].animatronics;

        activeAnimatronics.forEach(name => {
            const anim = state.animatronics[name];
            if (rand(0, 10) < anim.aggression) {
                moveAnimatronic(name);
            }
        });

        updateCameraView();
    });

    function moveAnimatronic(name) {
        const anim = state.animatronics[name];
        const currentIdx = anim.path.indexOf(anim.location);

        if (currentIdx < anim.path.length - 1) {
            anim.location = anim.path[currentIdx + 1];
        }

        if (anim.location === 'office') {
            // Attack!
            let blocked = false;
            if (name === 'freddy' && state.doors.left) blocked = true; // Freddy left
            if (name === 'bonnie' && state.doors.right) blocked = true; // Bonnie right (changed from prev logic for balance)
            if (name === 'foxy' && state.doors.left) blocked = true;

            if (blocked) {
                anim.location = anim.path[0]; // Reset
                shake(5); // Feedback
            } else {
                go("jumpscare", name);
            }
        }
    }
});

// SCENE: Jumpscare
scene("jumpscare", (name) => {
    add([
        sprite(name + "_jumpscare"),
        pos(0, 0),
    ]);

    wait(2, () => {
        go("lose");
    });
});

// SCENE: Win
scene("win", () => {
    add([
        text("6:00 AM", { size: 60 }),
        pos(width() / 2, height() / 2),
        anchor("center"),
    ]);

    wait(3, () => {
        if (state.night < 3) {
            state.night++;
            go("start");
        } else {
            add([
                text("YOU SURVIVED ALL NIGHTS!", { size: 30 }),
                pos(width() / 2, height() / 2 + 100),
                anchor("center"),
            ]);
        }
    });
});

// SCENE: Lose
scene("lose", () => {
    add([
        text("GAME OVER", { size: 60, color: rgb(255, 0, 0) }),
        pos(width() / 2, height() / 2),
        anchor("center"),
    ]);

    add([
        text("Click to Retry", { size: 24 }),
        pos(width() / 2, height() / 2 + 80),
        anchor("center"),
    ]);

    onClick(() => go("start"));
});

// Start the game
go("start");
