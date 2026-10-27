<script setup lang="ts">
// Two modes:
//   /app/log/manual        add a show that isn't on setlist.fm (lives in Stubstash only)
//   /app/shows/:id/edit    edit your night (and, for shows you added, the show itself)
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  SsBackLink, SsButton, SsCard, SsEmpty, SsField, SsInput, SsPageHeader, SsSheet, SsSkeleton, SsStars, SsTextarea, SsToggle,
} from "@/design-system";
import AutocompleteInput, { type AutocompleteOption } from "@/components/forms/AutocompleteInput.vue";
import SetlistEditor from "@/components/forms/SetlistEditor.vue";
import CompanionPicker, { type Companion } from "@/components/forms/CompanionPicker.vue";
import PhotoPicker, { type SavedPhoto } from "@/components/forms/PhotoPicker.vue";
import {
  createManualShow, deleteAttendance, getAttendance, searchCatalogArtists, searchCatalogVenues, setCompanions,
  showSetlist, social, updateAttendance, updateManualShow, type ManualShowInput,
} from "@/lib/api";
import { addShowPhoto, deleteShowPhoto, removeFile, signedUrl, signedUrls, upload } from "@/lib/media";
import { errorMessage } from "@/lib/supabase";
import { longDate, parseMoney, place, todayIso } from "@/lib/format";
import { cleanSets, emptySets, fromSetlist } from "@/lib/setlist";
import type { AttendanceDetail, SetDraft } from "@/lib/types";
import { useAuth } from "@/stores/auth";
import { useLog } from "@/stores/log";
import { useUi } from "@/stores/ui";

const props = defineProps<{ id?: string }>();
const route = useRoute();
const router = useRouter();
const auth = useAuth();
const log = useLog();
const ui = useUi();

const isEdit = computed(() => !!props.id);
const loading = ref(isEdit.value);
const loadError = ref<string | null>(null);
const saving = ref(false);
const detail = ref<AttendanceDetail | null>(null);

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];

const form = reactive({
  artist_name: typeof route.query.artist === "string" ? route.query.artist.slice(0, 200) : "",
  artist_id: null as string | null,
  event_date: "",
  city: "",
  venue_name: "",
  venue_id: null as string | null,
  state_code: "",
  country_code: "",
  tour_name: "",
  is_festival: false,
  sets: emptySets() as SetDraft[],
  rating: null as number | null,
  companions: [] as Companion[],
  seat: "",
  price: "",
  currency: "USD",
  merch: "",
  notes: "",
});

// Media
const newPhotos = ref<File[]>([]);
const newStub = ref<File | null>(null);
const savedPhotos = ref<SavedPhoto[]>([]);
const savedStubUrl = ref<string | null>(null);
const stubRemoved = ref(false);

// Snapshot of loaded values, to send only what changed when editing.
let original: { companions: string; sets: string; artist: string; venue: string; city: string; date: string; tour: string; fest: boolean } | null = null;

/** Edit mode: can the show itself (artist/venue/date/setlist) be changed? */
const canEditShow = computed(() => {
  if (!isEdit.value) return true;
  const s = detail.value?.show;
  return !!s && s.source === "manual" && s.created_by === auth.userId;
});

// ----- artist / venue autocomplete
async function artistOptions(q: string): Promise<AutocompleteOption[]> {
  const rows = await searchCatalogArtists(q);
  return rows.map((a) => ({ id: a.id, label: a.name, tag: a.source === "setlistfm" ? "SETLIST.FM" : "YOURS" }));
}
const venueRows = new Map<string, { city: string | null; state_code: string | null; country_code: string | null }>();
async function venueOptions(q: string): Promise<AutocompleteOption[]> {
  const rows = await searchCatalogVenues(q);
  rows.forEach((v) => venueRows.set(v.id, v));
  return rows.map((v) => ({ id: v.id, label: v.name, sub: place(v.city, v.state_code, v.country_code) }));
}
let pickedArtist = "";
let pickedVenue = "";
function onArtistPick(o: AutocompleteOption) {
  form.artist_id = o.id;
  pickedArtist = o.label;
}
function onVenuePick(o: AutocompleteOption) {
  form.venue_id = o.id;
  pickedVenue = o.label;
  const v = venueRows.get(o.id);
  if (v) {
    form.city = v.city ?? "";
    form.state_code = v.state_code ?? "";
    form.country_code = v.country_code ?? "";
  }
}
// Typing over a picked suggestion makes it free text again.
const artistId = computed(() => (form.artist_name === pickedArtist ? form.artist_id : null));
const venueId = computed(() => (form.venue_name === pickedVenue ? form.venue_id : null));

