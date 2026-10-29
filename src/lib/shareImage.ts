// Turns an element into a PNG and hands it to the native share sheet, or
// downloads it where sharing files isn't supported.
import { toPng } from "html-to-image";

export function slugFile(prefix: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "image";
  return `${prefix}-${slug}.png`;
}

/** Returns "shared", "saved" or "cancelled". Throws if the image can't be made. */
export async function shareElementAsPng(el: HTMLElement, fileName: string): Promise<"shared" | "saved" | "cancelled"> {
  const dataUrl = await toPng(el, { pixelRatio: 3, cacheBust: true });
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], fileName, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Stubstash" });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
      throw e;
    }
  }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = file.name;
  a.click();
  return "saved";
}
