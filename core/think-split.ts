// Many local models write their reasoning inline between <think> and </think>. This splits a streamed reply into the
// answer and the reasoning, across chunk boundaries (a tag may arrive in two pieces). Pure and linear: it holds back
// only a possible tag prefix, never the whole text.
const OPEN = "<think>", CLOSE = "</think>";

export function createThinkSplitter() {
  let inside = false, hold = "";
  return {
    push(chunk: string): { text: string; thinking: string } {
      let src = hold + chunk, text = "", thinking = "";
      hold = "";
      for (;;) {
        const tag = inside ? CLOSE : OPEN;
        const at = src.indexOf(tag);
        if (at >= 0) {
          (inside ? (thinking += src.slice(0, at)) : (text += src.slice(0, at)));
          src = src.slice(at + tag.length); inside = !inside; continue;
        }
        // keep the longest tail that could still become the tag
        let keep = 0;
        for (let n = Math.min(tag.length - 1, src.length); n > 0; n--) if (tag.startsWith(src.slice(src.length - n))) { keep = n; break; }
        hold = src.slice(src.length - keep);
        const body = src.slice(0, src.length - keep);
        if (inside) thinking += body; else text += body;
        return { text, thinking };
      }
    },
    /** The stream ended: whatever was held back was not a tag after all. */
    flush(): { text: string; thinking: string } {
      const rest = hold; hold = "";
      return inside ? { text: "", thinking: rest } : { text: rest, thinking: "" };
    },
  };
}