// ----- validation
const futureDate = computed(() => !!form.event_date && form.event_date > todayIso());
const valid = computed(() => !!form.artist_name.trim() && !!form.event_date && !!form.venue_name.trim() && !futureDate.value);
const priceCents = computed(() => (form.price.trim() ? parseMoney(form.price) : null));
const priceInvalid = computed(() => !!form.price.trim() && priceCents.value == null);
const saveLabel = computed(() => {
  if (isEdit.value) return "Save changes";
  if (futureDate.value) return "That date hasn't happened yet";
  return valid.value ? "Save to my shows" : "Artist, date & venue to save";
});

// ----- load (edit mode)
onMounted(async () => {
  if (!isEdit.value) return;
  try {
    const d = await getAttendance(props.id!);
    if (!d) throw new Error("We couldn't find that show.");
    if (d.user_id !== auth.userId) {
      router.replace(`/app/shows/${props.id}`);
      return;
    }
    detail.value = d;
    const s = d.show;
    form.artist_name = s.artist.name;
    form.venue_name = s.venue.name;
    form.city = s.venue.city ?? "";
    form.event_date = s.event_date;
    form.tour_name = s.tour_name ?? "";
    form.is_festival = d.is_festival ?? s.is_festival;
    form.rating = d.rating;
    form.seat = d.seat ?? "";
    form.price = d.price_cents != null ? (d.price_cents / 100).toFixed(2) : "";
    form.currency = d.currency || "USD";
    form.merch = d.merch ?? "";
    form.notes = d.notes ?? "";
    form.companions = d.companions.map((c) => ({ name: c.name, user_id: c.companion_user_id }));
    const rows = await showSetlist(d.id);
    form.sets = fromSetlist(rows);

    const urls = await signedUrls("photos", d.photos.map((p) => p.storage_path));
    savedPhotos.value = d.photos.map((p) => ({ id: p.id, storage_path: p.storage_path, url: urls[p.storage_path] ?? null }));
    if (d.stub_path) savedStubUrl.value = await signedUrl("stubs", d.stub_path);

    original = {
      companions: JSON.stringify(form.companions),
      sets: JSON.stringify(cleanSets(form.sets)),
      artist: form.artist_name, venue: form.venue_name, city: form.city, date: form.event_date, tour: form.tour_name,
      fest: s.is_festival,
    };
  } catch (e) {
    loadError.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
});

// ----- invites for companions who aren't on Stubstash
const invites = ref<{ name: string; url: string }[]>([]);
const inviteOpen = ref(false);
let afterInvites = "";

async function saveCompanions(attendanceId: string, previousNames: string[]) {
  const rows = await setCompanions(attendanceId, form.companions);
  const fresh = rows.filter((r) => !r.companion_user_id && !previousNames.includes(r.name));
  for (const r of fresh) {
    try {
      const { token } = await social.createInvite(attendanceId, r.id);
      invites.value.push({ name: r.name, url: `${location.origin}/invite/${token}` });
    } catch {
      /* invites are a bonus; don't block saving */
    }
  }
}

async function uploadMedia(attendanceId: string) {
  let failed = 0;
  for (const f of newPhotos.value) {
    try { await addShowPhoto(attendanceId, f); } catch { failed++; }
  }
  newPhotos.value = [];
  const oldStub = detail.value?.stub_path ?? null;
  if (newStub.value) {
    try {
      const path = await upload("stubs", newStub.value, attendanceId);
      await updateAttendance(attendanceId, { stub_path: path });
      if (oldStub) await removeFile("stubs", oldStub).catch(() => {});
    } catch { failed++; }
  } else if (stubRemoved.value && oldStub) {
    await updateAttendance(attendanceId, { stub_path: null });
    await removeFile("stubs", oldStub).catch(() => {});
  }
  if (failed) ui.error(`${failed} photo${failed > 1 ? "s" : ""} didn't upload. Try adding them again.`);
}

function finish(path: string) {
  if (invites.value.length) {
    afterInvites = path;
    inviteOpen.value = true;
  } else router.push(path);
}

async function save() {
  if (saving.value) return;
  if (!isEdit.value && !valid.value) {
    ui.error(futureDate.value ? "That show hasn't happened yet." : "Need artist, date and venue");
    return;
  }
  if (priceInvalid.value) {
    ui.error("That price doesn't look right.");
    return;
  }
  saving.value = true;
  try {
    if (!isEdit.value) {
      const input: ManualShowInput = {
        artist_id: artistId.value,
        artist_name: form.artist_name.trim(),
        venue_id: venueId.value,
        venue_name: form.venue_name.trim(),
        city: form.city.trim(),
        state_code: form.state_code || undefined,
        country_code: form.country_code || undefined,
        event_date: form.event_date,
        tour_name: form.tour_name.trim(),
        is_festival: form.is_festival,
        sets: cleanSets(form.sets),
        rating: form.rating,
        seat: form.seat.trim() || null,
        price_cents: priceCents.value,
        currency: form.currency,
        merch: form.merch.trim() || null,
        notes: form.notes.trim() || null,
      };
      const attendanceId = await createManualShow(input);
      if (form.companions.length) await saveCompanions(attendanceId, []);
      await uploadMedia(attendanceId);
      await log.refresh();
      const n = log.entries.find((e) => e.attendance_id === attendanceId)?.show_number;
      ui.flash(n ? `Saved! Show #${n} is in the books` : "Saved!");
      finish(`/app/shows/${attendanceId}`);
      return;
    }

    // ---- edit
    const d = detail.value!;
    if (canEditShow.value && original) {
      const patch: Partial<ManualShowInput> = {};
      if (form.artist_name.trim() && form.artist_name !== original.artist) patch.artist_name = form.artist_name.trim();
      if (form.venue_name.trim() && form.venue_name !== original.venue) patch.venue_name = form.venue_name.trim();
      if (form.city !== original.city) patch.city = form.city.trim();
      if (form.event_date && form.event_date !== original.date) patch.event_date = form.event_date;
      if (form.tour_name !== original.tour) patch.tour_name = form.tour_name.trim();
      if (form.is_festival !== original.fest) patch.is_festival = form.is_festival;
      const sets = cleanSets(form.sets);
      if (JSON.stringify(sets) !== original.sets) patch.sets = sets;
      if (Object.keys(patch).length) await updateManualShow(d.show.id, patch);
    }
    await updateAttendance(d.id, {
      rating: form.rating,
      seat: form.seat.trim() || null,
      price_cents: priceCents.value,
      currency: form.currency,
      merch: form.merch.trim() || null,
      notes: form.notes.trim() || null,
      // For setlist.fm shows the festival switch is your own override.
      ...(canEditShow.value ? {} : { is_festival: form.is_festival === d.show.is_festival ? null : form.is_festival }),
    });
    if (original && JSON.stringify(form.companions) !== original.companions) {
      await saveCompanions(d.id, d.companions.map((c) => c.name));
    }
    await uploadMedia(d.id);
    await log.refresh();
    ui.flash("Saved");
    finish(`/app/shows/${d.id}`);
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    saving.value = false;
  }
}

async function deleteSaved(p: SavedPhoto) {
  try {
    await deleteShowPhoto(p.id, p.storage_path);
    savedPhotos.value = savedPhotos.value.filter((x) => x.id !== p.id);
  } catch (e) {
    ui.error(errorMessage(e));
  }
}

// ----- remove from log
const confirmDelete = ref(false);
const deleting = ref(false);
async function removeFromLog() {
  deleting.value = true;
  try {
    await deleteAttendance(props.id!);
    await log.refresh();
    confirmDelete.value = false;
    ui.flash("Removed from your log");
    router.push("/app/shows");
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    deleting.value = false;
  }
}

// ----- invite sheet
const canShare = typeof navigator !== "undefined" && "share" in navigator;
async function copyInvite(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    ui.flash("Invite link copied");
  } catch {
    ui.error("Couldn't copy. Press and hold the link to copy it.");
  }
}
async function shareInvite(i: { name: string; url: string }) {
  try {
    await navigator.share({ title: "You were there", text: `${i.name}, I logged our show on Stubstash. It's already in your log if you join:`, url: i.url });
  } catch {
    /* cancelled */
  }
}
function closeInvites() {
  inviteOpen.value = false;
  if (afterInvites) router.push(afterInvites);
}
const inviteTitle = computed(() =>
  invites.value.length === 1 ? `Send ${invites.value[0]!.name} the invite link` : "Send your crew their invite links",
);
</script>

