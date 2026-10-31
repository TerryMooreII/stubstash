<script setup lang="ts">
// Admin users: search, status tags, suspend/unsuspend and delete.
import { computed, ref } from "vue";
import { SsAvatar, SsButton, SsField, SsInput, SsSheet, SsTag } from "@/design-system";
import AdminPagedList from "@/components/admin/AdminPagedList.vue";
import { usePagedSearch } from "@/composables/usePagedSearch";
import { admin, type AdminUser } from "@/lib/admin";
import { errorMessage } from "@/lib/supabase";
import { mediumDate, num, plural, timeAgo } from "@/lib/format";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";

const auth = useAuth();
const ui = useUi();

const { q, rows: users, total, loading, loadingMore, error, load } = usePagedSearch(admin.users);
const busy = ref<Record<string, boolean>>({});

/** Reload just one user's row after an action. */
async function refreshRow(u: AdminUser) {
  const key = u.email;
  const rows = await admin.users(key, 10, 0).catch(() => []);
  const fresh = rows.find((r) => r.id === u.id);
  const i = users.value.findIndex((r) => r.id === u.id);
  if (i >= 0) {
    if (fresh) users.value[i] = { ...fresh, total: users.value[i]!.total };
    else users.value.splice(i, 1);
  }
}

const ago = (iso: string | null) => timeAgo(iso, { suffix: " ago", never: "never", dateAfterDays: 60, fullDate: true });

const canAct = (u: AdminUser) => !u.is_admin && u.id !== auth.userId;

async function toggleSuspend(u: AdminUser) {
  busy.value[u.id] = true;
  try {
    if (u.banned_until) {
      await admin.unsuspend(u.id);
      ui.flash(`${u.handle ?? u.email} can sign in again`);
    } else {
      await admin.suspend(u.id);
      ui.flash(`${u.handle ?? u.email} is suspended`);
    }
    await refreshRow(u);
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    busy.value[u.id] = false;
  }
}

