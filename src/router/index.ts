import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useAuth } from "@/stores/auth";

declare module "vue-router" {
  interface RouteMeta {
    /** Requires a signed-in user. */
    auth?: boolean;
    /** Only for signed-out visitors (login/signup); signed-in users go to /app. */
    guestOnly?: boolean;
    /** Allowed before onboarding is finished. */
    preOnboarding?: boolean;
    /** Which bottom/side nav item to highlight. */
    nav?: "home" | "shows" | "log" | "map" | "profile";
    title?: string;
  }
}

const AppShell = () => import("@/layouts/AppShell.vue");

const routes: RouteRecordRaw[] = [
  { path: "/", name: "marketing", component: () => import("@/views/MarketingView.vue"), meta: { title: "Stubstash" } },

  // ---- auth
  { path: "/login", name: "login", component: () => import("@/views/auth/SignInView.vue"), meta: { guestOnly: true, title: "Sign in" } },
  { path: "/signup", name: "signup", component: () => import("@/views/auth/SignUpView.vue"), meta: { guestOnly: true, title: "Create account" } },
  { path: "/forgot", name: "forgot", component: () => import("@/views/auth/ForgotPasswordView.vue"), meta: { guestOnly: true, title: "Reset password" } },
  { path: "/app/auth/callback", name: "auth-callback", component: () => import("@/views/auth/AuthCallbackView.vue"), meta: { preOnboarding: true } },
  { path: "/app/reset-password", name: "reset-password", component: () => import("@/views/auth/ResetPasswordView.vue"), meta: { preOnboarding: true, title: "New password" } },

  // ---- onboarding (full screen, no nav)
  { path: "/app/welcome", name: "onboarding", component: () => import("@/views/app/OnboardingView.vue"), meta: { auth: true, preOnboarding: true, title: "Welcome" } },

  // ---- the app
  {
    path: "/app",
    component: AppShell,
    meta: { auth: true },
    children: [
      { path: "", name: "dashboard", component: () => import("@/views/app/DashboardView.vue"), meta: { nav: "home", title: "Dashboard" } },
      { path: "shows", name: "shows", component: () => import("@/views/app/ShowsView.vue"), meta: { nav: "shows", title: "My shows" } },
      { path: "shows/:id", name: "show", component: () => import("@/views/app/ShowView.vue"), meta: { nav: "shows", title: "Show" }, props: true },
      { path: "shows/:id/edit", name: "show-edit", component: () => import("@/views/app/AddShowView.vue"), meta: { nav: "shows", title: "Edit show" }, props: true },
      { path: "log", name: "log", component: () => import("@/views/app/LogView.vue"), meta: { nav: "log", title: "Log a show" } },
      { path: "log/manual", name: "add-manual", component: () => import("@/views/app/AddShowView.vue"), meta: { nav: "log", title: "Add a show" } },
      { path: "artists/:id", name: "artist", component: () => import("@/views/app/ArtistView.vue"), meta: { nav: "shows", title: "Artist" }, props: true },
      { path: "venues/:id", name: "venue", component: () => import("@/views/app/VenueView.vue"), meta: { nav: "map", title: "Venue" }, props: true },
      { path: "map", name: "map", component: () => import("@/views/app/MapView.vue"), meta: { nav: "map", title: "Map" } },
      { path: "me", name: "me", component: () => import("@/views/app/ProfileView.vue"), meta: { nav: "profile", title: "Profile" } },
      { path: "friends", name: "friends", component: () => import("@/views/app/FriendsView.vue"), meta: { nav: "profile", title: "Friends" } },
      { path: "settings", name: "settings", component: () => import("@/views/app/SettingsView.vue"), meta: { nav: "profile", title: "Settings" } },
    ],
  },

  // ---- public pages (work signed out; use the shell when signed in)
  {
    path: "/u/:handle",
    component: AppShell,
    children: [
      { path: "", name: "profile", component: () => import("@/views/app/ProfileView.vue"), props: true, meta: { nav: "profile", title: "Profile" } },
      { path: "shows/:id", name: "profile-show", component: () => import("@/views/app/ShowView.vue"), props: true, meta: { title: "Show" } },
      { path: "map", name: "profile-map", component: () => import("@/views/app/MapView.vue"), props: true, meta: { title: "Map" } },
    ],
  },
  { path: "/add/:handle", name: "add-friend", component: () => import("@/views/AddFriendView.vue"), props: true, meta: { title: "Add friend" } },
  { path: "/invite/:token", name: "invite", component: () => import("@/views/InviteView.vue"), props: true, meta: { title: "You were there" } },

  { path: "/:pathMatch(.*)*", name: "not-found", component: () => import("@/views/NotFoundView.vue"), meta: { title: "Not found" } },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, _from, saved) {
    if (saved) return saved;
    if (to.hash) return { el: to.hash, behavior: "smooth" };
    return { top: 0 };
  },
});

router.beforeEach(async (to) => {
  const auth = useAuth();
  await auth.init();

  if (to.meta.auth && !auth.signedIn) {
    return { name: "login", query: { next: to.fullPath } };
  }
  if (to.meta.guestOnly && auth.signedIn) {
    return typeof to.query.next === "string" && to.query.next.startsWith("/") ? to.query.next : { name: "dashboard" };
  }
  if (auth.needsOnboarding && to.path.startsWith("/app") && !to.matched.some((r) => r.meta.preOnboarding)) {
    return { name: "onboarding", query: to.name === "dashboard" ? {} : { next: to.fullPath } };
  }
});

router.afterEach((to) => {
  const t = to.meta.title;
  document.title = t && t !== "Stubstash" ? `${t} · Stubstash` : "Stubstash: every show, every song, every mile";
});
