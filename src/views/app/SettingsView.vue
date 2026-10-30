<script setup lang="ts">
import { SITE_HOST } from "@/lib/url";
// Account settings: profile, home base, privacy, notifications, setlist.fm,
// install, password and sign out.
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NotificationSettings from "@/components/notifications/NotificationSettings.vue";
import {
  SsAvatar, SsBackLink, SsButton, SsCard, SsField, SsIcon, SsInput, SsPageHeader, SsToggle, type IconName,
} from "@/design-system";
import HomeHistory from "@/components/forms/HomeHistory.vue";
import PlaceSearch from "@/components/forms/PlaceSearch.vue";
import type { PlaceResult } from "@/lib/geocode";
import { removeFile, upload } from "@/lib/media";
import { clearCache } from "@/lib/offline";
import { lastOfflineSave, offlineAutoEnabled, saveForOffline, setOfflineAuto, type SaveProgress } from "@/lib/offlineSave";
import { CONCERT_PHOTO_NAMES, GENERIC_PHOTO_COUNT, concertPhoto, profilePhotoNumber } from "@/lib/heroImage";
import { plural, timeAgo } from "@/lib/format";
import { useLog } from "@/stores/log";
import { exportAttendances } from "@/lib/api";
import { downloadCsv, exportFileName, exportRows, toCsv } from "@/lib/exportCsv";
import { disablePush } from "@/lib/pwa";
import { errorMessage } from "@/lib/supabase";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";

const auth = useAuth();
const ui = useUi();
const log = useLog();
const router = useRouter();
const route = useRoute();

// ---------------------------------------------------------------- sections
// One settings hub: a menu (side on desktop, chips on phones) and one section at a time.
type Section = "profile" | "notifications" | "privacy" | "setlistfm" | "app" | "account";
const sections = computed(() =>
  ([
    { key: "profile", label: "Profile", icon: "user" },
    { key: "notifications", label: "Notifications", icon: "bell" },
    { key: "privacy", label: "Privacy", icon: "lock" },
    { key: "setlistfm", label: "setlist.fm", icon: "refresh" },
    { key: "app", label: "App", icon: "download" },
    { key: "account", label: "Account", icon: "logout" },
  ] as { key: Section; label: string; icon: IconName }[]),
);
const section = computed<Section>(() => {
  const q = route.query.section;
  return sections.value.some((x) => x.key === q) ? (q as Section) : "profile";
});
function goSection(key: Section) {
  router.replace({ query: key === "profile" ? {} : { section: key } });
}

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

// ---------------------------------------------------------------- header photo
const photoNumbers = Array.from({ length: GENERIC_PHOTO_COUNT }, (_, i) => i + 1);
const autoPhoto = computed(() => profilePhotoNumber(auth.userId ?? ""));
const savingPhoto = ref(false);
async function pickHeaderPhoto(n: number | null) {
  if ((auth.profile?.header_photo ?? null) === n) return;
  savingPhoto.value = true;
  try {
    await auth.saveProfile({ header_photo: n });
    ui.flash(n ? "Header photo updated" : "Header photo set to automatic");
  } catch (err) {
    ui.error(errorMessage(err));
  } finally {
    savingPhoto.value = false;
  }
}

// ---------------------------------------------------------------- offline
const offlineAuto = ref(offlineAutoEnabled());
watch(offlineAuto, (v) => setOfflineAuto(v));
const offlineSavedAt = ref(lastOfflineSave());
const saving = ref<SaveProgress | null>(null);
async function saveAllOffline() {
  if (!ui.online) return ui.error("You're offline. Try again with signal.");
  saving.value = { done: 0, total: 1 };
  try {
    await log.load();
    const failed = await saveForOffline(log.entries, { full: true, onProgress: (p) => (saving.value = p) });
    offlineSavedAt.value = lastOfflineSave();
    if (failed) ui.error(`Saved most of it, but ${failed} item${failed > 1 ? "s" : ""} didn't download. Try again later.`);
    else ui.flash(`All ${log.entries.length} shows saved to this device`);
  } finally {
    saving.value = null;
  }
}

