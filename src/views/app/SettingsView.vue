<script setup lang="ts">
import { SITE_HOST } from "@/lib/url";
// Account settings: profile, home base, privacy, notifications, setlist.fm,
// install, password and sign out.
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  SsAvatar, SsBackLink, SsButton, SsCard, SsField, SsIcon, SsInput, SsPageHeader, SsSpinner, SsToggle,
} from "@/design-system";
import { searchPlaces, type PlaceResult } from "@/lib/geocode";
import { removeFile, upload } from "@/lib/media";
import { clearCache } from "@/lib/offline";
import { disablePush } from "@/lib/pwa";
import { errorMessage } from "@/lib/supabase";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";

const auth = useAuth();
const ui = useUi();
const router = useRouter();

// ---------------------------------------------------------------- profile
const displayName = ref(auth.profile?.display_name ?? "");
const handle = ref(auth.profile?.handle ?? "");
const handleError = ref<string | null>(null);
const savingProfile = ref(false);
watch(
  () => auth.profile,
  (p) => {
    if (!p) return;
    if (!savingProfile.value) {
      displayName.value = p.display_name;
      handle.value = p.handle;
    }
  },
);
const profileDirty = computed(
  () => !!auth.profile && (displayName.value.trim() !== auth.profile.display_name || handle.value.trim() !== auth.profile.handle),
);

async function saveProfile() {
  const h = handle.value.trim().replace(/^@/, "");
  handleError.value = null;
  if (!/^[A-Za-z0-9_]{3,24}$/.test(h)) {
    handleError.value = "3 to 24 letters, numbers or underscores.";
    return;
  }
  savingProfile.value = true;
  try {
    await auth.saveProfile({ display_name: displayName.value.trim().slice(0, 60), handle: h });
    ui.flash("Profile saved");
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "23505") handleError.value = "That handle is taken. Try another.";
    else if (e.code === "23514") handleError.value = "3 to 24 letters, numbers or underscores.";
    else ui.error(errorMessage(err));
  } finally {
    savingProfile.value = false;
  }
}

// ---------------------------------------------------------------- avatar
const avatarInput = ref<HTMLInputElement>();
const uploadingAvatar = ref(false);
async function onAvatar(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) return ui.error("Pick an image file.");
  uploadingAvatar.value = true;
  const old = auth.profile?.avatar_path;
  try {
    const path = await upload("avatars", file, "avatar", { maxEdge: 512 });
    await auth.saveProfile({ avatar_path: path });
    if (old) removeFile("avatars", old).catch(() => {});
    ui.flash("Looking good");
  } catch (err) {
    ui.error(errorMessage(err, "Couldn't upload that photo."));
  } finally {
    uploadingAvatar.value = false;
  }
}
async function removeAvatar() {
  const old = auth.profile?.avatar_path;
  if (!old) return;
  try {
    await auth.saveProfile({ avatar_path: null });
    removeFile("avatars", old).catch(() => {});
  } catch (err) {
    ui.error(errorMessage(err));
  }
}

// ---------------------------------------------------------------- home base
const cityQ = ref("");
const places = ref<PlaceResult[]>([]);
const searchingCity = ref(false);
const savingHome = ref(false);
let cityTimer: ReturnType<typeof setTimeout> | undefined;
let citySeq = 0;
watch(cityQ, (v) => {
  clearTimeout(cityTimer);
  if (v.trim().length < 2) {
    places.value = [];
    return;
  }
  cityTimer = setTimeout(async () => {
    const my = ++citySeq;
    searchingCity.value = true;
    try {
      const r = await searchPlaces(v.trim());
      if (my === citySeq) places.value = r;
    } catch {
      if (my === citySeq) places.value = [];
    } finally {
      if (my === citySeq) searchingCity.value = false;
    }
  }, 500);
});
async function pickPlace(p: PlaceResult) {
  savingHome.value = true;
  try {
    await auth.saveProfile({
      home_city: p.label,
      home_lat: p.lat,
      home_lng: p.lng,
      home_country_code: p.country_code ? p.country_code.toUpperCase() : null,
    });
    cityQ.value = "";
    places.value = [];
    ui.flash(`Home base set to ${p.label}`);
  } catch (err) {
    ui.error(errorMessage(err));
  } finally {
    savingHome.value = false;
  }
}

