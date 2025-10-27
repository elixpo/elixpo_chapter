import type { Registry } from "./schema";

export const hooks: Registry = [
  {
    name: "use-auto-resizer-textarea",
    type: "registry:hook",
    files: [
      {
        path: "src/hooks/use-auto-resizer-textarea.ts",
        type: "registry:hook",
      },
    ],
  },
  {
    name: "use-click-outside",
    type: "registry:hook",
    files: [
      {
        path: "src/hooks/use-click-outside.ts",
        type: "registry:hook",
      },
    ],
  },
  {
    name: "use-current-theme",
    type: "registry:hook",
    files: [
      {
        path: "src/hooks/use-current-theme.ts",
        type: "registry:hook",
      },
    ],
  },
  {
    name: "use-file-input",
    type: "registry:hook",
    files: [
      {
        path: "src/hooks/use-file-input.ts",
        type: "registry:hook",
      },
    ],
  },
  {
    name: "use-mobile",
    type: "registry:hook",
    files: [
      {
        path: "src/hooks/use-mobile.ts",
        type: "registry:hook",
      },
    ],
  },
];
