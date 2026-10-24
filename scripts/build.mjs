import { build } from "vite";
import { cp, mkdir } from "node:fs/promises";
await build();
await mkdir("dist/data", { recursive: true });
await cp("data", "dist/data", { recursive: true });
