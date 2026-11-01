<script setup lang="ts">
// "Who's coming with?": pick friends to invite to an upcoming show, add a note.
// Friends who already have a plan for it are left out.
import { computed, ref, watch } from "vue";
import { SsAvatar, SsButton, SsEmpty, SsIcon, SsInput, SsSheet, SsSkeleton, SsTextarea } from "@/design-system";
import { social, upcoming } from "@/lib/api";
import { dateParts, firstName, plural } from "@/lib/format";
import { errorMessage } from "@/lib/supabase";
import type { Friend, PlanItem } from "@/lib/types";
import { useUi } from "@/stores/ui";

const open = defineModel<boolean>({ default: false });
const props = defineProps<{ item: PlanItem }>();
const emit = defineEmits<{ done: [] }>();
const ui = useUi();

const friends = ref<Friend[]>([]);
const loading = ref(false);
const picked = ref<Set<string>>(new Set());
const note = ref("");
const q = ref("");
const sending = ref(false);

const short = computed(() => {
  const d = dateParts(props.item.event.local_date);
  return `${props.item.event.artist} · ${d.mon} ${Number(d.day)}`.toUpperCase();
});

watch(open, async (o) => {
  if (!o) return;
  picked.value = new Set();
  q.value = "";
  const d = dateParts(props.item.event.local_date);
  note.value = `${props.item.event.artist} ${d.mon.charAt(0)}${d.mon.slice(1).toLowerCase()} ${Number(d.day)}. You in?`;
  loading.value = true;
  try {
    friends.value = await social.friends();
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    loading.value = false;
  }
});

const already = computed(() => new Set(props.item.crew.map((c) => c.user_id)));
const available = computed(() => {
  const term = q.value.trim().toLowerCase().replace(/^@/, "");
  return friends.value
    .filter((f) => !already.value.has(f.id))
    .filter((f) => !term || f.handle.toLowerCase().includes(term) || (f.display_name ?? "").toLowerCase().includes(term));
});

function toggle(id: string) {
  const next = new Set(picked.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  picked.value = next;
}

const sendLabel = computed(() => (picked.value.size ? `Invite ${plural(picked.value.size, "friend")}` : "Pick friends to invite"));

async function send() {
  if (!picked.value.size || !props.item.event.id) return;
  sending.value = true;
  try {
    const ids = [...picked.value];
    const n = await upcoming.invite(props.item.event.id, ids, note.value);
    const names = friends.value.filter((f) => ids.includes(f.id)).map((f) => firstName(f.display_name, f.handle));
    ui.flash(n ? `Invited ${names.length <= 2 ? names.join(" & ") : plural(n, "friend")}` : "They're already in", n ? "accent" : "info");
    open.value = false;
    emit("done");
  } catch (e) {
    ui.error(errorMessage(e, "Couldn't send those invites."));
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <SsSheet v-model="open" label="Invite friends" :width="460">
    <div class="ss-kicker">INVITE TO {{ short }}</div>
    <div class="ss-h2">Who’s coming with?</div>

    <SsInput v-if="friends.length > 8" v-model="q" icon="search" placeholder="Search your friends" clearable autocomplete="off" />

    <div v-if="loading" class="ss-stack"><SsSkeleton v-for="i in 3" :key="i" height="52px" /></div>
    <SsEmpty
      v-else-if="!friends.length"
      title="No friends yet"
      body="Add friends on Stubstash to invite them to shows."
    />
    <SsEmpty v-else-if="!available.length && !q" title="Everyone’s already in" body="All your friends have a plan for this show." />
    <ul v-else class="people ss-list">
      <li v-for="f in available" :key="f.id">
        <button type="button" class="person" :aria-pressed="picked.has(f.id)" @click="toggle(f.id)">
          <SsAvatar :name="f.display_name || f.handle" :path="f.avatar_path" :size="40" />
          <span class="person__text">
            <span class="person__name ss-truncate">{{ f.display_name || "@" + f.handle }}</span>
            <span class="person__sub">@{{ f.handle }}<template v-if="f.shared_count"> · {{ plural(f.shared_count, "show") }} together</template></span>
          </span>
          <span class="check" :class="{ 'is-on': picked.has(f.id) }"><SsIcon v-if="picked.has(f.id)" name="check" :size="16" :stroke="3" /></span>
        </button>
      </li>
    </ul>

    <SsTextarea v-if="friends.length" v-model="note" :rows="2" :maxlength="280" placeholder="Add a note" />
    <p class="hint">Not on Stubstash yet? Send them the show link from the event page.</p>

    <div class="actions">
      <SsButton variant="outline" @click="open = false">Cancel</SsButton>
      <SsButton class="actions__send" :disabled="!picked.size" :loading="sending" @click="send">{{ sendLabel }}</SsButton>
    </div>
  </SsSheet>
</template>

<style scoped>
.people { display: flex; flex-direction: column; max-height: 340px; overflow-y: auto; }
.person {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border: 0;
  border-top: 1px solid var(--ss-line-soft);
  background: transparent;
  color: var(--ss-text);
  text-align: left;
  cursor: pointer;
}
.person__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.person__name { font-weight: 700; }
.person__sub { font-size: 12px; color: var(--ss-text-muted); }
.check {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 2px solid var(--ss-line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ss-on-accent);
  flex-shrink: 0;
}
.check.is-on { background: var(--ss-accent); border-color: var(--ss-accent); }
.hint { margin: 0; font-size: 13px; color: var(--ss-text-muted); }
.actions { display: flex; gap: 10px; }
.actions > * { flex: 1; }
.actions__send { flex: 2; }
</style>
