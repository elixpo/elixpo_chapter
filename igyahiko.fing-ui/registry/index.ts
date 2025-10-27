import { component } from "./registry-components";
import { hooks } from "./registry-hooks";
import { lib } from "./registry-lib";
import type { Registry } from "./schema";

export const registry: Registry = [...component, ...hooks, ...lib]