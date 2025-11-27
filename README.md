# Quantum Entanglement – WebGL Orb Experiment

This project is a small interactive visual experiment about **“quantum entanglement”** in the browser.  
Using **React**, **Three.js**, and custom **GLSL shaders**, it visualizes two glowing energy orbs (💚 Green & 💜 Magenta) that can “find” each other across multiple browser windows, become entangled, and eventually **merge into a single fused field**.

---

## Concept

When you open the app in **two separate browser windows** (with the same URL), both windows communicate indirectly via `localStorage`.  
A simple `WindowManager` tracks:

- which orb you are: **green** or **magenta**
- whether there is an active **partner window**
- how close the two windows are on your screen and how much they overlap

From this, the app computes a dynamic **bond value (0–100%)**, which directly drives the visual behavior of the scene.

---

## Visual System

Everything is rendered in a single Three.js scene with multiple particle layers and a deforming orb mesh.

### Core Elements

- **Main Orb Blob**
  - Icosahedron-based mesh with high subdivision
  - Deformed in the vertex shader using layered simplex noise (`snoise`)
  - Controlled via uniforms:  
    - `uTime` – time-based animation  
    - `uPairStrength` – reacts to bond between windows  
  - Uses a Fresnel-like effect in the fragment shader to create a glowing membrane with bright edges and a soft core

- **Primary Particles (≈8000)**
  - Form the core energy field around the orb
  - Color depends on which orb you are:
    - Green orb: greenish core particles
    - Magenta orb: magenta core particles
  - Animated with simple “spring” forces towards a target radius + noise-based motion  
  - React to:
    - **Bond strength** (radius and motion)
    - **Merge state** (additional orbiting behavior)
    - Approximate direction to the partner orb

- **Accent Particles (≈1500)**
  - Use the **complementary color** of the main orb (magenta around green, green around magenta)
  - Sit slightly closer to the surface and move with a tighter, more energetic motion
  - Also influenced by bond / merge, with enhanced band-like attraction to the other orb

---

## Fusion & “Holy Glow” Layers

Once the bond between the two windows becomes strong enough, the system transitions into a **MERGED** state.  
This activates two additional particle layers around the shared center:

### 1. Fusion Particles (Colorful Orbiting Layer)

- ~1500 particles in a spherical shell around the orb(s)
- Colors: a mix of **white**, **gold**, **cyan**, and **soft pink**
- Each particle has:
  - Its own orbit radius
  - Angular speed
  - Latitude (`phi`) and angle (`theta`)
- Positions are updated using spherical coordinates, creating:
  - Constant orbital motion
  - Subtle wobble and radius pulsing
- Particle sizes pulse over time and scale with the `mergeAmount`  
  → Result: a vivid, energetic ring of colorful sparks once the orbs are truly fused.

### 2. Holy Glow Particles (Outer Ethereal Layer)

- ~600 particles forming a **slower, more subtle aura**
- Pure white color, rendered with a dedicated **glow fragment shader**:
  - Softer falloff
  - Bright core glow
  - Gentle transparency for an “ethereal” feeling
- Each particle:
  - Moves very slowly around the orb
  - Has a “breathing” motion in latitude and radius  
  - Pulses in size, giving the impression of living, breathing light
- Only visible in the **merged state**, sitting slightly outside the fusion layer  
  → Result: a calm, sacred-looking halo around the fused orbs.

---

## Partner Orb

If a partner window is detected:

- A second orb is created with its own:
  - Particle system
  - Deforming blob mesh
- The second orb:
  - Mirrors the behavior of the first one
  - Is pulled towards the shared center during the merging process
  - Gradually hides its blob mesh as `mergeAmount` grows, visually supporting the “two become one” narrative

---

## UI / HUD

An overlay in the corner displays:

- Current orb: **💚 GREEN ORB** or **💜 MAGENTA ORB**
- Status:
  - `○ SEARCHING` – no partner window yet
  - `✓ ENTANGLED` – partner detected, bond is active
  - `✦ MERGED` – bond strong enough, fusion & glow layers active
- **Bond:** numeric value (0–100%)
- Additional hints/text depending on state:
  - Encourage moving windows closer together
  - Explain when the orbs have fully merged
- Anonymized short IDs of:
  - `Me` (this window)
  - `Partner` (the other window)

The HUD is styled in a small monospace terminal look and uses colors to reflect connection state (green/cyan/red).

---

## How to Use

1. **Open the app in one browser window**  
   → You’ll see a single searching orb.

2. **Open the same URL in a second window** (or on a second screen)  
   → One orb becomes **green**, the other **magenta**.

3. **Move and overlap the windows**  
   - The more they overlap or approach each other, the higher the bond.
   - Watch the HUD: bond %, status, and merge state.

4. When the bond becomes strong enough:
   - The blobs grow and blend their colors.
   - The **Fusion Particles** layer activates.
   - The **Holy Glow** layer fades in.
   - Status switches to **✦ MERGED** and the UI shows **💫 QUANTUM FUSION**.

---

## Tech Stack

- **React** (functional components, hooks)
- **Three.js** (WebGL renderer, geometry, shaders)
- **Custom GLSL shaders** for:
  - Deforming blob geometry
  - Particle rendering with glow
- **localStorage** for lightweight multi-window communication
- Pure JavaScript math (noise, springs, spherical coordinates) for particle motion

---

## Idea in One Sentence

> Two browser windows become two entangled particles: their positions in your real-world screen space directly drive the behavior of glowing, procedurally animated orbs in WebGL – until they finally collapse into one **merged quantum field**.
