'use client'
import React, { useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import Link from "next/link"
import Image from "next/image"
import { ArrowUpRight, Circle, Github, Linkedin, Twitter, Mail } from "lucide-react"
import { motion, useScroll, useTransform } from "framer-motion"
import { logos } from "../../../../public/assets/images/images"


// Vertex Shader
const vertexShader = `
  varying vec2 vUv;
  varying float vElevation;
  varying float vShadow;

  uniform float uTime;

  // --- Perlin Noise helpers (Ashima Arts) ---
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float perlinNoise3D(vec3 P) {
    vec3 i0 = floor(P);
    vec3 i1 = i0 + vec3(1.0);
    vec3 f0 = fract(P);
    vec3 f1 = f0 - vec3(1.0);
    vec3 f = f0 * f0 * (3.0 - 2.0 * f0);

    vec4 ix = vec4(i0.x, i1.x, i0.x, i1.x);
    vec4 iy = vec4(i0.y, i0.y, i1.y, i1.y);
    vec4 iz0 = vec4(i0.z);
    vec4 iz1 = vec4(i1.z);

    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);

    vec4 gx0 = fract(ixy0 * (1.0 / 41.0)) * 2.0 - 1.0;
    vec4 gy0 = abs(gx0) - 0.5;
    vec4 gz0 = floor(gx0 + 0.5);
    gx0 -= gz0;

    vec4 gx1 = fract(ixy1 * (1.0 / 41.0)) * 2.0 - 1.0;
    vec4 gy1 = abs(gx1) - 0.5;
    vec4 gz1 = floor(gx1 + 0.5);
    gx1 -= gz1;

    vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
    vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
    vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
    vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
    vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
    vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
    vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
    vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

    vec4 norm0 = taylorInvSqrt(vec4(
      dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)
    ));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;

    vec4 norm1 = taylorInvSqrt(vec4(
      dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)
    ));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;

    float n000 = dot(g000, f0);
    float n100 = dot(g100, vec3(f1.x, f0.yz));
    float n010 = dot(g010, vec3(f0.x, f1.y, f0.z));
    float n110 = dot(g110, vec3(f1.xy, f0.z));
    float n001 = dot(g001, vec3(f0.xy, f1.z));
    float n101 = dot(g101, vec3(f1.x, f0.y, f1.z));
    float n011 = dot(g011, vec3(f0.x, f1.yz));
    float n111 = dot(g111, f1);

    vec3 fade_xyz = f * f * (3.0 - 2.0 * f);
    vec4 n_z = mix(
      vec4(n000, n100, n010, n110),
      vec4(n001, n101, n011, n111),
      fade_xyz.z
    );
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);

    return 2.2 * n_xyz;
  }

  void main() {
    vUv = uv;

    float noiseFreq = 5.0;
    float noiseAmp = 0.25;

    vec3 pos = position;
    float n = perlinNoise3D(pos * noiseFreq + uTime * 0.7);
    pos += normal * n * noiseAmp;

    vElevation = pos.y;
    vec3 displacedNormal = normalize(normal + vec3(0.0, n * noiseAmp, 0.0));
    float shadow = clamp(dot(displacedNormal, vec3(0.0, 2.0, 0.0)), 0.0, 1.0);
    vShadow = shadow;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

// Fragment Shader
const fragmentShader = `
  precision mediump float;

  varying vec2 vUv;
  varying float vElevation;
  varying float vShadow;

  uniform float uColorChange;

  void main() {
    // Monochrome palette
    vec4 c1 = vec4(0.9, 0.9, 0.9, 1.0);   // light grey
    vec4 c2 = vec4(0.6, 0.6, 0.6, 1.0);   // medium grey
    vec4 c3 = vec4(0.3, 0.3, 0.3, 1.0);   // dark grey
    vec4 c4 = vec4(0.05, 0.05, 0.05, 1.0); // almost black

    float dist = distance(vUv, vec2(0.5, 0.5));
    float organic = smoothstep(0.0, 0.7, dist);

    float noise = fract(sin(dot(vUv * 100.0, vec2(12.9898,78.233))) * 43758.5453);
    float blendFactor = mix(organic, noise, 0.18);

    vec4 colormixone = mix(c1, c2, blendFactor);
    vec4 colormixtwo = mix(c3, c4, blendFactor);

    vec4 final = mix(colormixone, colormixtwo, uColorChange);

    gl_FragColor = final;
  }
`;


// === Cube Component ===
const Cube = () => {
  const meshRef = useRef<THREE.Mesh>(null!)
  const uniforms = useRef({
    uTime: { value: 0 },
    uColorChange: { value: 0 }
  })

  useFrame((state) => {
    uniforms.current.uTime.value = state.clock.getElapsedTime()
    uniforms.current.uColorChange.value =
      (Math.sin(state.clock.elapsedTime) + 1) / 2
  })

  return (
    <mesh ref={meshRef} rotation={[0.4, 0.6, 0]}>
      <icosahedronGeometry args={[3.2, 40]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms.current}
        side={THREE.DoubleSide}
        /* @ts-expect-error ShareButton component has no typed props for `links` */
        flatShading
        wireframe
      />
    </mesh>
  )
}

// === Footer Component ===
const Footer = () => {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"], // animate as section enters viewport
  })

  // Parallax transform: text moves up into center
  const y = useTransform(scrollYProgress, [0, 1], ["100%", "0%"])
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 1, 1])

  return (
    <section ref={ref} className="py-10 relative overflow-x-clip">
      <div className="container mx-auto flex flex-col items-center gap-y-5">
        <div className="hidden md:block w-full h-[600px] relative">
          <Canvas camera={{ position: [5, 5, 5], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} />
            <Cube />
            <OrbitControls enableZoom={false} />
          </Canvas>

          {/* Parallax Text - centered inside canvas */}
          <motion.div
            style={{ y, opacity }}
            className=" absolute inset-0 flex flex-col items-center justify-center font-medium text-4xl md:text-5xl text-black dark:text-white"
          >
            <p>From intuitive design to powerful features,</p>
            <p>our app has become an essential </p>
            <p>tool for users across India!</p>

            <p className="border border-black dark:border-white px-4 py-1 rounded-2xl mt-2 font-mono text-base text-black dark:text-white">
              <Link href={"/"} className="flex items-center gap-2">
                Let&apos;s Reach us <Circle className="size-4" />
              </Link>
            </p>
          </motion.div>
        </div>

        {/* Footer Links Section - with Product, Resources, Company on right side like fing-ui */}
        <div className="w-full flex flex-col md:flex-row justify-between items-start gap-6 text-sm">
          {/* Left side - Logo and Social Media Icons */}
          <div className="flex flex-col items-start gap-4">
            {/* FingAI Logo and Text */}
            <div className="flex items-center gap-2">
              <Image
                src={logos.logo7}
                alt="FingAI Logo"
                width={40}
                height={40}
                className="object-contain"
              />
              <span className="font-bold text-lg text-black dark:text-white" style={{ fontFamily: "poppins", fontWeight: 800 }}>
                FingAI.
              </span>
            </div>
            
            {/* Social Media Icons */}
            <div className="flex items-center gap-6">
              <a href="#" className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition" title="GitHub">
                <Github className="w-6 h-6" />
              </a>
              <a href="#" className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition" title="Twitter">
                <Twitter className="w-6 h-6" />
              </a>
              <a href="#" className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition" title="LinkedIn">
                <Linkedin className="w-6 h-6" />
              </a>
              <a href="#" className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition" title="Email">
                <Mail className="w-6 h-6" />
              </a>
            </div>
          </div>

          {/* Right side - Product, Resources, Company in columns like fing-ui */}
          <div className="flex flex-wrap justify-end gap-16 text-xs font-mono">
            {/* Product Section */}
            <div className="flex flex-col gap-1 items-start">
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition font-bold">Features</a>
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition">Pricing</a>
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition">Integration</a>
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition">Changelog</a>
            </div>

            {/* Resources Section */}
            <div className="flex flex-col gap-1 items-start">
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition font-bold">Documentation</a>
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition">Tutorials</a>
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition">Blog</a>
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition">Support</a>
            </div>

            {/* Company Section */}
            <div className="flex flex-col gap-1 items-start">
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition font-bold">About</a>
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition">Careers</a>
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition">Contact</a>
              <a href="#" className="text-gray-700 dark:text-gray-400 hover:text-black dark:hover:text-white transition">Partner</a>
            </div>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="w-full border-t border-gray-300 dark:border-gray-700 pt-6 flex flex-col md:flex-row justify-between items-center text-xs text-gray-600 dark:text-gray-400">
          <p>© 2025 Fing. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="#" className="hover:text-black dark:hover:text-white transition">
              Privacy Policy
            </Link>
            <Link href="#" className="hover:text-black dark:hover:text-white transition">
              Terms of Service
            </Link>
            <Link href="#" className="hover:text-black dark:hover:text-white transition">
              Cookie Settings
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Footer
