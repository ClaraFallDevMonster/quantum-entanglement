import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// Simple WindowManager using localStorage
class WindowManager {
  constructor() {
    this.windows = [];
    this.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    this.isGreen = null;
    this.onUpdate = null;
  }

  init() {
    // Load existing windows, clean stale ones
    const stored = localStorage.getItem('quantum_windows');
    this.windows = stored ? JSON.parse(stored) : [];
    this.windows = this.windows.filter(w => Date.now() - w.t < 2000);
    
    // First window is green, second is magenta
    this.isGreen = !this.windows.some(w => w.g);
    
    // Add ourselves
    this.windows.push({
      id: this.id,
      g: this.isGreen,
      x: window.screenX,
      y: window.screenY,
      w: window.innerWidth,
      h: window.innerHeight,
      t: Date.now()
    });
    this.save();
    
    // Listen for other windows
    window.addEventListener('storage', (e) => {
      if (e.key === 'quantum_windows' && e.newValue) {
        this.windows = JSON.parse(e.newValue);
        if (this.onUpdate) this.onUpdate();
      }
    });
    
    // Cleanup on close
    window.addEventListener('beforeunload', () => {
      this.windows = this.windows.filter(w => w.id !== this.id);
      this.save();
    });
    
    return { isGreen: this.isGreen, id: this.id };
  }
  
  update() {
    // Update our position
    const me = this.windows.find(w => w.id === this.id);
    if (me) {
      me.x = window.screenX;
      me.y = window.screenY;
      me.w = window.innerWidth;
      me.h = window.innerHeight;
      me.t = Date.now();
    }
    
    // Clean stale windows
    this.windows = this.windows.filter(w => w.id === this.id || Date.now() - w.t < 2000);
    this.save();
  }
  
  save() {
    localStorage.setItem('quantum_windows', JSON.stringify(this.windows));
  }
  
  getOther() {
    return this.windows.find(w => w.id !== this.id && Date.now() - w.t < 2000);
  }
  
  getMe() {
    return this.windows.find(w => w.id === this.id);
  }
}

// Vertex Shader for particles
const vertexShader = `
  attribute float size;
  attribute vec3 customColor;
  varying vec3 vColor;
  varying float vDistance;
  
  void main() {
    vColor = customColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDistance = length(mvPosition.xyz);
    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment Shader for particles with glow
const fragmentShader = `
  varying vec3 vColor;
  varying float vDistance;
  
  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
    alpha = pow(alpha, 0.5);
    gl_FragColor = vec4(vColor * 1.2, alpha * 0.8);
  }
`;

// Special glow fragment shader - softer, more ethereal for holy particles
const glowFragmentShader = `
  varying vec3 vColor;
  varying float vDistance;
  
  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) discard;
    
    // Very soft falloff for holy glow
    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
    alpha = pow(alpha, 0.25); // Extra soft glow
    
    // Bright core
    float core = 1.0 - smoothstep(0.0, 0.15, dist);
    vec3 finalColor = vColor * 1.3 + vec3(core * 0.4);
    
    gl_FragColor = vec4(finalColor, alpha * 0.7);
  }