// ---- delete confirm
const toDelete = ref<AdminUser | null>(null);
const confirmText = ref("");
const deleting = ref(false);
const sheetOpen = computed({
  get: () => !!toDelete.value,
  set: (v) => { if (!v && !deleting.value) toDelete.value = null; },
});
const confirmOk = computed(() => {
  const u = toDelete.value;
  const t = confirmText.value.trim().toLowerCase();
  return !!u && !!t && (t === u.email.toLowerCase() || (!!u.handle && t === u.handle.toLowerCase()));
});
function askDelete(u: AdminUser) {
  confirmText.value = "";
  toDelete.value = u;
}
async function doDelete() {
  const u = toDelete.value;
  if (!u || !confirmOk.value) return;
  deleting.value = true;
  try {
    await admin.deleteUser(u.id);
    users.value = users.value.filter((r) => r.id !== u.id);
    total.value = Math.max(0, total.value - 1);
    ui.flash(`Deleted ${u.handle ?? u.email}`);
    toDelete.value = null;
  } catch (e) {
    ui.error(errorMessage(e));
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <div class="users">
    <SsInput v-model="q" icon="search" placeholder="Search by email, handle or name" clearable inputmode="search" aria-label="Search users" />

    <div v-if="!loading && !error" class="count ss-muted">{{ plural(total, "user") }}</div>

    <AdminPagedList
      :rows="users"
      :total="total"
      :loading="loading"
      :loading-more="loadingMore"
      :error="error"
      error-title="Couldn't load users"
      :empty-title="q.trim() ? `No users match “${q.trim()}”` : 'No users yet'"
      skeleton-height="88px"
      @retry="load()"
      @more="load(false)"
    >
      <template #default="{ item: u }">
        <li class="user ss-tile" :class="{ 'is-suspended': !!u.banned_until }">
          <SsAvatar :name="u.display_name || u.handle || u.email" :size="44" />
          <div class="user__body">
            <div class="user__top">
              <span class="user__name">{{ u.display_name || u.handle || "No profile" }}</span>
              <RouterLink v-if="u.handle && u.is_public" :to="`/u/${u.handle}`" class="user__handle">@{{ u.handle }}</RouterLink>
              <span v-else-if="u.handle" class="user__handle ss-muted">@{{ u.handle }}</span>
            </div>
            <div class="user__email">{{ u.email }}</div>
            <div class="user__meta">
              Joined {{ mediumDate(u.created_at.slice(0, 10)) }} · last sign-in {{ ago(u.last_sign_in_at) }} ·
              {{ plural(u.show_count, "show") }}<template v-if="u.home_city"> · {{ u.home_city }}</template>
            </div>
            <div class="user__tags">
              <SsTag v-if="u.is_admin" tone="accent">Admin</SsTag>
              <SsTag v-if="u.banned_until" tone="butter">Suspended</SsTag>
              <SsTag v-if="!u.email_confirmed" tone="outline">Unconfirmed</SsTag>
              <SsTag v-if="u.is_public" tone="teal">Public</SsTag>
              <SsTag v-if="!u.onboarded" tone="dark">Not onboarded</SsTag>
            </div>
          </div>
          <div v-if="canAct(u)" class="user__actions">
            <SsButton size="sm" variant="outline" :loading="busy[u.id]" @click="toggleSuspend(u)">
              {{ u.banned_until ? "Unsuspend" : "Suspend" }}
            </SsButton>
            <SsButton size="sm" variant="danger" :disabled="busy[u.id]" @click="askDelete(u)">Delete</SsButton>
          </div>
        </li>
      </template>
      <template #more>Load more ({{ num(total - users.length) }} left)</template>
    </AdminPagedList>

    <SsSheet v-model="sheetOpen" label="Delete user" :dismissable="!deleting">
      <form v-if="toDelete" class="confirm" @submit.prevent="doDelete">
        <h2 class="confirm__title">Delete {{ toDelete.handle ? `@${toDelete.handle}` : toDelete.email }}?</h2>
        <p class="confirm__body">
          This permanently deletes their account, all {{ plural(toDelete.show_count, "logged show") }}, their photos and ticket
          stubs. It can't be undone.
        </p>
        <SsField :label="`Type ${toDelete.handle ? 'their handle or email' : 'their email'} to confirm`">
          <SsInput v-model="confirmText" :placeholder="toDelete.handle ?? toDelete.email" autocomplete="off" />
        </SsField>
        <div class="confirm__actions">
          <SsButton type="submit" variant="danger" :disabled="!confirmOk" :loading="deleting">Delete forever</SsButton>
          <SsButton variant="ghost" :disabled="deleting" @click="toDelete = null">Cancel</SsButton>
        </div>
      </form>
    </SsSheet>
  </div>
</template>

<style scoped>
.users { display: flex; flex-direction: column; gap: 12px; }
.count { font-size: 14px; }
.user {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 14px 16px;
  flex-wrap: wrap;
}
.user.is-suspended { border-color: var(--ss-danger); background: var(--ss-danger-soft); }
.user__body { flex: 1 1 220px; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.user__top { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.user__name { font-weight: 900; font-size: 17px; overflow-wrap: anywhere; }
.user__handle { font-size: 14px; font-weight: 700; }
.user__email { font-size: 14px; color: var(--ss-text-3); overflow-wrap: anywhere; }
.user__meta { font-size: 13px; color: var(--ss-text-faint); }
.user__tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.user__tags:empty { display: none; }
.user__actions { display: flex; gap: 8px; margin-left: auto; align-self: center; flex-wrap: wrap; }

.confirm { display: flex; flex-direction: column; gap: 14px; }
.confirm__title { font-weight: 900; font-size: 22px; line-height: 1.1; overflow-wrap: anywhere; }
.confirm__body { color: var(--ss-text-3); font-size: 15px; margin: 0; }
.confirm__actions { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
