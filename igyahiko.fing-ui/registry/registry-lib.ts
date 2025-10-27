import type { Registry } from "./schema";

export const lib:Registry = [
     {
        name: "utils",
        type: "registry:lib",
        dependencies: ["clsx", "tailwind-merge"],
        files: [
            {
                path: "src/lib/utils.ts",
                type: "registry:lib",
            },
        ],
    },
]