<template>
  <div class="ss-page">
    <SsBackLink v-if="isEdit" :to="`/app/shows/${id}`" label="Back to the show" />
    <SsBackLink v-else to="/app/log" label="Back to search" />

    <SsPageHeader
      v-if="isEdit"
      kicker="Edit show"
      :title="detail ? detail.show.artist.name : 'Edit show'"
    />
    <SsPageHeader v-else kicker="Add a show · Stubstash only" kicker-tone="teal" title="You were there. Prove it." />

    <div v-if="loading" class="ss-stack"><SsSkeleton v-for="i in 3" :key="i" height="160px" radius="var(--ss-radius-lg)" /></div>

    <SsEmpty v-else-if="loadError" title="Can't edit this one" :body="loadError">
      <SsButton to="/app/shows" size="sm" variant="outline">My shows</SsButton>
    </SsEmpty>

    <form v-else class="ss-grid layout" novalidate @submit.prevent="save">
      <div class="ss-stack col">
        <!-- The show -->
        <SsCard>
          <div class="ss-stack">
            <h2 class="ss-h3">The show</h2>

            <template v-if="canEditShow">
              <SsField label="Artist" required>
                <AutocompleteInput
                  v-if="!isEdit"
                  v-model="form.artist_name"
                  :search="artistOptions"
                  placeholder="Who played?"
                  @select="onArtistPick"
                />
                <SsInput v-else v-model="form.artist_name" placeholder="Who played?" :maxlength="200" />
              </SsField>
              <div class="pair">
                <SsField label="Date" required :error="futureDate ? 'That date hasn\'t happened yet' : null">
                  <SsInput v-model="form.event_date" type="date" :invalid="futureDate" />
                </SsField>
                <SsField label="City">
                  <SsInput v-model="form.city" placeholder="Brooklyn, NY" :maxlength="120" />
                </SsField>
              </div>
              <SsField label="Venue" required>
                <AutocompleteInput
                  v-if="!isEdit"
                  v-model="form.venue_name"
                  :search="venueOptions"
                  placeholder="Where?"
                  @select="onVenuePick"
                />
                <SsInput v-else v-model="form.venue_name" placeholder="Where?" :maxlength="200" />
              </SsField>
              <SsField label="Tour or event">
                <SsInput v-model="form.tour_name" placeholder="Optional" :maxlength="200" />
              </SsField>
            </template>

            <template v-else-if="detail">
              <div class="readonly">
                <div class="readonly__artist">{{ detail.show.artist.name }}</div>
                <div>{{ longDate(detail.show.event_date) }} · {{ detail.show.venue.name }}<template v-if="detail.show.venue.city"> · {{ place(detail.show.venue.city, detail.show.venue.state_code, detail.show.venue.country_code) }}</template></div>
                <div v-if="detail.show.tour_name" class="ss-muted">{{ detail.show.tour_name }}</div>
              </div>
              <p class="note">Show details come from setlist.fm. Spot a mistake? Fix it there and it updates here.</p>
            </template>

            <SsToggle v-model="form.is_festival" plain label="It was a festival" />
          </div>
        </SsCard>

        <!-- Setlist -->
        <SsCard v-if="canEditShow">
          <SetlistEditor v-model="form.sets" />
        </SsCard>
      </div>

      <div class="ss-stack col">
        <!-- Your night -->
        <SsCard>
          <div class="ss-stack night">
            <h2 class="ss-h3">Your night</h2>
            <div class="rating">
              <span class="label">Rating</span>
              <SsStars v-model="form.rating" editable />
            </div>
            <CompanionPicker v-model="form.companions" />
            <div class="trio">
              <SsField label="Seat / section">
                <SsInput v-model="form.seat" placeholder="GA" :maxlength="80" />
              </SsField>
              <SsField label="Ticket price" :error="priceInvalid ? 'Numbers only' : null">
                <div class="price">
                  <SsInput v-model="form.price" placeholder="0.00" inputmode="decimal" :invalid="priceInvalid" />
                  <select v-model="form.currency" class="currency" aria-label="Currency">
                    <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
                  </select>
                </div>
              </SsField>
              <SsField label="Merch">
                <SsInput v-model="form.merch" placeholder="Tee?" :maxlength="200" />
              </SsField>
            </div>
          </div>
        </SsCard>

        <!-- Memories -->
        <SsCard>
          <div class="ss-stack">
            <h2 class="ss-h3">Memories</h2>
            <PhotoPicker
              v-model:photos="newPhotos"
              v-model:stub="newStub"
              :saved="savedPhotos"
              :saved-stub-url="savedStubUrl"
              :stub-removed="stubRemoved"
              @delete-saved="deleteSaved"
              @remove-stub="stubRemoved = true"
            />
            <SsTextarea v-model="form.notes" placeholder="What made this one special?" :rows="3" :maxlength="4000" />
          </div>
        </SsCard>

        <SsButton
          type="submit"
          size="lg"
          block
          :loading="saving"
          :disabled="!isEdit && !valid"
        >
          {{ saveLabel }}
        </SsButton>
        <SsButton v-if="isEdit" variant="danger" block @click="confirmDelete = true">Remove from my log</SsButton>
      </div>
    </form>

    <SsSheet v-model="confirmDelete" label="Remove this show">
      <div class="sheet-title">Remove this show from your log?</div>
      <p class="ss-muted">Your rating, notes, photos and stub for this night go with it. This can't be undone.</p>
      <div class="sheet-actions">
        <SsButton variant="outline" @click="confirmDelete = false">Keep it</SsButton>
        <SsButton variant="danger" :loading="deleting" @click="removeFromLog">Remove</SsButton>
      </div>
    </SsSheet>

    <SsSheet v-model="inviteOpen" :label="inviteTitle" :dismissable="false">
      <div class="sheet-title">{{ inviteTitle }}</div>
      <p class="ss-muted">When they join, this show is already in their log and you're friends.</p>
      <div v-for="i in invites" :key="i.url" class="invite">
        <div class="invite__name">{{ i.name }}</div>
        <div class="invite__row">
          <div class="invite__url">{{ i.url }}</div>
          <SsButton variant="light" size="sm" @click="copyInvite(i.url)">Copy</SsButton>
          <SsButton v-if="canShare" size="sm" @click="shareInvite(i)">Share</SsButton>
        </div>
      </div>
      <SsButton variant="outline" block @click="closeInvites">Done</SsButton>
    </SsSheet>
  </div>
