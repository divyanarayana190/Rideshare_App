// i18n Configuration - Multi-language support
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";

import en from "@/locales/en.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import hi from "@/locales/hi.json";
import ar from "@/locales/ar.json";

const LANGUAGE_KEY = "app_language";

export const LANGUAGES = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "es", name: "Spanish", nativeName: "Espanol", flag: "🇪🇸" },
  { code: "fr", name: "French", nativeName: "Francais", flag: "🇫🇷" },
  { code: "hi", name: "Hindi", nativeName: "Hindi", flag: "🇮🇳" },
  { code: "ar", name: "Arabic", nativeName: "Arabic", flag: "🇸🇦", rtl: true },
] as const;

export type LanguageCode = typeof LANGUAGES[number]["code"];

// Detect device language
function getDeviceLanguage(): string {
  try {
    const locale = Localization.getLocales()[0]?.languageCode || "en";
    const supported = LANGUAGES.map(l => l.code);
    return supported.includes(locale as LanguageCode) ? locale : "en";
  } catch {
    return "en";
  }
}

// Initialize i18n
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    hi: { translation: hi },
    ar: { translation: ar },
  },
  lng: getDeviceLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

// Load saved language preference
(async () => {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (saved && LANGUAGES.some(l => l.code === saved)) {
      await i18n.changeLanguage(saved);
    }
  } catch {}
})();

// Change language and persist
export async function setLanguage(code: LanguageCode): Promise<void> {
  await i18n.changeLanguage(code);
  await AsyncStorage.setItem(LANGUAGE_KEY, code).catch(() => {});
}

export default i18n;