// ---------------------------------------------------------------- privacy
const isPublic = computed({
  get: () => !!auth.profile?.is_public,
  set: async (v: boolean) => {
    try {
      await auth.saveProfile({ is_public: v });
      ui.flash(v ? "Your profile is public" : "Your profile is private", "info");
    } catch (err) {
      ui.error(errorMessage(err));
    }
  },
});

// ---------------------------------------------------------------- account
const email = computed(() => auth.session?.user.email ?? "");
const newPassword = ref("");
const confirmPassword = ref("");
const passwordError = ref<string | null>(null);
const savingPassword = ref(false);
async function changePassword() {
  passwordError.value = null;
  if (newPassword.value.length < 8 || !/[A-Za-z]/.test(newPassword.value) || !/\d/.test(newPassword.value)) {
    passwordError.value = "Use at least 8 characters with letters and numbers.";
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = "Those don't match.";
    return;
  }
  savingPassword.value = true;
  try {
    await auth.updatePassword(newPassword.value);
    newPassword.value = confirmPassword.value = "";
    ui.flash("Password updated");
  } catch (err) {
    passwordError.value = errorMessage(err);
  } finally {
    savingPassword.value = false;
  }
}

const signingOut = ref(false);
async function signOut() {
  signingOut.value = true;
  try {
    await disablePush().catch(() => {});
    await auth.signOut();
    await clearCache();
    router.push("/");
  } finally {
    signingOut.value = false;
  }
}
</script>

<template>
  <div class="ss-page settings">
    <SsBackLink to="/app/me" label="Profile" />
    <SsPageHeader kicker="Settings" title="Your account" />

    <div class="cols">
      <div class="ss-stack col">
        <!-- Profile -->
        <SsCard title="Profile">
          <div class="avatar-row">
            <SsAvatar :name="auth.displayName" :path="auth.profile?.avatar_path" me :size="72" />
            <div class="avatar-row__actions">
              <SsButton size="sm" variant="outline" :loading="uploadingAvatar" @click="avatarInput?.click()">
                <SsIcon name="camera" :size="16" />{{ auth.profile?.avatar_path ? "Change photo" : "Add a photo" }}
              </SsButton>
              <SsButton v-if="auth.profile?.avatar_path" size="sm" variant="ghost" @click="removeAvatar">Remove</SsButton>
              <input ref="avatarInput" type="file" accept="image/*" hidden @change="onAvatar" />
            </div>
          </div>
          <form class="ss-stack form" @submit.prevent="saveProfile">
            <SsField label="Name">
              <SsInput v-model="displayName" placeholder="What friends call you" :maxlength="60" autocomplete="name" />
            </SsField>
            <SsField label="Handle" :error="handleError" :hint="`Your profile lives at ${SITE_HOST}/u/your-handle`">
              <SsInput v-model="handle" prefix="@" :maxlength="24" autocomplete="username" :invalid="!!handleError" />
            </SsField>
            <SsButton type="submit" :disabled="!profileDirty" :loading="savingProfile" class="save">Save profile</SsButton>
          </form>
        </SsCard>

        <!-- Home base -->
        <SsCard title="Home base">
          <template #aside>{{ auth.profile?.home_city ?? "Not set" }}</template>
          <p class="note">We only store the city. It's used for miles traveled and the lines on your map.</p>
          <SsInput
            v-model="cityQ"
            icon="search"
            placeholder="Search for your city"
            clearable
            autocomplete="off"
            class="city-input"
          >
            <template #end><SsSpinner v-if="searchingCity || savingHome" :size="16" /></template>
          </SsInput>
          <ul v-if="places.length" class="places">
            <li v-for="p in places" :key="`${p.lat},${p.lng}`">
              <button type="button" class="place" @click="pickPlace(p)">
                <SsIcon name="pin" :size="16" />{{ p.label }}
              </button>
            </li>
          </ul>
        </SsCard>

        <!-- Privacy -->
        <SsCard title="Privacy">
          <div class="setting">
            <div class="setting__text">
              <div class="setting__title">Public profile</div>
              <div class="setting__body">
                On: anyone with your link can see your shows, stats and map, and people who were at the same shows can find
                you. Off: only friends can.
              </div>
            </div>
            <SsToggle v-model="isPublic" plain :label="isPublic ? 'On' : 'Off'" />
          </div>
        </SsCard>
      </div>

      <div class="ss-stack col">
        <!-- Notifications -->
        <SsCard title="Notifications">
          <p class="note">Friend requests, friends' shows, badges and the morning-after nudge: in the app and as push alerts.</p>
          <SsButton to="/app/me#notifications" variant="outline" size="sm" class="test-btn">
            <SsIcon name="bell" :size="16" />Manage notifications
          </SsButton>
        </SsCard>

        <!-- setlist.fm -->
        <SsCard title="setlist.fm">
          <p class="note">
            <template v-if="auth.profile?.setlistfm_username">
              Linked to <b>setlist.fm/user/{{ auth.profile.setlistfm_username }}</b>. Importing again only adds shows you
              don't have yet.
            </template>
            <template v-else>Pull in every show you've marked "I was there" on setlist.fm. Read-only, we never write back.</template>
          </p>
          <SsButton size="sm" variant="outline" to="/app/welcome">
            <SsIcon name="refresh" :size="16" />{{ auth.profile?.setlistfm_username ? "Import again" : "Import from setlist.fm" }}
          </SsButton>
        </SsCard>

        <!-- Install -->
        <SsCard v-if="!ui.isStandalone" title="Get the app">
          <p class="note">Install Stubstash to your home screen or dock. It works offline at the venue.</p>
          <SsButton size="sm" variant="accent-outline" @click="ui.installSheetOpen = true">
            <SsIcon name="download" :size="16" />Install app
          </SsButton>
        </SsCard>

        <!-- Admin (admins only) -->
        <SsCard v-if="auth.isAdmin" title="Admin">
          <p class="ss-muted">Users, catalog cleanup and system health.</p>
          <SsButton to="/app/admin" variant="outline" size="sm"><SsIcon name="lock" :size="16" />Open admin</SsButton>
        </SsCard>

        <!-- Account -->
        <SsCard title="Account">
          <div class="email">
            <span class="ss-muted">Signed in as</span> <b class="email__addr">{{ email }}</b>
          </div>
          <form class="ss-stack form" @submit.prevent="changePassword">
            <SsField label="New password" :error="passwordError">
              <SsInput v-model="newPassword" type="password" autocomplete="new-password" :invalid="!!passwordError" />
            </SsField>
            <SsField label="Confirm new password">
              <SsInput v-model="confirmPassword" type="password" autocomplete="new-password" />
            </SsField>
            <SsButton type="submit" variant="outline" size="sm" :loading="savingPassword" :disabled="!newPassword" class="save">
              Change password
            </SsButton>
          </form>
          <SsButton variant="danger" size="sm" :loading="signingOut" class="signout" @click="signOut">
            <SsIcon name="logout" :size="16" />Sign out
          </SsButton>
        </SsCard>
      </div>
    </div>

    <footer class="credits">
      Setlist data from <a href="https://www.setlist.fm" target="_blank" rel="noopener">setlist.fm</a>. Artist and venue
      images from fanart.tv, TheAudioDB and Wikimedia Commons. Venue locations from OpenStreetMap contributors.
      Stubstash isn't affiliated with setlist.fm.
    </footer>
  </div>
