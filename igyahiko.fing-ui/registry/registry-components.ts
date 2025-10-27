import type { Registry } from "./schema";

export const component: Registry = [
  // =====================
  // AI INPUT COMPONENTS
  // =====================
  {
    name: "ai-input-01",
    type: "registry:component",
    dependencies: ["lucide-react"],
    registryDependencies: ["textarea"],
    files: [
      {
        path: "src/components/FingUIComponents/ai-input/ai-input-01.tsx",
        type: "registry:component",
      },
      {
        path: "src/hooks/use-auto-resizer-textarea.ts",
        type: "registry:hook",
      },
    ],
  },
  {
    name: "ai-input-02",
    type: "registry:component",
    dependencies: ["lucide-react"],
    files: [
      {
        path: "src/components/FingUIComponents/ai-input/ai-input-02.tsx",
        type: "registry:component",
      },
      {
        path: "src/hooks/use-auto-resizer-textarea.ts",
        type: "registry:hook",
      },
    ],
  },
  {
    name: "ai-input-03",
    type: "registry:component",
    files: [
      {
        path: "src/components/FingUIComponents/ai-input/ai-input-03.tsx",
        type: "registry:component",
      },
    ],
  },
  {
    name: "ai-input-04",
    type: "registry:component",
    files: [
      {
        path: "src/components/FingUIComponents/ai-input/ai-input-04.tsx",
        type: "registry:component",
      },
      {
        path: "src/hooks/use-auto-resizer-textarea.ts",
        type: "registry:hook",
      },
    ],
  },
  {
    name: "ai-input-05",
    type: "registry:component",
    files: [
      {
        path: "src/components/FingUIComponents/ai-input/ai-input-05.tsx",
        type: "registry:component",
      },
      {
        path: "src/hooks/use-auto-resizer-textarea.ts",
        type: "registry:hook",
      },
    ],
  },
  {
    name: "ai-input-06",
    type: "registry:component",
    files: [
      {
        path: "src/components/FingUIComponents/ai-input/ai-input-06.tsx",
        type: "registry:component",
      },
      {
        path: "src/hooks/use-auto-resizer-textarea.ts",
        type: "registry:hook",
      },
    ],
  },
  {
    name: "ai-input-07",
    type: "registry:component",
    files: [
      {
        path: "src/components/FingUIComponents/ai-input/ai-input-07.tsx",
        type: "registry:component",
      },
      {
        path: "src/hooks/use-auto-resizer-textarea.ts",
        type: "registry:hook",
      },
    ],
  },

  // =====================
  // BUTTON COMPONENTS
  // =====================
  {
    name: "button-glitch",
    type: "registry:component",
    files: [
      {
        path: "src/components/FingUIComponents/buttons/button-glitch.tsx",
        type: "registry:component",
      },
    ],
  },
  {
    name: "button-morph",
    type: "registry:component",
    files: [
      {
        path: "src/components/FingUIComponents/buttons/button-morph.tsx",
        type: "registry:component",
      },
    ],
  },
  {
    name: "button-neon",
    type: "registry:component",
    files: [
      {
        path: "src/components/FingUIComponents/buttons/button-neon.tsx",
        type: "registry:component",
      },
    ],
  },

  // =====================
  // LANDING COMPONENTS
  // =====================
  {
    name: "footer3d",
    type: "registry:component",
    files: [
      {
        path: "src/components/FingUIComponents/landing/footer3d.tsx",
        type: "registry:component",
      },
    ],
  },
  {
    name: "header-pro-v1",
    type: "registry:component",
    files: [
      {
        path: "src/components/FingUIComponents/landing/header-pro-v1.tsx",
        type: "registry:component",
      },
    ],
  },
  {
    name: "navbar-extended",
    type: "registry:component",
    files: [
      {
        path: "src/components/FingUIComponents/landing/navbar-extended.tsx",
        type: "registry:component",
      },
    ],
  },
];
