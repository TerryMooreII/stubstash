import { createApp } from "vue";
import { createPinia } from "pinia";
import "leaflet/dist/leaflet.css";
import "@/design-system/styles/tokens.css";
import "@/design-system/styles/base.css";
import "@/design-system/styles/utilities.css";
import App from "./App.vue";
import { router } from "./router";
import { registerServiceWorker } from "./lib/pwa";

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");

registerServiceWorker();
