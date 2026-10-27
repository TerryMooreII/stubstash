<script setup lang="ts">
// Public landing page, from "Stubstash Marketing.dc.html".
import { computed, onMounted } from "vue";
import { SsLogo } from "@/design-system";
import VenueMap from "@/components/map/VenueMap.vue";
import { demoHome, demoVenues } from "./marketing/demoData";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";

const auth = useAuth();
const ui = useUi();
onMounted(() => auth.init());

const appLink = computed(() => (auth.signedIn ? "/app" : "/login"));
const startLink = computed(() => (auth.signedIn ? "/app" : "/signup"));

const setlist = [
  { song: "Tweezer" },
  { song: "Ghost" },
  { song: "Harpua", tag: "FIRST TIME" },
  { song: "Slave to the Traffic Light" },
];
const chips = ["Friends & who-was-there", "Head-to-head stats", "Badges", "Public profile"];
</script>

<template>
  <div class="mk">
    <!-- header -->
    <header class="mk__wrap mk__header">
      <RouterLink to="/" class="mk__logo" aria-label="Stubstash home"><SsLogo :size="26" /></RouterLink>
      <nav class="mk__nav" aria-label="Site">
        <a href="#how" class="mk__navlink">How it works</a>
        <a href="#map" class="mk__navlink">The map</a>
        <a href="#install" class="mk__navlink">Get the app</a>
        <RouterLink :to="appLink" class="mk__open">{{ auth.signedIn ? "Open app" : "Sign in" }}</RouterLink>
      </nav>
    </header>

    <!-- hero -->
    <section class="mk__wrap mk__hero">
      <div class="mk__glow" aria-hidden="true" />
      <div class="mk__hero-text">
        <div class="mk__kicker">FOR PEOPLE WHO WERE THERE</div>
        <h1 class="mk__h1">Every show. Every song. Every mile.</h1>
        <p class="mk__lede">Stubstash pulls your setlists from setlist.fm and turns your concert life into stats, maps and serious bragging rights.</p>
        <div class="mk__ctas">
          <RouterLink :to="startLink" class="mk__btn mk__btn--primary">{{ auth.signedIn ? "Open my log" : "Start your log, free" }}</RouterLink>
          <a href="#install" class="mk__btn mk__btn--outline">Install on your phone</a>
        </div>
        <div class="mk__fine">Import your setlist.fm history in about 10 seconds.</div>
      </div>
      <div class="mk__cards" aria-hidden="true">
        <div class="mk__card mk__card--ticket">
          <div class="mk__card-main">
            <div class="mk__mono">ADMIT ONE · LIFETIME</div>
            <div class="mk__ticket-n">87</div>
            <div class="mk__ticket-sub">shows and counting</div>
          </div>
          <div class="mk__ticket-stub"><span>NO. 0087</span></div>
        </div>
        <div class="mk__card mk__card--setlist">
          <div class="mk__mono mk__mono--accent">AUG 29 · DICK'S · SET 2</div>
          <div class="mk__setlist">
            <div v-for="s in setlist" :key="s.song" class="mk__song">
              <span>{{ s.song }}</span>
              <span v-if="s.tag" class="mk__songtag">{{ s.tag }}</span>
            </div>
          </div>
        </div>
        <div class="mk__card mk__card--miles">
          <div class="mk__mono">MILES TRAVELED</div>
          <div class="mk__miles">18,420</div>
        </div>
      </div>
    </section>

    <!-- how it works -->
    <section id="how" class="mk__light">
      <div class="mk__wrap mk__how">
        <h2 class="mk__h2">From "I was there" to stats in three taps.</h2>
        <div class="mk__steps">
          <div class="mk__step">
            <div class="mk__step-n">1</div>
            <div class="mk__step-t">Search setlist.fm</div>
            <div class="mk__step-b">Type an artist, venue or city. Pick the night. The full setlist comes with it.</div>
          </div>
          <div class="mk__step">
            <div class="mk__step-n">2</div>
            <div class="mk__step-t">Make it yours</div>
            <div class="mk__step-b">Rate it, tag who you went with, snap the stub, drop photos. Not listed? Add it by hand.</div>
          </div>
          <div class="mk__step mk__step--accent">
            <div class="mk__step-n">3</div>
            <div class="mk__step-t">Watch it stack up</div>
            <div class="mk__step-b">Songs heard, first-time hears, streaks, miles and badges update the moment you log.</div>
          </div>
        </div>
      </div>
    </section>

    <!-- setlists -->
    <section class="mk__wrap mk__split">
      <div class="mk__split-text">
        <div class="mk__kicker mk__kicker--teal">SETLISTS THAT REMEMBER</div>
        <h2 class="mk__h2">Know the night you first heard it.</h2>
        <p class="mk__body">Every song gets tagged against your own history: the first time you heard it live, the ones you've only caught once, and the songs you've heard the most.</p>
      </div>
      <div class="mk__tiles">
        <div class="mk__tile mk__tile--butter">
          <div class="mk__mono">FIRST TIME</div>
          <div class="mk__tile-song">Harpua</div>
          <div class="mk__tile-sub">Phish · Dick's, Aug 29</div>
        </div>
        <div class="mk__tile mk__tile--lavender">
          <div class="mk__mono">ONLY TIME</div>
          <div class="mk__tile-song">Long Journey Home</div>
          <div class="mk__tile-sub">Billy Strings · Red Rocks</div>
        </div>
        <div class="mk__tile mk__tile--dark">
          <div class="mk__mono mk__mono--accent">HEARD MOST · PHISH</div>
          <div class="mk__chips">
            <span class="mk__dash">Tweezer ×9</span>
            <span class="mk__dash">Divided Sky ×6</span>
            <span class="mk__dash">Chalk Dust ×5</span>
            <span class="mk__dash">Harry Hood ×4</span>
          </div>
        </div>
      </div>
    </section>

    <!-- map -->
    <section id="map" class="mk__wrap mk__mapsec">
      <div class="mk__maphead">
        <h2 class="mk__h2 mk__h2--narrow">Your tour map. You're the headliner.</h2>
        <p class="mk__body mk__body--narrow">Every venue pinned and sized by how often you've been. Tap one for every show you saw there.</p>
      </div>
      <div class="mk__mapbox">
        <VenueMap :venues="demoVenues" :home="demoHome" mode="pins" panel :scroll-zoom="false" height="520px" />
      </div>
    </section>

    <!-- share cards -->
    <section class="mk__band">
      <div class="mk__wrap mk__share">
        <div class="mk__phones" aria-hidden="true">
          <div class="mk__story mk__story--yellow">
            <div class="mk__mono mk__mono--xs">STUBSTASH · 2026 WRAPPED</div>
            <div class="mk__story-mid">
              <div class="mk__story-pre">My year in live music</div>
              <div class="mk__story-big">12 SHOWS</div>
              <div class="mk__story-sub">Phish ×3, one Harpua, and a road trip to Red Rocks.</div>
            </div>
            <div class="mk__story-foot"><span>214<br /><small>songs</small></span><span>7<br /><small>venues</small></span><span>3.2k<br /><small>miles</small></span></div>
          </div>
          <div class="mk__story mk__story--teal">
            <div class="mk__mono mk__mono--xs">STUBSTASH · JUN 20 2026</div>
            <div class="mk__story-mid">
              <div class="mk__story-pre">I was there:</div>
              <div class="mk__story-big mk__story-big--sm">THE NATIONAL</div>
              <div class="mk__story-sub">Forest Hills Stadium · Queens, NY</div>
            </div>
            <div class="mk__story-foot"><span>21<br /><small>songs</small></span><span>3<br /><small>firsts</small></span><span>7th<br /><small>time</small></span></div>
          </div>
        </div>
        <div class="mk__split-text">
          <div class="mk__kicker">SHARE CARDS · YEAR IN REVIEW</div>
          <h2 class="mk__h2">Post the proof.</h2>
          <p class="mk__body">One tap makes a Stories-ready card for any show, plus a year-in-review every December.</p>
          <div class="mk__pills">
            <span v-for="c in chips" :key="c" class="mk__pill">{{ c }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- install -->
    <section id="install" class="mk__wrap mk__install">
      <h2 class="mk__h2 mk__h2--narrow">No app store. Works in the parking lot.</h2>
      <div class="mk__how-grid">
        <div class="mk__plat">
          <div class="mk__mono mk__mono--accent">IPHONE</div>
          <div class="mk__plat-t">Share → Add to Home Screen</div>
          <div class="mk__plat-b">Open Stubstash in Safari and it lives next to your other apps.</div>
        </div>
        <div class="mk__plat">
          <div class="mk__mono mk__mono--accent">ANDROID</div>
          <div class="mk__plat-t">Tap "Install app"</div>
          <div class="mk__plat-b">Chrome offers it automatically. One tap and you're in.</div>
        </div>
        <div class="mk__plat">
          <div class="mk__mono mk__mono--accent">DESKTOP</div>
          <div class="mk__plat-t">Install from the address bar</div>
          <div class="mk__plat-b">Big-screen dashboard and map, synced with your phone.</div>
        </div>
      </div>
      <button v-if="ui.canPromptInstall" class="mk__btn mk__btn--outline mk__install-btn" @click="ui.install()">Install Stubstash now</button>
    </section>

    <!-- final cta -->
    <section class="mk__final">
      <div class="mk__wrap mk__final-in">
        <h2 class="mk__final-h">How many shows have you seen?</h2>
        <RouterLink :to="startLink" class="mk__btn mk__btn--dark">Find out, it's free</RouterLink>
      </div>
    </section>

    <footer class="mk__wrap mk__footer">
      <SsLogo :size="20" />
      <div class="mk__credits">
        Setlist data from <a href="https://www.setlist.fm" target="_blank" rel="noopener">setlist.fm</a>.
        Artist and venue images from Wikimedia Commons, fanart.tv and TheAudioDB.
        Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, tiles © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>.
        Stubstash isn't affiliated with setlist.fm.
      </div>
    </footer>
  </div>
</template>

<style scoped>
.mk {
  background: var(--ss-bg);
  color: var(--ss-text);
  overflow-x: hidden;
}
.mk__wrap {
  max-width: 1240px;
  margin: 0 auto;
  padding-left: 24px;
  padding-right: 24px;
}
@media (max-width: 480px) {
  .mk__wrap { padding-left: 16px; padding-right: 16px; }
}
.mk__mono {
  font-family: var(--ss-font-mono);
  font-size: 11px;
  letter-spacing: var(--ss-tracking-mono);
}
.mk__mono--accent { color: var(--ss-accent); }
.mk__mono--xs { font-size: 9px; font-weight: 700; }
.mk__kicker {
  font-family: var(--ss-font-mono);
  font-size: 13px;
  letter-spacing: 0.16em;
  color: var(--ss-accent);
}
.mk__kicker--teal { color: var(--ss-teal-light); }
.mk__h2 {
  font-weight: 900;
  font-size: clamp(40px, 5.5vw, 72px);
  line-height: 0.9;
  letter-spacing: -0.04em;
  text-wrap: balance;
}
.mk__h2--narrow { max-width: 760px; }
.mk__body { font-size: 19px; line-height: 1.5; color: var(--ss-text-3); max-width: 520px; }
.mk__body--narrow { max-width: 420px; }

/* buttons */
.mk__btn {
  display: inline-flex;
  align-items: center;
  height: 58px;
  padding: 0 28px;
  border-radius: var(--ss-radius-pill);
  font-weight: 900;
  font-size: 19px;
  text-decoration: none;
  white-space: nowrap;
  transition: transform var(--ss-dur-fast) var(--ss-ease), background var(--ss-dur-fast);
}
.mk__btn:hover { text-decoration: none; transform: translateY(-1px); }
.mk__btn--primary { background: var(--ss-accent); color: var(--ss-on-accent); }
.mk__btn--primary:hover { background: var(--ss-accent-hover); color: var(--ss-on-accent); }
.mk__btn--outline { border: 1px solid var(--ss-line-strong); color: var(--ss-text); font-weight: 700; font-size: 18px; background: transparent; }
.mk__btn--outline:hover { border-color: var(--ss-text-faint); color: var(--ss-text); }
.mk__btn--dark { background: var(--ss-bg); color: var(--ss-accent); height: 62px; padding: 0 32px; font-size: 20px; }
.mk__btn--dark:hover { color: var(--ss-accent-hover); }
@media (max-width: 420px) {
  .mk__btn { height: 52px; padding: 0 22px; font-size: 17px; }
}

/* header */
.mk__header {
  padding-top: calc(20px + var(--ss-safe-top));
  padding-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.mk__logo { text-decoration: none; }
.mk__nav { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; font-weight: 600; font-size: 16px; }
.mk__navlink { color: var(--ss-text-2); }
.mk__navlink:hover { color: var(--ss-text); }
.mk__open {
  display: inline-flex;
  align-items: center;
  height: 40px;
  padding: 0 18px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-text);
  color: var(--ss-on-accent);
  font-weight: 700;
}
.mk__open:hover { background: #fff; color: var(--ss-on-accent); text-decoration: none; }
@media (max-width: 640px) {
  .mk__navlink { display: none; }
}

/* hero */
.mk__hero {
  position: relative;
  padding-top: 56px;
  padding-bottom: 96px;
  display: flex;
  flex-wrap: wrap;
  gap: 48px;
  align-items: center;
}
.mk__glow {
  position: absolute;
  width: 900px;
  height: 900px;
  right: -300px;
  top: -300px;
  background: radial-gradient(circle, rgba(244, 184, 17, 0.22), transparent 60%);
  pointer-events: none;
}
.mk__hero-text {
  position: relative;
  flex: 1 1 520px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.mk__h1 {
  font-weight: 900;
  font-size: clamp(52px, 9vw, 128px);
  line-height: 0.84;
  letter-spacing: -0.05em;
  text-wrap: balance;
}
.mk__lede { font-size: clamp(18px, 2vw, 22px); line-height: 1.45; color: var(--ss-text-3); max-width: 560px; text-wrap: pretty; }
.mk__ctas { display: flex; gap: 12px; flex-wrap: wrap; }
.mk__fine { font-size: 14px; color: var(--ss-text-faint); }

.mk__cards {
  position: relative;
  flex: 1 1 380px;
  min-width: 0;
  max-width: 100%;
  height: 480px;
}
.mk__card { position: absolute; border-radius: 16px; box-shadow: var(--ss-shadow-float); }
.mk__card--ticket {
  left: 4%;
  top: 10px;
  width: 78%;
  transform: rotate(-7deg);
  display: flex;
  background: var(--ss-accent);
  color: var(--ss-on-accent);
}
.mk__card-main { flex: 1; padding: 22px; min-width: 0; }
.mk__ticket-n { font-weight: 900; font-size: clamp(72px, 18vw, 96px); line-height: 0.85; letter-spacing: -0.05em; }
.mk__ticket-sub { font-weight: 900; font-size: 22px; }
.mk__ticket-stub {
  width: 72px;
  border-left: 3px dashed var(--ss-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.mk__ticket-stub span { transform: rotate(90deg); white-space: nowrap; font-weight: 900; }
.mk__card--setlist {
  right: 0;
  top: 170px;
  width: 70%;
  transform: rotate(5deg);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  padding: 20px;
}
.mk__setlist { display: flex; flex-direction: column; margin-top: 8px; }
.mk__song {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-top: 1px solid var(--ss-line);
  font-weight: 700;
}
.mk__songtag {
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--ss-teal-light);
  color: var(--ss-on-accent);
  font-family: var(--ss-font-mono);
  font-size: 10px;
  white-space: nowrap;
}
.mk__card--miles {
  left: 10%;
  bottom: 0;
  width: 56%;
  transform: rotate(-3deg);
  background: var(--ss-teal);
  color: var(--ss-on-accent);
  padding: 20px;
}
.mk__miles { font-weight: 900; font-size: clamp(40px, 12vw, 56px); line-height: 0.9; letter-spacing: -0.04em; }
@media (max-width: 480px) {
  .mk__cards { height: 440px; }
  .mk__card--ticket { width: 86%; left: 2%; }
  .mk__card--setlist { width: 80%; }
  .mk__card--miles { width: 66%; left: 4%; }
}

/* how it works (light) */
.mk__light { background: var(--ss-text); color: var(--ss-on-accent); }
.mk__how { padding-top: 88px; padding-bottom: 88px; display: flex; flex-direction: column; gap: 40px; }
.mk__how .mk__h2 { max-width: 900px; }
.mk__steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 16px; }
.mk__step {
  padding: 28px;
  border-radius: 20px;
  background: #fff;
  border: 2px solid var(--ss-bg);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mk__step--accent { background: var(--ss-accent); }
.mk__step-n { font-weight: 900; font-size: 56px; line-height: 0.8; }
.mk__step-t { font-weight: 900; font-size: 26px; line-height: 1.05; }
.mk__step-b { font-size: 17px; line-height: 1.45; color: var(--ss-slate); }
.mk__step--accent .mk__step-b { color: var(--ss-on-accent); }

/* split sections */
.mk__split {
  padding-top: 96px;
  padding-bottom: 96px;
  display: flex;
  flex-wrap: wrap;
  gap: 48px;
  align-items: center;
}
.mk__split-text { flex: 1 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 18px; }
.mk__tiles { flex: 1 1 400px; min-width: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mk__tile { padding: 22px; border-radius: 20px; color: var(--ss-on-accent); min-width: 0; }
.mk__tile--butter { background: var(--ss-butter); }
.mk__tile--lavender { background: var(--ss-lavender); }
.mk__tile--dark { background: var(--ss-surface-1); border: 1px solid var(--ss-line); grid-column: span 2; color: var(--ss-text); }
.mk__tile-song { font-weight: 900; font-size: clamp(24px, 6vw, 34px); line-height: 0.95; margin-top: 8px; overflow-wrap: anywhere; }
.mk__tile-sub { font-weight: 600; }
.mk__chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.mk__dash {
  padding: 8px 14px;
  border-radius: var(--ss-radius-pill);
  border: 1px dashed var(--ss-accent);
  color: var(--ss-accent);
  font-weight: 700;
}
@media (max-width: 420px) {
  .mk__tiles { grid-template-columns: 1fr; }
  .mk__tile--dark { grid-column: auto; }
}

/* map */
.mk__mapsec { padding-bottom: 96px; display: flex; flex-direction: column; gap: 28px; }
.mk__maphead { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; }
.mk__mapbox {
  height: 520px;
  border: 1px solid var(--ss-line);
  border-radius: 24px;
  overflow: hidden;
  position: relative;
}
@media (max-width: 640px) {
  .mk__mapbox { height: 420px; }
}

/* share band */
.mk__band { background: var(--ss-surface-1); border-top: 1px solid var(--ss-line); border-bottom: 1px solid var(--ss-line); }
.mk__share { padding-top: 96px; padding-bottom: 96px; display: flex; flex-wrap: wrap; gap: 56px; align-items: center; }
.mk__phones { flex: 0 0 auto; display: flex; gap: 16px; margin: 0 auto; max-width: 100%; }
.mk__story {
  width: 220px;
  height: 390px;
  border-radius: 18px;
  color: var(--ss-on-accent);
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.35);
}
.mk__story--yellow { background: var(--ss-accent); transform: rotate(-4deg); }
.mk__story--teal { background: var(--ss-teal); transform: rotate(4deg) translateY(30px); }
.mk__story-mid { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
.mk__story-pre { font-weight: 900; font-size: 14px; }
.mk__story-big { font-weight: 900; font-size: 52px; line-height: 0.82; letter-spacing: -0.05em; }
.mk__story-big--sm { font-size: 44px; line-height: 0.84; letter-spacing: -0.045em; }
.mk__story-sub { font-weight: 700; font-size: 13px; }
.mk__story-foot { display: flex; justify-content: space-between; border-top: 3px solid var(--ss-bg); padding-top: 10px; font-weight: 900; }
@media (max-width: 520px) {
  .mk__story { width: 150px; height: 280px; padding: 14px; }
  .mk__story-big { font-size: 36px; }
  .mk__story-big--sm { font-size: 30px; }
  .mk__story-foot { font-size: 13px; }
}
.mk__pills { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
.mk__pill {
  padding: 10px 16px;
  border-radius: var(--ss-radius-pill);
  background: var(--ss-surface-2);
  border: 1px solid var(--ss-line-strong);
  font-weight: 700;
}

/* install */
.mk__install { padding-top: 96px; padding-bottom: 96px; display: flex; flex-direction: column; gap: 32px; }
.mk__how-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 16px; }
.mk__plat {
  padding: 28px;
  border-radius: 20px;
  background: var(--ss-surface-1);
  border: 1px solid var(--ss-line);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mk__plat .mk__mono { font-size: 12px; }
.mk__plat-t { font-weight: 900; font-size: 24px; }
.mk__plat-b { font-size: 16px; color: var(--ss-text-muted); line-height: 1.45; }
.mk__install-btn { align-self: flex-start; }

/* final */
.mk__final { background: var(--ss-accent); color: var(--ss-on-accent); }
.mk__final-in { padding-top: 96px; padding-bottom: 96px; display: flex; flex-direction: column; align-items: flex-start; gap: 28px; }
.mk__final-h {
  font-weight: 900;
  font-size: clamp(52px, 10vw, 150px);
  line-height: 0.82;
  letter-spacing: -0.05em;
  text-wrap: balance;
}

/* footer */
.mk__footer {
  padding-top: 32px;
  padding-bottom: calc(48px + var(--ss-safe-bottom));
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  color: var(--ss-text-faint);
  font-size: 14px;
}
.mk__credits { max-width: 620px; line-height: 1.5; }
</style>
