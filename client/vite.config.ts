// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";
// import { resolve } from "path";

// export default defineConfig({
//   plugins: [react()],
//   server: {
//     port: 3000,
//     proxy: {
//       "/api": {
//         target: "http://localhost:5050",
//         changeOrigin: true,
//         secure: false,
//       },
//     },
//   },
//   build: {
//     outDir: "dist",
//     rollupOptions: {
//       input: {
//         main: resolve(__dirname, 'src/main.tsx')
//       }
//     }
//   }
// });


import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],

  server: {
    host: "localhost",
    port: 5173,

    proxy: {
      "/api": {
        target: "http://localhost:5050",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: "dist",

    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/main.tsx"),
      },
    },
  },
});