</template>

<style scoped>
.layout { --ss-grid-min: 320px; gap: 14px; }
@media (max-width: 400px) { .layout { --ss-grid-min: 100%; } }
.col { gap: 14px; min-width: 0; }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.trio { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.night { gap: 14px; }
.rating { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.label { font-size: 13px; font-weight: 700; color: var(--ss-text-3); }
.price { display: flex; gap: 6px; }
.price > :first-child { flex: 1; min-width: 0; }
.currency {
  height: 46px;
  padding: 0 8px;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  color: var(--ss-text);
  font-size: 14px;
  font-weight: 700;
}
.readonly { display: flex; flex-direction: column; gap: 4px; color: var(--ss-text-2); }
.readonly__artist { font-weight: 900; font-size: 20px; color: var(--ss-text); }
.note {
  font-size: 13px;
  color: var(--ss-text-muted);
  padding: 10px 12px;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-0);
  border: 1px solid var(--ss-line);
}
.sheet-title { font-weight: 900; font-size: 22px; line-height: 1.1; }
.sheet-actions { display: flex; gap: 10px; }
.sheet-actions > * { flex: 1; }
.invite { display: flex; flex-direction: column; gap: 6px; }
.invite__name { font-weight: 700; }
.invite__row { display: flex; gap: 8px; align-items: center; }
.invite__url {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border-radius: var(--ss-radius-sm);
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line-strong);
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