</template>

<style scoped>
.cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
  gap: 14px;
  align-items: start;
}
.col {
  gap: 14px;
  min-width: 0;
}
.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.avatar-row__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.form {
  gap: 14px;
}
.save {
  align-self: flex-start;
}
.note {
  font-size: 14px;
  color: var(--ss-text-muted);
  line-height: 1.45;
  margin-bottom: 12px;
}
.note b {
  color: var(--ss-text);
  overflow-wrap: anywhere;
}
.places {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.place {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 6px;
  border: 0;
  border-top: 1px solid var(--ss-line-soft);
  background: transparent;
  color: var(--ss-text);
  font-weight: 600;
  text-align: left;
}
.place:hover {
  color: var(--ss-accent);
}
.setting {
  display: flex;
  align-items: center;
  gap: 16px;
}
.setting__text {
  flex: 1;
  min-width: 0;
}
.setting__title {
  font-weight: 700;
}
.setting__body {
  font-size: 14px;
  color: var(--ss-text-muted);
  line-height: 1.4;
  margin-top: 2px;
}
.test-btn {
  margin-top: 14px;
}
.email {
  margin-bottom: 14px;
  overflow-wrap: anywhere;
}
.signout {
  margin-top: 18px;
}
.credits {
  font-size: 13px;
  color: var(--ss-text-faint);
  line-height: 1.5;
  max-width: 640px;
}
</style>