`;

// Smooth, wavy vertex shader with large organic deformations
const blobVertexShader = `
  uniform float uTime;
  uniform float uPairStrength;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vFresnel;
  
  vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      
    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  
  void main() {
    float baseTime = uTime * 0.8;
    
    float wave1 = snoise(normal * 0.6 + vec3(baseTime * 0.5, baseTime * 0.4, baseTime * 0.45)) * 1.0;
    float wave2 = snoise(normal * 0.9 + vec3(-baseTime * 0.6, baseTime * 0.55, -baseTime * 0.5) + 30.0) * 0.6;
    float wave3 = snoise(normal * 1.3 + vec3(baseTime * 0.7, -baseTime * 0.6, baseTime * 0.65) + 60.0) * 0.35;
    
    float displacement = wave1 + wave2 + wave3;
    displacement = smoothstep(-2.0, 2.0, displacement) * 4.0 - 2.0;
    
    float activity = 1.0 + uPairStrength * 0.3;
    displacement *= activity;
    
    vec3 newPosition = position + normal * displacement * 15.0;
    
    float eps = 0.05;
    vec3 tangent = normalize(cross(normal, vec3(0.0, 1.0, 0.0)));
    if(length(tangent) < 0.001) tangent = normalize(cross(normal, vec3(1.0, 0.0, 0.0)));
    vec3 bitangent = normalize(cross(normal, tangent));
    
    vec3 n1 = normalize(normal + tangent * eps);
    vec3 n2 = normalize(normal + bitangent * eps);
    
    float d1 = snoise(n1 * 0.6 + vec3(baseTime * 0.5, baseTime * 0.4, baseTime * 0.45)) * 1.0 +
               snoise(n1 * 0.9 + vec3(-baseTime * 0.6, baseTime * 0.55, -baseTime * 0.5) + 30.0) * 0.6 +
               snoise(n1 * 1.3 + vec3(baseTime * 0.7, -baseTime * 0.6, baseTime * 0.65) + 60.0) * 0.35;
               
    float d2 = snoise(n2 * 0.6 + vec3(baseTime * 0.5, baseTime * 0.4, baseTime * 0.45)) * 1.0 +
               snoise(n2 * 0.9 + vec3(-baseTime * 0.6, baseTime * 0.55, -baseTime * 0.5) + 30.0) * 0.6 +
               snoise(n2 * 1.3 + vec3(baseTime * 0.7, -baseTime * 0.6, baseTime * 0.65) + 60.0) * 0.35;
    
    d1 = smoothstep(-2.0, 2.0, d1) * 4.0 - 2.0;
    d2 = smoothstep(-2.0, 2.0, d2) * 4.0 - 2.0;
    
    vec3 pos1 = position + n1 * d1 * 15.0 * activity;
    vec3 pos2 = position + n2 * d2 * 15.0 * activity;
    
    vec3 newNormal = normalize(cross(pos2 - newPosition, pos1 - newPosition));
    vNormal = normalize(normalMatrix * newNormal);
    
    vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
    vViewPosition = -mvPosition.xyz;
    
    vec3 viewDir = normalize(-mvPosition.xyz);
    vFresnel = 1.0 - max(0.0, dot(vNormal, viewDir));
    
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Transparent membrane with glowing edges
const blobFragmentShader = `
  uniform float uTime;
  uniform vec3 uColorGlow;
  uniform float uPairStrength;
  
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vFresnel;
  
  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = 1.0 - abs(dot(vNormal, viewDir));
    
    float edgeGlow = pow(fresnel, 1.5);
    float rim = pow(fresnel, 2.5);
    
    vec3 coreColor = uColorGlow * 0.05;
    vec3 edgeColor = uColorGlow;
    
    vec3 finalColor = coreColor + edgeColor * edgeGlow * 0.8 + edgeColor * rim * 1.2;
    finalColor *= (1.0 + uPairStrength * 0.3);
    
    float alpha = 0.08 + edgeGlow * 0.5 + rim * 0.3;
    
    float pulse = sin(uTime * 2.5) * 0.1 + 1.0;
    finalColor *= pulse;
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

const QuantumEntanglementWebGL = () => {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const [info, setInfo] = useState({ isGreen: true, id: '', partnerId: null, bond: 0, merged: false });
  
  useEffect(() => {
    if (!containerRef.current || rendererRef.current) return;
    
    // Initialize window manager
    const wm = new WindowManager();
    const { isGreen, id } = wm.init();
    
    setInfo(prev => ({ ...prev, isGreen, id }));
    
    // Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.z = 250;
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // World container - offset by window position
    const world = new THREE.Object3D();
    scene.add(world);
    
    // Colors
    const greenGlow = new THREE.Color(0.3, 1.0, 0.5);
    const magentaGlow = new THREE.Color(1.0, 0.3, 0.6);
    
    // ========== OUR ORB ==========
    const ourOrb = new THREE.Object3D();
    world.add(ourOrb);
    
    // Main particles - 8000
    const PARTICLE_COUNT = 8000;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.cbrt(Math.random()) * 60;
      
      positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = r * Math.cos(phi);
      
      if (isGreen) {
        colors[i3] = 0.2; colors[i3+1] = 0.9; colors[i3+2] = 0.4;
      } else {
        colors[i3] = 0.95; colors[i3+1] = 0.2; colors[i3+2] = 0.6;
      }
      sizes[i] = Math.random() * 4 + 2;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    const particles = new THREE.Points(geometry, material);
    ourOrb.add(particles);
    
    // Accent particles - 1500
    const ACCENT_COUNT = 1500;
    const accentPositions = new Float32Array(ACCENT_COUNT * 3);
    const accentVelocities = new Float32Array(ACCENT_COUNT * 3);
    const accentColors = new Float32Array(ACCENT_COUNT * 3);
    const accentSizes = new Float32Array(ACCENT_COUNT);
    
    for (let i = 0; i < ACCENT_COUNT; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.cbrt(Math.random()) * 55;
      
      accentPositions[i3] = r * Math.sin(phi) * Math.cos(theta);
      accentPositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      accentPositions[i3 + 2] = r * Math.cos(phi);
      
      // Opposite color
      if (isGreen) {
        accentColors[i3] = 0.85; accentColors[i3+1] = 0.15; accentColors[i3+2] = 0.5;
      } else {
        accentColors[i3] = 0.15; accentColors[i3+1] = 0.8; accentColors[i3+2] = 0.35;
      }
      accentSizes[i] = Math.random() * 2.5 + 1.5;
    }
    
    const accentGeometry = new THREE.BufferGeometry();
    accentGeometry.setAttribute('position', new THREE.BufferAttribute(accentPositions, 3));
    accentGeometry.setAttribute('customColor', new THREE.BufferAttribute(accentColors, 3));
    accentGeometry.setAttribute('size', new THREE.BufferAttribute(accentSizes, 1));
    
    const accentMaterial = new THREE.ShaderMaterial({
      vertexShader, fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    const accentParticles = new THREE.Points(accentGeometry, accentMaterial);
    ourOrb.add(accentParticles);
    
    // Blob - IcosahedronGeometry(45, 64) like original
    const blobGeometry = new THREE.IcosahedronGeometry(45, 64);
    const blobMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColorGlow: { value: isGreen ? greenGlow : magentaGlow },
        uPairStrength: { value: 0 }
      },
      vertexShader: blobVertexShader,
      fragmentShader: blobFragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    
    const blob = new THREE.Mesh(blobGeometry, blobMaterial);
    ourOrb.add(blob);
    
    // ========== FUSION PARTICLES (Layer 1 - colorful, orbiting) ==========
    const FUSION_COUNT = 1500;
    const fusionGeometry = new THREE.BufferGeometry();
    const fusionPositions = new Float32Array(FUSION_COUNT * 3);
    const fusionColors = new Float32Array(FUSION_COUNT * 3);
    const fusionSizes = new Float32Array(FUSION_COUNT);
    const fusionAngles = new Float32Array(FUSION_COUNT);
    const fusionSpeeds = new Float32Array(FUSION_COUNT);
    const fusionRadii = new Float32Array(FUSION_COUNT);
    const fusionPhis = new Float32Array(FUSION_COUNT);
    
    for (let i = 0; i < FUSION_COUNT; i++) {
      const i3 = i * 3;
      
      fusionAngles[i] = Math.random() * Math.PI * 2;
      fusionSpeeds[i] = 0.02 + Math.random() * 0.03;
      fusionRadii[i] = 55 + Math.random() * 30;
      fusionPhis[i] = Math.random() * Math.PI;
      
      const r = fusionRadii[i];
      const theta = fusionAngles[i];
      const phi = fusionPhis[i];
      fusionPositions[i3] = r * Math.sin(phi) * Math.cos(theta);
      fusionPositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      fusionPositions[i3 + 2] = r * Math.cos(phi);
      
      const colorType = Math.random();
      if (colorType < 0.4) {
        fusionColors[i3] = 1.0;
        fusionColors[i3 + 1] = 1.0;
        fusionColors[i3 + 2] = 1.0;
      } else if (colorType < 0.6) {
        fusionColors[i3] = 1.0;
        fusionColors[i3 + 1] = 0.85;
        fusionColors[i3 + 2] = 0.4;
      } else if (colorType < 0.8) {
        fusionColors[i3] = 0.5;
        fusionColors[i3 + 1] = 1.0;
        fusionColors[i3 + 2] = 1.0;
      } else {
        fusionColors[i3] = 1.0;
        fusionColors[i3 + 1] = 0.6;
        fusionColors[i3 + 2] = 0.85;
      }
      
      fusionSizes[i] = Math.random() * 5 + 3;
    }
    
    fusionGeometry.setAttribute('position', new THREE.BufferAttribute(fusionPositions, 3));
    fusionGeometry.setAttribute('customColor', new THREE.BufferAttribute(fusionColors, 3));
    fusionGeometry.setAttribute('size', new THREE.BufferAttribute(fusionSizes, 1));
    
    const fusionMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    const fusionParticles = new THREE.Points(fusionGeometry, fusionMaterial);
    fusionParticles.visible = false;
    ourOrb.add(fusionParticles);
    
    // ========== HOLY GLOW PARTICLES (Layer 2 - pure white, ethereal, slow) ==========
    const GLOW_COUNT = 600;
    const glowGeometry = new THREE.BufferGeometry();
    const glowPositions = new Float32Array(GLOW_COUNT * 3);
    const glowColors = new Float32Array(GLOW_COUNT * 3);
    const glowSizes = new Float32Array(GLOW_COUNT);
    const glowAngles = new Float32Array(GLOW_COUNT);
    const glowSpeeds = new Float32Array(GLOW_COUNT);
    const glowRadii = new Float32Array(GLOW_COUNT);
    const glowPhis = new Float32Array(GLOW_COUNT);
    const glowPhases = new Float32Array(GLOW_COUNT);
    
    for (let i = 0; i < GLOW_COUNT; i++) {
      const i3 = i * 3;
      
      // Slower, closer orbits - more intimate, sacred
      glowAngles[i] = Math.random() * Math.PI * 2;
      glowSpeeds[i] = 0.003 + Math.random() * 0.007; // Very slow
      glowRadii[i] = 50 + Math.random() * 40; // Close to orb
      glowPhis[i] = Math.random() * Math.PI;
      glowPhases[i] = Math.random() * Math.PI * 2;
      
      const r = glowRadii[i];
      const theta = glowAngles[i];
      const phi = glowPhis[i];
      glowPositions[i3] = r * Math.sin(phi) * Math.cos(theta);
      glowPositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      glowPositions[i3 + 2] = r * Math.cos(phi);
      
      // Pure white - holy light
      glowColors[i3] = 1.0;
      glowColors[i3 + 1] = 1.0;
      glowColors[i3 + 2] = 1.0;
      
      glowSizes[i] = Math.random() * 10 + 6; // Larger, softer
    }
    
    glowGeometry.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    glowGeometry.setAttribute('customColor', new THREE.BufferAttribute(glowColors, 3));
    glowGeometry.setAttribute('size', new THREE.BufferAttribute(glowSizes, 1));
    
    const glowMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: glowFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    const glowParticles = new THREE.Points(glowGeometry, glowMaterial);
    glowParticles.visible = false;
    ourOrb.add(glowParticles);
    
    // ========== OTHER ORB (partner) ==========
    let otherOrb = null;
    let otherPositions = null;
    let otherVelocities = null;
    let otherGeometry = null;
    let otherBlob = null;
    let otherBlobMaterial = null;
    
    const createOtherOrb = (otherIsGreen) => {
      otherOrb = new THREE.Object3D();
      world.add(otherOrb);
      
      const count = 6000;
      otherPositions = new Float32Array(count * 3);
      otherVelocities = new Float32Array(count * 3);
      const otherColors = new Float32Array(count * 3);
      const otherSizes = new Float32Array(count);
      
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.cbrt(Math.random()) * 60;
        
        otherPositions[i3] = r * Math.sin(phi) * Math.cos(theta);
        otherPositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        otherPositions[i3 + 2] = r * Math.cos(phi);
        
        if (otherIsGreen) {
          otherColors[i3] = 0.2; otherColors[i3+1] = 0.9; otherColors[i3+2] = 0.4;
        } else {
          otherColors[i3] = 0.95; otherColors[i3+1] = 0.2; otherColors[i3+2] = 0.6;
        }
        otherSizes[i] = Math.random() * 4 + 2;
      }
      
      otherGeometry = new THREE.BufferGeometry();
      otherGeometry.setAttribute('position', new THREE.BufferAttribute(otherPositions, 3));
      otherGeometry.setAttribute('customColor', new THREE.BufferAttribute(otherColors, 3));
      otherGeometry.setAttribute('size', new THREE.BufferAttribute(otherSizes, 1));
      
      const otherMaterial = new THREE.ShaderMaterial({
        vertexShader, fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      
      const otherParticles = new THREE.Points(otherGeometry, otherMaterial);
      otherOrb.add(otherParticles);
      
      const otherBlobGeo = new THREE.IcosahedronGeometry(45, 64);
      otherBlobMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColorGlow: { value: otherIsGreen ? greenGlow.clone() : magentaGlow.clone() },
          uPairStrength: { value: 0 }
        },
        vertexShader: blobVertexShader,
        fragmentShader: blobFragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      
      otherBlob = new THREE.Mesh(otherBlobGeo, otherBlobMaterial);
      otherOrb.add(otherBlob);
    };
    
    // Animation state
    let time = 0;
    const worldOffset = new THREE.Vector3();
    const worldOffsetTarget = new THREE.Vector3();
    let pairStrength = 0;
    let smoothPairStrength = 0;
    
    const ourWorldPos = new THREE.Vector3();
    const otherWorldPos = new THREE.Vector3();
    const ourTargetPos = new THREE.Vector3();
    const otherTargetPos = new THREE.Vector3();
    
    let mergeAmount = 0;
    const mergeCenter = new THREE.Vector3();
    
    const updateWM = () => { wm.update(); };
    const wmInterval = setInterval(updateWM, 50);
    
    // Animation
    const animate = () => {
      time += 0.016;
      
      const me = wm.getMe();
      const other = wm.getOther();
      
      setInfo(prev => ({
        ...prev,
        partnerId: other?.id || null,
        bond: Math.round(smoothPairStrength * 100),
        merged: mergeAmount > 0.5
      }));
      
      if (me) {
        ourTargetPos.set(me.x + me.w / 2, -(me.y + me.h / 2), 0);
        worldOffsetTarget.set(-me.x - me.w / 2, me.y + me.h / 2, 0);
      }
      
      if (other) {
        if (!otherOrb) createOtherOrb(other.g);
        
        otherTargetPos.set(other.x + other.w / 2, -(other.y + other.h / 2), 0);
        
        const dx = otherTargetPos.x - ourTargetPos.x;
        const dy = otherTargetPos.y - ourTargetPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const overlapX = Math.max(0, Math.min(me.x + me.w, other.x + other.w) - Math.max(me.x, other.x));
        const overlapY = Math.max(0, Math.min(me.y + me.h, other.y + other.h) - Math.max(me.y, other.y));
        
        if (overlapX > 0 && overlapY > 0) {
          const overlapArea = overlapX * overlapY;
          const windowArea = me.w * me.h;
          pairStrength = 0.5 + Math.min(overlapArea / windowArea, 0.5);
        } else {
          pairStrength = Math.max(0, 1 - dist / 600) * 0.5;
        }
      } else {
        pairStrength = 0;
        if (otherOrb) {
          world.remove(otherOrb);
          otherOrb = null;
        }
      }
      
      smoothPairStrength += (pairStrength - smoothPairStrength) * 0.08;
      
      const targetMerge = smoothPairStrength > 0.5 ? Math.min((smoothPairStrength - 0.5) / 0.35, 1) : 0;
      mergeAmount += (targetMerge - mergeAmount) * 0.06;
      
      worldOffset.lerp(worldOffsetTarget, 0.1);
      world.position.copy(worldOffset);
      
      ourWorldPos.lerp(ourTargetPos, 0.12);
      
      if (other) {
        mergeCenter.copy(ourWorldPos).add(otherWorldPos).multiplyScalar(0.5);
      } else {
        mergeCenter.copy(ourWorldPos);
      }
      
      if (other && smoothPairStrength > 0.05) {
        const toOther = new THREE.Vector3().subVectors(otherTargetPos, ourWorldPos);
        const toUs = new THREE.Vector3().subVectors(ourTargetPos, otherWorldPos);
        const attractionStrength = smoothPairStrength * 0.35;
        
        if (mergeAmount > 0.1) {
          const toCenter1 = new THREE.Vector3().subVectors(mergeCenter, ourWorldPos);
          const toCenter2 = new THREE.Vector3().subVectors(mergeCenter, otherWorldPos);
          
          ourWorldPos.add(toOther.normalize().multiplyScalar(attractionStrength * 30 * (1 - mergeAmount)));
          ourWorldPos.add(toCenter1.multiplyScalar(mergeAmount * 0.15));
          
          otherWorldPos.lerp(otherTargetPos, 0.12);
          otherWorldPos.add(toUs.normalize().multiplyScalar(attractionStrength * 30 * (1 - mergeAmount)));
          otherWorldPos.add(toCenter2.multiplyScalar(mergeAmount * 0.15));
        } else {
          ourWorldPos.add(toOther.normalize().multiplyScalar(attractionStrength * 30));
          otherWorldPos.lerp(otherTargetPos, 0.12);
          otherWorldPos.add(toUs.normalize().multiplyScalar(attractionStrength * 30));
        }
      } else if (other) {
        otherWorldPos.lerp(otherTargetPos, 0.12);
      }
      
      ourOrb.position.copy(ourWorldPos);
      if (otherOrb) {
        otherOrb.position.copy(otherWorldPos);
        if (otherBlob) {
          otherBlob.visible = mergeAmount < 0.8;
          otherBlob.scale.setScalar(1 - mergeAmount * 0.5);
        }
      }
      
      const mergedScale = 1 + mergeAmount * 0.4;
      blob.scale.setScalar(mergedScale);
      
      if (mergeAmount > 0.1) {
        const blendedColor = new THREE.Color();
        const green = new THREE.Color(0.3, 1.0, 0.5);
        const magenta = new THREE.Color(1.0, 0.3, 0.6);
        
        if (isGreen) {
          blendedColor.copy(green).lerp(magenta, mergeAmount * 0.5);
        } else {
          blendedColor.copy(magenta).lerp(green, mergeAmount * 0.5);
        }
        blobMaterial.uniforms.uColorGlow.value = blendedColor;
      } else {
        blobMaterial.uniforms.uColorGlow.value = isGreen ? greenGlow : magentaGlow;
      }
      
      let toOtherDir = new THREE.Vector3(0, 0, 0);
      let distToOther = 0;
      
      if (other) {
        const diff = new THREE.Vector3().subVectors(otherWorldPos, ourWorldPos);
        distToOther = diff.length();
        if (distToOther > 1) toOtherDir = diff.normalize();
      }
      
      // ========== UPDATE OUR PARTICLES ==========
      const pos = geometry.attributes.position.array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        const x = pos[i3], y = pos[i3+1], z = pos[i3+2];
        const dist = Math.sqrt(x*x + y*y + z*z);
        
        velocities[i3] += Math.sin(y * 0.02 + time) * 0.3;
        velocities[i3+1] += Math.cos(x * 0.02 + time) * 0.3;
        velocities[i3+2] += Math.sin(z * 0.02 + time) * 0.3;
        
        const targetR = 50 + smoothPairStrength * 20 + mergeAmount * 25;
        const spring = (dist - targetR) * 0.002;
        if (dist > 0.1) {
          velocities[i3] -= (x/dist) * spring;
          velocities[i3+1] -= (y/dist) * spring;
          velocities[i3+2] -= (z/dist) * spring;
        }
        
        if (distToOther > 1 && distToOther < 400 && smoothPairStrength > 0.05) {
          const particleDir = dist > 0.1 ? new THREE.Vector3(x/dist, y/dist, z/dist) : new THREE.Vector3(0,0,0);
          const facing = Math.max(0, particleDir.dot(toOtherDir));
          const bandForce = smoothPairStrength * 0.03 * (0.3 + facing * 0.7);
          const stretch = facing * smoothPairStrength * 2;
          
          velocities[i3] += toOtherDir.x * bandForce * (1 + stretch * 3);
          velocities[i3+1] += toOtherDir.y * bandForce * (1 + stretch * 3);
        }
        
        if (mergeAmount > 0.2) {
          const orbitStrength = mergeAmount * 0.15;
          velocities[i3] += -y * orbitStrength * 0.02;
          velocities[i3+1] += x * orbitStrength * 0.02;
        }
        
        velocities[i3] *= 0.96;
        velocities[i3+1] *= 0.96;
        velocities[i3+2] *= 0.96;
        
        pos[i3] += velocities[i3];
        pos[i3+1] += velocities[i3+1];
        pos[i3+2] += velocities[i3+2];
      }
      geometry.attributes.position.needsUpdate = true;
      
      // ========== UPDATE ACCENT PARTICLES ==========
      const aPos = accentGeometry.attributes.position.array;
      for (let i = 0; i < ACCENT_COUNT; i++) {
        const i3 = i * 3;
        const x = aPos[i3], y = aPos[i3+1], z = aPos[i3+2];
        const dist = Math.sqrt(x*x + y*y + z*z);
        
        accentVelocities[i3] += Math.sin(y * 0.018 + time * 1.1) * 0.25;
        accentVelocities[i3+1] += Math.cos(x * 0.018 + time * 1.1) * 0.25;
        accentVelocities[i3+2] += Math.sin(z * 0.018 + time * 1.1) * 0.25;
        
        const targetR = 45 + smoothPairStrength * 15 + mergeAmount * 20;
        const spring = (dist - targetR) * 0.0018;
        if (dist > 0.1) {
          accentVelocities[i3] -= (x/dist) * spring;
          accentVelocities[i3+1] -= (y/dist) * spring;
          accentVelocities[i3+2] -= (z/dist) * spring;
        }
        
        if (distToOther > 1 && distToOther < 400 && smoothPairStrength > 0.05) {
          const particleDir = dist > 0.1 ? new THREE.Vector3(x/dist, y/dist, z/dist) : new THREE.Vector3(0,0,0);
          const facing = Math.max(0, particleDir.dot(toOtherDir));
          const bandForce = smoothPairStrength * 0.05 * (0.2 + facing * 0.8);
          const stretch = facing * smoothPairStrength * 3;
          
          accentVelocities[i3] += toOtherDir.x * bandForce * (1 + stretch * 4);
          accentVelocities[i3+1] += toOtherDir.y * bandForce * (1 + stretch * 4);
        }
        
        if (mergeAmount > 0.2) {
          const orbitStrength = mergeAmount * 0.18;
          accentVelocities[i3] += -y * orbitStrength * 0.025;
          accentVelocities[i3+1] += x * orbitStrength * 0.025;
        }
        
        accentVelocities[i3] *= 0.955;
        accentVelocities[i3+1] *= 0.955;
        accentVelocities[i3+2] *= 0.955;
        
        aPos[i3] += accentVelocities[i3];
        aPos[i3+1] += accentVelocities[i3+1];
        aPos[i3+2] += accentVelocities[i3+2];
      }
      accentGeometry.attributes.position.needsUpdate = true;
      
      // ========== UPDATE OTHER ORB PARTICLES ==========
      if (otherOrb && otherPositions && otherGeometry) {
        const toUsDir = toOtherDir.clone().negate();
        const offsetToOur = new THREE.Vector3().subVectors(ourWorldPos, otherWorldPos);
        
        for (let i = 0; i < 6000; i++) {
          const i3 = i * 3;
          const x = otherPositions[i3], y = otherPositions[i3+1], z = otherPositions[i3+2];
          const dist = Math.sqrt(x*x + y*y + z*z);
          
          otherVelocities[i3] += Math.sin(y * 0.02 + time + 2) * 0.3;
          otherVelocities[i3+1] += Math.cos(x * 0.02 + time + 2) * 0.3;
          otherVelocities[i3+2] += Math.sin(z * 0.02 + time + 2) * 0.3;
          
          if (mergeAmount > 0.5) {
            const pullStrength = (mergeAmount - 0.5) * 0.04;
            otherVelocities[i3] += offsetToOur.x * pullStrength;
            otherVelocities[i3+1] += offsetToOur.y * pullStrength;
          }
          
          const targetR = 50 + smoothPairStrength * 20 + mergeAmount * 25;
          const spring = (dist - targetR) * 0.002;
          if (dist > 0.1) {
            otherVelocities[i3] -= (x/dist) * spring;
            otherVelocities[i3+1] -= (y/dist) * spring;
            otherVelocities[i3+2] -= (z/dist) * spring;
          }
          
          if (distToOther > 1 && distToOther < 400 && smoothPairStrength > 0.05) {
            const particleDir = dist > 0.1 ? new THREE.Vector3(x/dist, y/dist, z/dist) : new THREE.Vector3(0,0,0);
            const facing = Math.max(0, particleDir.dot(toUsDir));
            const bandForce = smoothPairStrength * 0.03 * (0.3 + facing * 0.7);
            const stretch = facing * smoothPairStrength * 2;
            
            otherVelocities[i3] += toUsDir.x * bandForce * (1 + stretch * 3);
            otherVelocities[i3+1] += toUsDir.y * bandForce * (1 + stretch * 3);
          }
          
          if (mergeAmount > 0.2) {
            const orbitStrength = mergeAmount * 0.15;
            otherVelocities[i3] += y * orbitStrength * 0.02;
            otherVelocities[i3+1] += -x * orbitStrength * 0.02;
          }
          
          otherVelocities[i3] *= 0.96;
          otherVelocities[i3+1] *= 0.96;
          otherVelocities[i3+2] *= 0.96;
          
          otherPositions[i3] += otherVelocities[i3];
          otherPositions[i3+1] += otherVelocities[i3+1];
          otherPositions[i3+2] += otherVelocities[i3+2];
        }
        otherGeometry.attributes.position.needsUpdate = true;
        
        if (otherBlob) {
          otherBlob.rotation.y += 0.008;
          otherBlob.rotation.x = Math.sin(time * 0.4 + 1) * 0.25;
        }
        if (otherBlobMaterial) {
          otherBlobMaterial.uniforms.uTime.value = time;
          otherBlobMaterial.uniforms.uPairStrength.value = smoothPairStrength;
        }
      }
      
      // ========== UPDATE FUSION PARTICLES (Layer 1) ==========
      const isMerged = mergeAmount > 0.3;
      fusionParticles.visible = isMerged;
      
      if (isMerged) {
        const fPos = fusionGeometry.attributes.position.array;
        const fSizes = fusionGeometry.attributes.size.array;
        
        for (let i = 0; i < FUSION_COUNT; i++) {
          const i3 = i * 3;
          
          fusionAngles[i] += fusionSpeeds[i];
          
          const wobble = Math.sin(time * 2 + i * 0.1) * 0.1;
          const phi = fusionPhis[i] + wobble;
          const theta = fusionAngles[i];
          const r = fusionRadii[i] + Math.sin(time * 3 + i) * 5;
          
          fPos[i3] = r * Math.sin(phi) * Math.cos(theta);
          fPos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
          fPos[i3 + 2] = r * Math.cos(phi);
          
          const pulse = Math.sin(time * 4 + i * 0.3) * 0.3 + 0.7;
          fSizes[i] = (3 + Math.random() * 3) * pulse * mergeAmount;
        }
        
        fusionGeometry.attributes.position.needsUpdate = true;
        fusionGeometry.attributes.size.needsUpdate = true;
      }
      
      // ========== UPDATE HOLY GLOW PARTICLES (Layer 2) ==========
      glowParticles.visible = isMerged;
      
      if (isMerged) {
        const gPos = glowGeometry.attributes.position.array;
        const gSizes = glowGeometry.attributes.size.array;
        
        for (let i = 0; i < GLOW_COUNT; i++) {
          const i3 = i * 3;
          
          // Very slow rotation
          glowAngles[i] += glowSpeeds[i];
          
          // Gentle breathing motion
          const breathe = Math.sin(time * 0.8 + glowPhases[i]) * 0.15;
          const phi = glowPhis[i] + breathe;
          const theta = glowAngles[i];
          
          // Radius pulses gently
          const radiusPulse = Math.sin(time * 0.5 + glowPhases[i] * 2) * 8;
          const r = glowRadii[i] + radiusPulse;
          
          gPos[i3] = r * Math.sin(phi) * Math.cos(theta);
          gPos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
          gPos[i3 + 2] = r * Math.cos(phi);
          
          // Slow, gentle size pulsing - like breathing light
          const sizePulse = Math.sin(time * 1.5 + glowPhases[i]) * 0.4 + 0.6;
          gSizes[i] = (6 + Math.sin(i * 0.7) * 4) * sizePulse * mergeAmount;
        }
        
        glowGeometry.attributes.position.needsUpdate = true;
        glowGeometry.attributes.size.needsUpdate = true;
      }
      
      // Update our blob
      blob.rotation.y += 0.008;
      blob.rotation.x = Math.sin(time * 0.4) * 0.25;
      blob.rotation.z = Math.cos(time * 0.35) * 0.2;
      
      blobMaterial.uniforms.uTime.value = time;
      blobMaterial.uniforms.uPairStrength.value = smoothPairStrength;
      
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    
    animate();
    
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearInterval(wmInterval);
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);
  
  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', position: 'relative', background: '#000' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        color: info.partnerId ? (info.bond > 50 ? '#0ff' : '#0f0') : '#f00',
        fontFamily: 'monospace',
        fontSize: '12px',
        background: 'rgba(0,0,0,0.85)',
        padding: '12px',
        borderRadius: '6px',
        zIndex: 10,
        border: `1px solid ${info.partnerId ? (info.bond > 50 ? 'rgba(0,255,255,0.3)' : 'rgba(0,255,0,0.3)') : 'rgba(255,0,0,0.3)'}`
      }}>
        <div style={{ marginBottom: '4px' }}>
          {info.isGreen ? '💚' : '💜'} {info.isGreen ? 'GREEN' : 'MAGENTA'} ORB
        </div>
        <div>Status: {info.merged ? '✦ MERGED' : (info.partnerId ? '✓ ENTANGLED' : '○ SEARCHING')}</div>
        <div>Bond: {info.bond}%</div>
        {info.merged && (
          <div style={{ color: '#fff', marginTop: '4px', textShadow: '0 0 10px #0ff, 0 0 20px #f0f' }}>💫 QUANTUM FUSION</div>
        )}
        {!info.merged && info.bond > 70 && (
          <div style={{ color: '#0ff', marginTop: '4px' }}>⚡ QUANTUM LINK STRONG</div>
        )}
        <div style={{ marginTop: '8px', fontSize: '10px', color: '#666' }}>
          {info.merged
            ? 'Orbs have become one!'
            : (info.partnerId 
              ? (info.bond > 30 
                ? 'Move windows closer to strengthen bond' 
                : 'Bring windows together to merge')
              : 'Open in another window to pair')}
        </div>
        <div style={{ marginTop: '8px', fontSize: '9px', color: '#555', borderTop: '1px solid #333', paddingTop: '8px' }}>
          <div>Me: {info.id.slice(0, 12)}</div>
          <div>Partner: {info.partnerId ? info.partnerId.slice(0, 12) : 'none'}</div>
        </div>
      </div>
    </div>
  );
};

export default QuantumEntanglementWebGL;