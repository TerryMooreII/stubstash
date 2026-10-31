// Session + profile for the signed-in user.
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { appUrl } from "@/lib/url";
import { firstName as firstNameOf } from "@/lib/format";
import { getMyProfile, updateMyProfile } from "@/lib/api";
import { admin } from "@/lib/admin";
import type { Profile } from "@/lib/types";

export const useAuth = defineStore("auth", () => {
  const session = ref<Session | null>(null);
  const profile = ref<Profile | null>(null);
  /** Shows the admin page link. The server checks admin rights on every admin call regardless. */
  const isAdmin = ref(false);
  const ready = ref(false);
  let initPromise: Promise<void> | null = null;

  const userId = computed(() => session.value?.user.id ?? null);
  const signedIn = computed(() => !!session.value);
  const needsOnboarding = computed(() => signedIn.value && !!profile.value && !profile.value.onboarded_at);
  const displayName = computed(() => profile.value?.display_name || profile.value?.handle || "");
  const firstName = computed(() => firstNameOf(displayName.value));

  async function loadProfile() {
    profile.value = session.value ? await getMyProfile() : null;
    isAdmin.value = session.value ? await admin.isAdmin().catch(() => false) : false;
    // Keep the timezone current so morning-after nudges arrive at 10am local.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (profile.value && tz && profile.value.timezone !== tz) {
      profile.value = await updateMyProfile({ timezone: tz }).catch(() => profile.value);
    }
  }

  /** Resolves once the stored session (if any) and profile are loaded. */
  function init(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const { data } = await supabase.auth.getSession();
      session.value = data.session;
      await loadProfile().catch(() => {});
      ready.value = true;
      supabase.auth.onAuthStateChange((event, s) => {
        const changedUser = s?.user.id !== session.value?.user.id;
        session.value = s;
        if (event === "SIGNED_OUT") { profile.value = null; isAdmin.value = false; }
        else if (changedUser || event === "USER_UPDATED") loadProfile().catch(() => {});
      });
    })();
    return initPromise;
  }

  /**
   * After an email link, supabase-js swaps the code in the URL for a session
   * (detectSessionInUrl). Polls until it lands; resolves true if signed in.
   */
  async function waitForSession(tries = 20): Promise<boolean> {
    await init();
    for (let i = 0; i < tries && !session.value; i++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) { session.value = data.session; break; }
      await new Promise((r) => setTimeout(r, 150));
    }
    return !!session.value;
  }

  async function signUp(email: string, password: string, handle?: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: appUrl("/app/auth/callback"),
        data: handle ? { handle } : undefined,
      },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data } = await supabase.auth.getSession();
    session.value = data.session;
    await loadProfile();
  }

  async function sendPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: appUrl("/app/reset-password"),
    });
    if (error) throw error;
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    session.value = null;
    profile.value = null;
    isAdmin.value = false;
  }

  async function saveProfile(patch: Partial<Profile>) {
    profile.value = await updateMyProfile(patch);
    return profile.value;
  }

  return {
    session, profile, isAdmin, ready, userId, signedIn, needsOnboarding, displayName, firstName,
    init, waitForSession, loadProfile, signUp, signIn, sendPasswordReset, updatePassword, signOut, saveProfile,
  };
});
