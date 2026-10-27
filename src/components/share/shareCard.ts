// Content for a Stories-sized share card (see ShareCardSheet.vue).
export interface ShareCard {
  kicker: string;
  pre: string;
  big: string;
  sub: string;
  stats: { v: string; k: string }[];
  footer?: string;
}
