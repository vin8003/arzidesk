import { useEffect, useState } from "react";

export const OUTPUT_LANGS = ["hi", "en"] as const;
export type OutputLang = (typeof OUTPUT_LANGS)[number];

export const LANG_KEY = "arzidesk.lang";

export function readLang(): OutputLang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "hi" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return "en";
}

export function writeLang(lang: OutputLang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }
}

/** UI language for the desk. Drafts carry their own language per case. */
export function useDeskLang() {
  const [lang, setLang] = useState<OutputLang>("en");
  useEffect(() => {
    const next = readLang();
    setLang(next);
    document.documentElement.lang = next;
  }, []);
  function onLang(next: OutputLang) {
    setLang(next);
    writeLang(next);
    document.documentElement.lang = next;
  }
  return { lang, onLang };
}