// ---------------------------------------------------------------- export
// Every show as CSV, minus photos, stubs and setlists (see lib/exportCsv.ts).
const exporting = ref(false);
async function exportCsv() {
  if (!ui.online) return ui.error("You're offline. Export needs signal.");
  exporting.value = true;
  try {
    const list = await exportAttendances();
    if (!list.length) return ui.flash("No shows to export yet", "info");
    await log.load();
    const numbers = new Map(log.entries.map((e) => [e.attendance_id, e.show_number]));
    downloadCsv(toCsv(exportRows(list, numbers)), exportFileName(auth.profile?.handle ?? ""));
    ui.flash(`Exported ${plural(list.length, "show")}`);
  } catch (err) {
    ui.error(errorMessage(err, "Couldn't export. Try again."));
  } finally {
    exporting.value = false;
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
const savingHome = ref(false);
async function pickPlace(p: PlaceResult) {
  savingHome.value = true;
  try {
    await auth.saveProfile({
      home_city: p.label,
      home_lat: p.lat,
      home_lng: p.lng,
      home_country_code: p.country_code ? p.country_code.toUpperCase() : null,
    });
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

    <div class="hub">
      <nav class="menu" aria-label="Settings sections">
        <button
          v-for="x in sections"
          :key="x.key"
          type="button"
          class="menu__item"
          :class="{ on: section === x.key }"
          :aria-current="section === x.key ? 'page' : undefined"
          @click="goSection(x.key)"
        >
          <SsIcon :name="x.icon" :size="18" />{{ x.label }}
        </button>
      </nav>

      <div class="ss-stack panel">
        <!-- Profile -->
        <template v-if="section === 'profile'">
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

        <SsCard title="Header photo">
          <template #aside>{{ auth.profile?.header_photo ? CONCERT_PHOTO_NAMES[auth.profile.header_photo - 1] : "Automatic" }}</template>
          <p class="note">The photo behind your year in review. Friends see it on your profile too.</p>
          <div class="photo-grid" role="radiogroup" aria-label="Header photo" :aria-busy="savingPhoto">
            <button
              type="button"
              role="radio"
              class="photo-pick"
              :class="{ on: !auth.profile?.header_photo }"
              :aria-checked="!auth.profile?.header_photo"
              @click="pickHeaderPhoto(null)"
            >
              <img :src="concertPhoto(autoPhoto)" alt="" loading="lazy" />
              <span class="photo-pick__label">Auto</span>
            </button>
            <button
              v-for="n in photoNumbers"
              :key="n"
              type="button"
              role="radio"
              class="photo-pick"
              :class="{ on: auth.profile?.header_photo === n }"
              :aria-checked="auth.profile?.header_photo === n"
              :aria-label="CONCERT_PHOTO_NAMES[n - 1]"
              @click="pickHeaderPhoto(n)"
            >
              <img :src="concertPhoto(n)" alt="" loading="lazy" />
            </button>
          </div>
        </SsCard>

        <SsCard title="Home base">
          <template #aside>{{ auth.profile?.home_city ?? "Not set" }}</template>
          <p class="note">We only store the city. It's used for miles traveled and the lines on your map.</p>
          <PlaceSearch placeholder="Search for your city" :busy="savingHome" @pick="pickPlace" />
          <HomeHistory />
        </SsCard>
        </template>

        <!-- Notifications -->
        <SsCard v-else-if="section === 'notifications'" title="Notifications">
          <template #aside><RouterLink to="/app/notifications" class="aside-link">See all →</RouterLink></template>
          <NotificationSettings />
        </SsCard>

        <!-- Privacy -->
        <SsCard v-else-if="section === 'privacy'" title="Privacy">
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

        <!-- setlist.fm -->
        <SsCard v-else-if="section === 'setlistfm'" title="setlist.fm">
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

        <!-- App -->
        <template v-else-if="section === 'app'">
        <SsCard title="The app">
          <template v-if="!ui.isStandalone">
            <p class="note">Install Stubstash to your home screen or dock. It opens like an app, works offline at the venue, and on iPhone it's needed for push alerts.</p>
            <SsButton size="sm" variant="accent-outline" @click="ui.installSheetOpen = true">
              <SsIcon name="download" :size="16" />Install app
            </SsButton>
          </template>
          <p v-else class="note">You're using the installed app. Nice.</p>
        </SsCard>
        <SsCard title="Offline">
          <template #aside>{{ offlineSavedAt ? `Saved ${timeAgo(new Date(offlineSavedAt).toISOString())}` : "" }}</template>
          <p class="note">
            Every page you open is kept on this device, so it still works with no signal. Save everything now to take your whole
            log with you: every show, setlist, artist and venue.
          </p>
          <div class="setting">
            <div class="setting__text">
              <div class="setting__title">Keep new shows saved</div>
              <div class="setting__body">Quietly saves shows that aren't on this device yet when the app opens.</div>
            </div>
            <SsToggle v-model="offlineAuto" plain :label="offlineAuto ? 'On' : 'Off'" />
          </div>
          <div class="offline-save">
            <SsButton size="sm" variant="outline" :loading="!!saving" :disabled="!ui.online" @click="saveAllOffline">
              <SsIcon name="download" :size="16" />Save everything for offline
            </SsButton>
            <span v-if="saving" class="ss-muted offline-save__n">{{ saving.done }} of {{ saving.total }}</span>
          </div>
        </SsCard>
        </template>

        <!-- Admin (admins only) -->
        <!-- Account -->
        <template v-else>
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
        <SsCard title="Your data">
          <p class="note">
            Download your whole log as a spreadsheet (CSV): one row per show with the date, artist, venue, tour, rating,
            seat, price, merch, notes and who you went with. Photos and setlists aren't included.
          </p>
          <SsButton size="sm" variant="outline" :loading="exporting" @click="exportCsv">
            <SsIcon name="download" :size="16" />Export CSV
          </SsButton>
        </SsCard>
        </template>
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
.hub {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.menu {
  position: sticky;
  top: 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 42px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--ss-radius-sm);
  background: transparent;
  color: var(--ss-text-3);
  font-weight: 700;
  font-size: 15px;
  text-align: left;
  white-space: nowrap;
}
.menu__item:hover { color: var(--ss-text); background: rgba(255, 255, 255, 0.03); }
.menu__item.on { background: var(--ss-accent-soft); color: var(--ss-accent); }
.panel { gap: 14px; min-width: 0; max-width: 720px; }
.aside-link { font-size: 14px; font-weight: 700; }
@media (max-width: 760px) {
  .hub { grid-template-columns: minmax(0, 1fr); gap: 14px; }
  /* Phones: sections become a row of chips you can swipe. */
  .menu {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    gap: 6px;
    margin: 0 -16px;
    padding: 0 16px 2px;
    scrollbar-width: none;
  }
  .menu::-webkit-scrollbar { display: none; }
  .menu__item {
    height: 36px;
    padding: 0 14px;
    border-radius: var(--ss-radius-pill);
    border: 1px solid var(--ss-line);
    background: var(--ss-surface-1);
    font-size: 14px;
    flex-shrink: 0;
  }
  .menu__item.on { border-color: var(--ss-accent); }
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
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.photo-pick {
  position: relative;
  aspect-ratio: 4 / 3;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 10px;
  overflow: hidden;
  background: var(--ss-surface-2);
  cursor: pointer;
}
.photo-pick img { width: 100%; height: 100%; object-fit: cover; display: block; }
.photo-pick.on { border-color: var(--ss-accent); }
.photo-pick:focus-visible { outline: 2px solid var(--ss-accent); outline-offset: 2px; }
.photo-pick__label {
  position: absolute;
  inset: auto 0 0;
  padding: 2px 0;
  background: rgba(10, 9, 12, 0.72);
  font-family: var(--ss-font-mono);
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--ss-text);
  text-transform: uppercase;
}
.offline-save { display: flex; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
.offline-save__n { font-size: 13px; font-variant-numeric: tabular-nums; }
</style>
